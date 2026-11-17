import type { TareaEquipo } from '@nexo/shared';
import { Archive, ArrowDown, ArrowUp, Inbox, Lock, MessageSquarePlus, Plus } from 'lucide-react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
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
import { formaDeEstado, NOMBRE_ESTADO, PRIORIDADES } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { avisarError, codigoTarea } from './comunes';
import { DetalleTareaEquipo } from './DetalleTareaEquipo';
import { Tablero } from './Tablero';
import { Votacion } from './Votacion';

export { Tablero, Votacion };

/** Layout de Tareas: pestañas Tablero · Lista · Backlog · Votación. El invitado ve IN-02. */
export function TareasLayout() {
  const { equipo, base } = useEquipoActual();
  const loc = useLocation();
  const nav = useNavigate();
  const acc = useAcciones();
  const esInvitado = equipo.mi_rol === 'invitado';
  const conteos = useConteosTareas(equipo.id, !esInvitado);

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
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Tareas"
        descripcion={sprint ? `Sprint ${sprint.numero} activo` : 'Sin sprint activo'}
        acciones={
          // Solo el líder propone tareas (DEC-024); los integrantes votan.
          esLider ? (
            <Boton
              variante="primario"
              tamano="sm"
              className="sm:hidden"
              icono={<Plus className="size-4" />}
              onClick={acc.nuevaTarea}
            >
              Proponer
            </Boton>
          ) : undefined
        }
      />
      <Segmentado
        etiqueta="Vista de tareas"
        valor={seg ?? 'tablero'}
        onChange={(v) => nav(v === 'tablero' ? ruta : `${ruta}/${v}`)}
        opciones={[
          { valor: 'tablero', etiqueta: 'Tablero' },
          { valor: 'lista', etiqueta: 'Lista' },
          { valor: 'backlog', etiqueta: 'Backlog' },
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

/** EQ-03: lista de tareas (todo menos lo que está o estuvo en votación sin prosperar). */
export function ListaTareas() {
  const { equipo } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'todas');
  const acc = useAcciones();
  return (
    <div data-name="NX/EQ-03-Lista">
      <EstadosDatos
        consulta={{
          ...consulta,
          data: consulta.data?.filter(
            (t) => !['propuesta', 'rechazada', 'cancelada'].includes(t.estado),
          ),
        }}
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
                <Boton variante="primario" onClick={acc.nuevaTarea}>
                  Nueva propuesta
                </Boton>
              ) : undefined
            }
          />
        }
      >
        {(tareas) => (
          <Tabla
            titulo="Tareas del equipo"
            filas={tareas}
            idFila={(t) => t.id}
            columnas={[
              {
                clave: 'codigo',
                titulo: 'Código',
                celda: (t: TareaEquipo) => codigoTarea(t.codigo),
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
              },
              {
                clave: 'estado',
                titulo: 'Estado',
                celda: (t) => <InsigniaEstado estado={t.estado} />,
              },
              {
                clave: 'responsable',
                titulo: 'Responsable',
                celda: (t) => t.responsable?.nombre ?? 'Sin asignar',
              },
              {
                clave: 'avance',
                titulo: 'Avance',
                numerica: true,
                celda: (t) => `${t.progreso} %`,
              },
              { clave: 'entrega', titulo: 'Entrega', celda: (t) => <InsigniaSemaforo tarea={t} /> },
              { clave: 'prioridad', titulo: 'Prioridad', celda: (t) => PRIORIDADES[t.prioridad] },
            ]}
          />
        )}
      </EstadosDatos>
    </div>
  );
}

/** EQ-04: backlog priorizable (solo el líder reordena y sube tareas al tablero). */
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
      {!esLider && (
        <Banner tono="info" icono={<Lock />}>
          Solo el líder prioriza el backlog y pasa tareas al tablero.
        </Banner>
      )}
      <EstadosDatos
        consulta={consulta}
        vacio={
          <Vacio
            icono={<Archive />}
            titulo="El backlog está vacío"
            texto="Las tareas aceptadas que el líder aparta del tablero aparecen aquí."
            accion={esLider ? <Boton onClick={acc.nuevaTarea}>Nueva propuesta</Boton> : undefined}
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
