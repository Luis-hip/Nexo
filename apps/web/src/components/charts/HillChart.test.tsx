import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HillChart, type PuntoHill } from './HillChart';

const punto = (id: string, progreso: number, titulo = `Tarea ${id}`): PuntoHill => ({
  id,
  codigo: `T-0${id}`,
  titulo,
  estado: 'en_curso',
  progreso,
  vence_en: null,
  resultado: null,
  responsable: 'Carlos Ramírez',
  colorIdx: 1,
});

describe('HillChart: arrastrar para actualizar el avance (Fase 3.1)', () => {
  const ancho = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  beforeAll(() => {
    // jsdom no mide: el gráfico necesita un ancho para dibujarse.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 600 });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterAll(() => {
    if (ancho) Object.defineProperty(HTMLElement.prototype, 'clientWidth', ancho);
    vi.unstubAllGlobals();
  });

  it('con las flechas cambia el avance de 5 en 5 y lo guarda una sola vez', () => {
    vi.useFakeTimers();
    const onMover = vi.fn();
    render(<HillChart puntos={[punto('1', 40)]} onMover={onMover} />);
    const figura = screen.getByRole('button', { name: /T-01 Tarea 1/ });
    expect(figura).toHaveAttribute('aria-description', expect.stringMatching(/flechas/));

    fireEvent.keyDown(figura, { key: 'ArrowRight' });
    fireEvent.keyDown(figura, { key: 'ArrowRight' });
    fireEvent.keyDown(figura, { key: 'ArrowLeft' });
    fireEvent.keyDown(figura, { key: 'ArrowRight' });
    expect(onMover).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(onMover).toHaveBeenCalledTimes(1);
    expect(onMover).toHaveBeenCalledWith('1', 50);
    vi.useRealTimers();
  });

  it('no baja de 0 ni pasa de 100', () => {
    vi.useFakeTimers();
    const onMover = vi.fn();
    render(<HillChart puntos={[punto('1', 98)]} onMover={onMover} />);
    const figura = screen.getByRole('button', { name: /T-01/ });
    fireEvent.keyDown(figura, { key: 'ArrowRight' });
    act(() => vi.advanceTimersByTime(1000));
    expect(onMover).toHaveBeenCalledWith('1', 100);
    vi.useRealTimers();
  });

  it('una figura que no se puede mover no reacciona a las flechas', () => {
    vi.useFakeTimers();
    const onMover = vi.fn();
    render(
      <HillChart
        puntos={[punto('1', 40), punto('2', 60)]}
        onMover={onMover}
        puedeMover={(id) => id === '1'}
      />,
    );
    const ajena = screen.getByRole('button', { name: /T-02/ });
    expect(ajena).not.toHaveAttribute('aria-description');
    fireEvent.keyDown(ajena, { key: 'ArrowRight' });
    act(() => vi.advanceTimersByTime(1000));
    expect(onMover).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('sin onMover es de solo lectura', () => {
    vi.useFakeTimers();
    const onAbrir = vi.fn();
    render(<HillChart puntos={[punto('1', 40)]} onAbrir={onAbrir} />);
    const figura = screen.getByRole('button', { name: /T-01/ });
    fireEvent.keyDown(figura, { key: 'ArrowRight' });
    fireEvent.keyDown(figura, { key: 'Enter' });
    expect(onAbrir).toHaveBeenCalledWith('1');
    vi.useRealTimers();
  });
});
