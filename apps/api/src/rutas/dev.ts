import { esquemaDevLogin } from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import { COOKIE_SESION, DURACION_SESION_MS, crearTokenSesion } from '../sesiones';

interface OpcionesDev {
  db: BaseDatos;
  produccion: boolean;
}

/**
 * Acceso de desarrollo (docs/01, sección 8). Solo se registra si DEV_LOGIN_ENABLED=true.
 * Crea sesiones reales en `sesiones`, con el mismo mecanismo que usará la Fase 5.
 */
export const rutasDev: FastifyPluginAsync<OpcionesDev> = async (app, { db, produccion }) => {
  // Usuarios de la semilla para el selector de la web.
  app.get('/dev/usuarios', async () => {
    return db
      .selectFrom('usuarios')
      .select(['id', 'correo', 'nombre', 'cargo'])
      .orderBy('nombre')
      .execute();
  });

  app.post('/dev/login', async (req, res) => {
    const cuerpo = esquemaDevLogin.safeParse(req.body);
    if (!cuerpo.success) {
      throw new ErrorNexo(400, 'validacion', 'Datos inválidos.', cuerpo.error.issues);
    }
    const usuario = await db
      .selectFrom('usuarios')
      .select(['id', 'correo', 'nombre'])
      .where('correo', '=', cuerpo.data.email)
      .executeTakeFirst();
    if (!usuario) {
      throw new ErrorNexo(404, 'usuario_no_encontrado', 'No existe un usuario con ese correo.');
    }

    const { token, hash } = crearTokenSesion();
    const expira = new Date(Date.now() + DURACION_SESION_MS);
    await db
      .insertInto('sesiones')
      .values({
        usuario_id: usuario.id,
        token_hash: hash,
        dispositivo: 'dev-login',
        ip: req.ip,
        expira_en: expira,
      })
      .execute();

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
