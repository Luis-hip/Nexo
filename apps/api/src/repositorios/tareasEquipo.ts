import {
  esquemaComentarioEquipo,
  esquemaConteosTareas,
  esquemaSubtarea,
  esquemaTareaEquipo,
  esquemaTareaEquipoDetalleBd,
  type EditarTareaEquipo,
  type MoverTarea,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Tareas de equipo. Cada función llama a un proceso de la BD documentado en
 * docs/08_Procesos_BD.md (migración 0006); la votación está en `votacion.ts` (migración 0003).
 * Los procesos que cambian una tarea devuelven su detalle ya actualizado.
 */

/**
 * - `votacion`: propuestas abiertas y las que no prosperaron (rechazadas o retiradas), para reformular.
 * - `mias`: lo que toca a quien consulta en la votación: propuestas abiertas y las que ya votó (FALT-08).
 */
export type VistaTareas = 'tablero' | 'backlog' | 'votacion' | 'mias' | 'todas';

const eliminada = z.object({ eliminada: z.boolean() });
const eliminado = z.object({ eliminado: z.boolean() });

/** `proc_tarea_listar`. */
export function listar(db: Ejecutor, actorId: string, equipoId: string, vista: VistaTareas) {
  return llamarProceso(
    db,
    'proc_tarea_listar',
    [actorId, equipoId, vista],
    z.array(esquemaTareaEquipo),
  );
}

/** `proc_tarea_conteos`. */
export function conteos(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_tarea_conteos', [actorId, equipoId], esquemaConteosTareas);
}

/** `proc_tarea_obtener`. */
export function obtener(db: Ejecutor, actorId: string, equipoId: string, tareaId: string) {
  return llamarProceso(
    db,
    'proc_tarea_obtener',
    [actorId, equipoId, tareaId],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_tarea_editar`: `cambios` lleva solo los campos que cambian (y `etiquetas`, si cambian). */
export function editar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  { version, ...cambios }: EditarTareaEquipo,
) {
  return llamarProceso(
    db,
    'proc_tarea_editar',
    [actorId, equipoId, tareaId, version, json(cambios)],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_tarea_eliminar`. */
export function eliminar(db: Ejecutor, actorId: string, equipoId: string, tareaId: string) {
  return llamarProceso(db, 'proc_tarea_eliminar', [actorId, equipoId, tareaId], eliminada);
}

/** `proc_tarea_cambiar_estado`. */
export function cambiarEstado(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  datos: { version: number; estado: string; motivo?: string },
) {
  return llamarProceso(
    db,
    'proc_tarea_cambiar_estado',
    [actorId, equipoId, tareaId, datos.version, datos.estado, datos.motivo ?? null],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_tarea_mover`: «mover la tarea entre A y B». */
export function mover(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  datos: MoverTarea,
) {
  return llamarProceso(
    db,
    'proc_tarea_mover',
    [
      actorId,
      equipoId,
      tareaId,
      datos.version,
      datos.antes_id,
      datos.despues_id,
      datos.estado ?? null,
      datos.motivo ?? null,
    ],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_tarea_asignar`. */
export function asignar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  datos: { version: number; responsable_id: string | null },
) {
  return llamarProceso(
    db,
    'proc_tarea_asignar',
    [actorId, equipoId, tareaId, datos.version, datos.responsable_id],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_tarea_responder_asignacion`. */
export function responderAsignacion(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  datos: { acepta: boolean; motivo?: string },
) {
  return llamarProceso(
    db,
    'proc_tarea_responder_asignacion',
    [actorId, equipoId, tareaId, datos.acepta, datos.motivo ?? null],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_tarea_compartir`. */
export function compartir(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  membresiaIds: string[],
) {
  return llamarProceso(
    db,
    'proc_tarea_compartir',
    [actorId, equipoId, tareaId, membresiaIds],
    esquemaTareaEquipoDetalleBd,
  );
}

/** `proc_subtarea_crear`. */
export function crearSubtarea(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  titulo: string,
) {
  return llamarProceso(
    db,
    'proc_subtarea_crear',
    [actorId, equipoId, tareaId, titulo],
    esquemaSubtarea,
  );
}

/** `proc_subtarea_actualizar`. */
export function actualizarSubtarea(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  subtareaId: string,
  cambios: { titulo?: string; hecha?: boolean },
) {
  return llamarProceso(
    db,
    'proc_subtarea_actualizar',
    [actorId, equipoId, tareaId, subtareaId, json(cambios)],
    esquemaSubtarea,
  );
}

/** `proc_subtarea_eliminar`. */
export function eliminarSubtarea(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  subtareaId: string,
) {
  return llamarProceso(
    db,
    'proc_subtarea_eliminar',
    [actorId, equipoId, tareaId, subtareaId],
    eliminada,
  );
}

/** `proc_comentario_crear`. */
export function comentar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  texto: string,
) {
  return llamarProceso(
    db,
    'proc_comentario_crear',
    [actorId, equipoId, tareaId, texto],
    esquemaComentarioEquipo,
  );
}

/** `proc_comentario_eliminar`. */
export function eliminarComentario(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  comentarioId: string,
) {
  return llamarProceso(
    db,
    'proc_comentario_eliminar',
    [actorId, equipoId, tareaId, comentarioId],
    eliminado,
  );
}
