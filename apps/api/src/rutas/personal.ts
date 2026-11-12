import {
  esquemaActualizarSubtarea,
  esquemaActualizarTareaPersonal,
  esquemaCrearComentario,
  esquemaCrearSubtarea,
  esquemaCrearTareaPersonal,
  esquemaFiltrosTareas,
} from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import * as servicio from '../servicios/tareasPersonales';
import { esquemaId, exigirPermiso, validar } from '../validacion';

const parametrosTarea = z.object({ id: esquemaId });
const parametrosSubtarea = z.object({ id: esquemaId, subId: esquemaId });
const parametrosComentario = z.object({ id: esquemaId, comentarioId: esquemaId });

/**
 * Espacio personal: tareas privadas de la persona con sesión (perfil «personal»).
 * Las rutas solo validan y comprueban permisos; las reglas viven en el servicio.
 */
export const rutasPersonal: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  const usuarioId = (req: FastifyRequest) => exigirSesion(req).usuario.id;

  app.get('/personal/tareas', async (req) => {
    const uid = usuarioId(req);
    exigirPermiso('ver_resumen', { perfil: 'personal' });
    return servicio.listar(db, uid, validar(esquemaFiltrosTareas, req.query));
  });

  app.post('/personal/tareas', async (req, res) => {
    const uid = usuarioId(req);
    exigirPermiso('crear_tarea', { perfil: 'personal' });
    const tarea = await servicio.crear(db, uid, validar(esquemaCrearTareaPersonal, req.body));
    return res.status(201).send(tarea);
  });

  app.get('/personal/tareas/:id', async (req) => {
    const uid = usuarioId(req);
    exigirPermiso('ver_resumen', { perfil: 'personal' });
    return servicio.obtener(db, uid, validar(parametrosTarea, req.params).id);
  });

  app.patch('/personal/tareas/:id', async (req) => {
    const uid = usuarioId(req);
    exigirPermiso('cambiar_estado_tarea', { perfil: 'personal', esPropio: true });
    const { id } = validar(parametrosTarea, req.params);
    return servicio.actualizar(db, uid, id, validar(esquemaActualizarTareaPersonal, req.body));
  });

  app.delete('/personal/tareas/:id', async (req, res) => {
    const uid = usuarioId(req);
    exigirPermiso('crear_tarea', { perfil: 'personal' });
    await servicio.eliminar(db, uid, validar(parametrosTarea, req.params).id);
    return res.status(204).send();
  });

  app.post('/personal/tareas/:id/subtareas', async (req, res) => {
    const uid = usuarioId(req);
    exigirPermiso('crear_tarea', { perfil: 'personal' });
    const { id } = validar(parametrosTarea, req.params);
    const { titulo } = validar(esquemaCrearSubtarea, req.body);
    return res.status(201).send(await servicio.crearSubtarea(db, uid, id, titulo));
  });

  app.patch('/personal/tareas/:id/subtareas/:subId', async (req) => {
    const uid = usuarioId(req);
    exigirPermiso('cambiar_estado_tarea', { perfil: 'personal', esPropio: true });
    const { id, subId } = validar(parametrosSubtarea, req.params);
    return servicio.actualizarSubtarea(
      db,
      uid,
      id,
      subId,
      validar(esquemaActualizarSubtarea, req.body),
    );
  });

  app.delete('/personal/tareas/:id/subtareas/:subId', async (req, res) => {
    const uid = usuarioId(req);
    exigirPermiso('crear_tarea', { perfil: 'personal' });
    const { id, subId } = validar(parametrosSubtarea, req.params);
    await servicio.eliminarSubtarea(db, uid, id, subId);
    return res.status(204).send();
  });

  app.post('/personal/tareas/:id/comentarios', async (req, res) => {
    const uid = usuarioId(req);
    exigirPermiso('comentar', { perfil: 'personal' });
    const { id } = validar(parametrosTarea, req.params);
    const { texto } = validar(esquemaCrearComentario, req.body);
    return res.status(201).send(await servicio.comentar(db, uid, id, texto));
  });

  app.delete('/personal/tareas/:id/comentarios/:comentarioId', async (req, res) => {
    const uid = usuarioId(req);
    exigirPermiso('comentar', { perfil: 'personal' });
    const { id, comentarioId } = validar(parametrosComentario, req.params);
    await servicio.eliminarComentario(db, uid, id, comentarioId);
    return res.status(204).send();
  });

  app.get('/personal/etiquetas', async (req) => servicio.listarEtiquetas(db, usuarioId(req)));
};
