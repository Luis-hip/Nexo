import {
  esquemaAbrirDm,
  esquemaBuscarChat,
  esquemaConsultaMensajes,
  esquemaEnviarMensaje,
  esquemaFijarMensaje,
  esquemaLeerConversacion,
  esquemaMensajeATarea,
  esquemaPreferenciasConversacion,
  esquemaReaccionar,
  EVENTOS_CHAT,
} from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo } from '../equipos/contexto';
import * as repo from '../repositorios/chat';
import { esquemaId, validar } from '../validacion';

const paramsEquipo = z.object({ equipoId: esquemaId });
const paramsEquipoTarea = paramsEquipo.extend({ tareaId: esquemaId });
const paramsId = z.object({ id: esquemaId });

/**
 * Chat del equipo (Fase 4.1, CH-01 a CH-10). Las rutas solo piden sesión (y membresía cuando el
 * equipo va en la URL): quién ve y escribe en cada conversación lo decide `fn_chat_puede` dentro
 * de los procesos (docs/08), que responden 404 a quien no tiene acceso. Después de cada cambio
 * se emite por Socket.IO a quienes tienen acceso en ese momento.
 */
export const rutasChat: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  const actor = (req: FastifyRequest) => exigirSesion(req).usuario.id;
  const idDe = (req: FastifyRequest) => validar(paramsId, req.params).id;
  const equipoDe = async (req: FastifyRequest) => {
    const { equipoId } = validar(paramsEquipo, req.params);
    await contextoEquipo(db, actor(req), equipoId);
    return equipoId;
  };

  // --- Por equipo ----------------------------------------------------------------------------

  app.get('/equipos/:equipoId/chat/conversaciones', async (req) => {
    const equipoId = await equipoDe(req);
    return repo.conversaciones(db, actor(req), equipoId);
  });

  app.post('/equipos/:equipoId/chat/dm', async (req) => {
    const equipoId = await equipoDe(req);
    const { usuario_id } = validar(esquemaAbrirDm, req.body);
    const c = await repo.abrirDm(db, actor(req), equipoId, usuario_id);
    await app.tiempoReal.conversacionNueva(actor(req), c.id, c);
    return c;
  });

  app.post('/equipos/:equipoId/chat/tareas/:tareaId/conversacion', async (req) => {
    const { equipoId, tareaId } = validar(paramsEquipoTarea, req.params);
    await contextoEquipo(db, actor(req), equipoId);
    const c = await repo.conversacionTarea(db, actor(req), equipoId, tareaId);
    await app.tiempoReal.conversacionNueva(actor(req), c.id, c);
    return c;
  });

  app.get('/equipos/:equipoId/chat/buscar', async (req) => {
    const equipoId = await equipoDe(req);
    const { q, conversacion_id } = validar(esquemaBuscarChat, req.query);
    return repo.buscar(db, actor(req), equipoId, q, conversacion_id);
  });

  // --- Por conversación ----------------------------------------------------------------------

  app.get('/chat/conversaciones/:id/mensajes', async (req) => {
    const { antes, limite } = validar(esquemaConsultaMensajes, req.query);
    return repo.mensajes(db, actor(req), idDe(req), antes, limite);
  });

  app.post('/chat/conversaciones/:id/mensajes', async (req, res) => {
    const conversacionId = idDe(req);
    const datos = validar(esquemaEnviarMensaje, req.body);
    const m = await repo.enviar(db, actor(req), conversacionId, datos);
    await app.tiempoReal.emitir(actor(req), conversacionId, EVENTOS_CHAT.mensaje, m);
    return res.status(201).send(m);
  });

  app.get('/chat/conversaciones/:id/fijados', async (req) =>
    repo.fijados(db, actor(req), idDe(req)),
  );
  app.get('/chat/conversaciones/:id/miembros', async (req) =>
    repo.miembros(db, actor(req), idDe(req)),
  );

  app.post('/chat/conversaciones/:id/lectura', async (req) => {
    const conversacionId = idDe(req);
    const { hasta_seq } = validar(esquemaLeerConversacion, req.body);
    const r = await repo.leer(db, actor(req), conversacionId, hasta_seq);
    await app.tiempoReal.emitir(actor(req), conversacionId, EVENTOS_CHAT.lectura, {
      ...r,
      usuario_id: actor(req),
    });
    return r;
  });

  app.patch('/chat/conversaciones/:id/preferencias', async (req) =>
    repo.preferencias(
      db,
      actor(req),
      idDe(req),
      validar(esquemaPreferenciasConversacion, req.body),
    ),
  );

  // --- Por mensaje ---------------------------------------------------------------------------

  app.get('/chat/mensajes/:id/hilo', async (req) => repo.hilo(db, actor(req), idDe(req)));

  app.delete('/chat/mensajes/:id', async (req) => {
    const m = await repo.eliminar(db, actor(req), idDe(req));
    await app.tiempoReal.emitir(actor(req), m.conversacion_id, EVENTOS_CHAT.mensajeEditado, m);
    return m;
  });

  app.post('/chat/mensajes/:id/fijar', async (req) => {
    const { fijado } = validar(esquemaFijarMensaje, req.body);
    const m = await repo.fijar(db, actor(req), idDe(req), fijado);
    await app.tiempoReal.emitir(actor(req), m.conversacion_id, EVENTOS_CHAT.mensajeEditado, m);
    return m;
  });

  app.post('/chat/mensajes/:id/reaccion', async (req) => {
    const { tipo } = validar(esquemaReaccionar, req.body);
    const r = await repo.reaccionar(db, actor(req), idDe(req), tipo);
    // Las reacciones llevan «yo» según quien consulta: cada cliente vuelve a pedirlas.
    await app.tiempoReal.emitir(actor(req), r.conversacion_id, EVENTOS_CHAT.reaccion, {
      mensaje_id: r.mensaje_id,
      conversacion_id: r.conversacion_id,
    });
    return r;
  });

  app.post('/chat/mensajes/:id/tarea', async (req, res) => {
    const datos = validar(esquemaMensajeATarea, req.body ?? {});
    const r = await repo.mensajeATarea(db, actor(req), idDe(req), datos);
    const conv = r.mensaje.conversacion_id;
    await app.tiempoReal.emitir(actor(req), conv, EVENTOS_CHAT.mensajeEditado, r.mensaje);
    await app.tiempoReal.emitir(actor(req), conv, EVENTOS_CHAT.mensaje, r.sistema);
    return res.status(201).send(r);
  });
};
