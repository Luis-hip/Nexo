import { esquemaCrearEquipo, esquemaCrearInvitacion } from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import * as servicio from '../servicios/equipos';
import { esquemaId, validar } from '../validacion';

const parametrosEquipo = z.object({ equipoId: esquemaId });
const parametrosInvitacion = z.object({ equipoId: esquemaId, invitacionId: esquemaId });
const parametrosCodigo = z.object({ codigo: z.string().trim().min(4).max(200) });

/** Equipos, miembros e invitaciones (Fase 2, sección 2.1). Las rutas solo validan y guardan permisos. */
export const rutasEquipos: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  const contexto = async (req: FastifyRequest) => {
    const { usuario } = exigirSesion(req);
    const { equipoId } = validar(parametrosEquipo, req.params);
    return { usuario, ctx: await contextoEquipo(db, usuario.id, equipoId) };
  };

  /** PER-06: crear equipo. Cualquier persona con sesión puede; queda como líder. */
  app.post('/equipos', async (req, res) => {
    const { usuario } = exigirSesion(req);
    const equipo = await servicio.crearEquipo(db, usuario, validar(esquemaCrearEquipo, req.body));
    return res.status(201).send(equipo);
  });

  app.get('/equipos/:equipoId', async (req) => {
    const { ctx } = await contexto(req);
    return servicio.obtenerEquipo(db, ctx);
  });

  app.get('/equipos/:equipoId/miembros', async (req) => {
    const { ctx } = await contexto(req);
    requierePermiso(ctx, 'ver_miembros');
    return servicio.listarMiembros(db, ctx.equipoId);
  });

  app.get('/equipos/:equipoId/invitaciones', async (req) => {
    const { ctx } = await contexto(req);
    requierePermiso(ctx, 'invitar_personas');
    return servicio.listarInvitaciones(db, ctx.equipoId);
  });

  app.post('/equipos/:equipoId/invitaciones', async (req, res) => {
    const { usuario, ctx } = await contexto(req);
    requierePermiso(ctx, 'invitar_personas');
    requiereEquipoActivo(ctx);
    const invitacion = await servicio.crearInvitacion(
      db,
      ctx,
      usuario,
      validar(esquemaCrearInvitacion, req.body),
    );
    return res.status(201).send(invitacion);
  });

  app.post('/equipos/:equipoId/invitaciones/:invitacionId/revocar', async (req) => {
    const { usuario } = exigirSesion(req);
    const { equipoId, invitacionId } = validar(parametrosInvitacion, req.params);
    const ctx = await contextoEquipo(db, usuario.id, equipoId);
    requierePermiso(ctx, 'invitar_personas');
    return servicio.revocarInvitacion(db, ctx, invitacionId);
  });

  /** PER-07 / AUTH-08: vista previa de una invitación. No exige pertenecer al equipo. */
  app.get('/invitaciones/:codigo', async (req) => {
    const { usuario } = exigirSesion(req);
    const { codigo } = validar(parametrosCodigo, req.params);
    return servicio.verInvitacion(db, usuario.id, codigo);
  });

  app.post(
    '/invitaciones/:codigo/aceptar',
    // Evita probar códigos al azar.
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { usuario } = exigirSesion(req);
      const { codigo } = validar(parametrosCodigo, req.params);
      return servicio.aceptarInvitacion(db, usuario, codigo);
    },
  );
};
