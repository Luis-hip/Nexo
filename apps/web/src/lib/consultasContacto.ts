import type {
  BandejaContacto,
  DetalleContacto,
  EstadoContacto,
  EventoContacto,
  FiltrosContacto,
  MensajeContacto,
  MetricasContacto,
  PermisosContacto,
  PersonaContacto,
  PrioridadContacto,
} from '@nexo/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, urlApi } from './api';

/** Panel de contacto (docs/12 §8.4). La API exige los permisos; aquí solo se consultan. */
const base = ['admin', 'contacto'] as const;

/** Filtros → query string (los arreglos como «a,b»). */
export function consultaFiltros(f: FiltrosContacto): Record<string, string> {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    q[k] = Array.isArray(v) ? v.join(',') : String(v);
  }
  return q;
}

export const urlExportar = (f: FiltrosContacto) => {
  // La exportación usa los filtros activos, sin la paginación.
  const qs = new URLSearchParams(
    consultaFiltros({ ...f, pagina: undefined, por_pagina: undefined }),
  ).toString();
  return urlApi(`/admin/contacto/exportar.csv${qs ? `?${qs}` : ''}`);
};

export function usePermisosContacto(activo = true) {
  return useQuery({
    queryKey: [...base, 'permisos'],
    queryFn: () => api<PermisosContacto>('/admin/contacto/permisos'),
    enabled: activo,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Indicador del menú: cada minuto y al volver a la pestaña. */
export function usePendientesContacto(activo: boolean) {
  return useQuery({
    queryKey: [...base, 'pendientes'],
    queryFn: () => api<{ nuevos: number }>('/admin/contacto/pendientes/conteo'),
    enabled: activo,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useBandejaContacto(f: FiltrosContacto) {
  return useQuery({
    queryKey: [...base, 'bandeja', f],
    queryFn: () => api<BandejaContacto>('/admin/contacto', { consulta: consultaFiltros(f) }),
    placeholderData: keepPreviousData,
  });
}

export function useDetalleContacto(id: string) {
  return useQuery({
    queryKey: [...base, 'detalle', id],
    queryFn: () => api<DetalleContacto>(`/admin/contacto/${id}`),
  });
}

export function useEquipoContacto() {
  return useQuery({
    queryKey: [...base, 'equipo'],
    queryFn: () => api<PersonaContacto[]>('/admin/contacto/equipo'),
    staleTime: 5 * 60_000,
  });
}

export function useMetricasContacto(desde?: string, hasta?: string) {
  return useQuery({
    queryKey: [...base, 'metricas', desde, hasta],
    queryFn: () =>
      api<MetricasContacto>('/admin/contacto/metricas', {
        consulta: { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) },
      }),
  });
}

export function useAccionesContacto(id: string) {
  const qc = useQueryClient();
  const listo = () => void qc.invalidateQueries({ queryKey: base });
  const useAccion = <A, R>(fn: (a: A) => Promise<R>) =>
    useMutation({ mutationFn: fn, onSuccess: listo });
  return {
    estado: useAccion((estado: EstadoContacto) =>
      api<MensajeContacto>(`/admin/contacto/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado } }),
    ),
    prioridad: useAccion((prioridad: PrioridadContacto) =>
      api<MensajeContacto>(`/admin/contacto/${id}/prioridad`, {
        metodo: 'PATCH',
        cuerpo: { prioridad },
      }),
    ),
    asignar: useAccion((asignado_a: string | null) =>
      api<MensajeContacto>(`/admin/contacto/${id}/asignacion`, {
        metodo: 'PATCH',
        cuerpo: { asignado_a },
      }),
    ),
    nota: useAccion((contenido: string) =>
      api<EventoContacto>(`/admin/contacto/${id}/notas`, { metodo: 'POST', cuerpo: { contenido } }),
    ),
    responder: useAccion(
      (d: { contenido: string; estado_resultante: 'esperando_usuario' | 'resuelto' | null }) =>
        api<EventoContacto>(`/admin/contacto/${id}/respuestas`, { metodo: 'POST', cuerpo: d }),
    ),
    reintentar: useAccion(() =>
      api<{ reintentados: number }>(`/admin/contacto/${id}/reintentar`, { metodo: 'POST' }),
    ),
    anonimizar: useAccion(() =>
      api<{ anonimizado: boolean }>(`/admin/contacto/${id}/datos`, { metodo: 'DELETE' }),
    ),
  };
}
