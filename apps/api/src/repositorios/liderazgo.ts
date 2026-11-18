import {
  esquemaConfiguracionEquipo,
  esquemaLiderazgo,
  esquemaMiembro,
  type ConfigurarEquipo,
  type GestionarInvitado,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Liderazgo y administración del equipo (Fase 3.5, DEC-032). Cada función llama a un proceso de
 * la migración 0010, documentado en docs/08_Procesos_BD.md; las reglas viven allí.
 */

/** `proc_liderazgo_obtener`: transferencia pendiente, elección abierta e historial. */
export function obtener(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_liderazgo_obtener', [actorId, equipoId], esquemaLiderazgo);
}

/** `proc_liderazgo_transferir`: el líder propone a un integrante. */
export function transferir(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  aId: string,
  saldra: boolean,
) {
  return llamarProceso(
    db,
    'proc_liderazgo_transferir',
    [actorId, equipoId, aId, saldra],
    esquemaLiderazgo,
  );
}

/** `proc_liderazgo_responder`: la persona propuesta acepta o rechaza. */
export function responder(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  transferenciaId: string,
  acepta: boolean,
) {
  return llamarProceso(
    db,
    'proc_liderazgo_responder',
    [actorId, equipoId, transferenciaId, acepta],
    esquemaLiderazgo,
  );
}

/** `proc_liderazgo_cancelar`: el líder cancela la transferencia pendiente. */
export function cancelar(db: Ejecutor, actorId: string, equipoId: string, transferenciaId: string) {
  return llamarProceso(
    db,
    'proc_liderazgo_cancelar',
    [actorId, equipoId, transferenciaId],
    esquemaLiderazgo,
  );
}

/** `proc_eleccion_convocar`: el líder convoca una elección (queda como interino). */
export function convocar(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(db, 'proc_eleccion_convocar', [actorId, equipoId], esquemaLiderazgo);
}

/** `proc_eleccion_votar`: un integrante vota (el saliente no: NX002). */
export function votar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  eleccionId: string,
  candidatoId: string,
) {
  return llamarProceso(
    db,
    'proc_eleccion_votar',
    [actorId, equipoId, eleccionId, candidatoId],
    esquemaLiderazgo,
  );
}

/** `proc_eleccion_vencidas`: resuelve las elecciones con el plazo vencido (tarea programada). */
export function vencerElecciones(db: Ejecutor) {
  return llamarProceso(db, 'proc_eleccion_vencidas', [], z.object({ resueltas: z.number() }));
}

/** `proc_equipo_salir`: dejar el equipo (el líder primero transfiere). */
export function salir(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(
    db,
    'proc_equipo_salir',
    [actorId, equipoId],
    z.object({ salio: z.literal(true) }),
  );
}

/** `proc_equipo_expulsar`: el líder expulsa a una persona; devuelve los miembros. */
export function expulsar(db: Ejecutor, actorId: string, equipoId: string, membresiaId: string) {
  return llamarProceso(
    db,
    'proc_equipo_expulsar',
    [actorId, equipoId, membresiaId],
    z.array(esquemaMiembro),
  );
}

/** `proc_invitado_gestionar`: ampliar el acceso de un invitado o hacerlo integrante. */
export function gestionarInvitado(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  membresiaId: string,
  { accion, dias }: GestionarInvitado,
) {
  return llamarProceso(
    db,
    'proc_invitado_gestionar',
    [actorId, equipoId, membresiaId, accion, dias ?? null],
    z.array(esquemaMiembro),
  );
}

/** `proc_equipo_configuracion`: datos y reglas del equipo. */
export function configuracion(db: Ejecutor, actorId: string, equipoId: string) {
  return llamarProceso(
    db,
    'proc_equipo_configuracion',
    [actorId, equipoId],
    esquemaConfiguracionEquipo,
  );
}

/** `proc_equipo_configurar`: el líder cambia la configuración. */
export function configurar(
  db: Ejecutor,
  actorId: string,
  equipoId: string,
  cambios: ConfigurarEquipo,
) {
  return llamarProceso(
    db,
    'proc_equipo_configurar',
    [actorId, equipoId, json(cambios)],
    esquemaConfiguracionEquipo,
  );
}

/** `proc_equipo_archivar`: archivar o reactivar el equipo. */
export function archivar(db: Ejecutor, actorId: string, equipoId: string, archivarlo: boolean) {
  return llamarProceso(
    db,
    'proc_equipo_archivar',
    [actorId, equipoId, archivarlo],
    esquemaConfiguracionEquipo,
  );
}
