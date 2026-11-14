import type { EstadoTarea, PrioridadTarea } from '@nexo/shared';
import { diasHasta, horasHasta } from './fechas';

export const NOMBRE_ESTADO: Record<EstadoTarea, string> = {
  propuesta: 'Propuesta',
  backlog: 'Backlog',
  aceptada: 'Aceptada',
  habilitada: 'Habilitada',
  en_curso: 'En curso',
  atascada: 'Atascada',
  completada: 'Completada',
  rechazada: 'Rechazada',
};

export const COLUMNAS_TABLERO: { estado: EstadoTarea; nombre: string }[] = [
  { estado: 'aceptada', nombre: 'Por habilitar' },
  { estado: 'habilitada', nombre: 'Habilitada' },
  { estado: 'en_curso', nombre: 'En curso' },
  { estado: 'atascada', nombre: 'Atascada' },
  { estado: 'completada', nombre: 'Completada' },
];

/** Columnas del tablero personal: «Por hacer» agrupa lo que aún no se empieza. */
export const COLUMNAS_PERSONAL: { estado: EstadoTarea; nombre: string; incluye: EstadoTarea[] }[] =
  [
    { estado: 'habilitada', nombre: 'Por hacer', incluye: ['backlog', 'aceptada', 'habilitada'] },
    { estado: 'en_curso', nombre: 'En curso', incluye: ['en_curso'] },
    { estado: 'atascada', nombre: 'Atascada', incluye: ['atascada'] },
    { estado: 'completada', nombre: 'Hecha', incluye: ['completada'] },
  ];

export type Forma = 'triangulo' | 'circulo' | 'cuadrado';
export function formaDeEstado(e: EstadoTarea): Forma {
  if (e === 'atascada') return 'triangulo';
  if (e === 'completada') return 'cuadrado';
  return 'circulo';
}
export const NOMBRE_FORMA: Record<Forma, string> = {
  triangulo: 'Atascada',
  circulo: 'Avanza con normalidad',
  cuadrado: 'Completada',
};

export type Nivel = 'ok' | 'warn' | 'danger' | 'info';
export interface Semaforo {
  nivel: Nivel;
  texto: string;
  urgente: boolean;
}

/** Datos mínimos de una tarea para calcular su semáforo. */
export interface TareaConPlazo {
  estado: EstadoTarea;
  vence_en: string | null;
  resultado: 'a_tiempo' | 'con_retraso' | null;
}

/** Semáforo de entrega: verde a tiempo, ámbar < 48 h, rojo vencida (misma regla que v_tareas_semaforo). */
export function semaforo(t: TareaConPlazo): Semaforo | null {
  if (t.estado === 'completada') {
    return t.resultado === 'con_retraso'
      ? { nivel: 'warn', texto: 'Con retraso', urgente: false }
      : { nivel: 'ok', texto: 'A tiempo', urgente: false };
  }
  if (!t.vence_en) return null;
  const h = horasHasta(t.vence_en);
  if (h < 0) return { nivel: 'danger', texto: 'Vencida', urgente: true };
  if (h < 48) {
    const d = diasHasta(t.vence_en);
    return {
      nivel: 'warn',
      texto: d <= 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : 'Vence pronto',
      urgente: true,
    };
  }
  return { nivel: 'ok', texto: 'A tiempo', urgente: false };
}

export function esUrgente24h(t: TareaConPlazo) {
  return (
    !!t.vence_en &&
    t.estado !== 'completada' &&
    horasHasta(t.vence_en) < 24 &&
    horasHasta(t.vence_en) > -24
  );
}

export const PRIORIDADES: Record<PrioridadTarea, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};
