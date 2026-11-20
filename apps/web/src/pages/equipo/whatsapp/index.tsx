import {
  esquemaConectarWa,
  esquemaConfigurarWa,
  MODOS_REGLA_WA,
  NOMBRE_MODO_WA,
  NOMBRE_REGLA_WA,
  type ConfiguracionWa,
  type MensajeWa,
  type PanelWa,
} from '@nexo/shared';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  MessageSquareShare,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Trash2,
  Unplug,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import {
  AreaTexto,
  Avatar,
  Banner,
  Boton,
  Campo,
  Casilla,
  Encabezado,
  Entrada,
  EsqueletoLista,
  EstadosDatos,
  Insignia,
  Interruptor,
  Segmentado,
  Selector,
  Tarjeta,
  Vacio,
  cx,
  useConfirmar,
} from '@/components/ui';
import { BurbujaWA } from '@/components/whatsapp/BurbujaWA';
import { mensajeDeError } from '@/lib/api';
import { useAccionesWa, useColaWa, useHistorialWa, usePanelWa } from '@/lib/consultasWhatsApp';
import { fechaCorta, hora } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { primerError } from '@/lib/validacion';
import { useEquipoActual } from '../contexto';

const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');
const cuando = (iso: string | null) => (iso ? `${fechaCorta(iso)} · ${hora(iso)}` : '—');
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const VISTAS = ['panel', 'cola', 'historial', 'reglas', 'personas'] as const;
type Vista = (typeof VISTAS)[number];

/**
 * WhatsApp del equipo (Fase 4.2). El líder ve el panel (WA-01), la cola (WA-02), el historial
 * (WA-04), las reglas y la programación (WA-05) y el consentimiento de cada persona (WA-07); el
 * integrante, solo el historial. Sin conexión, el líder ve el asistente (WA-06).
 */
export function WhatsAppLayout() {
  const { base, puede } = useEquipoActual();
  const loc = useLocation();
  const nav = useNavigate();
  const ruta = `${base}/whatsapp`;
  const esLider = puede('configurar_whatsapp').permitido;
  const vista: Vista =
    VISTAS.find((v) => loc.pathname.startsWith(`${ruta}/${v}`)) ??
    (loc.pathname.startsWith(`${ruta}/conectar`) ? 'panel' : 'panel');
  if (!esLider && !loc.pathname.startsWith(`${ruta}/historial`)) {
    return <Navigate to={`${ruta}/historial`} replace />;
  }
  return (
    <div className="space-y-4" data-name="NX/WA-whatsapp">
      <Encabezado
        titulo="WhatsApp"
        descripcion={
          esLider
            ? 'Avisos del equipo en su grupo de WhatsApp: qué se avisa, cuándo y qué ya salió.'
            : 'Los avisos que el equipo mandó al grupo de WhatsApp.'
        }
      />
      {esLider && (
        <Segmentado
          etiqueta="Vista de WhatsApp"
          valor={vista}
          onChange={(v) => nav(v === 'panel' ? ruta : `${ruta}/${v}`)}
          opciones={[
            { valor: 'panel', etiqueta: 'Panel' },
            { valor: 'cola', etiqueta: 'Cola' },
            { valor: 'historial', etiqueta: 'Historial' },
            { valor: 'reglas', etiqueta: 'Reglas' },
            { valor: 'personas', etiqueta: 'Personas' },
          ]}
        />
      )}
      <Outlet />
    </div>
  );
}

// --- WA-01 y WA-08 ----------------------------------------------------------------------------

const ESTADO: Record<
  ConfiguracionWa['estado'],
  { texto: string; tono: 'ok' | 'warn' | 'danger' | 'neutro' }
> = {
  conectado: { texto: 'Conectado', tono: 'ok' },
  pausado: { texto: 'En pausa', tono: 'warn' },
  error: { texto: 'Con error', tono: 'danger' },
  sin_configurar: { texto: 'Sin conectar', tono: 'neutro' },
};

/** WA-01: estado de la conexión, conteos, próximo reporte y acciones de pausa (WA-08). */
export function PanelWhatsApp() {
  const { equipo, base } = useEquipoActual();
  const consulta = usePanelWa(equipo.id);
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoLista filas={4} />}>
      {(p) =>
        p.configuracion.estado === 'sin_configurar' ? (
          <Navigate to={`${base}/whatsapp/conectar`} replace />
        ) : (
          <PanelConectado panel={p} />
        )
      }
    </EstadosDatos>
  );
}

function PanelConectado({ panel: p }: { panel: PanelWa }) {
  const { equipo, base } = useEquipoActual();
  const acciones = useAccionesWa(equipo.id);
  const confirmar = useConfirmar();
  const c = p.configuracion;
  const e = ESTADO[c.estado];
  const pausar = (pausado: boolean) =>
    acciones.configurar.mutate(
      { estado: pausado ? 'pausado' : 'conectado' },
      {
        onSuccess: () =>
          toast(
            pausado ? 'WhatsApp en pausa: los avisos esperan en la cola.' : 'WhatsApp reanudado.',
          ),
        onError: avisar,
      },
    );
  const desconectar = async () => {
    const ok = await confirmar({
      titulo: 'Desconectar WhatsApp',
      mensaje: 'Los avisos que esperan en la cola se cancelan. El historial se conserva.',
      confirmar: 'Desconectar',
      destructivo: true,
    });
    if (ok) acciones.desconectar.mutate(undefined, { onError: avisar });
  };
  return (
    <div className="space-y-4" data-name="NX/WA-01-Panel">
      {c.estado === 'pausado' && (
        <Banner
          tono="warn"
          icono={<Pause />}
          accion={
            <Boton tamano="sm" onClick={() => pausar(false)}>
              Reanudar
            </Boton>
          }
        >
          <strong>WhatsApp en pausa.</strong> Los avisos se siguen juntando en la cola, pero no sale
          nada.
        </Banner>
      )}
      {c.estado === 'error' && (
        <Banner
          tono="danger"
          icono={<AlertTriangle />}
          accion={
            <Boton tamano="sm" onClick={() => pausar(false)}>
              Reintentar
            </Boton>
          }
        >
          <strong>La conexión tiene un error.</strong>{' '}
          {c.causa_error ?? 'Revisa la cuenta de Meta.'}
        </Banner>
      )}
      {p.resumen.fallidos > 0 && (
        <Banner
          tono="danger"
          accion={
            <Boton
              tamano="sm"
              icono={<RotateCcw className="size-4" />}
              onClick={() =>
                acciones.reintentar.mutate(undefined, {
                  onSuccess: (r) => toast(`${r.reintentados} aviso(s) de vuelta en la cola.`),
                  onError: avisar,
                })
              }
            >
              Reintentar
            </Boton>
          }
        >
          {p.resumen.fallidos} aviso(s) no se pudieron enviar.
        </Banner>
      )}
      <Tarjeta as="section" className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-[#25d366]/15 text-[#128c4b] dark:text-[#25d366]">
              <MessageSquareShare className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-semibold">{c.grupo_nombre ?? 'Grupo del equipo'}</h2>
              <p className="text-sm text-muted">
                {c.proveedor === 'simulado'
                  ? 'Modo simulado: los avisos se registran como enviados, sin salir a WhatsApp.'
                  : c.proveedor === 'cloud_api_grupos'
                    ? 'API de grupos de Meta.'
                    : 'Mensajes directos a cada persona con consentimiento.'}
              </p>
            </div>
          </div>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen de avisos">
          <Dato titulo="En la cola" valor={p.resumen.en_cola} enlace={`${base}/whatsapp/cola`} />
          <Dato
            titulo="Para el reporte"
            valor={p.resumen.para_reporte}
            enlace={`${base}/whatsapp/cola`}
          />
          <Dato
            titulo="Enviados hoy"
            valor={p.resumen.enviados_hoy}
            enlace={`${base}/whatsapp/historial`}
          />
          <Dato
            titulo="Fallidos"
            valor={p.resumen.fallidos}
            enlace={`${base}/whatsapp/historial`}
          />
        </ul>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" aria-hidden />
          Próximo reporte: {c.proximo_reporte ? cuando(c.proximo_reporte) : 'sin programar'} ·{' '}
          {c.reporte_frecuencia === 'diario' ? 'diario' : `cada ${DIAS[c.reporte_dia - 1]}`} a las{' '}
          {c.reporte_hora}
        </p>
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {c.estado === 'conectado' ? (
            <Boton icono={<Pause className="size-4" />} onClick={() => pausar(true)}>
              Pausar avisos
            </Boton>
          ) : (
            <Boton icono={<Play className="size-4" />} onClick={() => pausar(false)}>
              Reanudar
            </Boton>
          )}
          <Link
            to={`${base}/whatsapp/conectar`}
            className="inline-flex h-11 items-center rounded-[8px] px-3 text-sm text-brand hover:bg-brand/10"
          >
            Cambiar grupo
          </Link>
          <Boton
            variante="fantasma"
            icono={<Unplug className="size-4" />}
            onClick={() => void desconectar()}
          >
            Desconectar
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}

function Dato({ titulo, valor, enlace }: { titulo: string; valor: number; enlace: string }) {
  return (
    <li>
      <Link to={enlace} className="block rounded-[12px] border border-line p-3 hover:bg-surface">
        <span className="block text-xs text-muted">{titulo}</span>
        <span className="block text-2xl font-semibold tabular">{valor}</span>
      </Link>
    </li>
  );
}

// --- WA-02 y WA-03 ------------------------------------------------------------------------------

/** WA-02: la cola. El líder revisa, corrige, elige y envía; WA-03 muestra cómo se verá. */
export function ColaWhatsApp() {
  const { equipo } = useEquipoActual();
  const consulta = useColaWa(equipo.id);
  const acciones = useAccionesWa(equipo.id);
  const seleccionados =
    consulta.data?.instantaneos.filter((m) => m.seleccionado && m.estado === 'pendiente') ?? [];
  const enviar = () =>
    acciones.enviar.mutate(undefined, {
      onSuccess: (r) =>
        toast(
          r.fallidos
            ? `${r.enviados} enviado(s); ${r.fallidos} fallaron.`
            : `${r.enviados} aviso(s) enviados al grupo.`,
          r.fallidos ? 'warn' : 'ok',
        ),
      onError: avisar,
    });
  return (
    <div className="space-y-4" data-name="NX/WA-02-Cola">
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoLista filas={3} />}>
        {(c) => (
          <>
            <section className="space-y-3" aria-labelledby="cola-al-instante">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="cola-al-instante" className="font-semibold">
                  Por enviar ahora{' '}
                  <span className="text-muted tabular">({c.instantaneos.length})</span>
                </h2>
                <Boton
                  variante="primario"
                  icono={<Send className="size-4" />}
                  disabled={seleccionados.length === 0}
                  motivo="Elige al menos un aviso."
                  cargando={acciones.enviar.isPending}
                  onClick={enviar}
                >
                  Enviar {seleccionados.length || ''} seleccionado
                  {seleccionados.length === 1 ? '' : 's'}
                </Boton>
              </div>
              {c.instantaneos.length === 0 ? (
                <Vacio
                  icono={<CheckCheck />}
                  titulo="La cola está al día"
                  texto="Los avisos de las reglas «Al instante» aparecen aquí para que los revises antes de enviarlos."
                  compacto
                />
              ) : (
                <ul className="space-y-3">
                  {c.instantaneos.map((m) => (
                    <AvisoEnCola key={m.id} m={m} />
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2" aria-labelledby="cola-reporte">
              <h2 id="cola-reporte" className="font-semibold">
                Para el próximo reporte{' '}
                <span className="text-muted tabular">({c.para_reporte.length})</span>
              </h2>
              <p className="text-sm text-muted">
                Se envían juntos en un resumen{' '}
                {c.proximo_reporte ? `el ${cuando(c.proximo_reporte)}` : 'a la hora programada'}.
              </p>
              {c.para_reporte.length > 0 && (
                <ul className="divide-y divide-line rounded-[12px] border border-line">
                  {c.para_reporte.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                      <span className="min-w-0 break-words">{m.texto}</span>
                      <span className="shrink-0 text-xs text-muted tabular">
                        {hora(m.creado_en)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </EstadosDatos>
    </div>
  );
}

function AvisoEnCola({ m }: { m: MensajeWa }) {
  const { equipo } = useEquipoActual();
  const acciones = useAccionesWa(equipo.id);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(m.texto);
  const regla = NOMBRE_REGLA_WA[m.tipo_evento as keyof typeof NOMBRE_REGLA_WA];
  const guardar = () =>
    acciones.editar.mutate(
      { id: m.id, texto },
      { onSuccess: () => setEditando(false), onError: avisar },
    );
  return (
    <li>
      <Tarjeta
        className={cx(
          'grid gap-3 p-3 sm:grid-cols-[1fr_minmax(0,320px)]',
          !m.seleccionado && 'opacity-70',
        )}
      >
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Casilla
              etiqueta="Enviar este aviso"
              checked={m.seleccionado}
              disabled={m.estado !== 'pendiente'}
              onChange={(v) =>
                acciones.editar.mutate({ id: m.id, seleccionado: v }, { onError: avisar })
              }
            />
            <Insignia tono="info">{regla?.nombre ?? m.tipo_evento}</Insignia>
            <span className="text-xs text-muted tabular">{cuando(m.creado_en)}</span>
            {m.estado === 'enviando' && <Insignia tono="warn">Enviando…</Insignia>}
          </div>
          {editando ? (
            <div className="space-y-2">
              <AreaTexto
                value={texto}
                maxLength={400}
                rows={3}
                aria-label="Texto del aviso"
                onChange={(e) => setTexto(e.target.value)}
              />
              <div className="flex gap-2">
                <Boton
                  tamano="sm"
                  variante="primario"
                  cargando={acciones.editar.isPending}
                  onClick={guardar}
                >
                  Guardar
                </Boton>
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  onClick={() => {
                    setTexto(m.texto);
                    setEditando(false);
                  }}
                >
                  Cancelar
                </Boton>
                <span className="ml-auto self-center text-xs text-muted tabular">
                  {texto.length}/400
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm break-words whitespace-pre-wrap">{m.texto}</p>
          )}
          {m.estado === 'pendiente' && !editando && (
            <div className="flex gap-1">
              <Boton
                tamano="sm"
                variante="fantasma"
                icono={<Pencil className="size-4" />}
                onClick={() => setEditando(true)}
              >
                Editar
              </Boton>
              <Boton
                tamano="sm"
                variante="fantasma"
                icono={<Trash2 className="size-4" />}
                onClick={() => acciones.descartar.mutate([m.id], { onError: avisar })}
              >
                Descartar
              </Boton>
            </div>
          )}
        </div>
        <BurbujaWA texto={editando ? texto : m.texto} hora={hora(m.creado_en)} />
      </Tarjeta>
    </li>
  );
}

// --- WA-04 ----------------------------------------------------------------------------------

/** WA-04: historial de lo enviado, lo que falló y lo descartado. */
export function HistorialWhatsApp() {
  const { equipo } = useEquipoActual();
  const [filtro, setFiltro] = useState<'todo' | 'enviado' | 'fallido' | 'cancelado'>('todo');
  const consulta = useHistorialWa(equipo.id, filtro === 'todo' ? undefined : filtro);
  const items = consulta.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-4" data-name="NX/WA-04-Historial">
      <Segmentado
        etiqueta="Estado de los avisos"
        valor={filtro}
        onChange={setFiltro}
        opciones={[
          { valor: 'todo', etiqueta: 'Todo' },
          { valor: 'enviado', etiqueta: 'Enviados' },
          { valor: 'fallido', etiqueta: 'Fallidos' },
          { valor: 'cancelado', etiqueta: 'Descartados' },
        ]}
      />
      <EstadosDatos
        consulta={{ ...consulta, data: consulta.data ? items : undefined }}
        esqueleto={<EsqueletoLista filas={4} />}
        vacio={
          <Vacio
            icono={<MessageSquareShare />}
            titulo="Sin avisos todavía"
            texto="Aquí aparece cada aviso que sale al grupo."
          />
        }
      >
        {(lista) => (
          <ol className="space-y-3">
            {lista.map((m) => (
              <li key={m.id}>
                <Tarjeta className="grid gap-3 p-3 sm:grid-cols-[1fr_minmax(0,320px)]">
                  <div className="min-w-0 space-y-1.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <EstadoAviso m={m} />
                      <span className="text-xs text-muted tabular">
                        {cuando(m.enviado_en ?? m.creado_en)}
                      </span>
                      {m.tipo_evento === 'reporte' && <Insignia tono="marca">Reporte</Insignia>}
                    </div>
                    {m.enviado_por ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <Avatar
                          persona={{
                            nombre: m.enviado_por.nombre,
                            colorIdx: m.enviado_por.color_idx,
                          }}
                          tamano={18}
                        />
                        Enviado por {m.enviado_por.nombre}
                      </p>
                    ) : (
                      m.estado === 'enviado' && (
                        <p className="text-xs text-muted">Enviado por Nexo</p>
                      )
                    )}
                    {m.ultimo_error && m.estado !== 'enviado' && (
                      <p className="text-xs text-danger">{m.ultimo_error}</p>
                    )}
                  </div>
                  <BurbujaWA texto={m.texto} hora={m.enviado_en ? hora(m.enviado_en) : undefined} />
                </Tarjeta>
              </li>
            ))}
            {consulta.hasNextPage && (
              <li className="text-center">
                <Boton
                  variante="texto"
                  cargando={consulta.isFetchingNextPage}
                  onClick={() => consulta.fetchNextPage()}
                >
                  Ver anteriores
                </Boton>
              </li>
            )}
          </ol>
        )}
      </EstadosDatos>
    </div>
  );
}

function EstadoAviso({ m }: { m: MensajeWa }) {
  if (m.estado === 'fallido') return <Insignia tono="danger">Falló</Insignia>;
  if (m.estado === 'cancelado') return <Insignia tono="neutro">Descartado</Insignia>;
  if (m.leido_en) return <Insignia tono="ok">Leído</Insignia>;
  if (m.entregado_en) return <Insignia tono="ok">Entregado</Insignia>;
  return <Insignia tono="ok">Enviado</Insignia>;
}

// --- WA-05 ----------------------------------------------------------------------------------

/** WA-05: qué evento se avisa y cómo, el reporte programado, el silencio y el envío automático. */
export function ReglasWhatsApp() {
  const { equipo } = useEquipoActual();
  const consulta = usePanelWa(equipo.id);
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoLista filas={6} />}>
      {(p) => <FormReglas panel={p} />}
    </EstadosDatos>
  );
}

function FormReglas({ panel: p }: { panel: PanelWa }) {
  const { equipo } = useEquipoActual();
  const acciones = useAccionesWa(equipo.id);
  const c = p.configuracion;
  const [frecuencia, setFrecuencia] = useState(c.reporte_frecuencia);
  const [horaRep, setHoraRep] = useState(c.reporte_hora);
  const [dia, setDia] = useState(c.reporte_dia);
  const [silencio, setSilencio] = useState(!!c.silencio_desde);
  const [desde, setDesde] = useState(c.silencio_desde ?? '22:00');
  const [hasta, setHasta] = useState(c.silencio_hasta ?? '07:00');
  const [error, setError] = useState<string>();
  const guardarProgramacion = () => {
    const cambios = {
      reporte_frecuencia: frecuencia,
      reporte_hora: horaRep,
      reporte_dia: dia,
      silencio_desde: silencio ? desde : null,
      silencio_hasta: silencio ? hasta : null,
    };
    const invalido = primerError(esquemaConfigurarWa, cambios);
    if (invalido) return setError(invalido);
    setError(undefined);
    acciones.configurar.mutate(cambios, {
      onSuccess: () => toast('Programación guardada.'),
      onError: (e) => setError(mensajeDeError(e)),
    });
  };
  return (
    <div className="space-y-4" data-name="NX/WA-05-Reglas">
      <Tarjeta as="section" className="p-4 sm:p-5">
        <h2 className="font-semibold">¿Qué se avisa y cuándo?</h2>
        <p className="mb-3 text-sm text-muted">
          «Al instante» deja el aviso en la cola para que lo revises; «En el reporte» lo junta en el
          resumen programado.
        </p>
        <ul className="divide-y divide-line">
          {p.reglas.map((r) => (
            <li
              key={r.tipo_evento}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{NOMBRE_REGLA_WA[r.tipo_evento].nombre}</p>
                <p className="text-xs text-muted">{NOMBRE_REGLA_WA[r.tipo_evento].descripcion}</p>
              </div>
              <Selector
                aria-label={`Cuándo avisar: ${NOMBRE_REGLA_WA[r.tipo_evento].nombre}`}
                className="w-44"
                value={r.modo}
                onChange={(e) =>
                  acciones.regla.mutate(
                    {
                      tipo: r.tipo_evento,
                      modo: e.target.value as (typeof MODOS_REGLA_WA)[number],
                    },
                    { onError: avisar },
                  )
                }
              >
                {MODOS_REGLA_WA.map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_MODO_WA[m]}
                  </option>
                ))}
              </Selector>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta as="section" className="space-y-4 p-4 sm:p-5">
        <h2 className="font-semibold">Reporte programado y horas de silencio</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Frecuencia">
            <Selector
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as 'diario' | 'semanal')}
            >
              <option value="diario">Diario</option>
              <option value="semanal">Semanal</option>
            </Selector>
          </Campo>
          {frecuencia === 'semanal' && (
            <Campo etiqueta="Día">
              <Selector value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                {DIAS.map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </Selector>
            </Campo>
          )}
          <Campo etiqueta="Hora">
            <Entrada type="time" value={horaRep} onChange={(e) => setHoraRep(e.target.value)} />
          </Campo>
        </div>
        <Interruptor
          etiqueta="Horas de silencio"
          descripcion="En ese horario no sale nada; lo pendiente espera."
          checked={silencio}
          onChange={setSilencio}
        />
        {silencio && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Desde">
              <Entrada type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hasta">
              <Entrada type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Campo>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Boton
          variante="primario"
          cargando={acciones.configurar.isPending}
          onClick={guardarProgramacion}
        >
          Guardar programación
        </Boton>
        <div className="border-t border-line pt-3">
          <Interruptor
            etiqueta="Envío automático"
            descripcion="Los avisos «Al instante» salen sin que los revises. Por defecto el líder revisa y envía."
            checked={c.envio_automatico}
            onChange={(v) =>
              acciones.configurar.mutate({ envio_automatico: v }, { onError: avisar })
            }
          />
        </div>
      </Tarjeta>
    </div>
  );
}

// --- WA-06 ----------------------------------------------------------------------------------

/** WA-06: asistente para conectar el grupo del equipo. */
export function ConectarWhatsApp() {
  const { equipo, base } = useEquipoActual();
  const acciones = useAccionesWa(equipo.id);
  const nav = useNavigate();
  const [paso, setPaso] = useState(1);
  const [grupo, setGrupo] = useState(`${equipo.nombre} · avisos`);
  const [enlace, setEnlace] = useState('');
  const [error, setError] = useState<string>();
  const conectar = () => {
    const datos = {
      proveedor: 'simulado' as const,
      grupo_nombre: grupo,
      enlace_invitacion: enlace,
    };
    const invalido = primerError(esquemaConectarWa, datos);
    if (invalido) return setError(invalido);
    acciones.conectar.mutate(datos, {
      onSuccess: () => {
        toast('WhatsApp conectado. Ajusta qué se avisa en «Reglas».');
        nav(`${base}/whatsapp`);
      },
      onError: (e) => setError(mensajeDeError(e)),
    });
  };
  return (
    <Tarjeta as="section" className="max-w-2xl space-y-4 p-4 sm:p-6" data-name="NX/WA-06-Conectar">
      <p className="text-xs text-muted">Paso {paso} de 3</p>
      {paso === 1 && (
        <>
          <h2 className="text-lg font-semibold">¿Cómo se conecta?</h2>
          <OpcionConexion
            elegida
            titulo="Modo simulado"
            texto="Nexo arma los avisos, el líder los revisa y quedan en el historial como enviados, sin salir a WhatsApp. Sirve para usar y demostrar todo el flujo."
          />
          <OpcionConexion
            titulo="Grupo de WhatsApp (API de grupos de Meta)"
            texto="Requiere una cuenta de empresa oficial de Meta (OBA), que todavía no tenemos (docs/whatsapp-verificacion.md)."
          />
          <OpcionConexion
            titulo="Mensajes directos a cada persona"
            texto="Requiere la cuenta de Meta configurada en el servidor."
          />
          <Boton variante="primario" onClick={() => setPaso(2)}>
            Continuar
          </Boton>
        </>
      )}
      {paso === 2 && (
        <>
          <h2 className="text-lg font-semibold">El grupo</h2>
          <Campo etiqueta="Nombre del grupo" error={error}>
            <Entrada
              value={grupo}
              maxLength={100}
              onChange={(e) => setGrupo(e.target.value)}
              autoFocus
            />
          </Campo>
          <Campo
            etiqueta="Enlace de invitación"
            opcional
            ayuda="Las personas que aceptan avisos lo ven en Ajustes → WhatsApp."
          >
            <Entrada
              type="url"
              value={enlace}
              placeholder="https://chat.whatsapp.com/…"
              onChange={(e) => setEnlace(e.target.value)}
            />
          </Campo>
          <div className="flex justify-between">
            <Boton onClick={() => setPaso(1)}>Atrás</Boton>
            <Boton variante="primario" onClick={() => setPaso(3)}>
              Continuar
            </Boton>
          </div>
        </>
      )}
      {paso === 3 && (
        <>
          <h2 className="text-lg font-semibold">Así se verán los avisos</h2>
          <BurbujaWA
            grupo={grupo}
            texto={`📅 Reunión «Daily» mañana a las 9:30. Confirma tu asistencia en Nexo.`}
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>
              Reuniones y vencimientos: al instante. Lo demás, en el reporte diario de las 18:00.
            </li>
            <li>Solo se menciona a quien aceptó los avisos de WhatsApp (Ajustes → WhatsApp).</li>
          </ul>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-between">
            <Boton onClick={() => setPaso(2)}>Atrás</Boton>
            <Boton
              variante="primario"
              icono={<Check className="size-4" />}
              cargando={acciones.conectar.isPending}
              onClick={conectar}
            >
              Conectar
            </Boton>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

function OpcionConexion({
  titulo,
  texto,
  elegida,
}: {
  titulo: string;
  texto: ReactNode;
  elegida?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[12px] border p-3',
        elegida ? 'border-brand bg-brand/5' : 'border-line opacity-70',
      )}
      aria-disabled={!elegida || undefined}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        {elegida ? (
          <Check className="size-4 text-brand" aria-hidden />
        ) : (
          <Clock className="size-4 text-muted" aria-hidden />
        )}
        {titulo}
        {!elegida && <Insignia tono="neutro">No disponible aún</Insignia>}
      </p>
      <p className="mt-1 text-xs text-muted">{texto}</p>
    </div>
  );
}

// --- WA-07 ----------------------------------------------------------------------------------

/** WA-07: consentimiento de cada persona. Sin consentimiento, los avisos no la mencionan. */
export function PersonasWhatsApp() {
  const { equipo } = useEquipoActual();
  const consulta = usePanelWa(equipo.id);
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoLista filas={5} />}>
      {(p) => (
        <Tarjeta as="section" className="p-4 sm:p-5" data-name="NX/WA-07-Consentimiento">
          <h2 className="font-semibold">Consentimiento y menciones</h2>
          <p className="mb-3 text-sm text-muted">
            Cada persona decide en Ajustes → WhatsApp si acepta los avisos del equipo. Sin su
            consentimiento, Nexo no la menciona: el aviso sale sin su nombre.
          </p>
          <ul className="divide-y divide-line">
            {p.personas.map((x) => (
              <li key={x.usuario_id} className="flex items-center gap-3 py-2.5">
                <Avatar persona={{ nombre: x.nombre, colorIdx: x.color_idx }} tamano={32} />
                <span className="min-w-0 flex-1 truncate text-sm">{x.nombre}</span>
                {x.consentimiento === true ? (
                  <Insignia tono="ok">
                    <UserCheck className="size-3.5" aria-hidden /> Acepta
                  </Insignia>
                ) : x.consentimiento === false ? (
                  <Insignia tono="neutro">
                    <UserX className="size-3.5" aria-hidden /> No acepta
                  </Insignia>
                ) : (
                  <Insignia tono="warn">Sin responder</Insignia>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </EstadosDatos>
  );
}
