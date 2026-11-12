import { z } from 'zod';

/** Cuerpo de POST /dev/login (solo con DEV_LOGIN_ENABLED=true). */
export const esquemaDevLogin = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
});
export type DevLogin = z.infer<typeof esquemaDevLogin>;

/** Formato único de error de la API. */
export const esquemaErrorApi = z.object({
  codigo: z.string(),
  mensaje: z.string(),
  detalles: z.unknown().optional(),
});
export type ErrorApi = z.infer<typeof esquemaErrorApi>;
