import { esquemaDevLogin } from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/cuenta';
import { COOKIE_SESION, DURACION_SESION_MS, crearTokenSesion } from '../sesiones';

interface OpcionesDev {
  db: BaseDatos;
  produccion: boolean;
}

/**
 * Acceso de desarrollo (docs/01, sección 8). Solo se registra si DEV_LOGIN_ENABLED=true.
 * Crea sesiones reales en `sesiones`, con el mismo mecanismo que usará la Fase 5.
 * Sus procesos (`proc_dev_*`) no se conceden al rol `nexo_app`: en producción no existen para la API.
 */
export const rutasDev: FastifyPluginAsync<OpcionesDev> = async (app, { db, produccion }) => {
  // Usuarios de la semilla para el selector de la web.
  app.get('/dev/usuarios', async () => repo.usuariosDev(db));

  app.post('/dev/login', async (req, res) => {
    const cuerpo = esquemaDevLogin.safeParse(req.body);
    if (!cuerpo.success) {
      throw new ErrorNexo(400, 'validacion', 'Datos inválidos.', cuerpo.error.issues);
    }
    // Al cliente va el token; a la BD, solo su hash.
    const { token, hash } = crearTokenSesion();
    const expira = new Date(Date.now() + DURACION_SESION_MS);
    const { usuario } = await repo.crearSesionDev(db, {
      correo: cuerpo.data.email,
      tokenHash: hash,
      ip: req.ip,
      expiraEn: expira,
    });

    res.setCookie(COOKIE_SESION, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: produccion,
      expires: expira,
    });
    return { usuario };
  });
};
