import { z } from 'zod';
import { MAX_CARACTERES_MENSAJE } from './chat';
import type { PersonaTarea } from './equipos';
import type { Reunion } from './vistas';

/**
 * Pendientes tras la Fase 5 (0032, DEC-037): agenda personal (PER-04), exportar y eliminar mis
 * datos (FALT-09), solicitudes del invitado (DEC-023) y editar mensajes del chat.
 */

/** PER-04: una reunión de alguno de mis equipos, con el equipo al que pertenece. */
export interface ReunionAgenda extends Reunion {
  equipo_id: string;
  equipo_nombre: string;
}

export interface ExportacionDatos {
  exportacion_id: string;
  generada_en: string;
  datos: Record<string, unknown>;
}

export const esquemaEliminarCuenta = z.object({
  contrasena: z.string().min(1, 'Escribe tu contraseña.').max(200),
  confirmacion: z.literal('ELIMINAR', { message: 'Escribe ELIMINAR para confirmar.' }),
});
export type EliminarCuenta = z.input<typeof esquemaEliminarCuenta>;

export const TIPOS_SOLICITUD_INVITADO = ['ampliacion', 'conversion'] as const;
export type TipoSolicitudInvitado = (typeof TIPOS_SOLICITUD_INVITADO)[number];
export const NOMBRE_SOLICITUD_INVITADO: Record<TipoSolicitudInvitado, string> = {
  ampliacion: 'Más días de acceso',
  conversion: 'Ser integrante',
};

export interface SolicitudInvitado {
  id: string;
  tipo: TipoSolicitudInvitado;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  creada_en: string;
  resuelta_en: string | null;
  persona: PersonaTarea | null;
  membresia_id: string | null;
  caduca_en: string | null;
}

export const esquemaCrearSolicitud = z.object({ tipo: z.enum(TIPOS_SOLICITUD_INVITADO) });
export const esquemaResolverSolicitud = z.object({
  aprobar: z.boolean(),
  dias: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
});
export type ResolverSolicitud = z.input<typeof esquemaResolverSolicitud>;

/** PATCH /chat/mensajes/:id: el autor corrige su mensaje. */
export const esquemaEditarMensajeChat = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'Escribe un mensaje.')
    .max(MAX_CARACTERES_MENSAJE, `Máximo ${MAX_CARACTERES_MENSAJE} caracteres.`),
});

/** AD-02: mandar por correo el enlace de una invitación pendiente. */
export const esquemaEnviarInvitacion = z.object({
  correo: z.string().trim().toLowerCase().email('Escribe un correo válido.').max(254),
});
export type EnviarInvitacion = z.input<typeof esquemaEnviarInvitacion>;

/** ONB-02 y PF-01: foto de perfil (PNG, JPEG o WebP, hasta 1 MB); `null` la quita. */
export const MIME_FOTO = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_BYTES_FOTO = 1024 * 1024;
export const esquemaFotoPerfil = z.union([
  z.object({
    mime: z.enum(MIME_FOTO, { message: 'La foto debe ser PNG, JPEG o WebP.' }),
    contenido_base64: z.string().min(1).max(1_400_000, 'La foto debe pesar hasta 1 MB.'),
  }),
  z.null(),
]);
