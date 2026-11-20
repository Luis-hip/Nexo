import type {
  ColaWa,
  ConectarWa,
  ConfiguracionWa,
  ConfigurarWa,
  HistorialWa,
  MensajeWa,
  ModoReglaWa,
  PanelWa,
  ReglaWa,
  ResultadoEnvioWa,
  WhatsAppUsuario,
} from '@nexo/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * WhatsApp (Fase 4.2, WA-01 a WA-08 y PF-05). Las claves del equipo cuelgan de
 * `['equipo', id, 'whatsapp']`; las de la persona, de `['yo', 'whatsapp']`.
 */
const clave = (equipoId: string) => ['equipo', equipoId, 'whatsapp'] as const;
const claveYo = ['yo', 'whatsapp'] as const;

export function usePanelWa(equipoId: string) {
  return useQuery({
    queryKey: [...clave(equipoId), 'panel'],
    queryFn: () => api<PanelWa>(`/equipos/${equipoId}/whatsapp`),
  });
}

export function useColaWa(equipoId: string) {
  return useQuery({
    queryKey: [...clave(equipoId), 'cola'],
    queryFn: () => api<ColaWa>(`/equipos/${equipoId}/whatsapp/cola`),
    refetchInterval: 30_000,
  });
}

export function useHistorialWa(equipoId: string, estado?: 'enviado' | 'fallido' | 'cancelado') {
  return useInfiniteQuery({
    queryKey: [...clave(equipoId), 'historial', estado ?? 'todo'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<HistorialWa>(`/equipos/${equipoId}/whatsapp/historial`, {
        consulta: { estado, antes: pageParam, limite: '30' },
      }),
    getNextPageParam: (u) =>
      u.hay_mas ? (u.items.at(-1)?.enviado_en ?? u.items.at(-1)?.creado_en) : undefined,
  });
}

export function useAccionesWa(equipoId: string) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: clave(equipoId) });
  const base = `/equipos/${equipoId}/whatsapp`;
  const accion = <V, R>(fn: (v: V) => Promise<R>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- se llama siempre en el mismo orden
    useMutation({ mutationFn: fn, onSettled: refrescar });
  return {
    conectar: accion((datos: ConectarWa) =>
      api<ConfiguracionWa>(`${base}/conectar`, { metodo: 'POST', cuerpo: datos }),
    ),
    desconectar: accion(() => api<ConfiguracionWa>(`${base}/desconectar`, { metodo: 'POST' })),
    configurar: accion((cambios: ConfigurarWa) =>
      api<ConfiguracionWa>(`${base}/configuracion`, { metodo: 'PATCH', cuerpo: cambios }),
    ),
    regla: accion(({ tipo, modo }: { tipo: ReglaWa; modo: ModoReglaWa }) =>
      api<{ modo: string }>(`${base}/reglas/${tipo}`, { metodo: 'PUT', cuerpo: { modo } }),
    ),
    editar: accion(({ id, ...cambios }: { id: string; texto?: string; seleccionado?: boolean }) =>
      api<MensajeWa>(`/whatsapp/mensajes/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    ),
    enviar: accion((ids?: string[]) =>
      api<ResultadoEnvioWa>(`${base}/cola/enviar`, { metodo: 'POST', cuerpo: ids ? { ids } : {} }),
    ),
    descartar: accion((ids: string[]) =>
      api<{ descartados: number }>(`${base}/cola/descartar`, { metodo: 'POST', cuerpo: { ids } }),
    ),
    reintentar: accion((ids?: string[]) =>
      api<{ reintentados: number }>(`${base}/cola/reintentar`, {
        metodo: 'POST',
        cuerpo: ids ? { ids } : {},
      }),
    ),
  };
}

export function useWhatsAppYo() {
  return useQuery({ queryKey: claveYo, queryFn: () => api<WhatsAppUsuario>('/yo/whatsapp') });
}

export function useAccionesWhatsAppYo() {
  const qc = useQueryClient();
  const listo = (d: WhatsAppUsuario) => qc.setQueryData(claveYo, d);
  return {
    guardar: useMutation({
      mutationFn: (cambios: { numero?: string; consentimiento?: boolean }) =>
        api<WhatsAppUsuario>('/yo/whatsapp', { metodo: 'PATCH', cuerpo: cambios }),
      onSuccess: listo,
    }),
    consentimiento: useMutation({
      mutationFn: ({ equipoId, acepta }: { equipoId: string; acepta: boolean }) =>
        api<WhatsAppUsuario>(`/equipos/${equipoId}/whatsapp/consentimiento`, {
          metodo: 'PUT',
          cuerpo: { acepta },
        }),
      onSuccess: (d, v) => {
        listo(d);
        void qc.invalidateQueries({ queryKey: clave(v.equipoId) });
      },
    }),
  };
}
