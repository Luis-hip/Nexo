import { z } from 'zod';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string({ error: 'Falta DATABASE_URL' }).min(1, 'Falta DATABASE_URL'),
  APP_URL: z.url().default('http://localhost:5173'),
  DEV_LOGIN_ENABLED: booleano,
});

export type Config = z.infer<typeof esquemaEntorno>;

/**
 * Lee y valida las variables de entorno.
 * Regla de seguridad (docs/01, sección 8): el servidor se niega a arrancar en producción
 * con DEV_LOGIN_ENABLED=true.
 */
export function cargarConfig(entorno: Record<string, string | undefined> = process.env): Config {
  const r = esquemaEntorno.safeParse(entorno);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  if (r.data.NODE_ENV === 'production' && r.data.DEV_LOGIN_ENABLED) {
    throw new Error(
      'DEV_LOGIN_ENABLED=true no está permitido en producción. El servidor no arranca.',
    );
  }
  return r.data;
}
