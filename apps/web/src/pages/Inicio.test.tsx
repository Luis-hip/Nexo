import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inicio } from './Inicio';

describe('Inicio', () => {
  it('muestra el nombre del producto y el tope de miembros', () => {
    render(<Inicio />);
    expect(screen.getByRole('heading', { name: 'Nexo' })).toBeInTheDocument();
    expect(screen.getByText(/hasta 8 personas/)).toBeInTheDocument();
  });
});
