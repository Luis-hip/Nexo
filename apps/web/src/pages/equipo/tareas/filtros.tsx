import type { Miembro as MiembroEquipo, PrioridadTarea, TareaEquipo } from '@nexo/shared';
import { SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Boton, Campo, Popover, Selector, cx } from '@/components/ui';
import { plazoDe, PRIORIDADES, type Plazo } from '@/lib/tareas';

/**
 * Filtro unificado de tareas (retroalimentación, bloque 5b): un solo botón «Filtros» con
 * Responsable, Prioridad y Plazo en un panel, el contador de activos y un chip por filtro que se
 * quita con un clic. Lo usan el Tablero y la Lista; cada vista guarda su propio estado.
 */
export interface FiltrosTarea {
  responsable: string;
  prioridad: '' | PrioridadTarea;
  plazo: '' | Plazo;
}

export const SIN_FILTROS_TAREA: FiltrosTarea = { responsable: '', prioridad: '', plazo: '' };

export const NOMBRE_PLAZO: Record<Plazo, string> = {
  a_tiempo: 'A tiempo',
  con_retraso: 'Con retraso',
  vencida: 'Vencida',
};

export const cuantosFiltros = (f: FiltrosTarea) =>
  [f.responsable, f.prioridad, f.plazo].filter(Boolean).length;

export function aplicarFiltros(tareas: TareaEquipo[], f: FiltrosTarea): TareaEquipo[] {
  return tareas.filter(
    (t) =>
      (!f.responsable || t.responsable?.usuario_id === f.responsable) &&
      (!f.prioridad || t.prioridad === f.prioridad) &&
      (!f.plazo || plazoDe(t) === f.plazo),
  );
}

type Miembro = Pick<MiembroEquipo, 'usuario_id' | 'nombre' | 'rol'>;

export function FiltrosTareas({
  valor,
  onCambiar,
  miembros,
  usuarioId,
}: {
  valor: FiltrosTarea;
  onCambiar: (f: FiltrosTarea) => void;
  miembros: Miembro[];
  usuarioId: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLButtonElement>(null);
  const n = cuantosFiltros(valor);
  const responsables = miembros.filter((m) => m.rol !== 'invitado');
  const nombreResponsable = (id: string) =>
    id === usuarioId ? 'Yo' : (responsables.find((m) => m.usuario_id === id)?.nombre ?? 'Alguien');
  const cambiar = (c: Partial<FiltrosTarea>) => onCambiar({ ...valor, ...c });

  const chips: { clave: keyof FiltrosTarea; texto: string }[] = [
    valor.responsable && {
      clave: 'responsable' as const,
      texto: `Responsable: ${nombreResponsable(valor.responsable)}`,
    },
    valor.prioridad && {
      clave: 'prioridad' as const,
      texto: `Prioridad: ${PRIORIDADES[valor.prioridad]}`,
    },
    valor.plazo && { clave: 'plazo' as const, texto: `Plazo: ${NOMBRE_PLAZO[valor.plazo]}` },
  ].filter((c): c is { clave: keyof FiltrosTarea; texto: string } => !!c);

  return (
    <>
      <Boton
        ref={ancla}
        tamano="sm"
        className={cx('h-10', n > 0 && 'border-brand')}
        icono={<SlidersHorizontal className="size-4" />}
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        data-cmp="cmp/tareas/filtros"
      >
        Filtros
        {n > 0 && (
          <span className="tabular">
            {' · '}
            {n}
            <span className="sr-only"> {n === 1 ? 'activo' : 'activos'}</span>
          </span>
        )}
      </Boton>
      {chips.length > 0 && (
        <ul className="contents" aria-label="Filtros activos">
          {chips.map((c) => (
            <li key={c.clave}>
              <button
                type="button"
                onClick={() => cambiar({ [c.clave]: '' })}
                aria-label={`Quitar filtro ${c.texto}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand bg-brand/10 px-3 text-sm font-medium whitespace-nowrap text-fg hover:bg-brand/15"
              >
                {c.texto}
                <X className="size-3.5 text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Popover
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        anclaRef={ancla}
        etiqueta="Filtros de tareas"
        ancho={320}
        alinear="inicio"
      >
        <div className="space-y-4 p-4">
          <p className="text-sm font-semibold">Filtros</p>
          <Campo etiqueta="Responsable">
            <Selector
              autoFocus
              value={valor.responsable}
              onChange={(e) => cambiar({ responsable: e.target.value })}
            >
              <option value="">Cualquier responsable</option>
              {responsables.map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.usuario_id === usuarioId ? `Yo (${m.nombre})` : m.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Prioridad">
            <Selector
              value={valor.prioridad}
              onChange={(e) => cambiar({ prioridad: e.target.value as FiltrosTarea['prioridad'] })}
            >
              <option value="">Cualquier prioridad</option>
              {(Object.keys(PRIORIDADES) as PrioridadTarea[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADES[p]}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Plazo">
            <Selector
              value={valor.plazo}
              onChange={(e) => cambiar({ plazo: e.target.value as FiltrosTarea['plazo'] })}
            >
              <option value="">Cualquier plazo</option>
              {(Object.keys(NOMBRE_PLAZO) as Plazo[]).map((p) => (
                <option key={p} value={p}>
                  {NOMBRE_PLAZO[p]}
                </option>
              ))}
            </Selector>
          </Campo>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <Boton
              variante="texto"
              tamano="sm"
              disabled={n === 0}
              onClick={() => onCambiar(SIN_FILTROS_TAREA)}
            >
              Limpiar filtros
            </Boton>
            <Boton
              variante="primario"
              tamano="sm"
              onClick={() => {
                setAbierto(false);
                ancla.current?.focus();
              }}
            >
              Listo
            </Boton>
          </div>
        </div>
      </Popover>
    </>
  );
}
