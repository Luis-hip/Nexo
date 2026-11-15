import type { Perfil } from './permisos';
import type { EstadoTarea } from './tareas';

/**
 * Máquina de estados de las tareas de equipo (docs/01, 2.4; reglas del prototipo, `lib/tareas.ts`).
 *
 *   propuesta ──triaje──► backlog / aceptada ──habilitar──► habilitada ──► en_curso ⇄ atascada
 *                                                                              └────────► completada
 *
 * - `propuesta`, `backlog` y `rechazada` no se mueven con «cambiar estado»: salen por triaje.
 * - El líder habilita y puede reabrir; el responsable trabaja su tarea.
 * - Se aplica en el servidor; la interfaz solo ofrece las transiciones válidas.
 */

/** Datos de la tarea que deciden qué transiciones son válidas. */
export interface TareaParaTransicion {
  estado: EstadoTarea;
  responsable_id: string | null;
  /** El responsable aún no acepta la asignación. */
  asignacion_pendiente: boolean;
}

type Quien = 'lider' | 'responsable';

/** Tabla de transiciones: desde → hacia → quién puede. */
export const TRANSICIONES: Readonly<
  Partial<Record<EstadoTarea, Partial<Record<EstadoTarea, readonly Quien[]>>>>
> = {
  aceptada: { habilitada: ['lider'] },
  habilitada: { en_curso: ['lider', 'responsable'] },
  en_curso: { atascada: ['lider', 'responsable'], completada: ['lider', 'responsable'] },
  atascada: { en_curso: ['lider', 'responsable'], completada: ['lider', 'responsable'] },
  completada: { en_curso: ['lider'] },
};

/** Estados a los que `usuarioId` puede pasar la tarea con su perfil en el equipo. */
export function transicionesValidas(
  tarea: TareaParaTransicion,
  perfil: Perfil,
  usuarioId: string,
): EstadoTarea[] {
  if (perfil === 'invitado' || perfil === 'personal') return [];
  const esLider = perfil === 'lider';
  const esResponsable = tarea.responsable_id === usuarioId;
  if (!esLider && !esResponsable) return [];
  // Primero se acepta la asignación; mientras tanto solo el líder mueve la tarea.
  if (tarea.asignacion_pendiente && !esLider) return [];
  const destinos = TRANSICIONES[tarea.estado] ?? {};
  return (Object.entries(destinos) as [EstadoTarea, readonly Quien[]][])
    .filter(([, quienes]) =>
      esLider ? quienes.includes('lider') : quienes.includes('responsable'),
    )
    .map(([destino]) => destino);
}

const NOMBRE: Record<EstadoTarea, string> = {
  propuesta: 'Propuesta',
  backlog: 'Backlog',
  aceptada: 'Aceptada',
  habilitada: 'Habilitada',
  en_curso: 'En curso',
  atascada: 'Atascada',
  completada: 'Completada',
  rechazada: 'Rechazada',
};

export type ResultadoTransicion = { valida: true } | { valida: false; motivo: string };

/** Comprueba una transición y, si no es válida, explica por qué en español. */
export function comprobarTransicion(
  tarea: TareaParaTransicion,
  destino: EstadoTarea,
  perfil: Perfil,
  usuarioId: string,
): ResultadoTransicion {
  if (transicionesValidas(tarea, perfil, usuarioId).includes(destino)) return { valida: true };
  const no = (motivo: string): ResultadoTransicion => ({ valida: false, motivo });
  if (perfil === 'invitado') return no('Los invitados no cambian estados.');
  const esLider = perfil === 'lider';
  if (!esLider && tarea.responsable_id !== usuarioId) {
    return no('Solo el responsable o el líder pueden cambiar el estado de esta tarea.');
  }
  if (!esLider && tarea.asignacion_pendiente) return no('Primero acepta la asignación.');
  if (tarea.estado === 'propuesta') return no('Las propuestas se deciden en triaje.');
  if (tarea.estado === 'backlog') return no('Primero agrega la tarea al sprint desde el backlog.');
  if (tarea.estado === 'rechazada')
    return no('La tarea fue rechazada; el líder la reasigna en triaje.');
  if (!esLider && destino === 'habilitada') return no('Solo el líder puede habilitar tareas.');
  if (!esLider && tarea.estado === 'completada') {
    return no('Solo el líder puede reabrir una tarea completada.');
  }
  return no(`No se puede pasar de «${NOMBRE[tarea.estado]}» a «${NOMBRE[destino]}».`);
}
