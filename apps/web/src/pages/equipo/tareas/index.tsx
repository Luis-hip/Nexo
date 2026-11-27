import type { TareaEquipo } from '@nexo/shared';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Inbox,
  Lock,
  MessageSquarePlus,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useAcciones } from '@/components/shell/contexto';
import {
  Banner,
  Boton,
  Encabezado,
  EsqueletoTarjetas,
  EstadosDatos,
  FormaSvg,
  InsigniaEstado,
  InsigniaSemaforo,
  Menu,
  Segmentado,
  Tabla,
  Vacio,
  useColorDe,
} from '@/components/ui';
import { useAccionesTarea, useConteosTareas, useTareasEquipo } from '@/lib/consultasEquipo';
import { formaDeEstado, NOMBRE_ESTADO, PRIORIDADES, semaforo } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { avisarError, codigoTarea } from './comunes';
import { DetalleTareaEquipo } from './DetalleTareaEquipo';
import { aplicarFiltros, FiltrosTareas, SIN_FILTROS_TAREA } from './filtros';
import { Tablero } from './Tablero';
import { Votacion } from './Votacion';

export { Tablero, Votacion };

/** Layout de Tareas: pestañas Tablero · Lista · Backlog · Votación. El invitado ve IN-02. */
export function TareasLayout() {
  const { equipo, base, puede } = useEquipoActual();
  const loc = useLocation();
  const nav = useNavigate();
  const acc = useAcciones();
  const esInvitado = equipo.mi_rol === 'invitado';
  const conteos = useConteosTareas(equipo.id, !esInvitado);
  // Aviso de una redirección (por ejemplo, del backlog): se muestra hasta cambiar de pestaña y se
  // quita del historial para que no reaparezca al recargar.
  const avisoRuta = (loc.state as { aviso?: string } | null)?.aviso;
  const [aviso, setAviso] = useState(avisoRuta);
  if (avisoRuta && avisoRuta !== aviso) setAviso(avisoRuta);
  useEffect(() => {
    if (avisoRuta) void nav(loc.pathname + loc.search, { replace: true, state: null });
  }, [avisoRuta, loc.pathname, loc.search, nav]);

  if (esInvitado) {
    return (
      <div className="space-y-4" data-name="NX/IN-02-Tareas-compartidas">
        <Encabezado
          titulo="Tareas compartidas"
          descripcion="Solo lectura: puedes ver y comentar las tareas que el equipo compartió contigo."
        />
        <TareasCompartidas />
        <Outlet />
      </div>
    );
  }
  const ruta = `${base}/tareas`;
  const seg = (['lista', 'backlog', 'votacion'] as const).find((s) =>
    loc.pathname.endsWith(`/${s}`),
  );
  const esLider = equipo.mi_rol === 'lider';
  const sprint = equipo.sprints.find((s) => s.estado === 'activo');
  // El backlog solo lo ve el líder (retroalimentación, bloque 5a); la ruta también lo impide.
  const veBacklog = puede('ver_backlog').permitido;
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Tareas"
        descripcion={sprint ? `Sprint ${sprint.numero} activo` : 'Sin sprint activo'}
        acciones={
          // Solo el líder crea tareas, asignadas o en votación (DEC-040); los integrantes votan.
          esLider ? (
            <Boton
              variante="primario"
              tamano="sm"
              className="sm:hidden"
              icono={<Plus className="size-4" />}
              onClick={() => acc.nuevaTarea()}
            >
              Nueva tarea
            </Boton>
          ) : undefined
        }
      />
      {aviso && (
        <Banner tono="info" icono={<Lock />}>
          {aviso}
        </Banner>
      )}
      <Segmentado
        etiqueta="Vista de tareas"
        valor={seg ?? 'tablero'}
        onChange={(v) => {
          setAviso(undefined);
          void nav(v === 'tablero' ? ruta : `${ruta}/${v}`);
        }}
        opciones={[
          { valor: 'tablero', etiqueta: 'Tablero' },
          { valor: 'lista', etiqueta: 'Lista' },
          ...(veBacklog ? [{ valor: 'backlog' as const, etiqueta: 'Backlog' }] : []),
          { valor: 'votacion', etiqueta: 'Votación', contador: conteos.data?.votacion },
        ]}
      />
      <Outlet />
    </div>
  );
}

/** IN-02: tareas compartidas con el invitado. */
export function TareasCompartidas() {
  const { equipo } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'todas');
  const acc = useAcciones();
  const colorDe = useColorDe();
  return (
    <EstadosDatos
      consulta={consulta}
      esqueleto={<EsqueletoTarjetas />}
      vacio={
        <Vacio
          icono={<Lock />}
          titulo="Aún no te han compartido tareas"
          texto="Cuando el líder comparta tareas contigo aparecerán aquí."
        />
      }
    >
      {(lista) => (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => acc.abrirTarea(t.id)}
                className="w-full rounded-[12px] border border-line bg-raised p-4 text-left hover:border-line-strong"
              >
                <span className="flex items-center gap-2 text-xs text-muted tabular">
                  <FormaSvg
                    forma={formaDeEstado(t.estado)}
                    color={colorDe(t.responsable?.color_idx).color}
                    tamano={14}
                  />
                  {codigoTarea(t.codigo)} · {NOMBRE_ESTADO[t.estado]} · {t.progreso} %
                </span>
                <span className="mt-1 block font-medium">{t.titulo}</span>
                <span className="mt-3 flex items-center justify-between">
                  <InsigniaSemaforo tarea={t} />
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <MessageSquarePlus className="size-3.5" aria-hidden /> Comentar
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </EstadosDatos>
  );
}

const PESO_PRIORIDAD = { alta: 0, media: 1, baja: 2 } as const;
const ORDEN_ESTADO = Object.keys(NOMBRE_ESTADO);
const venceEn = (t: TareaEquipo) => (t.vence_en ? Date.parse(t.vence_en) : Infinity);

/**
 * EQ-03: las tareas del tablero (sprint en curso) en una tabla, ordenable por columna para
 * revisarlas rápido. Usa el mismo filtro que el Tablero, con su propio estado y sin vista por rol.
 */
export function ListaTareas() {
  const { equipo, usuarioId } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'tablero');
  const acc = useAcciones();
  const [f, setF] = useState(SIN_FILTROS_TAREA);
  return (
    <div className="space-y-3" data-name="NX/EQ-03-Lista">
      <p className="text-sm text-muted">
        Las mismas tareas del Tablero en una tabla: ordénalas por cualquier columna para revisarlas
        rápido.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <FiltrosTareas
          valor={f}
          onCambiar={setF}
          miembros={equipo.miembros}
          usuarioId={usuarioId}
        />
      </div>
      <EstadosDatos
        consulta={consulta}
        vacio={
          <Vacio
            icono={<Inbox />}
            titulo="Aún no hay tareas"
            texto={
              equipo.mi_rol === 'lider'
                ? undefined
                : 'Las tareas aparecen aquí cuando el equipo acepta las propuestas del líder.'
            }
            accion={
              equipo.mi_rol === 'lider' ? (
                <Boton variante="primario" onClick={() => acc.nuevaTarea()}>
                  Nueva tarea
                </Boton>
              ) : undefined
            }
          />
        }
      >
        {(todas) => {
          const tareas = aplicarFiltros(todas, f);
          if (!tareas.length) {
            return (
              <Vacio
                icono={<Search />}
                titulo="Sin resultados con estos filtros"
                texto="Prueba con otros criterios."
                accion={<Boton onClick={() => setF(SIN_FILTROS_TAREA)}>Limpiar filtros</Boton>}
              />
            );
          }
          return (
            <Tabla
              titulo="Tareas del equipo"
              filas={tareas}
              idFila={(t) => t.id}
              columnas={[
                {
                  clave: 'codigo',
                  titulo: 'Código',
                  celda: (t: TareaEquipo) => codigoTarea(t.codigo),
                  orden: (a, b) => a.codigo - b.codigo,
                },
                {
                  clave: 'titulo',
                  titulo: 'Tarea',
                  celda: (t) => (
                    <button
                      type="button"
                      onClick={() => acc.abrirTarea(t.id)}
                      className="max-w-72 truncate text-left font-medium hover:underline"
                    >
                      {t.titulo}
                    </button>
                  ),
                  orden: (a, b) => a.titulo.localeCompare(b.titulo, 'es'),
                },
                {
                  clave: 'estado',
                  titulo: 'Estado',
                  celda: (t) => <InsigniaEstado estado={t.estado} />,
                  orden: (a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado),
                },
                {
                  clave: 'responsable',
                  titulo: 'Responsable',
                  celda: (t) => t.responsable?.nombre ?? 'Sin asignar',
                  orden: (a, b) =>
                    (a.responsable?.nombre ?? '~').localeCompare(
                      b.responsable?.nombre ?? '~',
                      'es',
                    ),
                },
                {
                  clave: 'avance',
                  titulo: 'Avance',
                  numerica: true,
                  celda: (t) => `${t.progreso} %`,
                  orden: (a, b) => a.progreso - b.progreso,
                },
                {
                  clave: 'entrega',
                  titulo: 'Entrega',
                  celda: (t) => <InsigniaSemaforo tarea={t} />,
                  orden: (a, b) =>
                    venceEn(a) - venceEn(b) ||
                    Number(!!semaforo(b)?.urgente) - Number(!!semaforo(a)?.urgente),
                },
                {
                  clave: 'prioridad',
                  titulo: 'Prioridad',
                  celda: (t) => PRIORIDADES[t.prioridad],
                  orden: (a, b) => PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad],
                },
              ]}
            />
          );
        }}
      </EstadosDatos>
    </div>
  );
}

/**
 * Ruta del backlog: solo el líder (`ver_backlog`). A quien llega por un enlace directo se le
 * lleva al tablero con un aviso que explica por qué.
 */
export function BacklogRuta() {
  const { puede, base } = useEquipoActual();
  const r = puede('ver_backlog');
  if (!r.permitido) {
    return (
      <Navigate
        to={`${base}/tareas`}
        replace
        state={{ aviso: `${r.motivo} Te mostramos el tablero.` }}
      />
    );
  }
  return <Backlog />;
}

/** EQ-04: backlog priorizable. Solo lo ve el líder: reordena y sube tareas al tablero. */
export function Backlog() {
  const { equipo } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'backlog');
  const { mover, estado } = useAccionesTarea(equipo.id);
  const acc = useAcciones();
  const esLider = equipo.mi_rol === 'lider';

  /** Del backlog al tablero: la tarea vuelve a «Aceptada» (en el sprint activo, si lo hay). */
  const alTablero = (t: TareaEquipo) =>
    estado.mutate(
      { id: t.id, version: t.version, estado: 'aceptada' },
      {
        onSuccess: () => toast(`${codigoTarea(t.codigo)} pasó al tablero.`),
        onError: avisarError,
      },
    );

  const subir = (lista: TareaEquipo[], i: number, delta: -1 | 1) => {
    const t = lista[i];
    if (!t) return;
    // Queda entre la vecina de más allá y la vecina inmediata, en el sentido del movimiento.
    const [antes, despues] =
      delta === -1 ? [lista[i - 2], lista[i - 1]] : [lista[i + 1], lista[i + 2]];
    mover.mutate(
      {
        id: t.id,
        version: t.version,
        antes_id: antes?.id ?? null,
        despues_id: despues?.id ?? null,
      },
      { onError: avisarError },
    );
  };

  return (
    <div className="space-y-3" data-name="NX/EQ-04-Backlog">
      <p className="text-sm text-muted">
        Trabajo pendiente que aún no entra a un sprint, ordenado por prioridad: de aquí eliges qué
        pasa al siguiente.
      </p>
      <EstadosDatos
        consulta={consulta}
        vacio={
          <Vacio
            icono={<Archive />}
            titulo="El backlog está vacío"
            texto="Las tareas aceptadas que el líder aparta del tablero aparecen aquí."
            accion={
              esLider ? <Boton onClick={() => acc.nuevaTarea()}>Nueva tarea</Boton> : undefined
            }
          />
        }
      >
        {(lista) => (
          <ol className="space-y-2">
            {lista.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-[12px] border border-line bg-raised p-3"
              >
                <span className="w-6 text-center text-sm font-semibold text-muted tabular">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => acc.abrirTarea(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-xs text-muted tabular">
                    {codigoTarea(t.codigo)} · {PRIORIDADES[t.prioridad]}
                  </span>
                  <span className="line-clamp-1 font-medium">{t.titulo}</span>
                </button>
                {esLider && (
                  <>
                    <Boton
                      tamano="sm"
                      className="max-sm:hidden"
                      disabled={estado.isPending}
                      onClick={() => alTablero(t)}
                    >
                      Pasar al tablero
                    </Boton>
                    <Menu
                      etiqueta={`Acciones de ${codigoTarea(t.codigo)}`}
                      items={[
                        {
                          etiqueta: 'Mover arriba',
                          icono: <ArrowUp />,
                          deshabilitado: i === 0,
                          onClick: () => subir(lista, i, -1),
                        },
                        {
                          etiqueta: 'Mover abajo',
                          icono: <ArrowDown />,
                          deshabilitado: i === lista.length - 1,
                          onClick: () => subir(lista, i, 1),
                        },
                        {
                          etiqueta: 'Pasar al tablero',
                          icono: <Plus />,
                          onClick: () => alTablero(t),
                        },
                      ]}
                    />
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </EstadosDatos>
    </div>
  );
}

/** Ruta del detalle de tarea (enlace compartible): tablero de fondo y panel de detalle. */
export function TareaRuta() {
  const { id } = useParams();
  const { equipo, base } = useEquipoActual();
  const nav = useNavigate();
  return (
    <>
      {equipo.mi_rol !== 'invitado' && <Tablero />}
      {id && <DetalleTareaEquipo id={id} onCerrar={() => nav(`${base}/tareas`)} />}
    </>
  );
}
