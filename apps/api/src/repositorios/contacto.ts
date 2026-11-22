import {
  ESTADOS_CONTACTO,
  PRIORIDADES_CONTACTO,
  TIPOS_MENSAJE_CONTACTO,
  type FiltrosContacto,
} from '@nexo/shared';
import { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { llamarProceso } from './procesos';

/**
 * Módulo de contacto (docs/12_Plan_Contacto.md): cada función llama a un `proc_contacto_*` de la
 * migración 0039, documentado en docs/08, sección «Contacto».
 */

const fecha = z.string();
const persona = z.object({ id: z.string(), nombre: z.string() });

const esquemaMensaje = z.object({
  id: z.string(),
  folio: z.string(),
  tipo: z.enum(TIPOS_MENSAJE_CONTACTO),
  estado: z.enum(ESTADOS_CONTACTO),
  prioridad: z.enum(PRIORIDADES_CONTACTO),
  nombre: z.string(),
  correo: z.string(),
  asunto: z.string(),
  registrado: z.boolean(),
  asignado: persona.nullable(),
  anonimizado: z.boolean(),
  creado_en: fecha,
  actualizado_en: fecha,
  atendido_en: fecha.nullable(),
  resuelto_en: fecha.nullable(),
  extracto: z.string().optional(),
  mensaje: z.string().optional(),
  contexto: z.record(z.string(), z.string()).optional(),
  user_agent: z.string().nullable().optional(),
});

const esquemaEvento = z.object({
  id: z.string(),
  tipo: z.enum([
    'creado',
    'nota_interna',
    'respuesta',
    'cambio_estado',
    'cambio_prioridad',
    'asignacion',
    'sistema',
  ]),
  autor: persona.nullable(),
  contenido: z.string().nullable(),
  metadatos: z.record(z.string(), z.unknown()),
  creado_en: fecha,
});

const esquemaDetalle = esquemaMensaje.extend({
  eventos: z.array(esquemaEvento),
  envios_fallidos: z.number().int(),
});

export const esquemaEnvioOutbox = z.object({
  id: z.string(),
  canal: z.enum(['correo', 'whatsapp']),
  plantilla: z.enum(['aviso_equipo', 'confirmacion_remitente', 'respuesta_remitente']),
  destinatario: z.string(),
  datos: z.record(z.string(), z.unknown()),
  intentos: z.number().int(),
  mensaje_id: z.string(),
  folio: z.string(),
  tipo: z.enum(TIPOS_MENSAJE_CONTACTO),
  prioridad: z.enum(PRIORIDADES_CONTACTO),
  nombre: z.string(),
  asunto: z.string(),
  extracto: z.string(),
  registrado: z.boolean(),
  respuesta: z.string().nullable(),
});
export type EnvioOutbox = z.infer<typeof esquemaEnvioOutbox>;

const json = (v: unknown) => JSON.stringify(v);

export const verificarLimite = (db: Ejecutor, ipHash: string, correoHash: string) =>
  llamarProceso(
    db,
    'proc_contacto_verificar_limite',
    [ipHash, correoHash],
    z.object({ permitido: z.boolean() }),
  );

export const crear = (
  db: Ejecutor,
  datos: {
    tipo: string;
    nombre: string;
    correo: string;
    asunto: string;
    mensaje: string;
    contexto: Record<string, string>;
  },
  usuarioId: string | null,
  tokenHash: string,
  tokenCifrado: string,
  ipHash: string,
  userAgent: string,
  destinoEquipo: string | null,
) =>
  llamarProceso(
    db,
    'proc_contacto_crear',
    [json(datos), usuarioId, tokenHash, tokenCifrado, ipHash, userAgent, destinoEquipo],
    z.object({ id: z.string(), folio: z.string() }),
  );

export const seguimiento = (db: Ejecutor, folio: string, tokenHash: string) =>
  llamarProceso(
    db,
    'proc_contacto_seguimiento',
    [folio, tokenHash],
    z.object({
      folio: z.string(),
      tipo: z.enum(TIPOS_MENSAJE_CONTACTO),
      asunto: z.string(),
      estado: z.enum(ESTADOS_CONTACTO),
      creado_en: fecha,
      actualizado_en: fecha,
      respuestas: z.array(z.object({ contenido: z.string(), creado_en: fecha })),
    }),
  );

export const permisos = (db: Ejecutor, actor: string) =>
  llamarProceso(
    db,
    'proc_contacto_permisos',
    [actor],
    z.object({
      soporte: z.boolean(),
      ver: z.boolean(),
      gestionar: z.boolean(),
      cuentas: z.boolean(),
      dos_pasos: z.boolean(),
    }),
  );

export const listar = (db: Ejecutor, actor: string, filtros: FiltrosContacto) =>
  llamarProceso(
    db,
    'proc_contacto_listar',
    [actor, json(filtros)],
    z.object({
      datos: z.array(esquemaMensaje),
      total: z.number().int(),
      pagina: z.number().int(),
      por_pagina: z.number().int(),
    }),
  );

export const obtener = (db: Ejecutor, actor: string, id: string) =>
  llamarProceso(db, 'proc_contacto_obtener', [actor, id], esquemaDetalle);

export const cambiarEstado = (db: Ejecutor, actor: string, id: string, estado: string) =>
  llamarProceso(db, 'proc_contacto_cambiar_estado', [actor, id, estado], esquemaMensaje);

export const cambiarPrioridad = (db: Ejecutor, actor: string, id: string, prioridad: string) =>
  llamarProceso(db, 'proc_contacto_cambiar_prioridad', [actor, id, prioridad], esquemaMensaje);

export const asignar = (db: Ejecutor, actor: string, id: string, asignado: string | null) =>
  llamarProceso(db, 'proc_contacto_asignar', [actor, id, asignado], esquemaMensaje);

export const agregarNota = (db: Ejecutor, actor: string, id: string, contenido: string) =>
  llamarProceso(db, 'proc_contacto_agregar_nota', [actor, id, contenido], esquemaEvento);

export const responder = (
  db: Ejecutor,
  actor: string,
  id: string,
  contenido: string,
  estado: string | null,
) => llamarProceso(db, 'proc_contacto_responder', [actor, id, contenido, estado], esquemaEvento);

export const metricas = (db: Ejecutor, actor: string, desde?: string, hasta?: string) =>
  llamarProceso(
    db,
    'proc_contacto_metricas',
    [actor, desde ?? null, hasta ?? null],
    z.object({
      total: z.number().int(),
      abiertos: z.number().int(),
      resueltos: z.number().int(),
      por_tipo: z.record(z.string(), z.number()),
      por_estado: z.record(z.string(), z.number()),
      primera_respuesta_horas: z.coerce.number().nullable(),
      resolucion_horas: z.coerce.number().nullable(),
      por_dia: z.array(z.object({ dia: z.string(), total: z.number() })),
      por_persona: z.array(
        z.object({ persona: persona.nullable(), abiertos: z.number(), total: z.number() }),
      ),
      desde: fecha,
      hasta: fecha,
    }),
  );

export const exportar = (db: Ejecutor, actor: string, filtros: FiltrosContacto) =>
  llamarProceso(
    db,
    'proc_contacto_exportar',
    [actor, json(filtros)],
    z.array(z.record(z.string(), z.string().nullable())),
  );

export const pendientes = (db: Ejecutor, actor: string) =>
  llamarProceso(db, 'proc_contacto_pendientes', [actor], z.object({ nuevos: z.number().int() }));

export const equipo = (db: Ejecutor, actor: string) =>
  llamarProceso(db, 'proc_contacto_equipo', [actor], z.array(persona));

export const reintentar = (db: Ejecutor, actor: string, id: string) =>
  llamarProceso(
    db,
    'proc_contacto_outbox_reintentar',
    [actor, id],
    z.object({ reintentados: z.number().int() }),
  );

export const anonimizar = (db: Ejecutor, actor: string, id: string) =>
  llamarProceso(
    db,
    'proc_contacto_anonimizar',
    [actor, id],
    z.object({ anonimizado: z.boolean() }),
  );

export const outboxTomar = (db: Ejecutor, limite: number) =>
  llamarProceso(db, 'proc_contacto_outbox_tomar', [limite], z.array(esquemaEnvioOutbox));

export const outboxResultado = (db: Ejecutor, id: string, ok: boolean, error: string | null) =>
  llamarProceso(
    db,
    'proc_contacto_outbox_resultado',
    [id, ok, error],
    z.object({ estado: z.string().nullable(), intentos: z.number().int().optional() }),
  );

export const purgar = (db: Ejecutor, meses: number) =>
  llamarProceso(
    db,
    'proc_contacto_purgar',
    [meses],
    z.object({
      anonimizados: z.number().int(),
      intentos_borrados: z.number().int(),
      envios_borrados: z.number().int(),
    }),
  );
