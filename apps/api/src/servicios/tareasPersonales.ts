import type {
  ActualizarTareaPersonal,
  ComentarioTarea,
  CrearTareaPersonal,
  FiltrosTareas,
  Subtarea,
  TareaPersonal,
  TareaPersonalDetalle,
} from '@nexo/shared';
import type { BaseDatos } from '../db/conexion';
import * as repo from '../repositorios/tareasPersonales';

/**
 * Espacio personal. Las tareas personales son privadas (docs/01, 2.3.8): los procesos de la BD
 * filtran por dueño y una tarea ajena responde 404, sin revelar que existe (DEC-014).
 * Desde la Fase 2.5 (DEC-025) las reglas viven en esos procesos (docs/08): aquí no hay SQL.
 */

export function listar(
  db: BaseDatos,
  usuarioId: string,
  filtros: FiltrosTareas,
): Promise<TareaPersonal[]> {
  return repo.listar(db, usuarioId, filtros);
}

export function listarEtiquetas(db: BaseDatos, usuarioId: string): Promise<string[]> {
  return repo.etiquetas(db, usuarioId);
}

export function obtener(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
): Promise<TareaPersonalDetalle> {
  return repo.obtener(db, usuarioId, tareaId);
}

export function crear(
  db: BaseDatos,
  usuarioId: string,
  datos: CrearTareaPersonal,
): Promise<TareaPersonalDetalle> {
  return repo.crear(db, usuarioId, datos);
}

export function actualizar(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  datos: ActualizarTareaPersonal,
): Promise<TareaPersonalDetalle> {
  return repo.actualizar(db, usuarioId, tareaId, datos);
}

export async function eliminar(db: BaseDatos, usuarioId: string, tareaId: string): Promise<void> {
  await repo.eliminar(db, usuarioId, tareaId);
}

export function crearSubtarea(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  titulo: string,
): Promise<Subtarea> {
  return repo.crearSubtarea(db, usuarioId, tareaId, titulo);
}

export function actualizarSubtarea(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  subtareaId: string,
  cambios: { titulo?: string; hecha?: boolean },
): Promise<Subtarea> {
  return repo.actualizarSubtarea(db, usuarioId, tareaId, subtareaId, cambios);
}

export async function eliminarSubtarea(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  subtareaId: string,
): Promise<void> {
  await repo.eliminarSubtarea(db, usuarioId, tareaId, subtareaId);
}

export function comentar(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  texto: string,
): Promise<ComentarioTarea> {
  return repo.comentar(db, usuarioId, tareaId, texto);
}

export async function eliminarComentario(
  db: BaseDatos,
  usuarioId: string,
  tareaId: string,
  comentarioId: string,
): Promise<void> {
  await repo.eliminarComentario(db, usuarioId, tareaId, comentarioId);
}
