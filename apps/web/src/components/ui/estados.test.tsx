import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '@/lib/api';
import { EstadosDatos, type ConsultaDatos } from './estados';

function pintar(consulta: Partial<ConsultaDatos<string[]>>) {
  const refetch = vi.fn();
  render(
    <MemoryRouter>
      <EstadosDatos
        consulta={{ data: undefined, isPending: false, error: null, refetch, ...consulta }}
        vacio={<p>Sin tareas</p>}
      >
        {(datos) => <p>Datos: {datos.join(', ')}</p>}
      </EstadosDatos>
    </MemoryRouter>,
  );
  return refetch;
}

describe('EstadosDatos: los cinco estados de una pantalla de datos (docs/01, 5.3)', () => {
  it('cargando: muestra el esqueleto', () => {
    pintar({ isPending: true });
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('vacío: muestra el mensaje de vacío', () => {
    pintar({ data: [] });
    expect(screen.getByText('Sin tareas')).toBeInTheDocument();
  });

  it('error: muestra el aviso con «Reintentar» y vuelve a consultar', () => {
    const refetch = pintar({ error: new ErrorApi(500, 'error_interno', 'Falló') });
    expect(screen.getByText('No pudimos cargar esta sección')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Reintentar' }).click();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('sin permiso: muestra el motivo en español que envía la API', () => {
    pintar({ error: new ErrorApi(403, 'sin_permiso', 'Solo el líder puede habilitar tareas.') });
    expect(screen.getByText('No tienes acceso a esta sección')).toBeInTheDocument();
    expect(screen.getByText('Solo el líder puede habilitar tareas.')).toBeInTheDocument();
  });

  it('sin conexión: lo distingue de un error del servidor', () => {
    pintar({ error: new ErrorApi(0, 'sin_conexion', 'Sin red') });
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
  });

  it('con datos: pinta el contenido', () => {
    pintar({ data: ['a', 'b'] });
    expect(screen.getByText('Datos: a, b')).toBeInTheDocument();
  });
});
