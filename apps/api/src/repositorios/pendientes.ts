import {
  esquemaAgendaPersonal,
  esquemaExportacionDatos,
  esquemaMensajeChat,
  esquemaSolicitudInvitado,
  type TipoSolicitudInvitado,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { llamarProceso } from './procesos';

/**
 * Pendientes tras la Fase 5 (migración 0032, DEC-037). Cada función llama a un proceso documentado
 * en docs/08_Procesos_BD.md, sección «Pendientes tras la Fase 5».
 */

/** `proc_personal_agenda` (PER-04): reuniones de mis equipos entre dos fechas. */
export function agenda(db: Ejecutor, actor: string, desde: string, hasta: string) {
  return llamarProceso(db, 'proc_personal_agenda', [actor, desde, hasta], esquemaAgendaPersonal);
}

/** `proc_datos_exportar` (FALT-09). */
export function exportar(db: Ejecutor, actor: string) {
  return llamarProceso(db, 'proc_datos_exportar', [actor], esquemaExportacionDatos);
}

/** `proc_cuenta_eliminar` (FALT-09). La ruta verifica antes la contraseña. */
export function eliminarCuenta(db: Ejecutor, actor: string) {
  return llamarProceso(
    db,
    'proc_cuenta_eliminar',
    [actor],
    z.object({ eliminada: z.literal(true) }),
  );
}

/** `proc_solicitud_invitado_crear` (DEC-023). */
export function crearSolicitud(
  db: Ejecutor,
  actor: string,
  equipo: string,
  tipo: TipoSolicitudInvitado,
) {
  return llamarProceso(
    db,
    'proc_solicitud_invitado_crear',
    [actor, equipo, tipo],
    esquemaSolicitudInvitado,
  );
}

/** `proc_solicitud_invitado_listar`: el líder ve las pendientes; el invitado, las suyas. */
export function solicitudes(db: Ejecutor, actor: string, equipo: string) {
  return llamarProceso(
    db,
    'proc_solicitud_invitado_listar',
    [actor, equipo],
    z.array(esquemaSolicitudInvitado),
  );
}

/** `proc_solicitud_invitado_resolver`: aprobar (AD-05) o rechazar. */
export function resolverSolicitud(
  db: Ejecutor,
  actor: string,
  equipo: string,
  solicitud: string,
  aprobar: boolean,
  dias: number | null,
) {
  return llamarProceso(
    db,
    'proc_solicitud_invitado_resolver',
    [actor, equipo, solicitud, aprobar, dias],
    esquemaSolicitudInvitado,
  );
}

/** `proc_sprint_fotos_diarias`: sistema, una foto por día de cada sprint activo. */
export function fotosDiarias(db: Ejecutor) {
  return llamarProceso(db, 'proc_sprint_fotos_diarias', [], z.object({ sprints: z.number() }));
}

/** `proc_chat_editar`: el autor corrige su mensaje. */
export function editarMensaje(db: Ejecutor, actor: string, mensaje: string, texto: string) {
  return llamarProceso(db, 'proc_chat_editar', [actor, mensaje, texto], esquemaMensajeChat);
}

/** `proc_usuario_foto_guardar`: foto de perfil (o `null` para quitarla). */
export function guardarFoto(
  db: Ejecutor,
  actor: string,
  mime: string | null,
  datos: Buffer | null,
) {
  return llamarProceso(
    db,
    'proc_usuario_foto_guardar',
    [actor, mime, datos],
    z.object({ avatar_url: z.string().nullable() }),
  );
}

/** `proc_usuario_foto`: la foto de una persona en base64. */
export function foto(db: Ejecutor, usuario: string) {
  return llamarProceso(
    db,
    'proc_usuario_foto',
    [usuario],
    z.object({ mime: z.string(), contenido: z.string() }),
  );
}
