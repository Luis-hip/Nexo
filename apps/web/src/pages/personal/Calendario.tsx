import type { TareaPersonal } from '@nexo/shared';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAcciones } from '@/components/shell/contexto';
import {
  Boton,
  BotonIcono,
  Encabezado,
  Esqueleto,
  EstadosDatos,
  InsigniaSemaforo,
  Tarjeta,
  Vacio,
  cx,
} from '@/components/ui';
import { useTareas } from '@/lib/consultas';
import { etiquetaDia, mismaFecha } from '@/lib/fechas';
import { semaforo } from '@/lib/tareas';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const COLOR_PUNTO = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info' } as const;

/** Las 6 semanas (lunes a domingo) que cubren el mes de `ancla`. */
function semanasDelMes(ancla: Date): Date[] {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const desfase = (primero.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(primero.getFullYear(), primero.getMonth(), 1 - desfase + i),
  );
}

/**
 * PER-04: calendario personal. En la Fase 1 muestra las entregas de las tareas personales;
 * las reuniones y eventos llegan con el calendario del equipo (Fase 3).
 */
export function CalendarioPersonal() {
  const consulta = useTareas();
  const acc = useAcciones();
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [dia, setDia] = useState(hoy);
  const dias = useMemo(() => semanasDelMes(mes), [mes]);
  const titulo = mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));

  return (
    <div className="space-y-4" data-name="NX/PER-04-Calendario-personal">
      <Encabezado
        titulo="Calendario"
        descripcion="Las fechas de entrega de tus tareas personales."
        acciones={
          <>
            <BotonIcono etiqueta="Mes anterior" onClick={() => mover(-1)} tamano="sm">
              <ChevronLeft className="size-5" />
            </BotonIcono>
            <span
              className="min-w-36 text-center text-sm font-semibold capitalize"
              aria-live="polite"
            >
              {titulo}
            </span>
            <BotonIcono etiqueta="Mes siguiente" onClick={() => mover(1)} tamano="sm">
              <ChevronRight className="size-5" />
            </BotonIcono>
            <Boton
              tamano="sm"
              onClick={() => {
                setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
                setDia(hoy);
              }}
            >
              Hoy
            </Boton>
          </>
        }
      />
      <EstadosDatos consulta={consulta} esqueleto={<Esqueleto className="h-96" />}>
        {(tareas) => {
          const conFecha = tareas.filter((t) => t.vence_en);
          const delDia = (d: Date): TareaPersonal[] =>
            conFecha.filter((t) => mismaFecha(new Date(t.vence_en ?? ''), d));
          const seleccion = delDia(dia);
          return (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <Tarjeta className="p-2 sm:p-3">
                <div
                  className="grid grid-cols-7 text-center text-xs font-medium text-muted"
                  aria-hidden
                >
                  {DIAS.map((d) => (
                    <div key={d} className="py-1.5">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {dias.map((d) => {
                    const lista = delDia(d);
                    const fuera = d.getMonth() !== mes.getMonth();
                    const esHoy = mismaFecha(d, hoy);
                    const elegido = mismaFecha(d, dia);
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => setDia(d)}
                        aria-pressed={elegido}
                        aria-label={`${d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}, ${lista.length} ${lista.length === 1 ? 'entrega' : 'entregas'}`}
                        className={cx(
                          'flex min-h-14 flex-col items-center gap-1 rounded-[8px] border p-1 text-sm transition-colors sm:min-h-20 sm:items-stretch',
                          elegido
                            ? 'border-brand bg-brand/10'
                            : 'border-transparent hover:bg-surface',
                          fuera && 'text-muted opacity-60',
                        )}
                      >
                        <span
                          className={cx(
                            'grid size-7 place-items-center self-center rounded-full tabular sm:self-start',
                            esHoy && 'bg-brand font-semibold text-on-brand',
                          )}
                        >
                          {d.getDate()}
                        </span>
                        <span
                          className="flex flex-wrap justify-center gap-0.5 sm:hidden"
                          aria-hidden
                        >
                          {lista.slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className={cx(
                                'size-1.5 rounded-full',
                                COLOR_PUNTO[semaforo(t)?.nivel ?? 'info'],
                              )}
                            />
                          ))}
                        </span>
                        <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
                          {lista.slice(0, 2).map((t) => (
                            <span
                              key={t.id}
                              className="flex items-center gap-1 truncate rounded bg-surface px-1 text-left text-[11px]"
                            >
                              <span
                                className={cx(
                                  'size-1.5 shrink-0 rounded-full',
                                  COLOR_PUNTO[semaforo(t)?.nivel ?? 'info'],
                                )}
                              />
                              <span className="truncate">{t.titulo}</span>
                            </span>
                          ))}
                          {lista.length > 2 && (
                            <span className="text-left text-[11px] text-muted">
                              +{lista.length - 2} más
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Tarjeta>
              <Tarjeta as="section" className="p-4" aria-labelledby="dia-elegido">
                <h2 id="dia-elegido" className="mb-2 text-sm font-semibold">
                  {etiquetaDia(dia.toISOString())}
                </h2>
                {seleccion.length === 0 ? (
                  <Vacio compacto icono={<CalendarDays />} titulo="Sin entregas este día" />
                ) : (
                  <ul className="divide-y divide-line">
                    {seleccion.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => acc.abrirTarea(t.id)}
                          className={cx(
                            'min-w-0 flex-1 truncate text-left text-sm font-medium',
                            t.estado === 'completada' && 'text-muted line-through',
                          )}
                        >
                          {t.titulo}
                        </button>
                        <InsigniaSemaforo tarea={t} conFecha={false} />
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
          );
        }}
      </EstadosDatos>
    </div>
  );
}
