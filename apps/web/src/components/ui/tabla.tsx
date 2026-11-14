import type { ReactNode } from 'react';
import { cx } from './cx';

export interface ColumnaTabla<T> {
  clave: string;
  titulo: string;
  celda: (fila: T) => ReactNode;
  /** Alinea números a la derecha con cifras tabulares. */
  numerica?: boolean;
  className?: string;
}

/**
 * Tabla de datos con encabezado, desplazamiento horizontal en pantallas angostas y estado vacío.
 * El prototipo no traía este componente; se agrega porque lo pide la tarea 1.1 del plan.
 */
export function Tabla<T>({
  columnas,
  filas,
  idFila,
  titulo,
  vacio,
  className,
}: {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  idFila: (fila: T) => string;
  /** Título accesible de la tabla (se anuncia a lectores de pantalla). */
  titulo: string;
  vacio?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-cmp="cmp/datos/tabla"
      className={cx('overflow-x-auto rounded-[12px] border border-line bg-raised', className)}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="border-b border-line bg-surface text-xs text-muted">
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={cx(
                  'px-4 py-2.5 font-medium whitespace-nowrap',
                  c.numerica && 'text-right',
                )}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={idFila(f)} className="border-b border-line last:border-0 hover:bg-surface/60">
              {columnas.map((c) => (
                <td
                  key={c.clave}
                  className={cx('px-4 py-3', c.numerica && 'text-right tabular', c.className)}
                >
                  {c.celda(f)}
                </td>
              ))}
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={columnas.length} className="px-4 py-8 text-center text-muted">
                {vacio ?? 'Sin datos.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
