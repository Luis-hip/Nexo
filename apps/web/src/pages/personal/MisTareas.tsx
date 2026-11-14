import type { EstadoTarea, EstadoTareaPersonal, TareaPersonal } from '@nexo/shared';
import { ArrowRight, Check, CheckSquare, KanbanSquare, List, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useAcciones } from '@/components/shell/contexto';
import {
  Boton,
  Encabezado,
  EstadosDatos,
  FormaSvg,
  InsigniaEstado,
  InsigniaSemaforo,
  Menu,
  Segmentado,
  Selector,
  Vacio,
  cx,
  useColorDe,
  useConfirmar,
} from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import { useActualizarTarea, useTareas } from '@/lib/consultas';
import { COLUMNAS_PERSONAL, formaDeEstado, semaforo } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { DetalleTareaPanel } from './DetalleTarea';
import { NOMBRE_ESTADO_PERSONAL } from './estados';

const columnaDe = (estado: EstadoTarea) =>
  COLUMNAS_PERSONAL.find((c) => c.incluye.includes(estado));

/** Mueve una tarea personal a otra columna, pidiendo el motivo si se atasca. */
function useMover() {
  const actualizar = useActualizarTarea();
  const confirmar = useConfirmar();
  return async (t: TareaPersonal, destino: EstadoTarea) => {
    if (columnaDe(t.estado)?.estado === destino) return;
    let motivo: string | undefined;
    if (destino === 'atascada') {
      const r = await confirmar({
        titulo: 'Marcar como atascada',
        mensaje: '¿Qué te bloquea?',
        confirmar: 'Marcar',
        conMotivo: { etiqueta: 'Motivo' },
      });
      if (!r) return;
      motivo = r.motivo;
    }
    actualizar.mutate(
      { id: t.id, version: t.version, estado: destino as EstadoTareaPersonal, motivo },
      {
        onSuccess: () =>
          toast(
            `«${t.titulo}» pasó a ${COLUMNAS_PERSONAL.find((c) => c.estado === destino)?.nombre}.`,
          ),
        onError: (e) =>
          toast(
            e instanceof ErrorApi && e.estado === 409
              ? 'Alguien cambió esta tarea. Te mostramos la versión más reciente.'
              : mensajeDeError(e),
            'danger',
          ),
      },
    );
  };
}

/** PER-02: mis tareas (lista y tablero simple). */
export function MisTareas() {
  const consulta = useTareas();
  const acc = useAcciones();
  const mover = useMover();
  const colorDe = useColorDe();
  const [sp, setSp] = useSearchParams();
  const vista = sp.get('vista') === 'tablero' ? 'tablero' : 'lista';
  const [estadoF, setEstadoF] = useState('');
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const { color } = colorDe(null);
  const pendientes = consulta.data?.filter((t) => t.estado !== 'completada').length;

  return (
    <div className="space-y-4" data-name="NX/PER-02-Mis-tareas">
      <Encabezado
        titulo="Mis tareas"
        descripcion={pendientes === undefined ? undefined : `${pendientes} pendientes`}
        acciones={
          <Boton
            variante="primario"
            tamano="sm"
            icono={<Plus className="size-4" />}
            onClick={acc.nuevaTarea}
            className="sm:hidden"
          >
            Nueva
          </Boton>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Vista"
          valor={vista}
          onChange={(v) => setSp({ vista: v })}
          opciones={[
            { valor: 'lista', etiqueta: 'Lista', icono: <List className="size-4" /> },
            { valor: 'tablero', etiqueta: 'Tablero', icono: <KanbanSquare className="size-4" /> },
          ]}
        />
        {vista === 'lista' && (
          <Selector
            aria-label="Estado"
            value={estadoF}
            onChange={(e) => setEstadoF(e.target.value)}
            className="h-10 w-44"
          >
            <option value="">Todos los estados</option>
            {COLUMNAS_PERSONAL.map((c) => (
              <option key={c.estado} value={c.estado}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        )}
      </div>

      <EstadosDatos
        consulta={consulta}
        vacio={
          <Vacio
            icono={<CheckSquare />}
            titulo="Sin tareas"
            texto="Crea tu primera tarea personal."
            accion={
              <Boton variante="primario" onClick={acc.nuevaTarea}>
                Nueva tarea
              </Boton>
            }
          />
        }
      >
        {(tareas) => {
          if (vista === 'lista') {
            const filtradas = tareas.filter(
              (t) => !estadoF || columnaDe(t.estado)?.estado === estadoF,
            );
            if (filtradas.length === 0)
              return <Vacio compacto titulo="Sin tareas en este estado" />;
            return (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {filtradas.map((t) => {
                  const hecha = t.estado === 'completada';
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                      <button
                        type="button"
                        aria-label={hecha ? `Reabrir ${t.titulo}` : `Completar ${t.titulo}`}
                        onClick={() => mover(t, hecha ? 'en_curso' : 'completada')}
                        className={cx(
                          'grid size-6 shrink-0 place-items-center rounded-full border-2',
                          hecha ? 'border-ok bg-ok text-canvas' : 'border-line-strong',
                        )}
                      >
                        {hecha && <Check className="size-3.5" aria-hidden />}
                      </button>
                      <button
                        type="button"
                        onClick={() => acc.abrirTarea(t.id)}
                        className="min-w-0 flex-1 basis-40 text-left"
                      >
                        <span
                          className={cx(
                            'block text-sm font-medium',
                            hecha && 'text-muted line-through',
                          )}
                        >
                          {t.titulo}
                        </span>
                        <span className="text-xs text-muted tabular">
                          {t.subtareas_hechas}/{t.subtareas_total} subtareas · {t.progreso} %
                        </span>
                      </button>
                      <InsigniaEstado estado={t.estado} nombre={NOMBRE_ESTADO_PERSONAL[t.estado]} />
                      <InsigniaSemaforo tarea={t} />
                    </li>
                  );
                })}
              </ul>
            );
          }
          return (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
              {COLUMNAS_PERSONAL.map((c) => {
                const lista = tareas.filter((t) => c.incluye.includes(t.estado));
                return (
                  <section
                    key={c.estado}
                    aria-label={c.nombre}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const t = tareas.find((x) => x.id === e.dataTransfer.getData('text/plain'));
                      setArrastrando(null);
                      if (t) void mover(t, c.estado);
                    }}
                    className={cx(
                      'w-[80vw] shrink-0 rounded-[14px] bg-surface p-2 sm:w-auto',
                      arrastrando && 'ring-2 ring-brand/30',
                    )}
                  >
                    <h2 className="flex items-center justify-between px-1 py-1.5 text-sm font-semibold">
                      {c.nombre}
                      <span className="text-xs text-muted tabular">{lista.length}</span>
                    </h2>
                    <div className="space-y-2">
                      {lista.map((t) => {
                        const sem = semaforo(t);
                        return (
                          <article
                            key={t.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', t.id);
                              setArrastrando(t.id);
                            }}
                            onDragEnd={() => setArrastrando(null)}
                            className="rounded-[12px] border border-line bg-raised p-3 shadow-soft"
                          >
                            <div className="flex items-start gap-2">
                              <FormaSvg
                                forma={formaDeEstado(t.estado)}
                                color={color}
                                tamano={14}
                                anillo={sem?.urgente ? sem.nivel : undefined}
                              />
                              <button
                                type="button"
                                onClick={() => acc.abrirTarea(t.id)}
                                className="min-w-0 flex-1 text-left text-sm font-medium"
                              >
                                {t.titulo}
                              </button>
                              <Menu
                                etiqueta={`Mover ${t.titulo}`}
                                items={COLUMNAS_PERSONAL.filter(
                                  (x) => !x.incluye.includes(t.estado),
                                ).map((x) => ({
                                  etiqueta: `Mover a ${x.nombre}`,
                                  icono: <ArrowRight />,
                                  onClick: () => void mover(t, x.estado),
                                }))}
                              />
                            </div>
                            <div className="mt-2">
                              <InsigniaSemaforo tarea={t} />
                            </div>
                          </article>
                        );
                      })}
                      {lista.length === 0 && (
                        <p className="px-1 py-4 text-center text-xs text-muted">Sin tareas</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        }}
      </EstadosDatos>
    </div>
  );
}

/** PER-03: detalle de tarea personal como ruta propia (enlace compartible). */
export function MisTareasDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  return (
    <>
      <MisTareas />
      {id && <DetalleTareaPanel id={id} onCerrar={() => nav('/app/personal/tareas')} />}
    </>
  );
}
