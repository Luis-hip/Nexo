import {
  esquemaAvisosParaEnviar,
  esquemaColaWa,
  esquemaConfiguracionWa,
  esquemaHistorialWaRespuesta,
  esquemaMensajeWa,
  esquemaPanelWa,
  esquemaWhatsAppUsuarioRespuesta,
  type ConectarWa,
  type ConfigurarWa,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { json, llamarProceso } from './procesos';

/**
 * WhatsApp (Fase 4.2 y 4.3, DEC-WA-1). Cada función llama a un proceso `proc_wa_*` de la migración
 * 0031, documentado en docs/08_Procesos_BD.md, sección «Fase 4 · WhatsApp».
 */

// --- Sistema (temporizador) ---------------------------------------------------------------------

export const procesarEventos = (db: Ejecutor, limite = 200) =>
  llamarProceso(
    db,
    'proc_wa_procesar_eventos',
    [limite],
    z.object({ procesados: z.number(), encolados: z.number(), notificados: z.number() }),
  );

export const vencimientos = (db: Ejecutor) =>
  llamarProceso(db, 'proc_wa_vencimientos', [], z.object({ registrados: z.number() }));

export const reportes = (db: Ejecutor) =>
  llamarProceso(
    db,
    'proc_wa_reportes',
    [new Date().toISOString()],
    z.object({ generados: z.number() }),
  );

export const porEnviar = (db: Ejecutor, limite = 50) =>
  llamarProceso(db, 'proc_wa_por_enviar', [limite], esquemaAvisosParaEnviar);

export const resultadoEnvio = (
  db: Ejecutor,
  mensajeId: string,
  ok: boolean,
  proveedorId: string | null,
  error: string | null,
) =>
  llamarProceso(
    db,
    'proc_wa_envio_resultado',
    [mensajeId, ok, proveedorId, error],
    esquemaMensajeWa,
  );

export const registrarWebhook = (db: Ejecutor, eventoId: string, tipo: string, carga: unknown) =>
  llamarProceso(
    db,
    'proc_wa_webhook_registrar',
    [eventoId, tipo, json(carga)],
    z.object({ nuevo: z.boolean(), actualizados: z.number() }),
  );

// --- Líder ------------------------------------------------------------------------------------

export const panel = (db: Ejecutor, actor: string, equipo: string) =>
  llamarProceso(db, 'proc_wa_panel', [actor, equipo], esquemaPanelWa);

export const cola = (db: Ejecutor, actor: string, equipo: string) =>
  llamarProceso(db, 'proc_wa_cola', [actor, equipo], esquemaColaWa);

export const historial = (
  db: Ejecutor,
  actor: string,
  equipo: string,
  f: { estado?: string; antes?: string; limite: number },
) =>
  llamarProceso(
    db,
    'proc_wa_historial',
    [actor, equipo, f.estado ?? null, f.antes ?? null, f.limite],
    esquemaHistorialWaRespuesta,
  );

export const editarMensaje = (db: Ejecutor, actor: string, mensaje: string, cambios: object) =>
  llamarProceso(db, 'proc_wa_mensaje_editar', [actor, mensaje, json(cambios)], esquemaMensajeWa);

export const descartar = (db: Ejecutor, actor: string, equipo: string, ids: string[]) =>
  llamarProceso(
    db,
    'proc_wa_descartar',
    [actor, equipo, ids],
    z.object({ descartados: z.number() }),
  );

export const reintentar = (db: Ejecutor, actor: string, equipo: string, ids: string[] | null) =>
  llamarProceso(
    db,
    'proc_wa_reintentar',
    [actor, equipo, ids],
    z.object({ reintentados: z.number() }),
  );

export const enviar = (db: Ejecutor, actor: string, equipo: string, ids: string[] | null) =>
  llamarProceso(db, 'proc_wa_enviar', [actor, equipo, ids], esquemaAvisosParaEnviar);

export const conectar = (db: Ejecutor, actor: string, equipo: string, datos: ConectarWa) =>
  llamarProceso(db, 'proc_wa_conectar', [actor, equipo, json(datos)], esquemaConfiguracionWa);

export const desconectar = (db: Ejecutor, actor: string, equipo: string) =>
  llamarProceso(db, 'proc_wa_desconectar', [actor, equipo], esquemaConfiguracionWa);

export const configurar = (db: Ejecutor, actor: string, equipo: string, cambios: ConfigurarWa) =>
  llamarProceso(db, 'proc_wa_configurar', [actor, equipo, json(cambios)], esquemaConfiguracionWa);

export const guardarRegla = (
  db: Ejecutor,
  actor: string,
  equipo: string,
  tipo: string,
  modo: string,
) =>
  llamarProceso(
    db,
    'proc_wa_regla_guardar',
    [actor, equipo, tipo, modo],
    z.object({ tipo_evento: z.string(), modo: z.string() }),
  );

// --- Persona (PF-05, WA-07) ---------------------------------------------------------------------

export const usuario = (db: Ejecutor, actor: string) =>
  llamarProceso(db, 'proc_wa_usuario', [actor], esquemaWhatsAppUsuarioRespuesta);

export const guardarUsuario = (db: Ejecutor, actor: string, cambios: object) =>
  llamarProceso(
    db,
    'proc_wa_usuario_guardar',
    [actor, json(cambios)],
    esquemaWhatsAppUsuarioRespuesta,
  );

export const consentimiento = (db: Ejecutor, actor: string, equipo: string, acepta: boolean) =>
  llamarProceso(
    db,
    'proc_wa_consentimiento',
    [actor, equipo, acepta],
    esquemaWhatsAppUsuarioRespuesta,
  );
