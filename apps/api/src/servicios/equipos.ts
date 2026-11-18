import {
  normalizarCodigoInvitacion,
  type CrearEquipo,
  type CrearInvitacion,
  type EquipoDetalle,
  type Invitacion,
  type Miembro,
  type VistaInvitacion,
} from '@nexo/shared';
import type { BaseDatos } from '../db/conexion';
import type { ContextoEquipo } from '../equipos/contexto';
import * as repo from '../repositorios/equipos';

/**
 * Equipos, miembros e invitaciones. Desde la Fase 2.5 (DEC-025) las reglas viven en los
 * procesos de la BD (docs/08): aquí no hay SQL, solo la llamada a cada proceso.
 */

/** PER-06: crea el equipo; quien lo crea es su líder. */
export function crearEquipo(
  db: BaseDatos,
  usuario: { id: string },
  datos: CrearEquipo,
): Promise<{ id: string }> {
  return repo.crear(db, usuario.id, datos);
}

export function listarMiembros(db: BaseDatos, ctx: ContextoEquipo): Promise<Miembro[]> {
  return repo.miembros(db, ctx.usuarioId, ctx.equipoId);
}

/** Datos del equipo según el perfil: un invitado no recibe miembros ni sprints. */
export function obtenerEquipo(db: BaseDatos, ctx: ContextoEquipo): Promise<EquipoDetalle> {
  return repo.obtener(db, ctx.usuarioId, ctx.equipoId);
}

/** AD-02 / AD-03: el líder genera un código (y enlace) para integrante o invitado. */
export function crearInvitacion(
  db: BaseDatos,
  ctx: ContextoEquipo,
  datos: CrearInvitacion,
): Promise<Invitacion> {
  return repo.crearInvitacion(db, ctx.usuarioId, ctx.equipoId, datos);
}

export function listarInvitaciones(db: BaseDatos, ctx: ContextoEquipo): Promise<Invitacion[]> {
  return repo.listarInvitaciones(db, ctx.usuarioId, ctx.equipoId);
}

export function revocarInvitacion(
  db: BaseDatos,
  ctx: ContextoEquipo,
  invitacionId: string,
): Promise<Invitacion> {
  return repo.revocarInvitacion(db, ctx.usuarioId, ctx.equipoId, invitacionId);
}

/** PER-07 / AUTH-08: vista previa antes de unirse. Admite el código o el enlace completo. */
export function verInvitacion(
  db: BaseDatos,
  usuarioId: string,
  entrada: string,
): Promise<VistaInvitacion> {
  return repo.verInvitacion(db, usuarioId, normalizarCodigoInvitacion(entrada));
}

/**
 * Unirse con un código. El tope de miembros lo hace cumplir la BD (NX001) y la invitación, de
 * un solo uso, se marca en la misma transacción (`proc_invitacion_aceptar`).
 */
export function aceptarInvitacion(
  db: BaseDatos,
  usuario: { id: string },
  entrada: string,
): Promise<{ equipo_id: string; rol: 'integrante' | 'invitado' }> {
  return repo.aceptarInvitacion(db, usuario.id, normalizarCodigoInvitacion(entrada));
}
