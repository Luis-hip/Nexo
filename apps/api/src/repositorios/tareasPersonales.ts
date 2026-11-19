import {
  esquemaComentarioTarea,
  esquemaSubtarea,
  esquemaTareaPersonal,
  esquemaTareaPersonalDetalle,
  type ActualizarTareaPersonal,
  type CrearTareaPersonal,
  type FiltrosTareas,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Espacio personal. Cada función llama a un proceso de la BD documentado en
 * docs/08_Procesos_BD.md (migración 0007). La privacidad la garantiza el proceso: filtra por
 * dueño y una tarea ajena responde 404 (DEC-014).
 */

const hecho = (clave: 'eliminada' | 'eliminado') => z.object({ [clave]: z.boolean() });

/** `proc_personal_tarea_listar`. */
export function listar(db: Ejecutor, actorId: string, filtros: FiltrosTareas) {
  return llamarProceso(
    db,
    'proc_personal_tarea_listar',
    [actorId, json(filtros)],
    z.array(esquemaTareaPersonal),
  );
}

/** `proc_personal_tarea_obtener`. */
export function obtener(db: Ejecutor, actorId: string, tareaId: string) {
  return llamarProceso(
    db,
    'proc_personal_tarea_obtener',
    [actorId, tareaId],
    esquemaTareaPersonalDetalle,
  );
}

/** `proc_personal_tarea_crear`. */
export function crear(db: Ejecutor, actorId: string, datos: CrearTareaPersonal) {
  return llamarProceso(
    db,
    'proc_personal_tarea_crear',
    [actorId, json(datos)],
    esquemaTareaPersonalDetalle,
  );
}

/** `proc_personal_tarea_actualizar`: `datos` lleva `version` y solo los campos que cambian. */
export function actualizar(
  db: Ejecutor,
  actorId: string,
  tareaId: string,
  datos: ActualizarTareaPersonal,
) {
  return llamarProceso(
    db,
    'proc_personal_tarea_actualizar',
    [actorId, tareaId, json(datos)],
    esquemaTareaPersonalDetalle,
  );
}

/** `proc_personal_tarea_eliminar`. */
export function eliminar(db: Ejecutor, actorId: string, tareaId: string) {
  return llamarProceso(db, 'proc_personal_tarea_eliminar', [actorId, tareaId], hecho('eliminada'));
}

/** `proc_personal_subtarea_crear`. */
export function crearSubtarea(db: Ejecutor, actorId: string, tareaId: string, titulo: string) {
  return llamarProceso(
    db,
    'proc_personal_subtarea_crear',
    [actorId, tareaId, titulo],
    esquemaSubtarea,
  );
}

/** `proc_personal_subtarea_actualizar`. */
export function actualizarSubtarea(
  db: Ejecutor,
  actorId: string,
  tareaId: string,
  subtareaId: string,
  cambios: { titulo?: string; hecha?: boolean },
) {
  return llamarProceso(
    db,
    'proc_personal_subtarea_actualizar',
    [actorId, tareaId, subtareaId, json(cambios)],
    esquemaSubtarea,
  );
}

/** `proc_personal_subtarea_eliminar`. */
export function eliminarSubtarea(
  db: Ejecutor,
  actorId: string,
  tareaId: string,
  subtareaId: string,
) {
  return llamarProceso(
    db,
    'proc_personal_subtarea_eliminar',
    [actorId, tareaId, subtareaId],
    hecho('eliminada'),
  );
}

/** `proc_personal_comentario_crear`. */
export function comentar(db: Ejecutor, actorId: string, tareaId: string, texto: string) {
  return llamarProceso(
    db,
    'proc_personal_comentario_crear',
    [actorId, tareaId, texto],
    esquemaComentarioTarea,
  );
}

/** `proc_personal_comentario_eliminar`. */
export function eliminarComentario(
  db: Ejecutor,
  actorId: string,
  tareaId: string,
  comentarioId: string,
) {
  return llamarProceso(
    db,
    'proc_personal_comentario_eliminar',
    [actorId, tareaId, comentarioId],
    hecho('eliminado'),
  );
}

/** `proc_personal_etiquetas`. */
export function etiquetas(db: Ejecutor, actorId: string) {
  return llamarProceso(db, 'proc_personal_etiquetas', [actorId], z.array(z.string()));
}
