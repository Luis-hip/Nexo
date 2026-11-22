import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfig } from '../config';
import { crearEntorno, DATABASE_URL, type Entorno } from '../pruebas/ayudas';
import { COOKIE_SESION } from '../sesiones';

/** AUTH-07 · Entrar con Google (docs/13 1.2; migración 0038) contra un Google imitado. */
describe('Google: configuración', () => {
  const prod = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://nexo_app:pw@bd.interna/nexo',
    SESSION_SECRET: 'a'.repeat(40),
    ENCRYPTION_KEY: 'ab12'.repeat(16),
    APP_URL: 'https://app.ejemplo.test',
    API_URL: 'https://api.ejemplo.test',
  };
  it('en producción el secreto solo viaja a Google y el ID y el secreto van juntos', () => {
    expect(() => cargarConfig({ ...prod, GOOGLE_TOKEN_URL: 'https://malo.test/token' })).toThrow(
      /GOOGLE_TOKEN_URL/,
    );
    expect(() => cargarConfig({ ...prod, GOOGLE_CLIENT_ID: 'solo-id' })).toThrow(/van juntos/);
    expect(() =>
      cargarConfig({ ...prod, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secreto' }),
    ).not.toThrow();
  });
});

describe.skipIf(!DATABASE_URL)('entrar con Google', () => {
  let e: Entorno;
  let google: Server;
  /** Lo que devolverá el «Google» imitado en el id_token. */
  let perfil: Record<string, unknown> = {};
  const pedidos: URLSearchParams[] = [];
  const correo = `google-${Date.now()}@nexo.test`;

  beforeAll(async () => {
    google = createServer((req, res) => {
      let d = '';
      req.on('data', (c: Buffer) => (d += c.toString()));
      req.on('end', () => {
        pedidos.push(new URLSearchParams(d));
        const cuerpo = Buffer.from(
          JSON.stringify({
            iss: 'https://accounts.google.com',
            aud: 'cliente-prueba',
            exp: Math.floor(Date.now() / 1000) + 300,
            ...perfil,
          }),
        ).toString('base64url');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id_token: `x.${cuerpo}.y`, access_token: 'a' }));
      });
    });
    await new Promise<void>((ok) => google.listen(0, '127.0.0.1', ok));
    const { port } = google.address() as AddressInfo;
    e = await crearEntorno({
      GOOGLE_CLIENT_ID: 'cliente-prueba',
      GOOGLE_CLIENT_SECRET: 'secreto-prueba',
      GOOGLE_TOKEN_URL: `http://127.0.0.1:${port}/token`,
      APP_URL: 'http://app.prueba',
      API_URL: 'http://api.prueba',
    });
  });
  afterAll(async () => {
    await e.db.deleteFrom('usuarios').where('correo', 'like', 'google-%@nexo.test').execute();
    await e.cerrar();
    await new Promise<void>((ok) => google.close(() => ok()));
  });

  /** Inicia el flujo y devuelve el estado y la cookie cifrada, como haría el navegador. */
  async function iniciar(query = '', cookies?: Record<string, string>) {
    const r = await e.app.inject({ method: 'GET', url: `/auth/google${query}`, cookies });
    expect(r.statusCode, r.body).toBe(302);
    const url = new URL(r.headers.location as string);
    const c = r.cookies.find((x) => x.name === 'nexo_google')!;
    return { url, cookie: { nexo_google: c.value } };
  }
  const regreso = (estado: string, cookie: Record<string, string>, extra = '') =>
    e.app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=codigo-prueba&state=${estado}${extra}`,
      cookies: cookie,
    });

  it('anuncia que Google está disponible y redirige con PKCE y estado', async () => {
    expect((await e.pedir(null, 'GET', '/auth/proveedores')).cuerpo).toEqual({ google: true });
    const { url, cookie } = await iniciar('?volver=/app/personal');
    expect(url.searchParams.get('client_id')).toBe('cliente-prueba');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://api.prueba/auth/google/callback');
    expect(cookie.nexo_google).not.toContain('volver');
  });

  it('cuenta nueva: correo verificado, sesión y a la bienvenida; el verificador PKCE llega a Google', async () => {
    perfil = { sub: 'g-1', email: correo, email_verified: true, name: 'Gala Google' };
    const { url, cookie } = await iniciar();
    const r = await regreso(url.searchParams.get('state')!, cookie);
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('http://app.prueba/bienvenida/1');
    const sesion = r.cookies.find((x) => x.name === COOKIE_SESION);
    expect(sesion).toBeTruthy();
    expect(pedidos.at(-1)!.get('code_verifier')).toBeTruthy();
    const c = { [COOKIE_SESION]: sesion!.value };
    expect((await e.pedir(c, 'GET', '/auth/cuenta')).cuerpo).toMatchObject({
      correo,
      correo_verificado: true,
      tiene_contrasena: false,
      google: true,
    });
  });

  it('un estado que no coincide o una cookie ausente no entran', async () => {
    const { cookie } = await iniciar();
    const r = await regreso('otro-estado', cookie);
    expect(r.headers.location).toBe('http://app.prueba/entrar?google=error');
    const sin = await regreso('x', {});
    expect(sin.headers.location).toBe('http://app.prueba/entrar?google=expirado');
    const cancelado = await iniciar();
    const c = await regreso(
      cancelado.url.searchParams.get('state')!,
      cancelado.cookie,
      '&error=access_denied',
    );
    expect(c.headers.location).toBe('http://app.prueba/entrar?google=cancelado');
  });

  it('otra audiencia en el id_token se rechaza', async () => {
    perfil = {
      sub: 'g-2',
      email: `google-b-${Date.now()}@nexo.test`,
      email_verified: true,
      aud: 'otra-app',
    };
    const { url, cookie } = await iniciar();
    const r = await regreso(url.searchParams.get('state')!, cookie);
    expect(r.headers.location).toBe('http://app.prueba/entrar?google=error');
  });

  it('cuenta con contraseña y correo sin verificar: no se vincula sola; con sesión sí', async () => {
    const otro = `google-c-${Date.now()}@nexo.test`;
    const reg = await e.app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: { nombre: 'Con Clave', correo: otro, contrasena: 'Contraseña-segura-1' },
    });
    const c = { [COOKIE_SESION]: reg.cookies.find((x) => x.name === COOKIE_SESION)!.value };
    perfil = { sub: 'g-3', email: otro, email_verified: true, name: 'Con Clave' };
    const a = await iniciar();
    const r = await regreso(a.url.searchParams.get('state')!, a.cookie);
    expect(r.headers.location).toBe('http://app.prueba/entrar?google=cuenta_existente');
    const v = await iniciar('?modo=vincular', c);
    const r2 = await regreso(v.url.searchParams.get('state')!, { ...v.cookie, ...c });
    expect(r2.headers.location).toBe('http://app.prueba/ajustes/cuenta?google=vinculada');
    expect((await e.pedir(c, 'GET', '/auth/cuenta')).cuerpo).toMatchObject({
      google: true,
      correo_verificado: true,
    });
    // Con contraseña se puede desvincular.
    expect((await e.pedir(c, 'POST', '/auth/google/desvincular')).cuerpo).toEqual({
      google: false,
    });
  });

  it('cuenta solo con Google: eliminarla se confirma escribiendo su correo', async () => {
    const solo = `google-d-${Date.now()}@nexo.test`;
    perfil = { sub: 'g-4', email: solo, email_verified: true, name: 'Solo Google' };
    const a = await iniciar();
    const r = await regreso(a.url.searchParams.get('state')!, a.cookie);
    const c = { [COOKIE_SESION]: r.cookies.find((x) => x.name === COOKIE_SESION)!.value };
    const mal = await e.pedir(c, 'POST', '/yo/cuenta/eliminar', {
      correo: 'otro@nexo.test',
      confirmacion: 'ELIMINAR',
    });
    expect(mal.estado).toBe(400);
    const ok = await e.pedir(c, 'POST', '/yo/cuenta/eliminar', {
      correo: solo,
      confirmacion: 'ELIMINAR',
    });
    expect(ok.estado, JSON.stringify(ok.cuerpo)).toBe(200);
  });
});
