import {
  esquemaRefTarea,
  esquemaResultadoVotoRetro,
  esquemaRetrospectiva,
  esquemaSprint,
  esquemaSprintDetalle,
  esquemaTareaEquipo,
  type CrearNotaRetro,
  type DestinoPendientes,
  type FaseRetro,
  type PlanearSprint,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Sprints y retrospectiva (Fase 3.3, DEC-031). Cada función llama a un proceso de la BD de la
 * migración 0009, documentado en docs/08_Procesos_BD.md; las reglas viven allí.
 */

// --- Sprints -----------------------------------------------------------------------------------

/** `proc_sprint_listar`: todos los sprints del equipo, del más reciente al más antiguo. */
export function listarSprints(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_sprint_listar', [actorId, equipoId], z.array(esquemaSprint));
}

/** `proc_sprint_obtener`: detalle de un sprint; sin `sprintId`, el activo (o `null`). */
export function obtenerSprint(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  sprintId: string | null,
) {
  return llamarProceso(
    db,
    'proc_sprint_obtener',
    [actorId, equipoId, sprintId],
    esquemaSprintDetalle.nullable(),
  );
}

/** `proc_sprint_disponibles`: tareas que pueden entrar a un sprint al planearlo. */
export function disponibles(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(
    db,
    'proc_sprint_disponibles',
    [actorId, equipoId],
    z.array(esquemaTareaEquipo),
  );
}

/** `proc_sprint_planear`: crea un sprint planificado (`sprintId` nulo) o cambia su plan. */
export function planear(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  sprintId: string | null,
  datos: PlanearSprint,
) {
  return llamarProceso(
    db,
    'proc_sprint_planear',
    [actorId, equipoId, sprintId, json(datos)],
    esquemaSprintDetalle,
  );
}

/** `proc_sprint_iniciar`: inicia un sprint planificado (uno activo por equipo). */
export function iniciar(db: Ejecutor, actorId: string, equipoId: string, sprintId: string) {
  return llamarProceso(
    db,
    'proc_sprint_iniciar',
    [actorId, equipoId, sprintId],
    esquemaSprintDetalle,
  );
}

/** `proc_sprint_cerrar`: cierra el sprint activo con su instantánea y crea la retrospectiva. */
export function cerrar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  sprintId: string,
  pendientes: DestinoPendientes,
) {
  return llamarProceso(
    db,
    'proc_sprint_cerrar',
    [actorId, equipoId, sprintId, pendientes],
    esquemaSprintDetalle,
  );
}

/** `proc_sprint_eliminar`: borra un sprint planificado. */
export function eliminar(db: Ejecutor, actorId: string, equipoId: string, sprintId: string) {
  return llamarProceso(
    db,
    'proc_sprint_eliminar',
    [actorId, equipoId, sprintId],
    z.object({ eliminado: z.literal(true) }),
  );
}

// --- Retrospectiva -----------------------------------------------------------------------------

/** `proc_retro_iniciar`: el líder abre la retrospectiva de un sprint cerrado. */
export function iniciarRetro(db: Ejecutor, actorId: string, equipoId: string, sprintId: string) {
  return llamarProceso(
    db,
    'proc_retro_iniciar',
    [actorId, equipoId, sprintId],
    esquemaRetrospectiva,
  );
}

/** `proc_retro_obtener`: retrospectiva del sprint con sus notas, o `null`. */
export function obtenerRetro(db: Ejecutor, actorId: string, equipoId: string, sprintId: string) {
  return llamarProceso(
    db,
    'proc_retro_obtener',
    [actorId, equipoId, sprintId],
    esquemaRetrospectiva.nullable(),
  );
}

/** `proc_retro_nota_agregar`: nota nueva (anónima si así se pide). */
export function agregarNota(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  sprintId: string,
  { columna, texto, anonima }: CrearNotaRetro,
) {
  return llamarProceso(
    db,
    'proc_retro_nota_agregar',
    [actorId, equipoId, sprintId, columna, texto, anonima],
    z.object({ id: z.string() }),
  );
}

/** `proc_retro_nota_eliminar`: su autora o el líder borran una nota. */
export function eliminarNota(db: Ejecutor, actorId: string, equipoId: string, notaId: string) {
  return llamarProceso(
    db,
    'proc_retro_nota_eliminar',
    [actorId, equipoId, notaId],
    z.object({ eliminada: z.literal(true) }),
  );
}

/** `proc_retro_votar`: pone o quita un punto de voto (3 por persona; el cuarto da NX003). */
export function votarNota(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  notaId: string,
  dar: boolean,
) {
  return llamarProceso(
    db,
    'proc_retro_votar',
    [actorId, equipoId, notaId, dar],
    esquemaResultadoVotoRetro,
  );
}

/** `proc_retro_avanzar`: el líder cierra la votación o la retrospectiva. */
export function avanzarRetro(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  sprintId: string,
  fase: FaseRetro,
) {
  return llamarProceso(
    db,
    'proc_retro_avanzar',
    [actorId, equipoId, sprintId, fase],
    esquemaRetrospectiva,
  );
}

/** `proc_retro_nota_a_tarea`: el líder convierte una nota en propuesta de tarea. */
export function notaATarea(db: Ejecutor, actorId: string, equipoId: string, notaId: string) {
  return llamarProceso(db, 'proc_retro_nota_a_tarea', [actorId, equipoId, notaId], esquemaRefTarea);
}
