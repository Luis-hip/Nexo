import {
  esquemaPerfil,
  esquemaPreferencias,
  type Preferencias,
  type UsuarioSesion,
  type Yo,
} from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/cuenta';
import { COOKIE_SESION } from '../sesiones';
import { validar } from '../validacion';

/** La cuenta de quien tiene la sesión. Los datos salen de procesos de la BD (docs/08). */
export const rutasYo: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  /** Usuario de la sesión, sus equipos, su perfil en cada uno y sus preferencias. */
  app.get('/yo', async (req): Promise<Yo> => {
    const { usuario } = exigirSesion(req);
    return { usuario, ...(await repo.yo(db, usuario.id)) };
  });

  /** Guarda cualquier subconjunto de las preferencias (apariencia, formatos, recorrido visto). */
  app.patch('/yo/preferencias', async (req): Promise<Preferencias> => {
    const { usuario } = exigirSesion(req);
    return repo.guardarPreferencias(db, usuario.id, validar(esquemaPreferencias, req.body));
  });

  /** Actualiza el perfil propio (nombre, cargo, descripción). */
  app.patch('/yo/perfil', async (req): Promise<UsuarioSesion> => {
    const { usuario } = exigirSesion(req);
    const cambios = validar(esquemaPerfil, req.body);
    if (Object.keys(cambios).length === 0) {
      throw new ErrorNexo(400, 'validacion', 'No hay nada que cambiar.');
    }
    return repo.guardarPerfil(db, usuario.id, cambios);
  });

  /** Cierra la sesión: la revoca en la BD y borra la cookie. */
  app.post('/salir', async (req, res) => {
    const { sesionId, usuario } = exigirSesion(req);
    await repo.revocarSesion(db, usuario.id, sesionId);
    res.clearCookie(COOKIE_SESION, { path: '/' });
    return res.status(204).send();
  });
};
