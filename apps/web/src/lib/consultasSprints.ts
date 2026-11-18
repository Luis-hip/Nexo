import type {
  CrearNotaRetro,
  DestinoPendientes,
  FaseRetro,
  PlanearSprint,
  ResultadoVotoRetro,
  Retrospectiva,
  Sprint,
  SprintDetalle,
  TareaEquipo,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Sprints y retrospectiva (Fase 3.3). Las claves cuelgan de `['equipo', id]`: cualquier acción
 * vuelve a consultar todo lo del equipo (el sprint también cambia el tablero y el resumen).
 */
const claves = {
  equipo: (id: string) => ['equipo', id] as const,
  lista: (id: string) => ['equipo', id, 'sprints'] as const,
  activo: (id: string) => ['equipo', id, 'sprints', 'activo'] as const,
  disponibles: (id: string) => ['equipo', id, 'sprints', 'disponibles'] as const,
  sprint: (id: string, sprintId: string) => ['equipo', id, 'sprints', sprintId] as const,
  retro: (id: string, sprintId: string) => ['equipo', id, 'sprints', sprintId, 'retro'] as const,
};

export function useSprints(equipoId: string) {
  return useQuery({
    queryKey: claves.lista(equipoId),
    queryFn: () => api<Sprint[]>(`/equipos/${equipoId}/sprints`),
  });
}

/** EQ-09: el sprint activo (`sprint: null` si no hay). */
export function useSprintActivo(equipoId: string) {
  return useQuery({
    queryKey: claves.activo(equipoId),
    queryFn: () => api<{ sprint: SprintDetalle | null }>(`/equipos/${equipoId}/sprints/activo`),
  });
}

export function useSprint(equipoId: string, sprintId: string | undefined) {
  return useQuery({
    queryKey: claves.sprint(equipoId, sprintId ?? ''),
    queryFn: () => api<SprintDetalle>(`/equipos/${equipoId}/sprints/${sprintId}`),
    enabled: !!sprintId,
  });
}

/** EQ-10: tareas que pueden entrar a un sprint. */
export function useDisponibles(equipoId: string) {
  return useQuery({
    queryKey: claves.disponibles(equipoId),
    queryFn: () => api<TareaEquipo[]>(`/equipos/${equipoId}/sprints/disponibles`),
  });
}

/** EQ-12: retrospectiva del sprint (`retro: null` si aún no existe). */
export function useRetro(equipoId: string, sprintId: string | undefined) {
  return useQuery({
    queryKey: claves.retro(equipoId, sprintId ?? ''),
    queryFn: () =>
      api<{ retro: Retrospectiva | null }>(`/equipos/${equipoId}/sprints/${sprintId}/retro`),
    enabled: !!sprintId,
  });
}

/** Acciones de sprints y retrospectiva. Después de cada una se refresca todo lo del equipo. */
export function useAccionesSprint(equipoId: string) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: claves.equipo(equipoId) });
  const base = `/equipos/${equipoId}`;
  const accion = <V, R>(fn: (v: V) => Promise<R>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- se llama siempre en el mismo orden
    useMutation({ mutationFn: fn, onSettled: refrescar });

  return {
    planear: accion(({ id, ...datos }: PlanearSprint & { id?: string }) =>
      id
        ? api<SprintDetalle>(`${base}/sprints/${id}`, { metodo: 'PATCH', cuerpo: datos })
        : api<SprintDetalle>(`${base}/sprints`, { metodo: 'POST', cuerpo: datos }),
    ),
    iniciar: accion((id: string) =>
      api<SprintDetalle>(`${base}/sprints/${id}/iniciar`, { metodo: 'POST' }),
    ),
    cerrar: accion(({ id, pendientes }: { id: string; pendientes: DestinoPendientes }) =>
      api<SprintDetalle>(`${base}/sprints/${id}/cerrar`, {
        metodo: 'POST',
        cuerpo: { pendientes },
      }),
    ),
    eliminar: accion((id: string) => api<void>(`${base}/sprints/${id}`, { metodo: 'DELETE' })),
    iniciarRetro: accion((sprintId: string) =>
      api<Retrospectiva>(`${base}/sprints/${sprintId}/retro`, { metodo: 'POST' }),
    ),
    agregarNota: accion(({ sprintId, ...nota }: CrearNotaRetro & { sprintId: string }) =>
      api<{ id: string }>(`${base}/sprints/${sprintId}/retro/notas`, {
        metodo: 'POST',
        cuerpo: nota,
      }),
    ),
    eliminarNota: accion((notaId: string) =>
      api<void>(`${base}/retro/notas/${notaId}`, { metodo: 'DELETE' }),
    ),
    votar: accion(({ notaId, dar }: { notaId: string; dar: boolean }) =>
      api<ResultadoVotoRetro>(`${base}/retro/notas/${notaId}/voto`, {
        metodo: 'POST',
        cuerpo: { dar },
      }),
    ),
    avanzar: accion(({ sprintId, fase }: { sprintId: string; fase: FaseRetro }) =>
      api<Retrospectiva>(`${base}/sprints/${sprintId}/retro/avanzar`, {
        metodo: 'POST',
        cuerpo: { fase },
      }),
    ),
    notaATarea: accion((notaId: string) =>
      api<{ id: string; codigo: number; estado: string }>(`${base}/retro/notas/${notaId}/tarea`, {
        metodo: 'POST',
      }),
    ),
  };
}
