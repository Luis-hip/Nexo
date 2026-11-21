import type {
  Archivo,
  CalendarioEquipo,
  CrearPlantilla,
  CrearReunion,
  EditarReunion,
  Notificaciones,
  PaginaActividad,
  Plantilla,
  ReporteEquipo,
  Reunion,
  TipoActividad,
} from '@nexo/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Vistas secundarias del equipo (Fase 3.4) y notificaciones. Las claves del equipo cuelgan de
 * `['equipo', id]`; las notificaciones son de la persona (`['notificaciones']`).
 */
const claveEquipo = (id: string) => ['equipo', id] as const;
const claveNotificaciones = ['notificaciones'] as const;

export function useCalendario(equipoId: string, desde: Date, hasta: Date) {
  return useQuery({
    queryKey: [...claveEquipo(equipoId), 'calendario', desde.toISOString(), hasta.toISOString()],
    queryFn: () =>
      api<CalendarioEquipo>(`/equipos/${equipoId}/calendario`, {
        consulta: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      }),
  });
}

export function useReporte(equipoId: string) {
  return useQuery({
    queryKey: [...claveEquipo(equipoId), 'reporte'],
    queryFn: () => api<ReporteEquipo>(`/equipos/${equipoId}/reportes`),
  });
}

export function useActividad(equipoId: string, tipo: TipoActividad | undefined) {
  return useInfiniteQuery({
    queryKey: [...claveEquipo(equipoId), 'actividad', tipo ?? 'todo'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<PaginaActividad>(`/equipos/${equipoId}/actividad`, {
        consulta: { tipo, antes: pageParam, limite: '30' },
      }),
    getNextPageParam: (ultima) => (ultima.hay_mas ? ultima.items.at(-1)?.creado_en : undefined),
  });
}

export function usePlantillas(equipoId: string) {
  return useQuery({
    queryKey: [...claveEquipo(equipoId), 'plantillas'],
    queryFn: () => api<Plantilla[]>(`/equipos/${equipoId}/plantillas`),
  });
}

/** Archivos del equipo; con `tareaId`, solo los adjuntos de esa tarea (EQ-06). */
export function useArchivos(equipoId: string, tareaId?: string, activo = true) {
  return useQuery({
    queryKey: [...claveEquipo(equipoId), 'archivos', tareaId ?? 'todos'],
    queryFn: () =>
      api<Archivo[]>(`/equipos/${equipoId}/archivos`, { consulta: { tarea_id: tareaId } }),
    enabled: activo,
  });
}

export function useNotificaciones(activo = true) {
  return useQuery({
    queryKey: claveNotificaciones,
    queryFn: () => api<Notificaciones>('/notificaciones'),
    enabled: activo,
    refetchInterval: 60_000,
  });
}

/** Acciones de las vistas del equipo. Después de cada una se refresca el equipo. */
export function useAccionesVistas(equipoId: string) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: claveEquipo(equipoId) });
  const base = `/equipos/${equipoId}`;
  const accion = <V, R>(fn: (v: V) => Promise<R>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- se llama siempre en el mismo orden
    useMutation({ mutationFn: fn, onSettled: refrescar });

  return {
    crearReunion: accion((datos: Partial<CrearReunion> & { titulo: string; inicio: string }) =>
      api<Reunion>(`${base}/reuniones`, { metodo: 'POST', cuerpo: datos }),
    ),
    editarReunion: accion(({ id, ...cambios }: EditarReunion & { id: string }) =>
      api<Reunion>(`${base}/reuniones/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    ),
    cancelarReunion: accion((id: string) =>
      api<{ cancelada: true }>(`${base}/reuniones/${id}/cancelar`, { metodo: 'POST' }),
    ),
    responderReunion: accion(
      ({ id, respuesta }: { id: string; respuesta: 'si' | 'no' | 'quiza' }) =>
        api<Reunion>(`${base}/reuniones/${id}/asistencia`, {
          metodo: 'POST',
          cuerpo: { respuesta },
        }),
    ),
    crearPlantilla: accion((datos: Partial<CrearPlantilla> & Omit<CrearPlantilla, 'descripcion'>) =>
      api<Plantilla>(`${base}/plantillas`, { metodo: 'POST', cuerpo: datos }),
    ),
    usarPlantilla: accion((id: string) =>
      api<{ creadas: number }>(`${base}/plantillas/${id}/usar`, { metodo: 'POST' }),
    ),
    eliminarPlantilla: accion((id: string) =>
      api<void>(`${base}/plantillas/${id}`, { metodo: 'DELETE' }),
    ),
    subirArchivo: accion(
      (datos: { nombre: string; mime: string; contenido_base64: string; tarea_id?: string }) =>
        api<Archivo>(`${base}/archivos`, { metodo: 'POST', cuerpo: datos }),
    ),
    eliminarArchivo: accion((id: string) =>
      api<void>(`${base}/archivos/${id}`, { metodo: 'DELETE' }),
    ),
  };
}

export function useAccionesNotificaciones() {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: claveNotificaciones });
  return {
    marcar: useMutation({
      mutationFn: (id: string) =>
        api<{ no_leidas: number }>(`/notificaciones/${id}/leida`, { metodo: 'POST' }),
      onSettled: refrescar,
    }),
    marcarTodas: useMutation({
      mutationFn: () => api<{ no_leidas: number }>('/notificaciones/leidas', { metodo: 'POST' }),
      onSettled: refrescar,
    }),
  };
}

/** Lee un archivo del navegador como base64 (sin el prefijo `data:…;base64,`). */
export function leerBase64(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).replace(/^data:[^,]*,/, ''));
    lector.onerror = () => rechazar(lector.error ?? new Error('No se pudo leer el archivo.'));
    lector.readAsDataURL(archivo);
  });
}
