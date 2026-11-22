import {
  esquemaPreferenciasCompletas,
  esquemaSesionResuelta,
  esquemaUsuarioDev,
  esquemaUsuarioSesion,
  esquemaYoBd,
  type CambiosPerfil,
  type CambiosPreferencias,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Cuenta, sesiones, preferencias y contacto. Cada función llama a un proceso de la BD
 * documentado en docs/08_Procesos_BD.md (migración 0004).
 */

/** `proc_sesion_resolver`: sesión vigente a partir del hash del token de la cookie, o `null`. */
export function resolverSesion(db: Ejecutor, tokenHash: Buffer) {
  return llamarProceso(db, 'proc_sesion_resolver', [tokenHash], esquemaSesionResuelta);
}

/** `proc_sesion_revocar`: cierra una sesión del actor. */
export function revocarSesion(db: Ejecutor, actorId: string, sesionId: string) {
  return llamarProceso(
    db,
    'proc_sesion_revocar',
    [actorId, sesionId],
    z.object({ revocada: z.boolean() }),
  );
}

/** `proc_dev_usuarios`: usuarios de la semilla (solo acceso de desarrollo). */
export function usuariosDev(db: Ejecutor) {
  return llamarProceso(db, 'proc_dev_usuarios', [], z.array(esquemaUsuarioDev));
}

/** `proc_dev_sesion_crear`: sesión real para un usuario de la semilla (solo desarrollo y CI). */
export function crearSesionDev(
  db: Ejecutor,
  datos: { correo: string; tokenHash: Buffer; ip: string; expiraEn: Date },
) {
  return llamarProceso(
    db,
    'proc_dev_sesion_crear',
    [datos.correo, datos.tokenHash, datos.ip, datos.expiraEn.toISOString()],
    z.object({ usuario: z.object({ id: z.string(), correo: z.string(), nombre: z.string() }) }),
  );
}

/** `proc_usuario_yo`: equipos activos de la persona y sus preferencias. */
export function yo(db: Ejecutor, actorId: string) {
  return llamarProceso(db, 'proc_usuario_yo', [actorId], esquemaYoBd);
}

/** `proc_usuario_preferencias_guardar`. */
export function guardarPreferencias(db: Ejecutor, actorId: string, cambios: CambiosPreferencias) {
  return llamarProceso(
    db,
    'proc_usuario_preferencias_guardar',
    [actorId, json(cambios)],
    esquemaPreferenciasCompletas,
  );
}

/** `proc_usuario_perfil_guardar`. */
export function guardarPerfil(db: Ejecutor, actorId: string, cambios: CambiosPerfil) {
  return llamarProceso(
    db,
    'proc_usuario_perfil_guardar',
    [actorId, json(cambios)],
    esquemaUsuarioSesion,
  );
}
