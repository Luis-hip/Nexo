import {
  esquemaConectarWa,
  esquemaConfigurarWa,
  esquemaConsentimientoWa,
  esquemaEditarMensajeWa,
  esquemaHistorialWa,
  esquemaIdsWa,
  esquemaReglaWa,
  esquemaWhatsAppUsuario,
  REGLAS_WA,
  type Accion,
} from '@nexo/shared';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { Config } from '../config';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/whatsapp';
import { cicloWhatsApp } from '../trabajos/whatsapp';
import { entregar } from '../whatsapp/proveedor';
import { esquemaId, validar } from '../validacion';

const paramsEquipo = z.object({ equipoId: esquemaId });
const paramsRegla = paramsEquipo.extend({ tipo: z.enum(REGLAS_WA) });
const paramsId = z.object({ id: esquemaId });

/** Compara la firma `X-Hub-Signature-256` de Meta con el HMAC-SHA256 del cuerpo crudo. */
export function firmaValida(secreto: string, cuerpo: Buffer, firma: string | undefined): boolean {
  if (!firma?.startsWith('sha256=')) return false;
  const esperada = Buffer.from(
    `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`,
  );
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/**
 * WhatsApp (Fase 4.2 y 4.3: WA-01 a WA-08, PF-05), DEC-WA-1. Cada ruta de equipo: sesión →
 * membresía en ese equipo → permiso de la matriz; las reglas viven en los procesos de la 0031.
 */
export const rutasWhatsApp: FastifyPluginAsync<{ db: BaseDatos; config: Config }> = async (
  app,
  { db, config },
) => {
  async function contexto(req: FastifyRequest, accion: Accion, escribe = false) {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(paramsEquipo, req.params);
    const ctx = await contextoEquipo(db, usuario.id, equipoId);
    requierePermiso(ctx, accion);
    if (escribe) requiereEquipoActivo(ctx);
    return { actor: usuario.id, equipoId };
  }

  // --- WA-01, WA-02, WA-04 ----------------------------------------------------------------------

  app.get('/equipos/:equipoId/whatsapp', async (req) => {
    const { actor, equipoId } = await contexto(req, 'configurar_whatsapp');
    return repo.panel(db, actor, equipoId);
  });

  app.get('/equipos/:equipoId/whatsapp/cola', async (req) => {
    const { actor, equipoId } = await contexto(req, 'enviar_cola_whatsapp');
    return repo.cola(db, actor, equipoId);
  });

  app.get('/equipos/:equipoId/whatsapp/historial', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_historial_whatsapp');
    return repo.historial(db, actor, equipoId, validar(esquemaHistorialWa, req.query));
  });

  app.patch('/whatsapp/mensajes/:id', async (req) => {
    const { usuario } = exigirSesion(req);
    // Solo el líder: lo decide el proceso (el aviso dice de qué equipo es).
    return repo.editarMensaje(
      db,
      usuario.id,
      validar(paramsId, req.params).id,
      validar(esquemaEditarMensajeWa, req.body),
    );
  });

  app.post('/equipos/:equipoId/whatsapp/cola/enviar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'enviar_cola_whatsapp', true);
    const { ids } = validar(esquemaIdsWa, req.body ?? {});
    const avisos = await repo.enviar(db, actor, equipoId, ids ?? null);
    return entregar(db, config, avisos);
  });

  app.post('/equipos/:equipoId/whatsapp/cola/descartar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'enviar_cola_whatsapp', true);
    const { ids } = validar(esquemaIdsWa, req.body ?? {});
    return repo.descartar(db, actor, equipoId, ids ?? []);
  });

  app.post('/equipos/:equipoId/whatsapp/cola/reintentar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'enviar_cola_whatsapp', true);
    const { ids } = validar(esquemaIdsWa, req.body ?? {});
    return repo.reintentar(db, actor, equipoId, ids ?? null);
  });

  // --- WA-05, WA-06, WA-08 ----------------------------------------------------------------------

  app.post('/equipos/:equipoId/whatsapp/conectar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'configurar_whatsapp', true);
    const datos = validar(esquemaConectarWa, req.body);
    if (datos.proveedor !== 'simulado' && config.WHATSAPP_PROVIDER !== 'real') {
      throw new ErrorNexo(
        409,
        'whatsapp_sin_cuenta',
        'Este servidor no tiene una cuenta de Meta configurada: por ahora solo el modo simulado.',
      );
    }
    return repo.conectar(db, actor, equipoId, datos);
  });

  app.post('/equipos/:equipoId/whatsapp/desconectar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'configurar_whatsapp', true);
    return repo.desconectar(db, actor, equipoId);
  });

  app.patch('/equipos/:equipoId/whatsapp/configuracion', async (req) => {
    const { actor, equipoId } = await contexto(req, 'configurar_whatsapp', true);
    return repo.configurar(db, actor, equipoId, validar(esquemaConfigurarWa, req.body));
  });

  app.put('/equipos/:equipoId/whatsapp/reglas/:tipo', async (req) => {
    const { actor, equipoId } = await contexto(req, 'configurar_whatsapp', true);
    const { tipo } = validar(paramsRegla, req.params);
    const { modo } = validar(esquemaReglaWa, req.body);
    return repo.guardarRegla(db, actor, equipoId, tipo, modo);
  });

  // --- PF-05 y WA-07: la persona --------------------------------------------------------------

  app.get('/yo/whatsapp', async (req) => repo.usuario(db, exigirSesion(req).usuario.id));

  app.patch('/yo/whatsapp', async (req) =>
    repo.guardarUsuario(
      db,
      exigirSesion(req).usuario.id,
      validar(esquemaWhatsAppUsuario, req.body),
    ),
  );

  app.put('/equipos/:equipoId/whatsapp/consentimiento', async (req) => {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(paramsEquipo, req.params);
    await contextoEquipo(db, usuario.id, equipoId);
    const { acepta } = validar(esquemaConsentimientoWa, req.body);
    return repo.consentimiento(db, usuario.id, equipoId, acepta);
  });

  // --- 4.3: webhook de Meta --------------------------------------------------------------------

  await app.register(async (webhook) => {
    // Solo aquí el cuerpo llega crudo: la firma se calcula sobre los bytes tal como los mandó Meta.
    webhook.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, cuerpo, listo) =>
      listo(null, cuerpo),
    );

    // Verificación de la suscripción (Meta manda hub.challenge una vez al configurar el webhook).
    webhook.get('/whatsapp/webhook', async (req, res) => {
      const q = req.query as Record<string, string | undefined>;
      if (
        config.WHATSAPP_VERIFY_TOKEN &&
        q['hub.mode'] === 'subscribe' &&
        q['hub.verify_token'] === config.WHATSAPP_VERIFY_TOKEN
      ) {
        return res.type('text/plain').send(q['hub.challenge'] ?? '');
      }
      throw new ErrorNexo(403, 'webhook_no_verificado', 'La verificación del webhook no coincide.');
    });

    webhook.post(
      '/whatsapp/webhook',
      { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
      async (req, res) => {
        if (!config.WHATSAPP_APP_SECRET) {
          throw new ErrorNexo(
            503,
            'webhook_sin_configurar',
            'El webhook de WhatsApp no está configurado.',
          );
        }
        const crudo = req.body as Buffer;
        const firma = req.headers['x-hub-signature-256'];
        if (
          !Buffer.isBuffer(crudo) ||
          !firmaValida(
            config.WHATSAPP_APP_SECRET,
            crudo,
            typeof firma === 'string' ? firma : undefined,
          )
        ) {
          throw new ErrorNexo(401, 'firma_invalida', 'La firma del webhook no es válida.');
        }
        let datos: { entry?: { changes?: { field?: string; value?: unknown }[] }[] };
        try {
          datos = JSON.parse(crudo.toString('utf8'));
        } catch {
          throw new ErrorNexo(400, 'peticion_invalida', 'El cuerpo no es JSON.');
        }
        // Mismo cuerpo, mismos ids: si Meta lo reenvía no se aplica dos veces.
        const huella = createHash('sha256').update(crudo).digest('hex');
        let i = 0;
        for (const entrada of datos.entry ?? []) {
          for (const cambio of entrada.changes ?? []) {
            const valor = (cambio.value ?? {}) as Record<string, unknown>;
            const tipo = Array.isArray(valor.statuses)
              ? 'statuses'
              : (cambio.field ?? 'desconocido');
            await repo.registrarWebhook(db, `${huella}:${i++}`, tipo, valor);
          }
        }
        return res.status(200).send({ recibido: true });
      },
    );
  });

  // --- Solo desarrollo y pruebas: correr el ciclo ahora (sin esperar al minuto) ----------------

  if (config.DEV_LOGIN_ENABLED && config.NODE_ENV !== 'production') {
    app.post('/dev/whatsapp/ciclo', async () => cicloWhatsApp(db, config));
  }
};
