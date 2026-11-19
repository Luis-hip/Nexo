import type { ReporteEquipo } from '@nexo/shared';
import { Download } from 'lucide-react';
import {
  Avatar,
  Barra,
  Encabezado,
  EsqueletoTarjetas,
  EstadosDatos,
  Tarjeta,
} from '@/components/ui';
import { urlApi } from '@/lib/api';
import { useReporte } from '@/lib/consultasVistas';
import { NOMBRE_ESTADO } from '@/lib/tareas';
import { useEquipoActual } from '../contexto';

const ORDEN = [
  'propuesta',
  'backlog',
  'aceptada',
  'habilitada',
  'en_curso',
  'atascada',
  'completada',
  'rechazada',
  'cancelada',
] as const;

/** Enlace de descarga del CSV (EQ-17): lo abre el navegador con la cookie de sesión. */
function EnlaceExportar({
  equipoId,
  soloMias,
  children,
}: {
  equipoId: string;
  soloMias: boolean;
  children: string;
}) {
  return (
    <a
      href={urlApi(`/equipos/${equipoId}/reportes/exportar?solo_mias=${soloMias}`)}
      className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line-strong/60 bg-raised px-3 text-sm font-medium hover:bg-surface"
    >
      <Download className="size-4" aria-hidden /> {children}
    </a>
  );
}

/** EQ-16 y EQ-17: reporte del equipo y exportación a CSV (un integrante solo exporta lo suyo). */
export function Reportes() {
  const { equipo, puede } = useEquipoActual();
  const consulta = useReporte(equipo.id);
  const exportaTodo = puede('exportar_reportes').permitido;
  return (
    <div className="space-y-5" data-name="NX/EQ-16-Reportes">
      <Encabezado
        titulo="Reportes"
        descripcion="Cómo va el trabajo del equipo."
        acciones={
          <span className="flex flex-wrap gap-2" data-name="NX/EQ-17-Exportar">
            {exportaTodo && (
              <EnlaceExportar equipoId={equipo.id} soloMias={false}>
                Exportar todo (CSV)
              </EnlaceExportar>
            )}
            <EnlaceExportar equipoId={equipo.id} soloMias>
              Exportar mis tareas
            </EnlaceExportar>
          </span>
        }
      />
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={3} />}>
        {(r) => <Contenido r={r} />}
      </EstadosDatos>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string | number;
  detalle?: string;
}) {
  return (
    <Tarjeta className="p-4">
      <p className="text-xs text-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{valor}</p>
      {detalle && <p className="text-xs text-muted">{detalle}</p>}
    </Tarjeta>
  );
}

function Contenido({ r }: { r: ReporteEquipo }) {
  const total = Object.values(r.por_estado).reduce((n, x) => n + x, 0);
  const cumplimiento = r.completadas > 0 ? Math.round((r.a_tiempo / r.completadas) * 100) : 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Tareas" valor={total} detalle="Sin contar archivadas" />
        <Indicador titulo="Completadas" valor={r.completadas} />
        <Indicador
          titulo="A tiempo"
          valor={`${cumplimiento} %`}
          detalle={`${r.a_tiempo} a tiempo · ${r.con_retraso} con retraso`}
        />
        <Indicador titulo="Vencidas sin terminar" valor={r.vencidas} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="rep-estados">
          <h2 id="rep-estados" className="mb-3 font-semibold">
            Por estado
          </h2>
          <ul className="space-y-2">
            {ORDEN.filter((e) => (r.por_estado[e] ?? 0) > 0).map((e) => (
              <li key={e} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span>{NOMBRE_ESTADO[e]}</span>
                <Barra
                  valor={total ? ((r.por_estado[e] ?? 0) / total) * 100 : 0}
                  etiqueta={`Tareas en ${NOMBRE_ESTADO[e]}`}
                />
                <span className="text-right tabular">{r.por_estado[e]}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="rep-sprints">
          <h2 id="rep-sprints" className="mb-3 font-semibold">
            Últimos sprints
          </h2>
          {r.sprints.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay sprints iniciados.</p>
          ) : (
            <ul className="space-y-2">
              {r.sprints.map((s) => (
                <li
                  key={s.numero}
                  className="grid grid-cols-[5rem_1fr_3.5rem] items-center gap-2 text-sm"
                >
                  <span>Sprint {s.numero}</span>
                  <Barra
                    valor={s.total ? (s.completadas / s.total) * 100 : 0}
                    tono={s.total > 0 && s.completadas === s.total ? 'ok' : 'marca'}
                    etiqueta={`Avance del Sprint ${s.numero}`}
                  />
                  <span className="text-right tabular">
                    {s.completadas}/{s.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
      <Tarjeta as="section" className="overflow-x-auto p-4 sm:p-5" aria-labelledby="rep-personas">
        <h2 id="rep-personas" className="mb-3 font-semibold">
          Por persona
        </h2>
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1.5 font-medium">Persona</th>
              <th className="py-1.5 text-right font-medium">Abiertas</th>
              <th className="py-1.5 text-right font-medium">Completadas</th>
              <th className="py-1.5 text-right font-medium">A tiempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.por_persona.map((p) => (
              <tr key={p.usuario_id}>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <Avatar persona={{ nombre: p.nombre, colorIdx: p.color_idx }} tamano={24} />
                    {p.nombre}
                  </span>
                </td>
                <td className="py-2 text-right tabular">{p.abiertas}</td>
                <td className="py-2 text-right tabular">{p.completadas}</td>
                <td className="py-2 text-right tabular">{p.a_tiempo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  );
}
