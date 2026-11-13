import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, MoreHorizontal, Info } from 'lucide-react';
import { cx } from './cx';

type Variante = 'primario' | 'secundario' | 'texto' | 'destructivo' | 'fantasma';

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: 'sm' | 'md' | 'lg';
  icono?: ReactNode;
  iconoDer?: ReactNode;
  cargando?: boolean;
  /** Si se indica y el botón está deshabilitado, explica por qué. */
  motivo?: string;
  bloque?: boolean;
}

const VAR: Record<Variante, string> = {
  primario: 'bg-brand text-on-brand hover:brightness-110 active:brightness-95 shadow-soft',
  secundario: 'bg-raised text-fg border border-line-strong/60 hover:bg-surface active:bg-line',
  texto: 'text-brand hover:bg-brand/10 active:bg-brand/15',
  destructivo: 'bg-danger text-white hover:brightness-110 active:brightness-95 dark:text-canvas',
  fantasma: 'text-fg hover:bg-surface active:bg-line',
};

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  {
    variante = 'secundario',
    tamano = 'md',
    icono,
    iconoDer,
    cargando,
    motivo,
    bloque,
    className,
    children,
    disabled,
    type = 'button',
    ...r
  },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      data-cmp={`cmp/acciones/boton-${variante}`}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      aria-describedby={disabled && motivo ? undefined : r['aria-describedby']}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[8px] font-medium whitespace-nowrap transition-[background,filter,color,box-shadow] duration-150 select-none',
        'disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none',
        tamano === 'sm'
          ? 'h-9 min-h-9 px-3 text-sm'
          : tamano === 'lg'
            ? 'h-12 px-6 text-base'
            : 'h-11 px-4 text-sm',
        bloque && 'w-full',
        VAR[variante],
        className,
      )}
      {...r}
    >
      {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icono}
      {children}
      {iconoDer}
    </button>
  );
  if (disabled && motivo)
    return (
      <ConMotivo motivo={motivo} bloque={bloque}>
        {btn}
      </ConMotivo>
    );
  return btn;
});

/** Envuelve un control deshabilitado para explicar el motivo (foco y toque). */
export function ConMotivo({
  motivo,
  children,
  bloque,
}: {
  motivo: string;
  children: ReactNode;
  bloque?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <span
      className={cx('relative inline-flex', bloque && 'w-full')}
      tabIndex={0}
      aria-describedby={id}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
      onFocus={() => setAbierto(true)}
      onBlur={() => setAbierto(false)}
      onClick={() => setAbierto((v) => !v)}
    >
      <span className={cx('pointer-events-none', bloque && 'w-full [&>*]:w-full')}>{children}</span>
      <span
        id={id}
        role="tooltip"
        className={
          abierto
            ? 'anim-fade absolute bottom-full left-1/2 z-50 mb-2 block w-max max-w-[min(260px,80vw)] -translate-x-1/2 rounded-[8px] bg-fg px-3 py-2 text-xs leading-snug text-canvas shadow-modal'
            : 'sr-only'
        }
      >
        <Info className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
        {motivo}
      </span>
    </span>
  );
}

export const BotonIcono = forwardRef<
  HTMLButtonElement,
  BotonProps & { etiqueta: string; contador?: number }
>(function BotonIcono(
  {
    etiqueta,
    contador,
    className,
    variante = 'fantasma',
    tamano = 'md',
    children,
    icono,
    motivo,
    disabled,
    ...r
  },
  ref,
) {
  const b = (
    <button
      ref={ref}
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      data-cmp="cmp/acciones/boton-icono"
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center rounded-[8px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
        tamano === 'sm' ? 'size-9' : 'size-11',
        VAR[variante],
        className,
      )}
      {...r}
    >
      {icono ?? children}
      {!!contador && (
        <span
          className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white tabular ring-2 ring-canvas dark:text-canvas"
          aria-hidden
        >
          {contador > 99 ? '99+' : contador}
        </span>
      )}
    </button>
  );
  return disabled && motivo ? <ConMotivo motivo={motivo}>{b}</ConMotivo> : b;
});

export function Tarjeta({
  className,
  children,
  as: As = 'div',
  ...r
}: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li' } & Record<
  string,
  unknown
>) {
  return (
    <As
      data-cmp="cmp/datos/tarjeta"
      className={cx('rounded-[12px] border border-line bg-raised', className)}
      {...r}
    >
      {children}
    </As>
  );
}

export type Tono = 'neutro' | 'marca' | 'ok' | 'warn' | 'danger' | 'info';
const TONO: Record<Tono, string> = {
  neutro: 'bg-surface text-muted border-line',
  marca: 'bg-brand/10 text-brand border-brand/25',
  ok: 'bg-ok/10 text-ok-text border-ok/30',
  warn: 'bg-warn/12 text-warn-text border-warn/35',
  danger: 'bg-danger/10 text-danger-text border-danger/30',
  info: 'bg-info/10 text-info-text border-info/30',
};

export function Insignia({
  tono = 'neutro',
  icono,
  children,
  className,
}: {
  tono?: Tono;
  icono?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-cmp="cmp/identidad/insignia"
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap',
        TONO[tono],
        className,
      )}
    >
      {icono}
      {children}
    </span>
  );
}

export function Chip({
  activo,
  onClick,
  children,
  icono,
  className,
  ...r
}: {
  activo?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icono?: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors',
        activo
          ? 'border-brand bg-brand/10 text-fg font-medium'
          : 'border-line bg-raised text-muted hover:text-fg hover:bg-surface',
        className,
      )}
      {...r}
    >
      {icono}
      {children}
    </button>
  );
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
  className,
  tamano = 'md',
}: {
  opciones: { valor: T; etiqueta: ReactNode; contador?: number; icono?: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
  className?: string;
  tamano?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      data-cmp="cmp/acciones/segmented"
      className={cx(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-[10px] bg-surface p-1 scrollbar-none',
        className,
      )}
    >
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cx(
            'inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3 font-medium whitespace-nowrap transition-colors',
            tamano === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm',
            valor === o.valor ? 'bg-raised text-fg shadow-soft' : 'text-muted hover:text-fg',
          )}
        >
          {o.icono}
          {o.etiqueta}
          {o.contador !== undefined && o.contador > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] text-on-brand tabular">
              {o.contador}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Pestanas<T extends string>({
  pestanas,
  valor,
  onChange,
  etiqueta,
  className,
}: {
  pestanas: { valor: T; etiqueta: ReactNode; contador?: number }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      data-cmp="cmp/acciones/pestanas"
      className={cx('flex gap-1 overflow-x-auto border-b border-line scrollbar-none', className)}
    >
      {pestanas.map((p) => (
        <button
          key={p.valor}
          role="tab"
          type="button"
          aria-selected={valor === p.valor}
          onClick={() => onChange(p.valor)}
          className={cx(
            '-mb-px inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
            valor === p.valor
              ? 'border-brand text-fg'
              : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {p.etiqueta}
          {!!p.contador && (
            <span className="rounded-full bg-surface px-1.5 text-xs text-muted tabular">
              {p.contador}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export interface ItemMenu {
  etiqueta: string;
  icono?: ReactNode;
  onClick?: () => void;
  destructivo?: boolean;
  deshabilitado?: boolean;
  motivo?: string;
  separador?: boolean;
  oculto?: boolean;
}

export function Menu({
  items,
  etiqueta = 'Más acciones',
  disparador,
  alinear = 'der',
  className,
}: {
  items: ItemMenu[];
  etiqueta?: string;
  disparador?: (p: {
    abrir: () => void;
    abierto: boolean;
    ref: React.Ref<HTMLButtonElement>;
  }) => ReactNode;
  alinear?: 'izq' | 'der';
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; right: number; arriba: boolean }>({
    top: 0,
    left: 0,
    right: 0,
    arriba: false,
  });
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visibles = items.filter((i) => !i.oculto);
  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r)
      setPos({
        top: r.bottom + 4,
        left: r.left,
        right: window.innerWidth - r.right,
        arriba: r.bottom > window.innerHeight - 280,
      });
    setAbierto((v) => !v);
  };
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !ref.current?.contains(e.target as Node))
        setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        ref.current?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = [
          ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
        ];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', () => setAbierto(false), { once: true, capture: true });
    setTimeout(
      () => menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(),
      10,
    );
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);
  if (!visibles.length) return null;
  return (
    <>
      {disparador ? (
        // justificado: el disparador solo adjunta la ref a su botón, no la lee al renderizar.
        // eslint-disable-next-line react-hooks/refs
        disparador({ abrir, abierto, ref })
      ) : (
        <BotonIcono
          ref={ref}
          etiqueta={etiqueta}
          onClick={abrir}
          aria-haspopup="menu"
          aria-expanded={abierto}
          className={className}
          tamano="sm"
        >
          <MoreHorizontal className="size-5" />
        </BotonIcono>
      )}
      {abierto &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-cmp="cmp/acciones/menu"
            style={{
              position: 'fixed',
              ...(pos.arriba ? { bottom: window.innerHeight - pos.top + 48 } : { top: pos.top }),
              ...(alinear === 'der'
                ? { right: Math.max(8, pos.right) }
                : { left: Math.max(8, pos.left) }),
            }}
            className="anim-fade z-[80] min-w-52 max-w-[calc(100vw-16px)] rounded-[12px] border border-line bg-raised p-1 shadow-modal"
          >
            {visibles.map((it, i) =>
              it.separador ? (
                <div key={i} className="my-1 h-px bg-line" role="separator" />
              ) : (
                <button
                  key={i}
                  role="menuitem"
                  type="button"
                  disabled={it.deshabilitado}
                  title={it.deshabilitado ? it.motivo : undefined}
                  onClick={() => {
                    setAbierto(false);
                    it.onClick?.();
                  }}
                  className={cx(
                    'flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    it.destructivo
                      ? 'text-danger-text hover:bg-danger/10'
                      : 'text-fg hover:bg-surface',
                  )}
                >
                  <span className="shrink-0 [&>svg]:size-[18px]" aria-hidden>
                    {it.icono}
                  </span>
                  <span className="flex-1">
                    {it.etiqueta}
                    {it.deshabilitado && it.motivo && (
                      <span className="block text-xs text-muted">{it.motivo}</span>
                    )}
                  </span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Acordeon({
  titulo,
  children,
  abiertoInicial = false,
  className,
}: {
  titulo: ReactNode;
  children: ReactNode;
  abiertoInicial?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const id = useId();
  return (
    <div className={cx('border-b border-line', className)}>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto(!abierto)}
        className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left font-medium"
      >
        <span>{titulo}</span>
        <ChevronDown
          className={cx(
            'size-5 shrink-0 text-muted transition-transform duration-200',
            abierto && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      <div id={id} hidden={!abierto} className="pb-4 text-muted">
        {children}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border border-line bg-surface px-1.5 font-sans text-xs text-muted">
      {children}
    </kbd>
  );
}

export function Encabezado({
  titulo,
  descripcion,
  acciones,
  className,
  nivel = 1,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
  nivel?: 1 | 2;
}) {
  const H = nivel === 1 ? 'h1' : 'h2';
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        <H className={nivel === 1 ? 'text-[22px] sm:text-[28px]' : 'text-lg sm:text-[22px]'}>
          {titulo}
        </H>
        {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Barra({
  valor,
  tono = 'marca',
  etiqueta,
  className,
}: {
  valor: number;
  tono?: Tono;
  etiqueta: string;
  className?: string;
}) {
  const color =
    tono === 'ok'
      ? 'bg-ok'
      : tono === 'warn'
        ? 'bg-warn'
        : tono === 'danger'
          ? 'bg-danger'
          : 'bg-brand';
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuenow={Math.round(valor)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx('h-2 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-200', color)}
        style={{ width: `${Math.min(100, Math.max(0, valor))}%` }}
      />
    </div>
  );
}
