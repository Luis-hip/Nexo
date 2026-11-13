import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boton } from '@/components/ui';

const PASOS = [
  {
    sel: '[data-tour="espacios"]',
    titulo: 'Tus espacios',
    texto:
      'Cambia entre tu Espacio personal y cada equipo. La navegación se adapta a tu rol en cada uno.',
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

/** ONB-04: recorrido de primer uso. Al cerrarlo llama a `onCerrar` (quien lo abre guarda que ya se vio). */
export function Tour({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [paso, setPaso] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const p = PASOS[paso] ?? PASOS[0];

  useEffect(() => {
    if (!abierto) return;
    const medir = () => {
      const visible = [...document.querySelectorAll<HTMLElement>(p.sel)].find(
        (e) => e.getBoundingClientRect().width > 0,
      );
      setRect(visible?.getBoundingClientRect() ?? null);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [abierto, p.sel]);

  if (!abierto) return null;
  const cerrar = () => {
    setPaso(0);
    onCerrar();
  };
  const abajo = rect ? rect.top < window.innerHeight / 2 : true;
  return createPortal(
    <div
      className="fixed inset-0 z-[88]"
      data-name="NX/ONB-04-Tour"
      role="dialog"
      aria-modal="true"
      aria-label="Recorrido de primer uso"
    >
      <div className="absolute inset-0 bg-black/50" onClick={cerrar} aria-hidden />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[12px] ring-4 ring-brand transition-all duration-200"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        className="anim-up absolute left-1/2 w-[min(360px,calc(100vw-24px))] -translate-x-1/2 rounded-[16px] border border-line bg-raised p-5 shadow-modal"
        style={
          rect
            ? abajo
              ? { top: Math.min(rect.bottom + 16, window.innerHeight - 220) }
              : { bottom: Math.max(16, window.innerHeight - rect.top + 16) }
            : { top: '30%' }
        }
      >
        <p className="text-xs font-medium text-muted tabular">
          Paso {paso + 1} de {PASOS.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{p.titulo}</h2>
        <p className="mt-1 text-sm text-muted">{p.texto}</p>
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
