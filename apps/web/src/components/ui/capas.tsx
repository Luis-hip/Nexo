import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cx } from './cx';
import { Boton, BotonIcono } from './basicos';
import { Entrada, Campo } from './formularios';
import { cerrarToast, useToasts } from '@/lib/toasts';

function useCapa(abierto: boolean, onCerrar: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el =
        ref.current?.querySelector<HTMLElement>(
          '[autofocus], input:not([type=hidden]), textarea, select, button:not([data-cerrar])',
        ) ?? ref.current;
      el?.focus();
    }, 20);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar();
      }
      if (e.key === 'Tab' && ref.current) {
        const f = [
          ...ref.current.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled), textarea, select, [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  pie,
  ancho = 'md',
  movil = 'hoja',
  nombre,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
  movil?: 'hoja' | 'completa';
  nombre?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useCapa(abierto, onCerrar, ref);
  if (!abierto) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      data-name={nombre}
    >
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={onCerrar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        data-cmp="cmp/capas/modal"
        className={cx(
          'anim-up relative flex w-full flex-col bg-raised shadow-modal sm:rounded-[16px]',
          movil === 'completa'
            ? 'h-[100dvh] sm:h-auto sm:max-h-[min(90dvh,880px)]'
            : 'max-h-[92dvh] rounded-t-[16px] sm:max-h-[min(90dvh,880px)]',
          ancho === 'sm'
            ? 'sm:max-w-md'
            : ancho === 'lg'
              ? 'sm:max-w-2xl'
              : ancho === 'xl'
                ? 'sm:max-w-4xl'
                : 'sm:max-w-lg',
        )}
      >
        {movil === 'hoja' && (
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        )}
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={id} className="text-lg font-semibold sm:text-[22px]">
              {titulo}
            </h2>
            {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
          </div>
          <BotonIcono etiqueta="Cerrar" data-cerrar onClick={onCerrar} className="-mt-1 -mr-2">
            <X className="size-5" />
          </BotonIcono>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {pie && (
          <div className="flex flex-wrap-reverse justify-end gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
            {pie}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Hoja({
  abierto,
  onCerrar,
  titulo,
  children,
  nombre,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  nombre?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useCapa(abierto, onCerrar, ref);
  if (!abierto) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center" data-name={nombre}>
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={onCerrar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        data-cmp="cmp/capas/hoja-inferior"
        className="anim-up relative flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-[16px] bg-raised shadow-modal"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="flex items-center gap-3 px-5 pt-2 pb-2">
          <h2 id={id} className="flex-1 text-lg font-semibold">
            {titulo}
          </h2>
          <BotonIcono etiqueta="Cerrar" data-cerrar onClick={onCerrar} className="-mr-2">
            <X className="size-5" />
          </BotonIcono>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Panel lateral derecho: vista dividida en escritorio, superpuesto en tablet, pantalla completa en móvil. */
export function PanelLateral({
  abierto,
  onCerrar,
  titulo,
  children,
  acciones,
  ancho = 480,
  nombre,
  sinFondoEscritorio,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  acciones?: ReactNode;
  ancho?: number;
  nombre?: string;
  sinFondoEscritorio?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useCapa(abierto, onCerrar, ref);
  if (!abierto) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60]" data-name={nombre}>
      <div
        className={cx(
          'anim-fade absolute inset-0 bg-black/35',
          sinFondoEscritorio && 'lg:bg-black/10',
        )}
        onClick={onCerrar}
        aria-hidden
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        data-cmp="cmp/capas/panel-lateral"
        style={{ ['--w' as string]: `${ancho}px` }}
        className="anim-left absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-raised shadow-modal sm:w-[min(var(--w),92vw)] pt-safe"
      >
        <div className="flex min-h-14 items-center gap-2 border-b border-line px-3 sm:px-4">
          <BotonIcono etiqueta="Cerrar panel" data-cerrar onClick={onCerrar}>
            <X className="size-5" />
          </BotonIcono>
          <h2 id={id} className="min-w-0 flex-1 truncate text-base font-semibold">
            {titulo}
          </h2>
          {acciones}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

export function Toasts() {
  const toasts = useToasts();
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
        const I =
          t.tono === 'ok'
            ? CheckCircle2
            : t.tono === 'danger'
              ? XCircle
              : t.tono === 'warn'
                ? AlertTriangle
                : Info;
        return (
          <div
            key={t.id}
            data-cmp="cmp/capas/toast"
            className="anim-up pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[12px] bg-fg py-2 pr-2 pl-4 text-sm text-canvas shadow-modal"
          >
            <I
              className={cx(
                'size-5 shrink-0',
                t.tono === 'ok'
                  ? 'text-ok'
                  : t.tono === 'danger'
                    ? 'text-danger'
                    : t.tono === 'warn'
                      ? 'text-warn'
                      : 'text-info',
              )}
              style={{ filter: 'brightness(1.3)' }}
              aria-hidden
            />
            <span className="flex-1 py-1.5">{t.texto}</span>
            {t.deshacer && (
              <button
                type="button"
                onClick={() => (t.deshacer?.(), cerrarToast(t.id))}
                className="h-9 rounded-[8px] px-3 font-semibold underline-offset-2 hover:underline"
              >
                Deshacer
              </button>
            )}
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => cerrarToast(t.id)}
              className="grid size-9 place-items-center rounded-[8px] opacity-70 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

interface OpcConfirmar {
  titulo: string;
  mensaje: ReactNode;
  confirmar?: string;
  cancelar?: string;
  destructivo?: boolean;
  /** Texto que se debe escribir para habilitar la confirmación (acciones irreversibles). */
  escribir?: string;
  conMotivo?: { etiqueta: string; opcional?: boolean };
}
type Resultado = false | { motivo: string };
const ConfirmCtx = createContext<(o: OpcConfirmar) => Promise<Resultado>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<
    (OpcConfirmar & { resolver: (r: Resultado) => void }) | null
  >(null);
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const confirmar = useCallback(
    (o: OpcConfirmar) =>
      new Promise<Resultado>(
        (resolver) => (setTexto(''), setMotivo(''), setEstado({ ...o, resolver })),
      ),
    [],
  );
  const cerrar = (r: Resultado) => {
    estado?.resolver(r);
    setEstado(null);
  };
  const bloqueado =
    (!!estado?.escribir && texto.trim() !== estado.escribir) ||
    (!!estado?.conMotivo && !estado.conMotivo.opcional && !motivo.trim());
  return (
    <ConfirmCtx.Provider value={confirmar}>
      {children}
      <Modal
        abierto={!!estado}
        onCerrar={() => cerrar(false)}
        titulo={
          <span className="flex items-center gap-2">
            {estado?.destructivo && <AlertTriangle className="size-5 text-danger" aria-hidden />}
            {estado?.titulo}
          </span>
        }
        ancho="sm"
        nombre="cmp/capas/confirmacion"
        pie={
          <>
            <Boton onClick={() => cerrar(false)}>{estado?.cancelar ?? 'Cancelar'}</Boton>
            <span className="hidden w-4 sm:block" aria-hidden />
            <Boton
              variante={estado?.destructivo ? 'destructivo' : 'primario'}
              disabled={bloqueado}
              onClick={() => cerrar({ motivo })}
            >
              {estado?.confirmar ?? 'Confirmar'}
            </Boton>
          </>
        }
      >
        <div className="space-y-4 text-sm text-muted">
          <div>{estado?.mensaje}</div>
          {estado?.conMotivo && (
            <Campo etiqueta={estado.conMotivo.etiqueta} opcional={estado.conMotivo.opcional}>
              <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </Campo>
          )}
          {estado?.escribir && (
            <Campo etiqueta={`Escribe «${estado.escribir}» para confirmar`}>
              <Entrada
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
              />
            </Campo>
          )}
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirmar = () => useContext(ConfirmCtx);

export function Popover({
  abierto,
  onCerrar,
  anclaRef,
  children,
  ancho = 360,
  etiqueta,
}: {
  abierto: boolean;
  onCerrar: () => void;
  anclaRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  ancho?: number;
  etiqueta: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (!abierto) return;
    const r = anclaRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right - 8) });
    const cerrar = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) &&
      !anclaRef.current?.contains(e.target as Node) &&
      onCerrar();
    const tecla = (e: KeyboardEvent) =>
      e.key === 'Escape' && (onCerrar(), anclaRef.current?.focus());
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!abierto) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={etiqueta}
      data-cmp="cmp/capas/popover"
      style={{ top: pos.top, right: pos.right, width: `min(${ancho}px, calc(100vw - 16px))` }}
      className="anim-fade fixed z-[75] overflow-hidden rounded-[16px] border border-line bg-raised shadow-modal"
    >
      {children}
    </div>,
    document.body,
  );
}
