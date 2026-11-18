import { serieBurndown, type PuntoBurndown } from '@nexo/shared';
import { useMemo } from 'react';
import { fechaDia } from '@/lib/fechas';

/**
 * Burndown del sprint (EQ-09, EQ-13): tareas por terminar cada día según las instantáneas
 * (`sprint_instantaneas`) contra la línea ideal. SVG propio, como el Hill Chart; la tabla oculta
 * repite los datos para lectores de pantalla.
 */
export function Burndown({
  inicio,
  fin,
  serie,
  className,
}: {
  inicio: string;
  fin: string;
  serie: PuntoBurndown[];
  className?: string;
}) {
  const dias = useMemo(() => serieBurndown(inicio, fin, serie), [inicio, fin, serie]);
  const W = 640;
  const H = 220;
  const pad = { izq: 36, der: 16, arr: 16, aba: 30 };
  const maximo = Math.max(1, ...dias.map((d) => Math.max(d.ideal, d.restantes ?? 0)));
  const x = (i: number) =>
    pad.izq + (dias.length > 1 ? (i / (dias.length - 1)) * (W - pad.izq - pad.der) : 0);
  const y = (v: number) => pad.arr + (1 - v / maximo) * (H - pad.arr - pad.aba);
  const reales = dias.flatMap((d, i) => (d.restantes === null ? [] : [{ i, v: d.restantes }]));
  const ultimo = reales.at(-1);
  const resumen = ultimo
    ? `Faltan ${ultimo.v} ${ultimo.v === 1 ? 'tarea' : 'tareas'} el ${fechaDia(dias[ultimo.i]?.dia ?? inicio)}; la línea ideal marca ${dias[ultimo.i]?.ideal ?? 0}.`
    : 'Todavía no hay instantáneas de este sprint.';
  const marcasY = [...new Set([0, Math.round(maximo / 2), maximo])];

  return (
    <figure className={className} data-name="NX/EQ-09-Burndown">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Burndown del sprint. ${resumen}`}
      >
        {marcasY.map((v) => (
          <g key={v}>
            <line x1={pad.izq} x2={W - pad.der} y1={y(v)} y2={y(v)} stroke="var(--border-subtle)" />
            <text
              x={pad.izq - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-[var(--text-secondary)] text-[11px] tabular"
            >
              {v}
            </text>
          </g>
        ))}
        {dias.length > 0 && (
          <>
            <text
              x={x(0)}
              y={H - 8}
              className="fill-[var(--text-secondary)] text-[11px]"
              textAnchor="start"
            >
              {fechaDia(dias[0]?.dia ?? inicio)}
            </text>
            <text
              x={x(dias.length - 1)}
              y={H - 8}
              className="fill-[var(--text-secondary)] text-[11px]"
              textAnchor="end"
            >
              {fechaDia(dias.at(-1)?.dia ?? fin)}
            </text>
          </>
        )}
        <polyline
          fill="none"
          stroke="var(--border-strong)"
          strokeDasharray="6 5"
          strokeWidth={2}
          points={dias.map((d, i) => `${x(i)},${y(d.ideal)}`).join(' ')}
        />
        {reales.length > 0 && (
          <polyline
            fill="none"
            stroke="var(--brand-primary)"
            strokeWidth={3}
            strokeLinejoin="round"
            points={reales.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
          />
        )}
        {reales.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={4} fill="var(--brand-primary)" />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-brand" aria-hidden /> Tareas por terminar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-5 border-t-2 border-dashed border-line-strong" aria-hidden /> Ritmo
          ideal
        </span>
        <span>{resumen}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Tareas por terminar por día</caption>
        <thead>
          <tr>
            <th>Día</th>
            <th>Por terminar</th>
            <th>Ideal</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia}>
              <td>{fechaDia(d.dia)}</td>
              <td>{d.restantes ?? 'sin dato'}</td>
              <td>{d.ideal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
