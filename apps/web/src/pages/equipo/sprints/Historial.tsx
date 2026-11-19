import { History, MessagesSquare } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Boton,
  EsqueletoLista,
  EsqueletoTarjetas,
  EstadosDatos,
  Tarjeta,
  Vacio,
} from '@/components/ui';
import { useSprint, useSprints } from '@/lib/consultasSprints';
import { fechaCorta } from '@/lib/fechas';
import { useEquipoActual } from '../contexto';
import { DetalleSprint, InsigniaSprint, porcentaje, rangoFechas } from './comunes';

/** EQ-13: historial de sprints cerrados con su resultado y su retrospectiva. */
export function HistorialSprints() {
  const { equipo, base } = useEquipoActual();
  const consulta = useSprints(equipo.id);
  return (
    <EstadosDatos
      consulta={consulta}
      esqueleto={<EsqueletoLista filas={3} />}
      estaVacio={(l) => !l.some((s) => s.estado === 'cerrado')}
      vacio={
        <Vacio
          icono={<History />}
          titulo="Todavía no hay sprints cerrados"
          texto="Al cerrar un sprint, aquí queda su resultado con la foto final del avance."
        />
      }
    >
      {(lista) => (
        <ol className="space-y-2" data-name="NX/EQ-13-Historial-sprints">
          {lista
            .filter((s) => s.estado === 'cerrado')
            .map((s) => (
              <li key={s.id}>
                <Tarjeta className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:p-4">
                  <Link
                    to={`${base}/sprints/historial/${s.id}`}
                    className="min-w-0 flex-1 rounded-[8px] focus-visible:outline-2"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Sprint {s.numero}</span>
                      <InsigniaSprint estado={s.estado} />
                      <span className="text-xs text-muted tabular">{rangoFechas(s)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted">
                      {s.objetivo || 'Sin objetivo escrito.'}
                    </span>
                  </Link>
                  <span className="text-sm tabular">
                    <strong>
                      {s.completadas}/{s.total}
                    </strong>{' '}
                    completadas ({porcentaje(s)} %)
                  </span>
                  <Link
                    to={`${base}/sprints/retro/${s.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
                  >
                    <MessagesSquare className="size-4" aria-hidden />
                    {s.retro
                      ? s.retro.cerrada
                        ? 'Retrospectiva cerrada'
                        : 'Retrospectiva abierta'
                      : 'Sin retrospectiva'}
                  </Link>
                </Tarjeta>
              </li>
            ))}
        </ol>
      )}
    </EstadosDatos>
  );
}

/** Detalle de un sprint del historial: la foto final, su burndown y sus tareas completadas. */
export function SprintHistorico() {
  const { equipo, base } = useEquipoActual();
  const { sprintId } = useParams();
  const nav = useNavigate();
  const consulta = useSprint(equipo.id, sprintId);
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
      {(s) => (
        <DetalleSprint
          nombre="NX/EQ-13-Sprint-cerrado"
          sprint={s}
          acciones={
            <>
              {s.cerrado_en && (
                <span className="text-sm text-muted">Cerrado el {fechaCorta(s.cerrado_en)}</span>
              )}
              <Boton tamano="sm" onClick={() => nav(`${base}/sprints/retro/${s.id}`)}>
                Ver retrospectiva
              </Boton>
            </>
          }
        />
      )}
    </EstadosDatos>
  );
}
