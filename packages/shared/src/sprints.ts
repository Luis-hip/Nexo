import { z } from 'zod';
import type { PersonaTarea, TareaEquipo } from './equipos';

/**
 * Sprints y retrospectiva (Fase 3.3: EQ-09 a EQ-13, DEC-031). Las reglas viven en los procesos
 * de la BD (`0009_procesos_sprints.sql`, docs/08); aquí están las formas de los datos, los
 * esquemas de entrada de la API y el cálculo del burndown que dibuja la web.
 */

export const ESTADOS_SPRINT = ['planificado', 'activo', 'cerrado'] as const;
export type EstadoSprint = (typeof ESTADOS_SPRINT)[number];

export const COLUMNAS_RETRO = ['bien', 'mejorar', 'acciones'] as const;
export type ColumnaRetro = (typeof COLUMNAS_RETRO)[number];

/** Puntos de voto por persona en una retrospectiva (RN-SPR-07; el cuarto da NX003). */
export const VOTOS_RETRO_POR_PERSONA = 3;

/** Qué pasa con las tareas sin terminar al cerrar un sprint. */
export const DESTINOS_PENDIENTES = ['liberar', 'siguiente'] as const;
export type DestinoPendientes = (typeof DESTINOS_PENDIENTES)[number];

// ---------------------------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------------------------

export interface RetroResumen {
  id: string;
  votacion_cerrada: boolean;
  cerrada: boolean;
}

/** Un sprint en la lista (EQ-13). En uno cerrado, `total` y `completadas` son los del cierre. */
export interface Sprint {
  id: string;
  equipo_id: string;
  numero: number;
  objetivo: string;
  /** `AAAA-MM-DD`. */
  inicio: string;
  fin: string;
  estado: EstadoSprint;
  cerrado_en: string | null;
  total: number;
  completadas: number;
  retro: RetroResumen | null;
}

export interface CapacidadMiembro {
  usuario_id: string;
  nombre: string;
  color_idx: number | null;
  horas: number;
  /** Tareas del sprint de las que es responsable. */
  tareas: number;
}

/** Instantánea de un día (`sprint_instantaneas`); el último punto de un sprint activo es en vivo. */
export interface PuntoBurndown {
  dia: string;
  total: number;
  completadas: number;
}

/**
 * Expectativa del burndown según el plan congelado al iniciar el sprint (`sprint_plan_tareas`,
 * DEC-042): cuántas tareas había y en qué momento debía terminar cada grupo.
 */
export interface ExpectativaSprint {
  inicial: number;
  /** Tareas sin fecha de entrega al iniciar: se planean para el último día. */
  sin_fecha: number;
  /** Tareas que vencían después del fin del sprint: también bajan el último día. */
  despues_del_fin: number;
  pasos: { momento: string; tareas: number }[];
}

export interface SprintDetalle extends Sprint {
  capacidad: CapacidadMiembro[];
  serie: PuntoBurndown[];
  /** `null` si el sprint no tiene plan congelado (no ha iniciado, o se cerró antes de la 0042). */
  expectativa: ExpectativaSprint | null;
  tareas: TareaEquipo[];
}

export interface NotaRetro {
  id: string;
  columna: ColumnaRetro;
  texto: string;
  /** Una nota anónima no guarda quién la escribió: `autor` es nulo y `mia` es falso. */
  anonima: boolean;
  mia: boolean;
  autor: PersonaTarea | null;
  grupo: string | null;
  tarea_id: string | null;
  votos: number;
  voto_mio: boolean;
  creada_en: string;
}

export interface Retrospectiva {
  id: string;
  sprint_id: string;
  sprint_numero: number;
  votacion_cerrada: boolean;
  cerrada: boolean;
  votos_por_persona: number;
  mis_votos_usados: number;
  notas: NotaRetro[];
}

export interface ResultadoVotoRetro {
  nota_id: string;
  votos: number;
  voto_mio: boolean;
  mis_votos_usados: number;
}

// ---------------------------------------------------------------------------------------------
// Entradas de la API
// ---------------------------------------------------------------------------------------------

const id = z.uuid('El identificador no es válido.');
const dia = z.iso.date({ error: 'Usa una fecha válida (AAAA-MM-DD).' });

/** Cuerpo de POST /equipos/:id/sprints y PATCH /equipos/:id/sprints/:sprintId (EQ-10). */
export const esquemaPlanearSprint = z
  .object({
    objetivo: z.string().trim().max(300, 'El objetivo admite hasta 300 caracteres.').optional(),
    inicio: dia.optional(),
    fin: dia.optional(),
    /** Reemplaza la capacidad completa del sprint. */
    capacidad: z
      .array(
        z.object({
          usuario_id: id,
          horas: z
            .number()
            .int('Las horas van en números enteros.')
            .min(0, 'Las horas no pueden ser negativas.')
            .max(300, 'Las horas de capacidad van de 0 a 300.'),
        }),
      )
      .max(20)
      .optional(),
    /** Reemplaza la lista completa de tareas del sprint. */
    tarea_ids: z.array(id).max(200, 'Son demasiadas tareas para un sprint.').optional(),
  })
  .refine((d) => !d.inicio || !d.fin || d.fin > d.inicio, {
    message: 'El sprint debe terminar después de empezar.',
    path: ['fin'],
  });
export type PlanearSprint = z.infer<typeof esquemaPlanearSprint>;

/** Cuerpo de POST /equipos/:id/sprints/:sprintId/cerrar (EQ-11). */
export const esquemaCerrarSprint = z.object({
  pendientes: z.enum(DESTINOS_PENDIENTES).default('liberar'),
});
export type CerrarSprint = z.infer<typeof esquemaCerrarSprint>;

/** Cuerpo de POST /equipos/:id/sprints/:sprintId/retro/notas (EQ-12). */
export const esquemaNotaRetro = z.object({
  columna: z.enum(COLUMNAS_RETRO),
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe la nota.')
    .max(500, 'La nota admite hasta 500 caracteres.'),
  anonima: z.boolean().default(false),
});
export type CrearNotaRetro = z.infer<typeof esquemaNotaRetro>;

/** Cuerpo de POST /equipos/:id/retro/notas/:notaId/voto: poner (`true`) o quitar el voto. */
export const esquemaVotoRetro = z.object({ dar: z.boolean() });

/** Cuerpo de POST /equipos/:id/sprints/:sprintId/retro/avanzar. */
export const esquemaAvanzarRetro = z.object({ fase: z.enum(['votacion', 'cerrada']) });
export type FaseRetro = z.infer<typeof esquemaAvanzarRetro>['fase'];

// ---------------------------------------------------------------------------------------------
// Burndown
// ---------------------------------------------------------------------------------------------

/** Un día del burndown: tareas por terminar (null si aún no hay dato) y la línea ideal. */
export interface DiaBurndown {
  dia: string;
  restantes: number | null;
  ideal: number;
}

const MS_DIA = 86_400_000;
const aFecha = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const aTexto = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Serie diaria del burndown entre `inicio` y `fin` (o el día de la última instantánea, si el
 * sprint se cerró tarde). Cada día lleva las tareas que faltaban según la instantánea más
 * reciente hasta ese día; los días sin dato previo o posteriores a la última foto van en `null`.
 * La línea ideal baja de las tareas del primer día a cero el último día.
 */
export function serieBurndown(inicio: string, fin: string, serie: PuntoBurndown[]): DiaBurndown[] {
  const puntos = [...serie].sort((a, b) => a.dia.localeCompare(b.dia));
  const ultimo = puntos.at(-1)?.dia;
  const desde = aFecha(inicio);
  const hasta = Math.max(aFecha(fin), ultimo ? aFecha(ultimo) : 0);
  const n = Math.min(Math.round((hasta - desde) / MS_DIA) + 1, 400);
  const base = puntos.find((p) => p.dia >= inicio)?.total ?? puntos[0]?.total ?? 0;
  const dias: DiaBurndown[] = [];
  let actual: number | null = null;
  let i = 0;
  for (let k = 0; k < n; k++) {
    const dia = aTexto(desde + k * MS_DIA);
    while (i < puntos.length && (puntos[i]?.dia ?? '') <= dia) {
      const p = puntos[i];
      if (p) actual = p.total - p.completadas;
      i++;
    }
    const ideal = n > 1 ? Math.round(base * (1 - k / (n - 1)) * 10) / 10 : 0;
    dias.push({ dia, restantes: ultimo !== undefined && dia <= ultimo ? actual : null, ideal });
  }
  return dias;
}

/** Días que faltan para el fin del sprint, contando hoy (0 si ya terminó). */
export function diasRestantes(fin: string, hoy: string): number {
  return Math.max(Math.round((aFecha(fin) - aFecha(hoy)) / MS_DIA) + 1, 0);
}
