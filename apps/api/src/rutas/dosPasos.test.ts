import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cifrar, descifrar } from '../cifrado';
import { crearEntorno, DATABASE_URL, type Entorno } from '../pruebas/ayudas';
import { COOKIE_SESION } from '../sesiones';
import { base32, codigoEnPaso, pasoActual, pasoValido, uriOtpauth } from '../totp';

/** AUTH-07 · Verificación en dos pasos (docs/13, 1.2; migración 0037). */
describe('TOTP y cifrado', () => {
  it('RFC 6238: el vector de prueba de SHA-1 da 287082 en t = 59 s', () => {
    const secreto = base32(Buffer.from('12345678901234567890'));
    expect(secreto).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(codigoEnPaso(secreto, 1)).toBe('287082');
    expect(pasoValido(secreto, '287082', 59_000)).toBe(1);
    expect(pasoValido(secreto, '287082', 59_000 + 120_000)).toBeNull();
    expect(pasoValido(secreto, '12345', 59_000)).toBeNull();
  });

  it('el enlace otpauth lleva emisor, cuenta y secreto', () => {
    expect(uriOtpauth('ABC', 'ana@nexo.test')).toBe(
      'otpauth://totp/Nexo%3Aana%40nexo.test?secret=ABC&issuer=Nexo&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('AES-256-GCM: ida y vuelta; un cambio en el texto cifrado se detecta', () => {
    const config = { ENCRYPTION_KEY: 'ab12'.repeat(16), NODE_ENV: 'test' as const };
    const c = cifrar(config, 'SECRETO');
    expect(c).not.toContain('SECRETO');
    expect(descifrar(config, c)).toBe('SECRETO');
    const roto = c.slice(0, -2) + (c.endsWith('A') ? 'BB' : 'AA');
    expect(() => descifrar(config, roto)).toThrow();
  });
});

describe.skipIf(!DATABASE_URL)('verificación en dos pasos por la API', () => {
  let e: Entorno;
  const correo = `dos-pasos-${Date.now()}@nexo.test`;
  const contrasena = 'Contraseña-segura-1';
  let cookie: Record<string, string> | null = null;
  let secreto = '';
  let respaldo: string[] = [];

  beforeAll(async () => {
    e = await crearEntorno();
  });
  afterAll(async () => {
    await e.db.deleteFrom('usuarios').where('correo', 'like', 'dos-pasos-%@nexo.test').execute();
    await e.cerrar();
  });

  const post = (url: string, payload?: object, cookies?: Record<string, string> | null) =>
    e.app.inject({ method: 'POST', url, payload, cookies: cookies ?? undefined });
  const cookieDe = (r: Awaited<ReturnType<typeof post>>) => {
    const c = r.cookies.find((x) => x.name === COOKIE_SESION);
    return c ? { [COOKIE_SESION]: c.value } : null;
  };

  it('activar: QR y secreto; un código malo no activa; el bueno entrega 10 códigos de respaldo', async () => {
    const r = await post('/auth/registro', { nombre: 'Dos Pasos', correo, contrasena });
    cookie = cookieDe(r);
    expect((await e.pedir(cookie, 'GET', '/auth/2fa')).cuerpo).toMatchObject({ activa: false });
    const ini = await e.pedir(cookie, 'POST', '/auth/2fa/iniciar');
    expect(ini.estado).toBe(200);
    expect(ini.cuerpo.qr_svg).toContain('<svg');
    expect(ini.cuerpo.uri).toContain(`secret=${ini.cuerpo.secreto}`);
    secreto = ini.cuerpo.secreto;
    // En la BD solo queda cifrado.
    const fila = await e.db
      .selectFrom('credenciales_2fa')
      .innerJoin('usuarios', 'usuarios.id', 'credenciales_2fa.usuario_id')
      .select('secreto_cifrado')
      .where('usuarios.correo', '=', correo)
      .executeTakeFirstOrThrow();
    expect(fila.secreto_cifrado).not.toContain(secreto);
    const malo = await e.pedir(cookie, 'POST', '/auth/2fa/confirmar', { codigo: '000000' });
    expect(malo.estado).toBe(400);
    const ok = await e.pedir(cookie, 'POST', '/auth/2fa/confirmar', {
      codigo: codigoEnPaso(secreto, pasoActual()),
    });
    expect(ok.estado, JSON.stringify(ok.cuerpo)).toBe(200);
    expect(ok.cuerpo.estado).toMatchObject({ activa: true, codigos_restantes: 10 });
    respaldo = ok.cuerpo.codigos;
    expect(respaldo).toHaveLength(10);
    expect(respaldo[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect((await e.pedir(cookie, 'GET', '/auth/cuenta')).cuerpo.dos_pasos).toBe(true);
  });

  it('entrar con contraseña pide el segundo paso; sin él no hay sesión', async () => {
    const r = await post('/auth/entrar', { correo, contrasena });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ dos_pasos: true });
    expect(cookieDe(r)).toBeNull();
    const desafio = r.json().desafio as string;
    const mal = await post('/auth/2fa', { desafio, codigo: '000000' });
    expect(mal.statusCode).toBe(401);
    expect(mal.json().mensaje).toMatch(/Te quedan 4 intentos/);
    // El código ya usado al confirmar no sirve otra vez; el de respaldo sí, y una sola vez.
    const ok = await post('/auth/2fa', { desafio, codigo: respaldo[0]!.toLowerCase() });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(cookieDe(ok)).not.toBeNull();
    expect((await post('/auth/2fa', { desafio, codigo: respaldo[1] })).statusCode).toBe(410);
    const otra = await post('/auth/entrar', { correo, contrasena });
    const repetido = await post('/auth/2fa', { desafio: otra.json().desafio, codigo: respaldo[0] });
    expect(repetido.statusCode).toBe(401);
  });

  it('desactivar pide un código válido; después se entra solo con la contraseña', async () => {
    expect(
      (await e.pedir(cookie, 'POST', '/auth/2fa/desactivar', { codigo: 'ZZZZ-ZZZZ' })).estado,
    ).toBe(400);
    const ok = await e.pedir(cookie, 'POST', '/auth/2fa/desactivar', { codigo: respaldo[2] });
    expect(ok.estado).toBe(200);
    expect(ok.cuerpo.activa).toBe(false);
    const r = await post('/auth/entrar', { correo, contrasena });
    expect(cookieDe(r)).not.toBeNull();
  });

  it('sin sesión no se activa ni se consulta (401)', async () => {
    expect((await e.pedir(null, 'GET', '/auth/2fa')).estado).toBe(401);
    expect((await e.pedir(null, 'POST', '/auth/2fa/iniciar')).estado).toBe(401);
  });
});
