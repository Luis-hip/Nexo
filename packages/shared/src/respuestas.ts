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
