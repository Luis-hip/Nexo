import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EstadoTarea, TareaEquipo } from '@nexo/shared';
import { Inbox, Rows3, Rows4, Search, UserCheck } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useAcciones } from '@/components/shell/contexto';
import {
  Boton,
  Buscador,
  Chip,
  EsqueletoTarjetas,
  EstadosDatos,
  Vacio,
  cx,
  useConfirmar,
} from '@/components/ui';
import { useAccionesTarea, useTareasEquipo } from '@/lib/consultasEquipo';
import { COLUMNAS_TABLERO, NOMBRE_ESTADO } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { avisarError, TarjetaTarea, useTransiciones } from './comunes';
import {
  aplicarFiltros,
  cuantosFiltros,
  FiltrosTareas,
  SIN_FILTROS_TAREA,
  type FiltrosTarea,
} from './filtros';

const esColumna = (id: string) => id.startsWith('col:');
const idColumna = (estado: EstadoTarea) => `col:${estado}`;

function useEsMovil() {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener('resize', f);
      return () => window.removeEventListener('resize', f);
    },
    () => window.innerWidth < 640,
  );
}

/** Tarjeta arrastrable (dnd-kit): el asa también funciona con teclado (Espacio y flechas). */
function TarjetaArrastrable({
  t,
  compacta,
  arrastrable,
}: {
  t: TareaEquipo;
  compacta: boolean;
  arrastrable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
    disabled: !arrastrable,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(isDragging && 'opacity-40')}
    >
      <TarjetaTarea
        t={t}
        compacta={compacta}
        asa={arrastrable ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

function Columna({
  estado,
  nombre,
  lista,
  plegada,
  indicacion,
  children,
}: {
  estado: EstadoTarea;
  nombre: string;
  lista: TareaEquipo[];
  /** Las columnas vacías se pliegan (docs/01, 2.3.11). */
  plegada: boolean;
  /** Mientras se arrastra: si soltar aquí está permitido. */
  indicacion?: { ok: boolean; texto: string };
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: idColumna(estado) });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${nombre}, ${lista.length} ${lista.length === 1 ? 'tarea' : 'tareas'}`}
      className={cx(
        'flex shrink-0 flex-col rounded-[14px] bg-surface p-2 transition-[width,box-shadow] duration-150',
        plegada ? 'w-14 items-center' : 'w-[min(300px,80vw)] lg:w-auto lg:min-w-[220px] lg:flex-1',
        isOver && indicacion && (indicacion.ok ? 'ring-2 ring-ok' : 'ring-2 ring-danger'),
      )}
    >
      <header className={cx('flex items-center gap-2 px-1 py-1.5', plegada && 'flex-col')}>
        <h2 className={cx('text-sm font-semibold', plegada && '[writing-mode:vertical-rl]')}>
          {nombre}
        </h2>
        <span className="rounded-full bg-raised px-2 text-xs text-muted tabular">
          {lista.length}
        </span>
      </header>
      {isOver && indicacion && (
        <p
          className={cx(
            'px-1 pb-1 text-xs font-medium',
            indicacion.ok ? 'text-ok-text' : 'text-danger-text',
          )}
        >
          {indicacion.texto}
        </p>
      )}
      {!plegada && <div className="min-h-10 flex-1 space-y-2">{children}</div>}
    </section>
  );
}

/** EQ-02: tablero con columnas por estado. */
export function Tablero() {
  const { equipo, usuarioId } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'tablero');
  const { mover } = useAccionesTarea(equipo.id);
  const { validas, motivo: motivoDe } = useTransiciones();
  const confirmar = useConfirmar();
  const acc = useAcciones();
  const movil = useEsMovil();
  // Vista inicial según el rol (no es un permiso): el integrante empieza viendo solo lo suyo; el
  // líder (y el invitado, que no tiene tablero) ve todo. No se guarda entre sesiones.
  const esIntegrante = equipo.mi_rol === 'integrante';
  const porDefecto: FiltrosTarea = esIntegrante
    ? { ...SIN_FILTROS_TAREA, responsable: usuarioId }
    : SIN_FILTROS_TAREA;
  const [q, setQ] = useState('');
  const [f, setF] = useState<FiltrosTarea>(porDefecto);
  const [compacta, setCompacta] = useState(false);
  const [columna, setColumna] = useState<EstadoTarea>('en_curso');
  const [arrastrando, setArrastrando] = useState<TareaEquipo | null>(null);
  const esLider = equipo.mi_rol === 'lider';
  const filtrando = !!q || cuantosFiltros(f) > 0;
  /** Solo está puesto el filtro por defecto del integrante («Responsable: Yo»). */
  const soloLoMio = esIntegrante && !q && f.responsable === usuarioId && !f.prioridad && !f.plazo;

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const aplicar = (ts: TareaEquipo[]) =>
    aplicarFiltros(
      ts.filter((t) => !q || `T-${t.codigo} ${t.titulo}`.toLowerCase().includes(q.toLowerCase())),
      f,
    );

  /** Al soltar: «mover la tarea entre A y B»; el servidor calcula el orden y valida el estado. */
  const alSoltar = async (tareas: TareaEquipo[], e: DragEndEvent) => {
    setArrastrando(null);
    const t = tareas.find((x) => x.id === e.active.id);
    const sobre = e.over ? String(e.over.id) : null;
    if (!t || !sobre || sobre === t.id) return;
    const destino = esColumna(sobre)
      ? (sobre.slice(4) as EstadoTarea)
      : (tareas.find((x) => x.id === sobre)?.estado ?? t.estado);
    const cambia = destino !== t.estado;

    if (cambia) {
      const invalida = motivoDe(t, destino);
      if (invalida) {
        toast(invalida, 'warn');
        return;
      }
    } else if (!esLider) {
      toast('Solo el líder puede reordenar las tareas del tablero.', 'warn');
      return;
    }

    // Orden final de la columna de destino, con la tarjeta ya colocada.
    const enDestino = tareas.filter((x) => x.estado === destino && x.id !== t.id);
    let final: TareaEquipo[];
    if (!cambia) {
      const actual = tareas.filter((x) => x.estado === destino);
      const hacia = esColumna(sobre) ? actual.length - 1 : actual.findIndex((x) => x.id === sobre);
      final = arrayMove(
        actual,
        actual.findIndex((x) => x.id === t.id),
        hacia,
      );
    } else {
      const i = esColumna(sobre) ? enDestino.length : enDestino.findIndex((x) => x.id === sobre);
      final = [...enDestino.slice(0, i), t, ...enDestino.slice(i)];
    }
    const pos = final.findIndex((x) => x.id === t.id);

    let motivo: string | undefined;
    if (cambia && destino === 'atascada') {
      const r = await confirmar({
        titulo: `Marcar «${t.titulo}» como atascada`,
        mensaje: 'Explica brevemente qué la bloquea. El equipo y el líder lo verán.',
        confirmar: 'Marcar como atascada',
        conMotivo: { etiqueta: 'Motivo del bloqueo' },
      });
      if (!r) return;
      motivo = r.motivo;
    }
    mover.mutate(
      {
        id: t.id,
        version: t.version,
        antes_id: final[pos - 1]?.id ?? null,
        despues_id: final[pos + 1]?.id ?? null,
        ...(cambia && { estado: destino, motivo }),
      },
      {
        onSuccess: () => cambia && toast(`«${t.titulo}» pasó a ${NOMBRE_ESTADO[destino]}.`),
        onError: avisarError,
      },
    );
  };

  return (
    <div className="space-y-3" data-name="NX/EQ-02-Tablero">
      <div className="flex flex-wrap items-center gap-2">
        <Buscador
          valor={q}
          onChange={setQ}
          etiqueta="Buscar en tareas"
          className="min-w-0 flex-1 basis-48"
        />
        <FiltrosTareas
          valor={f}
          onCambiar={setF}
          miembros={equipo.miembros}
          usuarioId={usuarioId}
        />
        <Chip
          activo={compacta}
          onClick={() => setCompacta(!compacta)}
          icono={compacta ? <Rows4 className="size-4" /> : <Rows3 className="size-4" />}
          aria-label="Densidad compacta"
        >
          <span className="hidden lg:inline">Compacta</span>
        </Chip>
      </div>

      <EstadosDatos
        consulta={consulta}
        esqueleto={<EsqueletoTarjetas n={3} />}
        vacio={
          <Vacio
            icono={<Inbox />}
            titulo="El tablero no tiene tareas"
            texto={
              esLider
                ? 'Asigna una tarea, propón una a votación o trae tareas desde el backlog.'
                : 'Las tareas llegan al tablero cuando el equipo acepta las propuestas del líder.'
            }
            accion={
              esLider ? (
                <Boton variante="primario" onClick={() => acc.nuevaTarea()}>
                  Nueva tarea
                </Boton>
              ) : undefined
            }
          />
        }
      >
        {(tareas) => {
          const filtradas = aplicar(tareas);
          const deCol = (e: EstadoTarea) => filtradas.filter((t) => t.estado === e);
          if (filtradas.length === 0 && soloLoMio) {
            return (
              <Vacio
                icono={<UserCheck />}
                titulo="No tienes tareas asignadas en este sprint"
                texto="Puedes ver las del resto del equipo."
                accion={
                  <Boton onClick={() => setF({ ...f, responsable: '' })}>
                    Ver todas las tareas
                  </Boton>
                }
              />
            );
          }
          if (filtradas.length === 0) {
            return (
              <Vacio
                icono={<Search />}
                titulo="Sin resultados con estos filtros"
                texto="Prueba con otros criterios."
                accion={
                  <Boton
                    onClick={() => {
                      setQ('');
                      setF(SIN_FILTROS_TAREA);
                    }}
                  >
                    Limpiar filtros
                  </Boton>
                }
              />
            );
          }
          if (movil) {
            return (
              <div>
                <div
                  role="tablist"
                  aria-label="Columnas del tablero"
                  className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 scrollbar-none"
                >
                  {COLUMNAS_TABLERO.map((c) => (
                    <button
                      key={c.estado}
                      role="tab"
                      aria-selected={columna === c.estado}
                      type="button"
                      onClick={() => setColumna(c.estado)}
                      className={cx(
                        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm',
                        columna === c.estado
                          ? 'border-brand bg-brand/10 font-medium'
                          : 'border-line text-muted',
                      )}
                    >
                      {c.nombre} <span className="text-xs tabular">{deCol(c.estado).length}</span>
                    </button>
                  ))}
                </div>
                <div role="tabpanel" className="space-y-2">
                  {deCol(columna).length ? (
                    deCol(columna).map((t) => <TarjetaTarea key={t.id} t={t} compacta={compacta} />)
                  ) : (
                    <Vacio compacto titulo="Columna vacía" texto="Elige otra columna arriba." />
                  )}
                </div>
              </div>
            );
          }
          return (
            <DndContext
              sensors={sensores}
              collisionDetection={closestCorners}
              onDragStart={(e: DragStartEvent) =>
                setArrastrando(tareas.find((t) => t.id === e.active.id) ?? null)
              }
              onDragCancel={() => setArrastrando(null)}
              onDragEnd={(e) => void alSoltar(tareas, e)}
            >
              <div
                className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0"
                aria-label="Tablero"
              >
                {COLUMNAS_TABLERO.map((c) => {
                  const lista = deCol(c.estado);
                  const mismo = arrastrando?.estado === c.estado;
                  const ok = arrastrando
                    ? mismo
                      ? esLider
                      : validas(arrastrando).includes(c.estado)
                    : false;
                  return (
                    <Columna
                      key={c.estado}
                      estado={c.estado}
                      nombre={c.nombre}
                      lista={lista}
                      plegada={lista.length === 0 && !arrastrando}
                      indicacion={
                        arrastrando
                          ? { ok, texto: ok ? 'Suelta para mover' : 'Movimiento no permitido' }
                          : undefined
                      }
                    >
                      <SortableContext
                        items={lista.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {lista.map((t) => (
                          <TarjetaArrastrable
                            key={t.id}
                            t={t}
                            compacta={compacta}
                            arrastrable={!filtrando}
                          />
                        ))}
                      </SortableContext>
                    </Columna>
                  );
                })}
              </div>
              <DragOverlay>
                {arrastrando && <TarjetaTarea t={arrastrando} compacta={compacta} />}
              </DragOverlay>
            </DndContext>
          );
        }}
      </EstadosDatos>
      <p className="hidden text-xs text-muted sm:block">
        Arrastra las tarjetas por su asa (o con el teclado: Tab hasta el asa, Espacio y flechas) o
        usa el menú ⋯ › «Mover a…». Las columnas vacías se pliegan.
        {filtrando && ' Con filtros activos no se puede arrastrar.'}
      </p>
    </div>
  );
}
