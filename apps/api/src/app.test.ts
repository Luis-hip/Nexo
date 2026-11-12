import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { crearApp } from './app';
import { cargarConfig } from './config';
import { crearBaseDatos, type BaseDatos } from './db/conexion';
import { COOKIE_SESION, hashToken } from './sesiones';

// Pruebas de integración: necesitan una BD migrada y sembrada (`pnpm db:reset` en local; la CI lo hace).
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('API con BD', () => {
  let db: BaseDatos;
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = cargarConfig({ DATABASE_URL, NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true' });
    db = crearBaseDatos(config.DATABASE_URL);
    app = await crearApp(config, db);
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  it('GET /salud responde ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/salud' });
    expect(r.json()).toEqual({ estado: 'ok' });
  });

  it('POST /dev/login crea una sesión real con el token guardado como hash', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/dev/login',
      payload: { email: 'valeria@nexo.mx' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario.nombre).toBe('Valeria Mendoza');

    const cookie = r.cookies.find((c) => c.name === COOKIE_SESION);
    expect(cookie?.httpOnly).toBe(true);
    const sesion = await db
      .selectFrom('sesiones')
      .select(['usuario_id'])
      .where('token_hash', '=', hashToken(cookie?.value ?? ''))
      .executeTakeFirst();
    expect(sesion?.usuario_id).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('POST /dev/login con un correo desconocido devuelve 404 con formato de error', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/dev/login',
      payload: { email: 'nadie@nexo.mx' },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ codigo: 'usuario_no_encontrado' });
  });

  it('POST /dev/login valida el cuerpo', async () => {
    const r = await app.inject({ method: 'POST', url: '/dev/login', payload: { email: 'x' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('validacion');
  });

  it('sin DEV_LOGIN_ENABLED la ruta no existe', async () => {
    const config = cargarConfig({ DATABASE_URL, NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'false' });
    const otra = await crearApp(config, db);
    const r = await otra.inject({
      method: 'POST',
      url: '/dev/login',
      payload: { email: 'valeria@nexo.mx' },
    });
    expect(r.statusCode).toBe(404);
    await otra.close();
  });
});
