import type {
  ConfiguracionEquipo,
  ConfigurarEquipo,
  GestionarInvitado,
  Liderazgo,
  Miembro,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { claves } from './consultas';

/**
 * Liderazgo y administración del equipo (Fase 3.5). Las claves cuelgan de `['equipo', id]`: un
 * cambio de líder o de miembros cambia el perfil de quien mira, así que se refresca todo el equipo
 * y la sesión (la lista de equipos y el rol en cada uno).
 */
const claveEquipo = (id: string) => ['equipo', id] as const;

export function useLiderazgo(equipoId: string, activo = true) {
  return useQuery({
    queryKey: [...claveEquipo(equipoId), 'liderazgo'],
    queryFn: () => api<Liderazgo>(`/equipos/${equipoId}/liderazgo`),
    enabled: activo,
    // El plazo de una elección puede vencer con la pantalla abierta.
    refetchInterval: 60_000,
  });
}

export function useConfiguracion(equipoId: string) {
  return useQuery({
    queryKey: [...claveEquipo(equipoId), 'configuracion'],
    queryFn: () => api<ConfiguracionEquipo>(`/equipos/${equipoId}/configuracion`),
  });
}

export function useAccionesLiderazgo(equipoId: string) {
  const qc = useQueryClient();
  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: claveEquipo(equipoId) });
    await qc.invalidateQueries({ queryKey: claves.yo });
  };
  const base = `/equipos/${equipoId}`;
  const accion = <V, R>(fn: (v: V) => Promise<R>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- se llama siempre en el mismo orden
    useMutation({ mutationFn: fn, onSettled: refrescar });

  return {
    transferir: accion(({ a_id, saldra }: { a_id: string; saldra: boolean }) =>
      api<Liderazgo>(`${base}/liderazgo/transferencias`, {
        metodo: 'POST',
        cuerpo: { a_id, saldra },
      }),
    ),
    responder: accion(({ id, acepta }: { id: string; acepta: boolean }) =>
      api<Liderazgo>(`${base}/liderazgo/transferencias/${id}/respuesta`, {
        metodo: 'POST',
        cuerpo: { acepta },
      }),
    ),
    cancelar: accion((id: string) =>
      api<Liderazgo>(`${base}/liderazgo/transferencias/${id}/cancelar`, { metodo: 'POST' }),
    ),
    convocar: accion(() => api<Liderazgo>(`${base}/liderazgo/eleccion`, { metodo: 'POST' })),
    votar: accion(({ eleccionId, candidatoId }: { eleccionId: string; candidatoId: string }) =>
      api<Liderazgo>(`${base}/liderazgo/eleccion/${eleccionId}/voto`, {
        metodo: 'POST',
        cuerpo: { candidato_id: candidatoId },
      }),
    ),
    salir: accion(() => api<{ salio: true }>(`${base}/salir`, { metodo: 'POST' })),
    expulsar: accion((membresiaId: string) =>
      api<Miembro[]>(`${base}/miembros/${membresiaId}/expulsar`, { metodo: 'POST' }),
    ),
    gestionarInvitado: accion(
      ({ membresiaId, ...datos }: GestionarInvitado & { membresiaId: string }) =>
        api<Miembro[]>(`${base}/miembros/${membresiaId}/invitado`, {
          metodo: 'POST',
          cuerpo: datos,
        }),
    ),
    configurar: accion((cambios: ConfigurarEquipo) =>
      api<ConfiguracionEquipo>(`${base}/configuracion`, { metodo: 'PATCH', cuerpo: cambios }),
    ),
    archivar: accion((archivar: boolean) =>
      api<ConfiguracionEquipo>(`${base}/archivar`, { metodo: 'POST', cuerpo: { archivar } }),
    ),
  };
}
