import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { exigirOrigenPermitido, RUTAS_OCULTAS_EN_REGISTROS } from './seguridad';
import { ErrorNexo } from './errores';

describe('registros con redacción', () => {
  it('no escribe cookies, tokens, contraseñas ni secretos', async () => {
    const lineas: string[] = [];
    const app = Fastify({
      logger: {
        level: 'info',
        redact: RUTAS_OCULTAS_EN_REGISTROS,
        stream: { write: (l: string) => void lineas.push(l) },
      },
    });
    app.log.info({
      req: {
        headers: { cookie: 'sesion=VALOR-SECRETO-1', authorization: 'Bearer VALOR-SECRETO-2' },
      },
      res: { headers: { 'set-cookie': 'sesion=VALOR-SECRETO-3' } },
      token: 'VALOR-SECRETO-4',
      usuario: { password: 'VALOR-SECRETO-5', clave: 'VALOR-SECRETO-6', token: 'VALOR-SECRETO-7' },
      config: { secret: 'VALOR-SECRETO-8' },
      body: { contrasena: 'VALOR-SECRETO-9' },
    });
    await app.close();
    const salida = lineas.join('');
    expect(salida).toContain('[Redacted]');
    expect(salida).not.toMatch(/VALOR-SECRETO/);
  });
});

describe('comprobación del encabezado Origin', () => {
  async function crear() {
    const app = Fastify();
    exigirOrigenPermitido(app, 'https://app.ejemplo.test');
    app.setErrorHandler((e, _req, res) =>
      res.status(e instanceof ErrorNexo ? e.estado : 500).send({ codigo: (e as ErrorNexo).codigo }),
    );
    app.post('/x', async () => ({ ok: true }));
    app.get('/x', async () => ({ ok: true }));
    return app;
  }

  it('deja pasar el origen del front y las peticiones sin Origin', async () => {
    const app = await crear();
    const conOrigen = await app.inject({
      method: 'POST',
      url: '/x',
      headers: { origin: 'https://app.ejemplo.test' },
    });
    expect(conOrigen.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/x' })).statusCode).toBe(200);
  });

  it('rechaza con 403 un POST desde otro origen', async () => {
    const app = await crear();
    const r = await app.inject({
      method: 'POST',
      url: '/x',
      headers: { origin: 'https://sitio-malo.test' },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe('origen_no_permitido');
  });

  it('no revisa las lecturas (GET)', async () => {
    const app = await crear();
    const r = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { origin: 'https://otro.test' },
    });
    expect(r.statusCode).toBe(200);
  });
});
