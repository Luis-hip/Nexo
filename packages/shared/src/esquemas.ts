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

/** Perfil del usuario dentro de un equipo, tal como lo devuelve GET /yo. */
export interface EquipoDeUsuario {
  id: string;
  nombre: string;
  rol: 'lider' | 'integrante' | 'invitado';
  color_idx: number | null;
  caduca_en: string | null;
}

export interface UsuarioSesion {
  id: string;
  correo: string;
  nombre: string;
  cargo: string;
  descripcion: string;
  zona_horaria: string;
  avatar_url: string | null;
}

/** Respuesta de GET /yo. */
export interface Yo {
  usuario: UsuarioSesion;
  equipos: EquipoDeUsuario[];
  preferencias: Preferencias;
}

export const TEMAS = ['sistema', 'claro', 'oscuro'] as const;
export const DENSIDADES = ['comoda', 'compacta'] as const;
export const TAMANOS_TEXTO = ['pequeno', 'normal', 'grande'] as const;
export const IDIOMAS = ['es-MX', 'en-US'] as const;

/** Preferencias de la persona (tabla preferencias_usuario) que usa la web. */
export interface Preferencias {
  tema: (typeof TEMAS)[number];
  densidad: (typeof DENSIDADES)[number];
  tamano_texto: (typeof TAMANOS_TEXTO)[number];
  reducir_movimiento: boolean;
  formato_hora: '24h' | '12h';
  formato_fecha: 'dd/mm' | 'mm/dd';
  tour_visto: boolean;
  idioma: string;
  resumen_diario: boolean;
}

/** Cuerpo de PATCH /yo/preferencias: cualquier subconjunto. */
export const esquemaPreferencias = z
  .object({
    tema: z.enum(TEMAS),
    densidad: z.enum(DENSIDADES),
    tamano_texto: z.enum(TAMANOS_TEXTO),
    reducir_movimiento: z.boolean(),
    formato_hora: z.enum(['24h', '12h']),
    formato_fecha: z.enum(['dd/mm', 'mm/dd']),
    tour_visto: z.boolean(),
    idioma: z.enum(IDIOMAS),
    resumen_diario: z.boolean(),
  })
  .partial();
export type CambiosPreferencias = z.infer<typeof esquemaPreferencias>;

/** Cuerpo de PATCH /yo/perfil. */
export const esquemaPerfil = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(2, 'Escribe tu nombre (al menos 2 caracteres).')
      .max(80, 'El nombre admite hasta 80 caracteres.'),
    cargo: z.string().trim().max(80, 'El cargo admite hasta 80 caracteres.'),
    descripcion: z.string().trim().max(280, 'La descripción admite hasta 280 caracteres.'),
    zona_horaria: z.string().trim().min(1).max(60),
  })
  .partial();
export type CambiosPerfil = z.infer<typeof esquemaPerfil>;

export const TIPOS_CONTACTO = ['duda', 'error', 'sugerencia'] as const;

/** Cuerpo de POST /contacto (formulario público). */
export const esquemaContacto = z.object({
  nombre: z.string().trim().min(1, 'Escribe tu nombre.').max(80, 'Usa 80 caracteres como máximo.'),
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .email('Escribe un correo válido, por ejemplo nombre@dominio.com.'),
  tipo: z.enum(TIPOS_CONTACTO),
  mensaje: z
    .string()
    .trim()
    .min(10, 'Cuéntanos un poco más (mínimo 10 caracteres).')
    .max(4000, 'El mensaje admite hasta 4000 caracteres.'),
});
export type Contacto = z.infer<typeof esquemaContacto>;
