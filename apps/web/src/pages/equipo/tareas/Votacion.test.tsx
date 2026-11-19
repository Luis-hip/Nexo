import { puede, type EquipoDetalle, type ResumenVotacion, type TareaEquipo } from '@nexo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AccionesCtx } from '@/components/shell/contexto';
import { EquipoCtx, type EquipoActual } from '../contexto';
import { AccionesVotacion, ResumenVotos } from './Votacion';

const votacion = (cambios: Partial<ResumenVotacion> = {}): ResumenVotacion => ({
  abierta: true,
  total_integrantes: 3,
  necesarios: 2,
  emitidos: 1,
  aceptar: 0,
  rechazar: 1,
  votaron: [{ usuario_id: 'u2', nombre: 'Carlos Ramírez' }],
  mi_voto: null,
  ...cambios,
});

const propuesta = (cambios: Partial<TareaEquipo> = {}): TareaEquipo => ({
  id: 't8',
  equipo_id: 'e1',
  codigo: 8,
  titulo: 'Exportar reportes en CSV',
  descripcion: '',
  estado: 'propuesta',
  prioridad: 'baja',
  progreso: 0,
  vence_en: null,
  motivo: null,
  rechazo_por: null,
  cambios_pedidos: null,
  resultado: null,
  semaforo: null,
  asignacion_pendiente: false,
  origen: 'propuesta',
  orden: 'a0',
  sprint_id: null,
  archivada: false,
  version: 1,
  creado_en: '2026-11-01T00:00:00.000Z',
  actualizado_en: '2026-11-01T00:00:00.000Z',
  completada_en: null,
  responsable: null,
  proponente: { usuario_id: 'u1', nombre: 'Valeria Mendoza', color_idx: 0 },
  etiquetas: [],
  subtareas_total: 2,
  subtareas_hechas: 0,
  comentarios_total: 0,
  votacion: votacion(),
  ...cambios,
});

function Envoltorio({
  rol,
  children,
}: {
  rol: EquipoDetalle['mi_rol'];
  children: React.ReactNode;
}) {
  const equipo = { id: 'e1', nombre: 'Equipo Nexo', mi_rol: rol, miembros: [], sprints: [] };
  const contexto: EquipoActual = {
    equipo: equipo as unknown as EquipoDetalle,
    base: '/app/e/e1',
    usuarioId: 'yo',
    puede: (accion, ctx) => puede(accion, { perfil: rol, ...ctx }),
  };
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AccionesCtx.Provider value={{ nuevaTarea: () => {}, abrirTarea: () => {} }}>
          <EquipoCtx.Provider value={contexto}>{children}</EquipoCtx.Provider>
        </AccionesCtx.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ResumenVotos (V-8)', () => {
  it('abierta: muestra el conteo, cuántos faltan y quién ya votó', () => {
    render(<ResumenVotos v={votacion()} />);
    expect(screen.getByText(/1 de 3/)).toBeInTheDocument();
    expect(screen.getByText(/0 a favor · 1 en contra/)).toBeInTheDocument();
    expect(screen.getByText(/Se acepta con 2 votos a favor \(faltan 2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ya votaron: Carlos\./)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2');
  });

  it('cerrada: solo el resultado, sin decir quién votó', () => {
    render(
      <ResumenVotos
        v={votacion({
          abierta: false,
          total_integrantes: null,
          necesarios: null,
          emitidos: 3,
          aceptar: 2,
          rechazar: 1,
          votaron: [],
        })}
      />,
    );
    expect(screen.getByText(/2 a favor/)).toBeInTheDocument();
    expect(screen.queryByText(/Ya votaron/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

describe('AccionesVotacion', () => {
  const botones = () => screen.queryAllByRole('button').map((b) => b.textContent);

  it('el integrante vota a favor o en contra y no puede retirar', () => {
    render(
      <Envoltorio rol="integrante">
        <AccionesVotacion t={propuesta()} />
      </Envoltorio>,
    );
    expect(botones()).toEqual(['A favor', 'En contra']);
    expect(screen.getByText('Aún no votas.')).toBeInTheDocument();
  });

  it('el integrante ve su propio voto marcado y que puede cambiarlo', () => {
    const mio = { voto: 'aceptar' as const, comentario: null, votado_en: '2026-11-16T10:00:00Z' };
    render(
      <Envoltorio rol="integrante">
        <AccionesVotacion t={propuesta({ votacion: votacion({ mi_voto: mio }) })} />
      </Envoltorio>,
    );
    expect(screen.getByRole('button', { name: 'A favor' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'En contra' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText(/Tu voto: a favor\. Puedes cambiarlo/)).toBeInTheDocument();
  });

  it('el líder no vota (se le explica por qué) y puede retirar la propuesta', () => {
    render(
      <Envoltorio rol="lider">
        <AccionesVotacion t={propuesta()} />
      </Envoltorio>,
    );
    expect(botones()).toEqual(['Retirar']);
    expect(
      screen.getByText('Solo los integrantes votan las propuestas; el líder propone.'),
    ).toBeInTheDocument();
  });

  it('el invitado no tiene ninguna acción', () => {
    render(
      <Envoltorio rol="invitado">
        <AccionesVotacion t={propuesta()} />
      </Envoltorio>,
    );
    expect(botones()).toEqual([]);
  });

  it('una propuesta ya resuelta no ofrece votar ni retirar', () => {
    render(
      <Envoltorio rol="integrante">
        <AccionesVotacion t={propuesta({ estado: 'aceptada' })} />
      </Envoltorio>,
    );
    expect(botones()).toEqual([]);
  });
});
