import type { ErrorApi } from '@nexo/shared';

/** Error de aplicación con el formato único { codigo, mensaje, detalles? }. */
export class ErrorNexo extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
  }

  aJson(): ErrorApi {
    return {
      codigo: this.codigo,
      mensaje: this.message,
      ...(this.detalles === undefined ? {} : { detalles: this.detalles }),
    };
  }
}
