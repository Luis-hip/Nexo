import {
  esquemaConversacionChat,
  esquemaHiloChat,
  esquemaListaConversaciones,
  esquemaListaMensajes,
  esquemaMensajeChat,
  esquemaMiembrosChat,
  esquemaPaginaMensajes,
  esquemaResultadoLectura,
  esquemaResultadoMensajeATarea,
  esquemaResultadoReaccion,
  esquemaResultadosBusquedaChat,
  esquemaSalasChat,
  type EnviarMensaje,
  type MensajeATarea,
  type PreferenciasConversacion,
} from '@nexo/shared';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * Chat (Fase 4.1, DEC-CHAT-1). Cada función llama a un proceso `proc_chat_*` de las migraciones
 * 0014 a 0016, documentado en docs/08_Procesos_BD.md, sección «Fase 4 · Chat».
 */

export const conversaciones = (db: Ejecutor, actor: string, equipo: string) =>
  llamarProceso(db, 'proc_chat_conversaciones', [actor, equipo], esquemaListaConversaciones);

export const mensajes = (
  db: Ejecutor,
  actor: string,
  conversacion: string,
  antes: number | undefined,
  limite: number,
) =>
  llamarProceso(
    db,
    'proc_chat_mensajes',
    [actor, conversacion, antes === undefined ? null : String(antes), limite],
    esquemaPaginaMensajes,
  );

export const hilo = (db: Ejecutor, actor: string, mensaje: string) =>
  llamarProceso(db, 'proc_chat_hilo', [actor, mensaje], esquemaHiloChat);

export const fijados = (db: Ejecutor, actor: string, conversacion: string) =>
  llamarProceso(db, 'proc_chat_fijados', [actor, conversacion], esquemaListaMensajes);

export const miembros = (db: Ejecutor, actor: string, conversacion: string) =>
  llamarProceso(db, 'proc_chat_miembros', [actor, conversacion], esquemaMiembrosChat);

export const salas = (db: Ejecutor, actor: string) =>
  llamarProceso(db, 'proc_chat_salas', [actor], esquemaSalasChat);

export const enviar = (db: Ejecutor, actor: string, conversacion: string, datos: EnviarMensaje) =>
  llamarProceso(db, 'proc_chat_enviar', [actor, conversacion, json(datos)], esquemaMensajeChat);

export const eliminar = (db: Ejecutor, actor: string, mensaje: string) =>
  llamarProceso(db, 'proc_chat_eliminar', [actor, mensaje], esquemaMensajeChat);

export const fijar = (db: Ejecutor, actor: string, mensaje: string, fijado: boolean) =>
  llamarProceso(db, 'proc_chat_fijar', [actor, mensaje, fijado], esquemaMensajeChat);

export const reaccionar = (db: Ejecutor, actor: string, mensaje: string, tipo: string) =>
  llamarProceso(db, 'proc_chat_reaccionar', [actor, mensaje, tipo], esquemaResultadoReaccion);

export const leer = (db: Ejecutor, actor: string, conversacion: string, hastaSeq: number) =>
  llamarProceso(
    db,
    'proc_chat_leer',
    [actor, conversacion, String(hastaSeq)],
    esquemaResultadoLectura,
  );

export const preferencias = (
  db: Ejecutor,
  actor: string,
  conversacion: string,
  cambios: PreferenciasConversacion,
) =>
  llamarProceso(
    db,
    'proc_chat_preferencias',
    [actor, conversacion, json(cambios)],
    esquemaConversacionChat,
  );

export const conversacionTarea = (db: Ejecutor, actor: string, equipo: string, tarea: string) =>
  llamarProceso(
    db,
    'proc_chat_conversacion_tarea',
    [actor, equipo, tarea],
    esquemaConversacionChat,
  );

export const abrirDm = (db: Ejecutor, actor: string, equipo: string, otro: string) =>
  llamarProceso(db, 'proc_chat_dm_abrir', [actor, equipo, otro], esquemaConversacionChat);

export const buscar = (
  db: Ejecutor,
  actor: string,
  equipo: string,
  texto: string,
  conversacion: string | undefined,
) =>
  llamarProceso(
    db,
    'proc_chat_buscar',
    [actor, equipo, texto, conversacion ?? null],
    esquemaResultadosBusquedaChat,
  );

export const mensajeATarea = (db: Ejecutor, actor: string, mensaje: string, datos: MensajeATarea) =>
  llamarProceso(
    db,
    'proc_chat_mensaje_a_tarea',
    [actor, mensaje, json(datos)],
    esquemaResultadoMensajeATarea,
  );
