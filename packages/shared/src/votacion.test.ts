import { describe, expect, it } from 'vitest';
import { esquemaVotar, resultadoVotacion, votosNecesarios } from './votacion';

/** Tabla de casos de DEC-024: aceptar · rechazar · integrantes activos → resultado. */
const TABLA: [number, number, number, ReturnType<typeof resultadoVotacion>][] = [
  // 3 integrantes: se acepta con 2.
  [1, 0, 3, 'abierta'],
  [2, 0, 3, 'aceptada'],
  [1, 2, 3, 'rechazada'],
  // 4 integrantes: se acepta con 3; 2 y 2 es empate y sigue abierta (V-4).
  [2, 0, 4, 'abierta'],
  [3, 0, 4, 'aceptada'],
  [2, 2, 4, 'abierta'],
  [1, 3, 4, 'rechazada'],
  // 7 integrantes (el máximo con la líder): 4.
  [3, 3, 7, 'abierta'],
  [4, 3, 7, 'aceptada'],
  // 8: mayoría de 5.
  [4, 4, 8, 'abierta'],
  [5, 0, 8, 'aceptada'],
  [0, 5, 8, 'rechazada'],
  // Un solo integrante decide.
  [1, 0, 1, 'aceptada'],
  [0, 1, 1, 'rechazada'],
  // Sin integrantes acepta el líder (V-5).
  [0, 0, 0, 'aceptada'],
];

describe('votación de propuestas (DEC-024)', () => {
  it.each(TABLA)('%i a favor, %i en contra, %i integrantes → %s', (a, r, n, esperado) => {
    expect(resultadoVotacion(a, r, n)).toBe(esperado);
  });

  it('la mayoría es de todos los integrantes, no de los que votaron', () => {
    // 2 a favor y nadie en contra no bastan si son 5.
    expect(resultadoVotacion(2, 0, 5)).toBe('abierta');
    expect(resultadoVotacion(3, 0, 5)).toBe('aceptada');
  });

  it('votos necesarios: más de la mitad', () => {
    expect([1, 2, 3, 4, 7, 8].map(votosNecesarios)).toEqual([1, 2, 2, 3, 4, 5]);
    for (let n = 1; n <= 8; n++) {
      expect(resultadoVotacion(votosNecesarios(n), 0, n)).toBe('aceptada');
      expect(resultadoVotacion(votosNecesarios(n) - 1, 0, n)).toBe('abierta');
    }
  });

  it('el cuerpo del voto admite comentario opcional y rechaza otros valores', () => {
    expect(esquemaVotar.parse({ voto: 'aceptar' })).toEqual({ voto: 'aceptar' });
    expect(esquemaVotar.parse({ voto: 'rechazar', comentario: '  Falta alcance ' })).toEqual({
      voto: 'rechazar',
      comentario: 'Falta alcance',
    });
    expect(esquemaVotar.safeParse({ voto: 'abstenerse' }).success).toBe(false);
  });
});
