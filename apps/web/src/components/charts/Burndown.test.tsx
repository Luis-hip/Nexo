import type { TareaEquipo } from '@nexo/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Burndown, calcularBurndown, resumenBurndown } from './Burndown';

const tarea = (codigo: number, completadaEn: string | null, color = 1): TareaEquipo =>
  ({
    id: `t${codigo}`,
    codigo,
    titulo: `Tarea ${codigo}`,
    estado: completadaEn ? 'completada' : 'en_curso',
    completada_en: completadaEn,
    responsable: { usuario_id: `u${color}`, nombre: `Persona ${color}`, color_idx: color },
  }) as TareaEquipo;

const local = (dia: string, h: number) =>
  new Date(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h).toISOString();

describe('Burndown del sprint (EQ-09, retroalimentación bloque 6)', () => {
  const base = { inicio: '2026-11-02', fin: '2026-11-06', serie: [] };

  it('un nodo por tarea completada, en el momento real, y baja 1 cada vez', () => {
    const d = calcularBurndown({
      ...base,
      tareas: [
        tarea(1, local('2026-11-03', 9)),
        tarea(2, local('2026-11-03', 17), 2),
        tarea(3, null),
      ],
      ahora: Date.parse(local('2026-11-04', 12)),
    });
    expect(d.total).toBe(3);
    expect(d.nodos.map((n) => n.pendientes)).toEqual([2, 1]);
    expect(d.nodos[1]!.t - d.nodos[0]!.t).toBe(8 * 3_600_000);
    expect(d.pendientes).toBe(1);
  });

  it('las tres variantes del texto, sin decimales', () => {
    expect(resumenBurndown({ pendientes: 5, esperadas: 1, ritmo: 'atrasado' }, '26 nov')).toBe(
      'Al 26 nov faltan 5 tareas; según lo planeado debería faltar 1. Vas atrasado por 4 tareas.',
    );
    expect(resumenBurndown({ pendientes: 2, esperadas: 4, ritmo: 'adelantado' }, '26 nov')).toBe(
      'Al 26 nov faltan 2 tareas; según lo planeado deberían faltar 4. Vas adelantado por 2 tareas.',
    );
    expect(resumenBurndown({ pendientes: 1, esperadas: 0, ritmo: 'atrasado' }, '3 nov')).toBe(
      'Al 3 nov falta 1 tarea; según lo planeado ya no debería faltar ninguna. Vas atrasado por 1 tarea.',
    );
    expect(resumenBurndown({ pendientes: 3, esperadas: 3, ritmo: 'en_ritmo' }, '26 nov')).toBe(
      'Al 26 nov faltan 3 tareas, justo lo planeado. Vas en ritmo.',
    );
  });

  it('la Expectativa parte de las tareas del inicio; las agregadas después solo mueven el Avance', () => {
    const d = calcularBurndown({
      ...base,
      serie: [{ dia: '2026-11-02', total: 2, completadas: 0 }],
      tareas: [tarea(1, null), tarea(2, null), tarea(3, null)],
      ahora: Date.parse(local('2026-11-02', 12)),
    });
    expect(d.inicial).toBe(2);
    expect(d.total).toBe(3);
    expect(d.agregadas).toBe(1);
  });

  it('los nodos se enfocan, dicen qué tarea son y abren su detalle', () => {
    const abrir = vi.fn();
    // jsdom no mide: se da un ancho al contenedor para que el gráfico se dibuje.
    const ancho = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    render(
      <Burndown
        {...base}
        tareas={[tarea(1, local('2026-11-03', 9)), tarea(2, null)]}
        hoy="2026-11-04"
        onAbrir={abrir}
      />,
    );
    const nodo = screen.getByRole('button', { name: /T-01 Tarea 1\. Completada por Persona 1/ });
    fireEvent.keyDown(nodo, { key: 'Enter' });
    expect(abrir).toHaveBeenCalledWith('t1');
    expect(
      screen.getByText('El color de cada punto identifica al responsable de la tarea completada.'),
    ).toBeTruthy();
    ancho.mockRestore();
    vi.unstubAllGlobals();
  });
});
