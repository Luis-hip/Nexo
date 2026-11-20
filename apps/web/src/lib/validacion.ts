/**
 * Fase 5.2 · Validación en el cliente con los **mismos** esquemas Zod de `@nexo/shared` que usa la
 * API (la web no depende de Zod directamente: basta con `safeParse`).
 */
export interface Esquema<T> {
  safeParse(
    d: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/** Datos validados o, si fallan, el primer mensaje por campo. */
export function erroresDe<T>(esquema: Esquema<T>, datos: unknown) {
  const r = esquema.safeParse(datos);
  if (r.success) return { datos: r.data, errores: {} as Record<string, string> };
  const errores: Record<string, string> = {};
  for (const i of r.error.issues) {
    const campo = String(i.path[0] ?? '');
    errores[campo] ??= i.message;
  }
  return { datos: null, errores };
}

/** El primer mensaje de error, o `undefined` si los datos son válidos (formularios de un solo aviso). */
export function primerError<T>(esquema: Esquema<T>, datos: unknown): string | undefined {
  const r = esquema.safeParse(datos);
  return r.success ? undefined : r.error.issues[0]?.message;
}
