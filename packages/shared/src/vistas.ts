import { z } from 'zod';
import type { PersonaTarea, TareaEquipo } from './equipos';

/**
 * Vistas secundarias del equipo (Fase 3.4, DEC-033): calendario y reuniones, actividad,
 * notificaciones, reportes, plantillas y archivos. Las reglas viven en los procesos de las
 * migraciones 0011 y 0012 (docs/08); aquí están las formas de los datos y los esquemas de entrada.
 */

export const REPETICIONES = ['ninguna', 'diaria_lv', 'semanal'] as const;
export type Repeticion = (typeof REPETICIONES)[number];
export const RESPUESTAS_ASISTENCIA = ['pendiente', 'si', 'no', 'quiza'] as const;
export type RespuestaAsistencia = (typeof RESPUESTAS_ASISTENCIA)[number];
export const TIPOS_ACTIVIDAD = ['tarea', 'sprint', 'reunion', 'equipo'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];
export const TIPOS_PLANTILLA = ['sprint', 'proyecto', 'retro'] as const;
export type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number];
export const TIPOS_ARCHIVO = ['pdf', 'imagen', 'doc', 'hoja', 'otro'] as const;
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

/** Tope de un archivo (EQ-19). La BD lo vuelve a comprobar. */
export const MAX_BYTES_ARCHIVO = 5 * 1024 * 1024;
/** Tipos MIME permitidos; copia de `fn_archivo_tipo` (0012). Ni ejecutables ni SVG. */
export const MIME_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip',
] as const;

// ---------------------------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------------------------

export interface Reunion {
  id: string;
  titulo: string;
  /** Fecha de esta ocurrencia (en una serie, la de ese día). */
  inicio: string;
  /** Primera fecha de la serie. */
  inicio_serie: string;
  duracion_min: number;
  repeticion: Repeticion;
  lugar: string;
  descripcion: string;
  recordatorio_min: number;
  avisar_wa: boolean;
  creada_por: PersonaTarea | null;
  puedo_editar: boolean;
  asistencia: { si: number; no: number; quiza: number; pendiente: number };
  mi_respuesta: RespuestaAsistencia | null;
}

export interface CalendarioEquipo {
  reuniones: Reunion[];
  entregas: TareaEquipo[];
}

export interface EntradaActividad {
  id: string;
  tipo: TipoActividad;
  accion: string;
  resumen: string;
  objeto_tipo: string;
  objeto_id: string | null;
  creado_en: string;
  autor: PersonaTarea | null;
}

export interface PaginaActividad {
  items: EntradaActividad[];
  hay_mas: boolean;
}

export interface Notificacion {
  id: string;
  equipo_id: string | null;
  equipo: string | null;
  categoria: 'menciones' | 'tareas' | 'equipo';
  icono: string;
  titulo: string;
  texto: string;
  enlace: string | null;
  accion_tipo: string | null;
  accion_ref: string | null;
  creada_en: string;
  leida_en: string | null;
}

export interface Notificaciones {
  no_leidas: number;
  items: Notificacion[];
}

export interface ReportePersona extends PersonaTarea {
  abiertas: number;
  completadas: number;
  a_tiempo: number;
}

export interface ReporteEquipo {
  generado_en: string;
  por_estado: Record<string, number>;
  completadas: number;
  a_tiempo: number;
  con_retraso: number;
  vencidas: number;
  por_persona: ReportePersona[];
  sprints: { numero: number; estado: string; total: number; completadas: number }[];
}

export interface FilaExportacion {
  codigo: string;
  titulo: string;
  estado: string;
  prioridad: string;
  responsable: string | null;
  sprint: number | null;
  progreso: number;
  vence_en: string | null;
  completada_en: string | null;
  resultado: string | null;
  creado_en: string;
}

export interface Plantilla {
  id: string;
  nombre: string;
  tipo: TipoPlantilla;
  descripcion: string;
  creada_en: string;
  elementos: string[];
}

export interface Archivo {
  id: string;
  nombre: string;
  mime: string;
  tipo: TipoArchivo;
  tamano_bytes: number;
  creado_en: string;
  subido_por: PersonaTarea | null;
  tarea: { id: string; codigo: number; titulo: string } | null;
  puedo_eliminar: boolean;
}

// ---------------------------------------------------------------------------------------------
// Entradas de la API
// ---------------------------------------------------------------------------------------------

const fecha = z.iso.datetime({ offset: true, error: 'La fecha no es válida.' });
const camposReunion = {
  titulo: z
    .string()
    .trim()
    .min(1, 'Escribe el título.')
    .max(120, 'El título admite hasta 120 caracteres.'),
  inicio: fecha,
  duracion_min: z.number().int().min(5).max(720),
  repeticion: z.enum(REPETICIONES),
  lugar: z.string().trim().max(200),
  descripcion: z.string().trim().max(2000),
  recordatorio_min: z.number().int().min(0).max(1440),
  avisar_wa: z.boolean(),
};

/** Cuerpo de POST /equipos/:id/reuniones (EQ-15). */
export const esquemaCrearReunion = z.object({
  ...camposReunion,
  duracion_min: camposReunion.duracion_min.default(30),
  repeticion: camposReunion.repeticion.default('ninguna'),
  lugar: camposReunion.lugar.default(''),
  descripcion: camposReunion.descripcion.default(''),
  recordatorio_min: camposReunion.recordatorio_min.default(15),
  avisar_wa: camposReunion.avisar_wa.default(false),
});
export type CrearReunion = z.infer<typeof esquemaCrearReunion>;

/** Cuerpo de PATCH /equipos/:id/reuniones/:reunionId: solo lo que cambia. */
export const esquemaEditarReunion = z
  .object(camposReunion)
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar.' });
export type EditarReunion = z.infer<typeof esquemaEditarReunion>;

export const esquemaAsistencia = z.object({ respuesta: z.enum(['si', 'no', 'quiza']) });

export const esquemaRangoCalendario = z
  .object({ desde: fecha, hasta: fecha })
  .refine((r) => r.hasta > r.desde, { message: 'El rango no es válido.' });

export const esquemaConsultaActividad = z.object({
  tipo: z.enum(TIPOS_ACTIVIDAD).optional(),
  antes: fecha.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(50),
});

export const esquemaCrearPlantilla = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre.')
    .max(80, 'El nombre admite hasta 80 caracteres.'),
  tipo: z.enum(TIPOS_PLANTILLA),
  descripcion: z.string().trim().max(500).default(''),
  elementos: z
    .array(z.string().trim().min(1).max(140, 'Cada elemento admite hasta 140 caracteres.'))
    .min(1, 'Agrega al menos un elemento.')
    .max(30, 'Una plantilla admite hasta 30 elementos.'),
});
export type CrearPlantilla = z.infer<typeof esquemaCrearPlantilla>;

/** Cuerpo de POST /equipos/:id/archivos: el contenido viaja en base64 (≤ 5 MB decodificado). */
export const esquemaSubirArchivo = z.object({
  nombre: z.string().trim().min(1).max(200),
  mime: z.enum(MIME_PERMITIDOS, { error: 'Ese tipo de archivo no está permitido.' }),
  contenido_base64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_BYTES_ARCHIVO * 4) / 3) + 4, 'El archivo pesa más de 5 MB.'),
  tarea_id: z.uuid().optional(),
});
export type SubirArchivo = z.infer<typeof esquemaSubirArchivo>;

// ---------------------------------------------------------------------------------------------
// Exportación (EQ-17)
// ---------------------------------------------------------------------------------------------

/**
 * Celda de CSV: entre comillas si hace falta y, si empieza como una fórmula (= + - @ o
 * tabulador), con un apóstrofo delante para que una hoja de cálculo no la ejecute.
 */
export function celdaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  let t = String(valor);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** CSV con encabezados en español (separador coma, saltos CRLF). */
export function aCsv<T extends object>(
  columnas: readonly { clave: keyof T; titulo: string }[],
  filas: readonly T[],
): string {
  const lineas = [columnas.map((c) => celdaCsv(c.titulo)).join(',')];
  for (const f of filas) lineas.push(columnas.map((c) => celdaCsv(f[c.clave])).join(','));
  return lineas.join('\r\n') + '\r\n';
}

export const COLUMNAS_EXPORTACION: readonly { clave: keyof FilaExportacion; titulo: string }[] = [
  { clave: 'codigo', titulo: 'Código' },
  { clave: 'titulo', titulo: 'Título' },
  { clave: 'estado', titulo: 'Estado' },
  { clave: 'prioridad', titulo: 'Prioridad' },
  { clave: 'responsable', titulo: 'Responsable' },
  { clave: 'sprint', titulo: 'Sprint' },
  { clave: 'progreso', titulo: 'Avance (%)' },
  { clave: 'vence_en', titulo: 'Vence' },
  { clave: 'completada_en', titulo: 'Completada' },
  { clave: 'resultado', titulo: 'Resultado' },
  { clave: 'creado_en', titulo: 'Creada' },
];

/** Tamaño legible: «512 B», «1.4 KB», «2.0 MB». */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
