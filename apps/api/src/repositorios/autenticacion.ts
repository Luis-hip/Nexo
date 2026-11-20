import {
  esquemaAuthCredenciales,
  esquemaAuthDestinatario,
  esquemaAuthEntrar,
  esquemaAuthUsuario,
  esquemaAuthVerificacion,
  esquemaCuentaAuth,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { llamarProceso } from './procesos';

/**
 * Autenticación real (Fase 5.1, DEC-AUTH-1). Cada función llama a un proceso `proc_auth_*` de la
 * migración 0030, documentado en docs/08_Procesos_BD.md, sección «Fase 5 · Autenticación».
 * La contraseña nunca llega aquí: solo su hash Argon2id; los tokens, como hash SHA-256.
 */

export interface DatosSesion {
  tokenHash: Buffer;
  ip: string;
  dispositivo: string;
  expiraEn: Date;
}

export const registrar = (
  db: Ejecutor,
  datos: { correo: string; nombre: string; hash: string },
  s: DatosSesion,
) =>
  llamarProceso(
    db,
    'proc_auth_registrar',
    [
      datos.correo,
      datos.nombre,
      datos.hash,
      s.tokenHash,
      s.ip,
      s.dispositivo,
      s.expiraEn.toISOString(),
    ],
    esquemaAuthUsuario,
  );

export const credenciales = (db: Ejecutor, correo: string) =>
  llamarProceso(db, 'proc_auth_credenciales', [correo], esquemaAuthCredenciales);

export const entrar = (db: Ejecutor, usuarioId: string, correcta: boolean, s: DatosSesion) =>
  llamarProceso(
    db,
    'proc_auth_entrar',
    [usuarioId, correcta, s.tokenHash, s.ip, s.dispositivo, s.expiraEn.toISOString()],
    esquemaAuthEntrar,
  );

export const recuperar = (db: Ejecutor, correo: string, tokenHash: Buffer, expiraEn: Date) =>
  llamarProceso(
    db,
    'proc_auth_recuperar',
    [correo, tokenHash, expiraEn.toISOString()],
    esquemaAuthDestinatario,
  );

export const restablecer = (db: Ejecutor, tokenHash: Buffer, hash: string) =>
  llamarProceso(
    db,
    'proc_auth_restablecer',
    [tokenHash, hash],
    z.object({ restablecida: z.boolean() }),
  );

export const solicitarVerificacion = (
  db: Ejecutor,
  actorId: string,
  tokenHash: Buffer,
  expiraEn: Date,
) =>
  llamarProceso(
    db,
    'proc_auth_verificacion_solicitar',
    [actorId, tokenHash, expiraEn.toISOString()],
    esquemaAuthVerificacion,
  );

export const verificarCorreo = (db: Ejecutor, tokenHash: Buffer) =>
  llamarProceso(
    db,
    'proc_auth_verificar_correo',
    [tokenHash],
    z.object({ verificado: z.boolean() }),
  );

export const cuenta = (db: Ejecutor, actorId: string) =>
  llamarProceso(db, 'proc_auth_cuenta', [actorId], esquemaCuentaAuth);

export const hashActual = (db: Ejecutor, actorId: string) =>
  llamarProceso(db, 'proc_auth_hash_actual', [actorId], z.object({ hash: z.string().nullable() }));

export const cambiarContrasena = (db: Ejecutor, actorId: string, sesionId: string, hash: string) =>
  llamarProceso(
    db,
    'proc_auth_contrasena_cambiar',
    [actorId, sesionId, hash],
    z.object({ cambiada: z.boolean(), sesiones_cerradas: z.number().int() }),
  );
