import { z } from 'zod';
import {
  ROLES_EQUIPO,
  type ComentarioEquipo,
  type ConteosTareas,
  type EquipoDetalle,
  type Invitacion,
  type Miembro,
  type PersonaTarea,
  type TareaEquipo,
  type TareaEquipoDetalle,
  type VistaInvitacion,
} from './equipos';
import {
  DENSIDADES,
  TAMANOS_TEXTO,
  TEMAS,
  type EquipoDeUsuario,
  type Preferencias,
  type UsuarioSesion,
} from './esquemas';
import {
  ESTADOS_TAREA,
  PRIORIDADES_TAREA,
  SEMAFOROS,
  type ComentarioTarea,
  type Subtarea,
  type TareaPersonal,
  type TareaPersonalDetalle,
} from './tareas';
import { EVENTOS_NOTIFICACION, type AjustesUsuario, type ReportePersonal } from './ajustes';
import {
  ESTADOS_TRANSFERENCIA,
  FASES_ELECCION,
  type CandidatoEleccion,
  type ConfiguracionEquipo,
  type Eleccion,
  type Liderazgo,
  type Transferencia,
} from './liderazgo';
import {
  COLUMNAS_RETRO,
  ESTADOS_SPRINT,
  type CapacidadMiembro,
  type NotaRetro,
  type PuntoBurndown,
  type ResultadoVotoRetro,
  type Retrospectiva,
  type RetroResumen,
  type Sprint,
  type SprintDetalle,
} from './sprints';
import {
  REPETICIONES,
  RESPUESTAS_ASISTENCIA,
  TIPOS_ACTIVIDAD,
  TIPOS_ARCHIVO,
  TIPOS_PLANTILLA,
  type Archivo,
  type CalendarioEquipo,
  type EntradaActividad,
  type FilaExportacion,
  type Notificacion,
  type Notificaciones,
  type PaginaActividad,
  type Plantilla,
  type ReporteEquipo,
  type Reunion,
} from './vistas';
import { esquemaResumenVotacion } from './votacion';

/**
 * Esquemas de lo que devuelven los procesos de la BD (docs/08, DEC-025). La API valida cada
 * respuesta con ellos en `repositorios/`, así un proceso que cambie de forma falla de inmediato
 * en vez de mandar datos raros a la web. Cada esquema está atado a su interfaz con `satisfies`:
 * si la interfaz cambia y el esquema no, TypeScript no compila.
 */

const fechaIso = z.string();
const estado = z.enum(ESTADOS_TAREA);
const prioridad = z.enum(PRIORIDADES_TAREA);
const semaforo = z.enum(SEMAFOROS).nullable();
const resultado = z.enum(['a_tiempo', 'con_retraso']).nullable();
const rol = z.enum(ROLES_EQUIPO);

// --- Cuenta ------------------------------------------------------------------------------------

export const esquemaUsuarioSesion = z.object({
  id: z.string(),
  correo: z.string(),
  nombre: z.string(),
  cargo: z.string(),
  descripcion: z.string(),
  zona_horaria: z.string(),
  avatar_url: z.string().nullable(),
}) satisfies z.ZodType<UsuarioSesion>;

/** Lo que devuelve `proc_sesion_resolver`: la sesión vigente y su usuario, o `null`. */
export const esquemaSesionResuelta = z
  .object({ sesion_id: z.string(), usuario: esquemaUsuarioSesion })
  .nullable();

export const esquemaPreferenciasCompletas = z.object({
  tema: z.enum(TEMAS),
  densidad: z.enum(DENSIDADES),
  tamano_texto: z.enum(TAMANOS_TEXTO),
  reducir_movimiento: z.boolean(),
  formato_hora: z.enum(['24h', '12h']),
  formato_fecha: z.enum(['dd/mm', 'mm/dd']),
  tour_visto: z.boolean(),
  idioma: z.string(),
  resumen_diario: z.boolean(),
}) satisfies z.ZodType<Preferencias>;

export const esquemaEquipoDeUsuario = z.object({
  id: z.string(),
  nombre: z.string(),
  rol,
  color_idx: z.number().nullable(),
  caduca_en: fechaIso.nullable(),
}) satisfies z.ZodType<EquipoDeUsuario>;

/** Lo que devuelve `proc_usuario_yo` (el usuario lo pone la sesión). */
export const esquemaYoBd = z.object({
  equipos: z.array(esquemaEquipoDeUsuario),
  preferencias: esquemaPreferenciasCompletas,
});

export const esquemaUsuarioDev = z.object({
  id: z.string(),
  correo: z.string(),
  nombre: z.string(),
  cargo: z.string(),
});

// --- Equipos e invitaciones ---------------------------------------------------------------------

/** Lo que devuelve `proc_equipo_contexto`: la membresía activa del actor en el equipo. */
export const esquemaContextoEquipo = z.object({
  membresia_id: z.string(),
  rol,
  equipo: z.object({
    nombre: z.string(),
    estado: z.enum(['activo', 'archivado']),
    max_miembros: z.number(),
  }),
});

export const esquemaMiembro = z.object({
  membresia_id: z.string(),
  usuario_id: z.string(),
  nombre: z.string(),
  rol,
  color_idx: z.number().nullable(),
  caduca_en: fechaIso.nullable(),
}) satisfies z.ZodType<Miembro>;

export const esquemaEquipoDetalle = z.object({
  id: z.string(),
  nombre: z.string(),
  descripcion: z.string(),
  estado: z.enum(['activo', 'archivado']),
  max_miembros: z.number(),
  miembros_activos: z.number(),
  invitados_activos: z.number(),
  mi_rol: rol,
  mi_membresia_id: z.string(),
  lider: z.object({ usuario_id: z.string(), nombre: z.string() }).nullable(),
  miembros: z.array(esquemaMiembro),
  sprints: z.array(
    z.object({
      id: z.string(),
      numero: z.number(),
      estado: z.enum(['planificado', 'activo', 'cerrado']),
      inicio: z.string(),
      fin: z.string(),
    }),
  ),
  etiquetas: z.array(z.string()),
}) satisfies z.ZodType<EquipoDetalle>;

export const esquemaInvitacion = z.object({
  id: z.string(),
  codigo: z.string(),
  rol_destino: z.enum(['integrante', 'invitado']),
  estado: z.enum(['pendiente', 'aceptada', 'revocada', 'caducada']),
  caduca_en: fechaIso,
  duracion_invitado_dias: z.number().nullable(),
  creada_en: fechaIso,
  aceptada_por: z.string().nullable(),
}) satisfies z.ZodType<Invitacion>;

export const esquemaVistaInvitacion = z.object({
  codigo: z.string(),
  equipo: z.object({ id: z.string(), nombre: z.string(), descripcion: z.string() }),
  lider: z.string().nullable(),
  miembros_activos: z.number(),
  max_miembros: z.number(),
  rol_destino: z.enum(['integrante', 'invitado']),
  duracion_invitado_dias: z.number().nullable(),
  caduca_en: fechaIso,
  ya_miembro: z.boolean(),
}) satisfies z.ZodType<VistaInvitacion>;

export const esquemaInvitacionAceptada = z.object({
  equipo_id: z.string(),
  rol: z.enum(['integrante', 'invitado']),
  /** docs/13 1.1: la persona ya tiene WhatsApp verificado y quedó con los avisos del equipo. */
  whatsapp_activo: z.boolean().default(false),
});

// --- Tareas de equipo ---------------------------------------------------------------------------

export const esquemaPersonaTarea = z.object({
  usuario_id: z.string(),
  nombre: z.string(),
  color_idx: z.number().nullable(),
}) satisfies z.ZodType<PersonaTarea>;

export const esquemaTareaEquipo = z.object({
  id: z.string(),
  equipo_id: z.string(),
  codigo: z.number(),
  titulo: z.string(),
  descripcion: z.string(),
  estado,
  prioridad,
  progreso: z.number(),
  vence_en: fechaIso.nullable(),
  motivo: z.string().nullable(),
  rechazo_por: z.enum(['lider', 'responsable', 'votacion']).nullable(),
  cambios_pedidos: z.string().nullable(),
  resultado,
  semaforo,
  asignacion_pendiente: z.boolean(),
  origen: z.enum(['propuesta', 'directa']),
  orden: z.string(),
  sprint_id: z.string().nullable(),
  archivada: z.boolean(),
  version: z.number(),
  creado_en: fechaIso,
  actualizado_en: fechaIso,
  completada_en: fechaIso.nullable(),
  responsable: esquemaPersonaTarea.nullable(),
  proponente: esquemaPersonaTarea.nullable(),
  etiquetas: z.array(z.string()),
  subtareas_total: z.number(),
  subtareas_hechas: z.number(),
  comentarios_total: z.number(),
  votacion: esquemaResumenVotacion.nullable().optional(),
}) satisfies z.ZodType<TareaEquipo>;

export const esquemaSubtarea = z.object({
  id: z.string(),
  titulo: z.string(),
  hecha: z.boolean(),
}) satisfies z.ZodType<Subtarea>;

export const esquemaComentarioEquipo = z.object({
  id: z.string(),
  texto: z.string(),
  autor: esquemaPersonaTarea.nullable(),
  creado_en: fechaIso,
  editado_en: fechaIso.nullable(),
}) satisfies z.ZodType<ComentarioEquipo>;

/**
 * Detalle que devuelven los procesos de tareas de equipo. No trae `transiciones`: las calcula
 * la API con la máquina de estados de `estados.ts`, que es la fuente de verdad.
 */
export const esquemaTareaEquipoDetalleBd = esquemaTareaEquipo.extend({
  subtareas: z.array(esquemaSubtarea),
  comentarios: z.array(esquemaComentarioEquipo),
  historial: z.array(
    z.object({
      id: z.string(),
      resumen: z.string(),
      autor: z.string().nullable(),
      creado_en: fechaIso,
    }),
  ),
  compartida_con: z.array(z.string()),
}) satisfies z.ZodType<Omit<TareaEquipoDetalle, 'transiciones'>>;
export type TareaEquipoDetalleBd = z.infer<typeof esquemaTareaEquipoDetalleBd>;

export const esquemaConteosTareas = z.object({
  tablero: z.number(),
  backlog: z.number(),
  votacion: z.number(),
}) satisfies z.ZodType<ConteosTareas>;

// --- Tareas personales --------------------------------------------------------------------------

export const esquemaTareaPersonal = z.object({
  id: z.string(),
  codigo: z.number(),
  titulo: z.string(),
  descripcion: z.string(),
  estado,
  prioridad,
  progreso: z.number(),
  vence_en: fechaIso.nullable(),
  motivo: z.string().nullable(),
  resultado,
  semaforo,
  archivada: z.boolean(),
  version: z.number(),
  creado_en: fechaIso,
  actualizado_en: fechaIso,
  completada_en: fechaIso.nullable(),
  etiquetas: z.array(z.string()),
  subtareas_total: z.number(),
  subtareas_hechas: z.number(),
}) satisfies z.ZodType<TareaPersonal>;

export const esquemaComentarioTarea = z.object({
  id: z.string(),
  texto: z.string(),
  autor_id: z.string().nullable(),
  creado_en: fechaIso,
  editado_en: fechaIso.nullable(),
}) satisfies z.ZodType<ComentarioTarea>;

export const esquemaTareaPersonalDetalle = esquemaTareaPersonal.extend({
  subtareas: z.array(esquemaSubtarea),
  comentarios: z.array(esquemaComentarioTarea),
}) satisfies z.ZodType<TareaPersonalDetalle>;

// --- Sprints y retrospectiva (0009) ------------------------------------------------------------

const esquemaRetroResumen = z.object({
  id: z.string(),
  votacion_cerrada: z.boolean(),
  cerrada: z.boolean(),
}) satisfies z.ZodType<RetroResumen>;

export const esquemaSprint = z.object({
  id: z.string(),
  equipo_id: z.string(),
  numero: z.number().int(),
  objetivo: z.string(),
  inicio: z.string(),
  fin: z.string(),
  estado: z.enum(ESTADOS_SPRINT),
  cerrado_en: fechaIso.nullable(),
  total: z.number().int(),
  completadas: z.number().int(),
  retro: esquemaRetroResumen.nullable(),
}) satisfies z.ZodType<Sprint>;

const esquemaCapacidadMiembro = z.object({
  usuario_id: z.string(),
  nombre: z.string(),
  color_idx: z.number().nullable(),
  horas: z.number().int(),
  tareas: z.number().int(),
}) satisfies z.ZodType<CapacidadMiembro>;

const esquemaPuntoBurndown = z.object({
  dia: z.string(),
  total: z.number().int(),
  completadas: z.number().int(),
}) satisfies z.ZodType<PuntoBurndown>;

export const esquemaSprintDetalle = esquemaSprint.extend({
  capacidad: z.array(esquemaCapacidadMiembro),
  serie: z.array(esquemaPuntoBurndown),
  tareas: z.array(esquemaTareaEquipo),
}) satisfies z.ZodType<SprintDetalle>;

const esquemaNotaRetroBd = z.object({
  id: z.string(),
  columna: z.enum(COLUMNAS_RETRO),
  texto: z.string(),
  anonima: z.boolean(),
  mia: z.boolean(),
  autor: esquemaPersonaTarea.nullable(),
  grupo: z.string().nullable(),
  tarea_id: z.string().nullable(),
  votos: z.number().int(),
  voto_mio: z.boolean(),
  creada_en: fechaIso,
}) satisfies z.ZodType<NotaRetro>;

export const esquemaRetrospectiva = z.object({
  id: z.string(),
  sprint_id: z.string(),
  sprint_numero: z.number().int(),
  votacion_cerrada: z.boolean(),
  cerrada: z.boolean(),
  votos_por_persona: z.number().int(),
  mis_votos_usados: z.number().int(),
  notas: z.array(esquemaNotaRetroBd),
}) satisfies z.ZodType<Retrospectiva>;

export const esquemaResultadoVotoRetro = z.object({
  nota_id: z.string(),
  votos: z.number().int(),
  voto_mio: z.boolean(),
  mis_votos_usados: z.number().int(),
}) satisfies z.ZodType<ResultadoVotoRetro>;

// --- Liderazgo y equipo (0010) -----------------------------------------------------------------

const esquemaCandidatoEleccion = esquemaPersonaTarea.extend({
  finalista: z.boolean(),
  votos: z.number().int().nullable(),
}) satisfies z.ZodType<CandidatoEleccion>;

export const esquemaEleccion = z.object({
  id: z.string(),
  fase: z.enum(FASES_ELECCION),
  ronda: z.number().int(),
  plazo_en: fechaIso,
  creada_en: fechaIso,
  cerrada_en: fechaIso.nullable(),
  saliente: esquemaPersonaTarea,
  ganador: esquemaPersonaTarea.nullable(),
  candidatos: z.array(esquemaCandidatoEleccion),
  votantes_total: z.number().int(),
  votaron: z.array(z.string()),
  mi_voto: z.string().nullable(),
}) satisfies z.ZodType<Eleccion>;

export const esquemaTransferencia = z.object({
  id: z.string(),
  estado: z.enum(ESTADOS_TRANSFERENCIA),
  saldra: z.boolean(),
  de: esquemaPersonaTarea,
  a: esquemaPersonaTarea,
  creada_en: fechaIso,
  resuelta_en: fechaIso.nullable(),
}) satisfies z.ZodType<Transferencia>;

export const esquemaLiderazgo = z.object({
  transferencia: esquemaTransferencia.nullable(),
  eleccion: esquemaEleccion.nullable(),
  historial: z.array(
    z.discriminatedUnion('tipo', [
      esquemaTransferencia.extend({ tipo: z.literal('transferencia') }),
      esquemaEleccion.extend({ tipo: z.literal('eleccion') }),
    ]),
  ),
}) satisfies z.ZodType<Liderazgo>;

export const esquemaConfiguracionEquipo = z.object({
  nombre: z.string(),
  descripcion: z.string(),
  estado: z.enum(['activo', 'archivado']),
  duracion_sprint_semanas: z.number().int(),
  zona_horaria: z.string(),
  votacion_plazo_horas: z.number().int(),
  votacion_desempate_horas: z.number().int(),
  max_miembros: z.number().int(),
  archivado_en: fechaIso.nullable(),
}) satisfies z.ZodType<ConfiguracionEquipo>;

// --- Vistas secundarias y archivos (0011, 0012) ------------------------------------------------

export const esquemaReunion = z.object({
  id: z.string(),
  titulo: z.string(),
  inicio: fechaIso,
  inicio_serie: fechaIso,
  duracion_min: z.number().int(),
  repeticion: z.enum(REPETICIONES),
  lugar: z.string(),
  descripcion: z.string(),
  recordatorio_min: z.number().int(),
  avisar_wa: z.boolean(),
  creada_por: esquemaPersonaTarea.nullable(),
  puedo_editar: z.boolean(),
  asistencia: z.object({
    si: z.number().int(),
    no: z.number().int(),
    quiza: z.number().int(),
    pendiente: z.number().int(),
  }),
  mi_respuesta: z.enum(RESPUESTAS_ASISTENCIA).nullable(),
}) satisfies z.ZodType<Reunion>;

export const esquemaCalendarioEquipo = z.object({
  reuniones: z.array(esquemaReunion),
  entregas: z.array(esquemaTareaEquipo),
}) satisfies z.ZodType<CalendarioEquipo>;

const esquemaEntradaActividad = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_ACTIVIDAD),
  accion: z.string(),
  resumen: z.string(),
  objeto_tipo: z.string(),
  objeto_id: z.string().nullable(),
  creado_en: fechaIso,
  autor: esquemaPersonaTarea.nullable(),
}) satisfies z.ZodType<EntradaActividad>;

export const esquemaPaginaActividad = z.object({
  items: z.array(esquemaEntradaActividad),
  hay_mas: z.boolean(),
}) satisfies z.ZodType<PaginaActividad>;

const esquemaNotificacion = z.object({
  id: z.string(),
  equipo_id: z.string().nullable(),
  equipo: z.string().nullable(),
  categoria: z.enum(['menciones', 'tareas', 'equipo']),
  icono: z.string(),
  titulo: z.string(),
  texto: z.string(),
  enlace: z.string().nullable(),
  accion_tipo: z.string().nullable(),
  accion_ref: z.string().nullable(),
  creada_en: fechaIso,
  leida_en: fechaIso.nullable(),
}) satisfies z.ZodType<Notificacion>;

export const esquemaNotificaciones = z.object({
  no_leidas: z.number().int(),
  items: z.array(esquemaNotificacion),
}) satisfies z.ZodType<Notificaciones>;

export const esquemaReporteEquipo = z.object({
  generado_en: fechaIso,
  por_estado: z.record(z.string(), z.number().int()),
  completadas: z.number().int(),
  a_tiempo: z.number().int(),
  con_retraso: z.number().int(),
  vencidas: z.number().int(),
  por_persona: z.array(
    esquemaPersonaTarea.extend({
      abiertas: z.number().int(),
      completadas: z.number().int(),
      a_tiempo: z.number().int(),
    }),
  ),
  sprints: z.array(
    z.object({
      numero: z.number().int(),
      estado: z.string(),
      total: z.number().int(),
      completadas: z.number().int(),
    }),
  ),
}) satisfies z.ZodType<ReporteEquipo>;

export const esquemaFilaExportacion = z.object({
  codigo: z.string(),
  titulo: z.string(),
  estado: z.string(),
  prioridad: z.string(),
  responsable: z.string().nullable(),
  sprint: z.number().int().nullable(),
  progreso: z.number().int(),
  vence_en: fechaIso.nullable(),
  completada_en: fechaIso.nullable(),
  resultado: z.string().nullable(),
  creado_en: fechaIso,
}) satisfies z.ZodType<FilaExportacion>;

export const esquemaPlantilla = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(TIPOS_PLANTILLA),
  descripcion: z.string(),
  creada_en: fechaIso,
  elementos: z.array(z.string()),
}) satisfies z.ZodType<Plantilla>;

export const esquemaArchivo = z.object({
  id: z.string(),
  nombre: z.string(),
  mime: z.string(),
  tipo: z.enum(TIPOS_ARCHIVO),
  tamano_bytes: z.number().int(),
  creado_en: fechaIso,
  subido_por: esquemaPersonaTarea.nullable(),
  tarea: z.object({ id: z.string(), codigo: z.number().int(), titulo: z.string() }).nullable(),
  puedo_eliminar: z.boolean(),
}) satisfies z.ZodType<Archivo>;

// --- Ajustes y reporte personal (0013) ---------------------------------------------------------

export const esquemaAjustesUsuario = z.object({
  silencio_desde: z.string().nullable(),
  silencio_hasta: z.string().nullable(),
  resumen_diario: z.boolean(),
  estado_visible: z.boolean(),
  primer_dia: z.enum(['lunes', 'domingo']),
  notificaciones: z.array(
    z.object({
      evento: z.enum(EVENTOS_NOTIFICACION),
      por_app: z.boolean(),
      por_whatsapp: z.boolean(),
      por_correo: z.boolean(),
    }),
  ),
}) satisfies z.ZodType<AjustesUsuario>;

export const esquemaReportePersonal = z.object({
  generado_en: fechaIso,
  por_estado: z.record(z.string(), z.number().int()),
  completadas: z.number().int(),
  a_tiempo: z.number().int(),
  con_retraso: z.number().int(),
  vencidas: z.number().int(),
  por_espacio: z.array(
    z.object({
      equipo_id: z.string().nullable(),
      nombre: z.string(),
      abiertas: z.number().int(),
      completadas: z.number().int(),
    }),
  ),
}) satisfies z.ZodType<ReportePersonal>;

// =============================================================================================
// Fase 4 · Chat (4.1): respuestas de los procesos `proc_chat_*`
// =============================================================================================
import {
  REACCIONES,
  TIPOS_CONVERSACION,
  type ConversacionChat,
  type HiloChat,
  type MensajeChat,
  type MiembroChat,
  type PaginaMensajes,
  type ResultadoBusquedaChat,
  type ResultadoLectura,
  type ResultadoMensajeATarea,
  type ResultadoReaccion,
} from './chat';

const esquemaTareaVinculada = z.object({
  id: z.string(),
  codigo: z.number().int(),
  titulo: z.string(),
});

const esquemaReaccionResumen = z.object({
  tipo: z.enum(REACCIONES),
  total: z.number().int(),
  yo: z.boolean(),
});

export const esquemaMensajeChat = z.object({
  id: z.string(),
  seq: z.number().int(),
  conversacion_id: z.string(),
  autor: esquemaPersonaTarea.nullable(),
  es_sistema: z.boolean(),
  texto: z.string(),
  eliminado: z.boolean(),
  hilo_de_id: z.string().nullable(),
  respuestas: z.number().int(),
  fijado: z.boolean(),
  tarea: esquemaTareaVinculada.nullable(),
  reacciones: z.array(esquemaReaccionResumen),
  menciones: z.array(z.string()),
  leido_por: z.number().int(),
  creado_en: fechaIso,
  editado_en: fechaIso.nullable(),
}) satisfies z.ZodType<MensajeChat>;

export const esquemaConversacionChat = z.object({
  id: z.string(),
  equipo_id: z.string(),
  tipo: z.enum(TIPOS_CONVERSACION),
  nombre: z.string(),
  tarea: esquemaTareaVinculada.nullable(),
  con: esquemaPersonaTarea.nullable(),
  ultimo: z
    .object({
      texto: z.string(),
      autor_nombre: z.string().nullable(),
      es_sistema: z.boolean(),
      creado_en: fechaIso,
    })
    .nullable(),
  no_leidos: z.number().int(),
  menciones_sin_leer: z.number().int(),
  fijada: z.boolean(),
  silenciada: z.boolean(),
}) satisfies z.ZodType<ConversacionChat>;

export const esquemaListaConversaciones = z.array(esquemaConversacionChat);
export const esquemaListaMensajes = z.array(esquemaMensajeChat);

export const esquemaPaginaMensajes = z.object({
  conversacion: esquemaConversacionChat,
  items: z.array(esquemaMensajeChat),
  hay_mas: z.boolean(),
}) satisfies z.ZodType<PaginaMensajes>;

export const esquemaHiloChat = z.object({
  raiz: esquemaMensajeChat,
  respuestas: z.array(esquemaMensajeChat),
}) satisfies z.ZodType<HiloChat>;

export const esquemaMiembrosChat = z.array(esquemaPersonaTarea.extend({ rol })) satisfies z.ZodType<
  MiembroChat[]
>;

export const esquemaSalasChat = z.array(
  z.object({ conversacion_id: z.string(), equipo_id: z.string() }),
);

export const esquemaResultadoReaccion = z.object({
  mensaje_id: z.string(),
  conversacion_id: z.string(),
  reacciones: z.array(esquemaReaccionResumen),
}) satisfies z.ZodType<ResultadoReaccion>;

export const esquemaResultadoLectura = z.object({
  conversacion_id: z.string(),
  ultimo_leido_seq: z.number().int(),
  no_leidos: z.number().int(),
}) satisfies z.ZodType<ResultadoLectura>;

export const esquemaResultadosBusquedaChat = z.array(
  z.object({
    mensaje_id: z.string(),
    seq: z.number().int(),
    conversacion_id: z.string(),
    tipo: z.enum(TIPOS_CONVERSACION),
    conversacion: z.string(),
    autor: esquemaPersonaTarea.nullable(),
    fragmento: z.string(),
    creado_en: fechaIso,
  }),
) satisfies z.ZodType<ResultadoBusquedaChat[]>;

export const esquemaResultadoMensajeATarea = z.object({
  tarea: z.object({ id: z.string(), codigo: z.number().int(), estado: z.string() }),
  mensaje: esquemaMensajeChat,
  sistema: esquemaMensajeChat,
}) satisfies z.ZodType<ResultadoMensajeATarea>;

// =============================================================================================
// Fase 5 · Autenticación (5.1): respuestas de los procesos `proc_auth_*`
// =============================================================================================
import type { CuentaAuth } from './autenticacion';

export const esquemaAuthUsuario = z.object({ usuario: esquemaUsuarioSesion });

export const esquemaAuthCredenciales = z
  .object({ usuario_id: z.string(), hash: z.string() })
  .nullable();

export const esquemaAuthEntrar = z.object({
  estado: z.enum(['ok', 'fallo', 'bloqueada']),
  usuario: esquemaUsuarioSesion.optional(),
});

export const esquemaAuthDestinatario = z
  .object({ correo: z.string(), nombre: z.string() })
  .nullable();

export const esquemaAuthVerificacion = z.object({
  correo: z.string(),
  nombre: z.string(),
  verificado: z.boolean(),
});

export const esquemaCuentaAuth = z.object({
  correo: z.string(),
  correo_verificado: z.boolean(),
  tiene_contrasena: z.boolean(),
  sesiones_activas: z.number().int(),
}) satisfies z.ZodType<CuentaAuth>;

// =============================================================================================
// Fase 4 · WhatsApp (4.2 y 4.3): respuestas de los procesos `proc_wa_*`
// =============================================================================================
import {
  ESTADOS_ENTREGA_WA,
  FORMATOS_WA,
  MODOS_ENTREGA_WA,
  type EntregaWa,
  ESTADOS_CONEXION_WA,
  ESTADOS_MENSAJE_WA,
  MODOS_REGLA_WA,
  PROVEEDORES_WA,
  REGLAS_WA,
  type AvisoParaEnviar,
  type ColaWa,
  type ConfiguracionWa,
  type HistorialWa,
  type MensajeWa,
  type PanelWa,
  type WhatsAppUsuario,
} from './whatsapp';

export const esquemaConfiguracionWa = z.object({
  proveedor: z.enum(PROVEEDORES_WA),
  estado: z.enum(ESTADOS_CONEXION_WA),
  grupo_nombre: z.string().nullable(),
  grupo_externo_id: z.string().nullable(),
  enlace_invitacion: z.string().nullable(),
  causa_error: z.string().nullable(),
  ultimo_envio_en: fechaIso.nullable(),
  reporte_frecuencia: z.enum(['diario', 'semanal']),
  reporte_hora: z.string(),
  reporte_dia: z.number().int(),
  agrupar: z.boolean(),
  silencio_desde: z.string().nullable(),
  silencio_hasta: z.string().nullable(),
  envio_automatico: z.boolean(),
  ultimo_reporte_en: fechaIso.nullable(),
  proximo_reporte: fechaIso.nullable(),
  modo_entrega: z.enum(MODOS_ENTREGA_WA),
  formato_defecto: z.enum(FORMATOS_WA),
}) satisfies z.ZodType<ConfiguracionWa>;

export const esquemaEntregaWa = z.object({
  id: z.string(),
  destino: z.enum(['grupo', 'persona']),
  formato: z.enum(FORMATOS_WA),
  estado: z.enum(ESTADOS_ENTREGA_WA),
  persona: esquemaPersonaTarea.nullable(),
  numero_fin: z.string().nullable(),
  enviado_en: fechaIso.nullable(),
  entregado_en: fechaIso.nullable(),
  leido_en: fechaIso.nullable(),
  caduca_en: fechaIso.nullable(),
  ultimo_error: z.string().nullable(),
}) satisfies z.ZodType<EntregaWa>;

export const esquemaMensajeWa = z.object({
  id: z.string(),
  tipo_evento: z.string(),
  motivo: z.string(),
  texto: z.string(),
  tipo_envio: z.enum(['instantaneo', 'reporte']),
  estado: z.enum(ESTADOS_MENSAJE_WA),
  seleccionado: z.boolean(),
  programado_para: fechaIso.nullable(),
  enviado_en: fechaIso.nullable(),
  entregado_en: fechaIso.nullable(),
  leido_en: fechaIso.nullable(),
  enviado_por: esquemaPersonaTarea.nullable(),
  intentos: z.number().int(),
  ultimo_error: z.string().nullable(),
  reporte_id: z.string().nullable(),
  creado_en: fechaIso,
  entregas: z.array(esquemaEntregaWa).default([]),
}) satisfies z.ZodType<MensajeWa, unknown>;

export const esquemaPanelWa = z.object({
  configuracion: esquemaConfiguracionWa,
  reglas: z.array(z.object({ tipo_evento: z.enum(REGLAS_WA), modo: z.enum(MODOS_REGLA_WA) })),
  resumen: z.object({
    en_cola: z.number().int(),
    para_reporte: z.number().int(),
    enviados_hoy: z.number().int(),
    fallidos: z.number().int(),
  }),
  personas: z.array(
    esquemaPersonaTarea.extend({
      rol,
      consentimiento: z.boolean().nullable(),
      en_grupo: z.boolean(),
      tiene_numero: z.boolean(),
      numero_fin: z.string().nullable(),
      verificado: z.boolean(),
      formato: z.enum(FORMATOS_WA),
    }),
  ),
}) satisfies z.ZodType<PanelWa, unknown>;

export const esquemaColaWa = z.object({
  instantaneos: z.array(esquemaMensajeWa),
  para_reporte: z.array(esquemaMensajeWa),
  proximo_reporte: fechaIso.nullable(),
}) satisfies z.ZodType<ColaWa, unknown>;

export const esquemaHistorialWaRespuesta = z.object({
  items: z.array(esquemaMensajeWa),
  hay_mas: z.boolean(),
}) satisfies z.ZodType<HistorialWa, unknown>;

export const esquemaAvisosParaEnviar = z.array(
  z.object({
    id: z.string(),
    equipo_id: z.string().nullable(),
    texto: z.string(),
    proveedor: z.enum(PROVEEDORES_WA),
    grupo_externo_id: z.string().nullable(),
    destinatarios: z.array(z.string()),
    usuario_id: z.string().nullable().optional(),
    entregas: z
      .array(
        z.object({
          id: z.string(),
          destino: z.enum(['grupo', 'persona']),
          formato: z.enum(FORMATOS_WA),
          contenido: z.string().nullable(),
          numero: z.string().nullable(),
          nombre: z.string().nullable(),
          ventana_abierta: z.boolean(),
          aviso_corto_reciente: z.boolean(),
        }),
      )
      .optional(),
  }),
) satisfies z.ZodType<AvisoParaEnviar[]>;

export const esquemaWhatsAppUsuarioRespuesta = z.object({
  numero: z.string().nullable(),
  consentimiento: z.boolean(),
  consentimiento_en: fechaIso.nullable(),
  verificado: z.boolean(),
  verificado_en: fechaIso.nullable(),
  ventana_abierta: z.boolean(),
  formato: z.enum(FORMATOS_WA).nullable(),
  equipos: z.array(
    z.object({
      equipo_id: z.string(),
      nombre: z.string(),
      rol,
      consentimiento: z.boolean().nullable(),
      en_grupo: z.boolean(),
      whatsapp_conectado: z.boolean(),
      enlace_invitacion: z.string().nullable(),
    }),
  ),
}) satisfies z.ZodType<WhatsAppUsuario>;

// --- Pendientes tras la Fase 5 (0032) -------------------------------------------------------------

import {
  TIPOS_SOLICITUD_INVITADO,
  type ExportacionDatos,
  type ReunionAgenda,
  type SolicitudInvitado,
} from './pendientes';

export const esquemaAgendaPersonal = z.array(
  esquemaReunion.extend({ equipo_id: z.string(), equipo_nombre: z.string() }),
) satisfies z.ZodType<ReunionAgenda[]>;

export const esquemaExportacionDatos = z.object({
  exportacion_id: z.string(),
  generada_en: fechaIso,
  datos: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<ExportacionDatos>;

export const esquemaSolicitudInvitado = z.object({
  id: z.string(),
  tipo: z.enum(TIPOS_SOLICITUD_INVITADO),
  estado: z.enum(['pendiente', 'aprobada', 'rechazada']),
  creada_en: fechaIso,
  resuelta_en: fechaIso.nullable(),
  persona: esquemaPersonaTarea.nullable(),
  membresia_id: z.string().nullable(),
  caduca_en: fechaIso.nullable(),
}) satisfies z.ZodType<SolicitudInvitado>;
