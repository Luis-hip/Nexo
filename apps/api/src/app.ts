import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { registrarAutenticacion } from './autenticacion';
import type { Config } from './config';
import type { BaseDatos } from './db/conexion';
import { ErrorNexo } from './errores';
import { rutasContacto } from './rutas/contacto';
import { rutasDev } from './rutas/dev';
import { rutasPersonal } from './rutas/personal';
import { rutasYo } from './rutas/yo';

export async function crearApp(config: Config, db: BaseDatos): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : { redact: ['req.headers.cookie', 'req.headers.authorization'] },
  });

  await app.register(cors, {
    origin: config.APP_URL,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  await app.register(cookie);
  // Límite de peticiones: solo en las rutas que lo declaran (contacto; login en la Fase 5).
  await app.register(rateLimit, { global: false });
  registrarAutenticacion(app, db);

  app.setErrorHandler((error, _req, res) => {
    if (error instanceof ErrorNexo) {
      return res.status(error.estado).send(error.aJson());
    }
    const codigoHttp = (error as { statusCode?: unknown }).statusCode;
    const estado = typeof codigoHttp === 'number' ? codigoHttp : 500;
    if (estado === 429) {
      return res.status(429).send({
        codigo: 'demasiadas_peticiones',
        mensaje: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
      });
    }
    if (estado >= 500) app.log.error(error);
    // Nunca se filtran trazas ni SQL al cliente.
    return res.status(estado).send({
      codigo: estado >= 500 ? 'error_interno' : 'peticion_invalida',
      mensaje: estado >= 500 ? 'Ocurrió un error inesperado.' : 'La petición no es válida.',
    });
  });

  app.setNotFoundHandler((_req, res) =>
    res.status(404).send({ codigo: 'no_encontrado', mensaje: 'La ruta no existe.' }),
  );

  app.get('/salud', async () => ({ estado: 'ok' }));
  await app.register(rutasYo, { db });
  await app.register(rutasPersonal, { db });
  await app.register(rutasContacto, { db });

  if (config.DEV_LOGIN_ENABLED) {
    await app.register(rutasDev, { db, produccion: config.NODE_ENV === 'production' });
  }

  return app;
}
