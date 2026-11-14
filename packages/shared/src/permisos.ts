/**
 * Matriz de permisos de Nexo (docs/01, sección 2.2). Es obligatoria en el servidor:
 * la API la usa como guardia de cada ruta y la web para ocultar controles.
 * Nunca se escribe `if (rol === 'lider')` suelto: siempre `puede(...)`.
 * Los textos de motivo son los del prototipo (`src/lib/permisos.ts`).
 */

export const PERFILES = ['personal', 'lider', 'integrante', 'invitado'] as const;
export type Perfil = (typeof PERFILES)[number];

/**
 * Regla de una celda de la matriz:
 * - `si` / `no`: permitido o prohibido sin condiciones.
 * - `propio`: solo sobre lo propio (p).
 * - `compartido`: solo sobre lo que se le compartió (c).
 * - `na`: la acción no aplica a ese perfil (—); se trata como prohibida.
 */
export type Regla = 'si' | 'no' | 'propio' | 'compartido' | 'na';

interface Fila extends Readonly<Record<Perfil, Regla>> {
  readonly motivo: string;
}

const fila = (
  personal: Regla,
  lider: Regla,
  integrante: Regla,
  invitado: Regla,
  motivo: string,
): Fila => ({ personal, lider, integrante, invitado, motivo });

const SIN_ACCESO = 'Tu rol en este espacio no incluye esta acción.';

export const MATRIZ_PERMISOS = {
  // --- Las 30 filas de la tabla de docs/01, 2.2, en el mismo orden ---
  ver_resumen: fila('si', 'si', 'si', 'compartido', 'Solo puedes ver lo compartido contigo.'),
  crear_tarea: fila(
    'si',
    'si',
    'no',
    'no',
    'Como integrante, propones tareas y el líder las acepta en triaje.',
  ),
  proponer_tarea: fila('na', 'na', 'si', 'no', 'Los invitados no pueden proponer tareas.'),
  triaje: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede aceptar o rechazar propuestas en triaje.',
  ),
  asignar_responsable: fila(
    'si',
    'si',
    'no',
    'no',
    'Solo el líder puede asignar responsables. Puedes solicitar un cambio en los comentarios.',
  ),
  responder_asignacion: fila('na', 'si', 'si', 'no', 'Los invitados no reciben asignaciones.'),
  habilitar_tarea: fila('si', 'si', 'no', 'no', 'Solo el líder puede habilitar tareas.'),
  cambiar_estado_tarea: fila(
    'si',
    'si',
    'propio',
    'no',
    'Solo el responsable o el líder pueden cambiar el estado de esta tarea.',
  ),
  editar_tarea_ajena: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede editar tareas de otras personas.',
  ),
  comentar: fila(
    'si',
    'si',
    'si',
    'compartido',
    'Solo puedes comentar en tareas compartidas contigo.',
  ),
  adjuntar_archivos: fila('si', 'si', 'si', 'no', 'Los invitados no pueden adjuntar archivos.'),
  chat_equipo: fila('na', 'si', 'si', 'no', 'Los invitados solo acceden al canal de Invitados.'),
  chat_tarea: fila(
    'na',
    'si',
    'si',
    'compartido',
    'Solo puedes usar el chat de tareas compartidas contigo.',
  ),
  mensajes_directos: fila(
    'na',
    'si',
    'si',
    'no',
    'Los invitados no pueden enviar mensajes directos.',
  ),
  moderar_chat: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede fijar o eliminar mensajes de otras personas.',
  ),
  crear_reunion: fila('propio', 'si', 'si', 'no', 'Los invitados no pueden crear reuniones.'),
  gestionar_sprints: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede planear, iniciar y cerrar sprints.',
  ),
  moderar_retro: fila('na', 'si', 'no', 'no', 'Solo el líder modera la retrospectiva.'),
  participar_retro: fila(
    'na',
    'si',
    'si',
    'no',
    'Los invitados no participan en la retrospectiva.',
  ),
  ver_reportes: fila('propio', 'si', 'si', 'no', 'Los invitados no tienen acceso a reportes.'),
  exportar_reportes: fila(
    'propio',
    'si',
    'propio',
    'no',
    'Como integrante solo puedes exportar tus propios datos.',
  ),
  configurar_whatsapp: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder configura la integración con WhatsApp.',
  ),
  enviar_cola_whatsapp: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder revisa y envía la cola de WhatsApp.',
  ),
  ver_historial_whatsapp: fila(
    'na',
    'si',
    'si',
    'no',
    'Los invitados no ven el historial de WhatsApp.',
  ),
  invitar_personas: fila('na', 'si', 'no', 'no', 'Solo el líder puede invitar personas.'),
  expulsar_miembros: fila('na', 'si', 'no', 'no', 'Solo el líder puede expulsar miembros.'),
  convertir_invitado: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede convertir invitados en integrantes.',
  ),
  transferir_liderazgo: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede transferir el liderazgo.',
  ),
  votar_eleccion: fila('na', 'no', 'si', 'no', 'El líder saliente no vota en la elección.'),
  salir_equipo: fila('na', 'si', 'si', 'si', SIN_ACCESO),

  // --- Acciones adicionales del prototipo (guardas de vistas; no están en la tabla de docs/01) ---
  archivar_equipo: fila(
    'na',
    'si',
    'no',
    'no',
    'Solo el líder puede archivar o eliminar el equipo.',
  ),
  ver_actividad: fila('na', 'si', 'si', 'no', 'Los invitados no ven el registro de actividad.'),
  crear_plantilla: fila('propio', 'si', 'no', 'no', 'Solo el líder crea plantillas del equipo.'),
  usar_plantilla: fila('propio', 'si', 'si', 'no', 'Los invitados no usan plantillas.'),
  ver_miembros: fila('na', 'si', 'si', 'no', 'Los invitados no ven la lista completa de miembros.'),
  ver_calendario: fila('si', 'si', 'si', 'no', 'Los invitados no ven el calendario completo.'),
  ver_archivos: fila('na', 'si', 'si', 'no', 'Los invitados no ven los archivos del equipo.'),
  ver_sprints: fila('na', 'si', 'si', 'no', 'Los invitados no ven los sprints.'),
  configurar_equipo: fila('na', 'si', 'no', 'no', 'Solo el líder configura el equipo.'),
  canal_invitados: fila('na', 'si', 'si', 'si', SIN_ACCESO),
} as const satisfies Record<string, Fila>;

export type Accion = keyof typeof MATRIZ_PERMISOS;
export const ACCIONES = Object.keys(MATRIZ_PERMISOS) as Accion[];

export interface ContextoPermiso {
  perfil: Perfil;
  /** El objeto es del propio usuario (su tarea, su reporte…). Requerido por las reglas (p). */
  esPropio?: boolean;
  /** El objeto fue compartido con el usuario (invitados). Requerido por las reglas (c). */
  esCompartido?: boolean;
}

export type ResultadoPermiso =
  | { permitido: true }
  | {
      permitido: false;
      /** Motivo en español, para mostrarlo tal cual. */
      motivo: string;
      /** La acción nunca estará disponible para este perfil: la interfaz la oculta en vez de explicarla. */
      oculto: boolean;
    };

/**
 * Única función de permisos del sistema. Es estricta: las reglas (p) y (c) solo se
 * cumplen si el contexto lo afirma explícitamente (el servidor nunca supone).
 */
export function puede(accion: Accion, contexto: ContextoPermiso): ResultadoPermiso {
  const { perfil } = contexto;
  const { motivo, ...reglas } = MATRIZ_PERMISOS[accion];
  const regla: Regla = reglas[perfil];
  const permitido =
    regla === 'si' ||
    (regla === 'propio' && contexto.esPropio === true) ||
    (regla === 'compartido' && contexto.esCompartido === true);
  if (permitido) return { permitido: true };
  const oculto =
    regla === 'na' ||
    regla === 'compartido' ||
    (regla === 'no' && (perfil === 'invitado' || perfil === 'personal'));
  return { permitido: false, motivo, oculto };
}
