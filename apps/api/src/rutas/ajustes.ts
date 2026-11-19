import { esquemaGuardarAjustes } from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import * as repo from '../repositorios/ajustes';
import { validar } from '../validacion';

/** Ajustes de la persona (PF-04, PF-06) y reporte personal (FALT-01): solo piden sesión. */
export const rutasAjustes: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  app.get('/yo/ajustes', async (req) => {
    const { usuario } = exigirSesion(req);
    return repo.obtener(db, usuario.id);
  });

  app.patch('/yo/ajustes', async (req) => {
    const { usuario } = exigirSesion(req);
    return repo.guardar(db, usuario.id, validar(esquemaGuardarAjustes, req.body));
  });

  app.get('/personal/reporte', async (req) => {
    const { usuario } = exigirSesion(req);
    return repo.reportePersonal(db, usuario.id);
  });
};
