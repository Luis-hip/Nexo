import { describe, expect, it } from 'vitest';
import { cargarConfig } from './config';

const base = { DATABASE_URL: 'postgres://x@localhost/nexo' };

/** Entorno de producción válido con valores inventados que no son los de `.env.example`. */
const produccion = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://nexo_app:pw-de-prueba@bd.interna/nexo',
  SESSION_SECRET: 'a'.repeat(40),
  ENCRYPTION_KEY: 'ab12'.repeat(16),
  APP_URL: 'https://app.ejemplo.test',
  API_URL: 'https://api.ejemplo.test',
};

describe('cargarConfig', () => {
  it('acepta dev login en desarrollo', () => {
    const c = cargarConfig({ ...base, NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true' });
    expect(c.DEV_LOGIN_ENABLED).toBe(true);
  });

  it('se niega a arrancar en producción con DEV_LOGIN_ENABLED=true', () => {
    expect(() => cargarConfig({ ...produccion, DEV_LOGIN_ENABLED: 'true' })).toThrow(
      /no está permitido en producción/,
    );
  });

  it('arranca en producción con todo válido y dev login desactivado (por defecto)', () => {
    expect(cargarConfig(produccion).DEV_LOGIN_ENABLED).toBe(false);
  });

  it('exige DATABASE_URL', () => {
    expect(() => cargarConfig({})).toThrow(/DATABASE_URL/);
  });

  it('en desarrollo no exige secretos', () => {
    expect(() => cargarConfig({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  describe('en producción', () => {
    it.each([
      ['falta SESSION_SECRET', { SESSION_SECRET: undefined }, /falta SESSION_SECRET/],
      ['SESSION_SECRET corto', { SESSION_SECRET: 'corto' }, /al menos 32/],
      [
        'SESSION_SECRET de .env.example',
        { SESSION_SECRET: 'cambia-esto-por-una-cadena-larga-aleatoria' },
        /SESSION_SECRET es el valor de \.env\.example/,
      ],
      ['falta ENCRYPTION_KEY', { ENCRYPTION_KEY: undefined }, /falta ENCRYPTION_KEY/],
      ['ENCRYPTION_KEY que no es hex de 64', { ENCRYPTION_KEY: 'zz'.repeat(32) }, /64 caracteres/],
      [
        'ENCRYPTION_KEY de ceros',
        { ENCRYPTION_KEY: '0'.repeat(64) },
        /ENCRYPTION_KEY es el valor de \.env\.example/,
      ],
      ['falta APP_URL', { APP_URL: undefined }, /falta APP_URL/],
      ['falta API_URL', { API_URL: undefined }, /falta API_URL/],
      ['APP_URL local', { APP_URL: 'http://localhost:5173' }, /APP_URL es el valor local/],
      ['API_URL sin https', { API_URL: 'http://api.ejemplo.test' }, /API_URL debe usar https/],
      [
        'DATABASE_URL de .env.example',
        { DATABASE_URL: 'postgres://nexo:nexo@localhost:5432/nexo' },
        /DATABASE_URL es la de \.env\.example/,
      ],
    ])('se niega a arrancar: %s', (_nombre, cambio, mensaje) => {
      expect(() => cargarConfig({ ...produccion, ...cambio })).toThrow(mensaje);
    });

    it('el mensaje de error nunca incluye el valor del secreto', () => {
      const secreto = 'x'.repeat(10);
      try {
        cargarConfig({ ...produccion, SESSION_SECRET: secreto });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).not.toContain(secreto);
      }
    });
  });
});
