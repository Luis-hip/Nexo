export type TemaResuelto = 'claro' | 'oscuro';

// Bandas reservadas al semáforo (tono OKLCH, grados)
const BANDAS: [number, number][] = [
  [10, 40],
  [60, 100],
  [130, 165],
];
const MARGEN = 4;

export function tonoDeIntegrante(indice: number): number {
  let h = (indice * 137.5) % 360;
  for (const [lo, hi] of BANDAS) {
    if (h >= lo && h <= hi) {
      h = h - lo <= hi - h ? lo - MARGEN : hi + MARGEN;
      break;
    }
  }
  return (h + 360) % 360;
}

const LUMINOSIDADES = [0.52, 0.62, 0.72, 0.8];

/** Única fuente de color de integrantes en Nexo. */
export function colorDeIntegrante(indice: number, tema: TemaResuelto): string {
  const nivel = (indice % 3) + (tema === 'oscuro' ? 1 : 0);
  const l = LUMINOSIDADES[nivel] ?? 0.62;
  const c = 0.12 + ((indice * 7) % 5) * 0.01;
  return `oklch(${l} ${c.toFixed(3)} ${tonoDeIntegrante(indice).toFixed(1)})`;
}

/** Texto legible sobre el color del integrante. */
export function textoSobreIntegrante(indice: number, tema: TemaResuelto): string {
  const nivel = (indice % 3) + (tema === 'oscuro' ? 1 : 0);
  return (LUMINOSIDADES[nivel] ?? 0.5) >= 0.7 ? '#111827' : '#ffffff';
}

export function enBandaSemaforo(h: number): boolean {
  return BANDAS.some(([lo, hi]) => h >= lo && h <= hi);
}
