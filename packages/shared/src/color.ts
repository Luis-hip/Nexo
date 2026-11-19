/**
 * Color automático por miembro (docs/01, 5.4; Fase 3.2). Única fuente de color de integrantes:
 * la usan la web (avatares, tarjetas, Hill Chart) y, más adelante, los avisos.
 *
 * - Espacio **OKLCH**, salto de tono por **ángulo áureo** (≈ 137.5°) a partir del `color_idx`
 *   que asigna la BD (`fn_siguiente_color_idx`, único entre miembros activos).
 * - Se **evitan las bandas de tono del semáforo** (rojo, ámbar, verde) para no confundir a una
 *   persona con un estado de entrega.
 * - La luminosidad varía en tres niveles y se aclara en el tema oscuro.
 */

export type TemaResuelto = 'claro' | 'oscuro';

/** Bandas de tono (grados OKLCH) reservadas al semáforo: rojo, ámbar y verde. */
export const BANDAS_SEMAFORO: readonly [number, number][] = [
  [10, 40],
  [60, 100],
  [130, 165],
];
const MARGEN = 4;
const LUMINOSIDADES = [0.52, 0.62, 0.72, 0.8];

export function enBandaSemaforo(h: number): boolean {
  return BANDAS_SEMAFORO.some(([lo, hi]) => h >= lo && h <= hi);
}

/** Tono del integrante: ángulo áureo, sacado de las bandas del semáforo al borde más cercano. */
export function tonoDeIntegrante(indice: number): number {
  let h = (indice * 137.5) % 360;
  for (const [lo, hi] of BANDAS_SEMAFORO) {
    if (h >= lo && h <= hi) {
      h = h - lo <= hi - h ? lo - MARGEN : hi + MARGEN;
      break;
    }
  }
  return (h + 360) % 360;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Color del integrante como números OKLCH. */
export function oklchDeIntegrante(indice: number, tema: TemaResuelto): Oklch {
  const nivel = (indice % 3) + (tema === 'oscuro' ? 1 : 0);
  return {
    l: LUMINOSIDADES[nivel] ?? 0.62,
    c: 0.12 + ((indice * 7) % 5) * 0.01,
    h: tonoDeIntegrante(indice),
  };
}

/** Color del integrante como valor CSS `oklch(…)`. */
export function colorDeIntegrante(indice: number, tema: TemaResuelto): string {
  const { l, c, h } = oklchDeIntegrante(indice, tema);
  return `oklch(${l} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** Texto legible sobre el color del integrante. */
export function textoSobreIntegrante(indice: number, tema: TemaResuelto): string {
  const nivel = (indice % 3) + (tema === 'oscuro' ? 1 : 0);
  return (LUMINOSIDADES[nivel] ?? 0.5) >= 0.7 ? '#111827' : '#ffffff';
}

// ---------------------------------------------------------------------------------------------
// Medir diferencias (para las pruebas y para revisar paletas)
// ---------------------------------------------------------------------------------------------

/** Distancia perceptual ΔE en OKLab entre dos colores OKLCH (≈ 0.02 es apenas perceptible). */
export function distanciaOklch(a: Oklch, b: Oklch): number {
  const rad = Math.PI / 180;
  const da = a.c * Math.cos(a.h * rad) - b.c * Math.cos(b.h * rad);
  const db = a.c * Math.sin(a.h * rad) - b.c * Math.sin(b.h * rad);
  return Math.hypot(a.l - b.l, da, db);
}

/** Convierte `#rrggbb` (sRGB) a OKLCH (fórmulas de Björn Ottosson). */
export function oklchDeHex(hex: string): Oklch {
  const canal = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [canal(0), canal(1), canal(2)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
