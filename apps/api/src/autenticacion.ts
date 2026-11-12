import type { UsuarioSesion } from '@nexo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BaseDatos } from './db/conexion';
import { ErrorNexo } from './errores';
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
 * Resuelve la sesión de cada petición a partir de la cookie (token opaco → hash en `sesiones`).
 * La Fase 5 solo cambia cómo se obtiene la sesión; este mecanismo se conserva.
 */
export function registrarAutenticacion(app: FastifyInstance, db: BaseDatos): void {
  app.decorateRequest('sesion', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE_SESION];
    if (!token) return;
    const fila = await db
      .selectFrom('sesiones as s')
      .innerJoin('usuarios as u', 'u.id', 's.usuario_id')
      .select(['s.id as sesion_id', 'u.id', 'u.correo', 'u.nombre', 'u.cargo', 'u.avatar_url'])
      .where('s.token_hash', '=', hashToken(token))
      .where('s.revocada_en', 'is', null)
      .where('s.expira_en', '>', new Date())
      .where('u.eliminado_en', 'is', null)
      .executeTakeFirst();
    if (!fila) return;
    req.sesion = {
      sesionId: fila.sesion_id,
      usuario: {
        id: fila.id,
        correo: fila.correo,
        nombre: fila.nombre,
        cargo: fila.cargo,
        avatar_url: fila.avatar_url,
      },
    };
  });
}

/** Devuelve la sesión o responde 401 con el formato único de error. */
export function exigirSesion(req: FastifyRequest): SesionActual {
  if (!req.sesion) {
    throw new ErrorNexo(401, 'no_autenticado', 'Inicia sesión para continuar.');
  }
  return req.sesion;
}
