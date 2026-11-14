import type { Yo } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../app';
import { cargarConfig } from '../config';
import { crearBaseDatos, type BaseDatos } from '../db/conexion';
import { COOKIE_SESION } from '../sesiones';

// Pruebas de integración: necesitan una BD migrada y sembrada (`pnpm db:reset`; la CI lo hace).
const DATABASE_URL = process.env.DATABASE_URL;
const GABRIEL = '00000000-0000-4000-8000-000000000006';

describe.skipIf(!DATABASE_URL)('preferencias y perfil propios', () => {
  let db: BaseDatos;
  let app: FastifyInstance;
  let gabriel: Record<string, string>;
  let hilda: Record<string, string>;

  async function entrar(email: string) {
    const r = await app.inject({ method: 'POST', url: '/dev/login', payload: { email } });
    return { [COOKIE_SESION]: r.cookies.find((c) => c.name === COOKIE_SESION)?.value ?? '' };
  }
  const yo = async (cookies: Record<string, string>) =>
    (await app.inject({ method: 'GET', url: '/yo', cookies })).json<Yo>();

  beforeAll(async () => {
    const config = cargarConfig({ DATABASE_URL, NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true' });
    db = crearBaseDatos(config.DATABASE_URL);
    app = await crearApp(config, db);
    gabriel = await entrar('gabriel@nexo.mx');
    hilda = await entrar('hilda@nexo.mx');
  });

  afterAll(async () => {
    // Deja la semilla como estaba.
    await db
      .updateTable('preferencias_usuario')
      .set({ tema: 'sistema', tour_visto: false })
      .where('usuario_id', '=', GABRIEL)
      .execute();
    await db
      .updateTable('usuarios')
      .set({ nombre: 'Gabriel Soto', cargo: 'Desarrollo frontend' })
      .where('id', '=', GABRIEL)
      .execute();
    await app.close();
    await db.destroy();
  });

  it('GET /yo incluye las preferencias', async () => {
    expect((await yo(gabriel)).preferencias).toMatchObject({
      tema: 'sistema',
      densidad: 'comoda',
      formato_hora: '24h',
    });
  });

  it('PATCH /yo/preferencias guarda solo lo enviado y solo para quien lo pide', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/yo/preferencias',
      cookies: gabriel,
      payload: { tema: 'oscuro', tour_visto: true },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ tema: 'oscuro', tour_visto: true, densidad: 'comoda' });
    expect((await yo(gabriel)).preferencias.tema).toBe('oscuro');
    expect((await yo(hilda)).preferencias.tema).toBe('sistema');
  });

  it('PATCH /yo/preferencias rechaza valores fuera del catálogo', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/yo/preferencias',
      cookies: gabriel,
      payload: { tema: 'rosa' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('validacion');
  });

  it('PATCH /yo/perfil cambia el nombre y el cargo propios', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/yo/perfil',
      cookies: gabriel,
      payload: { nombre: '  Gabriel S.  ', cargo: 'Frontend' },
    });
    expect(r.json()).toMatchObject({ nombre: 'Gabriel S.', cargo: 'Frontend' });
    expect((await yo(gabriel)).usuario.nombre).toBe('Gabriel S.');
    expect((await yo(hilda)).usuario.nombre).toBe('Hilda Vargas');
  });

  it('PATCH /yo/perfil valida el nombre y exige sesión', async () => {
    const corto = await app.inject({
      method: 'PATCH',
      url: '/yo/perfil',
      cookies: gabriel,
      payload: { nombre: 'G' },
    });
    expect(corto.statusCode).toBe(400);
    const sinSesion = await app.inject({
      method: 'PATCH',
      url: '/yo/perfil',
      payload: { nombre: 'Alguien' },
    });
    expect(sinSesion.statusCode).toBe(401);
  });
});
