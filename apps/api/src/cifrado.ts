import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Config } from './config';

/**
 * Cifrado simétrico de datos sensibles en la BD (AES-256-GCM con ENCRYPTION_KEY, docs/09).
 * Hoy lo usa el secreto TOTP de la verificación en dos pasos (AUTH-07). Formato guardado:
 * `v1.<iv>.<etiqueta>.<cifrado>` en base64url. En producción la clave es obligatoria (config.ts);
 * fuera de producción, sin clave, se deriva una fija de desarrollo.
 */
function clave(config: Pick<Config, 'ENCRYPTION_KEY' | 'NODE_ENV'>): Buffer {
  if (config.ENCRYPTION_KEY && /^[0-9a-fA-F]{64}$/.test(config.ENCRYPTION_KEY)) {
    return Buffer.from(config.ENCRYPTION_KEY, 'hex');
  }
  if (config.NODE_ENV === 'production') throw new Error('Falta ENCRYPTION_KEY.');
  return createHash('sha256').update('nexo-clave-solo-desarrollo').digest();
}

export function cifrar(config: Pick<Config, 'ENCRYPTION_KEY' | 'NODE_ENV'>, texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(config), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), datos]
    .map((x) => (typeof x === 'string' ? x : x.toString('base64url')))
    .join('.');
}

export function descifrar(
  config: Pick<Config, 'ENCRYPTION_KEY' | 'NODE_ENV'>,
  guardado: string,
): string {
  const [v, iv, etiqueta, datos] = guardado.split('.');
  if (v !== 'v1' || !iv || !etiqueta || !datos) throw new Error('Formato de cifrado desconocido.');
  const d = createDecipheriv('aes-256-gcm', clave(config), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(etiqueta, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64url')), d.final()]).toString('utf8');
}
