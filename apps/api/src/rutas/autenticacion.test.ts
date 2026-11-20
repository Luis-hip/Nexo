import { MENSAJE_CREDENCIALES, MENSAJE_RECUPERAR } from '@nexo/shared';
import { describe as describir, expect, it, afterAll, beforeAll } from 'vitest';
import { cargarConfig } from '../config';
import { proveedorCorreo } from '../correo';
import { crearEntorno, DATABASE_URL, SEMILLA, type Entorno } from '../pruebas/ayudas';
import { COOKIE_SESION } from '../sesiones';

/** Token del enlace del último correo enviado a `para` (o `undefined`). */
function tokenDe(e: Entorno, para: string, ruta: '/verificar' | '/restablecer') {
  const m = [...e.correos].reverse().find((c) => c.para === para && c.texto.includes(ruta));
  return m?.texto.match(/token=([A-Za-z0-9_-]+)/)?.[1];
}

describir('correo según el entorno', () => {
  const base = { DATABASE_URL: 'postgres://x@localhost/nexo' };
  const produccion = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://nexo_app:pw@bd.interna/nexo',
    SESSION_SECRET: 'a'.repeat(40),
    ENCRYPTION_KEY: 'ab12'.repeat(16),
    APP_URL: 'https://app.ejemplo.test',
    API_URL: 'https://api.ejemplo.test',
  };
  it('consola en local; en producción Resend con clave o nada sin ella', () => {
    expect(proveedorCorreo(cargarConfig(base))).toBe('consola');
    expect(proveedorCorreo(cargarConfig(produccion))).toBe('ninguno');
    expect(proveedorCorreo(cargarConfig({ ...produccion, RESEND_API_KEY: 're_prueba' }))).toBe(
      'resend',
    );
  });
  it('en producción no se permite escribir correos en el registro ni Resend sin clave', () => {
    expect(() => cargarConfig({ ...produccion, CORREO_PROVEEDOR: 'consola' })).toThrow(/consola/);
    expect(() => cargarConfig({ ...produccion, CORREO_PROVEEDOR: 'resend' })).toThrow(
      /RESEND_API_KEY/,
    );
  });
});

/** Autenticación real (Fase 5.1): registro, entrar, salir, recuperar, verificar y contraseña. */
describir.skipIf(!DATABASE_URL)('autenticación', () => {
  let e: Entorno;
  const correo = `prueba-${Date.now()}@nexo.test`;
  const contrasena = 'Contraseña-segura-1';

  beforeAll(async () => {
    e = await crearEntorno();
  });
  afterAll(async () => {
    await e.db.deleteFrom('usuarios').where('correo', 'like', '%@nexo.test').execute();
    // La cuenta de la semilla que se bloquea en una prueba vuelve a su estado.
    await e.db
      .updateTable('usuarios')
      .set({ intentos_fallidos: 0, bloqueado_hasta: null })
      .where('correo', '=', SEMILLA.emilio)
      .execute();
    await e.cerrar();
  });

  const pedirCrudo = (url: string, payload?: object, cookies?: Record<string, string>) =>
    e.app.inject({ method: 'POST', url, payload, cookies });
  const cookieDe = (r: Awaited<ReturnType<typeof pedirCrudo>>) => {
    const c = r.cookies.find((x) => x.name === COOKIE_SESION);
    return c ? { [COOKIE_SESION]: c.value } : null;
  };

  it('registro: crea la cuenta, entra y envía el enlace para verificar el correo', async () => {
    const r = await pedirCrudo('/auth/registro', {
      nombre: 'Persona Nueva',
      correo: `  ${correo.toUpperCase()} `,
      contrasena,
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().usuario).toMatchObject({ correo, nombre: 'Persona Nueva' });
    const c = cookieDe(r);
    expect(c).not.toBeNull();
    const cookie = r.cookies.find((x) => x.name === COOKIE_SESION)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect((await e.pedir(c, 'GET', '/yo')).estado).toBe(200);
    expect((await e.pedir(c, 'GET', '/auth/cuenta')).cuerpo).toMatchObject({
      correo,
      correo_verificado: false,
    });
    expect(tokenDe(e, correo, '/verificar')).toBeTruthy();
  });

  it('registro: valida los datos y no duplica el correo', async () => {
    const corta = await pedirCrudo('/auth/registro', {
      nombre: 'Ana',
      correo: 'x@nexo.test',
      contrasena: '123',
    });
    expect(corta.statusCode).toBe(400);
    expect(corta.json().mensaje).toMatch(/al menos 8/);
    const repetido = await pedirCrudo('/auth/registro', { nombre: 'Otra', correo, contrasena });
    expect(repetido.statusCode).toBe(409);
  });

  it('verificar correo: el enlace funciona una vez', async () => {
    const token = tokenDe(e, correo, '/verificar')!;
    expect((await pedirCrudo('/auth/verificar', { token })).statusCode).toBe(200);
    expect((await pedirCrudo('/auth/verificar', { token })).statusCode).toBe(410);
    expect((await pedirCrudo('/auth/verificar', { token: 'x'.repeat(43) })).statusCode).toBe(410);
  });

  it('entrar: con la contraseña correcta; si falla, el mismo mensaje exista o no el correo', async () => {
    const ok = await pedirCrudo('/auth/entrar', { correo, contrasena });
    expect(ok.statusCode).toBe(200);
    expect(cookieDe(ok)).not.toBeNull();
    const mal = await pedirCrudo('/auth/entrar', { correo, contrasena: 'otra-cosa-123' });
    const nadie = await pedirCrudo('/auth/entrar', { correo: 'nadie@nexo.test', contrasena });
    expect(mal.statusCode).toBe(401);
    expect(nadie.statusCode).toBe(401);
    expect(mal.json()).toEqual(nadie.json());
    expect(mal.json().mensaje).toBe(MENSAJE_CREDENCIALES);
  });

  it('la semilla entra con «Nexo-2026» y salir invalida la sesión', async () => {
    const r = await pedirCrudo('/auth/entrar', { correo: SEMILLA.carlos, contrasena: 'Nexo-2026' });
    expect(r.statusCode).toBe(200);
    const c = cookieDe(r)!;
    expect((await e.pedir(c, 'POST', '/salir')).estado).toBe(204);
    expect((await e.pedir(c, 'GET', '/yo')).estado).toBe(401);
  });

  it('cinco fallos seguidos bloquean la cuenta 15 minutos, aun con la contraseña correcta', async () => {
    for (let i = 0; i < 5; i++) {
      await pedirCrudo('/auth/entrar', { correo: SEMILLA.emilio, contrasena: 'equivocada' });
    }
    const r = await pedirCrudo('/auth/entrar', { correo: SEMILLA.emilio, contrasena: 'Nexo-2026' });
    expect(r.statusCode).toBe(401);
    expect(r.json().mensaje).toBe(MENSAJE_CREDENCIALES);
  });

  it('recuperar: misma respuesta exista o no la cuenta; el enlace cambia la contraseña y cierra sesiones', async () => {
    const sesion = cookieDe(await pedirCrudo('/auth/entrar', { correo, contrasena }))!;
    const antes = e.correos.length;
    const r1 = await pedirCrudo('/auth/recuperar', { correo });
    const r2 = await pedirCrudo('/auth/recuperar', { correo: 'nadie@nexo.test' });
    expect(r1.statusCode).toBe(202);
    expect(r1.json()).toEqual(r2.json());
    expect(r1.json().mensaje).toBe(MENSAJE_RECUPERAR);
    expect(e.correos.length).toBe(antes + 1);

    const token = tokenDe(e, correo, '/restablecer')!;
    const nueva = 'Otra-contraseña-2';
    expect((await pedirCrudo('/auth/restablecer', { token, contrasena: 'corta' })).statusCode).toBe(
      400,
    );
    expect((await pedirCrudo('/auth/restablecer', { token, contrasena: nueva })).statusCode).toBe(
      200,
    );
    expect((await pedirCrudo('/auth/restablecer', { token, contrasena: nueva })).statusCode).toBe(
      410,
    );
    expect((await e.pedir(sesion, 'GET', '/yo')).estado).toBe(401);
    expect((await pedirCrudo('/auth/entrar', { correo, contrasena })).statusCode).toBe(401);
    expect((await pedirCrudo('/auth/entrar', { correo, contrasena: nueva })).statusCode).toBe(200);
  });

  it('cambiar la contraseña pide la actual y cierra las demás sesiones', async () => {
    const actual = 'Otra-contraseña-2';
    const a = cookieDe(await pedirCrudo('/auth/entrar', { correo, contrasena: actual }))!;
    const b = cookieDe(await pedirCrudo('/auth/entrar', { correo, contrasena: actual }))!;
    const mal = await e.pedir(a, 'POST', '/auth/contrasena', {
      actual: 'no-es',
      nueva: 'Tercera-clave-3',
    });
    expect(mal.estado).toBe(400);
    const ok = await e.pedir(a, 'POST', '/auth/contrasena', { actual, nueva: 'Tercera-clave-3' });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo.sesiones_cerradas).toBeGreaterThanOrEqual(1);
    expect((await e.pedir(a, 'GET', '/yo')).estado).toBe(200);
    expect((await e.pedir(b, 'GET', '/yo')).estado).toBe(401);
  });

  it('sin sesión no hay cuenta ni cambio de contraseña (401)', async () => {
    expect((await e.pedir(null, 'GET', '/auth/cuenta')).estado).toBe(401);
    expect((await e.pedir(null, 'POST', '/auth/verificacion')).estado).toBe(401);
  });
});
