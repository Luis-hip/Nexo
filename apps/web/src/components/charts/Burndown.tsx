import type { PuntoBurndown, TareaEquipo } from '@nexo/shared';
import { useId, useMemo, useState } from 'react';
import { useColorDe } from '@/components/ui';
import { fechaCorta, fechaDia, hora } from '@/lib/fechas';
import { useAnchoContenedor } from './HillChart';

const MS_DIA = 86_400_000;

/** Medianoche local de una fecha `AAAA-MM-DD` (las de sprint se leen como día local). */
const medianoche = (dia: string) =>
  new Date(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10)).getTime();

export type Ritmo = 'adelantado' | 'en_ritmo' | 'atrasado';

/** Un punto de la línea de Avance: una tarea completada, en el momento real en que se completó. */
export interface NodoAvance {
  tarea: TareaEquipo;
  t: number;
  /** Tareas pendientes después de completarse esta. */
  pendientes: number;
}

export interface DatosBurndown {
  t0: number;
  /** Fin del último día del sprint: ahí la Expectativa llega a cero. */
  tFin: number;
  /** Borde derecho del eje (el fin, o el cierre si fue más tarde). */
  t1: number;
  /** Tareas del sprint al iniciar: de ahí parte la Expectativa. */
  inicial: number;
  /** Tareas con las que parte el Avance (incluye las agregadas después del inicio). */
  total: number;
  agregadas: number;
  nodos: NodoAvance[];
  /** Escalones de la línea de Avance (momento y pendientes después de bajar). */
  escalones: { t: number; pendientes: number }[];
  /**
   * Sin tareas completadas con fecha (sprints viejos o datos de demostración que solo guardaron la
   * foto diaria), el Avance sale de las instantáneas y no lleva nodos por tarea.
   */
  porFotos: boolean;
  /** Hasta dónde llega la línea de Avance: ahora, o el cierre si el sprint ya terminó. */
  tFinal: number;
  pendientes: number;
  esperadas: number;
  ritmo: Ritmo;
}

/**
 * Calcula el burndown (retroalimentación, bloque 6). La Expectativa baja de las tareas del inicio
 * (primera instantánea del sprint) a cero al terminar el último día. El Avance parte de las tareas
 * del sprint y baja 1 en el momento real en que se completa cada una; una tarea reabierta deja de
 * estar completada y su nodo desaparece solo.
 */
export function calcularBurndown({
  inicio,
  fin,
  serie,
  tareas,
  ahora,
  cerradoEn,
}: {
  inicio: string;
  fin: string;
  serie: PuntoBurndown[];
  tareas: TareaEquipo[];
  ahora: number;
  cerradoEn?: string | null;
}): DatosBurndown {
  const t0 = medianoche(inicio);
  const finDia = medianoche(fin) + MS_DIA;
  const cierre = cerradoEn ? Date.parse(cerradoEn) : null;
  const t1 = Math.max(finDia, cierre ?? 0);
  const fotos = [...serie].sort((a, b) => a.dia.localeCompare(b.dia));
  // Al cerrar, las tareas sin terminar pasan al siguiente sprint: la última foto conserva el total.
  const total = Math.max(tareas.length, fotos.at(-1)?.total ?? 0);
  const inicial = Math.min(total, fotos.find((p) => p.dia >= inicio)?.total ?? total) || total;
  const completadas = tareas
    .filter((t) => t.estado === 'completada' && t.completada_en)
    .map((t) => ({ tarea: t, t: Math.max(t0, Date.parse(t.completada_en as string)) }))
    .sort((a, b) => a.t - b.t);
  const nodos = completadas.map((c, i) => ({ ...c, pendientes: total - i - 1 }));
  const tFinal = Math.min(cierre ?? ahora, t1);
  const porFotos = nodos.length === 0 && fotos.some((p) => p.completadas > 0);
  const escalones = porFotos
    ? fotos
        .filter((p) => p.dia >= inicio)
        .map((p) => ({
          // La foto se toma al terminar el día.
          t: Math.min(medianoche(p.dia) + MS_DIA, tFinal),
          pendientes: p.total - p.completadas,
        }))
    : nodos.map((n) => ({ t: n.t, pendientes: n.pendientes }));
  const pendientes = escalones.filter((e) => e.t <= tFinal).at(-1)?.pendientes ?? total;
  const fraccion = Math.min(1, Math.max(0, (tFinal - t0) / (finDia - t0)));
  const esperadas = Math.round(inicial * (1 - fraccion));
  const ritmo: Ritmo =
    pendientes > esperadas ? 'atrasado' : pendientes < esperadas ? 'adelantado' : 'en_ritmo';
  return {
    t0,
    tFin: finDia,
    t1,
    inicial,
    total,
    agregadas: Math.max(0, total - inicial),
    nodos,
    escalones,
    porFotos,
    tFinal,
    pendientes,
    esperadas,
    ritmo,
  };
}

const tareasTxt = (n: number) => `${n} ${n === 1 ? 'tarea' : 'tareas'}`;

/** Frase bajo la gráfica, sin decimales: adelantado, en ritmo o atrasado. */
export function resumenBurndown(
  d: Pick<DatosBurndown, 'pendientes' | 'esperadas' | 'ritmo'>,
  dia: string,
) {
  const faltan = `Al ${dia} ${d.pendientes === 1 ? 'falta' : 'faltan'} ${tareasTxt(d.pendientes)}`;
  const dif = Math.abs(d.pendientes - d.esperadas);
  if (d.ritmo === 'en_ritmo') return `${faltan}, justo lo planeado. Vas en ritmo.`;
  const deberian =
    d.esperadas === 0
      ? 'según lo planeado ya no debería faltar ninguna'
      : `según lo planeado ${d.esperadas === 1 ? 'debería faltar' : 'deberían faltar'} ${d.esperadas}`;
  return d.ritmo === 'atrasado'
    ? `${faltan}; ${deberian}. Vas atrasado por ${tareasTxt(dif)}.`
    : `${faltan}; ${deberian}. Vas adelantado por ${tareasTxt(dif)}.`;
}

/** Marcas enteras del eje Y (cuenta tareas): todas si son pocas; si no, de N en N. */
function marcasEnteras(maximo: number) {
  const paso = Math.max(1, Math.ceil(maximo / 6));
  const marcas: number[] = [];
  for (let v = 0; v <= maximo; v += paso) marcas.push(v);
  if (marcas.at(-1) !== maximo) marcas.push(maximo);
  return marcas;
}

const ALTO = 280;
const PAD = { izq: 52, der: 16, arr: 16, aba: 58 };
const RADIO = 6;

/**
 * Burndown del sprint (EQ-09, EQ-13): «Avance» (línea sólida) contra «Expectativa» (punteada).
 * Responde si el equipo va adelantado, en ritmo o atrasado; el Hill Chart dice en qué estado está
 * cada tarea. Cada tarea completada es un punto del color de su responsable (la misma regla que el
 * Hill Chart y los avatares) que muestra su nombre y abre su detalle.
 */
export function Burndown({
  inicio,
  fin,
  serie,
  tareas,
  hoy,
  cerradoEn,
  onAbrir,
  className,
}: {
  inicio: string;
  fin: string;
  serie: PuntoBurndown[];
  tareas: TareaEquipo[];
  /** Día de hoy en la zona del equipo (sprint activo): el texto dice «Al <hoy>…». */
  hoy?: string;
  cerradoEn?: string | null;
  onAbrir?: (tareaId: string) => void;
  className?: string;
}) {
  const id = useId();
  const colorDe = useColorDe();
  const { ref, w } = useAnchoContenedor();
  // Se fija al montar: la línea llega hasta «ahora» sin volver a dibujarse cada segundo.
  const [ahora] = useState(() => Date.now());
  const d = useMemo(
    () => calcularBurndown({ inicio, fin, serie, tareas, ahora, cerradoEn }),
    [inicio, fin, serie, tareas, ahora, cerradoEn],
  );
  const [activo, setActivo] = useState<number | null>(null);
  const [foco, setFoco] = useState<number | null>(null);

  const W = Math.max(w, 280);
  const ancho = W - PAD.izq - PAD.der;
  const maximo = Math.max(1, d.total, d.inicial);
  const x = (t: number) => PAD.izq + ((t - d.t0) / (d.t1 - d.t0)) * ancho;
  const y = (v: number) => PAD.arr + (1 - v / maximo) * (ALTO - PAD.arr - PAD.aba);
  const dias = Math.round((d.t1 - d.t0) / MS_DIA);
  const anchoDia = ancho / Math.max(1, dias);

  // Posición de cada nodo; si dos caen casi encima (mismo minuto), se separan lo justo para clicarlos.
  const puntos = d.nodos.map((n) => ({ ...n, px: x(n.t), py: y(n.pendientes) }));
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1];
    const b = puntos[i];
    if (a && b && Math.hypot(b.px - a.px, b.py - a.py) < RADIO * 2 + 3) {
      b.px = Math.min(a.px + RADIO * 2 + 3, PAD.izq + ancho);
    }
  }
  const visibles = puntos.filter((p) => p.t <= d.tFinal);
  let camino = `M${x(d.t0)},${y(d.total)}`;
  if (d.porFotos) {
    for (const e of d.escalones) camino += ` H${x(e.t)} V${y(e.pendientes)}`;
  } else {
    for (const p of visibles) camino += ` H${p.px} V${p.py}`;
  }
  camino += ` H${x(d.tFinal)}`;

  const diaResumen = hoy ? fechaDia(hoy) : fechaCorta(new Date(d.tFinal - 1).toISOString());
  const resumen = resumenBurndown(d, diaResumen);
  const sel = activo !== null ? visibles[activo] : undefined;
  const persona = (t: TareaEquipo) => t.responsable?.nombre ?? 'Sin responsable';
  const cuando = (t: number) =>
    `${fechaCorta(new Date(t).toISOString())}, ${hora(new Date(t).toISOString())}`;
  const etiquetaNodo = (p: (typeof visibles)[number]) =>
    `T-${String(p.tarea.codigo).padStart(2, '0')} ${p.tarea.titulo}. Completada por ${persona(p.tarea)} el ${cuando(p.t)}. Abrir el detalle.`;

  return (
    <figure className={className} data-name="NX/EQ-09-Burndown">
      <div ref={ref} className="relative">
        {w > 0 && (
          <svg
            width={W}
            height={ALTO}
            role="group"
            aria-labelledby={`${id}-titulo`}
            aria-describedby={`${id}-resumen`}
            className="block"
          >
            <title id={`${id}-titulo`}>Burndown del sprint: Avance contra Expectativa</title>
            <g aria-hidden>
              {marcasEnteras(maximo).map((v) => (
                <g key={v}>
                  <line
                    x1={PAD.izq}
                    x2={W - PAD.der}
                    y1={y(v)}
                    y2={y(v)}
                    stroke="var(--border-subtle)"
                  />
                  <text
                    x={PAD.izq - 8}
                    y={y(v) + 4}
                    textAnchor="end"
                    className="fill-[var(--text-secondary)] text-[11px] tabular"
                  >
                    {v}
                  </text>
                </g>
              ))}
              {/* Eje X: una marca por día y, si hay espacio, el número del día. */}
              {Array.from({ length: dias + 1 }, (_, k) => (
                <line
                  key={k}
                  x1={x(d.t0 + k * MS_DIA)}
                  x2={x(d.t0 + k * MS_DIA)}
                  y1={ALTO - PAD.aba}
                  y2={ALTO - PAD.aba + 4}
                  stroke="var(--border-strong)"
                />
              ))}
              {anchoDia >= 22 &&
                Array.from({ length: dias }, (_, k) => (
                  <text
                    key={k}
                    x={x(d.t0 + (k + 0.5) * MS_DIA)}
                    y={ALTO - PAD.aba + 15}
                    textAnchor="middle"
                    className="fill-[var(--text-secondary)] text-[10px] tabular"
                  >
                    {new Date(d.t0 + (k + 0.5) * MS_DIA).getDate()}
                  </text>
                ))}
              <text
                x={PAD.izq}
                y={ALTO - PAD.aba + 30}
                className="fill-[var(--text-secondary)] text-[11px]"
              >
                Inicio {fechaDia(inicio)}
              </text>
              <text
                x={W - PAD.der}
                y={ALTO - PAD.aba + 30}
                textAnchor="end"
                className="fill-[var(--text-secondary)] text-[11px]"
              >
                Fin {fechaDia(fin)}
              </text>
              <text
                x={PAD.izq + ancho / 2}
                y={ALTO - 6}
                textAnchor="middle"
                className="fill-[var(--text-primary)] text-[11px] font-medium"
              >
                Duración del sprint (días)
              </text>
              <text
                transform={`translate(14 ${PAD.arr + (ALTO - PAD.arr - PAD.aba) / 2}) rotate(-90)`}
                textAnchor="middle"
                className="fill-[var(--text-primary)] text-[11px] font-medium"
              >
                Tareas pendientes del sprint
              </text>
              {/* Expectativa: completa desde el primer día, de la fecha de inicio a la de fin. */}
              <line
                x1={x(d.t0)}
                y1={y(d.inicial)}
                x2={x(d.tFin)}
                y2={y(0)}
                stroke="var(--border-strong)"
                strokeDasharray="6 5"
                strokeWidth={2}
              />
              {/* Avance: crece hasta ahora; sin nodo al final. */}
              <path
                d={camino}
                fill="none"
                stroke="var(--brand-primary)"
                strokeWidth={3}
                strokeLinejoin="round"
              />
              {/* Nodo inicial (inicio del sprint, N pendientes) en color neutro. */}
              <circle
                cx={x(d.t0)}
                cy={y(d.total)}
                r={RADIO - 1}
                fill="var(--text-secondary)"
                stroke="var(--bg-raised)"
                strokeWidth={2}
              />
            </g>
            {visibles.map((p, i) => (
              <g
                key={p.tarea.id}
                role="button"
                tabIndex={0}
                aria-label={etiquetaNodo(p)}
                className="cursor-pointer outline-none"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => foco !== i && setActivo(null)}
                onFocus={() => {
                  setFoco(i);
                  setActivo(i);
                }}
                onBlur={() => {
                  setFoco(null);
                  setActivo(null);
                }}
                onClick={() => onAbrir?.(p.tarea.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAbrir?.(p.tarea.id);
                  }
                }}
              >
                {/* Área de clic más grande que el punto. */}
                <circle cx={p.px} cy={p.py} r={RADIO + 6} fill="transparent" />
                {foco === i && (
                  <circle
                    cx={p.px}
                    cy={p.py}
                    r={RADIO + 4}
                    fill="none"
                    stroke="var(--brand-primary)"
                    strokeWidth={2}
                  />
                )}
                <circle
                  cx={p.px}
                  cy={p.py}
                  r={activo === i ? RADIO + 1 : RADIO}
                  fill={colorDe(p.tarea.responsable?.color_idx).color}
                  // Contorno para que los colores claros se distingan del fondo (tema claro y oscuro).
                  stroke="var(--text-secondary)"
                  strokeWidth={1.5}
                />
              </g>
            ))}
          </svg>
        )}
        {sel && (
          <div
            role="tooltip"
            className="anim-fade pointer-events-none absolute z-10 w-60 rounded-[12px] border border-line bg-raised p-3 text-sm shadow-modal"
            style={{
              left: Math.min(Math.max(8, sel.px - 120), Math.max(8, W - 248)),
              top: sel.py > ALTO / 2 ? sel.py - 104 : sel.py + 14,
            }}
          >
            <p className="text-xs text-muted tabular">
              T-{String(sel.tarea.codigo).padStart(2, '0')}
            </p>
            <p className="leading-snug font-medium">{sel.tarea.titulo}</p>
            <p className="mt-1 text-xs text-muted">
              {persona(sel.tarea)} · completada el <span className="tabular">{cuando(sel.t)}</span>
            </p>
          </div>
        )}
      </div>
      <figcaption className="mt-2 space-y-1.5 text-xs text-muted">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded bg-brand" aria-hidden /> Avance
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0 w-5 border-t-2 border-dashed border-line-strong" aria-hidden />
            Expectativa
          </span>
        </span>
        <span id={`${id}-resumen`} className="block text-sm text-fg">
          {resumen}
        </span>
        {!d.porFotos && (
          <span className="block">
            El color de cada punto identifica al responsable de la tarea completada.
          </span>
        )}
        {d.porFotos && (
          <span className="block">
            Este sprint no guarda cuándo se completó cada tarea: el Avance sale de la foto de cada
            día y no tiene puntos por tarea.
          </span>
        )}
        {d.agregadas > 0 && (
          <span className="block">
            {d.agregadas === 1
              ? 'Se agregó 1 tarea después de iniciar el sprint: el Avance la cuenta desde el inicio; la Expectativa no.'
              : `Se agregaron ${d.agregadas} tareas después de iniciar el sprint: el Avance las cuenta desde el inicio; la Expectativa no.`}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
