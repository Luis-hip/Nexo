import { z } from 'zod';
import { MAX_MIEMBROS_EQUIPO } from './constantes';
import {
  ESTADOS_TAREA,
  PRIORIDADES_TAREA,
  type EstadoTarea,
  type PrioridadTarea,
  type Semaforo,
} from './tareas';

export const ROLES_EQUIPO = ['lider', 'integrante', 'invitado'] as const;
export type RolEquipo = (typeof ROLES_EQUIPO)[number];

const id = z.uuid('El identificador no es válido.');
const fecha = z.iso.datetime({ offset: true, error: 'La fecha no es válida.' });
const titulo = z
  .string()
  .trim()
  .min(1, 'Escribe un título para la tarea.')
  .max(140, 'El título admite hasta 140 caracteres.');
const descripcion = z.string().max(10_000, 'La descripción es demasiado larga.');
const motivo = z
  .string()
  .trim()
  .min(1, 'Escribe el motivo.')
  .max(500, 'El motivo admite hasta 500 caracteres.');
const etiquetas = z
  .array(z.string().trim().min(1).max(30, 'La etiqueta admite hasta 30 caracteres.'))
  .max(10, 'Una tarea admite hasta 10 etiquetas.');

// ---------------------------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------------------------

/** Cuerpo de POST /equipos (PER-06). */
export const esquemaCrearEquipo = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres.')
    .max(60, 'El nombre admite hasta 60 caracteres.'),
  descripcion: z
    .string()
    .trim()
    .max(280, 'La descripción admite hasta 280 caracteres.')
    .default(''),
  duracion_sprint_semanas: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  /** Líder + integrantes; los invitados no cuentan. Por defecto 8 (decisión D-01 pendiente). */
  max_miembros: z
    .number()
    .int()
    .min(1, 'El equipo necesita al menos 1 miembro.')
    .max(MAX_MIEMBROS_EQUIPO, `Un equipo admite hasta ${MAX_MIEMBROS_EQUIPO} miembros.`)
    .default(MAX_MIEMBROS_EQUIPO),
});
export type CrearEquipo = z.infer<typeof esquemaCrearEquipo>;

export interface Miembro {
  membresia_id: string;
  usuario_id: string;
  nombre: string;
  rol: RolEquipo;
  color_idx: number | null;
  /** Solo invitados. */
  caduca_en: string | null;
}

export interface SprintResumen {
  id: string;
  numero: number;
  estado: 'planificado' | 'activo' | 'cerrado';
  inicio: string;
  fin: string;
}

/** Respuesta de GET /equipos/:id. */
export interface EquipoDetalle {
  id: string;
  nombre: string;
  descripcion: string;
  estado: 'activo' | 'archivado';
  max_miembros: number;
  miembros_activos: number;
  invitados_activos: number;
  /** Perfil de quien consulta. */
  mi_rol: RolEquipo;
  mi_membresia_id: string;
  lider: { usuario_id: string; nombre: string } | null;
  /** Vacío para invitados (no ven la lista de miembros). */
  miembros: Miembro[];
  /** Sprints no cerrados (vacío para invitados). */
  sprints: SprintResumen[];
  etiquetas: string[];
}

// ---------------------------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------------------------

export const DURACIONES_INVITADO = [7, 14, 30] as const;

/** Cuerpo de POST /equipos/:id/invitaciones (AD-02, AD-03). */
export const esquemaCrearInvitacion = z
  .object({
    rol_destino: z.enum(['integrante', 'invitado']),
    /** Días de validez del código. */
    dias_validez: z.number().int().min(1).max(30).default(7),
    /** Días de acceso del invitado desde que acepta. */
    duracion_invitado_dias: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  })
  .refine((d) => d.rol_destino !== 'invitado' || d.duracion_invitado_dias !== undefined, {
    path: ['duracion_invitado_dias'],
    message: 'Elige cuánto dura el acceso del invitado.',
  });
export type CrearInvitacion = z.infer<typeof esquemaCrearInvitacion>;

export interface Invitacion {
  id: string;
  codigo: string;
  rol_destino: 'integrante' | 'invitado';
  estado: 'pendiente' | 'aceptada' | 'revocada' | 'caducada';
  caduca_en: string;
  duracion_invitado_dias: number | null;
  creada_en: string;
  aceptada_por: string | null;
}

/** Vista previa de una invitación antes de aceptarla (PER-07, AUTH-08). */
export interface VistaInvitacion {
  codigo: string;
  equipo: { id: string; nombre: string; descripcion: string };
  lider: string | null;
  miembros_activos: number;
  max_miembros: number;
  rol_destino: 'integrante' | 'invitado';
  duracion_invitado_dias: number | null;
  caduca_en: string;
  /** La persona ya pertenece al equipo. */
  ya_miembro: boolean;
}

/** Normaliza lo que la persona escribe o pega: admite el enlace completo y minúsculas. */
export function normalizarCodigoInvitacion(entrada: string): string {
  const limpio = entrada.trim();
  const deEnlace = /\/invitacion\/([^/?#\s]+)/.exec(limpio)?.[1];
  return (deEnlace ?? limpio).toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Tareas de equipo
// ---------------------------------------------------------------------------------------------

export const DESTINOS_TAREA = ['tablero', 'backlog'] as const;

/** Cuerpo de POST /equipos/:id/tareas: el líder crea; el integrante propone (va a triaje). */
export const esquemaCrearTareaEquipo = z.object({
  titulo,
  descripcion: descripcion.default(''),
  prioridad: z.enum(PRIORIDADES_TAREA).default('media'),
  vence_en: fecha.nullable().default(null),
  etiquetas: etiquetas.default([]),
  /** Solo el líder: en una propuesta se ignoran. */
  responsable_id: id.nullable().default(null),
  /** Solo el líder: al tablero (queda «Aceptada», en el sprint activo si lo hay) o al backlog. */
  destino: z.enum(DESTINOS_TAREA).default('backlog'),
});
export type CrearTareaEquipo = z.infer<typeof esquemaCrearTareaEquipo>;

/** Cuerpo de PATCH /equipos/:id/tareas/:tareaId. */
export const esquemaEditarTareaEquipo = z.object({
  version: z.number().int().positive(),
  titulo: titulo.optional(),
  descripcion: descripcion.optional(),
  prioridad: z.enum(PRIORIDADES_TAREA).optional(),
  vence_en: fecha.nullable().optional(),
  etiquetas: etiquetas.optional(),
  progreso: z.number().int().min(0).max(100).optional(),
  archivada: z.boolean().optional(),
});
export type EditarTareaEquipo = z.infer<typeof esquemaEditarTareaEquipo>;

/** Cuerpo de POST …/estado. */
export const esquemaCambiarEstado = z
  .object({
    version: z.number().int().positive(),
    estado: z.enum(ESTADOS_TAREA),
    motivo: motivo.optional(),
  })
  .refine((d) => d.estado !== 'atascada' || d.motivo !== undefined, {
    path: ['motivo'],
    message: 'Para marcar la tarea como atascada escribe el motivo.',
  });
export type CambiarEstado = z.infer<typeof esquemaCambiarEstado>;

/**
 * Cuerpo de POST …/mover: «mover la tarea entre A y B» (docs/03, 2.2.2).
 * El servidor calcula el nuevo `orden` (índice fraccionario) y, si cambia de columna, el estado.
 */
export const esquemaMoverTarea = z.object({
  version: z.number().int().positive(),
  /** Tarea que queda justo antes (arriba); `null` si va al principio. */
  antes_id: id.nullable(),
  /** Tarea que queda justo después (abajo); `null` si va al final. */
  despues_id: id.nullable(),
  /** Columna de destino si cambia de estado. */
  estado: z.enum(ESTADOS_TAREA).optional(),
  motivo: motivo.optional(),
});
export type MoverTarea = z.infer<typeof esquemaMoverTarea>;

/** Cuerpo de POST …/triaje (EQ-05): decisión del líder sobre una propuesta o una rechazada. */
export const esquemaTriaje = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('aceptar'),
    version: z.number().int().positive(),
    /** Al tablero (queda «Aceptada», en el sprint activo si lo hay) o al backlog. */
    destino: z.enum(DESTINOS_TAREA).default('tablero'),
    responsable_id: id.nullable().default(null),
    vence_en: fecha.nullable().optional(),
  }),
  z.object({ accion: z.literal('rechazar'), version: z.number().int().positive(), motivo }),
  z.object({ accion: z.literal('backlog'), version: z.number().int().positive() }),
  z.object({
    accion: z.literal('pedir_cambios'),
    version: z.number().int().positive(),
    comentario: z.string().trim().min(1, 'Escribe qué cambios pides.').max(500),
  }),
]);
export type Triaje = z.infer<typeof esquemaTriaje>;
/** Lo que envía el cliente: los campos con valor por defecto son opcionales. */
export type TriajeEntrada = z.input<typeof esquemaTriaje>;

/** Cuerpo de POST …/asignar (el líder asigna o quita al responsable). */
export const esquemaAsignar = z.object({
  version: z.number().int().positive(),
  responsable_id: id.nullable(),
});

/** Cuerpo de POST …/asignacion (el responsable acepta o rechaza con motivo; EQ-08). */
export const esquemaResponderAsignacion = z
  .object({ acepta: z.boolean(), motivo: motivo.optional() })
  .refine((d) => d.acepta || d.motivo !== undefined, {
    path: ['motivo'],
    message: 'Explica por qué rechazas la asignación.',
  });

/** Cuerpo de PUT …/compartida: invitados (por membresía) que pueden ver la tarea. */
export const esquemaCompartir = z.object({ membresia_ids: z.array(id).max(50) });

export interface PersonaTarea {
  usuario_id: string;
  nombre: string;
  color_idx: number | null;
}

/** Tarea de equipo tal como la devuelve la API. */
export interface TareaEquipo {
  id: string;
  equipo_id: string;
  codigo: number;
  titulo: string;
  descripcion: string;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  progreso: number;
  vence_en: string | null;
  motivo: string | null;
  rechazo_por: 'lider' | 'responsable' | null;
  cambios_pedidos: string | null;
  resultado: 'a_tiempo' | 'con_retraso' | null;
  semaforo: Semaforo | null;
  asignacion_pendiente: boolean;
  origen: 'propuesta' | 'directa';
  orden: string;
  sprint_id: string | null;
  archivada: boolean;
  version: number;
  creado_en: string;
  actualizado_en: string;
  completada_en: string | null;
  responsable: PersonaTarea | null;
  proponente: PersonaTarea | null;
  etiquetas: string[];
  subtareas_total: number;
  subtareas_hechas: number;
  comentarios_total: number;
}

export interface ComentarioEquipo {
  id: string;
  texto: string;
  autor: PersonaTarea | null;
  creado_en: string;
  editado_en: string | null;
}

export interface ActividadTarea {
  id: string;
  resumen: string;
  autor: string | null;
  creado_en: string;
}

export interface TareaEquipoDetalle extends TareaEquipo {
  subtareas: { id: string; titulo: string; hecha: boolean }[];
  comentarios: ComentarioEquipo[];
  historial: ActividadTarea[];
  /** Membresías de invitados con acceso (solo lo ve el líder). */
  compartida_con: string[];
  /** Estados a los que quien consulta puede moverla ahora. */
  transiciones: EstadoTarea[];
}

/** Conteos para las pestañas de tareas. */
export interface ConteosTareas {
  tablero: number;
  backlog: number;
  triaje: number;
}
