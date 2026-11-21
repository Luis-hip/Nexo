import { z } from 'zod';

/**
 * Módulo de contacto y soporte (docs/12_Plan_Contacto.md; ajustes en docs/13, sección 2).
 * Tipos y validaciones compartidos por la API y la web.
 */

export const ESTADOS_CONTACTO = [
  'nuevo',
  'en_revision',
  'esperando_usuario',
  'resuelto',
  'descartado',
] as const;
export type EstadoContacto = (typeof ESTADOS_CONTACTO)[number];

export const NOMBRE_ESTADO_CONTACTO: Record<EstadoContacto, string> = {
  nuevo: 'Nuevo',
  en_revision: 'En revisión',
  esperando_usuario: 'Esperando respuesta',
  resuelto: 'Resuelto',
  descartado: 'Descartado',
};

/** Matriz de transiciones (plan 4.1); la BD la vuelve a exigir. */
export const TRANSICIONES_CONTACTO: Record<EstadoContacto, EstadoContacto[]> = {
  nuevo: ['en_revision', 'resuelto', 'descartado'],
  en_revision: ['esperando_usuario', 'resuelto', 'descartado'],
  esperando_usuario: ['en_revision', 'resuelto', 'descartado'],
  resuelto: ['en_revision'],
  descartado: ['en_revision'],
};

export const PRIORIDADES_CONTACTO = ['baja', 'normal', 'alta'] as const;
export type PrioridadContacto = (typeof PRIORIDADES_CONTACTO)[number];
export const NOMBRE_PRIORIDAD_CONTACTO: Record<PrioridadContacto, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
};

export const TIPOS_MENSAJE_CONTACTO = ['duda', 'error', 'sugerencia'] as const;
export type TipoContacto = (typeof TIPOS_MENSAJE_CONTACTO)[number];
export const NOMBRE_TIPO_CONTACTO: Record<TipoContacto, { nombre: string; descripcion: string }> = {
  duda: { nombre: 'Duda', descripcion: 'No sabes cómo hacer algo en Nexo.' },
  error: { nombre: 'Error', descripcion: 'Algo no funciona como debería.' },
  sugerencia: { nombre: 'Sugerencia', descripcion: 'Una idea para mejorar Nexo.' },
};

/** Quita caracteres de control (menos saltos de línea y tabuladores) y espacios sobrantes. */
export const limpiarTexto = (t: string) =>
  t
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const texto = (min: number, max: number, corto: string, largo: string) =>
  z.string().transform(limpiarTexto).pipe(z.string().min(min, corto).max(max, largo));

/** Contexto técnico que la web adjunta a un reporte de error (solo estas claves, ≤ 300). */
export const esquemaContextoContacto = z
  .object({
    url: z.string().max(300).optional(),
    navegador: z.string().max(300).optional(),
    version_app: z.string().max(300).optional(),
    idioma: z.string().max(300).optional(),
  })
  .strip();
export type ContextoContacto = z.infer<typeof esquemaContextoContacto>;

/** Cuerpo de POST /contacto. Con sesión, nombre y correo salen de la cuenta. */
export const esquemaContacto = z.object({
  tipo: z.enum(TIPOS_MENSAJE_CONTACTO),
  nombre: texto(
    2,
    100,
    'Escribe tu nombre (mínimo 2 caracteres).',
    'Usa 100 caracteres como máximo.',
  ),
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email('Escribe un correo válido, por ejemplo nombre@dominio.com.'),
  asunto: texto(
    3,
    150,
    'Escribe un asunto (mínimo 3 caracteres).',
    'Usa 150 caracteres como máximo.',
  ),
  mensaje: texto(
    10,
    5000,
    'Cuéntanos un poco más (mínimo 10 caracteres).',
    'El mensaje admite hasta 5000 caracteres.',
  ),
  contexto: esquemaContextoContacto.optional(),
  captcha_token: z.string().max(4000).optional(),
  /** Trampa para bots: el campo está oculto y debe llegar vacío. */
  web: z.string().max(500).optional(),
  acepta_privacidad: z.literal(true, { message: 'Acepta el aviso de privacidad para enviar.' }),
});
export type DatosContacto = z.input<typeof esquemaContacto>;
export type Contacto = z.infer<typeof esquemaContacto>;

export interface ContactoEnviado {
  folio: string;
  mensaje: string;
}

export interface SeguimientoContacto {
  folio: string;
  tipo: TipoContacto;
  asunto: string;
  estado: EstadoContacto;
  creado_en: string;
  actualizado_en: string;
  respuestas: { contenido: string; creado_en: string }[];
}

export interface PersonaContacto {
  id: string;
  nombre: string;
}

export interface MensajeContacto {
  id: string;
  folio: string;
  tipo: TipoContacto;
  estado: EstadoContacto;
  prioridad: PrioridadContacto;
  nombre: string;
  correo: string;
  asunto: string;
  registrado: boolean;
  asignado: PersonaContacto | null;
  anonimizado: boolean;
  creado_en: string;
  actualizado_en: string;
  atendido_en: string | null;
  resuelto_en: string | null;
  extracto?: string;
  mensaje?: string;
  contexto?: ContextoContacto;
  user_agent?: string | null;
}

export type TipoEventoContacto =
  | 'creado'
  | 'nota_interna'
  | 'respuesta'
  | 'cambio_estado'
  | 'cambio_prioridad'
  | 'asignacion'
  | 'sistema';

export interface EventoContacto {
  id: string;
  tipo: TipoEventoContacto;
  autor: PersonaContacto | null;
  contenido: string | null;
  metadatos: Record<string, unknown>;
  creado_en: string;
}

export interface DetalleContacto extends MensajeContacto {
  eventos: EventoContacto[];
  envios_fallidos: number;
}

export interface BandejaContacto {
  datos: MensajeContacto[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export interface MetricasContacto {
  total: number;
  abiertos: number;
  resueltos: number;
  por_tipo: Record<TipoContacto, number>;
  por_estado: Record<EstadoContacto, number>;
  primera_respuesta_horas: number | null;
  resolucion_horas: number | null;
  por_dia: { dia: string; total: number }[];
  por_persona: { persona: PersonaContacto | null; abiertos: number; total: number }[];
  desde: string;
  hasta: string;
}

export interface PermisosContacto {
  ver: boolean;
  gestionar: boolean;
}

/** Filtros de la bandeja (query string de GET /admin/contacto). */
export const esquemaFiltrosContacto = z.object({
  estado: z.array(z.enum(ESTADOS_CONTACTO)).optional(),
  tipo: z.array(z.enum(TIPOS_MENSAJE_CONTACTO)).optional(),
  prioridad: z.array(z.enum(PRIORIDADES_CONTACTO)).optional(),
  asignado: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
  desde: z.iso.datetime({ offset: true }).optional(),
  hasta: z.iso.datetime({ offset: true }).optional(),
  orden: z.enum(['reciente', 'antiguo', 'prioridad']).optional(),
  pagina: z.coerce.number().int().min(1).optional(),
  por_pagina: z.coerce.number().int().min(1).max(100).optional(),
});
export type FiltrosContacto = z.infer<typeof esquemaFiltrosContacto>;

const contenido = texto(1, 5000, 'Escribe algo.', 'Admite hasta 5000 caracteres.');
export const esquemaNotaContacto = z.object({ contenido });
export const esquemaRespuestaContacto = z.object({
  contenido,
  estado_resultante: z.enum(['esperando_usuario', 'resuelto']).nullable().optional(),
});
export const esquemaEstadoContacto = z.object({ estado: z.enum(ESTADOS_CONTACTO) });
export const esquemaPrioridadContacto = z.object({ prioridad: z.enum(PRIORIDADES_CONTACTO) });
export const esquemaAsignacionContacto = z.object({ asignado_a: z.uuid().nullable() });
