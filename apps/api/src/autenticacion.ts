import type { UsuarioSesion } from '@nexo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BaseDatos } from './db/conexion';
import { ErrorNexo } from './errores';
import * as repo from './repositorios/cuenta';
import { COOKIE_SESION, hashToken } from './sesiones';

export interface SesionActual {
  sesionId: string;
  usuario: UsuarioSesion;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Sesión vigente de la petición, o `null` si no hay cookie válida. */
    sesion: SesionActual | null;
  }
}

/**
 * Resuelve la sesión de cada petición a partir de la cookie: el token opaco se convierte en su
 * hash y el proceso `proc_sesion_resolver` devuelve la sesión vigente y su usuario.
 * La Fase 5 solo cambia cómo se obtiene la sesión; este mecanismo se conserva.
 */
export function registrarAutenticacion(app: FastifyInstance, db: BaseDatos): void {
  app.decorateRequest('sesion', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE_SESION];
    if (!token) return;
    const sesion = await repo.resolverSesion(db, hashToken(token));
    if (!sesion) return;
    req.sesion = { sesionId: sesion.sesion_id, usuario: sesion.usuario };
  });
}

/** Devuelve la sesión o responde 401 con el formato único de error. */
export function exigirSesion(req: FastifyRequest): SesionActual {
  if (!req.sesion) {
    throw new ErrorNexo(401, 'no_autenticado', 'Inicia sesión para continuar.');
  }
  return req.sesion;
}
