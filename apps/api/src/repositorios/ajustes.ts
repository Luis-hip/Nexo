import { esquemaAjustesUsuario, esquemaReportePersonal, type GuardarAjustes } from '@nexo/shared';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Ajustes de la persona (Fase 3.6) y reporte personal (FALT-01). Cada función llama a un proceso
 * de la migración 0013, documentado en docs/08_Procesos_BD.md.
 */

/** `proc_usuario_ajustes`: avisos y privacidad, con los valores por defecto. */
export function obtener(db: Ejecutor, actorId: string) {
  return llamarProceso(db, 'proc_usuario_ajustes', [actorId], esquemaAjustesUsuario);
}

/** `proc_usuario_ajustes_guardar`: guarda solo lo que cambia. */
export function guardar(db: Ejecutor, actorId: string, cambios: GuardarAjustes) {
  return llamarProceso(
    db,
    'proc_usuario_ajustes_guardar',
    [actorId, json(cambios)],
    esquemaAjustesUsuario,
  );
}

/** `proc_reporte_personal`: tareas personales y las de equipo a cargo de la persona. */
export function reportePersonal(db: Ejecutor, actorId: string) {
  return llamarProceso(db, 'proc_reporte_personal', [actorId], esquemaReportePersonal);
}
