import {
  esquemaAvanzarRetro,
  esquemaCerrarSprint,
  esquemaNotaRetro,
  esquemaPlanearSprint,
  esquemaVotoRetro,
  type Accion,
} from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import * as repo from '../repositorios/sprints';
import { esquemaId, validar } from '../validacion';

const parametrosEquipo = z.object({ equipoId: esquemaId });
const parametrosSprint = parametrosEquipo.extend({ sprintId: esquemaId });
const parametrosNota = parametrosEquipo.extend({ notaId: esquemaId });

/**
 * Sprints y retrospectiva (Fase 3.3: EQ-09 a EQ-13). Cada ruta: sesión → membresía activa en
 * **este** equipo → permiso de la matriz (`ver_sprints`, `gestionar_sprints`, `participar_retro`,
 * `moderar_retro`). Las reglas de datos viven en los procesos de la BD (0009, docs/08), que
 * vuelven a comprobar todo dentro de su transacción.
 */
export const rutasSprints: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  /** Sesión, membresía y permiso. Si la acción escribe, el equipo no puede estar archivado. */
  async function contexto(req: FastifyRequest, accion: Accion, escribe = false) {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(parametrosEquipo, {
      equipoId: (req.params as { equipoId?: string }).equipoId,
    });
    const ctx = await contextoEquipo(db, usuario.id, equipoId);
    requierePermiso(ctx, accion);
    if (escribe) requiereEquipoActivo(ctx);
    return { actor: usuario.id, equipoId };
  }
  const sprintId = (req: FastifyRequest) => validar(parametrosSprint, req.params).sprintId;
  const notaId = (req: FastifyRequest) => validar(parametrosNota, req.params).notaId;

  // --- Sprints -------------------------------------------------------------------------------

  app.get('/equipos/:equipoId/sprints', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_sprints');
    return repo.listarSprints(db, actor, equipoId);
  });

  /** EQ-09: el sprint activo, o `{ sprint: null }` si no hay. */
  app.get('/equipos/:equipoId/sprints/activo', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_sprints');
    return { sprint: await repo.obtenerSprint(db, actor, equipoId, null) };
  });

  /** EQ-10: tareas que pueden entrar a un sprint. */
  app.get('/equipos/:equipoId/sprints/disponibles', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_sprints');
    return repo.disponibles(db, actor, equipoId);
  });

  app.get('/equipos/:equipoId/sprints/:sprintId', async (req) => {
    const { actor, equipoId } = await contexto(req, 'ver_sprints');
    return repo.obtenerSprint(db, actor, equipoId, sprintId(req));
  });

  app.post('/equipos/:equipoId/sprints', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'gestionar_sprints', true);
    const datos = validar(esquemaPlanearSprint, req.body ?? {});
    return res.status(201).send(await repo.planear(db, actor, equipoId, null, datos));
  });

  app.patch('/equipos/:equipoId/sprints/:sprintId', async (req) => {
    const { actor, equipoId } = await contexto(req, 'gestionar_sprints', true);
    const datos = validar(esquemaPlanearSprint, req.body ?? {});
    return repo.planear(db, actor, equipoId, sprintId(req), datos);
  });

  app.post('/equipos/:equipoId/sprints/:sprintId/iniciar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'gestionar_sprints', true);
    return repo.iniciar(db, actor, equipoId, sprintId(req));
  });

  /** EQ-11: cierre con instantánea; `pendientes` = `liberar` | `siguiente`. */
  app.post('/equipos/:equipoId/sprints/:sprintId/cerrar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'gestionar_sprints', true);
    const { pendientes } = validar(esquemaCerrarSprint, req.body ?? {});
    return repo.cerrar(db, actor, equipoId, sprintId(req), pendientes);
  });

  app.delete('/equipos/:equipoId/sprints/:sprintId', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'gestionar_sprints', true);
    await repo.eliminar(db, actor, equipoId, sprintId(req));
    return res.status(204).send();
  });

  // --- Retrospectiva (EQ-12) -----------------------------------------------------------------

  /** La retrospectiva del sprint, o `{ retro: null }` si aún no existe. */
  app.get('/equipos/:equipoId/sprints/:sprintId/retro', async (req) => {
    const { actor, equipoId } = await contexto(req, 'participar_retro');
    return { retro: await repo.obtenerRetro(db, actor, equipoId, sprintId(req)) };
  });

  app.post('/equipos/:equipoId/sprints/:sprintId/retro', async (req) => {
    const { actor, equipoId } = await contexto(req, 'moderar_retro', true);
    return repo.iniciarRetro(db, actor, equipoId, sprintId(req));
  });

  app.post('/equipos/:equipoId/sprints/:sprintId/retro/notas', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'participar_retro', true);
    const nota = validar(esquemaNotaRetro, req.body);
    return res.status(201).send(await repo.agregarNota(db, actor, equipoId, sprintId(req), nota));
  });

  app.post('/equipos/:equipoId/sprints/:sprintId/retro/avanzar', async (req) => {
    const { actor, equipoId } = await contexto(req, 'moderar_retro', true);
    const { fase } = validar(esquemaAvanzarRetro, req.body);
    return repo.avanzarRetro(db, actor, equipoId, sprintId(req), fase);
  });

  app.delete('/equipos/:equipoId/retro/notas/:notaId', async (req, res) => {
    // Su autora o el líder: el permiso fino lo decide el proceso.
    const { actor, equipoId } = await contexto(req, 'participar_retro', true);
    await repo.eliminarNota(db, actor, equipoId, notaId(req));
    return res.status(204).send();
  });

  app.post('/equipos/:equipoId/retro/notas/:notaId/voto', async (req) => {
    const { actor, equipoId } = await contexto(req, 'participar_retro', true);
    const { dar } = validar(esquemaVotoRetro, req.body);
    return repo.votarNota(db, actor, equipoId, notaId(req), dar);
  });

  app.post('/equipos/:equipoId/retro/notas/:notaId/tarea', async (req, res) => {
    const { actor, equipoId } = await contexto(req, 'moderar_retro', true);
    return res.status(201).send(await repo.notaATarea(db, actor, equipoId, notaId(req)));
  });
};
