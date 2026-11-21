import type { ReportePersonal } from '@nexo/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Encabezado, EsqueletoTarjetas, EstadosDatos, Tarjeta } from '@/components/ui';
import { api } from '@/lib/api';
import { EnviarMiReporte } from '@/components/whatsapp/Directo';

/**
 * FALT-01: reportes personales. Tus tareas personales y las de equipo que tienes a cargo (solo de
 * los equipos donde sigues activo), con cumplimiento y un resumen por espacio.
 */
export function ReportesPersonales() {
  const consulta = useQuery({
    queryKey: ['personal', 'reporte'],
    queryFn: () => api<ReportePersonal>('/personal/reporte'),
  });
  return (
    <div className="space-y-5" data-name="NX/FALT-01-Reportes-personales">
      <Encabezado
        titulo="Mis reportes"
        descripcion="Tus tareas personales y las de equipo a tu cargo."
        acciones={<EnviarMiReporte />}
      />
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
        {(r) => {
          const total = Object.values(r.por_estado).reduce((n, x) => n + x, 0);
          const cumplimiento =
            r.completadas > 0 ? Math.round((r.a_tiempo / r.completadas) * 100) : 0;
          return (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Tareas', total, 'Personales y de equipo'],
                  ['Completadas', r.completadas, undefined],
                  [
                    'A tiempo',
                    `${cumplimiento} %`,
                    `${r.a_tiempo} a tiempo · ${r.con_retraso} con retraso`,
                  ],
                  ['Vencidas sin terminar', r.vencidas, undefined],
                ].map(([t, v, d]) => (
                  <Tarjeta key={String(t)} className="p-4">
                    <p className="text-xs text-muted">{t}</p>
                    <p className="mt-1 text-2xl font-semibold tabular">{v}</p>
                    {d && <p className="text-xs text-muted">{d}</p>}
                  </Tarjeta>
                ))}
              </div>
              <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="por-espacio">
                <h2 id="por-espacio" className="mb-3 font-semibold">
                  Por espacio
                </h2>
                <ul className="divide-y divide-line">
                  {r.por_espacio.map((x) => (
                    <li
                      key={x.equipo_id ?? 'personal'}
                      className="flex items-center gap-3 py-2 text-sm"
                    >
                      <Link
                        to={x.equipo_id ? `/app/e/${x.equipo_id}/reportes` : '/app/personal/tareas'}
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        {x.nombre}
                      </Link>
                      <span className="text-muted tabular">
                        {x.abiertas} abiertas · {x.completadas} completadas
                      </span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            </div>
          );
        }}
      </EstadosDatos>
    </div>
  );
}
