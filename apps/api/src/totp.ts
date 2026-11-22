import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238: HMAC-SHA1, 6 dígitos, 30 s) para la verificación en dos pasos (AUTH-07).
 * Compatible con Google Authenticator, Authy y Microsoft Authenticator. Sin dependencias.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODO = 30;

export function base32(datos: Buffer): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const b of datos) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function desdeBase32(texto: string): Buffer {
  const limpio = texto.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Secreto base32 inválido.');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto nuevo de 160 bits en base32 (lo que se escribe a mano en la app). */
export const generarSecreto = () => base32(randomBytes(20));

/** Enlace `otpauth://` que leen las apps (y que va en el QR). */
export function uriOtpauth(secreto: string, cuenta: string, emisor = 'Nexo'): string {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=${PERIODO}`;
}

export function codigoEnPaso(secreto: string, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', desdeBase32(secreto)).update(contador).digest();
  const o = h[h.length - 1]! & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return n.toString().padStart(6, '0');
}

export const pasoActual = (ahora = Date.now()) => Math.floor(ahora / 1000 / PERIODO);

/**
 * Devuelve el paso en el que el código es válido (el actual ± `ventana`, por relojes desfasados) o
 * null. La BD exige que sea posterior al último usado, así un código no sirve dos veces.
 */
export function pasoValido(
  secreto: string,
  codigo: string,
  ahora = Date.now(),
  ventana = 1,
): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const actual = pasoActual(ahora);
  for (let d = -ventana; d <= ventana; d++) {
    const esperado = Buffer.from(codigoEnPaso(secreto, actual + d));
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return actual + d;
  }
  return null;
}

/** Normaliza un código de respaldo («abcd-efgh» → «ABCDEFGH») y lo convierte en su hash SHA-256. */
export const hashRespaldo = (codigo: string) =>
  createHash('sha256').update(codigo.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

/** 10 códigos de respaldo de un solo uso (XXXX-XXXX) y sus hashes (solo estos van a la BD). */
export function codigosRespaldo(): { codigos: string[]; hashes: string[] } {
  const codigos = Array.from({ length: 10 }, () => {
    const t = base32(randomBytes(5)).slice(0, 8);
    return `${t.slice(0, 4)}-${t.slice(4)}`;
  });
  return { codigos, hashes: codigos.map(hashRespaldo) };
}
