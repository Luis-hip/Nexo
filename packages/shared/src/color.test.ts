import { describe, expect, it } from 'vitest';
import {
  colorDeIntegrante,
  distanciaOklch,
  enBandaSemaforo,
  oklchDeHex,
  oklchDeIntegrante,
  tonoDeIntegrante,
} from './color';

/** Colores de las señales del semáforo de cada tema (docs/01, 5.2). */
const SENALES = {
  claro: { ok: '#1f9d55', aviso: '#d97706', peligro: '#dc2626' },
  oscuro: { ok: '#4ade80', aviso: '#fbbf24', peligro: '#f87171' },
};

const MIEMBROS = Array.from({ length: 8 }, (_, i) => i);

describe('color por miembro (docs/01 5.4, Fase 3.2)', () => {
  it('ningún tono de miembro cae en una banda del semáforo', () => {
    for (let i = 0; i < 64; i++)
      expect(enBandaSemaforo(tonoDeIntegrante(i)), `índice ${i}`).toBe(false);
  });

  it.each(['claro', 'oscuro'] as const)(
    'tema %s: los 8 colores de la semilla se distinguen entre sí',
    (tema) => {
      const colores = MIEMBROS.map((i) => oklchDeIntegrante(i, tema));
      for (const i of MIEMBROS) {
        for (const j of MIEMBROS.slice(i + 1)) {
          // ΔE OKLab ≈ 0.02 es apenas perceptible; se exige bastante más.
          expect(distanciaOklch(colores[i]!, colores[j]!), `${i} y ${j}`).toBeGreaterThan(0.08);
        }
      }
    },
  );

  // Cada tema contra sus propias señales. Umbral 0.06 (unas 3 veces lo apenas perceptible): el
  // par más cercano es el miembro 1 frente al verde del tema claro (≈ 0.067). Ver DEC-030.
  it.each(['claro', 'oscuro'] as const)(
    'tema %s: ningún miembro se confunde con una señal del semáforo',
    (tema) => {
      for (const i of MIEMBROS) {
        const c = oklchDeIntegrante(i, tema);
        for (const [nombre, hex] of Object.entries(SENALES[tema])) {
          expect(distanciaOklch(c, oklchDeHex(hex)), `miembro ${i} y ${nombre}`).toBeGreaterThan(
            0.06,
          );
        }
      }
    },
  );

  it('el valor CSS es un oklch() estable', () => {
    expect(colorDeIntegrante(0, 'claro')).toMatch(/^oklch\(0\.52 0\.\d{3} \d+\.\d\)$/);
    expect(colorDeIntegrante(3, 'oscuro')).toBe(colorDeIntegrante(3, 'oscuro'));
  });

  it('la conversión de hex a OKLCH es correcta para blanco y negro', () => {
    expect(oklchDeHex('#ffffff').l).toBeCloseTo(1, 3);
    expect(oklchDeHex('#000000').l).toBeCloseTo(0, 3);
    expect(oklchDeHex('#ffffff').c).toBeLessThan(0.001);
  });
});

describe('contraste de las iniciales sobre el color del integrante (5.4)', () => {
  it('los 8 colores en los dos temas llegan a 4.5:1 con el texto elegido', async () => {
    const {
      contrasteWcag,
      luminanciaHex,
      luminanciaOklch,
      oklchDeIntegrante,
      textoSobreIntegrante,
    } = await import('./color');
    for (const tema of ['claro', 'oscuro'] as const) {
      for (let i = 0; i < 8; i++) {
        const fondo = luminanciaOklch(oklchDeIntegrante(i, tema));
        const texto = luminanciaHex(textoSobreIntegrante(i, tema));
        expect(contrasteWcag(fondo, texto), `${tema} ${i}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
