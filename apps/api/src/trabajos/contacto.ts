import { NOMBRE_TIPO_CONTACTO } from '@nexo/shared';
import type { FastifyBaseLogger } from 'fastify';
import { descifrar } from '../cifrado';
import type { Config } from '../config';
import type { Correo, MensajeCorreo } from '../correo';
import type { BaseDatos } from '../db/conexion';
import * as repo from '../repositorios/contacto';
import type { EnvioOutbox } from '../repositorios/contacto';

/**
 * Ciclo del outbox de contacto (docs/12 §7). No hay un worker aparte: corre dentro de la API, como
 * WhatsApp (docs/13 1.3). `FOR UPDATE SKIP LOCKED` en la BD evita duplicar envíos entre instancias.
 * Cada canal implementa `CanalNotificacion`; hoy solo hay correo. WhatsApp queda reservado para
 * enchufarse sin tocar este ciclo (plan 7.4).
 */
export interface CanalNotificacion {
  canal: 'correo' | 'whatsapp';
  enviar(item: EnvioOutbox): Promise<{ ok: boolean; error?: string }>;
}

/** Texto sin saltos de línea, para cabeceras (asunto). */
const enLinea = (t: string) => t.replace(/[\r\n]+/g, ' ').trim();
/** Escape HTML (el contenido de las personas nunca se interpreta). */
const esc = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function html(titulo: string, cuerpo: string, boton?: { texto: string; url: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f7;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2330">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e4e4ea">
<p style="margin:0 0 12px;font-weight:700;color:#5b5bd6">Nexo</p>
<h1 style="font-size:18px;margin:0 0 12px">${esc(titulo)}</h1>
${cuerpo}
${boton ? `<p style="margin:20px 0"><a href="${esc(boton.url)}" style="background:#5b5bd6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">${esc(boton.texto)}</a></p>` : ''}
<p style="margin:20px 0 0;font-size:12px;color:#6b6f80">Si no fuiste tú, ignora este mensaje.</p>
</div></body></html>`;
}

const parrafo = (t: string) =>
  `<p style="margin:0 0 10px;white-space:pre-wrap;line-height:1.5">${esc(t)}</p>`;

/** Arma el correo de cada plantilla (plan 7.2). */
export function armarCorreo(
  item: EnvioOutbox,
  config: Pick<Config, 'APP_URL' | 'ENCRYPTION_KEY' | 'NODE_ENV' | 'CONTACTO_EQUIPO_DESTINO'>,
): MensajeCorreo {
  const app = config.APP_URL.replace(/\/$/, '');
  const tipo = NOMBRE_TIPO_CONTACTO[item.tipo].nombre;
  if (item.plantilla === 'aviso_equipo') {
    const url = `${app}/soporte/contacto/${item.mensaje_id}`;
    const alta = item.prioridad === 'alta' ? '[ALTA]' : '';
    const quien = `${item.nombre}${item.registrado ? ' (usuario registrado)' : ''}`;
    return {
      para: item.destinatario,
      asunto: enLinea(`[Nexo][${tipo}]${alta} ${item.folio} — ${item.asunto}`).slice(0, 200),
      texto: `${tipo} · ${item.folio}\nDe: ${quien}\nAsunto: ${item.asunto}\n\n${item.extracto}\n\nAbrir en el panel: ${url}`,
      html: html(
        `${tipo} · ${item.folio}`,
        parrafo(`De: ${quien}`) + parrafo(`Asunto: ${item.asunto}`) + parrafo(item.extracto),
        { texto: 'Abrir en el panel', url },
      ),
    };
  }
  const token =
    typeof item.datos.token_cifrado === 'string'
      ? descifrar(config, item.datos.token_cifrado)
      : null;
  const seguimiento = token
    ? `${app}/contacto/seguimiento?folio=${encodeURIComponent(item.folio)}&token=${encodeURIComponent(token)}`
    : `${app}/contacto/seguimiento`;
  if (item.plantilla === 'confirmacion_remitente') {
    // Neutra: no repite lo que escribió la persona (nadie puede usar el formulario para mandar
    // textos a terceros).
    return {
      para: item.destinatario,
      asunto: `Recibimos tu mensaje (${item.folio})`,
      texto: `Recibimos tu mensaje. Tu folio es ${item.folio}.\n\nConsulta el estado aquí:\n${seguimiento}\n\nSi no fuiste tú, ignora este mensaje.`,
      html: html(
        'Recibimos tu mensaje',
        parrafo(`Tu folio es ${item.folio}. Te avisaremos por correo cuando el equipo responda.`),
        { texto: 'Ver el estado', url: seguimiento },
      ),
    };
  }
  // respuesta_remitente: el token de seguimiento solo se guardó para la confirmación.
  const respuesta = item.respuesta ?? '';
  return {
    para: item.destinatario,
    asunto: enLinea(`Respuesta a tu mensaje ${item.folio}`),
    responderA: config.CONTACTO_EQUIPO_DESTINO,
    texto: `El equipo de Nexo respondió a tu mensaje ${item.folio}:\n\n${respuesta}\n\nPuedes ver el estado con el enlace del correo de confirmación.`,
    html: html(
      `Respuesta a tu mensaje ${item.folio}`,
      parrafo(respuesta) +
        parrafo('Puedes ver el estado con el enlace del correo de confirmación.'),
    ),
  };
}

export function canalCorreo(
  correo: Correo,
  config: Parameters<typeof armarCorreo>[1],
): CanalNotificacion {
  return {
    canal: 'correo',
    async enviar(item) {
      // Sin proveedor (RESEND_API_KEY, «ignorado hasta nuevo aviso») el correo no sale: se reintenta
      // y queda «fallido» con este motivo; el mensaje sigue en el panel (la BD es la fuente de verdad).
      if (correo.proveedor === 'ninguno')
        return { ok: false, error: 'No hay proveedor de correo configurado.' };
      try {
        await correo.enviar(armarCorreo(item, config));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Una vuelta: toma hasta 10 envíos, los manda por su canal y guarda el resultado. */
export async function cicloContacto(db: BaseDatos, canales: CanalNotificacion[]) {
  const items = await repo.outboxTomar(db, 10);
  let enviados = 0;
  let fallidos = 0;
  for (const item of items) {
    const canal = canales.find((c) => c.canal === item.canal);
    const r = canal
      ? await canal.enviar(item)
      : { ok: false, error: `Canal «${item.canal}» no disponible.` };
    await repo.outboxResultado(db, item.id, r.ok, r.error ?? null);
    if (r.ok) enviados++;
    else fallidos++;
  }
  return { tomados: items.length, enviados, fallidos };
}

/** Cada 30 s el outbox; una vez al día la retención (plan 7.5). */
export function iniciarContacto(
  db: BaseDatos,
  config: Config,
  correo: Correo,
  log: FastifyBaseLogger,
  cadaMs = 30_000,
): () => void {
  const canales = [canalCorreo(correo, config)];
  let ocupado = false;
  let ultimaPurga = 0;
  const tic = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await cicloContacto(db, canales);
      if (r.tomados > 0) log.info(r, 'Ciclo de contacto');
      if (Date.now() - ultimaPurga > 24 * 60 * 60 * 1000) {
        ultimaPurga = Date.now();
        const p = await repo.purgar(db, config.CONTACTO_RETENCION_MESES);
        if (p.anonimizados + p.intentos_borrados + p.envios_borrados > 0)
          log.info(p, 'Retención de contacto');
      }
    } catch (error) {
      log.error(error, 'Falló el ciclo de contacto');
    } finally {
      ocupado = false;
    }
  };
  const t = setInterval(() => void tic(), cadaMs);
  t.unref();
  void tic();
  return () => clearInterval(t);
}
