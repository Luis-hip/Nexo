import {
  esquemaAuthCredenciales,
  esquemaAuthDestinatario,
  esquemaAuthEntrar,
  esquemaAuthUsuario,
  esquemaAuthVerificacion,
  esquemaCuentaAuth,
  esquema2faCompletar,
  esquemaAuthGoogle,
  esquema2faDesafio,
  esquema2faEstado,
  esquema2faSecreto,
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

// --- AUTH-07 · Verificación en dos pasos (`proc_2fa_*`, migración 0037) --------------------------

export const estado2fa = (db: Ejecutor, actorId: string) =>
  llamarProceso(db, 'proc_2fa_estado', [actorId], esquema2faEstado);

export const iniciar2fa = (db: Ejecutor, actorId: string, secretoCifrado: string) =>
  llamarProceso(db, 'proc_2fa_iniciar', [actorId, secretoCifrado], esquema2faEstado);

export const secreto2fa = (db: Ejecutor, actorId: string) =>
  llamarProceso(db, 'proc_2fa_secreto', [actorId], esquema2faSecreto);

export const confirmar2fa = (db: Ejecutor, actorId: string, paso: number, hashes: string[]) =>
  llamarProceso(db, 'proc_2fa_confirmar', [actorId, paso, hashes], esquema2faEstado);

export const desactivar2fa = (
  db: Ejecutor,
  actorId: string,
  paso: number | null,
  respaldoHash: string | null,
) => llamarProceso(db, 'proc_2fa_desactivar', [actorId, paso, respaldoHash], esquema2faEstado);

export const regenerarRespaldo2fa = (
  db: Ejecutor,
  actorId: string,
  paso: number | null,
  respaldoHash: string | null,
  hashes: string[],
) =>
  llamarProceso(
    db,
    'proc_2fa_respaldo_regenerar',
    [actorId, paso, respaldoHash, hashes],
    esquema2faEstado,
  );

export const desafio2fa = (db: Ejecutor, tokenHash: Buffer) =>
  llamarProceso(db, 'proc_2fa_desafio', [tokenHash], esquema2faDesafio);

export const completar2fa = (
  db: Ejecutor,
  tokenHash: Buffer,
  paso: number | null,
  respaldoHash: string | null,
  s: DatosSesion,
) =>
  llamarProceso(
    db,
    'proc_2fa_completar',
    [tokenHash, paso, respaldoHash, s.tokenHash, s.ip, s.dispositivo, s.expiraEn.toISOString()],
    esquema2faCompletar,
  );

// --- AUTH-07 · Entrar con Google (`proc_auth_google*`, migración 0038) --------------------------

export const google = (
  db: Ejecutor,
  datos: { sub: string; correo: string; verificado: boolean; nombre: string },
  actorId: string | null,
  s: DatosSesion,
) =>
  llamarProceso(
    db,
    'proc_auth_google',
    [
      datos.sub,
      datos.correo,
      datos.verificado,
      datos.nombre,
      actorId,
      s.tokenHash,
      s.ip,
      s.dispositivo,
      s.expiraEn.toISOString(),
    ],
    esquemaAuthGoogle,
  );

export const desvincularGoogle = (db: Ejecutor, actorId: string) =>
  llamarProceso(db, 'proc_auth_google_desvincular', [actorId], z.object({ google: z.boolean() }));

export const verificar2fa = (
  db: Ejecutor,
  actorId: string,
  paso: number | null,
  respaldoHash: string | null,
) =>
  llamarProceso(
    db,
    'proc_2fa_verificar',
    [actorId, paso, respaldoHash],
    z.object({ valido: z.boolean() }),
  );
