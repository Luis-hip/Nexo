import { z } from 'zod';
import type { PersonaTarea, RolEquipo } from './equipos';

/**
 * WhatsApp (Fase 4.2 y 4.3, DEC-WA-1): tipos de las respuestas de la API y esquemas de las
 * peticiones. Las respuestas se validan con los esquemas de `respuestas.ts` («Fase 4 · WhatsApp»).
 */

export const PROVEEDORES_WA = ['simulado', 'cloud_api_grupos', 'cloud_api_directo'] as const;
export type ProveedorWa = (typeof PROVEEDORES_WA)[number];
export const ESTADOS_CONEXION_WA = ['sin_configurar', 'conectado', 'error', 'pausado'] as const;
export type EstadoConexionWa = (typeof ESTADOS_CONEXION_WA)[number];
export const ESTADOS_MENSAJE_WA = [
  'pendiente',
  'programado',
  'enviando',
  'enviado',
  'fallido',
  'cancelado',
] as const;
export type EstadoMensajeWa = (typeof ESTADOS_MENSAJE_WA)[number];
export const MODOS_REGLA_WA = ['instantaneo', 'reporte', 'apagado'] as const;
export type ModoReglaWa = (typeof MODOS_REGLA_WA)[number];

/** Las 6 reglas de `whatsapp_reglas`, en el orden del panel, con su nombre y qué las dispara. */
export const REGLAS_WA = [
  'reunion',
  'urgente',
  'asignacion',
  'aceptada',
  'triaje',
  'actualizacion',
] as const;
export type ReglaWa = (typeof REGLAS_WA)[number];
export const NOMBRE_REGLA_WA: Record<ReglaWa, { nombre: string; descripcion: string }> = {
  reunion: { nombre: 'Reuniones', descripcion: 'Al agendar, cambiar o cancelar una reunión.' },
  urgente: { nombre: 'Vencimientos', descripcion: 'Cuando una tarea vence en menos de 24 h.' },
  asignacion: {
    nombre: 'Asignaciones',
    descripcion: 'Cuando una tarea tiene responsable o lo rechaza.',
  },
  aceptada: { nombre: 'Tareas aceptadas', descripcion: 'Cuando una tarea entra al tablero.' },
  triaje: {
    nombre: 'Votaciones',
    descripcion: 'Propuestas nuevas y propuestas rechazadas en la votación.',
  },
  actualizacion: {
    nombre: 'Avances',
    descripcion: 'Cambios de estado, tareas completadas e inicio o cierre de sprint.',
  },
};
export const NOMBRE_MODO_WA: Record<ModoReglaWa, string> = {
  instantaneo: 'Al instante',
  reporte: 'En el reporte',
  apagado: 'No avisar',
};

export interface ConfiguracionWa {
  proveedor: ProveedorWa;
  estado: EstadoConexionWa;
  grupo_nombre: string | null;
  grupo_externo_id: string | null;
  enlace_invitacion: string | null;
  causa_error: string | null;
  ultimo_envio_en: string | null;
  reporte_frecuencia: 'diario' | 'semanal';
  /** «HH:MM» en la zona horaria del equipo. */
  reporte_hora: string;
  /** 1 = lunes … 7 = domingo (solo semanal). */
  reporte_dia: number;
  agrupar: boolean;
  silencio_desde: string | null;
  silencio_hasta: string | null;
  envio_automatico: boolean;
  ultimo_reporte_en: string | null;
  proximo_reporte: string | null;
}

export interface MensajeWa {
  id: string;
  tipo_evento: string;
  motivo: string;
  texto: string;
  tipo_envio: 'instantaneo' | 'reporte';
  estado: EstadoMensajeWa;
  seleccionado: boolean;
  programado_para: string | null;
  enviado_en: string | null;
  entregado_en: string | null;
  leido_en: string | null;
  enviado_por: PersonaTarea | null;
  intentos: number;
  ultimo_error: string | null;
  reporte_id: string | null;
  creado_en: string;
}

export interface PersonaWa extends PersonaTarea {
  rol: RolEquipo;
  /** `null` = no respondió. */
  consentimiento: boolean | null;
  en_grupo: boolean;
  tiene_numero: boolean;
}

export interface PanelWa {
  configuracion: ConfiguracionWa;
  reglas: { tipo_evento: ReglaWa; modo: ModoReglaWa }[];
  resumen: { en_cola: number; para_reporte: number; enviados_hoy: number; fallidos: number };
  personas: PersonaWa[];
}

export interface ColaWa {
  instantaneos: MensajeWa[];
  para_reporte: MensajeWa[];
  proximo_reporte: string | null;
}

export interface HistorialWa {
  items: MensajeWa[];
  hay_mas: boolean;
}

export interface WhatsAppUsuario {
  numero: string | null;
  consentimiento: boolean;
  consentimiento_en: string | null;
  equipos: {
    equipo_id: string;
    nombre: string;
    rol: RolEquipo;
    consentimiento: boolean | null;
    en_grupo: boolean;
    whatsapp_conectado: boolean;
    enlace_invitacion: string | null;
  }[];
}

/** Lo que devuelve la base para entregar un aviso con el proveedor del equipo. */
export interface AvisoParaEnviar {
  id: string;
  equipo_id: string;
  texto: string;
  proveedor: ProveedorWa;
  grupo_externo_id: string | null;
  destinatarios: string[];
}

export interface ResultadoEnvioWa {
  enviados: number;
  fallidos: number;
}

// ---------------------------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------------------------

const uuid = z.uuid('El identificador no es válido.');
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Escribe la hora como HH:MM.');

/** WA-06. */
export const esquemaConectarWa = z.object({
  proveedor: z.enum(PROVEEDORES_WA).default('simulado'),
  grupo_nombre: z
    .string()
    .trim()
    .min(2, 'Escribe el nombre del grupo.')
    .max(100, 'El nombre admite hasta 100 caracteres.'),
  grupo_externo_id: z.string().trim().max(120).optional(),
  enlace_invitacion: z.url('El enlace no es válido.').max(300).optional().or(z.literal('')),
});
export type ConectarWa = z.input<typeof esquemaConectarWa>;

/** WA-05 y WA-08. Solo lo que cambia. */
export const esquemaConfigurarWa = z
  .object({
    estado: z.enum(['conectado', 'pausado']),
    reporte_frecuencia: z.enum(['diario', 'semanal']),
    reporte_hora: hora,
    reporte_dia: z.number().int().min(1).max(7),
    agrupar: z.boolean(),
    envio_automatico: z.boolean(),
    silencio_desde: hora.nullable(),
    silencio_hasta: hora.nullable(),
    enlace_invitacion: z.string().trim().max(300),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar.' })
  .refine((d) => 'silencio_desde' in d === 'silencio_hasta' in d, {
    message: 'Indica el inicio y el fin de las horas de silencio.',
    path: ['silencio_desde'],
  });
export type ConfigurarWa = z.infer<typeof esquemaConfigurarWa>;

export const esquemaReglaWa = z.object({ modo: z.enum(MODOS_REGLA_WA) });

/** WA-02: corregir el texto o la selección de un aviso pendiente. */
export const esquemaEditarMensajeWa = z
  .object({
    texto: z
      .string()
      .trim()
      .min(1, 'El aviso no puede quedar vacío.')
      .max(400, 'Un aviso admite hasta 400 caracteres.'),
    seleccionado: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar.' });

/** Enviar, descartar o reintentar: los ids (sin ids, enviar toma los seleccionados). */
export const esquemaIdsWa = z.object({ ids: z.array(uuid).max(200).optional() });

export const esquemaHistorialWa = z.object({
  estado: z.enum(['enviado', 'fallido', 'cancelado']).optional(),
  antes: z.iso.datetime().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(30),
});

/** PF-05. */
export const esquemaWhatsAppUsuario = z
  .object({
    numero: z
      .string()
      .trim()
      .regex(/^(\+[1-9]\d{7,14})?$/, 'Escribe el número con lada internacional: +5212221234567.'),
    consentimiento: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar.' });

export const esquemaConsentimientoWa = z.object({ acepta: z.boolean() });
