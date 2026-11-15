import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Unirse } from './Unirse';

/** Responde a `fetch` con la API simulada: `GET /invitaciones/:codigo`. */
function simularApi(respuesta: { estado: number; cuerpo: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.estado })),
  );
}

function pintar(ruta = '/app/equipos/unirse') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[ruta]}>
        <Unirse />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const vista = (cambios: object = {}) => ({
  codigo: 'NX4-821Q',
  equipo: { id: 'e1', nombre: 'Equipo Nexo', descripcion: '' },
  lider: 'Valeria Mendoza',
  miembros_activos: 3,
  max_miembros: 8,
  rol_destino: 'integrante',
  duracion_invitado_dias: null,
  caduca_en: '2026-12-01T00:00:00.000Z',
  ya_miembro: false,
  ...cambios,
});

afterEach(() => vi.unstubAllGlobals());

describe('Unirse con un código (PER-07)', () => {
  it('muestra la vista previa con líder, cupo y rol', async () => {
    simularApi({ estado: 200, cuerpo: vista() });
    pintar('/app/equipos/unirse?codigo=NX4-821Q');
    expect(await screen.findByText('Equipo Nexo')).toBeInTheDocument();
    expect(screen.getByText(/Líder: Valeria Mendoza/)).toBeInTheDocument();
    expect(screen.getByText('3 de 8 miembros')).toBeInTheDocument();
    expect(screen.getByText('integrante')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y unirme' })).toBeInTheDocument();
  });

  it('una invitación de invitado explica la duración de su acceso', async () => {
    simularApi({
      estado: 200,
      cuerpo: vista({ rol_destino: 'invitado', duracion_invitado_dias: 14 }),
    });
    pintar('/app/equipos/unirse?codigo=NX4-821Q');
    expect(await screen.findByText(/invitado \(acceso por 14 días\)/)).toBeInTheDocument();
  });

  it('equipo lleno: avisa y no deja unirse como integrante (FALT-06)', async () => {
    simularApi({ estado: 200, cuerpo: vista({ miembros_activos: 8 }) });
    pintar('/app/equipos/unirse?codigo=NX4-821Q');
    expect(await screen.findByText('El equipo está lleno.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y unirme' })).not.toBeInTheDocument();
  });

  it('quien ya pertenece ve un aviso en vez del botón', async () => {
    simularApi({ estado: 200, cuerpo: vista({ ya_miembro: true }) });
    pintar('/app/equipos/unirse?codigo=NX4-821Q');
    expect(await screen.findByText('Ya perteneces a este equipo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y unirme' })).not.toBeInTheDocument();
  });

  it.each([
    ['invitacion_caducada', 410, 'Esta invitación caducó. Pide una nueva al líder del equipo.'],
    ['invitacion_usada', 410, 'Esta invitación ya se usó. Pide una nueva al líder del equipo.'],
    ['invitacion_no_existe', 404, 'No encontramos una invitación con ese código.'],
  ])('%s: muestra el motivo en español', async (codigo, estado, mensaje) => {
    simularApi({ estado, cuerpo: { codigo, mensaje } });
    pintar('/app/equipos/unirse?codigo=NX4-821Q');
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar y unirme' })).not.toBeInTheDocument();
  });

  it('al buscar, admite el enlace completo y lo normaliza', async () => {
    simularApi({ estado: 200, cuerpo: vista() });
    pintar();
    await userEvent.type(
      screen.getByLabelText(/Código o enlace/),
      'https://nexo.mx/invitacion/nx4-821q',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Buscar equipo' }));
    await waitFor(() => expect(screen.getByText('Equipo Nexo')).toBeInTheDocument());
    const llamada = vi.mocked(fetch).mock.calls[0]?.[0] as URL;
    expect(llamada.pathname).toBe('/invitaciones/NX4-821Q');
  });
});
