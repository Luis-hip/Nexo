import { z } from 'zod';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/** Variable opcional; vacía (`CLAVE=` en `.env.example`) cuenta como ausente. */
const textoOpcional = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());

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
  /**
   * Fase 5 · correos de la autenticación (verificar correo, restablecer contraseña).
   * `consola`: los escribe en el registro (solo desarrollo y pruebas: llevan enlaces con token).
   * `resend`: los envía con Resend (necesita RESEND_API_KEY). `ninguno`: no envía nada.
   * Sin valor: `consola` fuera de producción; en producción `resend` si hay clave y si no `ninguno`.
   */
  CORREO_PROVEEDOR: z.enum(['consola', 'resend', 'ninguno']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  CORREO_REMITENTE: z.string().min(3).default('Nexo <no-responder@nexo.lol>'),
  /**
   * Fase 4 · WhatsApp (DEC-WA-1). `simulado`: ningún aviso sale del servidor (se marcan como
   * enviados con un id «sim-…»). `real`: usa la API Cloud de Meta con las cuatro variables de abajo.
   * Activar `real` envía mensajes de verdad: pide la decisión del equipo (docs/01, punto 14).
   */
  WHATSAPP_PROVIDER: z.enum(['simulado', 'real']).default('simulado'),
  WHATSAPP_TOKEN: textoOpcional,
  WHATSAPP_PHONE_ID: textoOpcional,
  WHATSAPP_APP_SECRET: textoOpcional,
  WHATSAPP_VERIFY_TOKEN: textoOpcional,
  /** URL base de la API Graph de Meta. Solo se cambia en pruebas (un servidor que imita a Meta). */
  WHATSAPP_API_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  /** Plantilla aprobada para mensajes fuera de la ventana de 24 h (DEC-WA-2) y su idioma. */
  WHATSAPP_PLANTILLA: z.string().min(1).default('hello_world'),
  WHATSAPP_PLANTILLA_IDIOMA: z.string().min(2).default('en_US'),
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
  // Los correos llevan enlaces con token: nunca deben ir al registro de producción.
  if (c.CORREO_PROVEEDOR === 'consola') problemas.push('CORREO_PROVEEDOR=consola no se permite');
  if (c.CORREO_PROVEEDOR === 'resend' && !c.RESEND_API_KEY) problemas.push('falta RESEND_API_KEY');
  if (c.WHATSAPP_PROVIDER === 'real') {
    for (const k of [
      'WHATSAPP_TOKEN',
      'WHATSAPP_PHONE_ID',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_VERIFY_TOKEN',
    ] as const) {
      if (!c[k]) problemas.push(`falta ${k} (WHATSAPP_PROVIDER=real)`);
    }
  }
  // El token de Meta solo viaja a Meta.
  if (!c.WHATSAPP_API_URL.startsWith('https://graph.facebook.com/')) {
    problemas.push('WHATSAPP_API_URL debe ser la API de Meta (https://graph.facebook.com/…)');
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
