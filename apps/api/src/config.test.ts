import { describe, expect, it } from 'vitest';
import { cargarConfig } from './config';

const base = { DATABASE_URL: 'postgres://x@localhost/nexo' };

describe('cargarConfig', () => {
  it('acepta dev login en desarrollo', () => {
    const c = cargarConfig({ ...base, NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true' });
    expect(c.DEV_LOGIN_ENABLED).toBe(true);
  });

  it('se niega a arrancar en producción con DEV_LOGIN_ENABLED=true', () => {
    expect(() =>
      cargarConfig({ ...base, NODE_ENV: 'production', DEV_LOGIN_ENABLED: 'true' }),
    ).toThrow(/no está permitido en producción/);
  });

  it('arranca en producción con dev login desactivado (por defecto)', () => {
    expect(cargarConfig({ ...base, NODE_ENV: 'production' }).DEV_LOGIN_ENABLED).toBe(false);
  });

  it('exige DATABASE_URL', () => {
    expect(() => cargarConfig({})).toThrow(/DATABASE_URL/);
  });
});
