import { z } from 'zod';

/** Estados de una tarea, tal como están en la BD (tipo `estado_tarea`). */
export const ESTADOS_TAREA = [
  'propuesta',
  'backlog',
  'aceptada',
  'habilitada',
  'en_curso',
  'atascada',
  'completada',
  'rechazada',
] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

/**
 * Estados que usa una tarea personal: no hay triaje ni asignación, así que solo
 * pendiente (`backlog`), por hacer (`habilitada`), en curso, atascada (con motivo) y completada.
 */
export const ESTADOS_TAREA_PERSONAL = [
  'backlog',
  'habilitada',
  'en_curso',
  'atascada',
  'completada',
] as const;
export type EstadoTareaPersonal = (typeof ESTADOS_TAREA_PERSONAL)[number];

export const PRIORIDADES_TAREA = ['alta', 'media', 'baja'] as const;
export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number];

export const SEMAFOROS = ['verde', 'ambar', 'rojo'] as const;
export type Semaforo = (typeof SEMAFOROS)[number];

const titulo = z
  .string()
  .trim()
  .min(1, 'Escribe un título.')
  .max(140, 'El título admite hasta 140 caracteres.');
const descripcion = z.string().max(10_000, 'La descripción es demasiado larga.');
const fecha = z.iso.datetime({ offset: true, error: 'La fecha no es válida.' });
const nombreEtiqueta = z
  .string()
  .trim()
  .min(1, 'La etiqueta no puede estar vacía.')
  .max(30, 'La etiqueta admite hasta 30 caracteres.');
const etiquetas = z.array(nombreEtiqueta).max(10, 'Una tarea admite hasta 10 etiquetas.');
const motivo = z.string().trim().min(1, 'Escribe el motivo.').max(500);

export const esquemaCrearTareaPersonal = z.object({
  titulo,
  descripcion: descripcion.default(''),
  prioridad: z.enum(PRIORIDADES_TAREA).default('media'),
  vence_en: fecha.nullable().default(null),
  etiquetas: etiquetas.default([]),
});
export type CrearTareaPersonal = z.infer<typeof esquemaCrearTareaPersonal>;

export const esquemaActualizarTareaPersonal = z
  .object({
    /** Versión que el cliente tenía al editar (concurrencia optimista). */
    version: z.number().int().positive(),
    titulo: titulo.optional(),
    descripcion: descripcion.optional(),
    prioridad: z.enum(PRIORIDADES_TAREA).optional(),
    vence_en: fecha.nullable().optional(),
    estado: z.enum(ESTADOS_TAREA_PERSONAL).optional(),
    motivo: motivo.optional(),
    progreso: z.number().int().min(0).max(100).optional(),
    archivada: z.boolean().optional(),
    etiquetas: etiquetas.optional(),
  })
  .refine((d) => d.estado !== 'atascada' || d.motivo !== undefined, {
    path: ['motivo'],
    message: 'Para marcar la tarea como atascada escribe el motivo.',
  });
export type ActualizarTareaPersonal = z.infer<typeof esquemaActualizarTareaPersonal>;

const aLista = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(item));

/** Filtros de GET /personal/tareas (cadena de consulta). */
export const esquemaFiltrosTareas = z.object({
  estado: aLista(z.enum(ESTADOS_TAREA_PERSONAL)).optional(),
  prioridad: aLista(z.enum(PRIORIDADES_TAREA)).optional(),
  etiqueta: nombreEtiqueta.optional(),
  q: z.string().trim().max(100).optional(),
  archivadas: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type FiltrosTareas = z.infer<typeof esquemaFiltrosTareas>;

export const esquemaCrearSubtarea = z.object({ titulo });
export const esquemaActualizarSubtarea = z
  .object({ titulo: titulo.optional(), hecha: z.boolean().optional() })
  .refine((d) => d.titulo !== undefined || d.hecha !== undefined, {
    message: 'No hay nada que cambiar.',
  });

export const esquemaCrearComentario = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe un comentario.')
    .max(4000, 'El comentario admite hasta 4000 caracteres.'),
});

export interface Subtarea {
  id: string;
  titulo: string;
  hecha: boolean;
}

export interface ComentarioTarea {
  id: string;
  texto: string;
  autor_id: string | null;
  creado_en: string;
  editado_en: string | null;
}

/** Tarea personal tal como la devuelve la API. */
export interface TareaPersonal {
  id: string;
  codigo: number;
  titulo: string;
  descripcion: string;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  progreso: number;
  vence_en: string | null;
  motivo: string | null;
  resultado: 'a_tiempo' | 'con_retraso' | null;
  semaforo: Semaforo | null;
  archivada: boolean;
  version: number;
  creado_en: string;
  actualizado_en: string;
  completada_en: string | null;
  etiquetas: string[];
  subtareas_total: number;
  subtareas_hechas: number;
}

export interface TareaPersonalDetalle extends TareaPersonal {
  subtareas: Subtarea[];
  comentarios: ComentarioTarea[];
}
