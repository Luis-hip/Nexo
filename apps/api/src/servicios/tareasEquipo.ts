import {
  comprobarTransicion,
  puede,
  transicionesValidas,
  type CambiarEstado,
  type ComentarioEquipo,
  type ConteosTareas,
  type CrearTareaEquipo,
  type EditarTareaEquipo,
  type EstadoTarea,
  type MoverTarea,
  type Subtarea,
  type TareaEquipo,
  type TareaEquipoDetalle,
  type TareaEquipoDetalleBd,
  type Votar,
} from '@nexo/shared';
import type { BaseDatos } from '../db/conexion';
import type { ContextoEquipo } from '../equipos/contexto';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/tareasEquipo';
import * as repoVotacion from '../repositorios/votacion';

/**
 * Tareas de equipo. Desde la Fase 2.5 (DEC-025) las reglas de datos viven en los procesos de la
 * BD (docs/08): aquí no hay SQL. Este servicio solo:
 * - llama al proceso de cada operación a través de `repositorios/`,
 * - agrega al detalle las `transiciones` que la persona puede hacer, y
 * - antes de cambiar un estado comprueba el permiso de la matriz y la máquina de estados de
 *   `packages/shared` para responder con el motivo exacto en español. El proceso vuelve a
 *   comprobarlo todo dentro de su transacción (defensa en profundidad).
 */

/** Quien hace la acción. */
export interface Actor {
  id: string;
  nombre: string;
}

const sinPermiso = (motivo: string) => new ErrorNexo(403, 'sin_permiso', motivo);

/** Agrega al detalle los estados a los que quien consulta puede mover la tarea ahora. */
function conTransiciones(ctx: ContextoEquipo, t: TareaEquipoDetalleBd): TareaEquipoDetalle {
  return {
    ...t,
    transiciones: transicionesValidas(
      {
        estado: t.estado,
        responsable_id: t.responsable?.usuario_id ?? null,
        asignacion_pendiente: t.asignacion_pendiente,
      },
      ctx.rol,
      ctx.usuarioId,
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------

export function listar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  vista: repo.VistaTareas,
): Promise<TareaEquipo[]> {
  return repo.listar(db, ctx.usuarioId, ctx.equipoId, vista);
}

export function contar(db: BaseDatos, ctx: ContextoEquipo): Promise<ConteosTareas> {
  return repo.conteos(db, ctx.usuarioId, ctx.equipoId);
}

export async function obtener(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
): Promise<TareaEquipoDetalle> {
  return conTransiciones(ctx, await repo.obtener(db, ctx.usuarioId, ctx.equipoId, tareaId));
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
  return obtener(db, ctx, id);
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
  return obtener(db, ctx, tareaId);
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
  return obtener(db, ctx, tareaId);
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
  return obtener(db, ctx, id);
}

// ---------------------------------------------------------------------------------------------
// Editar y eliminar
// ---------------------------------------------------------------------------------------------

/**
 * El líder edita cualquier tarea; un integrante solo actualiza el avance de **su** tarea
 * (lo decide `proc_tarea_editar`).
 */
export async function editar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: EditarTareaEquipo,
): Promise<TareaEquipoDetalle> {
  return conTransiciones(ctx, await repo.editar(db, actor.id, ctx.equipoId, tareaId, datos));
}

export async function eliminar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
): Promise<void> {
  await repo.eliminar(db, actor.id, ctx.equipoId, tareaId);
}

// ---------------------------------------------------------------------------------------------
// Estados y tablero (EQ-02)
// ---------------------------------------------------------------------------------------------

/**
 * Permiso de la matriz y, si se pide, la versión: quien no puede mover la tarea recibe 403 y
 * quien llega con una versión vieja, 409 (el permiso se comprueba antes que la versión).
 */
function exigirPermisoYVersion(ctx: ContextoEquipo, t: TareaEquipoDetalleBd, version?: number) {
  const permiso = puede('cambiar_estado_tarea', {
    perfil: ctx.rol,
    esPropio: t.responsable?.usuario_id === ctx.usuarioId,
  });
  if (!permiso.permitido) throw sinPermiso(permiso.motivo);
  if (version !== undefined && t.version !== version) {
    throw new ErrorNexo(
      409,
      'conflicto_version',
      'Alguien cambió esta tarea. Recárgala para ver la versión más reciente.',
      { version_actual: t.version },
    );
  }
}

/** Valida la transición con la máquina de estados compartida; si no es válida, 422 con el motivo. */
function exigirTransicion(ctx: ContextoEquipo, t: TareaEquipoDetalleBd, destino: EstadoTarea) {
  const r = comprobarTransicion(
    {
      estado: t.estado,
      responsable_id: t.responsable?.usuario_id ?? null,
      asignacion_pendiente: t.asignacion_pendiente,
    },
    destino,
    ctx.rol,
    ctx.usuarioId,
  );
  if (!r.valida) throw new ErrorNexo(422, 'transicion_invalida', r.motivo);
}

export async function cambiarEstado(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: CambiarEstado,
): Promise<TareaEquipoDetalle> {
  const t = await repo.obtener(db, actor.id, ctx.equipoId, tareaId);
  exigirPermisoYVersion(ctx, t, datos.version);
  exigirTransicion(ctx, t, datos.estado);
  return conTransiciones(ctx, await repo.cambiarEstado(db, actor.id, ctx.equipoId, tareaId, datos));
}

/**
 * Arrastrar y soltar: «mover la tarea entre A y B». El proceso calcula el nuevo orden (índice
 * fraccionario) y, si cambia de columna, aplica la transición de estado.
 */
export async function mover(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: MoverTarea,
): Promise<TareaEquipoDetalle> {
  const t = await repo.obtener(db, actor.id, ctx.equipoId, tareaId);
  // Permiso sobre la tarea, después la versión y por último qué movimiento es: si otra persona
  // ya la movió, quien llega tarde recibe 409 y no un error que no entendería.
  exigirPermisoYVersion(ctx, t, datos.version);
  const destino = datos.estado ?? t.estado;
  if (destino !== t.estado) {
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
  return conTransiciones(ctx, await repo.mover(db, actor.id, ctx.equipoId, tareaId, datos));
}

// ---------------------------------------------------------------------------------------------
// Asignación (EQ-08) y compartir
// ---------------------------------------------------------------------------------------------

/** El líder asigna (o quita) al responsable; el asignado debe aceptar. */
export async function asignar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: { version: number; responsable_id: string | null },
): Promise<TareaEquipoDetalle> {
  return conTransiciones(ctx, await repo.asignar(db, actor.id, ctx.equipoId, tareaId, datos));
}

/**
 * El responsable acepta la asignación o la rechaza con motivo. Si la rechaza, la tarea conserva
 * su estado y queda sin responsable para que el líder la **reasigne directamente**, sin nueva
 * votación (V-11, por confirmar).
 */
export async function responderAsignacion(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  datos: { acepta: boolean; motivo?: string },
): Promise<TareaEquipoDetalle> {
  return conTransiciones(
    ctx,
    await repo.responderAsignacion(db, actor.id, ctx.equipoId, tareaId, datos),
  );
}

/** El líder elige qué invitados ven la tarea. */
export async function compartir(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  membresiaIds: string[],
): Promise<TareaEquipoDetalle> {
  return conTransiciones(
    ctx,
    await repo.compartir(db, actor.id, ctx.equipoId, tareaId, membresiaIds),
  );
}

// ---------------------------------------------------------------------------------------------
// Subtareas y comentarios
// ---------------------------------------------------------------------------------------------

export function crearSubtarea(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  titulo: string,
): Promise<Subtarea> {
  return repo.crearSubtarea(db, ctx.usuarioId, ctx.equipoId, tareaId, titulo);
}

export function actualizarSubtarea(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  subtareaId: string,
  cambios: { titulo?: string; hecha?: boolean },
): Promise<Subtarea> {
  return repo.actualizarSubtarea(db, ctx.usuarioId, ctx.equipoId, tareaId, subtareaId, cambios);
}

export async function eliminarSubtarea(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  subtareaId: string,
): Promise<void> {
  await repo.eliminarSubtarea(db, ctx.usuarioId, ctx.equipoId, tareaId, subtareaId);
}

/** Comentan el líder, los integrantes y los invitados con la tarea compartida. */
export function comentar(
  db: BaseDatos,
  ctx: ContextoEquipo,
  actor: Actor,
  tareaId: string,
  texto: string,
): Promise<ComentarioEquipo> {
  return repo.comentar(db, actor.id, ctx.equipoId, tareaId, texto);
}

/** Cada quien borra sus comentarios; el líder, además, los ajenos. */
export async function eliminarComentario(
  db: BaseDatos,
  ctx: ContextoEquipo,
  tareaId: string,
  comentarioId: string,
): Promise<void> {
  await repo.eliminarComentario(db, ctx.usuarioId, ctx.equipoId, tareaId, comentarioId);
}

export type { TareaEquipo };
