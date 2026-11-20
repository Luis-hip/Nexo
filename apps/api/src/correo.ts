import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config';

/**
 * Envío de correos de la autenticación (Fase 5.1, DEC-AUTH-1). Tres proveedores:
 *  - `consola`: escribe el correo en el registro de la API (desarrollo y pruebas; nunca producción,
 *    porque los enlaces llevan un token de un solo uso).
 *  - `resend`: lo envía con la API HTTP de Resend (https://resend.com/docs/api-reference).
 *  - `ninguno`: no envía nada y deja un aviso sin el contenido.
 * Un fallo de envío nunca rompe la petición: se registra y la persona puede pedir otro enlace.
 */
export interface MensajeCorreo {
  para: string;
  asunto: string;
  texto: string;
}

export interface Correo {
  readonly proveedor: 'consola' | 'resend' | 'ninguno' | 'memoria';
  enviar(m: MensajeCorreo): Promise<void>;
}

export function proveedorCorreo(c: Config): 'consola' | 'resend' | 'ninguno' {
  if (c.CORREO_PROVEEDOR) return c.CORREO_PROVEEDOR;
  if (c.NODE_ENV !== 'production') return 'consola';
  return c.RESEND_API_KEY ? 'resend' : 'ninguno';
}

export function crearCorreo(c: Config, log: FastifyBaseLogger): Correo {
  const proveedor = proveedorCorreo(c);
  if (proveedor === 'consola') {
    return {
      proveedor,
      async enviar(m) {
        // Solo fuera de producción (config.ts lo impide en producción).
        log.info({ correo: { para: m.para, asunto: m.asunto } }, `Correo (consola):\n${m.texto}`);
      },
    };
  }
  if (proveedor === 'resend') {
    return {
      proveedor,
      async enviar(m) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${c.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: c.CORREO_REMITENTE,
            to: [m.para],
            subject: m.asunto,
            text: m.texto,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) throw new Error(`Resend respondió ${r.status}`);
      },
    };
  }
  return {
    proveedor,
    async enviar(m) {
      log.warn({ asunto: m.asunto }, 'Correo no enviado: no hay proveedor de correo configurado.');
    },
  };
}

/** Bandeja en memoria para las pruebas: guarda cada correo en `enviados`. */
export function correoEnMemoria(): Correo & { enviados: MensajeCorreo[] } {
  const enviados: MensajeCorreo[] = [];
  return {
    proveedor: 'memoria',
    enviados,
    async enviar(m) {
      enviados.push(m);
    },
  };
}
