import { CalendarDays, CheckSquare, Clock, KanbanSquare, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { HillChart } from '@/components/charts/HillChart';
import { useAcciones, useSesion } from '@/components/shell/contexto';
import {
  Banner,
  Barra,
  Boton,
  Encabezado,
  EsqueletoTarjetas,
  EstadosDatos,
  FormaSvg,
  InsigniaSemaforo,
  Tarjeta,
  Vacio,
  useColorDe,
} from '@/components/ui';
import { useTareas } from '@/lib/consultas';
import { diasHasta, relativo } from '@/lib/fechas';
import { COLUMNAS_PERSONAL, formaDeEstado } from '@/lib/tareas';

const CLAVE_TARJETA = 'nexo.tarjeta-equipo';

/** PER-01: inicio personal, con el Hill Chart personal en solo lectura (arrastrar: Fase 3). */
export function InicioPersonal() {
  const yo = useSesion();
  const acc = useAcciones();
  const consulta = useTareas();
  const colorDe = useColorDe();
  const { color } = colorDe(null);
  const [descartada, setDescartada] = useState(
    () => sessionStorage.getItem(CLAVE_TARJETA) === yo.usuario.id,
  );
  const sinEquipos = yo.equipos.length === 0;
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="space-y-5" data-name="NX/PER-01-Inicio-personal">
      <Encabezado
        titulo={`${saludo}, ${yo.usuario.nombre.split(' ')[0]}`}
        descripcion="Tu espacio personal: solo tú ves estas tareas."
      />
      {!descartada && (
        <Banner
          tono="marca"
          icono={<Users />}
          onCerrar={() => {
            sessionStorage.setItem(CLAVE_TARJETA, yo.usuario.id);
            setDescartada(true);
          }}
          accion={
            <>
              <Link
                to="/app/equipos/nuevo"
                className="inline-flex h-9 items-center rounded-[8px] bg-brand px-3 text-sm font-medium text-on-brand"
              >
                Crear equipo
              </Link>
              <Link
                to="/app/equipos/unirse"
                className="inline-flex h-9 items-center rounded-[8px] border border-line bg-raised px-3 text-sm font-medium"
              >
                Unirme
              </Link>
            </>
          }
        >
          {sinEquipos
            ? '¿Trabajas con otras personas? Crea un equipo o únete a uno.'
            : 'Puedes crear otro equipo o unirte con un código.'}
        </Banner>
      )}

      <EstadosDatos
        consulta={consulta}
        esqueleto={<EsqueletoTarjetas />}
        vacio={
          <Tarjeta className="p-6">
            <Vacio
              icono={<CheckSquare />}
              titulo="Aún no tienes tareas"
              texto="Crea tu primera tarea para organizar tu trabajo."
              accion={
                <Boton
                  variante="primario"
                  icono={<Plus className="size-4" />}
                  onClick={acc.nuevaTarea}
                >
                  Nueva tarea
                </Boton>
              }
            />
          </Tarjeta>
        }
      >
        {(tareas) => {
          const activas = tareas.filter((t) => t.estado !== 'completada');
          const hoy = activas
            .filter((t) => ['habilitada', 'en_curso', 'atascada'].includes(t.estado))
            .sort((a, b) => (a.vence_en ?? '9').localeCompare(b.vence_en ?? '9'));
          const proximas = activas
            .filter((t) => t.vence_en)
            .sort((a, b) => (a.vence_en ?? '').localeCompare(b.vence_en ?? ''));
          const semana = proximas.filter((t) => {
            const d = diasHasta(t.vence_en ?? '');
            return d >= 0 && d <= 7;
          });
          const completadas = tareas.length - activas.length;
          return (
            <>
              <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="resumen-personal">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="resumen-personal" className="flex-1 text-base font-semibold">
                    Mi Hill Chart
                  </h2>
                  <Link
                    to="/app/personal/tareas?vista=tablero"
                    className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-brand px-3 text-sm font-medium text-on-brand"
                  >
                    <KanbanSquare className="size-4" aria-hidden />
                    Abrir tablero
                  </Link>
                </div>
                <div className="mt-3">
                  <HillChart
                    puntos={tareas.map((t) => ({
                      ...t,
                      codigo: `T-${String(t.codigo).padStart(2, '0')}`,
                      responsable: yo.usuario.nombre,
                    }))}
                    onAbrir={acc.abrirTarea}
                    etiqueta="Mi Hill Chart personal"
                  />
                </div>
                <p className="mt-2 text-sm text-muted tabular">
                  {completadas} de {tareas.length} tareas completadas
                </p>
                <Barra
                  className="mt-2"
                  etiqueta="Tareas completadas"
                  valor={(completadas / tareas.length) * 100}
                  tono="ok"
                />
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {COLUMNAS_PERSONAL.map((c) => (
                    <div key={c.estado} className="rounded-[10px] bg-surface px-3 py-2">
                      <dt className="flex items-center gap-1.5 text-xs text-muted">
                        <FormaSvg forma={formaDeEstado(c.estado)} color={color} tamano={10} />
                        {c.nombre}
                      </dt>
                      <dd className="text-xl font-semibold tabular">
                        {tareas.filter((t) => c.incluye.includes(t.estado)).length}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Tarjeta>

              <div className="grid gap-4 md:grid-cols-3">
                <Tarjeta className="p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CheckSquare className="size-5 text-muted" aria-hidden /> Hoy
                  </h2>
                  {hoy.length ? (
                    <ul className="divide-y divide-line">
                      {hoy.slice(0, 5).map((t) => (
                        <li key={t.id} className="flex items-center gap-2 py-2">
                          <FormaSvg forma={formaDeEstado(t.estado)} color={color} tamano={12} />
                          <button
                            type="button"
                            onClick={() => acc.abrirTarea(t.id)}
                            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                          >
                            {t.titulo}
                          </button>
                          <span className="text-xs text-muted tabular">{t.progreso} %</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Vacio compacto titulo="Nada pendiente hoy" />
                  )}
                </Tarjeta>
                <Tarjeta className="p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Clock className="size-5 text-muted" aria-hidden /> Próximas entregas
                  </h2>
                  {proximas.length ? (
                    <ul className="divide-y divide-line">
                      {proximas.slice(0, 5).map((t) => (
                        <li key={t.id} className="flex items-center gap-2 py-2">
                          <button
                            type="button"
                            onClick={() => acc.abrirTarea(t.id)}
                            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                          >
                            {t.titulo}
                          </button>
                          <InsigniaSemaforo tarea={t} conFecha={false} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Vacio compacto titulo="Sin entregas próximas" />
                  )}
                </Tarjeta>
                <Tarjeta className="p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="size-5 text-muted" aria-hidden /> Calendario breve
                  </h2>
                  {semana.length ? (
                    <ul className="divide-y divide-line">
                      {semana.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => acc.abrirTarea(t.id)}
                            className="flex w-full justify-between gap-2 py-2 text-left text-sm"
                          >
                            <span className="min-w-0 truncate font-medium">{t.titulo}</span>
                            <span className="shrink-0 text-xs text-muted tabular">
                              {relativo(t.vence_en ?? '')}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Vacio compacto titulo="Sin entregas esta semana" />
                  )}
                  <Link
                    to="/app/personal/calendario"
                    className="mt-2 inline-block text-sm text-brand hover:underline"
                  >
                    Ver calendario
                  </Link>
                </Tarjeta>
              </div>
            </>
          );
        }}
      </EstadosDatos>
    </div>
  );
}
