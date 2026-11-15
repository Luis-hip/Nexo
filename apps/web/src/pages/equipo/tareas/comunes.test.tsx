import type { EquipoDetalle, TareaEquipo } from '@nexo/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AccionesCtx } from '@/components/shell/contexto';
import { EquipoCtx, type EquipoActual } from '../contexto';
import { TarjetaTarea, useTransiciones } from './comunes';
import { puede } from '@nexo/shared';

const tarea = (cambios: Partial<TareaEquipo> = {}): TareaEquipo => ({
  id: 't1',
  equipo_id: 'e1',
  codigo: 7,
  titulo: 'Modo sin conexión',
  descripcion: '',
  estado: 'habilitada',
  prioridad: 'media',
  progreso: 0,
  vence_en: null,
  motivo: null,
  rechazo_por: null,
  cambios_pedidos: null,
  resultado: null,
  semaforo: null,
  asignacion_pendiente: false,
  origen: 'directa',
  orden: 'a0',
  sprint_id: null,
  archivada: false,
  version: 1,
  creado_en: '2026-11-01T00:00:00.000Z',
  actualizado_en: '2026-11-01T00:00:00.000Z',
  completada_en: null,
  responsable: { usuario_id: 'yo', nombre: 'Carlos Ramírez', color_idx: 1 },
  proponente: null,
  etiquetas: [],
  subtareas_total: 2,
  subtareas_hechas: 1,
  comentarios_total: 3,
  ...cambios,
});

function contexto(rol: EquipoDetalle['mi_rol']): EquipoActual {
  const equipo = {
    id: 'e1',
    nombre: 'Equipo Nexo',
    mi_rol: rol,
    miembros: [],
    sprints: [],
    etiquetas: [],
  } as unknown as EquipoDetalle;
  return {
    equipo,
    base: '/app/e/e1',
    usuarioId: 'yo',
    puede: (accion, ctx) => puede(accion, { perfil: rol, ...ctx }),
  };
}

function Envoltorio({
  rol,
  children,
}: {
  rol: EquipoDetalle['mi_rol'];
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AccionesCtx.Provider value={{ nuevaTarea: () => {}, abrirTarea: () => {} }}>
          <EquipoCtx.Provider value={contexto(rol)}>{children}</EquipoCtx.Provider>
        </AccionesCtx.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Muestra las transiciones que la interfaz ofrecería para una tarea. */
function Transiciones({ t }: { t: TareaEquipo }) {
  const { validas, motivo } = useTransiciones();
  return (
    <p>
      válidas={validas(t).join(',')} · motivo={motivo(t, 'completada') ?? 'ninguno'}
    </p>
  );
}

describe('TarjetaTarea', () => {
  it('muestra código, título, avance de subtareas, comentarios y responsable', () => {
    render(
      <Envoltorio rol="lider">
        <TarjetaTarea t={tarea()} />
      </Envoltorio>,
    );
    expect(screen.getByText('T-07')).toBeInTheDocument();
    expect(screen.getByText('Modo sin conexión')).toBeInTheDocument();
    expect(screen.getByLabelText('1 de 2 subtareas')).toBeInTheDocument();
    expect(screen.getByLabelText('3 comentarios')).toBeInTheDocument();
    expect(screen.getByTitle('Carlos Ramírez')).toBeInTheDocument();
  });

  it('el estado nunca se comunica solo con color: lleva un texto accesible', () => {
    render(
      <Envoltorio rol="lider">
        <TarjetaTarea t={tarea({ estado: 'atascada', motivo: 'Falta el libro' })} />
      </Envoltorio>,
    );
    expect(screen.getByRole('img', { name: 'Estado: Atascada' })).toBeInTheDocument();
    expect(screen.getByText('Falta el libro')).toBeInTheDocument();
  });

  it('avisa cuando la asignación está pendiente de aceptación', () => {
    render(
      <Envoltorio rol="integrante">
        <TarjetaTarea t={tarea({ asignacion_pendiente: true })} />
      </Envoltorio>,
    );
    expect(screen.getByText('Pendiente de aceptación')).toBeInTheDocument();
  });

  it('el asa de arrastre solo existe si la tarjeta se puede arrastrar', () => {
    const { rerender } = render(
      <Envoltorio rol="lider">
        <TarjetaTarea t={tarea()} />
      </Envoltorio>,
    );
    expect(screen.queryByLabelText(/^Arrastrar/)).not.toBeInTheDocument();
    rerender(
      <Envoltorio rol="lider">
        <TarjetaTarea t={tarea()} asa={{}} />
      </Envoltorio>,
    );
    expect(screen.getByLabelText('Arrastrar T-07 Modo sin conexión')).toBeInTheDocument();
  });
});

describe('transiciones que ofrece la interfaz (misma regla que el servidor)', () => {
  it('el responsable puede empezar su tarea habilitada', () => {
    render(
      <Envoltorio rol="integrante">
        <Transiciones t={tarea()} />
      </Envoltorio>,
    );
    expect(screen.getByText(/válidas=en_curso/)).toBeInTheDocument();
  });

  it('con la asignación pendiente no ofrece nada y explica por qué', () => {
    render(
      <Envoltorio rol="integrante">
        <Transiciones t={tarea({ asignacion_pendiente: true })} />
      </Envoltorio>,
    );
    expect(screen.getByText(/válidas= ·/)).toBeInTheDocument();
    expect(screen.getByText(/Primero acepta la asignación\./)).toBeInTheDocument();
  });

  it('un invitado nunca puede cambiar el estado', () => {
    render(
      <Envoltorio rol="invitado">
        <Transiciones t={tarea()} />
      </Envoltorio>,
    );
    expect(screen.getByText(/válidas= ·/)).toBeInTheDocument();
    expect(screen.getByText(/Los invitados no cambian estados\./)).toBeInTheDocument();
  });

  it('otro integrante no mueve una tarea ajena', () => {
    render(
      <Envoltorio rol="integrante">
        <Transiciones
          t={tarea({ responsable: { usuario_id: 'otro', nombre: 'Otra', color_idx: 2 } })}
        />
      </Envoltorio>,
    );
    expect(screen.getByText(/Solo el responsable o el líder/)).toBeInTheDocument();
  });
});
