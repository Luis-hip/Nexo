import { describe, expect, it } from 'vitest';
import { colorDeIntegrante, enBandaSemaforo, tonoDeIntegrante } from './color';
import { COLUMNAS_PERSONAL, formaDeEstado, semaforo } from './tareas';

const en = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString();

describe('semaforo (misma regla que la vista v_tareas_semaforo)', () => {
  it.each([
    ['sin fecha', { estado: 'en_curso', vence_en: null, resultado: null }, null],
    ['a tiempo', { estado: 'en_curso', vence_en: en(72), resultado: null }, 'ok'],
    ['vence en menos de 48 h', { estado: 'en_curso', vence_en: en(30), resultado: null }, 'warn'],
    ['vencida', { estado: 'en_curso', vence_en: en(-2), resultado: null }, 'danger'],
    [
      'completada a tiempo',
      { estado: 'completada', vence_en: en(-50), resultado: 'a_tiempo' },
      'ok',
    ],
    [
      'completada con retraso',
      { estado: 'completada', vence_en: en(-50), resultado: 'con_retraso' },
      'warn',
    ],
  ] as const)('%s', (_caso, tarea, nivel) => {
    expect(semaforo(tarea)?.nivel ?? null).toBe(nivel);
  });

  it('solo lo vencido o por vencer es urgente', () => {
    expect(semaforo({ estado: 'en_curso', vence_en: en(-1), resultado: null })?.urgente).toBe(true);
    expect(semaforo({ estado: 'en_curso', vence_en: en(100), resultado: null })?.urgente).toBe(
      false,
    );
  });
});

describe('estado → forma y columnas personales', () => {
  it('el estado nunca se comunica solo con color: cada grupo tiene su forma', () => {
    expect(formaDeEstado('atascada')).toBe('triangulo');
    expect(formaDeEstado('completada')).toBe('cuadrado');
    expect(formaDeEstado('en_curso')).toBe('circulo');
  });

  it('toda tarea personal cae en exactamente una columna', () => {
    for (const estado of ['backlog', 'habilitada', 'en_curso', 'atascada', 'completada'] as const) {
      expect(COLUMNAS_PERSONAL.filter((c) => c.incluye.includes(estado))).toHaveLength(1);
    }
  });
});

describe('color automático por miembro (docs/01, 5.4)', () => {
  const indices = [0, 1, 2, 3, 4, 5, 6, 7];

  it('los 8 miembros de un equipo reciben colores distintos en ambos temas', () => {
    for (const tema of ['claro', 'oscuro'] as const) {
      expect(new Set(indices.map((i) => colorDeIntegrante(i, tema))).size).toBe(8);
    }
  });

  it('ningún tono cae en las bandas reservadas al semáforo (rojo, ámbar, verde)', () => {
    for (const i of indices)
      expect(enBandaSemaforo(tonoDeIntegrante(i)), `índice ${i}`).toBe(false);
  });

  it('los tonos de los 8 miembros están separados al menos 20°', () => {
    const tonos = indices.map(tonoDeIntegrante).sort((a, b) => a - b);
    const saltos = tonos.map((t, i) => ((tonos[(i + 1) % 8] ?? 0) - t + 360) % 360);
    expect(Math.min(...saltos)).toBeGreaterThanOrEqual(20);
  });
});
