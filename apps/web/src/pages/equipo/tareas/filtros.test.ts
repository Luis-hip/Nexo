import type { TareaEquipo } from '@nexo/shared';
import { describe, expect, it } from 'vitest';
import { plazoDe } from '@/lib/tareas';
import { aplicarFiltros, cuantosFiltros, SIN_FILTROS_TAREA } from './filtros';

const dia = 86_400_000;
const tarea = (p: Partial<TareaEquipo>): TareaEquipo =>
  ({
    id: Math.random().toString(36),
    codigo: 1,
    titulo: 'Tarea',
    estado: 'en_curso',
    prioridad: 'media',
    vence_en: new Date(Date.now() + 5 * dia).toISOString(),
    resultado: null,
    responsable: { usuario_id: 'ana', nombre: 'Ana', color_idx: 0 },
    ...p,
  }) as TareaEquipo;

describe('filtro unificado del tablero', () => {
  it('el plazo es el mismo semáforo de la tarjeta', () => {
    expect(plazoDe(tarea({}))).toBe('a_tiempo');
    expect(plazoDe(tarea({ vence_en: new Date(Date.now() - dia).toISOString() }))).toBe('vencida');
    expect(plazoDe(tarea({ estado: 'completada', resultado: 'con_retraso' }))).toBe('con_retraso');
    expect(plazoDe(tarea({ estado: 'completada', resultado: 'a_tiempo' }))).toBe('a_tiempo');
    expect(plazoDe(tarea({ vence_en: null }))).toBeNull();
  });

  it('combina responsable, prioridad y plazo, y cuenta los activos', () => {
    const ts = [
      tarea({ titulo: 'de Ana, alta', prioridad: 'alta' }),
      tarea({
        titulo: 'de Beto',
        responsable: { usuario_id: 'beto', nombre: 'Beto', color_idx: 1 },
      }),
      tarea({ titulo: 'vencida de Ana', vence_en: new Date(Date.now() - dia).toISOString() }),
    ];
    expect(aplicarFiltros(ts, SIN_FILTROS_TAREA)).toHaveLength(3);
    const soloAna = { ...SIN_FILTROS_TAREA, responsable: 'ana' };
    expect(aplicarFiltros(ts, soloAna).map((t) => t.titulo)).toEqual([
      'de Ana, alta',
      'vencida de Ana',
    ]);
    const f = { responsable: 'ana', prioridad: '', plazo: 'vencida' } as const;
    expect(aplicarFiltros(ts, f).map((t) => t.titulo)).toEqual(['vencida de Ana']);
    expect(cuantosFiltros(f)).toBe(2);
  });
});
