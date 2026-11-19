import {
  esquemaArchivo,
  esquemaCalendarioEquipo,
  esquemaFilaExportacion,
  esquemaNotificaciones,
  esquemaPaginaActividad,
  esquemaPlantilla,
  esquemaReporteEquipo,
  esquemaReunion,
  type CrearPlantilla,
  type CrearReunion,
  type EditarReunion,
  type TipoActividad,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Vistas secundarias del equipo y archivos (Fase 3.4, DEC-033). Cada función llama a un proceso
 * de las migraciones 0011 y 0012, documentado en docs/08_Procesos_BD.md.
 */

// --- Calendario y reuniones --------------------------------------------------------------------

export function calendario(
  db: Ejecutor,
  actor: string,
  equipo: string,
  desde: string,
  hasta: string,
) {
  return llamarProceso(
    db,
    'proc_calendario_equipo',
    [actor, equipo, desde, hasta],
    esquemaCalendarioEquipo,
  );
}

export function crearReunion(db: Ejecutor, actor: string, equipo: string, datos: CrearReunion) {
  return llamarProceso(db, 'proc_reunion_crear', [actor, equipo, json(datos)], esquemaReunion);
}

export function editarReunion(
  db: Ejecutor,
  actor: string,
  equipo: string,
  reunion: string,
  cambios: EditarReunion,
) {
  return llamarProceso(
    db,
    'proc_reunion_editar',
    [actor, equipo, reunion, json(cambios)],
    esquemaReunion,
  );
}

export function cancelarReunion(db: Ejecutor, actor: string, equipo: string, reunion: string) {
  return llamarProceso(
    db,
    'proc_reunion_cancelar',
    [actor, equipo, reunion],
    z.object({ cancelada: z.literal(true) }),
  );
}

export function responderReunion(
  db: Ejecutor,
  actor: string,
  equipo: string,
  reunion: string,
  respuesta: string,
) {
  return llamarProceso(
    db,
    'proc_reunion_responder',
    [actor, equipo, reunion, respuesta],
    esquemaReunion,
  );
}

// --- Actividad y notificaciones ----------------------------------------------------------------

export function actividad(
  db: Ejecutor,
  actor: string,
  equipo: string,
  { tipo, antes, limite }: { tipo?: TipoActividad; antes?: string; limite: number },
) {
  return llamarProceso(
    db,
    'proc_actividad_listar',
    [actor, equipo, tipo ?? null, antes ?? null, limite],
    esquemaPaginaActividad,
  );
}

export function notificaciones(db: Ejecutor, actor: string, soloNoLeidas: boolean) {
  return llamarProceso(
    db,
    'proc_notificacion_listar',
    [actor, soloNoLeidas, 50],
    esquemaNotificaciones,
  );
}

export function marcarNotificacion(db: Ejecutor, actor: string, id: string | null) {
  return llamarProceso(
    db,
    'proc_notificacion_marcar',
    [actor, id],
    z.object({ no_leidas: z.number().int() }),
  );
}

// --- Reportes --------------------------------------------------------------------------------

export function reporte(db: Ejecutor, actor: string, equipo: string) {
  return llamarProceso(db, 'proc_reporte_equipo', [actor, equipo], esquemaReporteEquipo);
}

export function exportar(db: Ejecutor, actor: string, equipo: string, soloMias: boolean) {
  return llamarProceso(
    db,
    'proc_reporte_exportar',
    [actor, equipo, soloMias],
    z.array(esquemaFilaExportacion),
  );
}

// --- Plantillas --------------------------------------------------------------------------------

export function plantillas(db: Ejecutor, actor: string, equipo: string) {
  return llamarProceso(db, 'proc_plantilla_listar', [actor, equipo], z.array(esquemaPlantilla));
}

export function crearPlantilla(db: Ejecutor, actor: string, equipo: string, datos: CrearPlantilla) {
  return llamarProceso(db, 'proc_plantilla_crear', [actor, equipo, json(datos)], esquemaPlantilla);
}

export function eliminarPlantilla(db: Ejecutor, actor: string, equipo: string, id: string) {
  return llamarProceso(
    db,
    'proc_plantilla_eliminar',
    [actor, equipo, id],
    z.object({ eliminada: z.literal(true) }),
  );
}

export function usarPlantilla(db: Ejecutor, actor: string, equipo: string, id: string) {
  return llamarProceso(
    db,
    'proc_plantilla_usar',
    [actor, equipo, id],
    z.object({ creadas: z.number().int() }),
  );
}

// --- Archivos ----------------------------------------------------------------------------------

export function archivos(db: Ejecutor, actor: string, equipo: string, tarea: string | null) {
  return llamarProceso(db, 'proc_archivo_listar', [actor, equipo, tarea], z.array(esquemaArchivo));
}

export function subirArchivo(
  db: Ejecutor,
  actor: string,
  equipo: string,
  {
    nombre,
    mime,
    datos,
    tarea,
  }: { nombre: string; mime: string; datos: Buffer; tarea: string | null },
) {
  return llamarProceso(
    db,
    'proc_archivo_subir',
    [actor, equipo, nombre, mime, datos, tarea],
    esquemaArchivo,
  );
}

export function descargarArchivo(db: Ejecutor, actor: string, equipo: string, id: string) {
  return llamarProceso(
    db,
    'proc_archivo_descargar',
    [actor, equipo, id],
    z.object({ nombre: z.string(), mime: z.string(), contenido: z.string() }),
  );
}

export function eliminarArchivo(db: Ejecutor, actor: string, equipo: string, id: string) {
  return llamarProceso(
    db,
    'proc_archivo_eliminar',
    [actor, equipo, id],
    z.object({ eliminado: z.literal(true) }),
  );
}
