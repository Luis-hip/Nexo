import { z } from 'zod';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** Valores de `.env.example`: sirven en local y nunca deben llegar a producción (docs/09). */
const VALOR_EJEMPLO_SESSION = /cambia-esto/i;
const CLAVE_EJEMPLO_CEROS = /^0{64}$/;
const URL_BD_EJEMPLO = /^postgres(?:ql)?:\/\/nexo:nexo@/;
const URLS_LOCALES_EJEMPLO = new Set(['http://localhost:5173', 'http://localhost:3000']);

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string({ error: 'Falta DATABASE_URL' }).min(1, 'Falta DATABASE_URL'),
  /** Cadena del rol `nexo_migraciones` (solo migraciones; la API no la usa). */
  DATABASE_URL_MIGRACIONES: z.string().min(1).optional(),
  SESSION_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  APP_URL: z.url().default('http://localhost:5173'),
  API_URL: z.url().default('http://localhost:3000'),
  DEV_LOGIN_ENABLED: booleano,
});

export type Config = z.infer<typeof esquemaEntorno>;

/** Revisa los secretos y las URL de producción; devuelve la lista de problemas. */
function problemasDeProduccion(entorno: Record<string, string | undefined>, c: Config): string[] {
  const problemas: string[] = [];

  const sesion = c.SESSION_SECRET;
  if (!sesion) problemas.push('falta SESSION_SECRET');
  else if (sesion.length < 32) problemas.push('SESSION_SECRET debe tener al menos 32 caracteres');
  else if (VALOR_EJEMPLO_SESSION.test(sesion)) {
    problemas.push('SESSION_SECRET es el valor de .env.example');
  }

  const clave = c.ENCRYPTION_KEY;
  if (!clave) problemas.push('falta ENCRYPTION_KEY');
  else if (!/^[0-9a-fA-F]{64}$/.test(clave)) {
    problemas.push('ENCRYPTION_KEY debe tener 64 caracteres hexadecimales (32 bytes)');
  } else if (CLAVE_EJEMPLO_CEROS.test(clave)) {
    problemas.push('ENCRYPTION_KEY es el valor de .env.example');
  }

  // Sin valor por omisión en producción: deben venir del entorno y ser HTTPS.
  for (const nombre of ['APP_URL', 'API_URL'] as const) {
    const crudo = entorno[nombre];
    if (!crudo) problemas.push(`falta ${nombre}`);
    else if (URLS_LOCALES_EJEMPLO.has(crudo.replace(/\/$/, ''))) {
      problemas.push(`${nombre} es el valor local de .env.example`);
    } else if (!crudo.startsWith('https://')) problemas.push(`${nombre} debe usar https`);
  }

  if (URL_BD_EJEMPLO.test(c.DATABASE_URL)) {
    problemas.push('DATABASE_URL es la de .env.example');
  }
  return problemas;
}

/**
 * Lee y valida las variables de entorno.
 * Reglas de seguridad (docs/01 sección 8 y docs/09): en producción el servidor se niega a arrancar
 * con DEV_LOGIN_ENABLED=true, con secretos ausentes o débiles, o con los valores de `.env.example`.
 * Los mensajes nombran la variable, nunca su valor.
 */
export function cargarConfig(entorno: Record<string, string | undefined> = process.env): Config {
  const r = esquemaEntorno.safeParse(entorno);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  if (r.data.NODE_ENV === 'production') {
    if (r.data.DEV_LOGIN_ENABLED) {
      throw new Error(
        'DEV_LOGIN_ENABLED=true no está permitido en producción. El servidor no arranca.',
      );
    }
    const problemas = problemasDeProduccion(entorno, r.data);
    if (problemas.length > 0) {
      throw new Error(`Configuración insegura para producción: ${problemas.join('; ')}.`);
    }
  }
  return r.data;
}
