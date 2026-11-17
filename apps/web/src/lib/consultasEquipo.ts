import type {
  CambiarEstado,
  ComentarioEquipo,
  ConteosTareas,
  CrearEquipo,
  CrearInvitacion,
  CrearTareaEquipo,
  EditarTareaEquipo,
  EquipoDetalle,
  Invitacion,
  MoverTarea,
  TareaEquipo,
  TareaEquipoDetalle,
  VistaInvitacion,
  Voto,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { claves } from './consultas';

export type VistaTareas = 'tablero' | 'backlog' | 'votacion' | 'mias' | 'todas';

const clavesEquipo = {
  equipo: (id: string) => ['equipo', id] as const,
  detalle: (id: string) => ['equipo', id, 'detalle'] as const,
  tareas: (id: string, vista: VistaTareas) => ['equipo', id, 'tareas', vista] as const,
  conteos: (id: string) => ['equipo', id, 'tareas', 'conteos'] as const,
  tarea: (id: string, tareaId: string) => ['equipo', id, 'tarea', tareaId] as const,
  invitaciones: (id: string) => ['equipo', id, 'invitaciones'] as const,
  invitacion: (codigo: string) => ['invitacion', codigo] as const,
};

// ---------------------------------------------------------------------------------------------
// Equipos e invitaciones
// ---------------------------------------------------------------------------------------------

export function useEquipo(equipoId: string) {
  return useQuery({
    queryKey: clavesEquipo.detalle(equipoId),
    queryFn: () => api<EquipoDetalle>(`/equipos/${equipoId}`),
  });
}

export function useCrearEquipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Partial<CrearEquipo> & { nombre: string }) =>
      api<{ id: string }>('/equipos', { metodo: 'POST', cuerpo: datos }),
    // La lista de equipos de la sesión cambia.
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.yo }),
  });
}

export function useInvitaciones(equipoId: string, activo = true) {
  return useQuery({
    queryKey: clavesEquipo.invitaciones(equipoId),
    queryFn: () => api<Invitacion[]>(`/equipos/${equipoId}/invitaciones`),
    enabled: activo,
  });
}

export function useCrearInvitacion(equipoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: Partial<CrearInvitacion> & Pick<CrearInvitacion, 'rol_destino'>) =>
      api<Invitacion>(`/equipos/${equipoId}/invitaciones`, { metodo: 'POST', cuerpo: datos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEquipo.invitaciones(equipoId) }),
  });
}

export function useRevocarInvitacion(equipoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitacionId: string) =>
      api<Invitacion>(`/equipos/${equipoId}/invitaciones/${invitacionId}/revocar`, {
        metodo: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: clavesEquipo.invitaciones(equipoId) }),
  });
}

/** Vista previa de una invitación; `codigo` vacío deja la consulta apagada. */
export function useVistaInvitacion(codigo: string) {
  return useQuery({
    queryKey: clavesEquipo.invitacion(codigo),
    queryFn: () => api<VistaInvitacion>(`/invitaciones/${encodeURIComponent(codigo)}`),
    enabled: codigo.length > 0,
    retry: false,
  });
}

export function useAceptarInvitacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (codigo: string) =>
      api<{ equipo_id: string; rol: 'integrante' | 'invitado' }>(
        `/invitaciones/${encodeURIComponent(codigo)}/aceptar`,
        { metodo: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.yo }),
  });
}

// ---------------------------------------------------------------------------------------------
// Tareas de equipo
// ---------------------------------------------------------------------------------------------

export function useTareasEquipo(equipoId: string, vista: VistaTareas, activo = true) {
  return useQuery({
    queryKey: clavesEquipo.tareas(equipoId, vista),
    queryFn: () => api<TareaEquipo[]>(`/equipos/${equipoId}/tareas`, { consulta: { vista } }),
    enabled: activo,
  });
}

export function useConteosTareas(equipoId: string, activo = true) {
  return useQuery({
    queryKey: clavesEquipo.conteos(equipoId),
    queryFn: () => api<ConteosTareas>(`/equipos/${equipoId}/tareas/conteos`),
    enabled: activo,
  });
}

export function useTareaEquipo(equipoId: string, tareaId: string | undefined) {
  return useQuery({
    queryKey: clavesEquipo.tarea(equipoId, tareaId ?? ''),
    queryFn: () => api<TareaEquipoDetalle>(`/equipos/${equipoId}/tareas/${tareaId}`),
    enabled: !!tareaId,
  });
}

/**
 * Acciones sobre las tareas de un equipo. Tras cada una (también si falla: un 409 significa
 * que la copia local quedó vieja) se vuelve a consultar todo lo del equipo.
 */
export function useAccionesTarea(equipoId: string) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: clavesEquipo.equipo(equipoId) });
  const base = `/equipos/${equipoId}/tareas`;
  const accion = <V, R = TareaEquipoDetalle>(fn: (v: V) => Promise<R>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- se llama siempre en el mismo orden
    useMutation({ mutationFn: fn, onSettled: refrescar });

  return {
    crear: accion((datos: Partial<CrearTareaEquipo> & { titulo: string }) =>
      api<TareaEquipoDetalle>(base, { metodo: 'POST', cuerpo: datos }),
    ),
    editar: accion(({ id, ...cambios }: EditarTareaEquipo & { id: string }) =>
      api<TareaEquipoDetalle>(`${base}/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    ),
    eliminar: accion((id: string) => api<void>(`${base}/${id}`, { metodo: 'DELETE' })),
    estado: accion(({ id, ...cuerpo }: CambiarEstado & { id: string }) =>
      api<TareaEquipoDetalle>(`${base}/${id}/estado`, { metodo: 'POST', cuerpo }),
    ),
    mover: accion(({ id, ...cuerpo }: MoverTarea & { id: string }) =>
      api<TareaEquipoDetalle>(`${base}/${id}/mover`, { metodo: 'POST', cuerpo }),
    ),
    // Votación de propuestas (DEC-024): votan los integrantes; el líder retira o reformula.
    votar: accion(({ id, ...cuerpo }: { id: string; voto: Voto; comentario?: string }) =>
      api<TareaEquipoDetalle>(`${base}/${id}/voto`, { metodo: 'POST', cuerpo }),
    ),
    retirar: accion(({ id, version }: { id: string; version: number }) =>
      api<TareaEquipoDetalle>(`${base}/${id}/retirar`, { metodo: 'POST', cuerpo: { version } }),
    ),
    reformular: accion(
      ({ id, ...datos }: Partial<CrearTareaEquipo> & { id: string; titulo: string }) =>
        api<TareaEquipoDetalle>(`${base}/${id}/reformular`, { metodo: 'POST', cuerpo: datos }),
    ),
    asignar: accion(
      ({ id, ...cuerpo }: { id: string; version: number; responsable_id: string | null }) =>
        api<TareaEquipoDetalle>(`${base}/${id}/asignar`, { metodo: 'POST', cuerpo }),
    ),
    responder: accion(({ id, ...cuerpo }: { id: string; acepta: boolean; motivo?: string }) =>
      api<TareaEquipoDetalle>(`${base}/${id}/asignacion`, { metodo: 'POST', cuerpo }),
    ),
    compartir: accion(({ id, membresia_ids }: { id: string; membresia_ids: string[] }) =>
      api<TareaEquipoDetalle>(`${base}/${id}/compartida`, {
        metodo: 'PUT',
        cuerpo: { membresia_ids },
      }),
    ),
    crearSubtarea: accion(({ id, titulo }: { id: string; titulo: string }) =>
      api<{ id: string }>(`${base}/${id}/subtareas`, { metodo: 'POST', cuerpo: { titulo } }),
    ),
    actualizarSubtarea: accion(
      ({
        id,
        subId,
        ...cambios
      }: {
        id: string;
        subId: string;
        hecha?: boolean;
        titulo?: string;
      }) =>
        api<{ id: string }>(`${base}/${id}/subtareas/${subId}`, {
          metodo: 'PATCH',
          cuerpo: cambios,
        }),
    ),
    eliminarSubtarea: accion(({ id, subId }: { id: string; subId: string }) =>
      api<void>(`${base}/${id}/subtareas/${subId}`, { metodo: 'DELETE' }),
    ),
    comentar: accion(({ id, texto }: { id: string; texto: string }) =>
      api<ComentarioEquipo>(`${base}/${id}/comentarios`, { metodo: 'POST', cuerpo: { texto } }),
    ),
    eliminarComentario: accion(({ id, comentarioId }: { id: string; comentarioId: string }) =>
      api<void>(`${base}/${id}/comentarios/${comentarioId}`, { metodo: 'DELETE' }),
    ),
  };
}
