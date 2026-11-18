import { z } from 'zod';
import type { PersonaTarea } from './equipos';

/**
 * Liderazgo y administración del equipo (Fase 3.5: AD-04 a AD-12, DEC-032). Las reglas viven en
 * los procesos de la BD (`0010_procesos_liderazgo.sql`, docs/08); aquí están las formas de los
 * datos y los esquemas de entrada de la API.
 */

export const FASES_ELECCION = [
  'postulacion',
  'votacion',
  'resultado',
  'empate',
  'sin_votos',
] as const;
export type FaseEleccion = (typeof FASES_ELECCION)[number];

export const ESTADOS_TRANSFERENCIA = ['pendiente', 'aceptada', 'rechazada', 'cancelada'] as const;
export type EstadoTransferencia = (typeof ESTADOS_TRANSFERENCIA)[number];

export interface CandidatoEleccion extends PersonaTarea {
  /** Se puede votar en la ronda actual (en la 2, solo los empatados). */
  finalista: boolean;
  /** Votos de la ronda; `null` mientras la elección sigue abierta. */
  votos: number | null;
}

export interface Eleccion {
  id: string;
  fase: FaseEleccion;
  ronda: number;
  plazo_en: string;
  creada_en: string;
  cerrada_en: string | null;
  saliente: PersonaTarea;
  ganador: PersonaTarea | null;
  candidatos: CandidatoEleccion[];
  votantes_total: number;
  /** Nombres de quienes ya votaron en la ronda (nunca por quién). */
  votaron: string[];
  /** Candidato que eligió quien consulta en la ronda actual. */
  mi_voto: string | null;
}

export interface Transferencia {
  id: string;
  estado: EstadoTransferencia;
  /** El líder sale del equipo cuando se acepta. */
  saldra: boolean;
  de: PersonaTarea;
  a: PersonaTarea;
  creada_en: string;
  resuelta_en: string | null;
}

export type EntradaHistorialLiderazgo =
  ({ tipo: 'transferencia' } & Transferencia) | ({ tipo: 'eleccion' } & Eleccion);

/** Respuesta de GET /equipos/:id/liderazgo y de las acciones de liderazgo. */
export interface Liderazgo {
  transferencia: Transferencia | null;
  eleccion: Eleccion | null;
  /** Transferencias resueltas y elecciones cerradas, de la más reciente a la más antigua (FALT-07). */
  historial: EntradaHistorialLiderazgo[];
}

/** AD-06. */
export interface ConfiguracionEquipo {
  nombre: string;
  descripcion: string;
  estado: 'activo' | 'archivado';
  duracion_sprint_semanas: number;
  zona_horaria: string;
  votacion_plazo_horas: number;
  votacion_desempate_horas: number;
  max_miembros: number;
  archivado_en: string | null;
}

// ---------------------------------------------------------------------------------------------
// Entradas de la API
// ---------------------------------------------------------------------------------------------

const id = z.uuid('El identificador no es válido.');

export const esquemaTransferir = z.object({ a_id: id, saldra: z.boolean().default(false) });
export const esquemaResponderTransferencia = z.object({ acepta: z.boolean() });
export const esquemaVotoEleccion = z.object({ candidato_id: id });

export const esquemaGestionarInvitado = z
  .object({
    accion: z.enum(['ampliar', 'convertir']),
    dias: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  })
  .refine((d) => d.accion !== 'ampliar' || d.dias !== undefined, {
    message: 'Elige cuántos días amplías el acceso.',
    path: ['dias'],
  });
export type GestionarInvitado = z.infer<typeof esquemaGestionarInvitado>;

export const esquemaConfigurarEquipo = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(2, 'El nombre necesita al menos 2 caracteres.')
      .max(60, 'El nombre admite hasta 60 caracteres.'),
    descripcion: z.string().trim().max(500, 'La descripción admite hasta 500 caracteres.'),
    duracion_sprint_semanas: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    zona_horaria: z.string().trim().min(1).max(64),
    votacion_plazo_horas: z.number().int().min(1).max(336),
    votacion_desempate_horas: z.number().int().min(1).max(168),
    max_miembros: z.number().int().min(1).max(8),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay cambios que guardar.' });
export type ConfigurarEquipo = z.infer<typeof esquemaConfigurarEquipo>;

export const esquemaArchivar = z.object({ archivar: z.boolean() });

/** Texto del tiempo que falta para el plazo de una elección («quedan 2 d 5 h»). */
export function tiempoRestante(plazoIso: string, ahora = new Date()): string {
  const ms = new Date(plazoIso).getTime() - ahora.getTime();
  if (ms <= 0) return 'plazo vencido';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `quedan ${Math.floor(h / 24)} d ${h % 24} h`;
  if (h >= 1) return `quedan ${h} h ${m} min`;
  return `quedan ${Math.max(m, 1)} min`;
}
