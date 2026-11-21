import type { ConversacionChat, TipoConversacion } from '@nexo/shared';
import { BellOff, CheckSquare, Hash, MessageCircle, Pin, Plus, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import {
  Avatar,
  Boton,
  Buscador,
  cx,
  EsqueletoLista,
  EstadosDatos,
  Insignia,
  Modal,
  Vacio,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesChat, useBusquedaChat, useConversaciones } from '@/lib/consultasChat';
import { fechaCorta, hora } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { Conversacion } from './Conversacion';

const SECCIONES: { tipos: TipoConversacion[]; titulo: string }[] = [
  { tipos: ['equipo', 'invitados'], titulo: 'Canales' },
  { tipos: ['tarea'], titulo: 'Tareas' },
  { tipos: ['dm'], titulo: 'Mensajes directos' },
];

function IconoConversacion({ tipo }: { tipo: TipoConversacion }) {
  const props = { className: 'size-4', 'aria-hidden': true } as const;
  if (tipo === 'tarea') return <CheckSquare {...props} />;
  if (tipo === 'invitados') return <UsersRound {...props} />;
  return <Hash {...props} />;
}

/** Hora si es de hoy; si no, la fecha corta. */
function cuando(iso: string): string {
  return new Date(iso).toDateString() === new Date().toDateString() ? hora(iso) : fechaCorta(iso);
}

/**
 * CH-01 a CH-10: chat del equipo. Lista de conversaciones a la izquierda (canales, tareas y
 * mensajes directos con sus no leídos), la conversación abierta a la derecha y, a un lado, el
 * hilo, los fijados o la búsqueda. En el móvil se ve una cosa a la vez.
 */
export function Chat() {
  const { equipo, puede, base } = useEquipoActual();
  const { conversacionId } = useParams();
  const conversaciones = useConversaciones(equipo.id);
  const [nueva, setNueva] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const lista = conversaciones.data ?? [];
  // Sin conversación elegida, en escritorio se abre la del equipo (o, si no hay, la primera).
  const predeterminada = lista.find((c) => c.tipo === 'equipo') ?? lista[0];
  const [escritorio, setEscritorio] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const alCambiar = () => setEscritorio(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  if (!conversacionId && escritorio && predeterminada) {
    return <Navigate to={`${base}/chat/${predeterminada.id}`} replace />;
  }

  const abierta = lista.find((c) => c.id === conversacionId);
  const puedeDm = puede('mensajes_directos').permitido;

  return (
    <div
      className="grid min-h-[70dvh] gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"
      data-name="NX/CH-01-Chat"
    >
      <aside
        aria-label="Conversaciones"
        className={cx('min-w-0 space-y-3', conversacionId && 'hidden lg:block')}
      >
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Chat</h1>
          {puedeDm && (
            <Boton tamano="sm" icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>
              Nueva
            </Boton>
          )}
        </div>
        <Buscador
          valor={busqueda}
          onChange={setBusqueda}
          etiqueta="Buscar en el chat"
          placeholder="Buscar mensajes…"
        />
        {busqueda.trim().length >= 2 ? (
          <Resultados equipoId={equipo.id} texto={busqueda} onElegir={() => setBusqueda('')} />
        ) : (
          <EstadosDatos
            consulta={conversaciones}
            esqueleto={<EsqueletoLista filas={5} />}
            vacio={<Vacio icono={<MessageCircle />} titulo="Sin conversaciones" compacto />}
          >
            {(datos) => (
              <nav className="space-y-4">
                {SECCIONES.map(({ tipos, titulo }) => {
                  const items = datos.filter((c) => tipos.includes(c.tipo));
                  if (items.length === 0) return null;
                  return (
                    <section key={titulo} aria-label={titulo}>
                      <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-muted uppercase">
                        {titulo}
                      </h2>
                      <ul className="space-y-0.5">
                        {items.map((c) => (
                          <ItemConversacion key={c.id} c={c} activa={c.id === conversacionId} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </nav>
            )}
          </EstadosDatos>
        )}
      </aside>

      <section
        aria-label="Conversación"
        className={cx('min-w-0', !conversacionId && 'hidden lg:block')}
      >
        {conversacionId ? (
          <Conversacion key={conversacionId} conversacionId={conversacionId} resumen={abierta} />
        ) : (
          <Vacio
            icono={<MessageCircle />}
            titulo="Elige una conversación"
            texto="Los canales, los chats de tarea y tus mensajes directos aparecen a la izquierda."
          />
        )}
      </section>

      <NuevaConversacion abierto={nueva} onCerrar={() => setNueva(false)} />
    </div>
  );
}

function ItemConversacion({ c, activa }: { c: ConversacionChat; activa: boolean }) {
  const { base } = useEquipoActual();
  return (
    <li>
      <Link
        to={`${base}/chat/${c.id}`}
        aria-current={activa ? 'page' : undefined}
        className={cx(
          'flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-surface',
          activa && 'bg-brand/10',
        )}
      >
        {c.tipo === 'dm' && c.con ? (
          <Avatar persona={{ nombre: c.con.nombre, colorIdx: c.con.color_idx }} tamano={32} />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-muted">
            <IconoConversacion tipo={c.tipo} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cx('truncate text-sm', c.no_leidos > 0 && 'font-semibold')}>
              {c.nombre}
            </span>
            {c.fijada && <Pin className="size-3 shrink-0 text-muted" aria-label="Fijada" />}
            {c.silenciada && (
              <BellOff className="size-3 shrink-0 text-muted" aria-label="Silenciada" />
            )}
          </span>
          {c.ultimo && (
            <span className="block truncate text-xs text-muted">
              {c.ultimo.autor_nombre && !c.ultimo.es_sistema ? `${c.ultimo.autor_nombre}: ` : ''}
              {c.ultimo.texto}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {c.ultimo && (
            <span className="text-[11px] text-muted tabular">{cuando(c.ultimo.creado_en)}</span>
          )}
          {c.no_leidos > 0 && (
            <Insignia tono={c.menciones_sin_leer > 0 ? 'danger' : 'marca'}>
              <span aria-label={`${c.no_leidos} sin leer`}>
                {c.menciones_sin_leer > 0 ? '@' : ''}
                {c.no_leidos}
              </span>
            </Insignia>
          )}
        </span>
      </Link>
    </li>
  );
}

/** CH-08: resultados de la búsqueda; cada uno lleva a su conversación. */
function Resultados({
  equipoId,
  texto,
  onElegir,
}: {
  equipoId: string;
  texto: string;
  onElegir: () => void;
}) {
  const { base } = useEquipoActual();
  const consulta = useBusquedaChat(equipoId, texto);
  return (
    <EstadosDatos
      consulta={consulta}
      esqueleto={<EsqueletoLista filas={3} />}
      vacio={<Vacio titulo="Sin resultados" texto="Prueba con otra palabra." compacto />}
    >
      {(datos) => (
        <ul className="space-y-1" aria-label="Resultados de la búsqueda">
          {datos.map((r) => (
            <li key={r.mensaje_id}>
              <Link
                to={`${base}/chat/${r.conversacion_id}`}
                onClick={onElegir}
                className="block rounded-[10px] px-2 py-2 hover:bg-surface"
              >
                <span className="flex justify-between gap-2 text-xs text-muted">
                  <span className="truncate">
                    {r.conversacion}
                    {r.autor ? ` · ${r.autor.nombre}` : ''}
                  </span>
                  <span className="tabular">{fechaCorta(r.creado_en)}</span>
                </span>
                <Fragmento texto={r.fragmento} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </EstadosDatos>
  );
}

/** El fragmento marca lo encontrado entre «…»: se resalta sin interpretar HTML. */
function Fragmento({ texto }: { texto: string }) {
  return (
    <span className="line-clamp-2 text-sm">
      {texto.split(/(«[^»]*»)/).map((t, i) =>
        t.startsWith('«') ? (
          <mark key={i} className="rounded bg-brand/20 px-0.5 text-fg">
            {t.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{t}</span>
        ),
      )}
    </span>
  );
}

/** CH-07: nueva conversación (mensaje directo) con otra persona del equipo. */
function NuevaConversacion({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const { equipo, usuarioId, base } = useEquipoActual();
  const acciones = useAccionesChat(equipo.id);
  const navegar = useNavigate();
  const posibles = equipo.miembros.filter(
    (m) => m.rol !== 'invitado' && m.usuario_id !== usuarioId,
  );
  const abrir = async (usuario: string) => {
    try {
      const c = await acciones.abrirDm.mutateAsync(usuario);
      onCerrar();
      navegar(`${base}/chat/${c.id}`);
    } catch (e) {
      toast(mensajeDeError(e), 'danger');
    }
  };
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nueva conversación"
      descripcion="Elige a quién escribirle. Solo ustedes dos verán el chat."
      ancho="sm"
      nombre="NX/CH-07-NuevaConversacion"
    >
      <ul className="space-y-1">
        {posibles.map((m) => (
          <li key={m.usuario_id}>
            <button
              type="button"
              onClick={() => abrir(m.usuario_id)}
              disabled={acciones.abrirDm.isPending}
              className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left hover:bg-surface"
            >
              <Avatar persona={{ nombre: m.nombre, colorIdx: m.color_idx }} tamano={32} />
              <span className="text-sm">{m.nombre}</span>
            </button>
          </li>
        ))}
        {posibles.length === 0 && (
          <li className="py-4 text-center text-sm text-muted">No hay más personas en el equipo.</li>
        )}
      </ul>
    </Modal>
  );
}

/** Abre (y crea la primera vez) el chat de una tarea y va a él; lo usa el botón del detalle. */
export function ChatDeTarea() {
  const { equipo, base } = useEquipoActual();
  const { tareaId } = useParams();
  const acciones = useAccionesChat(equipo.id);
  const navegar = useNavigate();
  const [error, setError] = useState('');
  const { mutate } = acciones.abrirChatDeTarea;
  useEffect(() => {
    if (!tareaId) return;
    mutate(tareaId, {
      onSuccess: (c) => navegar(`${base}/chat/${c.id}`, { replace: true }),
      onError: (e) => setError(mensajeDeError(e)),
    });
  }, [tareaId, mutate, navegar, base]);
  return error ? (
    <Vacio titulo="No pudimos abrir el chat" texto={error} />
  ) : (
    <EsqueletoLista filas={4} />
  );
}
