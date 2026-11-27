import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  aE164,
  ayudaPara,
  buscarPaises,
  demasiadoLargo,
  desdeE164,
  errorPara,
  esValido,
  limpiar,
  opcionDe,
  separar,
  type Pais,
  type Telefono,
} from '@/lib/telefono';
import { Popover } from './capas';
import { cx } from './cx';
import { Entrada } from './formularios';

export interface ValorTelefono {
  /** Lada + número en E.164 (`+525512345678`), o `''` si el campo está vacío. */
  e164: string;
  valido: boolean;
  vacio: boolean;
}

/**
 * Campo de teléfono con la lada aparte (retroalimentación, bloque 3): un selector de país con
 * búsqueda (México, +52, por defecto) y un campo solo de dígitos. Si se pega un número con `+` o
 * con la lada delante, la separa sola. Hacia fuera entrega E.164, el formato que ya espera la API.
 */
export function CampoTelefono({
  etiqueta,
  valorInicial,
  onCambio,
  error: errorExterno,
  validar = false,
  className,
}: {
  etiqueta: string;
  /** Número guardado en E.164; se descompone en lada + número para prellenar los dos controles. */
  valorInicial?: string | null;
  onCambio: (v: ValorTelefono) => void;
  /** Error que viene del servidor; manda sobre el de la validación local. */
  error?: string;
  /** Muestra el error aunque la persona no haya salido del campo (al intentar guardar). */
  validar?: boolean;
  className?: string;
}) {
  const id = useId();
  const ids = {
    etiqueta: `${id}-etiqueta`,
    numero: `${id}-numero`,
    ayuda: `${id}-ayuda`,
    error: `${id}-error`,
    lista: `${id}-paises`,
  };
  const [inicial] = useState(() => desdeE164(valorInicial));
  const [pais, setPais] = useState<Pais>(inicial.pais);
  // Lo que se ve en el campo: dígitos, o un `+…` a medio escribir hasta que se reconozca la lada.
  const [texto, setTexto] = useState(inicial.numero);
  const [tocado, setTocado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);

  const actual: Telefono = { pais, numero: texto.startsWith('+') ? '' : texto };
  const emitir = (t: Telefono, pendiente = false) =>
    onCambio({
      e164: t.numero ? aE164(t) : '',
      valido: !pendiente && esValido(t),
      vacio: !pendiente && !t.numero,
    });

  const cambiar = (bruto: string) => {
    const r = separar(bruto, pais, false);
    if (r === null) {
      // `+5…`: todavía no se sabe la lada; se deja escribir.
      setTexto(limpiar(bruto));
      emitir(actual, true);
      return;
    }
    let numero = r.numero;
    while (numero && demasiadoLargo(numero, r.pais)) numero = numero.slice(0, -1);
    setPais(r.pais);
    setTexto(numero);
    emitir({ pais: r.pais, numero });
  };

  const salir = () => {
    setTocado(true);
    if (!texto.startsWith('+')) return;
    const r = separar(texto, pais, true) ?? { pais, numero: '' };
    setPais(r.pais);
    setTexto(r.numero);
    emitir(r);
  };

  const elegir = (p: Pais) => {
    setPais(p);
    setAbierto(false);
    let numero = actual.numero;
    while (numero && demasiadoLargo(numero, p)) numero = numero.slice(0, -1);
    setTexto(numero);
    emitir({ pais: p, numero });
    requestAnimationFrame(() => numeroRef.current?.focus());
  };

  const opcion = opcionDe(pais);
  const errorLocal = (tocado || validar) && texto ? errorPara(actual) : undefined;
  const error = errorExterno ?? errorLocal;
  const describe = [!error && ids.ayuda, error && ids.error].filter(Boolean).join(' ');

  return (
    <div
      className={cx('flex flex-col gap-1.5', className)}
      role="group"
      aria-labelledby={ids.etiqueta}
      data-cmp="cmp/formularios/telefono"
    >
      <label id={ids.etiqueta} htmlFor={ids.numero} className="text-sm font-medium text-fg">
        {etiqueta}
      </label>
      <div className="flex">
        <button
          ref={anclaRef}
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-describedby={describe || undefined}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-l-[8px] border border-r-0 border-line-strong/50 bg-surface px-3 text-sm text-fg transition-colors hover:border-line-strong focus-visible:relative focus-visible:z-10 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 focus-visible:outline-none"
          data-cmp="cmp/formularios/telefono-lada"
        >
          {/* Nombre accesible desde el contenido, sin aria-label: incluye el texto visible
              («MX +52») y lo completa para lectores de pantalla (WCAG 2.5.3). */}
          <span className="sr-only">Lada: </span>
          <span className="rounded-[4px] bg-canvas px-1 text-[11px] font-semibold tracking-wide text-muted">
            {pais}
          </span>{' '}
          <span className="tabular">+{opcion.lada}</span>
          <span className="sr-only">{` (${opcion.nombre}). Cambiar de país`}</span>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </button>
        <Entrada
          ref={numeroRef}
          id={ids.numero}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={pais === 'MX' ? '5512345678' : undefined}
          value={texto}
          onChange={(e) => cambiar(e.target.value)}
          onPaste={(e) => {
            // Al pegar se procesa el texto completo (con lada, espacios o guiones) para poder
            // separar la lada antes de recortar al largo del país.
            e.preventDefault();
            cambiar(e.clipboardData.getData('text'));
          }}
          onBlur={salir}
          aria-invalid={!!error || undefined}
          aria-describedby={describe || undefined}
          className="tabular min-w-0 flex-1 rounded-l-none"
        />
      </div>
      {!error && (
        <p id={ids.ayuda} className="text-xs text-muted">
          {ayudaPara(pais)}
        </p>
      )}
      {error && (
        <p
          id={ids.error}
          className="flex items-start gap-1 text-xs font-medium text-danger-text"
          role="alert"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      <Popover
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        anclaRef={anclaRef}
        etiqueta="Elegir la lada del país"
        ancho={320}
        alinear="inicio"
      >
        <ListaPaises idLista={ids.lista} actual={pais} onElegir={elegir} />
      </Popover>
    </div>
  );
}

/** Buscador de países (combobox): flechas para moverse, Enter para elegir, Esc para cerrar. */
function ListaPaises({
  idLista,
  actual,
  onElegir,
}: {
  idLista: string;
  actual: Pais;
  onElegir: (p: Pais) => void;
}) {
  const [q, setQ] = useState('');
  const lista = buscarPaises(q);
  const [activo, setActivo] = useState(() =>
    Math.max(
      0,
      lista.findIndex((o) => o.pais === actual),
    ),
  );
  const listaRef = useRef<HTMLUListElement>(null);
  const idx = Math.min(activo, Math.max(0, lista.length - 1));
  const mover = (n: number) => {
    const sig = Math.min(Math.max(0, n), lista.length - 1);
    setActivo(sig);
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${sig}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };
  // Al abrir, el país elegido queda a la vista.
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'center' });
  }, []);
  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    const destino: Record<string, number> = {
      ArrowDown: idx + 1,
      ArrowUp: idx - 1,
      Home: 0,
      End: lista.length - 1,
    };
    if (e.key in destino) {
      e.preventDefault();
      mover(destino[e.key] ?? 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = lista[idx];
      if (o) onElegir(o.pais);
    }
  };
  return (
    <div className="p-2">
      <Entrada
        autoFocus
        role="combobox"
        aria-label="Buscar país o lada"
        aria-expanded
        aria-controls={idLista}
        aria-activedescendant={lista[idx] ? `${idLista}-${lista[idx].pais}` : undefined}
        aria-autocomplete="list"
        placeholder="Buscar país o lada"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActivo(0);
        }}
        onKeyDown={tecla}
      />
      <ul
        ref={listaRef}
        id={idLista}
        role="listbox"
        aria-label="Países"
        className="mt-2 max-h-64 overflow-y-auto"
      >
        {lista.map((o, i) => (
          <li
            key={o.pais}
            id={`${idLista}-${o.pais}`}
            data-indice={i}
            role="option"
            aria-selected={o.pais === actual}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onElegir(o.pais)}
            onMouseMove={() => i !== idx && setActivo(i)}
            className={cx(
              'flex min-h-10 cursor-pointer items-center gap-2 rounded-[8px] px-2 text-sm',
              i === idx && 'bg-surface ring-1 ring-line-strong/60',
            )}
          >
            <span className="w-7 shrink-0 text-[11px] font-semibold tracking-wide text-muted">
              {o.pais}
            </span>
            <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
            <span className="tabular text-muted">+{o.lada}</span>
            {o.pais === actual && <Check className="size-4 text-brand" aria-hidden />}
          </li>
        ))}
        {!lista.length && (
          <li className="px-2 py-3 text-sm text-muted" role="presentation">
            No hay países con «{q}».
          </li>
        )}
      </ul>
    </div>
  );
}
