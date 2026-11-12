import { createHash, randomBytes } from 'node:crypto';

export const COOKIE_SESION = 'nexo_sesion';
export const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;

/** Token opaco aleatorio: al cliente va el token; a la BD, solo su hash SHA-256. */
export function crearTokenSesion(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
