import { mensajeEquipoLleno } from '@nexo/shared';
import { sql } from 'kysely';
import type { z } from 'zod';
import type { Ejecutor } from '../db/conexion';
import { ErrorNexo } from '../errores';

/**
 * Único punto de la API que llama a los procesos de la BD (docs/08, DEC-025).
 * Aquí no hay lógica ni consultas: solo `select proc_x($1, $2, …)`, la validación de la
 * respuesta con Zod y la traducción de los errores de negocio (SQLSTATE NX0xx).
 * Es el único archivo de `src/` (fuera de la conexión y de las pruebas) que importa `kysely`;
 * una regla de ESLint lo hace cumplir.
 */

/** Argumento de un proceso. Los objetos van como JSON (`jsonb`); las listas, como arreglos. */
export type Argumento =
  string | number | boolean | null | undefined | Buffer | readonly string[] | Json;
interface Json {
  json: unknown;
}

/** Marca un valor para enviarlo como `jsonb`. */
export const json = (valor: unknown): Json => ({ json: valor });

const esJson = (a: Argumento): a is Json =>
  typeof a === 'object' && a !== null && !Buffer.isBuffer(a) && !Array.isArray(a) && 'json' in a;

/** SQLSTATE de negocio de los procesos → estado HTTP (catálogo de docs/08, sección 3). */
const ESTADO_HTTP: Record<string, number> = {
  NX001: 409, // equipo lleno
  NX003: 409, // ya usó sus 3 votos de la retrospectiva
  NX004: 403, // voto no permitido
  NX005: 403, // sin permiso
  NX006: 404, // no encontrado
  NX007: 422, // el estado no admite la operación
  NX008: 409, // conflicto de versión
  NX009: 403, // equipo archivado
  NX010: 400, // datos inválidos
  NX011: 410, // ya no disponible (invitación caducada, usada o revocada)
  NX012: 409, // conflicto que no es de versión (ya es miembro, el tablero cambió)
};

interface ErrorPg {
  code?: string;
  message?: string;
  hint?: string;
  detail?: string;
}

/** Convierte un error NX0xx de un proceso en el error de la API; cualquier otro se relanza. */
export function traducirErrorDeProceso(error: unknown): never {
  const e = error as ErrorPg | null;
  const estado = e?.code ? ESTADO_HTTP[e.code] : undefined;
  if (!estado || !e) throw error;
  let detalles: unknown;
  if (e.detail) {
    try {
      detalles = JSON.parse(e.detail);
    } catch {
      detalles = undefined;
    }
  }
  if (e.code === 'NX001') {
    // El tope lo hace cumplir un disparador (0001); el texto para la persona vive en shared.
    const max = (detalles as { max_miembros?: number } | undefined)?.max_miembros ?? 0;
    throw new ErrorNexo(409, 'equipo_lleno', mensajeEquipoLleno(max));
  }
  // El HINT trae el código de la API (p. ej. `tarea_no_encontrada`); el MESSAGE, el texto en español.
  throw new ErrorNexo(
    estado,
    e.hint ?? 'error_de_proceso',
    e.message ?? 'No se pudo completar.',
    detalles,
  );
}

/**
 * Llama a `proc_<dominio>_<accion>` y valida lo que devuelve con el esquema Zod indicado.
 * `nombre` nunca viene del usuario: es un literal escrito en el repositorio.
 */
export async function llamarProceso<T extends z.ZodType>(
  db: Ejecutor,
  nombre: `proc_${string}`,
  argumentos: readonly Argumento[],
  esquema: T,
): Promise<z.infer<T>> {
  const valores = argumentos.map((a) => (esJson(a) ? JSON.stringify(a.json) : (a ?? null)));
  let filas: { r: unknown }[];
  try {
    const lista = valores.length > 0 ? sql.join(valores) : sql``;
    const consulta = sql<{ r: unknown }>`select ${sql.raw(nombre)}(${lista}) as r`;
    filas = (await consulta.execute(db)).rows;
  } catch (error) {
    traducirErrorDeProceso(error);
  }
  return esquema.parse(filas[0]?.r ?? null);
}
