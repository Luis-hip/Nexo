import {
  mensajeEquipoLleno,
  normalizarCodigoInvitacion,
  type CrearEquipo,
  type CrearInvitacion,
  type EquipoDetalle,
  type Invitacion,
  type Miembro,
  type VistaInvitacion,
} from '@nexo/shared';
import { sql } from 'kysely';
import { randomInt } from 'node:crypto';
import { codigoPg, type BaseDatos, type Ejecutor } from '../db/conexion';
import type { ContextoEquipo } from '../equipos/contexto';
import { ErrorNexo } from '../errores';
import { registrarEvento } from '../repositorios/eventos';

const DIA_MS = 86_400_000;

/** Bloqueo por equipo: el mismo que usa el disparador del tope de miembros (NX001). */
const bloquearEquipo = (tx: Ejecutor, equipoId: string) =>
  sql`SELECT pg_advisory_xact_lock(hashtextextended(${equipoId}::text, 0))`.execute(tx);

// ---------------------------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------------------------

/** PER-06: crea el equipo; quien lo crea es su líder. Todo en una transacción. */
export function crearEquipo(
  db: BaseDatos,
  usuario: { id: string; nombre: string },
  datos: CrearEquipo,
): Promise<{ id: string }> {
  return db.transaction().execute(async (tx) => {
    const { id } = await tx
      .insertInto('equipos')
      .values({
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        duracion_sprint_semanas: datos.duracion_sprint_semanas,
        max_miembros: datos.max_miembros,
        creado_por: usuario.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await tx
      .insertInto('membresias')
      .values({ equipo_id: id, usuario_id: usuario.id, rol: 'lider', color_idx: 0 })
      .execute();
    // Los dos canales fijos del equipo (el chat se construye en la Fase 4).
    await tx
      .insertInto('conversaciones')
      .values([
        { equipo_id: id, tipo: 'equipo', nombre: datos.nombre },
        { equipo_id: id, tipo: 'invitados', nombre: 'Invitados' },
      ])
      .execute();
    await registrarEvento(tx, {
      equipoId: id,
      actorId: usuario.id,
      tipo: 'equipo.creado',
      objetoTipo: 'equipo',
      objetoId: id,
      resumen: `${usuario.nombre} creó el equipo «${datos.nombre}»`,
    });
    return { id };
  });
}

export async function listarMiembros(db: Ejecutor, equipoId: string): Promise<Miembro[]> {
  const filas = await db
    .selectFrom('membresias as m')
    .innerJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .select([
      'm.id as membresia_id',
      'm.usuario_id',
      'u.nombre',
      'm.rol',
      'm.color_idx',
      'm.caduca_en',
    ])
    .where('m.equipo_id', '=', equipoId)
    .where('m.estado', '=', 'activa')
    .orderBy(sql`CASE m.rol WHEN 'lider' THEN 0 WHEN 'integrante' THEN 1 ELSE 2 END`)
    .orderBy('m.color_idx')
    .orderBy('u.nombre')
    .execute();
  return filas.map((f) => ({ ...f, caduca_en: f.caduca_en?.toISOString() ?? null }));
}

/** Datos del equipo según el perfil: un invitado no recibe miembros ni sprints. */
export async function obtenerEquipo(db: BaseDatos, ctx: ContextoEquipo): Promise<EquipoDetalle> {
  const [equipo, cupo, miembros, sprints, etiquetas] = await Promise.all([
    db
      .selectFrom('equipos')
      .select(['id', 'nombre', 'descripcion', 'estado', 'max_miembros'])
      .where('id', '=', ctx.equipoId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('v_equipo_cupo')
      .select(['miembros_activos', 'invitados_activos'])
      .where('equipo_id', '=', ctx.equipoId)
      .executeTakeFirst(),
    listarMiembros(db, ctx.equipoId),
    db
      .selectFrom('sprints')
      .select(['id', 'numero', 'estado', 'inicio', 'fin'])
      .where('equipo_id', '=', ctx.equipoId)
      .where('estado', '<>', 'cerrado')
      .orderBy('numero')
      .execute(),
    db
      .selectFrom('etiquetas')
      .select('nombre')
      .where('equipo_id', '=', ctx.equipoId)
      .orderBy('nombre')
      .execute(),
  ]);
  const lider = miembros.find((m) => m.rol === 'lider');
  const esInvitado = ctx.rol === 'invitado';
  const fecha = (d: Date) => d.toISOString().slice(0, 10);
  return {
    ...equipo,
    miembros_activos: Number(cupo?.miembros_activos ?? 0),
    invitados_activos: Number(cupo?.invitados_activos ?? 0),
    mi_rol: ctx.rol,
    mi_membresia_id: ctx.membresiaId,
    lider: lider ? { usuario_id: lider.usuario_id, nombre: lider.nombre } : null,
    miembros: esInvitado ? [] : miembros,
    sprints: esInvitado
      ? []
      : sprints.map((s) => ({ ...s, inicio: fecha(s.inicio), fin: fecha(s.fin) })),
    etiquetas: esInvitado ? [] : etiquetas.map((e) => e.nombre),
  };
}

// ---------------------------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------------------------

// Sin 0/O, 1/I/L: se dictan y se copian a mano.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const aleatorio = (n: number) =>
  Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
/** Código con el formato del prototipo, p. ej. `NX4-821Q`. */
const nuevoCodigo = () => `NX${aleatorio(1)}-${aleatorio(4)}`;

const aInvitacion = (f: {
  id: string;
  codigo: string;
  rol_destino: 'lider' | 'integrante' | 'invitado';
  estado: Invitacion['estado'];
  caduca_en: Date;
  duracion_invitado_dias: number | null;
  creada_en: Date;
  aceptada_por: string | null;
}): Invitacion => ({
  id: f.id,
  codigo: f.codigo,
  rol_destino: f.rol_destino === 'invitado' ? 'invitado' : 'integrante',
  // Una pendiente cuyo plazo ya pasó se muestra como caducada.
  estado: f.estado === 'pendiente' && f.caduca_en < new Date() ? 'caducada' : f.estado,
  caduca_en: f.caduca_en.toISOString(),
  duracion_invitado_dias: f.duracion_invitado_dias,
  creada_en: f.creada_en.toISOString(),
  aceptada_por: f.aceptada_por,
});

const COLUMNAS_INVITACION = [
  'id',
  'codigo',
  'rol_destino',
  'estado',
  'caduca_en',
  'duracion_invitado_dias',
  'creada_en',
  'aceptada_por',
] as const;

/** AD-02 / AD-03: el líder genera un código (y enlace) para integrante o invitado. */
export function crearInvitacion(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: { nombre: string },
  datos: CrearInvitacion,
): Promise<Invitacion> {
  return db.transaction().execute(async (tx) => {
    const fila = await tx
      .insertInto('invitaciones')
      .values({
        equipo_id: ctx.equipoId,
        codigo: nuevoCodigo(),
        rol_destino: datos.rol_destino,
        caduca_en: new Date(Date.now() + datos.dias_validez * DIA_MS),
        duracion_invitado_dias:
          datos.rol_destino === 'invitado' ? (datos.duracion_invitado_dias ?? null) : null,
        creada_por: ctx.usuarioId,
      })
      .returning(COLUMNAS_INVITACION)
      .executeTakeFirstOrThrow();
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: ctx.usuarioId,
      tipo: 'invitacion.creada',
      objetoTipo: 'invitacion',
      objetoId: fila.id,
      carga: { rol_destino: datos.rol_destino },
      resumen: `${actor.nombre} creó una invitación de ${datos.rol_destino}`,
    });
    return aInvitacion(fila);
  });
}

export async function listarInvitaciones(db: BaseDatos, equipoId: string): Promise<Invitacion[]> {
  const filas = await db
    .selectFrom('invitaciones')
    .select(COLUMNAS_INVITACION)
    .where('equipo_id', '=', equipoId)
    .orderBy('creada_en', 'desc')
    .execute();
  return filas.map(aInvitacion);
}

export async function revocarInvitacion(
  db: BaseDatos,
  ctx: ContextoEquipo,
  invitacionId: string,
): Promise<Invitacion> {
  const fila = await db
    .updateTable('invitaciones')
    .set({ estado: 'revocada' })
    .where('id', '=', invitacionId)
    .where('equipo_id', '=', ctx.equipoId)
    .where('estado', '=', 'pendiente')
    .returning(COLUMNAS_INVITACION)
    .executeTakeFirst();
  if (!fila) {
    throw new ErrorNexo(
      404,
      'invitacion_no_encontrada',
      'No hay una invitación pendiente con ese código.',
    );
  }
  return aInvitacion(fila);
}

/** Motivos por los que una invitación no sirve; la web muestra la pantalla AUTH-09 con cada uno. */
function invitacionInvalida(
  codigo:
    'invitacion_no_existe' | 'invitacion_caducada' | 'invitacion_usada' | 'invitacion_revocada',
) {
  const mensajes = {
    invitacion_no_existe:
      'No encontramos una invitación con ese código. Revisa que esté bien escrito.',
    invitacion_caducada: 'Esta invitación caducó. Pide una nueva al líder del equipo.',
    invitacion_usada: 'Esta invitación ya se usó. Pide una nueva al líder del equipo.',
    invitacion_revocada: 'El líder canceló esta invitación. Pídele una nueva.',
  } as const;
  return new ErrorNexo(codigo === 'invitacion_no_existe' ? 404 : 410, codigo, mensajes[codigo]);
}

async function buscarInvitacion(db: Ejecutor, entrada: string, paraActualizar = false) {
  let q = db
    .selectFrom('invitaciones as i')
    .innerJoin('equipos as e', 'e.id', 'i.equipo_id')
    .select([
      'i.id',
      'i.codigo',
      'i.equipo_id',
      'i.rol_destino',
      'i.estado',
      'i.caduca_en',
      'i.duracion_invitado_dias',
      'e.nombre',
      'e.descripcion',
      'e.max_miembros',
      'e.estado as estado_equipo',
    ])
    .where('i.codigo', '=', normalizarCodigoInvitacion(entrada));
  if (paraActualizar) q = q.forUpdate('i');
  const inv = await q.executeTakeFirst();
  if (!inv || inv.estado_equipo !== 'activo') throw invitacionInvalida('invitacion_no_existe');
  if (inv.estado === 'aceptada') throw invitacionInvalida('invitacion_usada');
  if (inv.estado === 'revocada') throw invitacionInvalida('invitacion_revocada');
  if (inv.estado === 'caducada' || inv.caduca_en < new Date()) {
    throw invitacionInvalida('invitacion_caducada');
  }
  return inv;
}

/** PER-07 / AUTH-08: vista previa antes de unirse. */
export async function verInvitacion(
  db: BaseDatos,
  usuarioId: string,
  entrada: string,
): Promise<VistaInvitacion> {
  const inv = await buscarInvitacion(db, entrada);
  const [cupo, lider, propia] = await Promise.all([
    db
      .selectFrom('v_equipo_cupo')
      .select('miembros_activos')
      .where('equipo_id', '=', inv.equipo_id)
      .executeTakeFirst(),
    db
      .selectFrom('membresias as m')
      .innerJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select('u.nombre')
      .where('m.equipo_id', '=', inv.equipo_id)
      .where('m.rol', '=', 'lider')
      .where('m.estado', '=', 'activa')
      .executeTakeFirst(),
    db
      .selectFrom('membresias')
      .select('id')
      .where('equipo_id', '=', inv.equipo_id)
      .where('usuario_id', '=', usuarioId)
      .where('estado', '=', 'activa')
      .executeTakeFirst(),
  ]);
  return {
    codigo: inv.codigo,
    equipo: { id: inv.equipo_id, nombre: inv.nombre, descripcion: inv.descripcion },
    lider: lider?.nombre ?? null,
    miembros_activos: Number(cupo?.miembros_activos ?? 0),
    max_miembros: inv.max_miembros,
    rol_destino: inv.rol_destino === 'invitado' ? 'invitado' : 'integrante',
    duracion_invitado_dias: inv.duracion_invitado_dias,
    caduca_en: inv.caduca_en.toISOString(),
    ya_miembro: !!propia,
  };
}

/**
 * Unirse con un código. El tope de miembros lo hace cumplir la BD (NX001): aquí solo se
 * traduce su error. La invitación es de un solo uso y se marca en la misma transacción.
 */
export async function aceptarInvitacion(
  db: BaseDatos,
  usuario: { id: string; nombre: string },
  entrada: string,
): Promise<{ equipo_id: string; rol: 'integrante' | 'invitado' }> {
  let maximo = 0;
  try {
    return await db.transaction().execute(async (tx) => {
      const inv = await buscarInvitacion(tx, entrada, true);
      maximo = inv.max_miembros;
      const rol = inv.rol_destino === 'invitado' ? 'invitado' : 'integrante';
      // Serializa las altas del equipo: el color libre se calcula sin carreras.
      await bloquearEquipo(tx, inv.equipo_id);

      const existente = await tx
        .selectFrom('membresias')
        .select('id')
        .where('equipo_id', '=', inv.equipo_id)
        .where('usuario_id', '=', usuario.id)
        .where('estado', '=', 'activa')
        .executeTakeFirst();
      if (existente) {
        throw new ErrorNexo(409, 'ya_miembro', `Ya perteneces a «${inv.nombre}».`, {
          equipo_id: inv.equipo_id,
        });
      }

      const { id: membresiaId } = await tx
        .insertInto('membresias')
        .values({
          equipo_id: inv.equipo_id,
          usuario_id: usuario.id,
          rol,
          color_idx:
            rol === 'invitado' ? null : sql<number>`fn_siguiente_color_idx(${inv.equipo_id})`,
          caduca_en:
            rol === 'invitado'
              ? new Date(Date.now() + (inv.duracion_invitado_dias ?? 7) * DIA_MS)
              : null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await tx
        .updateTable('invitaciones')
        .set({ estado: 'aceptada', aceptada_por: usuario.id, aceptada_en: new Date() })
        .where('id', '=', inv.id)
        .execute();
      await registrarEvento(tx, {
        equipoId: inv.equipo_id,
        actorId: usuario.id,
        tipo: 'membresia.creada',
        objetoTipo: 'membresia',
        objetoId: membresiaId,
        carga: { rol },
        resumen: `${usuario.nombre} se unió al equipo como ${rol}`,
      });
      return { equipo_id: inv.equipo_id, rol };
    });
  } catch (e) {
    if (codigoPg(e) === 'NX001') {
      throw new ErrorNexo(409, 'equipo_lleno', mensajeEquipoLleno(maximo));
    }
    throw e;
  }
}
