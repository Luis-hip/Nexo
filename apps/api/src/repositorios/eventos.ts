import type { Ejecutor } from '../db/conexion';

export interface EventoEquipo {
  equipoId: string;
  actorId: string;
  /** Tipo del evento de dominio, p. ej. `tarea.aceptada`. Lo consumen tiempo real, avisos y WhatsApp. */
  tipo: string;
  objetoTipo: 'tarea' | 'equipo' | 'invitacion' | 'membresia';
  objetoId: string;
  /** Datos del evento para sus consumidores (sin datos sensibles). */
  carga?: Record<string, unknown>;
  /** Frase para el registro de actividad, p. ej. «Valeria propuso T-08 (en votación)». */
  resumen: string;
}

/**
 * Patrón *outbox* (docs/01, 7.1): cada cambio relevante inserta su evento de dominio y su
 * fila de actividad. Debe llamarse con la **misma transacción** que hace el cambio.
 */
export async function registrarEvento(tx: Ejecutor, e: EventoEquipo): Promise<void> {
  const [categoria, accion = 'cambio'] = e.tipo.split('.');
  await tx
    .insertInto('eventos_dominio')
    .values({
      equipo_id: e.equipoId,
      tipo: e.tipo,
      objeto_tipo: e.objetoTipo,
      objeto_id: e.objetoId,
      actor_id: e.actorId,
      carga: JSON.stringify(e.carga ?? {}),
    })
    .execute();
  await tx
    .insertInto('actividad')
    .values({
      equipo_id: e.equipoId,
      autor_id: e.actorId,
      tipo: categoria === 'tarea' ? 'tarea' : 'equipo',
      accion,
      objeto_tipo: e.objetoTipo,
      objeto_id: e.objetoId,
      resumen: e.resumen,
      detalle: JSON.stringify(e.carga ?? {}),
    })
    .execute();
}
