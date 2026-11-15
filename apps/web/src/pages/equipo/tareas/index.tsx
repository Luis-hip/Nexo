import type { TareaEquipo } from '@nexo/shared';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Inbox,
  Lock,
  MessageSquarePlus,
  Plus,
  UserRoundX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useAcciones } from '@/components/shell/contexto';
import {
  Avatar,
  Banner,
  Boton,
  Campo,
  Encabezado,
  Entrada,
  EsqueletoTarjetas,
  EstadosDatos,
  FormaSvg,
  InsigniaEstado,
  InsigniaSemaforo,
  Menu,
  Modal,
  Segmentado,
  Selector,
  Tabla,
  Tarjeta,
  Vacio,
  cx,
  useColorDe,
  useConfirmar,
} from '@/components/ui';
import { useAccionesTarea, useConteosTareas, useTareasEquipo } from '@/lib/consultasEquipo';
import { aInputFecha, deInputFecha } from '@/lib/fechas';
import { formaDeEstado, NOMBRE_ESTADO, PRIORIDADES } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { avisarError, codigoTarea } from './comunes';
import { DetalleTareaEquipo } from './DetalleTareaEquipo';
import { Tablero } from './Tablero';

export { Tablero };

/** Layout de Tareas: pestañas Tablero · Lista · Backlog · Triaje. El invitado ve IN-02. */
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
  const seg = (['lista', 'backlog', 'triaje'] as const).find((s) => loc.pathname.endsWith(`/${s}`));
  const sprint = equipo.sprints.find((s) => s.estado === 'activo');
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Tareas"
        descripcion={sprint ? `Sprint ${sprint.numero} activo` : 'Sin sprint activo'}
        acciones={
          <Boton
            variante="primario"
            tamano="sm"
            className="sm:hidden"
            icono={<Plus className="size-4" />}
            onClick={acc.nuevaTarea}
          >
            {equipo.mi_rol === 'integrante' ? 'Proponer' : 'Nueva'}
          </Boton>
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
          { valor: 'triaje', etiqueta: 'Triaje', contador: conteos.data?.triaje },
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

/** EQ-03: lista de tareas (todo menos propuestas y rechazadas). */
export function ListaTareas() {
  const { equipo } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'todas');
  const acc = useAcciones();
  return (
    <div data-name="NX/EQ-03-Lista">
      <EstadosDatos
        consulta={{
          ...consulta,
          data: consulta.data?.filter((t) => !['propuesta', 'rechazada'].includes(t.estado)),
        }}
        vacio={
          <Vacio
            icono={<Inbox />}
            titulo="Aún no hay tareas"
            accion={
              <Boton variante="primario" onClick={acc.nuevaTarea}>
                {equipo.mi_rol === 'lider' ? 'Nueva tarea' : 'Proponer tarea'}
              </Boton>
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
  const { mover, triaje } = useAccionesTarea(equipo.id);
  const acc = useAcciones();
  const esLider = equipo.mi_rol === 'lider';

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
          Solo el líder prioriza el backlog y pasa tareas al tablero. Puedes proponer tareas nuevas.
        </Banner>
      )}
      <EstadosDatos
        consulta={consulta}
        vacio={
          <Vacio
            icono={<Archive />}
            titulo="El backlog está vacío"
            texto="Las tareas aceptadas que aún no entran al tablero aparecerán aquí."
            accion={
              <Boton onClick={acc.nuevaTarea}>{esLider ? 'Nueva tarea' : 'Proponer tarea'}</Boton>
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
                      disabled={triaje.isPending}
                      onClick={() =>
                        triaje.mutate(
                          { id: t.id, version: t.version, accion: 'aceptar', destino: 'tablero' },
                          {
                            onSuccess: () => toast(`${codigoTarea(t.codigo)} pasó al tablero.`),
                            onError: avisarError,
                          },
                        )
                      }
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
                          onClick: () =>
                            triaje.mutate(
                              {
                                id: t.id,
                                version: t.version,
                                accion: 'aceptar',
                                destino: 'tablero',
                              },
                              {
                                onSuccess: () => toast(`${codigoTarea(t.codigo)} pasó al tablero.`),
                                onError: avisarError,
                              },
                            ),
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

const MOTIVO_NO_LIDER = 'Solo el líder puede aceptar o rechazar propuestas en triaje.';

/** EQ-05: triaje. El integrante ve además el estado de sus solicitudes (FALT-08). */
export function Triaje() {
  const { equipo, usuarioId } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'triaje');
  const esLider = equipo.mi_rol === 'lider';
  const mias = useTareasEquipo(equipo.id, 'mias', !esLider);
  const { triaje } = useAccionesTarea(equipo.id);
  const acc = useAcciones();
  const confirmar = useConfirmar();
  const [aceptar, setAceptar] = useState<TareaEquipo | null>(null);
  const [verRechazadas, setVerRechazadas] = useState(false);

  const fila = (t: TareaEquipo, modo: 'propuesta' | 'reasignar' | 'rechazada') => {
    const persona = modo === 'reasignar' ? t.responsable : t.proponente;
    const codigo = codigoTarea(t.codigo);
    return (
      <li key={t.id}>
        <Tarjeta className="p-4">
          <div className="flex flex-wrap items-start gap-3">
            <Avatar
              persona={
                persona ? { nombre: persona.nombre, colorIdx: persona.color_idx } : undefined
              }
              tamano={32}
            />
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => acc.abrirTarea(t.id)} className="text-left">
                <span className="block text-xs text-muted tabular">
                  {codigo} ·{' '}
                  {modo === 'reasignar'
                    ? `Rechazada por ${persona?.nombre ?? 'el responsable'}`
                    : `Propone ${persona?.nombre ?? 'un integrante'}`}{' '}
                  · {PRIORIDADES[t.prioridad]}
                </span>
                <span className="font-medium hover:underline">{t.titulo}</span>
              </button>
              {t.descripcion && (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{t.descripcion}</p>
              )}
              {modo !== 'propuesta' && t.motivo && (
                <p
                  className={cx(
                    'mt-2 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs',
                    modo === 'reasignar' ? 'bg-warn/10 text-warn-text' : 'bg-surface text-muted',
                  )}
                >
                  {modo === 'reasignar' ? (
                    <UserRoundX className="size-3.5" aria-hidden />
                  ) : (
                    <X className="size-3.5" aria-hidden />
                  )}
                  {modo === 'reasignar' ? 'Rechazada por el responsable' : 'Rechazada'}: «{t.motivo}
                  »
                </p>
              )}
              {t.cambios_pedidos && (
                <p className="mt-2 text-xs text-info-text">Cambios pedidos: {t.cambios_pedidos}</p>
              )}
            </div>
          </div>
          {modo !== 'rechazada' && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <Boton
                tamano="sm"
                variante="primario"
                icono={<Check className="size-4" />}
                disabled={!esLider}
                motivo={MOTIVO_NO_LIDER}
                onClick={() => setAceptar(t)}
              >
                {modo === 'reasignar' ? 'Reasignar' : 'Aceptar'}
              </Boton>
              <Boton
                tamano="sm"
                icono={<Archive className="size-4" />}
                disabled={!esLider}
                motivo={MOTIVO_NO_LIDER}
                onClick={() =>
                  triaje.mutate(
                    { id: t.id, version: t.version, accion: 'backlog' },
                    {
                      onSuccess: () => toast(`${codigo} enviada al backlog.`),
                      onError: avisarError,
                    },
                  )
                }
              >
                Enviar a backlog
              </Boton>
              {modo === 'propuesta' && (
                <Boton
                  tamano="sm"
                  variante="texto"
                  disabled={!esLider}
                  motivo={MOTIVO_NO_LIDER}
                  onClick={async () => {
                    const r = await confirmar({
                      titulo: 'Pedir cambios',
                      mensaje: `Explica a ${t.proponente?.nombre ?? 'quien la propuso'} qué ajustar en la propuesta.`,
                      confirmar: 'Enviar comentario',
                      conMotivo: { etiqueta: 'Comentario' },
                    });
                    if (!r) return;
                    triaje.mutate(
                      {
                        id: t.id,
                        version: t.version,
                        accion: 'pedir_cambios',
                        comentario: r.motivo,
                      },
                      { onSuccess: () => toast('Se pidieron cambios.'), onError: avisarError },
                    );
                  }}
                >
                  Pedir cambios
                </Boton>
              )}
              <span className="flex-1" />
              <Boton
                tamano="sm"
                variante="texto"
                className="text-danger-text"
                icono={<X className="size-4" />}
                disabled={!esLider}
                motivo={MOTIVO_NO_LIDER}
                onClick={async () => {
                  const r = await confirmar({
                    titulo: `Rechazar «${t.titulo}»`,
                    mensaje: 'El motivo es obligatorio y lo verá quien propuso la tarea.',
                    confirmar: 'Rechazar',
                    destructivo: true,
                    conMotivo: { etiqueta: 'Motivo del rechazo' },
                  });
                  if (!r) return;
                  triaje.mutate(
                    { id: t.id, version: t.version, accion: 'rechazar', motivo: r.motivo },
                    {
                      onSuccess: () => toast(`${codigo} rechazada.`, 'info'),
                      onError: avisarError,
                    },
                  );
                }}
              >
                Rechazar
              </Boton>
            </div>
          )}
        </Tarjeta>
      </li>
    );
  };

  return (
    <div className="space-y-6" data-name="NX/EQ-05-Triaje">
      {!esLider && (
        <Banner
          tono="info"
          accion={
            <Boton tamano="sm" variante="primario" onClick={acc.nuevaTarea}>
              Proponer tarea
            </Boton>
          }
        >
          Tus propuestas llegan aquí. El líder decide si entran al tablero.
        </Banner>
      )}
      {!esLider && (mias.data?.length ?? 0) > 0 && (
        <section aria-labelledby="mis-prop" data-name="NX/FALT-08-Mis-solicitudes">
          <h2 id="mis-prop" className="mb-2 text-base font-semibold">
            Mis propuestas
          </h2>
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {mias.data?.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <button
                  type="button"
                  onClick={() => acc.abrirTarea(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block text-xs text-muted tabular">{codigoTarea(t.codigo)}</span>
                  <span className="text-sm font-medium hover:underline">{t.titulo}</span>
                  {t.cambios_pedidos && (
                    <span className="block text-xs text-info-text">
                      Te pidieron cambios: {t.cambios_pedidos}
                    </span>
                  )}
                  {t.estado === 'rechazada' && t.motivo && (
                    <span className="block text-xs text-muted">Motivo: «{t.motivo}»</span>
                  )}
                </button>
                <InsigniaEstado estado={t.estado} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <EstadosDatos consulta={consulta}>
        {(tareas) => {
          const propuestas = tareas.filter((t) => t.estado === 'propuesta');
          const reasignar = tareas.filter(
            (t) => t.estado === 'rechazada' && t.rechazo_por === 'responsable',
          );
          const rechazadas = tareas.filter(
            (t) => t.estado === 'rechazada' && t.rechazo_por === 'lider',
          );
          return (
            <>
              <section aria-labelledby="prop">
                <h2 id="prop" className="mb-2 text-base font-semibold">
                  Propuestas <span className="text-muted tabular">({propuestas.length})</span>
                </h2>
                {propuestas.length ? (
                  <ul className="space-y-3">{propuestas.map((t) => fila(t, 'propuesta'))}</ul>
                ) : (
                  <Vacio
                    compacto
                    icono={<Inbox />}
                    titulo="No hay propuestas pendientes"
                    texto="Cuando alguien proponga una tarea aparecerá aquí."
                  />
                )}
              </section>
              {reasignar.length > 0 && (
                <section aria-labelledby="reas" className="mt-6">
                  <h2 id="reas" className="mb-2 text-base font-semibold">
                    Por reasignar
                  </h2>
                  <ul className="space-y-3">{reasignar.map((t) => fila(t, 'reasignar'))}</ul>
                </section>
              )}
              {rechazadas.length > 0 && (
                <section className="mt-6">
                  <button
                    type="button"
                    onClick={() => setVerRechazadas(!verRechazadas)}
                    aria-expanded={verRechazadas}
                    className="flex min-h-9 items-center gap-2 text-sm font-medium text-muted"
                  >
                    {verRechazadas ? (
                      <ChevronUp className="size-4" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4" aria-hidden />
                    )}
                    Rechazadas ({rechazadas.length})
                  </button>
                  {verRechazadas && (
                    <ul className="mt-2 space-y-3">
                      {rechazadas.map((t) => fila(t, 'rechazada'))}
                    </ul>
                  )}
                </section>
              )}
            </>
          );
        }}
      </EstadosDatos>
      {aceptar && (
        <AceptarTriajeModal t={aceptar} usuarioId={usuarioId} onCerrar={() => setAceptar(null)} />
      )}
    </div>
  );
}

function AceptarTriajeModal({
  t,
  usuarioId,
  onCerrar,
}: {
  t: TareaEquipo;
  usuarioId: string;
  onCerrar: () => void;
}) {
  const { equipo } = useEquipoActual();
  const { triaje } = useAccionesTarea(equipo.id);
  const tablero = useTareasEquipo(equipo.id, 'tablero');
  const reasignando = t.estado === 'rechazada';
  const sprint = equipo.sprints.find((s) => s.estado === 'activo');
  const [destino, setDestino] = useState<'tablero' | 'backlog'>('tablero');
  const [responsable, setResponsable] = useState(
    reasignando ? '' : (t.proponente?.usuario_id ?? ''),
  );
  const [fecha, setFecha] = useState(aInputFecha(t.vence_en ?? undefined));
  const [error, setError] = useState('');
  const carga = (uid: string) =>
    tablero.data?.filter((x) => x.responsable?.usuario_id === uid && x.estado !== 'completada')
      .length ?? 0;
  const codigo = codigoTarea(t.codigo);

  const enviar = () => {
    if (destino === 'tablero' && !responsable) {
      setError('Elige un responsable.');
      return;
    }
    triaje.mutate(
      {
        id: t.id,
        version: t.version,
        accion: 'aceptar',
        destino,
        responsable_id: responsable || null,
        vence_en: fecha ? (deInputFecha(fecha) ?? null) : null,
      },
      {
        onSuccess: (r) => {
          toast(
            r.responsable
              ? `${codigo} aceptada y asignada a ${r.responsable.nombre}.${r.responsable.usuario_id === usuarioId ? '' : ' Debe aceptar la asignación.'}`
              : `${codigo} aceptada.`,
          );
          onCerrar();
        },
        onError: avisarError,
      },
    );
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={reasignando ? `Reasignar ${codigo}` : `Aceptar ${codigo}`}
      descripcion={t.titulo}
      nombre="NX/EQ-05-Aceptar-triaje"
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" onClick={enviar} cargando={triaje.isPending}>
            {reasignando ? 'Reasignar' : 'Aceptar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etiqueta="Destino">
          <Selector
            value={destino}
            onChange={(e) => setDestino(e.target.value as 'tablero' | 'backlog')}
          >
            <option value="tablero">
              {sprint ? `Tablero (Sprint ${sprint.numero}, activo)` : 'Tablero'}
            </option>
            <option value="backlog">Backlog</option>
          </Selector>
        </Campo>
        <Campo
          etiqueta="Responsable"
          error={error}
          opcional={destino === 'backlog'}
          ayuda="Deberá aceptar o rechazar la asignación."
        >
          <Selector
            value={responsable}
            onChange={(e) => {
              setResponsable(e.target.value);
              setError('');
            }}
          >
            <option value="">{destino === 'backlog' ? 'Sin asignar' : 'Elige a alguien'}</option>
            {equipo.miembros
              .filter((m) => m.rol !== 'invitado')
              .filter((m) => !(reasignando && m.usuario_id === t.responsable?.usuario_id))
              .map((m) => (
                <option key={m.usuario_id} value={m.usuario_id}>
                  {m.nombre} · {carga(m.usuario_id)} tareas activas
                </option>
              ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Fecha de entrega" opcional>
          <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>
    </Modal>
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
