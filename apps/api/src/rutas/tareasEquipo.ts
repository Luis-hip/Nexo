import {
  esquemaActualizarSubtarea,
  esquemaAsignar,
  esquemaCambiarEstado,
  esquemaCompartir,
  esquemaCrearComentario,
  esquemaCrearSubtarea,
  esquemaCrearTareaEquipo,
  esquemaEditarTareaEquipo,
  esquemaMoverTarea,
  esquemaResponderAsignacion,
  esquemaRetirar,
  esquemaVotar,
} from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import * as servicio from '../servicios/tareasEquipo';
import { esquemaId, validar } from '../validacion';

const parametrosEquipo = z.object({ equipoId: esquemaId });
const parametrosTarea = z.object({ equipoId: esquemaId, tareaId: esquemaId });
const parametrosSubtarea = parametrosTarea.extend({ subId: esquemaId });
const parametrosComentario = parametrosTarea.extend({ comentarioId: esquemaId });
const consultaLista = z.object({
  vista: z.enum(['tablero', 'backlog', 'votacion', 'mias', 'todas']).default('tablero'),
});

/**
 * Tareas de equipo (Fase 2, secciones 2.2 y 2.3). Cada ruta: sesión → membresía activa en
 * **este** equipo → permiso de la matriz. Las reglas de datos viven en los procesos de la BD
 * (docs/08) y el servicio solo los llama.
 */
export const rutasTareasEquipo: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  /** Sesión + membresía. Para escribir, además exige que el equipo no esté archivado. */
  async function contexto(req: FastifyRequest, escribe = false) {
    const { usuario } = exigirSesion(req);
    const p = req.params as Record<string, string>;
    const { equipoId } = validar(parametrosEquipo, { equipoId: p.equipoId });
    const ctx = await contextoEquipo(db, usuario.id, equipoId);
    if (escribe) requiereEquipoActivo(ctx);
    return { ctx, actor: { id: usuario.id, nombre: usuario.nombre } };
  }
  const tareaId = (req: FastifyRequest) => validar(parametrosTarea, req.params).tareaId;

  // --- Lectura -------------------------------------------------------------------------------

  app.get('/equipos/:equipoId/tareas', async (req) => {
    const { ctx } = await contexto(req);
    const { vista } = validar(consultaLista, req.query);
    // Un invitado ve solo lo compartido (lo filtra el servicio); no hay backlog ni votación para él.
    requierePermiso(ctx, 'ver_resumen', { esCompartido: true });
    if (vista === 'backlog' || vista === 'votacion') requierePermiso(ctx, 'ver_sprints');
    if (vista === 'mias') requierePermiso(ctx, 'ver_sprints');
    return servicio.listar(db, ctx, vista);
  });

  app.get('/equipos/:equipoId/tareas/conteos', async (req) => {
    const { ctx } = await contexto(req);
    requierePermiso(ctx, 'ver_sprints');
    return servicio.contar(db, ctx);
  });

  app.get('/equipos/:equipoId/tareas/:tareaId', async (req) => {
    const { ctx } = await contexto(req);
    requierePermiso(ctx, 'ver_resumen', { esCompartido: true });
    return servicio.obtener(db, ctx, tareaId(req));
  });

  // --- Crear, editar, eliminar ---------------------------------------------------------------

  app.post('/equipos/:equipoId/tareas', async (req, res) => {
    const { ctx, actor } = await contexto(req, true);
    // Solo el líder crea tareas: nacen como propuesta, con sus subtareas, y van a votación (DEC-024).
    requierePermiso(ctx, 'crear_tarea');
    const tarea = await servicio.crear(db, ctx, actor, validar(esquemaCrearTareaEquipo, req.body));
    return res.status(201).send(tarea);
  });

  app.patch('/equipos/:equipoId/tareas/:tareaId', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    if (ctx.rol === 'invitado') requierePermiso(ctx, 'editar_tarea_ajena');
    return servicio.editar(
      db,
      ctx,
      actor,
      tareaId(req),
      validar(esquemaEditarTareaEquipo, req.body),
    );
  });

  app.delete('/equipos/:equipoId/tareas/:tareaId', async (req, res) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'editar_tarea_ajena');
    await servicio.eliminar(db, ctx, actor, tareaId(req));
    return res.status(204).send();
  });

  // --- Estados y tablero ---------------------------------------------------------------------

  app.post('/equipos/:equipoId/tareas/:tareaId/estado', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    // El permiso fino (¿es su tarea?) y la transición se comprueban en el servicio.
    requierePermiso(ctx, 'cambiar_estado_tarea', { esPropio: true });
    return servicio.cambiarEstado(
      db,
      ctx,
      actor,
      tareaId(req),
      validar(esquemaCambiarEstado, req.body),
    );
  });

  app.post('/equipos/:equipoId/tareas/:tareaId/mover', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'cambiar_estado_tarea', { esPropio: true });
    return servicio.mover(db, ctx, actor, tareaId(req), validar(esquemaMoverTarea, req.body));
  });

  // --- Votación de propuestas (EQ-05, DEC-024) -----------------------------------------------

  app.post('/equipos/:equipoId/tareas/:tareaId/voto', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'votar_propuesta');
    return servicio.votar(db, ctx, actor, tareaId(req), validar(esquemaVotar, req.body));
  });

  app.post('/equipos/:equipoId/tareas/:tareaId/retirar', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'retirar_propuesta');
    const { version } = validar(esquemaRetirar, req.body);
    return servicio.retirar(db, ctx, actor, tareaId(req), version);
  });

  app.post('/equipos/:equipoId/tareas/:tareaId/reformular', async (req, res) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'retirar_propuesta');
    const nueva = await servicio.reformular(
      db,
      ctx,
      actor,
      tareaId(req),
      validar(esquemaCrearTareaEquipo, req.body),
    );
    return res.status(201).send(nueva);
  });

  // --- Asignación ----------------------------------------------------------------------------

  app.post('/equipos/:equipoId/tareas/:tareaId/asignar', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'asignar_responsable');
    return servicio.asignar(db, ctx, actor, tareaId(req), validar(esquemaAsignar, req.body));
  });

  app.post('/equipos/:equipoId/tareas/:tareaId/asignacion', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'responder_asignacion');
    return servicio.responderAsignacion(
      db,
      ctx,
      actor,
      tareaId(req),
      validar(esquemaResponderAsignacion, req.body),
    );
  });

  app.put('/equipos/:equipoId/tareas/:tareaId/compartida', async (req) => {
    const { ctx, actor } = await contexto(req, true);
    requierePermiso(ctx, 'invitar_personas');
    const { membresia_ids } = validar(esquemaCompartir, req.body);
    return servicio.compartir(db, ctx, actor, tareaId(req), membresia_ids);
  });

  // --- Subtareas y comentarios ---------------------------------------------------------------

  app.post('/equipos/:equipoId/tareas/:tareaId/subtareas', async (req, res) => {
    const { ctx } = await contexto(req, true);
    requierePermiso(ctx, 'cambiar_estado_tarea', { esPropio: true });
    const { titulo } = validar(esquemaCrearSubtarea, req.body);
    return res.status(201).send(await servicio.crearSubtarea(db, ctx, tareaId(req), titulo));
  });

  app.patch('/equipos/:equipoId/tareas/:tareaId/subtareas/:subId', async (req) => {
    const { ctx } = await contexto(req, true);
    requierePermiso(ctx, 'cambiar_estado_tarea', { esPropio: true });
    const { tareaId: id, subId } = validar(parametrosSubtarea, req.params);
    return servicio.actualizarSubtarea(
      db,
      ctx,
      id,
      subId,
      validar(esquemaActualizarSubtarea, req.body),
    );
  });

  app.delete('/equipos/:equipoId/tareas/:tareaId/subtareas/:subId', async (req, res) => {
    const { ctx } = await contexto(req, true);
    requierePermiso(ctx, 'cambiar_estado_tarea', { esPropio: true });
    const { tareaId: id, subId } = validar(parametrosSubtarea, req.params);
    await servicio.eliminarSubtarea(db, ctx, id, subId);
    return res.status(204).send();
  });

  app.post('/equipos/:equipoId/tareas/:tareaId/comentarios', async (req, res) => {
    const { ctx, actor } = await contexto(req, true);
    // (c): el servicio responde 404 al invitado si la tarea no está compartida con él.
    requierePermiso(ctx, 'comentar', { esCompartido: true });
    const { texto } = validar(esquemaCrearComentario, req.body);
    return res.status(201).send(await servicio.comentar(db, ctx, actor, tareaId(req), texto));
  });

  app.delete('/equipos/:equipoId/tareas/:tareaId/comentarios/:comentarioId', async (req, res) => {
    const { ctx } = await contexto(req, true);
    requierePermiso(ctx, 'comentar', { esCompartido: true });
    const { tareaId: id, comentarioId } = validar(parametrosComentario, req.params);
    await servicio.eliminarComentario(db, ctx, id, comentarioId);
    return res.status(204).send();
  });
};
