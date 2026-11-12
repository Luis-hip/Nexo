import type {
  ActualizarTareaPersonal,
  ComentarioTarea,
  CrearTareaPersonal,
  FiltrosTareas,
  Subtarea,
  TareaPersonalDetalle,
} from '@nexo/shared';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/tareasPersonales';

/**
 * Reglas del espacio personal. Las tareas personales son privadas (docs/01, 2.3.8):
 * toda consulta filtra por dueño y una tarea ajena responde 404, sin revelar que existe.
 */

const noEncontrada = () => new ErrorNexo(404, 'tarea_no_encontrada', 'No encontramos esa tarea.');

export function listar(db: BaseDatos, usuarioId: string, filtros: FiltrosTareas) {
  return repo.listarTareas(db, usuarioId, filtros);
}

export function listarEtiquetas(db: BaseDatos, usuarioId: string) {
  return repo.listarEtiquetas(db, usuarioId);
}

async function detalle(
  db: repo.Ejecutor,
  usuarioId: string,
  tareaId: string,
): Promise<TareaPersonalDetalle> {
  const tarea = await repo.obtenerTarea(db, usuarioId, tareaId);
  if (!tarea) throw noEncontrada();
  const [subtareas, comentarios] = await Promise.all([
    repo.listarSubtareas(db, tareaId),
    repo.listarComentarios(db, tareaId),
  ]);
  return { ...tarea, subtareas, comentarios };
}

export function obtener(db: BaseDatos, usuarioId: string, tareaId: string) {
  return detalle(db, usuarioId, tareaId);
}

export function crear(
  db: BaseDatos,
  usuarioId: string,
  datos: CrearTareaPersonal,
): Promise<TareaPersonalDetalle> {
  return db.transaction().execute(async (tx) => {
    const { id } = await tx
      .insertInto('tareas')
      .values({
        dueno_id: usuarioId,
        responsable_id: usuarioId,
        creada_por: usuarioId,
        codigo: 0, // lo asigna el disparador trg_tareas_codigo
        titulo: datos.titulo,
        descripcion: datos.descripcion,
        prioridad: datos.prioridad,
        vence_en: datos.vence_en,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await repo.fijarEtiquetas(tx, usuarioId, id, datos.etiquetas);
    await repo.registrarActividad(tx, usuarioId, 'creada', id, `Creaste «${datos.titulo}»`);
    return detalle(tx, usuarioId, id);
  });
}

export function actualizar(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  datos: ActualizarTareaPersonal,
): Promise<TareaPersonalDetalle> {
  return db.transaction().execute(async (tx) => {
    const actual = await tx
      .selectFrom('tareas')
      .select(['id', 'titulo', 'estado', 'version', 'vence_en', 'progreso'])
      .where('id', '=', tareaId)
      .where('dueno_id', '=', usuarioId)
      .forUpdate()
      .executeTakeFirst();
    if (!actual) throw noEncontrada();
    if (actual.version !== datos.version) {
      throw new ErrorNexo(
        409,
        'conflicto_version',
        'Alguien cambió esta tarea. Recárgala para ver la versión más reciente.',
        { version_actual: actual.version },
      );
    }

    const estado = datos.estado ?? actual.estado;
    const venceEn = datos.vence_en === undefined ? actual.vence_en : datos.vence_en;
    const completaAhora = estado === 'completada' && actual.estado !== 'completada';
    const dejaDeEstarCompleta = estado !== 'completada' && actual.estado === 'completada';

    if (estado === 'completada' && datos.progreso !== undefined && datos.progreso !== 100) {
      throw new ErrorNexo(400, 'validacion', 'Una tarea completada tiene el 100 % de avance.');
    }
    if (estado === 'atascada' && actual.estado !== 'atascada' && !datos.motivo) {
      throw new ErrorNexo(
        400,
        'validacion',
        'Para marcar la tarea como atascada escribe el motivo.',
      );
    }

    const ahora = new Date();
    await tx
      .updateTable('tareas')
      .set({
        // Siempre hay un UPDATE: el disparador incrementa `version` aunque solo cambien etiquetas.
        actualizado_en: ahora,
        ...(datos.titulo !== undefined && { titulo: datos.titulo }),
        ...(datos.descripcion !== undefined && { descripcion: datos.descripcion }),
        ...(datos.prioridad !== undefined && { prioridad: datos.prioridad }),
        ...(datos.vence_en !== undefined && { vence_en: datos.vence_en }),
        ...(datos.archivada !== undefined && { archivada: datos.archivada }),
        ...(datos.progreso !== undefined && { progreso: datos.progreso }),
        ...(datos.estado !== undefined && { estado }),
        ...(datos.estado !== undefined && {
          motivo: estado === 'atascada' ? (datos.motivo ?? undefined) : null,
        }),
        ...(completaAhora && {
          progreso: 100,
          completada_en: ahora,
          resultado:
            venceEn && ahora > new Date(venceEn) ? ('con_retraso' as const) : ('a_tiempo' as const),
        }),
        ...(dejaDeEstarCompleta && { completada_en: null, resultado: null }),
      })
      .where('id', '=', tareaId)
      .execute();

    if (datos.etiquetas !== undefined) {
      await repo.fijarEtiquetas(tx, usuarioId, tareaId, datos.etiquetas);
    }
    if (completaAhora) {
      const titulo = datos.titulo ?? actual.titulo;
      await repo.registrarActividad(
        tx,
        usuarioId,
        'completada',
        tareaId,
        `Completaste «${titulo}»`,
      );
    }
    return detalle(tx, usuarioId, tareaId);
  });
}

export async function eliminar(db: BaseDatos, usuarioId: string, tareaId: string): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const borrada = await tx
      .deleteFrom('tareas')
      .where('id', '=', tareaId)
      .where('dueno_id', '=', usuarioId)
      .returning('titulo')
      .executeTakeFirst();
    if (!borrada) throw noEncontrada();
    await repo.registrarActividad(
      tx,
      usuarioId,
      'eliminada',
      null,
      `Eliminaste «${borrada.titulo}»`,
    );
  });
}

/** Comprueba que la tarea es del usuario antes de tocar sus subtareas o comentarios. */
async function exigirTareaPropia(db: repo.Ejecutor, usuarioId: string, tareaId: string) {
  const tarea = await db
    .selectFrom('tareas')
    .select('id')
    .where('id', '=', tareaId)
    .where('dueno_id', '=', usuarioId)
    .executeTakeFirst();
  if (!tarea) throw noEncontrada();
}

export async function crearSubtarea(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  titulo: string,
): Promise<Subtarea> {
  await exigirTareaPropia(db, usuarioId, tareaId);
  return db
    .insertInto('subtareas')
    .values({ tarea_id: tareaId, titulo })
    .returning(['id', 'titulo', 'hecha'])
    .executeTakeFirstOrThrow();
}

export async function actualizarSubtarea(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  subtareaId: string,
  cambios: { titulo?: string; hecha?: boolean },
): Promise<Subtarea> {
  await exigirTareaPropia(db, usuarioId, tareaId);
  const fila = await db
    .updateTable('subtareas')
    .set(cambios)
    .where('id', '=', subtareaId)
    .where('tarea_id', '=', tareaId)
    .returning(['id', 'titulo', 'hecha'])
    .executeTakeFirst();
  if (!fila) throw new ErrorNexo(404, 'subtarea_no_encontrada', 'No encontramos esa subtarea.');
  return fila;
}

export async function eliminarSubtarea(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  subtareaId: string,
): Promise<void> {
  await exigirTareaPropia(db, usuarioId, tareaId);
  const r = await db
    .deleteFrom('subtareas')
    .where('id', '=', subtareaId)
    .where('tarea_id', '=', tareaId)
    .executeTakeFirst();
  if (r.numDeletedRows === 0n) {
    throw new ErrorNexo(404, 'subtarea_no_encontrada', 'No encontramos esa subtarea.');
  }
}

export async function comentar(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  texto: string,
): Promise<ComentarioTarea> {
  await exigirTareaPropia(db, usuarioId, tareaId);
  const c = await db
    .insertInto('comentarios_tarea')
    .values({ tarea_id: tareaId, autor_id: usuarioId, texto })
    .returning(['id', 'texto', 'autor_id', 'creado_en', 'editado_en'])
    .executeTakeFirstOrThrow();
  return { ...c, creado_en: c.creado_en.toISOString(), editado_en: null };
}

export async function eliminarComentario(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  comentarioId: string,
): Promise<void> {
  await exigirTareaPropia(db, usuarioId, tareaId);
  const r = await db
    .deleteFrom('comentarios_tarea')
    .where('id', '=', comentarioId)
    .where('tarea_id', '=', tareaId)
    .where('autor_id', '=', usuarioId)
    .executeTakeFirst();
  if (r.numDeletedRows === 0n) {
    throw new ErrorNexo(404, 'comentario_no_encontrado', 'No encontramos ese comentario.');
  }
}
