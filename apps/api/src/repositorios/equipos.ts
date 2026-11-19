import {
  esquemaContextoEquipo,
  esquemaEquipoDetalle,
  esquemaInvitacion,
  esquemaInvitacionAceptada,
  esquemaMiembro,
  esquemaVistaInvitacion,
  type CrearEquipo,
  type CrearInvitacion,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Equipos, miembros e invitaciones. Cada función llama a un proceso de la BD documentado en
 * docs/08_Procesos_BD.md (migración 0005).
 */

/** `proc_equipo_contexto`: membresía activa del actor en el equipo (404 si no pertenece). */
export function contexto(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_equipo_contexto', [actorId, equipoId], esquemaContextoEquipo);
}

/** `proc_equipo_crear`: quien lo crea queda como líder. */
export function crear(db: Ejecutor, actorId: string, datos: CrearEquipo) {
  return llamarProceso(
    db,
    'proc_equipo_crear',
    [actorId, json(datos)],
    z.object({ id: z.string() }),
  );
}

/** `proc_equipo_obtener`: datos del equipo según el perfil de quien consulta. */
export function obtener(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_equipo_obtener', [actorId, equipoId], esquemaEquipoDetalle);
}

/** `proc_equipo_miembros`. */
export function miembros(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_equipo_miembros', [actorId, equipoId], z.array(esquemaMiembro));
}

/** `proc_invitacion_crear`. */
export function crearInvitacion(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  datos: CrearInvitacion,
) {
  return llamarProceso(
    db,
    'proc_invitacion_crear',
    [actorId, equipoId, json(datos)],
    esquemaInvitacion,
  );
}

/** `proc_invitacion_listar`. */
export function listarInvitaciones(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(
    db,
    'proc_invitacion_listar',
    [actorId, equipoId],
    z.array(esquemaInvitacion),
  );
}

/** `proc_invitacion_revocar`. */
export function revocarInvitacion(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  invitacionId: string,
) {
  return llamarProceso(
    db,
    'proc_invitacion_revocar',
    [actorId, equipoId, invitacionId],
    esquemaInvitacion,
  );
}

/** `proc_invitacion_ver`: vista previa de una invitación por su código ya normalizado. */
export function verInvitacion(db: Ejecutor, actorId: string, codigo: string) {
  return llamarProceso(db, 'proc_invitacion_ver', [actorId, codigo], esquemaVistaInvitacion);
}

/** `proc_invitacion_aceptar`: unirse al equipo con un código ya normalizado. */
export function aceptarInvitacion(db: Ejecutor, actorId: string, codigo: string) {
  return llamarProceso(db, 'proc_invitacion_aceptar', [actorId, codigo], esquemaInvitacionAceptada);
}
