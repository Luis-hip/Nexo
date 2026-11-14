import type {
  ComentarioTarea,
  FiltrosTareas,
  Semaforo,
  Subtarea,
  TareaPersonal,
} from '@nexo/shared';
import type { Kysely, Selectable } from 'kysely';
import type { DB, VTareasSemaforo } from '../db/tipos';

/** Conexión o transacción: los repositorios no saben en cuál corren. */
export type Ejecutor = Kysely<DB>;

type FilaTarea = Selectable<VTareasSemaforo>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function aTarea(
  f: FilaTarea,
  etiquetas: string[],
  subtareas: { total: number; hechas: number },
): TareaPersonal {
  // La vista hereda las columnas de `tareas`; las NOT NULL nunca llegan nulas.
  return {
    id: f.id as string,
    codigo: f.codigo as number,
    titulo: f.titulo as string,
    descripcion: f.descripcion as string,
    estado: f.estado as TareaPersonal['estado'],
    prioridad: f.prioridad as TareaPersonal['prioridad'],
    progreso: f.progreso as number,
    vence_en: iso(f.vence_en),
    motivo: f.motivo,
    resultado: f.resultado,
    semaforo: f.semaforo as Semaforo | null,
    archivada: f.archivada as boolean,
    version: f.version as number,
    creado_en: iso(f.creado_en) as string,
    actualizado_en: iso(f.actualizado_en) as string,
    completada_en: iso(f.completada_en),
    etiquetas,
    subtareas_total: subtareas.total,
    subtareas_hechas: subtareas.hechas,
  };
}

async function completar(db: Ejecutor, filas: FilaTarea[]): Promise<TareaPersonal[]> {
  const ids = filas.map((f) => f.id as string);
  if (ids.length === 0) return [];

  const [etiquetas, subtareas] = await Promise.all([
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
  ]);

  return filas.map((f) => {
    const cuenta = subtareas.find((s) => s.tarea_id === f.id);
    return aTarea(
      f,
      etiquetas.filter((e) => e.tarea_id === f.id).map((e) => e.nombre),
      { total: Number(cuenta?.total ?? 0), hechas: Number(cuenta?.hechas ?? 0) },
    );
  });
}

/** Tareas personales de `duenoId`. La condición por dueño es lo que las hace privadas. */
export async function listarTareas(
  db: Ejecutor,
  duenoId: string,
  filtros: FiltrosTareas,
): Promise<TareaPersonal[]> {
  let q = db
    .selectFrom('v_tareas_semaforo as t')
    .selectAll('t')
    .where('t.dueno_id', '=', duenoId)
    .where('t.archivada', '=', filtros.archivadas);

  if (filtros.estado?.length) q = q.where('t.estado', 'in', filtros.estado);
  if (filtros.prioridad?.length) q = q.where('t.prioridad', 'in', filtros.prioridad);
  if (filtros.q) q = q.where('t.titulo', 'ilike', `%${filtros.q.replace(/[\\%_]/g, '\\$&')}%`);
  if (filtros.etiqueta) {
    const etiqueta = filtros.etiqueta;
    q = q.where((eb) =>
      eb.exists(
        eb
          .selectFrom('tarea_etiquetas as te')
          .innerJoin('etiquetas as e', 'e.id', 'te.etiqueta_id')
          .select('te.tarea_id')
          .whereRef('te.tarea_id', '=', 't.id')
          .where('e.nombre', '=', etiqueta),
      ),
    );
  }

  const filas = await q
    .orderBy('t.vence_en', (o) => o.asc().nullsLast())
    .orderBy('t.codigo')
    .execute();
  return completar(db, filas);
}

export async function obtenerTarea(
  db: Ejecutor,
  duenoId: string,
  tareaId: string,
): Promise<TareaPersonal | undefined> {
  const fila = await db
    .selectFrom('v_tareas_semaforo as t')
    .selectAll('t')
    .where('t.id', '=', tareaId)
    .where('t.dueno_id', '=', duenoId)
    .executeTakeFirst();
  if (!fila) return undefined;
  const [tarea] = await completar(db, [fila]);
  return tarea;
}

export async function listarSubtareas(db: Ejecutor, tareaId: string): Promise<Subtarea[]> {
  return db
    .selectFrom('subtareas')
    .select(['id', 'titulo', 'hecha'])
    .where('tarea_id', '=', tareaId)
    .orderBy('orden')
    .orderBy('id')
    .execute();
}

export async function listarComentarios(db: Ejecutor, tareaId: string): Promise<ComentarioTarea[]> {
  const filas = await db
    .selectFrom('comentarios_tarea')
    .select(['id', 'texto', 'autor_id', 'creado_en', 'editado_en'])
    .where('tarea_id', '=', tareaId)
    .orderBy('creado_en')
    .execute();
  return filas.map((c) => ({
    ...c,
    creado_en: c.creado_en.toISOString(),
    editado_en: iso(c.editado_en),
  }));
}

/** Sustituye las etiquetas de la tarea; crea las que el usuario aún no tenga. */
export async function fijarEtiquetas(
  db: Ejecutor,
  duenoId: string,
  tareaId: string,
  nombres: string[],
): Promise<void> {
  await db.deleteFrom('tarea_etiquetas').where('tarea_id', '=', tareaId).execute();
  // Sin distinguir mayúsculas (la columna es citext); se conserva la primera forma escrita.
  const unicos = nombres.filter(
    (n, i) => nombres.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i,
  );
  if (unicos.length === 0) return;

  const existentes = await db
    .selectFrom('etiquetas')
    .select(['id', 'nombre'])
    .where('usuario_id', '=', duenoId)
    .where('nombre', 'in', unicos)
    .execute();
  const faltan = unicos.filter(
    (n) => !existentes.some((e) => e.nombre.toLowerCase() === n.toLowerCase()),
  );
  const nuevas = faltan.length
    ? await db
        .insertInto('etiquetas')
        .values(faltan.map((nombre) => ({ usuario_id: duenoId, nombre })))
        .returning(['id', 'nombre'])
        .execute()
    : [];

  await db
    .insertInto('tarea_etiquetas')
    .values([...existentes, ...nuevas].map((e) => ({ tarea_id: tareaId, etiqueta_id: e.id })))
    .execute();
}

export async function listarEtiquetas(db: Ejecutor, duenoId: string): Promise<string[]> {
  const filas = await db
    .selectFrom('etiquetas')
    .select('nombre')
    .where('usuario_id', '=', duenoId)
    .orderBy('nombre')
    .execute();
  return filas.map((f) => f.nombre);
}

export async function registrarActividad(
  db: Ejecutor,
  usuarioId: string,
  accion: string,
  tareaId: string | null,
  resumen: string,
): Promise<void> {
  await db
    .insertInto('actividad')
    .values({
      usuario_id: usuarioId,
      autor_id: usuarioId,
      tipo: 'tarea',
      accion,
      objeto_tipo: 'tarea',
      objeto_id: tareaId,
      resumen,
    })
    .execute();
}
