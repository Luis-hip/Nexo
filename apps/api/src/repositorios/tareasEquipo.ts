import type {
  ActividadTarea,
  ComentarioEquipo,
  EstadoTarea,
  PersonaTarea,
  Semaforo,
  TareaEquipo,
} from '@nexo/shared';
import { generateNKeysBetween } from 'fractional-indexing';
import type { Selectable } from 'kysely';
import type { Ejecutor } from '../db/conexion';
import type { VTareasSemaforo } from '../db/tipos';

type FilaTarea = Selectable<VTareasSemaforo>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Qué tareas del equipo se piden. */
export type VistaTareas = 'tablero' | 'backlog' | 'triaje' | 'mias' | 'todas';

export const ESTADOS_TABLERO: EstadoTarea[] = [
  'aceptada',
  'habilitada',
  'en_curso',
  'atascada',
  'completada',
];

/** Personas del equipo (con su color) para pintar responsables y autores. */
async function personasDe(db: Ejecutor, equipoId: string, ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map<string, PersonaTarea>();
  const filas = await db
    .selectFrom('usuarios as u')
    .leftJoin('membresias as m', (j) =>
      j
        .onRef('m.usuario_id', '=', 'u.id')
        .on('m.equipo_id', '=', equipoId)
        .on('m.estado', '=', 'activa'),
    )
    .select(['u.id as usuario_id', 'u.nombre', 'm.color_idx'])
    .where('u.id', 'in', unicos)
    .execute();
  return new Map(filas.map((f) => [f.usuario_id, f]));
}

async function completar(
  db: Ejecutor,
  equipoId: string,
  filas: FilaTarea[],
): Promise<TareaEquipo[]> {
  const ids = filas.map((f) => f.id as string);
  if (ids.length === 0) return [];
  const [personas, etiquetas, subtareas, comentarios] = await Promise.all([
    personasDe(
      db,
      equipoId,
      filas.flatMap((f) => [f.responsable_id, f.proponente_id]),
    ),
    db
      .selectFrom('tarea_etiquetas as te')
      .innerJoin('etiquetas as e', 'e.id', 'te.etiqueta_id')
      .select(['te.tarea_id', 'e.nombre'])
      .where('te.tarea_id', 'in', ids)
      .orderBy('e.nombre')
      .execute(),
    db
      .selectFrom('subtareas')
      .select((eb) => [
        'tarea_id',
        eb.fn.countAll<string>().as('total'),
        eb.fn.count<string>('id').filterWhere('hecha', '=', true).as('hechas'),
      ])
      .where('tarea_id', 'in', ids)
      .groupBy('tarea_id')
      .execute(),
    db
      .selectFrom('comentarios_tarea')
      .select((eb) => ['tarea_id', eb.fn.countAll<string>().as('total')])
      .where('tarea_id', 'in', ids)
      .groupBy('tarea_id')
      .execute(),
  ]);

  return filas.map((f): TareaEquipo => {
    const sub = subtareas.find((s) => s.tarea_id === f.id);
    // La vista hereda las columnas de `tareas`; las NOT NULL nunca llegan nulas.
    return {
      id: f.id as string,
      equipo_id: equipoId,
      codigo: f.codigo as number,
      titulo: f.titulo as string,
      descripcion: f.descripcion as string,
      estado: f.estado as EstadoTarea,
      prioridad: f.prioridad as TareaEquipo['prioridad'],
      progreso: f.progreso as number,
      vence_en: iso(f.vence_en),
      motivo: f.motivo,
      rechazo_por: f.rechazo_por,
      cambios_pedidos: f.cambios_pedidos,
      resultado: f.resultado,
      semaforo: f.semaforo as Semaforo | null,
      asignacion_pendiente: f.asignacion_pendiente as boolean,
      origen: f.origen as TareaEquipo['origen'],
      orden: f.orden as string,
      sprint_id: f.sprint_id,
      archivada: f.archivada as boolean,
      version: f.version as number,
      creado_en: iso(f.creado_en) as string,
      actualizado_en: iso(f.actualizado_en) as string,
      completada_en: iso(f.completada_en),
      responsable: (f.responsable_id && personas.get(f.responsable_id)) || null,
      proponente: (f.proponente_id && personas.get(f.proponente_id)) || null,
      etiquetas: etiquetas.filter((e) => e.tarea_id === f.id).map((e) => e.nombre),
      subtareas_total: Number(sub?.total ?? 0),
      subtareas_hechas: Number(sub?.hechas ?? 0),
      comentarios_total: Number(comentarios.find((c) => c.tarea_id === f.id)?.total ?? 0),
    };
  });
}

interface Alcance {
  equipoId: string;
  /** Si se indica, solo las tareas compartidas con esa membresía (invitados). */
  compartidasCon?: string;
}

function base(db: Ejecutor, a: Alcance) {
  let q = db
    .selectFrom('v_tareas_semaforo as t')
    .selectAll('t')
    .where('t.equipo_id', '=', a.equipoId);
  if (a.compartidasCon) {
    const membresiaId = a.compartidasCon;
    q = q.where((eb) =>
      eb.exists(
        eb
          .selectFrom('tarea_compartida as tc')
          .select('tc.tarea_id')
          .whereRef('tc.tarea_id', '=', 't.id')
          .where('tc.membresia_id', '=', membresiaId),
      ),
    );
  }
  return q;
}

export async function listarTareas(
  db: Ejecutor,
  a: Alcance,
  vista: VistaTareas,
  usuarioId: string,
): Promise<TareaEquipo[]> {
  let q = base(db, a).where('t.archivada', '=', false);
  if (vista === 'tablero') q = q.where('t.estado', 'in', ESTADOS_TABLERO);
  if (vista === 'backlog') q = q.where('t.estado', '=', 'backlog');
  // Propuestas por decidir, asignaciones rechazadas (para reasignar) y lo que rechazó el líder.
  if (vista === 'triaje') q = q.where('t.estado', 'in', ['propuesta', 'rechazada']);
  if (vista === 'mias') q = q.where('t.proponente_id', '=', usuarioId);
  const filas = await q.orderBy('t.orden').orderBy('t.codigo').execute();
  return completar(db, a.equipoId, filas);
}

export async function obtenerTarea(
  db: Ejecutor,
  a: Alcance,
  tareaId: string,
): Promise<TareaEquipo | undefined> {
  const fila = await base(db, a).where('t.id', '=', tareaId).executeTakeFirst();
  if (!fila) return undefined;
  const [tarea] = await completar(db, a.equipoId, [fila]);
  return tarea;
}

export async function contarTareas(db: Ejecutor, equipoId: string) {
  const filas = await db
    .selectFrom('tareas')
    .select((eb) => ['estado', 'rechazo_por', eb.fn.countAll<string>().as('total')])
    .where('equipo_id', '=', equipoId)
    .where('archivada', '=', false)
    .groupBy(['estado', 'rechazo_por'])
    .execute();
  const suma = (filtro: (f: (typeof filas)[number]) => boolean) =>
    filas.filter(filtro).reduce((n, f) => n + Number(f.total), 0);
  return {
    tablero: suma((f) => ESTADOS_TABLERO.includes(f.estado)),
    backlog: suma((f) => f.estado === 'backlog'),
    triaje: suma(
      (f) =>
        f.estado === 'propuesta' || (f.estado === 'rechazada' && f.rechazo_por === 'responsable'),
    ),
  };
}

export async function listarComentarios(
  db: Ejecutor,
  equipoId: string,
  tareaId: string,
): Promise<ComentarioEquipo[]> {
  const filas = await db
    .selectFrom('comentarios_tarea')
    .select(['id', 'texto', 'autor_id', 'creado_en', 'editado_en'])
    .where('tarea_id', '=', tareaId)
    .orderBy('creado_en')
    .execute();
  const personas = await personasDe(
    db,
    equipoId,
    filas.map((f) => f.autor_id),
  );
  return filas.map((c) => ({
    id: c.id,
    texto: c.texto,
    autor: (c.autor_id && personas.get(c.autor_id)) || null,
    creado_en: c.creado_en.toISOString(),
    editado_en: iso(c.editado_en),
  }));
}

export async function listarHistorial(db: Ejecutor, tareaId: string): Promise<ActividadTarea[]> {
  const filas = await db
    .selectFrom('actividad as a')
    .leftJoin('usuarios as u', 'u.id', 'a.autor_id')
    .select(['a.id', 'a.resumen', 'u.nombre as autor', 'a.creado_en'])
    .where('a.objeto_tipo', '=', 'tarea')
    .where('a.objeto_id', '=', tareaId)
    .orderBy('a.creado_en', 'desc')
    .limit(50)
    .execute();
  return filas.map((f) => ({ ...f, creado_en: f.creado_en.toISOString() }));
}

/** Sustituye las etiquetas de la tarea; crea en el equipo las que aún no existan. */
export async function fijarEtiquetas(
  db: Ejecutor,
  equipoId: string,
  tareaId: string,
  nombres: string[],
): Promise<void> {
  await db.deleteFrom('tarea_etiquetas').where('tarea_id', '=', tareaId).execute();
  const unicos = nombres.filter(
    (n, i) => nombres.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i,
  );
  if (unicos.length === 0) return;
  const existentes = await db
    .selectFrom('etiquetas')
    .select(['id', 'nombre'])
    .where('equipo_id', '=', equipoId)
    .where('nombre', 'in', unicos)
    .execute();
  const faltan = unicos.filter(
    (n) => !existentes.some((e) => e.nombre.toLowerCase() === n.toLowerCase()),
  );
  const nuevas = faltan.length
    ? await db
        .insertInto('etiquetas')
        .values(faltan.map((nombre) => ({ equipo_id: equipoId, nombre })))
        .returning(['id', 'nombre'])
        .execute()
    : [];
  await db
    .insertInto('tarea_etiquetas')
    .values([...existentes, ...nuevas].map((e) => ({ tarea_id: tareaId, etiqueta_id: e.id })))
    .execute();
}

/**
 * Tareas de una columna (mismo estado) en su orden actual, bloqueadas para la transacción.
 * Si hay claves de orden repetidas (p. ej. la semilla, donde todas valen `a0`), las reparte
 * de nuevo para que siempre exista una clave estrictamente entre dos vecinas.
 */
export async function columnaOrdenada(
  tx: Ejecutor,
  equipoId: string,
  estado: EstadoTarea,
): Promise<{ id: string; orden: string }[]> {
  const filas = await tx
    .selectFrom('tareas')
    .select(['id', 'orden'])
    .where('equipo_id', '=', equipoId)
    .where('estado', '=', estado)
    .orderBy('orden')
    .orderBy('codigo')
    .forUpdate()
    .execute();
  const repetidas = filas.some((f, i) => i > 0 && f.orden <= (filas[i - 1]?.orden ?? ''));
  if (!repetidas) return filas;
  const claves = generateNKeysBetween(null, null, filas.length);
  for (const [i, f] of filas.entries()) {
    const orden = claves[i] ?? f.orden;
    // El disparador sube `version` de cada tarea repartida; ocurre una sola vez por columna y la
    // web vuelve a consultar el tablero después de cada movimiento.
    await tx.updateTable('tareas').set({ orden }).where('id', '=', f.id).execute();
    f.orden = orden;
  }
  return filas;
}
