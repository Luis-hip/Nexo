import {
  ESTADOS_CONTACTO,
  NOMBRE_ESTADO_CONTACTO,
  NOMBRE_PRIORIDAD_CONTACTO,
  NOMBRE_TIPO_CONTACTO,
  PRIORIDADES_CONTACTO,
  TIPOS_MENSAJE_CONTACTO,
  TRANSICIONES_CONTACTO,
  type EstadoContacto,
  type EventoContacto,
  type FiltrosContacto,
  type MensajeContacto,
  type PrioridadContacto,
  type TipoContacto,
} from '@nexo/shared';
import {
  ArrowLeft,
  Download,
  Lock,
  MessageSquareReply,
  RefreshCw,
  ShieldAlert,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  AreaTexto,
  Banner,
  Boton,
  Buscador,
  Campo,
  Encabezado,
  Entrada,
  EsqueletoLista,
  EsqueletoTarjetas,
  EstadosDatos,
  Insignia,
  Pestanas,
  Radios,
  Selector,
  SelectorMultiple,
  SinPermisos,
  Tabla,
  Tarjeta,
  cx,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import {
  urlExportar,
  useAccionesContacto,
  useBandejaContacto,
  useDetalleContacto,
  useEquipoContacto,
  useMetricasContacto,
  usePermisosContacto,
} from '@/lib/consultasContacto';
import { toast } from '@/lib/toasts';

/**
 * Panel de contacto y soporte (docs/12_Plan_Contacto.md §8.4). Solo con el permiso de sistema
 * `contacto.ver`; los controles de escritura, con `contacto.gestionar`. La API lo vuelve a exigir.
 * Todo lo que escribieron las personas se muestra como texto.
 */

const TONO_ESTADO = {
  nuevo: 'marca',
  en_revision: 'info',
  esperando_usuario: 'warn',
  resuelto: 'ok',
  descartado: 'neutro',
} as const;
const TONO_PRIORIDAD = { baja: 'neutro', normal: 'info', alta: 'danger' } as const;

const relativa = (iso: string) => {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const tabla: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2629800, 'week'],
    [31557600, 'month'],
  ];
  const divisores = [1, 60, 3600, 86400, 604800, 2629800];
  for (let i = 0; i < tabla.length; i++) {
    if (Math.abs(s) < tabla[i]![0]) return rtf.format(Math.round(s / divisores[i]!), tabla[i]![1]);
  }
  return rtf.format(Math.round(s / 31557600), 'year');
};
const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

/** Guardia del panel: sin `contacto.ver`, «sin permisos». */
function ConPermiso({ children }: { children: (gestionar: boolean) => React.ReactNode }) {
  const p = usePermisosContacto();
  if (p.isPending) return <EsqueletoLista filas={4} />;
  if (!p.data?.ver)
    return (
      <SinPermisos
        motivo="El panel de contacto es solo para el equipo de soporte de Nexo."
        quien="al equipo de Nexo"
      />
    );
  return <>{children(p.data.gestionar)}</>;
}

export function PanelContacto() {
  const [sp, setSp] = useSearchParams();
  const vista = sp.get('vista') === 'metricas' ? 'metricas' : 'bandeja';
  return (
    <div className="space-y-5" data-name="NX/ADM-Contacto">
      <Encabezado
        titulo="Contacto y soporte"
        descripcion="Dudas, errores y sugerencias que llegan desde el formulario."
      />
      <ConPermiso>
        {(gestionar) => (
          <>
            <Pestanas
              etiqueta="Vista del panel"
              valor={vista}
              onChange={(v) => setSp(v === 'metricas' ? { vista: 'metricas' } : {})}
              pestanas={[
                { valor: 'bandeja', etiqueta: 'Bandeja' },
                { valor: 'metricas', etiqueta: 'Métricas' },
              ]}
            />
            {vista === 'metricas' ? <Metricas /> : <Bandeja gestionar={gestionar} />}
          </>
        )}
      </ConPermiso>
    </div>
  );
}

function Bandeja({ gestionar }: { gestionar: boolean }) {
  const nav = useNavigate();
  const equipo = useEquipoContacto();
  const [texto, setTexto] = useState('');
  const [f, setF] = useState<FiltrosContacto>({ pagina: 1, por_pagina: 25, orden: 'reciente' });
  // Búsqueda con espera: no se consulta en cada tecla.
  useEffect(() => {
    const t = setTimeout(
      () => setF((x) => ({ ...x, q: texto.trim() || undefined, pagina: 1 })),
      350,
    );
    return () => clearTimeout(t);
  }, [texto]);
  const consulta = useBandejaContacto(f);
  const cambiar = (c: Partial<FiltrosContacto>) => setF((x) => ({ ...x, ...c, pagina: 1 }));
  const paginas = consulta.data
    ? Math.max(1, Math.ceil(consulta.data.total / (f.por_pagina ?? 25)))
    : 1;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <Buscador
          valor={texto}
          onChange={setTexto}
          placeholder="Buscar por texto, folio o correo"
          etiqueta="Buscar mensajes"
        />
        {gestionar && (
          <a
            href={urlExportar(f)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-line-strong/60 px-4 text-sm font-medium hover:bg-surface"
          >
            <Download className="size-4" aria-hidden /> Exportar CSV
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Estado</span>
          <SelectorMultiple
            etiqueta="Estado"
            valor={f.estado ?? []}
            onChange={(estado) => cambiar({ estado })}
            opciones={ESTADOS_CONTACTO.map((e) => ({
              valor: e,
              etiqueta: NOMBRE_ESTADO_CONTACTO[e],
            }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Tipo</span>
          <SelectorMultiple
            etiqueta="Tipo"
            valor={f.tipo ?? []}
            onChange={(tipo) => cambiar({ tipo })}
            opciones={TIPOS_MENSAJE_CONTACTO.map((t) => ({
              valor: t,
              etiqueta: NOMBRE_TIPO_CONTACTO[t].nombre,
            }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Prioridad">
          <Selector
            value={f.prioridad?.[0] ?? ''}
            onChange={(e) =>
              cambiar({
                prioridad: e.target.value ? [e.target.value as PrioridadContacto] : undefined,
              })
            }
          >
            <option value="">Todas</option>
            {PRIORIDADES_CONTACTO.map((p) => (
              <option key={p} value={p}>
                {NOMBRE_PRIORIDAD_CONTACTO[p]}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Asignado">
          <Selector
            value={f.asignado ?? ''}
            onChange={(e) => cambiar({ asignado: e.target.value || undefined })}
          >
            <option value="">Todos</option>
            <option value="yo">Mis mensajes</option>
            <option value="sin_asignar">Sin asignar</option>
            {equipo.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Desde">
          <Entrada
            type="date"
            value={f.desde?.slice(0, 10) ?? ''}
            onChange={(e) =>
              cambiar({
                desde: e.target.value
                  ? new Date(`${e.target.value}T00:00:00`).toISOString()
                  : undefined,
              })
            }
          />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada
            type="date"
            value={
              f.hasta ? new Date(new Date(f.hasta).getTime() - 1).toISOString().slice(0, 10) : ''
            }
            onChange={(e) =>
              cambiar({
                hasta: e.target.value
                  ? new Date(
                      new Date(`${e.target.value}T00:00:00`).getTime() + 86_400_000,
                    ).toISOString()
                  : undefined,
              })
            }
          />
        </Campo>
        <Campo etiqueta="Orden">
          <Selector
            value={f.orden ?? 'reciente'}
            onChange={(e) => cambiar({ orden: e.target.value as FiltrosContacto['orden'] })}
          >
            <option value="reciente">Más recientes</option>
            <option value="antiguo">Más antiguos</option>
            <option value="prioridad">Prioridad</option>
          </Selector>
        </Campo>
      </div>
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoLista filas={6} />}>
        {(b) => (
          <>
            <Tabla<MensajeContacto>
              titulo="Mensajes de contacto"
              filas={b.datos}
              idFila={(m) => m.id}
              vacio={
                <p className="p-6 text-center text-sm text-muted">
                  No hay mensajes con estos filtros.
                </p>
              }
              columnas={[
                {
                  clave: 'folio',
                  titulo: 'Folio',
                  celda: (m) => (
                    <Link
                      to={`/admin/contacto/${m.id}`}
                      className={cx(
                        'font-mono text-xs text-brand hover:underline',
                        m.estado === 'nuevo' && 'font-bold',
                      )}
                    >
                      {m.folio}
                    </Link>
                  ),
                },
                {
                  clave: 'tipo',
                  titulo: 'Tipo',
                  celda: (m) => (
                    <Insignia tono="neutro">{NOMBRE_TIPO_CONTACTO[m.tipo].nombre}</Insignia>
                  ),
                },
                {
                  clave: 'asunto',
                  titulo: 'Asunto',
                  celda: (m) => (
                    <button
                      type="button"
                      className={cx(
                        'max-w-[22rem] truncate text-left hover:underline',
                        m.estado === 'nuevo' && 'font-semibold',
                      )}
                      onClick={() => nav(`/admin/contacto/${m.id}`)}
                      title={m.extracto}
                    >
                      {m.asunto}
                    </button>
                  ),
                },
                {
                  clave: 'remitente',
                  titulo: 'Remitente',
                  celda: (m) => (
                    <span className="flex items-center gap-1.5">
                      {m.nombre}
                      {m.registrado && <Insignia tono="marca">Usuario</Insignia>}
                    </span>
                  ),
                },
                {
                  clave: 'prioridad',
                  titulo: 'Prioridad',
                  celda: (m) => (
                    <Insignia tono={TONO_PRIORIDAD[m.prioridad]}>
                      {NOMBRE_PRIORIDAD_CONTACTO[m.prioridad]}
                    </Insignia>
                  ),
                },
                {
                  clave: 'estado',
                  titulo: 'Estado',
                  celda: (m) => (
                    <Insignia tono={TONO_ESTADO[m.estado]}>
                      {NOMBRE_ESTADO_CONTACTO[m.estado]}
                    </Insignia>
                  ),
                },
                {
                  clave: 'asignado',
                  titulo: 'Asignado',
                  celda: (m) => m.asignado?.nombre ?? <span className="text-muted">—</span>,
                },
                {
                  clave: 'fecha',
                  titulo: 'Recibido',
                  celda: (m) => (
                    <time dateTime={m.creado_en} title={fecha(m.creado_en)}>
                      {relativa(m.creado_en)}
                    </time>
                  ),
                },
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span className="tabular">
                {b.total} mensaje(s) · página {b.pagina} de {paginas}
              </span>
              <div className="flex gap-2">
                <Boton
                  tamano="sm"
                  disabled={b.pagina <= 1}
                  onClick={() => setF({ ...f, pagina: b.pagina - 1 })}
                >
                  Anterior
                </Boton>
                <Boton
                  tamano="sm"
                  disabled={b.pagina >= paginas}
                  onClick={() => setF({ ...f, pagina: b.pagina + 1 })}
                >
                  Siguiente
                </Boton>
              </div>
            </div>
          </>
        )}
      </EstadosDatos>
    </div>
  );
}

function Metricas() {
  const consulta = useMetricasContacto();
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={4} />}>
      {(m) => {
        const max = Math.max(1, ...m.por_dia.map((d) => d.total));
        const tarjetas: [string, string][] = [
          ['Mensajes (30 días)', String(m.total)],
          ['Abiertos', String(m.abiertos)],
          [
            'Primera respuesta',
            m.primera_respuesta_horas === null ? '—' : `${m.primera_respuesta_horas} h`,
          ],
          ['Resolución', m.resolucion_horas === null ? '—' : `${m.resolucion_horas} h`],
        ];
        return (
          <div className="space-y-4" data-name="NX/ADM-Contacto-Metricas">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tarjetas.map(([t, v]) => (
                <Tarjeta key={t} className="p-4">
                  <p className="text-sm text-muted">{t}</p>
                  <p className="mt-1 text-2xl font-semibold tabular">{v}</p>
                </Tarjeta>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Tarjeta className="space-y-2 p-4">
                <h2 className="text-sm font-semibold">Por tipo y estado</h2>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {(Object.keys(m.por_tipo) as TipoContacto[]).map((t) => (
                    <li key={t}>
                      <Insignia tono="neutro">
                        {NOMBRE_TIPO_CONTACTO[t].nombre}: {m.por_tipo[t]}
                      </Insignia>
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {(Object.keys(m.por_estado) as EstadoContacto[]).map((s) => (
                    <li key={s}>
                      <Insignia tono={TONO_ESTADO[s]}>
                        {NOMBRE_ESTADO_CONTACTO[s]}: {m.por_estado[s]}
                      </Insignia>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
              <Tarjeta className="space-y-2 p-4">
                <h2 className="text-sm font-semibold">Carga por persona</h2>
                {m.por_persona.length === 0 ? (
                  <p className="text-sm text-muted">Aún no hay mensajes asignados.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {m.por_persona.map((p) => (
                      <li key={p.persona?.id ?? 'x'} className="flex justify-between gap-2">
                        <span>{p.persona?.nombre ?? '—'}</span>
                        <span className="tabular text-muted">
                          {p.abiertos} abiertos · {p.total} en total
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>
            <Tarjeta className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Mensajes por día</h2>
              {m.por_dia.length === 0 ? (
                <p className="text-sm text-muted">Sin mensajes en el periodo.</p>
              ) : (
                <ol className="space-y-1.5" aria-label="Mensajes por día">
                  {m.por_dia.map((d) => (
                    <li
                      key={d.dia}
                      className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs"
                    >
                      <span className="tabular text-muted">{d.dia}</span>
                      <span className="h-3 rounded-full bg-line">
                        <span
                          className="block h-3 rounded-full bg-brand"
                          style={{ width: `${(d.total / max) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular">{d.total}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Tarjeta>
          </div>
        );
      }}
    </EstadosDatos>
  );
}

const ICONO_EVENTO: Partial<Record<EventoContacto['tipo'], typeof StickyNote>> = {
  nota_interna: StickyNote,
  respuesta: MessageSquareReply,
};

function textoEvento(e: EventoContacto) {
  const md = e.metadatos as { de?: string; a?: string; nombre?: string };
  switch (e.tipo) {
    case 'creado':
      return 'Mensaje recibido';
    case 'cambio_estado':
      return `Estado: ${NOMBRE_ESTADO_CONTACTO[md.de as EstadoContacto] ?? md.de} → ${NOMBRE_ESTADO_CONTACTO[md.a as EstadoContacto] ?? md.a}`;
    case 'cambio_prioridad':
      return `Prioridad: ${NOMBRE_PRIORIDAD_CONTACTO[md.de as PrioridadContacto] ?? md.de} → ${NOMBRE_PRIORIDAD_CONTACTO[md.a as PrioridadContacto] ?? md.a}`;
    case 'asignacion':
      return md.a ? `Asignado a ${md.nombre ?? 'alguien'}` : 'Sin asignar';
    default:
      return null;
  }
}

export function DetalleContactoPagina() {
  const { id = '' } = useParams();
  return (
    <div className="space-y-5" data-name="NX/ADM-Contacto-Detalle">
      <Link
        to="/admin/contacto"
        className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Bandeja
      </Link>
      <ConPermiso>{(gestionar) => <Detalle id={id} gestionar={gestionar} />}</ConPermiso>
    </div>
  );
}

function Detalle({ id, gestionar }: { id: string; gestionar: boolean }) {
  const consulta = useDetalleContacto(id);
  const equipo = useEquipoContacto();
  const acc = useAccionesContacto(id);
  const confirmar = useConfirmar();
  const nav = useNavigate();
  const [nota, setNota] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [resultado, setResultado] = useState<'sin_cambio' | 'esperando_usuario' | 'resuelto'>(
    'esperando_usuario',
  );
  const avisar = (e: unknown) => toast(mensajeDeError(e), 'warn');
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
      {(m) => (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-5">
            <Tarjeta className="space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm tabular">{m.folio}</span>
                <Insignia tono="neutro">{NOMBRE_TIPO_CONTACTO[m.tipo].nombre}</Insignia>
                <Insignia tono={TONO_ESTADO[m.estado]}>{NOMBRE_ESTADO_CONTACTO[m.estado]}</Insignia>
                <Insignia tono={TONO_PRIORIDAD[m.prioridad]}>
                  Prioridad {NOMBRE_PRIORIDAD_CONTACTO[m.prioridad].toLowerCase()}
                </Insignia>
              </div>
              <h1 className="text-xl font-semibold">{m.asunto}</h1>
              <p className="text-sm text-muted">
                {m.nombre} · {m.correo}
                {m.registrado && ' · usuario registrado'} · {fecha(m.creado_en)}
              </p>
              <p className="text-sm whitespace-pre-wrap">{m.mensaje}</p>
              {m.contexto && Object.keys(m.contexto).length > 0 && (
                <dl className="grid grid-cols-[8rem_1fr] gap-1 rounded-[8px] bg-surface p-3 text-xs">
                  {Object.entries(m.contexto).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k.replace('_', ' ')}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Tarjeta>
            {m.envios_fallidos > 0 && (
              <Banner
                tono="warn"
                accion={
                  gestionar && (
                    <Boton
                      tamano="sm"
                      icono={<RefreshCw className="size-4" />}
                      cargando={acc.reintentar.isPending}
                      onClick={() =>
                        acc.reintentar.mutate(undefined, {
                          onSuccess: (r) => toast(`Se reintentarán ${r.reintentados} envío(s).`),
                          onError: avisar,
                        })
                      }
                    >
                      Reintentar
                    </Boton>
                  )
                }
              >
                {m.envios_fallidos} correo(s) de este mensaje no se pudieron enviar.
              </Banner>
            )}
            <section aria-labelledby="hilo" className="space-y-2">
              <h2 id="hilo" className="text-sm font-semibold">
                Historial
              </h2>
              <ol className="space-y-2">
                {m.eventos.map((e) => {
                  const Icono = ICONO_EVENTO[e.tipo];
                  const t = textoEvento(e);
                  return (
                    <li
                      key={e.id}
                      className={cx(
                        'rounded-[10px] border p-3 text-sm',
                        e.tipo === 'nota_interna' && 'border-warn/40 bg-warn/8',
                        e.tipo === 'respuesta' && 'border-brand/35 bg-brand/8',
                        !['nota_interna', 'respuesta'].includes(e.tipo) && 'border-line',
                      )}
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        {Icono && <Icono className="size-3.5" aria-hidden />}
                        {e.tipo === 'nota_interna' && (
                          <Insignia tono="warn">
                            <Lock className="size-3" aria-hidden /> Solo equipo
                          </Insignia>
                        )}
                        {e.tipo === 'respuesta' && (
                          <Insignia tono="marca">Enviado al remitente</Insignia>
                        )}
                        <span>{e.autor?.nombre ?? 'Sistema'}</span>·
                        <time dateTime={e.creado_en}>{fecha(e.creado_en)}</time>
                      </p>
                      {t && <p className="mt-1">{t}</p>}
                      {e.contenido && <p className="mt-1 whitespace-pre-wrap">{e.contenido}</p>}
                    </li>
                  );
                })}
              </ol>
            </section>
            {gestionar && !m.anonimizado && (
              <>
                <Tarjeta className="space-y-3 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <MessageSquareReply className="size-4" aria-hidden /> Responder al remitente
                  </h2>
                  <AreaTexto
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    rows={4}
                    maxLength={5000}
                    aria-label="Respuesta"
                  />
                  {respuesta.trim() && (
                    <div className="rounded-[8px] border border-line p-3 text-sm">
                      <p className="mb-1 text-xs text-muted">Vista previa del correo</p>
                      <p className="whitespace-pre-wrap">{respuesta}</p>
                    </div>
                  )}
                  <Radios
                    nombre="resultado"
                    etiqueta="Después de responder, dejar en"
                    horizontal
                    valor={resultado}
                    onChange={setResultado}
                    opciones={[
                      { valor: 'esperando_usuario', etiqueta: 'Esperando respuesta' },
                      { valor: 'resuelto', etiqueta: 'Resuelto' },
                      { valor: 'sin_cambio', etiqueta: 'Sin cambio' },
                    ]}
                  />
                  <Boton
                    variante="primario"
                    disabled={!respuesta.trim()}
                    cargando={acc.responder.isPending}
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: 'Enviar respuesta',
                        mensaje: `Se enviará por correo a ${m.correo} y se verá en el seguimiento.`,
                        confirmar: 'Enviar',
                      });
                      if (!ok) return;
                      acc.responder.mutate(
                        {
                          contenido: respuesta,
                          estado_resultante: resultado === 'sin_cambio' ? null : resultado,
                        },
                        {
                          onSuccess: () => {
                            setRespuesta('');
                            toast('Respuesta enviada.');
                          },
                          onError: avisar,
                        },
                      );
                    }}
                  >
                    Enviar respuesta
                  </Boton>
                </Tarjeta>
                <Tarjeta className="space-y-3 p-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <StickyNote className="size-4" aria-hidden /> Nota interna
                  </h2>
                  <AreaTexto
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    aria-label="Nota interna"
                  />
                  <Boton
                    disabled={!nota.trim()}
                    cargando={acc.nota.isPending}
                    onClick={() =>
                      acc.nota.mutate(nota, {
                        onSuccess: () => setNota(''),
                        onError: avisar,
                      })
                    }
                  >
                    Guardar nota (solo equipo)
                  </Boton>
                </Tarjeta>
              </>
            )}
          </div>
          <aside className="space-y-4">
            {gestionar ? (
              <Tarjeta className="space-y-3 p-4">
                <Campo etiqueta="Estado">
                  <Selector
                    value={m.estado}
                    disabled={m.anonimizado}
                    onChange={(e) =>
                      acc.estado.mutate(e.target.value as EstadoContacto, { onError: avisar })
                    }
                  >
                    {[m.estado, ...TRANSICIONES_CONTACTO[m.estado]].map((s) => (
                      <option key={s} value={s}>
                        {NOMBRE_ESTADO_CONTACTO[s]}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Prioridad">
                  <Selector
                    value={m.prioridad}
                    onChange={(e) =>
                      acc.prioridad.mutate(e.target.value as PrioridadContacto, { onError: avisar })
                    }
                  >
                    {PRIORIDADES_CONTACTO.map((p) => (
                      <option key={p} value={p}>
                        {NOMBRE_PRIORIDAD_CONTACTO[p]}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Asignado a">
                  <Selector
                    value={m.asignado?.id ?? ''}
                    onChange={(e) =>
                      acc.asignar.mutate(e.target.value || null, { onError: avisar })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {equipo.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </Tarjeta>
            ) : (
              <Banner tono="info" icono={<ShieldAlert />}>
                Puedes ver la bandeja; para atender mensajes hace falta el permiso «gestionar».
              </Banner>
            )}
            {gestionar && !m.anonimizado && (
              <Tarjeta className="space-y-2 p-4">
                <h2 className="text-sm font-semibold text-danger">Eliminar datos personales</h2>
                <p className="text-xs text-muted">
                  Para solicitudes de eliminación: borra nombre, correo, mensaje y el contenido del
                  historial. No se puede deshacer.
                </p>
                <Boton
                  variante="destructivo"
                  tamano="sm"
                  icono={<Trash2 className="size-4" />}
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: 'Eliminar datos personales',
                      mensaje: `Se borrarán los datos de ${m.folio}. El mensaje queda como «Anónimo» en las métricas.`,
                      confirmar: 'Eliminar datos',
                      destructivo: true,
                      escribir: m.folio,
                    });
                    if (ok)
                      acc.anonimizar.mutate(undefined, {
                        onSuccess: () => {
                          toast('Datos personales eliminados.');
                          void nav('/admin/contacto');
                        },
                        onError: avisar,
                      });
                  }}
                >
                  Eliminar datos personales
                </Boton>
              </Tarjeta>
            )}
          </aside>
        </div>
      )}
    </EstadosDatos>
  );
}
