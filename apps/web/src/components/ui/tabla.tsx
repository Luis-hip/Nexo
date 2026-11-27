import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from './cx';

export interface ColumnaTabla<T> {
  clave: string;
  titulo: string;
  celda: (fila: T) => ReactNode;
  /** Alinea números a la derecha con cifras tabulares. */
  numerica?: boolean;
  className?: string;
  /** Si se da, la columna se puede ordenar con un clic en su encabezado. */
  orden?: (a: T, b: T) => number;
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
  const [orden, setOrden] = useState<{ clave: string; asc: boolean } | null>(null);
  const comparar = orden && columnas.find((c) => c.clave === orden.clave)?.orden;
  const signo = orden?.asc === false ? -1 : 1;
  const ordenadas = comparar ? [...filas].sort((a, b) => signo * comparar(a, b)) : filas;
  const ordenar = (clave: string) =>
    setOrden((o) => (o?.clave === clave ? { clave, asc: !o.asc } : { clave, asc: true }));
  return (
    <div
      data-cmp="cmp/datos/tabla"
      // Con desplazamiento horizontal, el teclado debe poder enfocarla para desplazarla (WCAG 2.1.1).
      tabIndex={0}
      className={cx('overflow-x-auto rounded-[12px] border border-line bg-raised', className)}
    >
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr className="border-b border-line bg-surface text-xs text-muted">
            {columnas.map((c) => {
              const activa = orden?.clave === c.clave;
              const Flecha = !activa ? ArrowUpDown : orden.asc ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.clave}
                  scope="col"
                  aria-sort={activa ? (orden.asc ? 'ascending' : 'descending') : undefined}
                  className={cx(
                    'px-4 py-2.5 font-medium whitespace-nowrap',
                    c.numerica && 'text-right',
                  )}
                >
                  {c.orden ? (
                    <button
                      type="button"
                      onClick={() => ordenar(c.clave)}
                      className={cx(
                        '-mx-1 inline-flex items-center gap-1 rounded-[6px] px-1 hover:text-fg',
                        activa && 'text-fg',
                      )}
                    >
                      {c.titulo}
                      <Flecha className={cx('size-3.5', !activa && 'opacity-50')} aria-hidden />
                    </button>
                  ) : (
                    c.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
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
