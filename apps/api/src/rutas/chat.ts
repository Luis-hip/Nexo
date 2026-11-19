import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import * as repo from '../repositorios/chat';
import { esquemaId, validar } from '../validacion';

const esquemaCrearDm = z.object({
  otroUsuarioId: esquemaId,
});

const esquemaCrearMensaje = z.object({
  texto: z.string().trim().min(1, 'Escribe un mensaje.').max(4000),
  hiloDeId: esquemaId.optional().nullable(),
  menciones: z.array(esquemaId).max(20).optional(),
  idCliente: esquemaId.optional().nullable(),
});

const esquemaReaccion = z.object({
  tipo: z.enum(['ok', 'corazon', 'risa', 'fiesta', 'visto', 'hecho']),
});

const esquemaLectura = z.object({
  ultimoLeidoSeq: z.coerce.number().int().nonnegative(),
});

const esquemaFijar = z.object({
  fijado: z.boolean(),
});

const esquemaConvertirTarea = z.object({
  titulo: z.string().trim().min(1).max(140).optional(),
});

export const rutasChat: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  app.get('/equipos/:equipoId/conversaciones', async (req) => {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(z.object({ equipoId: esquemaId }), req.params);
    return repo.listarConversaciones(db, equipoId, usuario.id);
  });

  app.post('/equipos/:equipoId/conversaciones/dm', async (req) => {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(z.object({ equipoId: esquemaId }), req.params);
    const { otroUsuarioId } = validar(esquemaCrearDm, req.body);
    const dm = await repo.crearObtenerDm(db, equipoId, usuario.id, otroUsuarioId);

    app.io?.in([`usuario:${usuario.id}`, `usuario:${otroUsuarioId}`]).socketsJoin(`conv:${dm.id}`);
    return dm;
  });

  app.get('/equipos/:equipoId/chat/buscar', async (req) => {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(z.object({ equipoId: esquemaId }), req.params);
    const { q } = validar(z.object({ q: z.string().default('') }), req.query);
    return repo.buscarMensajes(db, equipoId, usuario.id, q);
  });

  app.get('/conversaciones/:conversacionId/mensajes', async (req) => {
    const { usuario } = exigirSesion(req);
    const { conversacionId } = validar(z.object({ conversacionId: esquemaId }), req.params);
    const query = validar(
      z.object({
        hiloDeId: esquemaId.optional(),
        antesDeSeq: z.coerce.number().int().positive().optional(),
        limite: z.coerce.number().int().min(1).max(100).optional(),
      }),
      req.query,
    );
    return repo.listarMensajes(db, conversacionId, usuario.id, query);
  });

  app.post('/conversaciones/:conversacionId/mensajes', async (req, res) => {
    const { usuario } = exigirSesion(req);
    const { conversacionId } = validar(z.object({ conversacionId: esquemaId }), req.params);
    const datos = validar(esquemaCrearMensaje, req.body);

    const { msg, menciones } = await repo.crearMensaje(db, {
      conversacionId,
      autorId: usuario.id,
      ...datos,
    });

    const payload = {
      ...msg,
      autor_nombre: usuario.nombre,
      reacciones: [],
    };

    app.io?.to(`conv:${conversacionId}`).emit('chat:mensaje_nuevo', payload);

    for (const mencionadoId of menciones) {
      app.io?.to(`usuario:${mencionadoId}`).emit('chat:mencion', {
        conversacionId,
        mensaje: payload,
      });
    }

    return res.status(201).send(payload);
  });

  app.post('/mensajes/:mensajeId/reacciones', async (req) => {
    const { usuario } = exigirSesion(req);
    const { mensajeId } = validar(z.object({ mensajeId: esquemaId }), req.params);
    const { tipo } = validar(esquemaReaccion, req.body);

    const resultado = await repo.toggleReaccion(db, mensajeId, usuario.id, tipo);
    app.io?.to(`conv:${resultado.conversacionId}`).emit('chat:reaccion', {
      mensajeId,
      usuarioId: usuario.id,
      tipo,
      agregada: resultado.agregada,
    });
    return resultado;
  });

  app.post('/conversaciones/:conversacionId/lectura', async (req) => {
    const { usuario } = exigirSesion(req);
    const { conversacionId } = validar(z.object({ conversacionId: esquemaId }), req.params);
    const { ultimoLeidoSeq } = validar(esquemaLectura, req.body);

    await repo.marcarLeida(db, conversacionId, usuario.id, ultimoLeidoSeq);
    app.io?.to(`conv:${conversacionId}`).emit('chat:lectura', {
      conversacionId,
      usuarioId: usuario.id,
      ultimoLeidoSeq,
    });
    return { ok: true };
  });

  app.patch('/mensajes/:mensajeId/fijar', async (req) => {
    const { usuario } = exigirSesion(req);
    const { mensajeId } = validar(z.object({ mensajeId: esquemaId }), req.params);
    const { fijado } = validar(esquemaFijar, req.body);

    const actualizado = await repo.fijarMensaje(db, mensajeId, usuario.id, fijado);
    app.io?.to(`conv:${actualizado.conversacion_id}`).emit('chat:mensaje_actualizado', actualizado);
    return actualizado;
  });

  app.delete('/mensajes/:mensajeId', async (req) => {
    const { usuario } = exigirSesion(req);
    const { mensajeId } = validar(z.object({ mensajeId: esquemaId }), req.params);

    const eliminado = await repo.eliminarMensaje(db, mensajeId, usuario.id);
    app.io?.to(`conv:${eliminado.conversacion_id}`).emit('chat:mensaje_eliminado', {
      id: eliminado.id,
      conversacion_id: eliminado.conversacion_id,
    });
    return { ok: true };
  });

  app.post('/mensajes/:mensajeId/convertir-tarea', async (req, res) => {
    const { usuario } = exigirSesion(req);
    const { mensajeId } = validar(z.object({ mensajeId: esquemaId }), req.params);
    const { titulo } = validar(esquemaConvertirTarea, req.body ?? {});

    const resultado = await repo.convertirMensajeEnTarea(db, mensajeId, usuario.id, titulo);
    app.io
      ?.to(`conv:${resultado.conversacionId}`)
      .emit('chat:mensaje_actualizado', resultado.mensaje);
    return res.status(201).send(resultado);
  });
};
