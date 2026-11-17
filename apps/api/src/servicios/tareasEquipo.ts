import {
  comprobarTransicion,
  puede,
  transicionesValidas,
  type CambiarEstado,
  type ConteosTareas,
  type CrearTareaEquipo,
  type EditarTareaEquipo,
  type EstadoTarea,
  type MoverTarea,
  type TareaEquipo,
  type TareaEquipoDetalle,
  type Votar,
} from '@nexo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import type { BaseDatos, Ejecutor } from '../db/conexion';
import type { ContextoEquipo } from '../equipos/contexto';
import { ErrorNexo } from '../errores';
import { registrarEvento } from '../repositorios/eventos';
import * as repo from '../repositorios/tareasEquipo';
import * as repoVotacion from '../repositorios/votacion';

/** Quien hace la acción (para el registro de actividad). */
export interface Actor {
  id: string;
  nombre: string;
}

const noEncontrada = () => new ErrorNexo(404, 'tarea_no_encontrada', 'No encontramos esa tarea.');
const sinPermiso = (motivo: string) => new ErrorNexo(403, 'sin_permiso', motivo);
const codigo = (n: number) => `T-${String(n).padStart(2, '0')}`;
const primerNombre = (nombre: string) => nombre.split(' ')[0] ?? nombre;

/** Un invitado solo alcanza las tareas compartidas con su membresía. */
const alcance = (ctx: ContextoEquipo) => ({
  equipoId: ctx.equipoId,
  compartidasCon: ctx.rol === 'invitado' ? ctx.membresiaId : undefined,
});

// ---------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------

export async function listar(db: BaseDatos, ctx: ContextoEquipo, vista: repo.VistaTareas) {
  const tareas = await repo.listarTareas(db, alcance(ctx), vista, ctx.usuarioId);
  if (ctx.rol === 'invitado' || (vista !== 'votacion' && vista !== 'mias')) return tareas;
  // En las vistas de votación cada propuesta lleva su resumen (conteo, quién votó y mi voto; V-8).
  const votaciones = await repoVotacion.resumenes(
    db,
    ctx.usuarioId,
    ctx.equipoId,
    tareas.map((t) => t.id),
  );
  return tareas.map((t) => ({ ...t, votacion: votaciones.get(t.id) ?? null }));
}

export function contar(db: BaseDatos, ctx: ContextoEquipo): Promise<ConteosTareas> {
  return repo.contarTareas(db, ctx.equipoId);
}

async function detalle(
  db: Ejecutor,
  ctx: ContextoEquipo,
  tareaId: string,
): Promise<TareaEquipoDetalle> {
  const tarea = await repo.obtenerTarea(db, alcance(ctx), tareaId);
  if (!tarea) throw noEncontrada();
  const [subtareas, comentarios, historial, compartida, votacion] = await Promise.all([
    db
      .selectFrom('subtareas')
      .select(['id', 'titulo', 'hecha'])
      .where('tarea_id', '=', tareaId)
      .orderBy('orden')
      .orderBy('id')
      .execute(),
    repo.listarComentarios(db, ctx.equipoId, tareaId),
    ctx.rol === 'invitado' ? Promise.resolve([]) : repo.listarHistorial(db, tareaId),
    ctx.rol === 'lider'
      ? db
          .selectFrom('tarea_compartida')
          .select('membresia_id')
          .where('tarea_id', '=', tareaId)
          .execute()
      : Promise.resolve([]),
    // La votación solo existe en las propuestas del líder y los invitados no la ven.
    tarea.origen === 'propuesta' && ctx.rol !== 'invitado'
      ? repoVotacion.resumen(db, ctx.usuarioId, ctx.equipoId, tareaId)
      : Promise.resolve(null),
  ]);
  return {
    ...tarea,
    votacion,
    subtareas,
    comentarios,
    historial,
    compartida_con: compartida.map((c) => c.membresia_id),
    transiciones: transicionesValidas(
      {
        estado: tarea.estado,
        responsable_id: tarea.responsable?.usuario_id ?? null,
        asignacion_pendiente: tarea.asignacion_pendiente,
      },
      ctx.rol,
      ctx.usuarioId,
    ),
  };
}

export function obtener(db: BaseDatos, ctx: ContextoEquipo, tareaId: string) {
  return detalle(db, ctx, tareaId);
}

// ---------------------------------------------------------------------------------------------
// Utilidades de escritura
// ---------------------------------------------------------------------------------------------

/**
 * Bloquea la tarea para la transacción y comprueba la versión (concurrencia optimista):
 * quien guarda con una versión vieja recibe 409.
 */
async function bloquear(tx: Ejecutor, ctx: ContextoEquipo, tareaId: string, version?: number) {
  const t = await tx
    .selectFrom('tareas')
    .selectAll()
    .where('id', '=', tareaId)
    .where('equipo_id', '=', ctx.equipoId)
    .forUpdate()
    .executeTakeFirst();
  if (!t) throw noEncontrada();
  if (ctx.rol === 'invitado') {
    const compartida = await tx
      .selectFrom('tarea_compartida')
      .select('tarea_id')
      .where('tarea_id', '=', tareaId)
      .where('membresia_id', '=', ctx.membresiaId)
      .executeTakeFirst();
    if (!compartida) throw noEncontrada();
  }
  if (version !== undefined) exigirVersion(t, version);
  return t;
}

/** Concurrencia optimista: quien guarda con una versión vieja recibe 409. */
function exigirVersion(t: { version: number }, version: number) {
  if (t.version !== version) {
    throw new ErrorNexo(
      409,
      'conflicto_version',
      'Alguien cambió esta tarea. Recárgala para ver la versión más reciente.',
      { version_actual: t.version },
    );
  }
}

type FilaTarea = Awaited<ReturnType<typeof bloquear>>;

/** El responsable debe ser líder o integrante activo de este equipo. */
async function exigirMiembro(tx: Ejecutor, equipoId: string, usuarioId: string) {
  const m = await tx
    .selectFrom('membresias as m')
    .innerJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .select(['u.nombre', 'm.rol'])
    .where('m.equipo_id', '=', equipoId)
    .where('m.usuario_id', '=', usuarioId)
    .where('m.estado', '=', 'activa')
    .executeTakeFirst();
  if (!m || m.rol === 'invitado') {
    throw new ErrorNexo(
      400,
      'responsable_invalido',
      'El responsable debe ser un miembro del equipo.',
    );
  }
  return m.nombre;
}

/**
 * Sprint activo del equipo, si lo hay. La planeación de sprints es de la Fase 3: mientras tanto,
 * lo que entra al tablero se liga al sprint activo cuando existe y queda sin sprint cuando no.
 */
async function sprintActivo(tx: Ejecutor, equipoId: string) {
  return tx
    .selectFrom('sprints')
    .select(['id', 'numero'])
    .where('equipo_id', '=', equipoId)
    .where('estado', '=', 'activo')
    .executeTakeFirst();
}

/** Campos que cambian con el estado (reglas del prototipo y `CHECK` de la BD). */
function efectosDeEstado(t: FilaTarea, destino: EstadoTarea, motivo: string | undefined) {
  const ahora = new Date();
  const completa = destino === 'completada';
  const reabre = t.estado === 'completada' && !completa;
  return {
    estado: destino,
    motivo: destino === 'atascada' ? (motivo ?? null) : null,
    ...(completa && {
      progreso: 100,
      completada_en: ahora,
      resultado:
        t.vence_en && ahora > t.vence_en ? ('con_retraso' as const) : ('a_tiempo' as const),
    }),
    ...(reabre && { completada_en: null, resultado: null, progreso: Math.min(t.progreso, 90) }),
    ...(destino === 'en_curso' && !reabre && t.progreso === 0 && { progreso: 5 }),
  };
}

const NOMBRE_ESTADO: Record<EstadoTarea, string> = {
  propuesta: 'Propuesta',
  backlog: 'Backlog',
  aceptada: 'Aceptada',
  habilitada: 'Habilitada',
  en_curso: 'En curso',
  atascada: 'Atascada',
  completada: 'Completada',
  rechazada: 'Rechazada',
  cancelada: 'Retirada',
};

/** Aplica un cambio de estado ya validado y registra su evento. */
async function aplicarEstado(
  tx: Ejecutor,
  ctx: ContextoEquipo,
  actor: Actor,
  t: FilaTarea,
  destino: EstadoTarea,
  motivo: string | undefined,
  extra: { orden?: string } = {},
) {
  const efectos = efectosDeEstado(t, destino, motivo);
  // Al backlog sale del sprint; del backlog al tablero entra al sprint activo, si lo hay.
  const sprint =
    destino === 'backlog'
      ? { sprint_id: null }
      : t.estado === 'backlog' && destino === 'aceptada'
        ? { sprint_id: (await sprintActivo(tx, ctx.equipoId))?.id ?? null }
        : {};
  await tx
    .updateTable('tareas')
    .set({ ...efectos, ...sprint, ...extra })
    .where('id', '=', t.id)
    .execute();
  if (destino === 'completada') {
    await tx.updateTable('subtareas').set({ hecha: true }).where('tarea_id', '=', t.id).execute();
  }
  const quien = primerNombre(actor.nombre);
  const tarea = `${codigo(t.codigo)} «${t.titulo}»`;
  await registrarEvento(tx, {
    equipoId: ctx.equipoId,
    actorId: actor.id,
    tipo: destino === 'completada' ? 'tarea.completada' : 'tarea.estado_cambiado',
    objetoTipo: 'tarea',
    objetoId: t.id,
    carga: {
      de: t.estado,
      a: destino,
      responsable_id: t.responsable_id,
      ...(motivo && { motivo }),
      ...('resultado' in efectos && { resultado: efectos.resultado }),
    },
    resumen:
      destino === 'completada'
        ? `${quien} completó ${tarea}${efectos.resultado === 'con_retraso' ? ' (con retraso)' : ' a tiempo'}`
        : destino === 'atascada'
          ? `${quien} marcó ${tarea} como atascada: «${motivo}»`
          : t.estado === 'completada'
            ? `${quien} reabrió ${tarea}`
            : `${quien} pasó ${tarea} de ${NOMBRE_ESTADO[t.estado]} a ${NOMBRE_ESTADO[destino]}`,
  });
}

/** Valida la transición con la máquina de estados compartida; si no es válida, 422 con el motivo. */
function exigirTransicion(
  ctx: ContextoEquipo,
  t: FilaTarea,
  destino: EstadoTarea,
  version?: number,
) {
  const permiso = puede('cambiar_estado_tarea', {
    perfil: ctx.rol,
    esPropio: t.responsable_id === ctx.usuarioId,
  });
  if (!permiso.permitido) throw sinPermiso(permiso.motivo);
  if (version !== undefined) exigirVersion(t, version);
  const r = comprobarTransicion(
    {
      estado: t.estado,
      responsable_id: t.responsable_id,
      asignacion_pendiente: t.asignacion_pendiente,
    },
    destino,
    ctx.rol,
    ctx.usuarioId,
  );
  if (!r.valida) throw new ErrorNexo(422, 'transicion_invalida', r.motivo);
}

/** Clave de orden para dejar una tarea al final de una columna. */
async function ordenAlFinal(tx: Ejecutor, equipoId: string, estado: EstadoTarea, excluir?: string) {
  const columna = (await repo.columnaOrdenada(tx, equipoId, estado)).filter(
    (f) => f.id !== excluir,
  );
  return generateKeyBetween(columna.at(-1)?.orden ?? null, null);
}

// ---------------------------------------------------------------------------------------------
// Proponer (EQ-07) y votación de propuestas (EQ-05, DEC-024)
// ---------------------------------------------------------------------------------------------

/**
 * Solo el líder crea tareas: cada una nace como **propuesta** con sus subtareas y entra en
 * votación (V-10). Las reglas viven en el proceso `proc_tarea_proponer`.
 */
export async function crear(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  datos: CrearTareaEquipo,
): Promise<TareaEquipoDetalle> {
  const { id } = await repoVotacion.proponer(db, actor.id, ctx.equipoId, datos);
  return detalle(db, ctx, id);
}

/** Un integrante vota (o cambia su voto). Al alcanzarse la mayoría, el proceso cierra la votación. */
export async function votar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: Votar,
): Promise<TareaEquipoDetalle> {
  await repoVotacion.votar(db, actor.id, ctx.equipoId, tareaId, datos);
  return detalle(db, ctx, tareaId);
}

/** El líder retira una propuesta que sigue en votación (queda «Retirada»). */
export async function retirar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  version: number,
): Promise<TareaEquipoDetalle> {
  await repoVotacion.retirar(db, actor.id, ctx.equipoId, tareaId, version);
  return detalle(db, ctx, tareaId);
}

/** El líder reformula una propuesta rechazada o retirada: nace una propuesta nueva. */
export async function reformular(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: CrearTareaEquipo,
): Promise<TareaEquipoDetalle> {
  const { id } = await repoVotacion.reformular(db, actor.id, ctx.equipoId, tareaId, datos);
  return detalle(db, ctx, id);
}

// ---------------------------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------------------------

/**
 * El líder edita cualquier tarea. Un integrante solo puede actualizar el avance de **su** tarea
 * (ya aceptada la asignación); desde la Fase 2.5 ya no propone, así que no edita propuestas.
 */
export function editar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  { version, etiquetas, ...cambios }: EditarTareaEquipo,
): Promise<TareaEquipoDetalle> {
  return db.transaction().execute(async (tx) => {
    // Primero el permiso y después la versión: a quien no puede editar no se le dice nada más.
    const t = await bloquear(tx, ctx, tareaId);
    if (ctx.rol !== 'lider') {
      const campos = Object.keys(cambios).filter(
        (k) => cambios[k as keyof typeof cambios] !== undefined,
      );
      const soloAvance = campos.length > 0 && campos.every((k) => k === 'progreso') && !etiquetas;
      const suTarea = t.responsable_id === actor.id && !t.asignacion_pendiente;
      const permitido = ctx.rol === 'integrante' && soloAvance && suTarea;
      if (!permitido) {
        throw sinPermiso(puedeMotivo('editar_tarea_ajena', ctx));
      }
    }
    exigirVersion(t, version);
    if (cambios.progreso !== undefined && t.estado === 'completada' && cambios.progreso !== 100) {
      throw new ErrorNexo(400, 'validacion', 'Una tarea completada tiene el 100 % de avance.');
    }
    await tx
      .updateTable('tareas')
      .set({
        actualizado_en: new Date(), // siempre hay UPDATE: el disparador sube `version`
        ...(cambios.titulo !== undefined && { titulo: cambios.titulo }),
        ...(cambios.descripcion !== undefined && { descripcion: cambios.descripcion }),
        ...(cambios.prioridad !== undefined && { prioridad: cambios.prioridad }),
        ...(cambios.vence_en !== undefined && { vence_en: cambios.vence_en }),
        ...(cambios.progreso !== undefined && { progreso: cambios.progreso }),
        ...(cambios.archivada !== undefined && { archivada: cambios.archivada }),
      })
      .where('id', '=', tareaId)
      .execute();
    if (etiquetas !== undefined) await repo.fijarEtiquetas(tx, ctx.equipoId, tareaId, etiquetas);

    const soloProgreso = Object.keys(cambios).every((k) => k === 'progreso') && !etiquetas;
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: actor.id,
      tipo: soloProgreso ? 'tarea.progreso' : 'tarea.editada',
      objetoTipo: 'tarea',
      objetoId: tareaId,
      carga: { campos: Object.keys(cambios), responsable_id: t.responsable_id },
      resumen: soloProgreso
        ? `${primerNombre(actor.nombre)} actualizó el avance de ${codigo(t.codigo)} (${cambios.progreso} %)`
        : `${primerNombre(actor.nombre)} editó ${codigo(t.codigo)} «${cambios.titulo ?? t.titulo}»`,
    });
    return detalle(tx, ctx, tareaId);
  });
}

function puedeMotivo(accion: Parameters<typeof puede>[0], ctx: ContextoEquipo): string {
  const r = puede(accion, { perfil: ctx.rol });
  return r.permitido ? 'No puedes editar esta tarea.' : r.motivo;
}

export async function eliminar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const t = await bloquear(tx, ctx, tareaId);
    await tx.deleteFrom('tareas').where('id', '=', tareaId).execute();
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: actor.id,
      tipo: 'tarea.eliminada',
      objetoTipo: 'tarea',
      objetoId: tareaId,
      resumen: `${primerNombre(actor.nombre)} eliminó ${codigo(t.codigo)} «${t.titulo}»`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Estados y tablero (EQ-02)
// ---------------------------------------------------------------------------------------------

export function cambiarEstado(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: CambiarEstado,
): Promise<TareaEquipoDetalle> {
  return db.transaction().execute(async (tx) => {
    const t = await bloquear(tx, ctx, tareaId);
    exigirTransicion(ctx, t, datos.estado, datos.version);
    const orden = await ordenAlFinal(tx, ctx.equipoId, datos.estado, t.id);
    await aplicarEstado(tx, ctx, actor, t, datos.estado, datos.motivo, { orden });
    return detalle(tx, ctx, tareaId);
  });
}

/**
 * Arrastrar y soltar: «mover la tarea entre A y B». El servidor calcula el nuevo orden
 * (índice fraccionario) y, si cambia de columna, valida y aplica la transición de estado.
 */
export function mover(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: MoverTarea,
): Promise<TareaEquipoDetalle> {
  return db.transaction().execute(async (tx) => {
    const t = await bloquear(tx, ctx, tareaId);
    // Permiso sobre la tarea, después la versión y por último qué movimiento es: si otra persona
    // ya la movió, quien llega tarde recibe 409 y no un error que no entendería.
    const permiso = puede('cambiar_estado_tarea', {
      perfil: ctx.rol,
      esPropio: t.responsable_id === ctx.usuarioId,
    });
    if (!permiso.permitido) throw sinPermiso(permiso.motivo);
    exigirVersion(t, datos.version);
    const destino = datos.estado ?? t.estado;
    const cambiaEstado = destino !== t.estado;
    if (cambiaEstado) {
      exigirTransicion(ctx, t, destino);
      if (destino === 'atascada' && !datos.motivo) {
        throw new ErrorNexo(
          400,
          'validacion',
          'Para marcar la tarea como atascada escribe el motivo.',
        );
      }
    } else if (ctx.rol !== 'lider') {
      // Reordenar dentro de una columna cambia la prioridad visible del equipo.
      throw sinPermiso('Solo el líder puede reordenar las tareas del tablero.');
    }

    const columna = (await repo.columnaOrdenada(tx, ctx.equipoId, destino)).filter(
      (f) => f.id !== t.id,
    );
    const posicion = (id: string | null) => (id ? columna.findIndex((f) => f.id === id) : -1);
    const iAntes = posicion(datos.antes_id);
    const iDespues = posicion(datos.despues_id);
    if ((datos.antes_id && iAntes < 0) || (datos.despues_id && iDespues < 0)) {
      // Las vecinas ya no están en esa columna: otra persona movió algo.
      throw new ErrorNexo(
        409,
        'conflicto_orden',
        'El tablero cambió mientras movías la tarjeta. Te mostramos el orden más reciente.',
      );
    }
    // Con una sola vecina se inserta junto a ella; sin vecinas, al final.
    const antes = iAntes >= 0 ? columna[iAntes] : iDespues > 0 ? columna[iDespues - 1] : undefined;
    const despues =
      iDespues >= 0 ? columna[iDespues] : iAntes >= 0 ? columna[iAntes + 1] : undefined;
    const sinVecinas = !datos.antes_id && !datos.despues_id;
    const orden = sinVecinas
      ? generateKeyBetween(columna.at(-1)?.orden ?? null, null)
      : generateKeyBetween(antes?.orden ?? null, despues?.orden ?? null);

    if (cambiaEstado) {
      await aplicarEstado(tx, ctx, actor, t, destino, datos.motivo, { orden });
    } else {
      await tx.updateTable('tareas').set({ orden }).where('id', '=', t.id).execute();
    }
    return detalle(tx, ctx, tareaId);
  });
}

// ---------------------------------------------------------------------------------------------
// Asignación (EQ-08)
// ---------------------------------------------------------------------------------------------

/** El líder asigna (o quita) al responsable; el asignado debe aceptar. */
export function asignar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: { version: number; responsable_id: string | null },
): Promise<TareaEquipoDetalle> {
  return db.transaction().execute(async (tx) => {
    const t = await bloquear(tx, ctx, tareaId, datos.version);
    // V-11: el líder asigna al proponer o cuando la propuesta ya fue aceptada.
    if (['propuesta', 'rechazada', 'cancelada', 'completada'].includes(t.estado)) {
      throw new ErrorNexo(
        422,
        'transicion_invalida',
        t.estado === 'completada'
          ? 'La tarea ya está completada.'
          : t.estado === 'propuesta'
            ? 'La propuesta sigue en votación; asigna al responsable cuando se acepte.'
            : 'Esta propuesta no fue aceptada; reformúlala para volver a votarla.',
      );
    }
    const responsable = datos.responsable_id
      ? await exigirMiembro(tx, ctx.equipoId, datos.responsable_id)
      : null;
    await tx
      .updateTable('tareas')
      .set({
        responsable_id: datos.responsable_id,
        asignacion_pendiente: !!datos.responsable_id && datos.responsable_id !== actor.id,
      })
      .where('id', '=', t.id)
      .execute();
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: actor.id,
      tipo: datos.responsable_id ? 'tarea.asignada' : 'tarea.desasignada',
      objetoTipo: 'tarea',
      objetoId: t.id,
      carga: { responsable_id: datos.responsable_id, anterior_id: t.responsable_id },
      resumen: responsable
        ? `${primerNombre(actor.nombre)} asignó ${codigo(t.codigo)} «${t.titulo}» a ${primerNombre(responsable)}`
        : `${primerNombre(actor.nombre)} dejó ${codigo(t.codigo)} «${t.titulo}» sin responsable`,
    });
    return detalle(tx, ctx, tareaId);
  });
}

/**
 * El responsable acepta la asignación o la rechaza con motivo. Si la rechaza, la tarea conserva
 * su estado y queda sin responsable para que el líder la **reasigne directamente**, sin nueva
 * votación (V-11, por confirmar).
 */
export function responderAsignacion(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: { acepta: boolean; motivo?: string },
): Promise<TareaEquipoDetalle> {
  return db.transaction().execute(async (tx) => {
    const t = await bloquear(tx, ctx, tareaId);
    if (t.responsable_id !== actor.id || !t.asignacion_pendiente) {
      throw new ErrorNexo(
        422,
        'sin_asignacion_pendiente',
        'No tienes una asignación pendiente en esta tarea.',
      );
    }
    const quien = primerNombre(actor.nombre);
    const tarea = `${codigo(t.codigo)} «${t.titulo}»`;
    if (datos.acepta) {
      await tx
        .updateTable('tareas')
        .set({ asignacion_pendiente: false })
        .where('id', '=', t.id)
        .execute();
    } else {
      await tx
        .updateTable('tareas')
        .set({ asignacion_pendiente: false, responsable_id: null })
        .where('id', '=', t.id)
        .execute();
    }
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: actor.id,
      tipo: datos.acepta ? 'tarea.asignacion_aceptada' : 'tarea.asignacion_rechazada',
      objetoTipo: 'tarea',
      objetoId: t.id,
      carga: { responsable_id: actor.id, ...(datos.motivo && { motivo: datos.motivo }) },
      resumen: datos.acepta
        ? `${quien} aceptó la asignación de ${tarea}`
        : `${quien} rechazó la asignación de ${tarea}: «${datos.motivo}»; el líder la reasigna`,
    });
    return detalle(tx, ctx, tareaId);
  });
}

// ---------------------------------------------------------------------------------------------
// Compartir con invitados, subtareas y comentarios
// ---------------------------------------------------------------------------------------------

/** El líder elige qué invitados ven la tarea. */
export function compartir(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  membresiaIds: string[],
): Promise<TareaEquipoDetalle> {
  return db.transaction().execute(async (tx) => {
    const t = await bloquear(tx, ctx, tareaId);
    const unicos = [...new Set(membresiaIds)];
    if (unicos.length) {
      const invitados = await tx
        .selectFrom('membresias')
        .select('id')
        .where('id', 'in', unicos)
        .where('equipo_id', '=', ctx.equipoId)
        .where('rol', '=', 'invitado')
        .where('estado', '=', 'activa')
        .execute();
      if (invitados.length !== unicos.length) {
        throw new ErrorNexo(
          400,
          'validacion',
          'Solo se comparte con invitados activos de este equipo.',
        );
      }
    }
    await tx.deleteFrom('tarea_compartida').where('tarea_id', '=', tareaId).execute();
    if (unicos.length) {
      await tx
        .insertInto('tarea_compartida')
        .values(unicos.map((membresia_id) => ({ tarea_id: tareaId, membresia_id })))
        .execute();
    }
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: actor.id,
      tipo: 'tarea.compartida',
      objetoTipo: 'tarea',
      objetoId: tareaId,
      carga: { invitados: unicos.length },
      resumen: `${primerNombre(actor.nombre)} compartió ${codigo(t.codigo)} «${t.titulo}» con ${unicos.length} ${unicos.length === 1 ? 'invitado' : 'invitados'}`,
    });
    return detalle(tx, ctx, tareaId);
  });
}

/** Las subtareas las gestiona el líder o el responsable de la tarea. */
async function exigirGestionSubtareas(tx: Ejecutor, ctx: ContextoEquipo, tareaId: string) {
  const t = await bloquear(tx, ctx, tareaId);
  const permiso = puede('cambiar_estado_tarea', {
    perfil: ctx.rol,
    esPropio: t.responsable_id === ctx.usuarioId,
  });
  if (!permiso.permitido) throw sinPermiso(permiso.motivo);
  return t;
}

export function crearSubtarea(db: BaseDatos, ctx: ContextoEquipo, tareaId: string, titulo: string) {
  return db.transaction().execute(async (tx) => {
    await exigirGestionSubtareas(tx, ctx, tareaId);
    return tx
      .insertInto('subtareas')
      .values({ tarea_id: tareaId, titulo })
      .returning(['id', 'titulo', 'hecha'])
      .executeTakeFirstOrThrow();
  });
}

export function actualizarSubtarea(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  subtareaId: string,
  cambios: { titulo?: string; hecha?: boolean },
) {
  return db.transaction().execute(async (tx) => {
    await exigirGestionSubtareas(tx, ctx, tareaId);
    const fila = await tx
      .updateTable('subtareas')
      .set(cambios)
      .where('id', '=', subtareaId)
      .where('tarea_id', '=', tareaId)
      .returning(['id', 'titulo', 'hecha'])
      .executeTakeFirst();
    if (!fila) throw new ErrorNexo(404, 'subtarea_no_encontrada', 'No encontramos esa subtarea.');
    return fila;
  });
}

export function eliminarSubtarea(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  subtareaId: string,
): Promise<void> {
  return db.transaction().execute(async (tx) => {
    await exigirGestionSubtareas(tx, ctx, tareaId);
    const r = await tx
      .deleteFrom('subtareas')
      .where('id', '=', subtareaId)
      .where('tarea_id', '=', tareaId)
      .executeTakeFirst();
    if (r.numDeletedRows === 0n) {
      throw new ErrorNexo(404, 'subtarea_no_encontrada', 'No encontramos esa subtarea.');
    }
  });
}

/** Comentan el líder, los integrantes y los invitados con la tarea compartida. */
export function comentar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  texto: string,
) {
  return db.transaction().execute(async (tx) => {
    // `bloquear` ya responde 404 a un invitado sin la tarea compartida.
    const t = await bloquear(tx, ctx, tareaId);
    const { id } = await tx
      .insertInto('comentarios_tarea')
      .values({ tarea_id: tareaId, autor_id: actor.id, texto })
      .returning('id')
      .executeTakeFirstOrThrow();
    await registrarEvento(tx, {
      equipoId: ctx.equipoId,
      actorId: actor.id,
      tipo: 'tarea.comentada',
      objetoTipo: 'tarea',
      objetoId: tareaId,
      carga: { comentario_id: id, responsable_id: t.responsable_id },
      resumen: `${primerNombre(actor.nombre)} comentó en ${codigo(t.codigo)} «${t.titulo}»`,
    });
    const comentarios = await repo.listarComentarios(tx, ctx.equipoId, tareaId);
    return comentarios.find((c) => c.id === id);
  });
}

/** Cada quien borra sus comentarios; el líder, además, los ajenos. */
export function eliminarComentario(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  comentarioId: string,
): Promise<void> {
  return db.transaction().execute(async (tx) => {
    await bloquear(tx, ctx, tareaId);
    let q = tx
      .deleteFrom('comentarios_tarea')
      .where('id', '=', comentarioId)
      .where('tarea_id', '=', tareaId);
    if (ctx.rol !== 'lider') q = q.where('autor_id', '=', ctx.usuarioId);
    const r = await q.executeTakeFirst();
    if (r.numDeletedRows === 0n) {
      throw new ErrorNexo(404, 'comentario_no_encontrado', 'No encontramos ese comentario.');
    }
  });
}

export type { TareaEquipo };
