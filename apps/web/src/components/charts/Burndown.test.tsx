import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Burndown } from './Burndown';

describe('Burndown del sprint (EQ-09)', () => {
  it('resume en texto lo que falta y repite los datos en una tabla accesible', () => {
    render(
      <Burndown
        inicio="2026-11-02"
        fin="2026-11-06"
        serie={[
          { dia: '2026-11-02', total: 4, completadas: 0 },
          { dia: '2026-11-04', total: 4, completadas: 2 },
        ]}
      />,
    );
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /Faltan 2 tareas el 4 nov; la línea ideal marca 2\./,
    );
    const filas = screen.getAllByRole('row');
    expect(filas).toHaveLength(6); // encabezado + 5 días
    expect(filas[3]?.textContent).toBe('4 nov22');
    expect(filas[5]?.textContent).toBe('6 novsin dato0');
  });

  it('sin instantáneas lo dice en vez de dibujar una línea vacía', () => {
    render(<Burndown inicio="2026-11-02" fin="2026-11-03" serie={[]} />);
    expect(
      screen.getAllByText('Todavía no hay instantáneas de este sprint.').length,
    ).toBeGreaterThan(0);
  });
});
