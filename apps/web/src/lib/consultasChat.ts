import {
  EVENTOS_CHAT,
  type EscribiendoChat,
  MENSAJES_POR_PAGINA,
  type ConversacionChat,
  type EnviarMensaje,
  type HiloChat,
  type MensajeATarea,
  type MensajeChat,
  type MiembroChat,
  type PaginaMensajes,
  type PreferenciasConversacion,
  type Reaccion,
  type ResultadoBusquedaChat,
  type ResultadoLectura,
  type ResultadoMensajeATarea,
  type ResultadoReaccion,
} from '@nexo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { api, urlApi } from './api';

/**
 * Chat del equipo (Fase 4.1). Todas las claves cuelgan de `['chat']`; los eventos de Socket.IO
 * solo invalidan lo afectado y la API vuelve a responder (así «yo» de las reacciones y los
 * no leídos son siempre los de quien mira).
 */
const claveChat = ['chat'] as const;
const claveConversaciones = (equipoId: string) =>
  [...claveChat, equipoId, 'conversaciones'] as const;
const claveMensajes = (conversacionId: string) =>
  [...claveChat, 'mensajes', conversacionId] as const;

export function useConversaciones(equipoId: string) {
  return useQuery({
    queryKey: claveConversaciones(equipoId),
    queryFn: () => api<ConversacionChat[]>(`/equipos/${equipoId}/chat/conversaciones`),
  });
}

/** Mensajes de una conversación: la primera página es la más reciente; las siguientes, más antiguas. */
export function useMensajes(conversacionId: string | undefined) {
  return useInfiniteQuery({
    queryKey: claveMensajes(conversacionId ?? 'ninguna'),
    enabled: !!conversacionId,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api<PaginaMensajes>(`/chat/conversaciones/${conversacionId}/mensajes`, {
        consulta: { antes: pageParam?.toString(), limite: String(MENSAJES_POR_PAGINA) },
      }),
    getNextPageParam: (pagina) => (pagina.hay_mas ? pagina.items[0]?.seq : undefined),
  });
}

/** Mensajes de la conversación en orden cronológico (de las páginas más antiguas a las más nuevas). */
export function aplanarMensajes(paginas: PaginaMensajes[] | undefined): MensajeChat[] {
  return [...(paginas ?? [])].reverse().flatMap((p) => p.items);
}

export function useHilo(mensajeId: string | undefined) {
  return useQuery({
    queryKey: [...claveChat, 'hilo', mensajeId],
    enabled: !!mensajeId,
    queryFn: () => api<HiloChat>(`/chat/mensajes/${mensajeId}/hilo`),
  });
}

export function useFijados(conversacionId: string | undefined, activo: boolean) {
  return useQuery({
    queryKey: [...claveChat, 'fijados', conversacionId],
    enabled: !!conversacionId && activo,
    queryFn: () => api<MensajeChat[]>(`/chat/conversaciones/${conversacionId}/fijados`),
  });
}

export function useMiembrosChat(conversacionId: string | undefined) {
  return useQuery({
    queryKey: [...claveChat, 'miembros', conversacionId],
    enabled: !!conversacionId,
    staleTime: 60_000,
    queryFn: () => api<MiembroChat[]>(`/chat/conversaciones/${conversacionId}/miembros`),
  });
}

export function useBusquedaChat(equipoId: string, texto: string, conversacionId?: string) {
  const q = texto.trim();
  return useQuery({
    queryKey: [...claveChat, equipoId, 'busqueda', q, conversacionId ?? null],
    enabled: q.length >= 2,
    queryFn: () =>
      api<ResultadoBusquedaChat[]>(`/equipos/${equipoId}/chat/buscar`, {
        consulta: { q, conversacion_id: conversacionId },
      }),
  });
}

/** Mensajes sin leer en todo el equipo (insignia de la barra de navegación). */
export function useNoLeidosChat(equipoId: string | null) {
  const consulta = useQuery({
    queryKey: claveConversaciones(equipoId ?? 'ninguno'),
    enabled: !!equipoId,
    queryFn: () => api<ConversacionChat[]>(`/equipos/${equipoId}/chat/conversaciones`),
    refetchInterval: 120_000,
  });
  return (consulta.data ?? []).filter((c) => !c.silenciada).reduce((n, c) => n + c.no_leidos, 0);
}

export function useAccionesChat(equipoId: string) {
  const qc = useQueryClient();
  const refrescar = (conversacionId?: string) => {
    void qc.invalidateQueries({ queryKey: claveConversaciones(equipoId) });
    if (conversacionId) void qc.invalidateQueries({ queryKey: claveMensajes(conversacionId) });
    void qc.invalidateQueries({ queryKey: [...claveChat, 'hilo'] });
    void qc.invalidateQueries({ queryKey: [...claveChat, 'fijados'] });
  };
  return {
    enviar: useMutation({
      mutationFn: ({ conversacionId, ...datos }: EnviarMensaje & { conversacionId: string }) =>
        api<MensajeChat>(`/chat/conversaciones/${conversacionId}/mensajes`, {
          metodo: 'POST',
          cuerpo: datos,
        }),
      onSettled: (_r, _e, v) => refrescar(v.conversacionId),
    }),
    editar: useMutation({
      mutationFn: ({ mensaje, texto }: { mensaje: MensajeChat; texto: string }) =>
        api<MensajeChat>(`/chat/mensajes/${mensaje.id}`, { metodo: 'PATCH', cuerpo: { texto } }),
      onSettled: (_r, _e, v) => refrescar(v.mensaje.conversacion_id),
    }),
    eliminar: useMutation({
      mutationFn: (m: MensajeChat) =>
        api<MensajeChat>(`/chat/mensajes/${m.id}`, { metodo: 'DELETE' }),
      onSettled: (_r, _e, m) => refrescar(m.conversacion_id),
    }),
    fijar: useMutation({
      mutationFn: ({ mensaje, fijado }: { mensaje: MensajeChat; fijado: boolean }) =>
        api<MensajeChat>(`/chat/mensajes/${mensaje.id}/fijar`, {
          metodo: 'POST',
          cuerpo: { fijado },
        }),
      onSettled: (_r, _e, v) => refrescar(v.mensaje.conversacion_id),
    }),
    reaccionar: useMutation({
      mutationFn: ({ mensaje, tipo }: { mensaje: MensajeChat; tipo: Reaccion }) =>
        api<ResultadoReaccion>(`/chat/mensajes/${mensaje.id}/reaccion`, {
          metodo: 'POST',
          cuerpo: { tipo },
        }),
      onSettled: (_r, _e, v) => refrescar(v.mensaje.conversacion_id),
    }),
    leer: useMutation({
      mutationFn: ({ conversacionId, hastaSeq }: { conversacionId: string; hastaSeq: number }) =>
        api<ResultadoLectura>(`/chat/conversaciones/${conversacionId}/lectura`, {
          metodo: 'POST',
          cuerpo: { hasta_seq: hastaSeq },
        }),
      onSettled: () => void qc.invalidateQueries({ queryKey: claveConversaciones(equipoId) }),
    }),
    preferencias: useMutation({
      mutationFn: ({
        conversacionId,
        ...cambios
      }: PreferenciasConversacion & { conversacionId: string }) =>
        api<ConversacionChat>(`/chat/conversaciones/${conversacionId}/preferencias`, {
          metodo: 'PATCH',
          cuerpo: cambios,
        }),
      onSettled: () => refrescar(),
    }),
    abrirDm: useMutation({
      mutationFn: (usuarioId: string) =>
        api<ConversacionChat>(`/equipos/${equipoId}/chat/dm`, {
          metodo: 'POST',
          cuerpo: { usuario_id: usuarioId },
        }),
      onSettled: () => refrescar(),
    }),
    abrirChatDeTarea: useMutation({
      mutationFn: (tareaId: string) =>
        api<ConversacionChat>(`/equipos/${equipoId}/chat/tareas/${tareaId}/conversacion`, {
          metodo: 'POST',
        }),
      onSettled: () => refrescar(),
    }),
    mensajeATarea: useMutation({
      mutationFn: ({ mensaje, ...datos }: MensajeATarea & { mensaje: MensajeChat }) =>
        api<ResultadoMensajeATarea>(`/chat/mensajes/${mensaje.id}/tarea`, {
          metodo: 'POST',
          cuerpo: datos,
        }),
      onSettled: (_r, _e, v) => {
        refrescar(v.mensaje.conversacion_id);
        void qc.invalidateQueries({ queryKey: ['equipo', equipoId] });
      },
    }),
  };
}

// --- Tiempo real ---------------------------------------------------------------------------

let socket: Socket | null = null;

/** Una sola conexión por pestaña; se autentica con la cookie de sesión (`withCredentials`). */
function conexion(): Socket {
  socket ??= io(urlApi('/'), { withCredentials: true, transports: ['websocket', 'polling'] });
  return socket;
}

function invalidarChat(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: claveChat });
}

/**
 * Mantiene el chat al día mientras la pantalla del equipo está abierta: cada evento del servidor
 * invalida las consultas afectadas y, al reconectar, se vuelve a pedir todo (lo perdido mientras
 * no había conexión llega por HTTP).
 */
export function useTiempoRealChat(activo: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!activo) return;
    const s = conexion();
    const alEvento = () => invalidarChat(qc);
    const alConectar = () => {
      s.emit('chat:sincronizar');
      invalidarChat(qc);
    };
    const eventos = [
      EVENTOS_CHAT.mensaje,
      EVENTOS_CHAT.mensajeEditado,
      EVENTOS_CHAT.reaccion,
      EVENTOS_CHAT.lectura,
      EVENTOS_CHAT.conversacionNueva,
    ];
    eventos.forEach((e) => s.on(e, alEvento));
    s.on('connect', alConectar);
    if (!s.connected) s.connect();
    return () => {
      eventos.forEach((e) => s.off(e, alEvento));
      s.off('connect', alConectar);
    };
  }, [activo, qc]);
}

let ultimoAviso = 0;

/** Avisa a la conversación que estoy escribiendo (como mucho cada 2 s; no se guarda). */
export function avisarEscribiendo(conversacionId: string) {
  if (Date.now() - ultimoAviso < 2000) return;
  ultimoAviso = Date.now();
  conexion().emit(EVENTOS_CHAT.escribiendo, { conversacion_id: conversacionId });
}

/** Nombres de quienes escriben ahora en la conversación (se borran a los 4 s sin avisos). */
export function useEscribiendo(conversacionId: string): string[] {
  const [quienes, setQuienes] = useState<Record<string, { nombre: string; hasta: number }>>({});
  useEffect(() => {
    const s = conexion();
    const alEscribir = (e: EscribiendoChat) => {
      if (e.conversacion_id !== conversacionId) return;
      setQuienes((q) => ({ ...q, [e.usuario_id]: { nombre: e.nombre, hasta: Date.now() + 4000 } }));
    };
    s.on(EVENTOS_CHAT.escribiendo, alEscribir);
    const limpiar = setInterval(() => {
      setQuienes((q) => {
        const vivos = Object.entries(q).filter(([, v]) => v.hasta > Date.now());
        return vivos.length === Object.keys(q).length ? q : Object.fromEntries(vivos);
      });
    }, 1000);
    return () => {
      s.off(EVENTOS_CHAT.escribiendo, alEscribir);
      clearInterval(limpiar);
      setQuienes({});
    };
  }, [conversacionId]);
  return Object.values(quienes).map((v) => v.nombre);
}

/** Cierra la conexión (al cerrar sesión). */
export function cerrarTiempoRealChat() {
  socket?.disconnect();
  socket = null;
}
