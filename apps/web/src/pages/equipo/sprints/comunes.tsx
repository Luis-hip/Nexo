import { diasRestantes, type EstadoSprint, type Sprint, type SprintDetalle } from '@nexo/shared';
import type { ReactNode } from 'react';
import { useAcciones } from '@/components/shell/contexto';
import { Burndown } from '@/components/charts/Burndown';
import { Avatar, Barra, Insignia, InsigniaEstado, Tarjeta, type Tono } from '@/components/ui';
import { fechaDia } from '@/lib/fechas';
import { codigoTarea } from '../tareas/comunes';

export const NOMBRE_ESTADO_SPRINT: Record<EstadoSprint, string> = {
  planificado: 'Planificado',
  activo: 'Activo',
  cerrado: 'Cerrado',
};
const TONO_ESTADO_SPRINT: Record<EstadoSprint, Tono> = {
  planificado: 'info',
  activo: 'marca',
  cerrado: 'neutro',
};

export function InsigniaSprint({ estado }: { estado: EstadoSprint }) {
  return <Insignia tono={TONO_ESTADO_SPRINT[estado]}>{NOMBRE_ESTADO_SPRINT[estado]}</Insignia>;
}

/** «18 nov – 1 dic». */
export const rangoFechas = (s: Pick<Sprint, 'inicio' | 'fin'>) =>
  `${fechaDia(s.inicio)} – ${fechaDia(s.fin)}`;

export const porcentaje = (s: Pick<Sprint, 'total' | 'completadas'>) =>
  s.total > 0 ? Math.round((s.completadas / s.total) * 100) : 0;

/** Resumen del avance: «5 de 7 tareas completadas (71 %)». */
export function Avance({ sprint }: { sprint: Sprint }) {
  const p = porcentaje(sprint);
  return (
    <div className="space-y-1.5">
      <p className="text-sm tabular">
        <strong>
          {sprint.completadas} de {sprint.total}
        </strong>{' '}
        {sprint.total === 1 ? 'tarea completada' : 'tareas completadas'} ({p} %)
      </p>
      <Barra valor={p} tono={p === 100 ? 'ok' : 'marca'} etiqueta="Avance del sprint" />
    </div>
  );
}

/**
 * Detalle de un sprint: encabezado, avance, burndown, capacidad y tareas. Lo usan el sprint
 * activo (EQ-09), el plan en modo lectura (EQ-10) y el historial (EQ-13).
 */
export function DetalleSprint({
  sprint,
  acciones,
  conBurndown = true,
  nombre,
}: {
  sprint: SprintDetalle;
  acciones?: ReactNode;
  conBurndown?: boolean;
  nombre?: string;
}) {
  const acc = useAcciones();
  // El último punto de un sprint activo es «hoy» en la zona horaria del equipo.
  const hoy = sprint.estado === 'activo' ? sprint.serie.at(-1)?.dia : undefined;
  const quedan = hoy ? diasRestantes(sprint.fin, hoy) : null;
  const horas = sprint.capacidad.reduce((n, c) => n + c.horas, 0);

  return (
    <div className="space-y-4" data-name={nombre}>
      <Tarjeta className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Sprint {sprint.numero}</h2>
              <InsigniaSprint estado={sprint.estado} />
            </div>
            <p className="text-sm text-muted tabular">
              {rangoFechas(sprint)}
              {quedan !== null &&
                ` · ${quedan === 0 ? 'terminó su plazo' : quedan === 1 ? 'queda 1 día' : `quedan ${quedan} días`}`}
            </p>
            <p className="text-sm">
              {sprint.objetivo || <span className="text-muted">Sin objetivo escrito.</span>}
            </p>
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </div>
        {sprint.estado !== 'planificado' && <Avance sprint={sprint} />}
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {conBurndown && sprint.estado !== 'planificado' && (
          <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby={`bd-${sprint.id}`}>
            <h3 id={`bd-${sprint.id}`} className="mb-3 font-semibold">
              Burndown
            </h3>
            <Burndown
              inicio={sprint.inicio}
              fin={sprint.fin}
              serie={sprint.serie}
              tareas={sprint.tareas}
              hoy={hoy}
              cerradoEn={sprint.cerrado_en}
              onAbrir={acc.abrirTarea}
            />
          </Tarjeta>
        )}
        <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby={`cap-${sprint.id}`}>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 id={`cap-${sprint.id}`} className="font-semibold">
              Capacidad
            </h3>
            <span className="text-sm text-muted tabular">{horas} h en total</span>
          </div>
          <ul className="space-y-2" data-name="NX/EQ-10-Capacidad">
            {sprint.capacidad.map((c) => (
              <li key={c.usuario_id} className="flex items-center gap-3">
                <Avatar persona={{ nombre: c.nombre, colorIdx: c.color_idx }} tamano={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span>
                <span className="text-sm text-muted tabular">
                  {c.horas} h · {c.tareas} {c.tareas === 1 ? 'tarea' : 'tareas'}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>

      <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby={`tar-${sprint.id}`}>
        <h3 id={`tar-${sprint.id}`} className="mb-3 font-semibold">
          {sprint.estado === 'cerrado' ? 'Tareas completadas' : 'Tareas del sprint'}
        </h3>
        {sprint.tareas.length === 0 ? (
          <p className="text-sm text-muted">
            {sprint.estado === 'planificado'
              ? 'Todavía no hay tareas en el plan.'
              : 'Este sprint no tiene tareas.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {sprint.tareas.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => acc.abrirTarea(t.id)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="w-12 shrink-0 text-xs text-muted tabular">
                    {codigoTarea(t.codigo)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.titulo}</span>
                  <InsigniaEstado estado={t.estado} />
                  {t.responsable && (
                    <Avatar
                      persona={{ nombre: t.responsable.nombre, colorIdx: t.responsable.color_idx }}
                      tamano={24}
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
