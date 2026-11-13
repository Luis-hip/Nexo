import type { EstadoTarea } from '@nexo/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FormaSvg, useColorDe } from '@/components/ui';
import { fechaCorta } from '@/lib/fechas';
import { formaDeEstado, NOMBRE_ESTADO, semaforo } from '@/lib/tareas';

/** Una tarea sobre la colina. */
export interface PuntoHill {
  id: string;
  /** Código visible, p. ej. «T-03». */
  codigo: string;
  titulo: string;
  estado: EstadoTarea;
  progreso: number;
  vence_en: string | null;
  resultado: 'a_tiempo' | 'con_retraso' | null;
  responsable: string;
  /** color_idx de la membresía del responsable. */
  colorIdx?: number | null;
}

function useAnchoContenedor() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth);
    const ro = new ResizeObserver(([e]) => {
      if (!e) return;
      const n = Math.round(e.contentRect.width);
      // Histéresis: evita bucles cuando la barra de desplazamiento aparece y desaparece.
      setW((prev) => (prev !== 0 && Math.abs(prev - n) > 0 && Math.abs(prev - n) < 20 ? prev : n));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export interface HillChartProps {
  puntos: PuntoHill[];
  onAbrir?: (id: string) => void;
  simplificado?: boolean;
  alto?: number;
  mostrarIniciales?: boolean;
  etiqueta?: string;
}

/**
 * Hill Chart (docs/01, 5.5): SVG propio; la subida es «Definiendo» y la bajada «Ejecutando».
 * Cada tarea es una figura con el color de su responsable, la forma de su estado y un anillo
 * de urgencia. En la Fase 1 es de solo lectura; arrastrar para actualizar llega en la Fase 3.
 */
export function HillChart({
  puntos: tareas,
  onAbrir,
  simplificado,
  alto,
  mostrarIniciales,
  etiqueta = 'Hill Chart del sprint',
}: HillChartProps) {
  const colorDe = useColorDe();
  const { ref, w } = useAnchoContenedor();
  const [hover, setHover] = useState<string | null>(null);
  const movil = w > 0 && w < 520;
  const simple = simplificado ?? movil;
  const h =
    alto ??
    (simple ? Math.max(180, Math.min(240, w * 0.62)) : Math.max(260, Math.min(420, w * 0.36)));
  const padX = simple ? 18 : 40;
  const top = simple ? 40 : 56;
  const base = h - (simple ? 34 : 44);
  const amp = base - top;
  const tam = simple ? 18 : 24;

  const { path, puntos, X } = useMemo(() => {
    const X = (p: number) => padX + (p / 100) * (w - padX * 2);
    const Y = (p: number) => base - (amp * (1 - Math.cos((2 * Math.PI * p) / 100))) / 2;
    let d = '';
    if (w) {
      for (let p = 0; p <= 100; p += 1)
        d += `${p ? 'L' : 'M'}${X(p).toFixed(1)},${Y(p).toFixed(1)}`;
    }
    const res: { t: PuntoHill; x: number; y: number; nivel: number }[] = [];
    for (const t of [...tareas].sort((a, b) => a.progreso - b.progreso)) {
      const x = X(t.progreso);
      let nivel = 0;
      while (res.some((r) => Math.abs(r.x - x) < tam * 0.95 && r.nivel === nivel)) nivel++;
      res.push({ t, x, y: Y(t.progreso) - nivel * (tam + 4), nivel });
    }
    return { path: d, puntos: res, X };
  }, [tareas, w, padX, base, amp, tam]);

  const conIniciales = mostrarIniciales || new Set(tareas.map((t) => t.responsable)).size >= 12;
  const activo = puntos.find((p) => p.t.id === hover);

  useEffect(() => {
    if (!hover) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setHover(null);
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [hover]);

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      data-cmp="cmp/datos/hill-chart"
      style={{ height: h }}
    >
      {w > 0 && (
        <svg
          width={w}
          height={h}
          role="group"
          aria-label={`${etiqueta}: ${tareas.length} tareas. Usa Tab para recorrer las figuras.`}
          className="overflow-visible"
        >
          <line x1={padX} x2={w - padX} y1={base} y2={base} stroke="var(--border-subtle)" />
          <line
            x1={X(50)}
            x2={X(50)}
            y1={top - 18}
            y2={base}
            stroke="var(--border-strong)"
            strokeDasharray="3 5"
            opacity={0.6}
          />
          <path
            d={`${path}L${X(100)},${base}L${X(0)},${base}Z`}
            fill="var(--brand-primary)"
            opacity={0.05}
          />
          <path
            d={path}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.75}
          />
          <text
            x={X(25)}
            y={base + (simple ? 22 : 28)}
            textAnchor="middle"
            className="fill-[var(--text-secondary)]"
            fontSize={simple ? 11 : 13}
            fontWeight={500}
          >
            {simple ? 'Definiendo' : 'Definiendo · resolver incógnitas'}
          </text>
          <text
            x={X(75)}
            y={base + (simple ? 22 : 28)}
            textAnchor="middle"
            className="fill-[var(--text-secondary)]"
            fontSize={simple ? 11 : 13}
            fontWeight={500}
          >
            {simple ? 'Ejecutando' : 'Ejecutando · terminar el trabajo'}
          </text>
          {puntos.map(({ t, x, y }) => {
            const { color } = colorDe(t.colorIdx);
            const sem = semaforo(t);
            const anillo = sem?.urgente ? sem.nivel : undefined;
            const size = tam + (anillo ? tam * 0.34 : 0);
            const descripcion = `${t.codigo} ${t.titulo}. ${t.responsable}. ${t.progreso} %. ${NOMBRE_ESTADO[t.estado]}${sem ? `, ${sem.texto}` : ''}.`;
            return (
              <g
                key={t.id}
                role="button"
                tabIndex={0}
                aria-label={descripcion}
                transform={`translate(${x - size / 2} ${y - size / 2 - tam * 0.15})`}
                className="cursor-pointer outline-none [&:focus-visible>rect]:opacity-100"
                onMouseEnter={() => setHover(t.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(t.id)}
                onBlur={() => setHover(null)}
                onClick={() => (onAbrir ? onAbrir(t.id) : setHover(hover === t.id ? null : t.id))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAbrir?.(t.id);
                  }
                }}
              >
                <rect
                  x={-4}
                  y={-4}
                  width={size + 8}
                  height={size + 8}
                  rx={8}
                  fill="none"
                  stroke="var(--brand-primary)"
                  strokeWidth={2}
                  opacity={0}
                />
                <rect x={-6} y={-6} width={size + 12} height={size + 12} fill="transparent" />
                <g
                  style={{
                    transform:
                      hover === t.id
                        ? `translate(${size / 2}px, ${size / 2}px) scale(1.15) translate(${-size / 2}px, ${-size / 2}px)`
                        : undefined,
                    transition: 'transform 120ms',
                  }}
                  pointerEvents="none"
                >
                  <FormaSvg
                    forma={formaDeEstado(t.estado)}
                    color={color}
                    tamano={tam}
                    anillo={anillo}
                    inicial={conIniciales ? t.responsable.charAt(0) : undefined}
                  />
                </g>
              </g>
            );
          })}
        </svg>
      )}
      {activo && (
        <div
          role="tooltip"
          className="anim-fade pointer-events-none absolute z-10 w-60 rounded-[12px] border border-line bg-raised p-3 text-sm shadow-modal"
          style={{
            left: Math.min(Math.max(8, activo.x - 120), Math.max(8, w - 248)),
            top: activo.y > h / 2 ? activo.y - 128 : activo.y + tam,
          }}
        >
          <p className="text-xs text-muted tabular">{activo.t.codigo}</p>
          <p className="leading-snug font-medium">{activo.t.titulo}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{activo.t.responsable}</span>
            <span className="tabular">{activo.t.progreso} %</span>
            <span>{NOMBRE_ESTADO[activo.t.estado]}</span>
            {activo.t.vence_en && (
              <span className="tabular">Vence {fechaCorta(activo.t.vence_en)}</span>
            )}
          </div>
          {semaforo(activo.t)?.urgente && (
            <p className="mt-1 text-xs font-medium text-danger-text">{semaforo(activo.t)?.texto}</p>
          )}
        </div>
      )}
    </div>
  );
}
