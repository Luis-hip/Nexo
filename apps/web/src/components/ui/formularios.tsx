import {
  forwardRef,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  cloneElement,
  isValidElement,
  type ReactElement,
} from 'react';
import { AlertCircle, Check, ChevronDown, Eye, EyeOff, Paperclip, Upload, X } from 'lucide-react';
import { cx } from './cx';

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  opcional,
  className,
  contador,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  opcional?: boolean;
  className?: string;
  contador?: ReactNode;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idErr = `${id}-error`;
  const hijo = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': !!error || undefined,
        'aria-describedby':
          [ayuda && idAyuda, error && idErr].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={cx('flex flex-col gap-1.5', className)} data-cmp="cmp/formularios/campo">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {etiqueta}
          {opcional && <span className="font-normal text-muted"> (opcional)</span>}
        </label>
        {contador}
      </div>
      {hijo}
      {ayuda && !error && (
        <p id={idAyuda} className="text-xs text-muted">
          {ayuda}
        </p>
      )}
      {error && (
        <p
          id={idErr}
          className="flex items-start gap-1 text-xs font-medium text-danger-text"
          role="alert"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

const base =
  'w-full rounded-[8px] border border-line-strong/50 bg-canvas px-3 text-base sm:text-sm text-fg placeholder:text-muted/70 transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20';

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Entrada({ className, ...r }, ref) {
    return (
      <input
        ref={ref}
        data-cmp="cmp/formularios/texto"
        className={cx(base, 'h-11', className)}
        {...r}
      />
    );
  },
);

export const AreaTexto = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AreaTexto({ className, rows = 3, ...r }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      data-cmp="cmp/formularios/area-texto"
      className={cx(base, 'min-h-20 py-2.5 leading-relaxed', className)}
      {...r}
    />
  );
});

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Selector({ className, children, ...r }, ref) {
    return (
      <div className={cx('relative', className?.match(/\b(w-\S+|shrink-0|min-w-\S+)/g)?.join(' '))}>
        <select
          ref={ref}
          data-cmp="cmp/formularios/selector"
          className={cx(base, 'h-11 appearance-none pr-9', className)}
          {...r}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
      </div>
    );
  },
);

export const Contrasena = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Contrasena({ className, ...r }, ref) {
    const [ver, setVer] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={ver ? 'text' : 'password'}
          data-cmp="cmp/formularios/contrasena"
          className={cx(base, 'h-11 pr-12', className)}
          {...r}
        />
        <button
          type="button"
          onClick={() => setVer(!ver)}
          aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={ver}
          className="absolute top-0 right-0 grid size-11 place-items-center rounded-[8px] text-muted hover:text-fg"
        >
          {ver ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
    );
  },
);

export function Casilla({
  checked,
  onChange,
  etiqueta,
  descripcion,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  etiqueta: ReactNode;
  descripcion?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      data-cmp="cmp/formularios/casilla"
      className={cx(
        'flex min-h-11 cursor-pointer items-start gap-3 py-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          className="peer absolute inset-0 cursor-pointer appearance-none rounded-[6px] border-2 border-line-strong bg-canvas checked:border-brand checked:bg-brand disabled:cursor-not-allowed"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <Check
          className="pointer-events-none relative size-3.5 text-on-brand opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden
        />
      </span>
      <span className="min-w-0 text-sm">
        <span className="text-fg">{etiqueta}</span>
        {descripcion && <span className="block text-xs text-muted">{descripcion}</span>}
      </span>
    </label>
  );
}

export function Radios<T extends string>({
  nombre,
  opciones,
  valor,
  onChange,
  etiqueta,
  horizontal,
}: {
  nombre: string;
  opciones: { valor: T; etiqueta: ReactNode; descripcion?: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
  horizontal?: boolean;
}) {
  return (
    <fieldset data-cmp="cmp/formularios/radio">
      <legend className="mb-1.5 text-sm font-medium">{etiqueta}</legend>
      <div className={cx('flex gap-2', horizontal ? 'flex-wrap' : 'flex-col')}>
        {opciones.map((o) => (
          <label
            key={o.valor}
            className={cx(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition-colors',
              valor === o.valor ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface',
              horizontal && 'flex-1 min-w-[140px]',
            )}
          >
            <input
              type="radio"
              name={nombre}
              checked={valor === o.valor}
              onChange={() => onChange(o.valor)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--brand-primary)]"
            />
            <span className="text-sm">
              <span className="font-medium">{o.etiqueta}</span>
              {o.descripcion && <span className="block text-xs text-muted">{o.descripcion}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Interruptor({
  checked,
  onChange,
  etiqueta,
  descripcion,
  disabled,
  className,
  soloControl,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  etiqueta: string;
  descripcion?: ReactNode;
  disabled?: boolean;
  className?: string;
  soloControl?: boolean;
}) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={soloControl ? etiqueta : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-cmp="cmp/formularios/interruptor"
      className={cx(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed',
        checked ? 'border-brand bg-brand' : 'border-line-strong bg-line',
      )}
    >
      <span
        className={cx(
          'inline-block size-5 rounded-full bg-white shadow transition-transform duration-150',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
      <span className="sr-only">{checked ? 'Activado' : 'Desactivado'}</span>
    </button>
  );
  if (soloControl) return control;
  return (
    <div className={cx('flex min-h-11 items-center justify-between gap-4 py-2', className)}>
      <div className="min-w-0 text-sm">
        <span className="font-medium text-fg">{etiqueta}</span>
        {descripcion && <span className="block text-xs text-muted">{descripcion}</span>}
      </div>
      {control}
    </div>
  );
}

export function Deslizador({
  valor,
  onChange,
  etiqueta,
  disabled,
  min = 0,
  max = 100,
  paso = 5,
  sufijo = ' %',
}: {
  valor: number;
  onChange: (v: number) => void;
  etiqueta: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  paso?: number;
  sufijo?: string;
}) {
  const id = useId();
  return (
    <div data-cmp="cmp/formularios/deslizador" className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <label htmlFor={id} className="font-medium">
          {etiqueta}
        </label>
        <output htmlFor={id} className="tabular text-muted">
          {valor}
          {sufijo}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={paso}
        value={valor}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

export function Codigo6({
  valor,
  onChange,
  error,
  etiqueta = 'Código de verificación',
}: {
  valor: string;
  onChange: (v: string) => void;
  error?: boolean;
  etiqueta?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digitos = valor.padEnd(6, ' ').slice(0, 6).split('');
  const set = (i: number, d: string) => {
    const arr = valor.padEnd(6, ' ').split('');
    arr[i] = d || ' ';
    onChange(arr.join('').replace(/\s+$/, ''));
  };
  return (
    <div
      role="group"
      aria-label={etiqueta}
      data-cmp="cmp/formularios/codigo-6"
      className="flex justify-between gap-1.5 sm:gap-2"
    >
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => void (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Dígito ${i + 1}`}
          aria-invalid={error || undefined}
          maxLength={1}
          value={d.trim()}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (t) {
              e.preventDefault();
              onChange(t);
              refs.current[Math.min(5, t.length)]?.focus();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
          }}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1);
            set(i, v);
            if (v) refs.current[i + 1]?.focus();
          }}
          className={cx(
            base,
            'h-12 w-full max-w-12 min-w-0 px-0 text-center text-lg font-semibold tabular sm:h-14 sm:text-xl',
          )}
        />
      ))}
    </div>
  );
}

export function SelectorMultiple<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
  render,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T[];
  onChange: (v: T[]) => void;
  etiqueta: string;
  render?: (o: { valor: T; etiqueta: string }, activo: boolean) => ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      data-cmp="cmp/formularios/selector-multiple"
      className="flex flex-wrap gap-2"
    >
      {opciones.map((o) => {
        const activo = valor.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activo}
            onClick={() =>
              onChange(activo ? valor.filter((v) => v !== o.valor) : [...valor, o.valor])
            }
            className={cx(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
              activo
                ? 'border-brand bg-brand/10 font-medium text-fg'
                : 'border-line text-muted hover:bg-surface hover:text-fg',
            )}
          >
            {activo && <Check className="size-3.5" aria-hidden />}
            {render ? render(o, activo) : o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

export function formatoTamano(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function CargadorArchivos({
  onArchivos,
  etiqueta = 'Adjuntar archivos',
  disabled,
  compacto,
  aceptar,
}: {
  onArchivos: (f: { nombre: string; tamano: string; url?: string }[]) => void;
  etiqueta?: string;
  disabled?: boolean;
  compacto?: boolean;
  aceptar?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState('');
  const procesar = (fl: FileList | null) => {
    if (!fl) return;
    const arr = [...fl];
    if (arr.some((f) => f.size > 25 * 1024 * 1024)) {
      setError('Cada archivo debe pesar menos de 25 MB.');
      return;
    }
    setError('');
    onArchivos(
      arr.map((f) => ({
        nombre: f.name,
        tamano: formatoTamano(f.size),
        url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      })),
    );
  };
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      hidden
      accept={aceptar}
      onChange={(e) => (procesar(e.target.files), (e.target.value = ''))}
    />
  );
  if (compacto)
    return (
      <>
        {input}
        <button
          type="button"
          disabled={disabled}
          aria-label={etiqueta || 'Adjuntar archivo'}
          title={etiqueta || 'Adjuntar archivo'}
          onClick={() => ref.current?.click()}
          className={cx(
            'inline-flex items-center gap-2 rounded-[8px] text-sm text-brand hover:bg-brand/10 disabled:opacity-45',
            etiqueta ? 'h-9 px-3' : 'size-11 justify-center',
          )}
        >
          <Paperclip className={etiqueta ? 'size-4' : 'size-5'} aria-hidden />
          {etiqueta}
        </button>
      </>
    );
  return (
    <div data-cmp="cmp/formularios/cargador">
      {input}
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setArrastrando(true))}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => (e.preventDefault(), setArrastrando(false), procesar(e.dataTransfer.files))}
        className={cx(
          'flex w-full flex-col items-center gap-1 rounded-[12px] border-2 border-dashed px-4 py-6 text-center text-sm transition-colors disabled:opacity-45',
          arrastrando
            ? 'border-brand bg-brand/5'
            : 'border-line hover:border-line-strong hover:bg-surface',
        )}
      >
        <Upload className="size-5 text-muted" aria-hidden />
        <span className="font-medium">{etiqueta}</span>
        <span className="text-xs text-muted">
          Arrastra aquí o elige desde tu dispositivo · máx. 25 MB
        </span>
      </button>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger-text" role="alert">
          <X className="size-3.5" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function Buscador({
  valor,
  onChange,
  etiqueta = 'Buscar',
  placeholder,
  className,
  autoFocus,
}: {
  valor: string;
  onChange: (v: string) => void;
  etiqueta?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cx('relative', className)}>
      <svg
        className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        aria-label={etiqueta}
        autoFocus={autoFocus}
        placeholder={placeholder ?? etiqueta}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cx(base, 'h-10 pl-10')}
      />
    </div>
  );
}
