const BASE: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Error de la API con el formato único { codigo, mensaje, detalles? }. */
export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
  }
}

/** Mensaje para mostrar a la persona a partir de cualquier error. */
export function mensajeDeError(e: unknown): string {
  return e instanceof ErrorApi ? e.message : 'Ocurrió un error inesperado.';
}

interface Opciones {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  cuerpo?: unknown;
  consulta?: Record<string, string | string[] | undefined>;
}

/** Llama a la API de Nexo con la cookie de sesión. Lanza `ErrorApi` si la respuesta no es 2xx. */
export async function api<T>(ruta: string, { metodo = 'GET', cuerpo, consulta }: Opciones = {}) {
  const url = new URL(ruta, BASE);
  for (const [k, v] of Object.entries(consulta ?? {})) {
    for (const valor of Array.isArray(v) ? v : v === undefined ? [] : [v]) {
      url.searchParams.append(k, valor);
    }
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      credentials: 'include',
      headers: cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'sin_conexion', 'No pudimos comunicarnos con Nexo. Revisa tu conexión.');
  }

  if (respuesta.status === 204) return undefined as T;
  const datos: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const e = datos as { codigo?: string; mensaje?: string; detalles?: unknown } | null;
    throw new ErrorApi(
      respuesta.status,
      e?.codigo ?? 'error',
      e?.mensaje ?? 'Ocurrió un error inesperado.',
      e?.detalles,
    );
  }
  return datos as T;
}
