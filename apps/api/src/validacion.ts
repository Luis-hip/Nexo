import { puede, type Accion, type ContextoPermiso } from '@nexo/shared';
import { z } from 'zod';
import { ErrorNexo } from './errores';

/** Valida una entrada HTTP con Zod; si falla responde 400 con el detalle por campo. */
export function validar<T extends z.ZodType>(esquema: T, dato: unknown): z.infer<T> {
  const r = esquema.safeParse(dato);
  if (!r.success) {
    throw new ErrorNexo(
      400,
      'validacion',
      r.error.issues[0]?.message ?? 'Datos inválidos.',
      r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    );
  }
  return r.data;
}

/** Guardia de permisos: 403 con el motivo en español de la matriz. */
export function exigirPermiso(accion: Accion, contexto: ContextoPermiso): void {
  const r = puede(accion, contexto);
  if (!r.permitido) throw new ErrorNexo(403, 'sin_permiso', r.motivo);
}

export const esquemaId = z.uuid('El identificador no es válido.');
