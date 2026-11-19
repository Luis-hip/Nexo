import type { FastifyInstance } from 'fastify';
import { ErrorNexo } from './errores';

/**
 * Rutas de los registros (pino) que se ocultan: cabeceras con credenciales y cualquier campo que
 * se llame token, password, secret o clave (docs/09, regla 7). Fastify no registra cuerpos de
 * petición; además, nunca se debe pasar a `log` el cuerpo de un login o de un webhook de WhatsApp.
 */
export const RUTAS_OCULTAS_EN_REGISTROS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'token',
  'password',
  'secret',
  'clave',
  '*.token',
  '*.password',
  '*.secret',
  '*.clave',
  '*.contrasena',
  '*.authorization',
  '*.cookie',
  'body',
  '*.body',
];

const METODOS_QUE_MODIFICAN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Protección adicional contra peticiones falsas entre sitios: en las que modifican datos, si el
 * navegador manda `Origin`, debe ser el del front (`APP_URL`). Sin `Origin` (clientes que no son
 * navegadores) se deja pasar: no llevan la cookie de otra persona.
 */
export function exigirOrigenPermitido(app: FastifyInstance, appUrl: string): void {
  const permitido = new URL(appUrl).origin;
  app.addHook('onRequest', async (req) => {
    if (!METODOS_QUE_MODIFICAN.has(req.method)) return;
    const origen = req.headers.origin;
    if (origen === undefined || origen === permitido) return;
    throw new ErrorNexo(403, 'origen_no_permitido', 'La petición no viene de la aplicación.');
  });
}
