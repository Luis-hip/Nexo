import { z } from 'zod';
import type { PersonaTarea, RolEquipo } from './equipos';

/**
 * Chat en tiempo real (Fase 4.1, CH-01 a CH-10): tipos de las respuestas de la API, esquemas de
 * las peticiones y de los eventos de Socket.IO. Los esquemas de las respuestas están en
 * `respuestas.ts` (sección «Fase 4 · Chat»).
 */

export const TIPOS_CONVERSACION = ['equipo', 'invitados', 'tarea', 'dm'] as const;
export type TipoConversacion = (typeof TIPOS_CONVERSACION)[number];

/** Las 6 reacciones de la BD (`tipo_reaccion`) con su glifo. */
export const REACCIONES = ['ok', 'corazon', 'risa', 'fiesta', 'visto', 'hecho'] as const;
export type Reaccion = (typeof REACCIONES)[number];
export const GLIFO_REACCION: Record<Reaccion, string> = {
  ok: '👍',
  corazon: '❤️',
  risa: '😂',
  fiesta: '🎉',
  visto: '👀',
  hecho: '✅',
};
export const ETIQUETA_REACCION: Record<Reaccion, string> = {
  ok: 'De acuerdo',
  corazon: 'Me encanta',
  risa: 'Me da risa',
  fiesta: 'Celebrar',
  visto: 'Visto',
  hecho: 'Hecho',
};

/** Largo máximo de un mensaje (lo exige también la BD). */
export const MAX_CARACTERES_MENSAJE = 4000;
/** Mensajes por página. */
export const MENSAJES_POR_PAGINA = 40;

export interface ReaccionResumen {
  tipo: Reaccion;
  total: number;
  /** Si la persona que consulta reaccionó con este tipo. */
  yo: boolean;
}

export interface TareaVinculada {
  id: string;
  codigo: number;
  titulo: string;
}

export interface MensajeChat {
  id: string;
  /** Orden total en la BD; sirve de cursor de paginación y de puntero de lectura. */
  seq: number;
  conversacion_id: string;
  /** `null` en los mensajes de sistema. */
  autor: PersonaTarea | null;
  es_sistema: boolean;
  /** Vacío si el mensaje se eliminó. */
  texto: string;
  eliminado: boolean;
  /** Raíz del hilo si es una respuesta. */
  hilo_de_id: string | null;
  respuestas: number;
  fijado: boolean;
  tarea: TareaVinculada | null;
  reacciones: ReaccionResumen[];
  menciones: string[];
  leido_por: number;
  creado_en: string;
  editado_en: string | null;
}

export interface ConversacionChat {
  id: string;
  equipo_id: string;
  tipo: TipoConversacion;
  nombre: string;
  tarea: TareaVinculada | null;
  /** La otra persona, en un mensaje directo. */
  con: PersonaTarea | null;
  ultimo: {
    texto: string;
    autor_nombre: string | null;
    es_sistema: boolean;
    creado_en: string;
  } | null;
  no_leidos: number;
  menciones_sin_leer: number;
  fijada: boolean;
  silenciada: boolean;
}

export interface PaginaMensajes {
  conversacion: ConversacionChat;
  /** Del más antiguo al más nuevo. */
  items: MensajeChat[];
  hay_mas: boolean;
}

export interface HiloChat {
  raiz: MensajeChat;
  respuestas: MensajeChat[];
}

export interface MiembroChat extends PersonaTarea {
  rol: RolEquipo;
}

export interface ResultadoBusquedaChat {
  mensaje_id: string;
  seq: number;
  conversacion_id: string;
  tipo: TipoConversacion;
  conversacion: string;
  autor: PersonaTarea | null;
  /** Texto con lo encontrado entre «…». */
  fragmento: string;
  creado_en: string;
}

export interface ResultadoReaccion {
  mensaje_id: string;
  conversacion_id: string;
  reacciones: ReaccionResumen[];
}

export interface ResultadoLectura {
  conversacion_id: string;
  ultimo_leido_seq: number;
  no_leidos: number;
}

export interface ResultadoMensajeATarea {
  tarea: { id: string; codigo: number; estado: string };
  mensaje: MensajeChat;
  sistema: MensajeChat;
}

// ---------------------------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------------------------

const uuid = z.uuid('El identificador no es válido.');

/** Cuerpo de POST …/conversaciones/:id/mensajes (CH-02, CH-05). */
export const esquemaEnviarMensaje = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe un mensaje.')
    .max(MAX_CARACTERES_MENSAJE, `Máximo ${MAX_CARACTERES_MENSAJE} caracteres.`),
  hilo_de_id: uuid.optional(),
  /** Identificador generado por el cliente: reenviar el mismo no duplica el mensaje. */
  id_cliente: uuid.optional(),
  menciones: z.array(uuid).max(20, 'Demasiadas menciones.').default([]),
});
export type EnviarMensaje = z.input<typeof esquemaEnviarMensaje>;

export const esquemaReaccionar = z.object({ tipo: z.enum(REACCIONES) });
export const esquemaFijarMensaje = z.object({ fijado: z.boolean() });
export const esquemaLeerConversacion = z.object({
  hasta_seq: z.number().int().min(0),
});
export const esquemaPreferenciasConversacion = z
  .object({ fijada: z.boolean(), silenciada: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar.' });
export type PreferenciasConversacion = z.infer<typeof esquemaPreferenciasConversacion>;

export const esquemaAbrirDm = z.object({ usuario_id: uuid });

/** Cuerpo de POST …/chat/mensajes/:id/tarea (CH-09). Todo es opcional. */
export const esquemaMensajeATarea = z.object({
  titulo: z.string().trim().min(1).max(140, 'El título admite hasta 140 caracteres.').optional(),
  descripcion: z.string().max(4000).optional(),
  prioridad: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
  responsable_id: uuid.optional(),
});
export type MensajeATarea = z.infer<typeof esquemaMensajeATarea>;

export const esquemaConsultaMensajes = z.object({
  antes: z.coerce.number().int().min(1).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(MENSAJES_POR_PAGINA),
});

export const esquemaBuscarChat = z.object({
  q: z.string().trim().min(2, 'Escribe al menos 2 caracteres.').max(100),
  conversacion_id: uuid.optional(),
});

// ---------------------------------------------------------------------------------------------
// Eventos de Socket.IO (servidor → cliente)
// ---------------------------------------------------------------------------------------------

/** Nombres de los eventos que el servidor emite a las salas de conversación. */
export const EVENTOS_CHAT = {
  mensaje: 'chat:mensaje',
  mensajeEditado: 'chat:mensaje_actualizado',
  reaccion: 'chat:reaccion',
  lectura: 'chat:lectura',
  conversacionNueva: 'chat:conversacion_nueva',
  /** Cliente → servidor y servidor → sala: alguien está escribiendo (no se guarda). */
  escribiendo: 'chat:escribiendo',
} as const;

/** Lo que recibe la sala cuando alguien escribe. */
export interface EscribiendoChat {
  conversacion_id: string;
  usuario_id: string;
  nombre: string;
}
