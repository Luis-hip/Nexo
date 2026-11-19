import { z } from 'zod';

/**
 * Ajustes de la persona (Fase 3.6: PF-04 y PF-06) y reporte personal (FALT-01), DEC-034. Las
 * reglas viven en la migración 0013 (docs/08).
 */

export const EVENTOS_NOTIFICACION = [
  'tarea_asignada',
  'propuesta_nueva',
  'votacion_resuelta',
  'reunion',
  'liderazgo',
  'sprint',
  'mencion',
] as const;
export type EventoNotificacion = (typeof EVENTOS_NOTIFICACION)[number];

export const NOMBRE_EVENTO: Record<EventoNotificacion, string> = {
  tarea_asignada: 'Te asignan una tarea',
  propuesta_nueva: 'Hay una propuesta por votar',
  votacion_resuelta: 'Se resuelve una votación',
  reunion: 'Reuniones',
  liderazgo: 'Liderazgo y elecciones',
  sprint: 'Inicio y cierre de sprints',
  mencion: 'Te mencionan en el chat',
};

export interface PreferenciaAviso {
  evento: EventoNotificacion;
  por_app: boolean;
  por_whatsapp: boolean;
  por_correo: boolean;
}

export interface AjustesUsuario {
  silencio_desde: string | null;
  silencio_hasta: string | null;
  resumen_diario: boolean;
  estado_visible: boolean;
  primer_dia: 'lunes' | 'domingo';
  notificaciones: PreferenciaAviso[];
}

export interface ReportePersonal {
  generado_en: string;
  por_estado: Record<string, number>;
  completadas: number;
  a_tiempo: number;
  con_retraso: number;
  vencidas: number;
  por_espacio: {
    equipo_id: string | null;
    nombre: string;
    abiertas: number;
    completadas: number;
  }[];
}

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM.');

/** Cuerpo de PATCH /yo/ajustes: solo lo que cambia; el silencio va completo. */
export const esquemaGuardarAjustes = z
  .object({
    silencio_desde: hora.nullable(),
    silencio_hasta: hora.nullable(),
    resumen_diario: z.boolean(),
    estado_visible: z.boolean(),
    primer_dia: z.enum(['lunes', 'domingo']),
    notificaciones: z
      .array(
        z.object({
          evento: z.enum(EVENTOS_NOTIFICACION),
          por_app: z.boolean(),
          por_whatsapp: z.boolean(),
          por_correo: z.boolean(),
        }),
      )
      .max(EVENTOS_NOTIFICACION.length),
  })
  .partial()
  .refine((d) => 'silencio_desde' in d === 'silencio_hasta' in d, {
    message: 'Indica el inicio y el fin de las horas de silencio.',
    path: ['silencio_hasta'],
  })
  .refine((d) => (d.silencio_desde === null) === (d.silencio_hasta === null), {
    message: 'Indica el inicio y el fin de las horas de silencio.',
    path: ['silencio_hasta'],
  });
export type GuardarAjustes = z.infer<typeof esquemaGuardarAjustes>;
