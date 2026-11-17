import { z } from 'zod';

/**
 * Votación de propuestas (Fase 2.5, DEC-024). El líder propone; los integrantes activos votan.
 *
 * Esta es la **fuente de verdad** de la regla de mayoría. La BD tiene una copia
 * (`fn_votacion_resultado`, migración 0003) y una prueba compara ambas (DEC-025).
 *
 * - V-1: se acepta con la mayoría simple de **todos** los integrantes activos (no solo de los que votaron).
 * - V-4: el empate o la falta de mayoría dejan la propuesta abierta.
 * - V-5: sin integrantes, la propuesta queda aceptada (no hay quién vote).
 */
export type ResultadoVotacion = 'aceptada' | 'rechazada' | 'abierta';

export function resultadoVotacion(
  aceptar: number,
  rechazar: number,
  totalIntegrantes: number,
): ResultadoVotacion {
  if (totalIntegrantes <= 0) return 'aceptada';
  if (aceptar * 2 > totalIntegrantes) return 'aceptada';
  if (rechazar * 2 > totalIntegrantes) return 'rechazada';
  return 'abierta';
}

/** Votos a favor necesarios para aceptar con `total` integrantes activos. */
export const votosNecesarios = (total: number) => Math.floor(total / 2) + 1;

export const VOTOS = ['aceptar', 'rechazar'] as const;
export type Voto = (typeof VOTOS)[number];

/** Cuerpo de POST …/voto. */
export const esquemaVotar = z.object({
  voto: z.enum(VOTOS, { error: 'Elige aceptar o rechazar.' }),
  comentario: z
    .string()
    .trim()
    .max(500, 'El comentario admite hasta 500 caracteres.')
    .optional()
    .transform((c) => (c ? c : undefined)),
});
export type Votar = z.infer<typeof esquemaVotar>;

/** Cuerpo de POST …/retirar. */
export const esquemaRetirar = z.object({ version: z.number().int().positive() });

/**
 * Resumen de una votación según quién consulta (V-8): conteo y quién ya votó, **nunca** el voto
 * de otra persona. Cerrada la votación, solo el conteo final. Es lo que devuelve el proceso
 * `proc_tarea_votacion`; la API lo valida con este esquema.
 */
export const esquemaResumenVotacion = z.object({
  abierta: z.boolean(),
  /** Integrantes activos ahora (solo mientras está abierta). */
  total_integrantes: z.number().int().nullable(),
  /** Votos a favor que faltan para aceptar (solo mientras está abierta). */
  necesarios: z.number().int().nullable(),
  emitidos: z.number().int(),
  aceptar: z.number().int(),
  rechazar: z.number().int(),
  /** Quién ya votó (sin el sentido del voto); vacío al cerrarse. */
  votaron: z.array(z.object({ usuario_id: z.string(), nombre: z.string() })),
  /** El voto de quien consulta, si votó. */
  mi_voto: z
    .object({ voto: z.enum(VOTOS), comentario: z.string().nullable(), votado_en: z.string() })
    .nullable(),
});
export type ResumenVotacion = z.infer<typeof esquemaResumenVotacion>;
