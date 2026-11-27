import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boton } from '@/components/ui';

const PASOS = [
  {
    sel: '[data-tour="espacios"]',
    titulo: 'Tus espacios',
    texto:
      'En «Espacios» cambias entre tu Espacio personal y cada equipo. La navegación se adapta a tu rol en cada uno.',
  },
  {
    sel: '[data-cmp="cmp/navegacion/barra-lateral"], [data-cmp="cmp/navegacion/rail"], [data-cmp="cmp/navegacion/barra-inferior"]',
    titulo: 'Navegación',
    texto:
      'Inicio, tareas y calendario siempre a mano. En «Más» encontrarás reportes, equipos y ayuda.',
  },
  {
    sel: '[data-tour="crear"], [data-cmp="cmp/acciones/boton-flotante"]',
    titulo: 'Crear',
    texto: 'Crea una tarea desde cualquier pantalla de tu espacio personal. Atajo: N.',
  },
  {
    sel: '[data-tour="notificaciones"]',
    titulo: 'Notificaciones',
    texto: 'Menciones, asignaciones y reuniones llegan aquí.',
  },
  {
    sel: '[data-tour="buscar"], [data-tour="buscar-movil"]',
    titulo: 'Búsqueda',
    texto: 'Encuentra tus tareas por título. Atajo: Ctrl + K.',
  },
] as const;

/** Margen mínimo entre el resaltado (o el globo) y cada borde de la ventana. */
const MARGEN = 8;
/** Aire entre el elemento y el borde del resaltado. */
const HOLGURA = 6;
/** Separación entre el resaltado y el globo. */
const SEPARACION = 14;

interface Caja {
  top: number;
  left: number;
  width: number;
  height: number;
}

const visibleDe = (sel: string) =>
  [...document.querySelectorAll<HTMLElement>(sel)].find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

/** Tamaño visible de la ventana (con zoom del navegador o del pellizco, el de `visualViewport`). */
function ventana() {
  const vv = window.visualViewport;
  return {
    w: Math.min(document.documentElement.clientWidth, vv?.width ?? Infinity),
    h: Math.min(document.documentElement.clientHeight, vv?.height ?? Infinity),
  };
}

/**
 * Rectángulo del resaltado: el del elemento con holgura, recortado a la ventana con `MARGEN` por
 * lado. Si el elemento es más alto o ancho que la ventana, queda resaltada solo la parte visible.
 */
export function cajaResaltado(
  r: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
  vw: number,
  vh: number,
): Caja | null {
  const top = Math.max(MARGEN, r.top - HOLGURA);
  const left = Math.max(MARGEN, r.left - HOLGURA);
  const bottom = Math.min(vh - MARGEN, r.bottom + HOLGURA);
  const right = Math.min(vw - MARGEN, r.right + HOLGURA);
  if (bottom - top < 4 || right - left < 4) return null;
  return { top, left, width: right - left, height: bottom - top };
}

type Lado = 'abajo' | 'arriba' | 'derecha' | 'izquierda' | 'centro';

/**
 * Dónde va el globo para que quede completo dentro de la ventana: abajo o arriba del resaltado si
 * cabe; si no (por ejemplo, la barra lateral ocupa todo el alto), a un lado; si tampoco, centrado
 * abajo de la ventana.
 */
export function colocarGlobo(
  caja: Caja | null,
  globo: { w: number; h: number },
  vw: number,
  vh: number,
): { top: number; left: number; lado: Lado } {
  const acotar = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), Math.max(min, max));
  const centroX = (c: Caja) =>
    acotar(c.left + c.width / 2 - globo.w / 2, MARGEN, vw - globo.w - MARGEN);
  const centroY = (c: Caja) =>
    acotar(c.top + c.height / 2 - globo.h / 2, MARGEN, vh - globo.h - MARGEN);
  if (!caja)
    return {
      top: acotar((vh - globo.h) * 0.3, MARGEN, vh),
      left: (vw - globo.w) / 2,
      lado: 'centro',
    };
  const abajo = caja.top + caja.height + SEPARACION;
  if (abajo + globo.h <= vh - MARGEN) return { top: abajo, left: centroX(caja), lado: 'abajo' };
  const arriba = caja.top - SEPARACION - globo.h;
  if (arriba >= MARGEN) return { top: arriba, left: centroX(caja), lado: 'arriba' };
  const derecha = caja.left + caja.width + SEPARACION;
  if (derecha + globo.w <= vw - MARGEN)
    return { top: centroY(caja), left: derecha, lado: 'derecha' };
  const izquierda = caja.left - SEPARACION - globo.w;
  if (izquierda >= MARGEN) return { top: centroY(caja), left: izquierda, lado: 'izquierda' };
  return {
    top: Math.max(MARGEN, vh - globo.h - MARGEN),
    left: acotar((vw - globo.w) / 2, MARGEN, vw - globo.w - MARGEN),
    lado: 'centro',
  };
}

/** ONB-04: recorrido de primer uso. Al cerrarlo llama a `onCerrar` (quien lo abre guarda que ya se vio). */
export function Tour({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [paso, setPaso] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const globoRef = useRef<HTMLDivElement>(null);
  const p = PASOS[paso] ?? PASOS[0];

  // Mide el elemento del paso y recorta el resaltado a la ventana.
  const medir = useCallback(() => {
    const el = visibleDe(p.sel);
    const { w, h } = ventana();
    setCaja(el ? cajaResaltado(el.getBoundingClientRect(), w, h) : null);
  }, [p.sel]);

  useEffect(() => {
    if (!abierto) return;
    // Antes de mostrar el paso, el elemento se trae a la vista (si está dentro de algo con scroll).
    const el = visibleDe(p.sel);
    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reducir ? 'auto' : 'smooth',
    });
    // Se mide en el siguiente cuadro y se sigue midiendo durante las transiciones (scroll suave,
    // menú que se abre o se cierra).
    let marco = 0;
    const fin = performance.now() + 600;
    const seguir = () => {
      medir();
      if (performance.now() < fin) marco = requestAnimationFrame(seguir);
    };
    marco = requestAnimationFrame(seguir);
    const vv = window.visualViewport;
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    vv?.addEventListener('resize', medir);
    vv?.addEventListener('scroll', medir);
    document.addEventListener('transitionend', medir, true);
    // Cambios de tamaño del propio elemento o del documento (menú lateral, rail, barra inferior).
    const ro = new ResizeObserver(() => medir());
    if (el) ro.observe(el);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(marco);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      vv?.removeEventListener('resize', medir);
      vv?.removeEventListener('scroll', medir);
      document.removeEventListener('transitionend', medir, true);
      ro.disconnect();
    };
  }, [abierto, p.sel, medir]);

  // El globo se coloca después de medirse a sí mismo, para que nunca se salga de la ventana.
  useLayoutEffect(() => {
    if (!abierto || !globoRef.current) return;
    const g = globoRef.current.getBoundingClientRect();
    const { w, h } = ventana();
    const c = colocarGlobo(caja, { w: g.width, h: g.height }, w, h);
    setPos((prev) => (prev && prev.top === c.top && prev.left === c.left ? prev : c));
  }, [abierto, caja, paso]);

  const cerrar = () => {
    setPaso(0);
    onCerrar();
  };

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPaso(0);
        onCerrar();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[88] overflow-hidden"
      data-name="NX/ONB-04-Tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-titulo"
      aria-describedby="tour-texto"
    >
      {/* Sin elemento que resaltar se oscurece todo; con él, el oscurecido es la sombra del foco. */}
      <div
        className={caja ? 'absolute inset-0' : 'absolute inset-0 bg-black/60'}
        onClick={cerrar}
        aria-hidden
      />
      {caja && (
        <div
          className="pointer-events-none absolute rounded-[12px] border-[3px] border-brand transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            ...caja,
            // Foco: todo lo demás queda oscurecido y el borde de marca brilla hacia fuera.
            boxShadow:
              '0 0 0 4px color-mix(in srgb, var(--brand-primary) 35%, transparent), 0 0 0 200vmax rgb(0 0 0 / 0.6)',
          }}
          data-name="NX/ONB-04-Resaltado"
          aria-hidden
        />
      )}
      <div
        ref={globoRef}
        className="anim-up absolute w-[min(360px,calc(100vw-16px))] rounded-[16px] border border-line bg-raised p-5 shadow-modal"
        style={pos ?? { top: -9999, left: -9999 }}
      >
        <p className="text-xs font-medium text-muted tabular">
          Paso {paso + 1} de {PASOS.length}
        </p>
        <h2 id="tour-titulo" className="mt-1 text-lg font-semibold">
          {p.titulo}
        </h2>
        <p id="tour-texto" className="mt-1 text-sm text-muted">
          {p.texto}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Boton variante="texto" tamano="sm" onClick={cerrar}>
            Saltar recorrido
          </Boton>
          <div className="flex gap-2">
            {paso > 0 && (
              <Boton tamano="sm" onClick={() => setPaso(paso - 1)}>
                Anterior
              </Boton>
            )}
            <Boton
              tamano="sm"
              variante="primario"
              autoFocus
              onClick={() => (paso < PASOS.length - 1 ? setPaso(paso + 1) : cerrar())}
            >
              {paso < PASOS.length - 1 ? 'Siguiente' : 'Terminar'}
            </Boton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
