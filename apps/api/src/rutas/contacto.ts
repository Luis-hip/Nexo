import {
  esquemaAsignacionContacto,
  esquemaContacto,
  esquemaEstadoContacto,
  esquemaFiltrosContacto,
  esquemaNotaContacto,
  esquemaPrioridadContacto,
  esquemaRespuestaContacto,
  type FiltrosContacto,
} from '@nexo/shared';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import { cifrar } from '../cifrado';
import type { Config } from '../config';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/contacto';
import { validar } from '../validacion';

/**
 * Módulo de contacto y soporte (docs/12_Plan_Contacto.md; ajustes en docs/13 §2).
 *  - Público: POST /contacto y GET /contacto/seguimiento.
 *  - Panel: /admin/contacto/… con los permisos de sistema `contacto.ver` y `contacto.gestionar`
 *    (los exige cada proceso; la web solo oculta controles).
 * La IP y el correo se usan como HMAC (nunca en claro); el token de seguimiento se guarda como
 * SHA-256 y solo viaja, cifrado, al correo de confirmación. Los registros no llevan el cuerpo.
 */

/** Celda CSV segura: comillas escapadas y fórmulas neutralizadas (=, +, -, @, tab, retorno). */
export function celdaCsv(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

const COLUMNAS_CSV = [
  'folio',
  'tipo',
  'estado',
  'prioridad',
  'nombre',
  'correo',
  'asunto',
  'mensaje',
  'asignado',
  'creado_en',
  'resuelto_en',
] as const;

/** Lee los filtros de la query (los arreglos llegan como «a,b»). */
function filtrosDe(query: unknown): FiltrosContacto {
  const q = { ...(query as Record<string, string | undefined>) };
  const lista = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
  return validar(esquemaFiltrosContacto, {
    ...q,
    estado: lista(q.estado),
    tipo: lista(q.tipo),
    prioridad: lista(q.prioridad),
  });
}

const esquemaId = z.object({ id: z.uuid() });

export const rutasContacto: FastifyPluginAsync<{ db: BaseDatos; config: Config }> = async (
  app,
  { db, config },
) => {
  const pruebas = config.NODE_ENV === 'test';
  const sal =
    config.IP_HASH_SALT ??
    createHash('sha256')
      .update(`nexo-contacto:${config.ENCRYPTION_KEY ?? 'desarrollo'}`)
      .digest('hex');
  const hmac = (v: string) => createHmac('sha256', sal).update(v).digest('hex');

  /** Cloudflare Turnstile, comprobado SIEMPRE en el servidor (solo si hay clave). */
  async function captchaValido(token: string | undefined, ip: string) {
    if (!config.TURNSTILE_SECRET_KEY) return true;
    if (!token) return false;
    try {
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: config.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      const d = (await r.json().catch(() => null)) as { success?: boolean } | null;
      return d?.success === true;
    } catch {
      return false;
    }
  }

  const ver = (req: FastifyRequest) => exigirSesion(req).usuario.id;

  // --- Público ----------------------------------------------------------------------------------

  app.post(
    '/contacto',
    {
      bodyLimit: 20 * 1024,
      config: { rateLimit: { max: pruebas ? 500 : 10, timeWindow: '1 minute' } },
    },
    async (req, res) => {
      const cuerpo = (req.body ?? {}) as Record<string, unknown>;
      // Trampa para bots: respuesta normal y no se guarda nada.
      if (typeof cuerpo.web === 'string' && cuerpo.web.trim() !== '') {
        const anio = new Date().getFullYear();
        return res.status(201).send({
          folio: `NX-${anio}-${String(Math.floor(Math.random() * 900000) + 100000)}`,
          mensaje: 'Recibimos tu mensaje. Te avisaremos por correo.',
        });
      }
      // Con sesión, nombre y correo salen de la cuenta (la BD lo vuelve a hacer).
      const sesion = req.sesion;
      const datos = validar(esquemaContacto, {
        ...cuerpo,
        ...(sesion ? { nombre: sesion.usuario.nombre, correo: sesion.usuario.correo } : {}),
      });
      if (!(await captchaValido(datos.captcha_token, req.ip))) {
        throw new ErrorNexo(
          400,
          'captcha_invalido',
          'No pudimos comprobar que no eres un robot. Inténtalo de nuevo.',
        );
      }
      try {
        await repo.verificarLimite(db, hmac(`ip:${req.ip}`), hmac(`correo:${datos.correo}`));
      } catch (e) {
        if (e instanceof ErrorNexo && e.codigo === 'limite_contacto') {
          const espera = (e.detalles as { retry_after?: number } | undefined)?.retry_after ?? 3600;
          res.header('retry-after', String(espera));
        }
        throw e;
      }
      const token = randomBytes(32).toString('base64url');
      const r = await repo.crear(
        db,
        {
          tipo: datos.tipo,
          nombre: datos.nombre,
          correo: datos.correo,
          asunto: datos.asunto,
          mensaje: datos.mensaje,
          contexto: Object.fromEntries(
            Object.entries(datos.tipo === 'error' ? (datos.contexto ?? {}) : {}).filter(
              (x): x is [string, string] => typeof x[1] === 'string',
            ),
          ),
        },
        sesion?.usuario.id ?? null,
        createHash('sha256').update(token).digest('hex'),
        cifrar(config, token),
        hmac(`ip:${req.ip}`),
        String(req.headers['user-agent'] ?? '').slice(0, 300),
        config.CONTACTO_EQUIPO_DESTINO ?? null,
      );
      // Solo el folio: el token nunca va en la respuesta (llega por correo).
      req.log.info({ folio: r.folio }, 'Mensaje de contacto recibido');
      return res
        .status(201)
        .send({ folio: r.folio, mensaje: 'Recibimos tu mensaje. Te avisaremos por correo.' });
    },
  );

  app.get(
    '/contacto/seguimiento',
    { config: { rateLimit: { max: pruebas ? 500 : 20, timeWindow: '1 hour' } } },
    async (req) => {
      const { folio, token } = validar(
        z.object({ folio: z.string().trim().min(5).max(30), token: z.string().min(10).max(200) }),
        req.query,
      );
      return repo.seguimiento(db, folio, createHash('sha256').update(token).digest('hex'));
    },
  );

  // --- Panel (contacto.ver / contacto.gestionar) ------------------------------------------------

  app.get('/admin/contacto/permisos', async (req) => repo.permisos(db, ver(req)));
  app.get('/admin/contacto', async (req) => repo.listar(db, ver(req), filtrosDe(req.query)));
  app.get('/admin/contacto/pendientes/conteo', async (req) => repo.pendientes(db, ver(req)));
  app.get('/admin/contacto/equipo', async (req) => repo.equipo(db, ver(req)));
  app.get('/admin/contacto/metricas', async (req) => {
    const q = validar(
      z.object({
        desde: z.iso.datetime({ offset: true }).optional(),
        hasta: z.iso.datetime({ offset: true }).optional(),
      }),
      req.query,
    );
    return repo.metricas(db, ver(req), q.desde, q.hasta);
  });
  app.get('/admin/contacto/exportar.csv', async (req, res) => {
    const filas = await repo.exportar(db, ver(req), filtrosDe(req.query));
    const csv =
      '﻿' +
      [
        COLUMNAS_CSV.map(celdaCsv).join(','),
        ...filas.map((f) => COLUMNAS_CSV.map((c) => celdaCsv(f[c])).join(',')),
      ].join('\r\n');
    const fecha = new Date().toISOString().slice(0, 10);
    return res
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="nexo-contacto-${fecha}.csv"`)
      .header('cache-control', 'no-store')
      .send(csv);
  });
  app.get('/admin/contacto/:id', async (req) =>
    repo.obtener(db, ver(req), validar(esquemaId, req.params).id),
  );
  app.patch('/admin/contacto/:id/estado', async (req) => {
    const { estado } = validar(esquemaEstadoContacto, req.body);
    return repo.cambiarEstado(db, ver(req), validar(esquemaId, req.params).id, estado);
  });
  app.patch('/admin/contacto/:id/prioridad', async (req) => {
    const { prioridad } = validar(esquemaPrioridadContacto, req.body);
    return repo.cambiarPrioridad(db, ver(req), validar(esquemaId, req.params).id, prioridad);
  });
  app.patch('/admin/contacto/:id/asignacion', async (req) => {
    const { asignado_a } = validar(esquemaAsignacionContacto, req.body);
    return repo.asignar(db, ver(req), validar(esquemaId, req.params).id, asignado_a);
  });
  app.post('/admin/contacto/:id/notas', async (req, res) => {
    const { contenido } = validar(esquemaNotaContacto, req.body);
    const e = await repo.agregarNota(db, ver(req), validar(esquemaId, req.params).id, contenido);
    return res.status(201).send(e);
  });
  app.post('/admin/contacto/:id/respuestas', async (req, res) => {
    const d = validar(esquemaRespuestaContacto, req.body);
    const e = await repo.responder(
      db,
      ver(req),
      validar(esquemaId, req.params).id,
      d.contenido,
      d.estado_resultante ?? null,
    );
    return res.status(201).send(e);
  });
  app.post('/admin/contacto/:id/reintentar', async (req) =>
    repo.reintentar(db, ver(req), validar(esquemaId, req.params).id),
  );
  app.delete('/admin/contacto/:id/datos', async (req) =>
    repo.anonimizar(db, ver(req), validar(esquemaId, req.params).id),
  );
};
