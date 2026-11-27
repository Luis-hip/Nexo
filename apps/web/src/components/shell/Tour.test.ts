import { describe, expect, it } from 'vitest';
import { cajaResaltado, colocarGlobo } from './Tour';

const globo = { w: 360, h: 180 };

describe('recorrido: el resaltado y el globo no se salen de la ventana', () => {
  it('recorta a 8 px un elemento pegado al borde (barra lateral de alto completo)', () => {
    const c = cajaResaltado({ top: 0, left: 0, right: 256, bottom: 768 }, 1366, 768);
    expect(c).toEqual({ top: 8, left: 8, width: 254, height: 752 });
  });

  it('si el elemento es más grande que la ventana, resalta solo la parte visible', () => {
    const c = cajaResaltado({ top: -200, left: 100, right: 400, bottom: 2000 }, 1000, 600);
    expect(c).toEqual({ top: 8, left: 94, width: 312, height: 584 });
  });

  it('el globo va abajo si cabe; si no, arriba; si no, a un lado', () => {
    const arribaDeLaVentana = { top: 10, left: 400, width: 120, height: 40 };
    expect(colocarGlobo(arribaDeLaVentana, globo, 1366, 768).lado).toBe('abajo');
    const alFondo = { top: 700, left: 400, width: 120, height: 40 };
    expect(colocarGlobo(alFondo, globo, 1366, 768).lado).toBe('arriba');
    const altoCompleto = { top: 8, left: 8, width: 254, height: 752 };
    const g = colocarGlobo(altoCompleto, globo, 1366, 768);
    expect(g.lado).toBe('derecha');
    expect(g.left).toBeGreaterThanOrEqual(8 + 254);
  });

  it('el globo nunca se sale por los lados', () => {
    const esquina = { top: 10, left: 1300, width: 50, height: 40 };
    const g = colocarGlobo(esquina, globo, 1366, 768);
    expect(g.left + globo.w).toBeLessThanOrEqual(1366 - 8);
    expect(g.left).toBeGreaterThanOrEqual(8);
  });
});
