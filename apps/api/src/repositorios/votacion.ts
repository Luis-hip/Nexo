import {
  esquemaRefTarea,
  esquemaResumenVotacion,
  type CrearTareaEquipo,
  type ResumenVotacion,
  type Votar,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Votación de propuestas (DEC-024). Cada función llama a un proceso de la BD documentado en
 * docs/08_Procesos_BD.md; las reglas (quién vota, la mayoría, los eventos) viven allí.
 */

/** `proc_tarea_proponer`: el líder propone una tarea con sus subtareas. */
export function proponer(db: Ejecutor, actorId: string, equipoId: string, datos: CrearTareaEquipo) {
  return llamarProceso(
    db,
    'proc_tarea_proponer',
    [actorId, equipoId, json(datos)],
    esquemaRefTarea,
  );
}

/** `proc_tarea_votar`: un integrante vota o cambia su voto; puede cerrar la votación. */
export function votar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  { voto, comentario }: Votar,
) {
  return llamarProceso(
    db,
    'proc_tarea_votar',
    [actorId, equipoId, tareaId, voto, comentario ?? null],
    esquemaResumenVotacion.extend({ estado: z.string() }),
  );
}

/** `proc_tarea_retirar`: el líder retira una propuesta que sigue en votación. */
export function retirar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  version: number,
) {
  return llamarProceso(
    db,
    'proc_tarea_retirar',
    [actorId, equipoId, tareaId, version],
    esquemaRefTarea,
  );
}

/** `proc_tarea_reformular`: propuesta nueva a partir de una rechazada o retirada. */
export function reformular(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaId: string,
  datos: CrearTareaEquipo,
) {
  return llamarProceso(
    db,
    'proc_tarea_reformular',
    [actorId, equipoId, tareaId, json(datos)],
    esquemaRefTarea,
  );
}

/** `proc_tarea_votacion`: resumen de la votación de una tarea para quien consulta (V-8). */
export function resumen(db: Ejecutor, actorId: string, equipoId: string, tareaId: string) {
  return llamarProceso(
    db,
    'proc_tarea_votacion',
    [actorId, equipoId, tareaId],
    esquemaResumenVotacion,
  );
}

/** `proc_tarea_votaciones`: resúmenes de varias tareas, por id. */
export async function resumenes(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  tareaIds: string[],
): Promise<Map<string, ResumenVotacion>> {
  if (tareaIds.length === 0) return new Map();
  const porId = await llamarProceso(
    db,
    'proc_tarea_votaciones',
    [actorId, equipoId, tareaIds],
    z.record(z.string(), esquemaResumenVotacion),
  );
  return new Map(Object.entries(porId));
}
