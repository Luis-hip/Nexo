import { z } from 'zod';

/**
 * Autenticación real (Fase 5.1): cuerpos de las peticiones de registro, inicio de sesión,
 * recuperación y verificación. La web y la API usan los mismos esquemas.
 */

export const MIN_CONTRASENA = 8;
export const MAX_CONTRASENA = 128;

export const esquemaContrasena = z
  .string()
  .min(MIN_CONTRASENA, `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.`)
  .max(MAX_CONTRASENA, `La contraseña admite hasta ${MAX_CONTRASENA} caracteres.`);

const correo = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Escribe un correo válido.'));

/** Token de un enlace (base64url de 32 bytes). */
const token = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/, 'El enlace no es válido.');

/** AUTH-01. */
export const esquemaRegistro = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre (al menos 2 letras).')
    .max(80, 'El nombre admite hasta 80 caracteres.'),
  correo,
  contrasena: esquemaContrasena,
});
export type Registro = z.infer<typeof esquemaRegistro>;

/** AUTH-02. Aquí no se valida el largo: cualquier error se responde igual. */
export const esquemaEntrar = z.object({
  correo,
  contrasena: z.string().min(1, 'Escribe tu contraseña.').max(MAX_CONTRASENA),
});
export type Entrar = z.infer<typeof esquemaEntrar>;

/** AUTH-03. */
export const esquemaRecuperar = z.object({ correo });

/** AUTH-05. */
export const esquemaRestablecer = z.object({ token, contrasena: esquemaContrasena });

/** AUTH-06. */
export const esquemaVerificarCorreo = z.object({ token });

/** PF-02: cambiar la contraseña con la actual. */
export const esquemaCambiarContrasena = z.object({
  actual: z.string().min(1, 'Escribe tu contraseña actual.').max(MAX_CONTRASENA),
  nueva: esquemaContrasena,
});

/** Mensaje único de un inicio de sesión fallido: no dice si el correo existe ni si hay bloqueo. */
export const MENSAJE_CREDENCIALES =
  'El correo o la contraseña no son correctos. Si fallas varias veces seguidas, espera 15 minutos.';

/** Respuesta de «recuperar»: igual exista o no la cuenta. */
export const MENSAJE_RECUPERAR =
  'Si hay una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Vence en 1 hora.';

export interface CuentaAuth {
  correo: string;
  correo_verificado: boolean;
  tiene_contrasena: boolean;
  /** AUTH-07: verificación en dos pasos activa. */
  dos_pasos: boolean;
  sesiones_activas: number;
}

// --- AUTH-07 · Verificación en dos pasos (docs/13, 1.2) -----------------------------------------

/** Código del segundo paso: 6 dígitos de la app o un código de respaldo (XXXX-XXXX). */
export const esquemaCodigoDosPasos = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^(\d{6}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/, 'Escribe los 6 dígitos o un código de respaldo.'),
});
export type CodigoDosPasos = z.infer<typeof esquemaCodigoDosPasos>;

/** Segundo paso del inicio de sesión: el desafío que devolvió «entrar» y el código. */
export const esquemaSegundoPaso = esquemaCodigoDosPasos.extend({
  desafio: z.string().min(20).max(200),
});
export type SegundoPaso = z.infer<typeof esquemaSegundoPaso>;

export interface EstadoDosPasos {
  activa: boolean;
  desde: string | null;
  codigos_restantes: number;
}

/** Al empezar a activar: el secreto (para escribirlo a mano), el enlace otpauth y su QR en SVG. */
export interface InicioDosPasos {
  secreto: string;
  uri: string;
  qr_svg: string;
}

/** Al confirmar o regenerar: los 10 códigos de respaldo, que solo se muestran esta vez. */
export interface CodigosRespaldo {
  estado: EstadoDosPasos;
  codigos: string[];
}

/** Respuesta de «entrar» cuando falta el segundo paso. */
export interface PideDosPasos {
  dos_pasos: true;
  desafio: string;
}
