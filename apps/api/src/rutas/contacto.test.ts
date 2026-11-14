import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../app';
import { cargarConfig } from '../config';
import { crearBaseDatos, type BaseDatos } from '../db/conexion';

// Pruebas de integración: necesitan una BD migrada y sembrada (`pnpm db:reset`; la CI lo hace).
const DATABASE_URL = process.env.DATABASE_URL;
const CORREO = 'prueba-contacto@nexo.mx';

describe.skipIf(!DATABASE_URL)('POST /contacto', () => {
  let db: BaseDatos;
  let app: FastifyInstance;
  const enviar = (payload: object) => app.inject({ method: 'POST', url: '/contacto', payload });
  const valido = {
    nombre: 'Ana',
    correo: CORREO,
    tipo: 'duda',
    mensaje: 'Tengo una duda sobre Nexo.',
  };

  beforeAll(async () => {
    const config = cargarConfig({ DATABASE_URL, NODE_ENV: 'test' });
    db = crearBaseDatos(config.DATABASE_URL);
    app = await crearApp(config, db);
  });

  afterAll(async () => {
    await db.deleteFrom('contacto_mensajes').where('correo', '=', CORREO).execute();
    await app.close();
    await db.destroy();
  });

  it('guarda el mensaje sin necesidad de sesión', async () => {
    const r = await enviar({ ...valido, correo: `  ${CORREO.toUpperCase()} ` });
    expect(r.statusCode).toBe(201);
    const fila = await db
      .selectFrom('contacto_mensajes')
      .select(['nombre', 'asunto', 'mensaje'])
      .where('correo', '=', CORREO)
      .executeTakeFirst();
    expect(fila).toEqual({ nombre: 'Ana', asunto: 'Duda', mensaje: 'Tengo una duda sobre Nexo.' });
  });

  it('valida correo y longitud del mensaje con mensajes en español', async () => {
    const correo = await enviar({ ...valido, correo: 'no-es-correo' });
    expect(correo.statusCode).toBe(400);
    expect(correo.json().mensaje).toMatch(/correo válido/);
    const corto = await enviar({ ...valido, mensaje: 'Hola' });
    expect(corto.statusCode).toBe(400);
    expect(corto.json().mensaje).toMatch(/mínimo 10 caracteres/);
  });

  it('limita los envíos repetidos (429)', async () => {
    const estados: number[] = [];
    for (let i = 0; i < 6; i++) estados.push((await enviar(valido)).statusCode);
    expect(estados).toContain(429);
    const ultimo = await enviar(valido);
    expect(ultimo.json()).toMatchObject({ codigo: 'demasiadas_peticiones' });
  });
});
