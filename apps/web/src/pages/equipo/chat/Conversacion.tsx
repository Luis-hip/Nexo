import {
  ETIQUETA_REACCION,
  GLIFO_REACCION,
  MAX_CARACTERES_MENSAJE,
  REACCIONES,
  type ConversacionChat,
  type MensajeChat,
  type MiembroChat,
} from '@nexo/shared';
import {
  ArrowLeft,
  BellOff,
  CheckSquare,
  CornerDownRight,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Send,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Avatar,
  AreaTexto,
  Boton,
  BotonIcono,
  Campo,
  cx,
  Entrada,
  EsqueletoLista,
  EstadosDatos,
  Menu,
  Modal,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import {
  aplanarMensajes,
  useAccionesChat,
  useFijados,
  useHilo,
  useMensajes,
  useMiembrosChat,
} from '@/lib/consultasChat';
import { fechaCorta, hora } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import {
  consultaDeMencion,
  extraerMenciones,
  partirMenciones,
  sugerirMenciones,
} from './menciones';

type Panel = { tipo: 'hilo'; mensajeId: string } | { tipo: 'fijados' } | null;

/** CH-02 a CH-06, CH-09, CH-10: una conversación con su encabezado, mensajes y compositor. */
export function Conversacion({
  conversacionId,
  resumen,
}: {
  conversacionId: string;
  resumen: ConversacionChat | undefined;
}) {
  const { equipo, base, usuarioId } = useEquipoActual();
  const consulta = useMensajes(conversacionId);
  const miembros = useMiembrosChat(conversacionId);
  const acciones = useAccionesChat(equipo.id);
  const [panel, setPanel] = useState<Panel>(null);
  const [aTarea, setATarea] = useState<MensajeChat | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  const mensajes = useMemo(() => aplanarMensajes(consulta.data?.pages), [consulta.data]);
  const conversacion = consulta.data?.pages[0]?.conversacion ?? resumen;
  const ultimoSeq = mensajes.at(-1)?.seq ?? 0;
  const esLider = equipo.mi_rol === 'lider';
  const lista = miembros.data ?? [];

  // Al llegar o abrir, se baja al final y se marca como leído hasta el último mensaje.
  const { mutate: leer } = acciones.leer;
  const noLeidos = conversacion?.no_leidos ?? 0;
  useEffect(() => {
    if (ultimoSeq > 0 && (noLeidos > 0 || mensajes.length > 0)) {
      fin.current?.scrollIntoView?.({ block: 'end' });
    }
    if (ultimoSeq > 0 && noLeidos > 0 && document.visibilityState === 'visible') {
      leer({ conversacionId, hastaSeq: ultimoSeq });
    }
  }, [ultimoSeq, noLeidos, conversacionId, leer, mensajes.length]);

  const titulo = conversacion?.nombre ?? 'Chat';
  return (
    <div className="grid min-h-[70dvh] gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-h-[70dvh] min-w-0 flex-col rounded-[12px] border border-line bg-raised">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Link
            to={`${base}/chat`}
            aria-label="Volver a las conversaciones"
            className="grid size-9 place-items-center rounded-full hover:bg-surface lg:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{titulo}</h2>
            <p className="truncate text-xs text-muted">{subtitulo(conversacion, lista)}</p>
          </div>
          {conversacion?.tarea && (
            <Link
              to={`${base}/tareas/${conversacion.tarea.id}`}
              className="hidden items-center gap-1 rounded-[8px] px-2 py-1 text-sm text-brand hover:bg-brand/10 sm:flex"
            >
              <CheckSquare className="size-4" aria-hidden /> Ver tarea
            </Link>
          )}
          {conversacion?.tipo !== 'dm' && (
            <Boton
              tamano="sm"
              variante={panel?.tipo === 'fijados' ? 'primario' : 'secundario'}
              icono={<Pin className="size-4" />}
              onClick={() => setPanel(panel?.tipo === 'fijados' ? null : { tipo: 'fijados' })}
            >
              Fijados
            </Boton>
          )}
          {conversacion && (
            <Menu
              etiqueta="Opciones de la conversación"
              items={[
                {
                  etiqueta: conversacion.fijada ? 'Quitar de arriba' : 'Fijar arriba en mi lista',
                  icono: <Pin className="size-4" />,
                  onClick: () =>
                    acciones.preferencias.mutate({ conversacionId, fijada: !conversacion.fijada }),
                },
                {
                  etiqueta: conversacion.silenciada ? 'Activar avisos' : 'Silenciar',
                  icono: <BellOff className="size-4" />,
                  onClick: () =>
                    acciones.preferencias.mutate({
                      conversacionId,
                      silenciada: !conversacion.silenciada,
                    }),
                },
              ]}
            />
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
          <EstadosDatos
            consulta={{ ...consulta, data: consulta.data ? mensajes : undefined }}
            esqueleto={<EsqueletoLista filas={5} />}
            vacio={
              <Vacio
                icono={<MessageSquare />}
                titulo="Aún no hay mensajes"
                texto="Escribe el primero."
                compacto
              />
            }
          >
            {(lista2) => (
              <div className="space-y-3">
                {consulta.hasNextPage && (
                  <div className="text-center">
                    <Boton
                      tamano="sm"
                      variante="texto"
                      cargando={consulta.isFetchingNextPage}
                      onClick={() => consulta.fetchNextPage()}
                    >
                      Ver mensajes anteriores
                    </Boton>
                  </div>
                )}
                {lista2.map((m, i) => (
                  <Mensaje
                    key={m.id}
                    m={m}
                    anterior={lista2[i - 1]}
                    miembros={lista}
                    esLider={esLider}
                    usuarioId={usuarioId}
                    onHilo={() => setPanel({ tipo: 'hilo', mensajeId: m.id })}
                    onATarea={() => setATarea(m)}
                    enHilo={false}
                  />
                ))}
                <div ref={fin} />
              </div>
            )}
          </EstadosDatos>
        </div>

        <Compositor conversacionId={conversacionId} miembros={lista} nombre={titulo} />
      </div>

      {panel && (
        <aside
          aria-label={panel.tipo === 'hilo' ? 'Hilo' : 'Mensajes fijados'}
          className="min-w-0 rounded-[12px] border border-line bg-raised"
        >
          {panel.tipo === 'hilo' ? (
            <PanelHilo
              mensajeId={panel.mensajeId}
              conversacionId={conversacionId}
              miembros={lista}
              esLider={esLider}
              usuarioId={usuarioId}
              onCerrar={() => setPanel(null)}
              onATarea={setATarea}
            />
          ) : (
            <PanelFijados
              conversacionId={conversacionId}
              miembros={lista}
              esLider={esLider}
              usuarioId={usuarioId}
              onCerrar={() => setPanel(null)}
              onHilo={(id) => setPanel({ tipo: 'hilo', mensajeId: id })}
              onATarea={setATarea}
            />
          )}
        </aside>
      )}

      <ConvertirEnTarea
        key={aTarea?.id ?? 'ninguno'}
        mensaje={aTarea}
        onCerrar={() => setATarea(null)}
      />
    </div>
  );
}

function subtitulo(c: ConversacionChat | undefined, miembros: MiembroChat[]): string {
  if (!c) return '';
  if (c.tipo === 'dm') return 'Mensaje directo · solo ustedes dos';
  if (c.tipo === 'invitados') return 'Canal con invitados · todos los miembros lo ven';
  if (c.tipo === 'tarea') return `Chat de la tarea · ${miembros.length} personas`;
  return `${miembros.length} personas del equipo`;
}

// --- Mensaje -------------------------------------------------------------------------------

function Mensaje({
  m,
  anterior,
  miembros,
  esLider,
  usuarioId,
  onHilo,
  onATarea,
  enHilo,
}: {
  m: MensajeChat;
  anterior?: MensajeChat;
  miembros: MiembroChat[];
  esLider: boolean;
  usuarioId: string;
  onHilo?: () => void;
  onATarea: () => void;
  enHilo: boolean;
}) {
  const { equipo, base } = useEquipoActual();
  const acciones = useAccionesChat(equipo.id);
  const confirmar = useConfirmar();
  const [reaccionando, setReaccionando] = useState(false);
  const nombres = miembros.map((x) => x.nombre);
  const propio = m.autor?.usuario_id === usuarioId;
  const agrupado =
    !!anterior &&
    !anterior.es_sistema &&
    anterior.autor?.usuario_id === m.autor?.usuario_id &&
    new Date(m.creado_en).getTime() - new Date(anterior.creado_en).getTime() < 5 * 60_000;

  if (m.es_sistema) {
    return (
      <p className="text-center text-xs text-muted">
        {m.texto} · {hora(m.creado_en)}
      </p>
    );
  }

  const intentar = async (promesa: Promise<unknown>) => {
    try {
      await promesa;
    } catch (e) {
      toast(mensajeDeError(e), 'danger');
    }
  };
  const borrar = async () => {
    const r = await confirmar({
      titulo: 'Eliminar mensaje',
      mensaje: propio
        ? 'Se eliminará tu mensaje para todos.'
        : 'Se eliminará el mensaje de otra persona para todos.',
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (r) await intentar(acciones.eliminar.mutateAsync(m));
  };

  return (
    <article
      className={cx('group flex gap-2.5', agrupado && '-mt-2')}
      aria-label={`Mensaje de ${m.autor?.nombre ?? 'alguien'}`}
    >
      <div className="w-8 shrink-0">
        {!agrupado && m.autor && (
          <Avatar persona={{ nombre: m.autor.nombre, colorIdx: m.autor.color_idx }} tamano={32} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!agrupado && (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{m.autor?.nombre ?? 'Persona anterior'}</span>
            <span className="text-xs text-muted tabular">
              {fechaCorta(m.creado_en)} · {hora(m.creado_en)}
            </span>
            {m.fijado && <Pin className="size-3 text-brand" aria-label="Fijado" />}
          </p>
        )}
        {m.eliminado ? (
          <p className="text-sm text-muted italic">Mensaje eliminado</p>
        ) : (
          <>
            <p className="text-sm break-words whitespace-pre-wrap">
              {partirMenciones(m.texto, nombres).map((t, i) =>
                t.mencion ? (
                  <span key={i} className="rounded bg-brand/15 px-0.5 font-medium text-brand">
                    {t.texto}
                  </span>
                ) : (
                  <span key={i}>{t.texto}</span>
                ),
              )}
            </p>
            {m.tarea && (
              <Link
                to={`${base}/tareas/${m.tarea.id}`}
                className="mt-1 inline-flex items-center gap-1 rounded-[8px] border border-line px-2 py-1 text-xs hover:bg-surface"
              >
                <CheckSquare className="size-3.5 text-brand" aria-hidden />
                T-{String(m.tarea.codigo).padStart(2, '0')} · {m.tarea.titulo}
              </Link>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {m.reacciones.map((r) => (
                <button
                  key={r.tipo}
                  type="button"
                  aria-pressed={r.yo}
                  aria-label={`${ETIQUETA_REACCION[r.tipo]}: ${r.total}`}
                  onClick={() =>
                    intentar(acciones.reaccionar.mutateAsync({ mensaje: m, tipo: r.tipo }))
                  }
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                    r.yo ? 'border-brand bg-brand/10' : 'border-line hover:bg-surface',
                  )}
                >
                  <span aria-hidden>{GLIFO_REACCION[r.tipo]}</span>
                  <span className="tabular">{r.total}</span>
                </button>
              ))}
              {!enHilo && m.respuestas > 0 && (
                <button
                  type="button"
                  onClick={onHilo}
                  className="inline-flex items-center gap-1 rounded-[8px] px-1.5 py-0.5 text-xs text-brand hover:bg-brand/10"
                >
                  <CornerDownRight className="size-3.5" aria-hidden />
                  {m.respuestas} {m.respuestas === 1 ? 'respuesta' : 'respuestas'}
                </button>
              )}
              {m.leido_por > 0 && propio && (
                <span className="text-xs text-muted">Leído por {m.leido_por}</span>
              )}
              <span className="ml-auto flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <span className="relative">
                  <BotonIcono
                    etiqueta="Reaccionar"
                    tamano="sm"
                    icono={<SmilePlus className="size-4" />}
                    onClick={() => setReaccionando(!reaccionando)}
                    aria-expanded={reaccionando}
                  />
                  {reaccionando && (
                    <span
                      role="group"
                      aria-label="Elige una reacción"
                      className="absolute right-0 bottom-full z-10 mb-1 flex gap-1 rounded-full border border-line bg-raised p-1 shadow-soft"
                    >
                      {REACCIONES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          aria-label={ETIQUETA_REACCION[t]}
                          className="grid size-8 place-items-center rounded-full hover:bg-surface"
                          onClick={() => {
                            setReaccionando(false);
                            void intentar(acciones.reaccionar.mutateAsync({ mensaje: m, tipo: t }));
                          }}
                        >
                          {GLIFO_REACCION[t]}
                        </button>
                      ))}
                    </span>
                  )}
                </span>
                {!enHilo && onHilo && (
                  <BotonIcono
                    etiqueta="Responder en un hilo"
                    tamano="sm"
                    icono={<MessageSquare className="size-4" />}
                    onClick={onHilo}
                  />
                )}
                {(propio || esLider || (esLider && !m.hilo_de_id)) && (
                  <Menu
                    etiqueta="Más acciones del mensaje"
                    disparador={({ abrir, ref }) => (
                      <BotonIcono
                        ref={ref}
                        etiqueta="Más acciones del mensaje"
                        tamano="sm"
                        icono={<MoreHorizontal className="size-4" />}
                        onClick={abrir}
                      />
                    )}
                    items={[
                      {
                        etiqueta: m.fijado ? 'Desfijar' : 'Fijar en el canal',
                        icono: m.fijado ? (
                          <PinOff className="size-4" />
                        ) : (
                          <Pin className="size-4" />
                        ),
                        oculto: !esLider || !!m.hilo_de_id,
                        onClick: () =>
                          void intentar(
                            acciones.fijar.mutateAsync({ mensaje: m, fijado: !m.fijado }),
                          ),
                      },
                      {
                        etiqueta: m.tarea ? 'Ya es una tarea' : 'Convertir en tarea',
                        icono: <CheckSquare className="size-4" />,
                        oculto: !esLider,
                        deshabilitado: !!m.tarea,
                        onClick: onATarea,
                      },
                      {
                        etiqueta: 'Eliminar',
                        icono: <Trash2 className="size-4" />,
                        destructivo: true,
                        onClick: () => void borrar(),
                      },
                    ]}
                  />
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

// --- Compositor ----------------------------------------------------------------------------

/** Escribe un mensaje (o la respuesta de un hilo): `@` propone nombres; Enter envía, Mayús+Enter salta de línea. */
function Compositor({
  conversacionId,
  miembros,
  nombre,
  hiloDe,
}: {
  conversacionId: string;
  miembros: MiembroChat[];
  nombre: string;
  hiloDe?: string;
}) {
  const { equipo, usuarioId } = useEquipoActual();
  const acciones = useAccionesChat(equipo.id);
  const [texto, setTexto] = useState('');
  const [cursor, setCursor] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');

  const mencion = consultaDeMencion(texto, cursor);
  const sugeridos = mencion ? sugerirMenciones(mencion.q, miembros, usuarioId) : [];

  const elegir = (m: MiembroChat) => {
    if (!mencion) return;
    const nuevo = `${texto.slice(0, mencion.desde)}@${m.nombre} ${texto.slice(cursor)}`;
    const pos = mencion.desde + m.nombre.length + 2;
    setTexto(nuevo);
    setCursor(pos);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.setSelectionRange(pos, pos);
    });
  };

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || acciones.enviar.isPending) return;
    setError('');
    try {
      await acciones.enviar.mutateAsync({
        conversacionId,
        texto: limpio,
        hilo_de_id: hiloDe,
        id_cliente: crypto.randomUUID(),
        menciones: extraerMenciones(limpio, miembros),
      });
      setTexto('');
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  return (
    <div className="relative border-t border-line p-3">
      {sugeridos.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mencionar a"
          className="absolute bottom-full left-3 z-10 mb-1 w-64 rounded-[10px] border border-line bg-raised p-1 shadow-soft"
        >
          {sugeridos.map((m) => (
            <li key={m.usuario_id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(m)}
                className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm hover:bg-surface"
              >
                <Avatar persona={{ nombre: m.nombre, colorIdx: m.color_idx }} tamano={24} />
                {m.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <AreaTexto
          ref={area}
          rows={1}
          value={texto}
          maxLength={MAX_CARACTERES_MENSAJE}
          aria-label={hiloDe ? 'Responder en el hilo' : `Mensaje para ${nombre}`}
          placeholder={hiloDe ? 'Responder en el hilo…' : `Escribe en ${nombre}…`}
          className="max-h-40 min-h-11 flex-1"
          onChange={(e) => {
            setTexto(e.target.value);
            setCursor(e.target.selectionStart);
          }}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
        />
        <Boton
          variante="primario"
          icono={<Send className="size-4" />}
          cargando={acciones.enviar.isPending}
          disabled={!texto.trim()}
          onClick={() => void enviar()}
          aria-label="Enviar mensaje"
        >
          <span className="hidden sm:inline">Enviar</span>
        </Boton>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// --- Paneles: hilo y fijados ---------------------------------------------------------------

function EncabezadoPanel({ titulo, onCerrar }: { titulo: string; onCerrar: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
      <h3 className="font-semibold">{titulo}</h3>
      <BotonIcono etiqueta="Cerrar panel" icono={<X className="size-4" />} onClick={onCerrar} />
    </header>
  );
}

interface PropsPanel {
  conversacionId: string;
  miembros: MiembroChat[];
  esLider: boolean;
  usuarioId: string;
  onCerrar: () => void;
  onATarea: (m: MensajeChat) => void;
}

/** CH-05: el mensaje raíz con sus respuestas y un compositor propio. */
function PanelHilo({ mensajeId, ...p }: PropsPanel & { mensajeId: string }) {
  const hilo = useHilo(mensajeId);
  return (
    <>
      <EncabezadoPanel titulo="Hilo" onCerrar={p.onCerrar} />
      <div className="max-h-[55dvh] space-y-3 overflow-y-auto p-3">
        <EstadosDatos consulta={hilo} esqueleto={<EsqueletoLista filas={3} />}>
          {(h) => (
            <>
              {[h.raiz, ...h.respuestas].map((m) => (
                <Mensaje
                  key={m.id}
                  m={m}
                  miembros={p.miembros}
                  esLider={p.esLider}
                  usuarioId={p.usuarioId}
                  onATarea={() => p.onATarea(m)}
                  enHilo
                />
              ))}
            </>
          )}
        </EstadosDatos>
      </div>
      <Compositor
        conversacionId={p.conversacionId}
        miembros={p.miembros}
        nombre="el hilo"
        hiloDe={mensajeId}
      />
    </>
  );
}

/** CH-06: mensajes fijados del canal. */
function PanelFijados({ onHilo, ...p }: PropsPanel & { onHilo: (mensajeId: string) => void }) {
  const fijados = useFijados(p.conversacionId, true);
  return (
    <>
      <EncabezadoPanel titulo="Mensajes fijados" onCerrar={p.onCerrar} />
      <div className="max-h-[60dvh] space-y-3 overflow-y-auto p-3">
        <EstadosDatos
          consulta={fijados}
          esqueleto={<EsqueletoLista filas={3} />}
          vacio={
            <Vacio
              icono={<Pin />}
              titulo="Nada fijado"
              texto="El líder puede fijar los mensajes importantes del canal."
              compacto
            />
          }
        >
          {(lista) => (
            <>
              {lista.map((m) => (
                <Mensaje
                  key={m.id}
                  m={m}
                  miembros={p.miembros}
                  esLider={p.esLider}
                  usuarioId={p.usuarioId}
                  onHilo={() => onHilo(m.id)}
                  onATarea={() => p.onATarea(m)}
                  enHilo={false}
                />
              ))}
            </>
          )}
        </EstadosDatos>
      </div>
    </>
  );
}

// --- CH-09 ---------------------------------------------------------------------------------

/** CH-09: el líder convierte un mensaje en una propuesta de tarea (entra a votación). */
function ConvertirEnTarea({
  mensaje,
  onCerrar,
}: {
  mensaje: MensajeChat | null;
  onCerrar: () => void;
}) {
  const { equipo, base } = useEquipoActual();
  const acciones = useAccionesChat(equipo.id);
  // Se monta de nuevo con cada mensaje (`key`): el título parte de su primera línea.
  const [titulo, setTitulo] = useState(() =>
    mensaje ? (mensaje.texto.split('\n')[0] ?? '').slice(0, 140) : '',
  );
  const [error, setError] = useState('');

  const crear = async () => {
    if (!mensaje) return;
    try {
      const r = await acciones.mensajeATarea.mutateAsync({
        mensaje,
        titulo: titulo.trim() || undefined,
      });
      toast(
        r.tarea.estado === 'propuesta'
          ? `Tarea T-${String(r.tarea.codigo).padStart(2, '0')} propuesta: el equipo la votará.`
          : `Tarea T-${String(r.tarea.codigo).padStart(2, '0')} creada.`,
      );
      onCerrar();
    } catch (e) {
      setError(mensajeDeError(e));
    }
  };

  return (
    <Modal
      abierto={!!mensaje}
      onCerrar={onCerrar}
      titulo="Convertir en tarea"
      descripcion="Se propone al equipo con este título; el texto del mensaje queda como descripción."
      ancho="sm"
      nombre="NX/CH-09-ConvertirEnTarea"
      pie={
        <>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            cargando={acciones.mensajeATarea.isPending}
            disabled={!titulo.trim()}
            onClick={() => void crear()}
          >
            Proponer tarea
          </Boton>
        </>
      }
    >
      <Campo etiqueta="Título" error={error} ayuda={`${titulo.length}/140`}>
        <Entrada
          value={titulo}
          maxLength={140}
          onChange={(e) => setTitulo(e.target.value)}
          autoFocus
        />
      </Campo>
      <p className="mt-3 line-clamp-4 rounded-[10px] bg-surface p-2 text-sm text-muted">
        {mensaje?.texto}
      </p>
      <p className="mt-2 text-xs text-muted">
        La tarea queda en{' '}
        <Link to={`${base}/tareas/votacion`} className="text-brand underline">
          Votación
        </Link>
        .
      </p>
    </Modal>
  );
}
