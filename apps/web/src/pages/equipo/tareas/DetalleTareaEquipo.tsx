import type { EstadoTarea, TareaEquipoDetalle } from '@nexo/shared';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  Inbox,
  Link2,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  AreaTexto,
  Avatar,
  Banner,
  Boton,
  Casilla,
  ConMotivo,
  Deslizador,
  Entrada,
  Esqueleto,
  EstadosDatos,
  FormaSvg,
  InsigniaEstado,
  InsigniaSemaforo,
  Menu,
  PanelLateral,
  Pestanas,
  Selector,
  Vacio,
  useColorDe,
  useConfirmar,
} from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import { useAccionesTarea, useTareaEquipo } from '@/lib/consultasEquipo';
import { fechaLarga, haceCuanto } from '@/lib/fechas';
import { formaDeEstado, NOMBRE_ESTADO, NOMBRE_FORMA, PRIORIDADES } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { AsignacionModal } from './AsignacionModal';
import { avisarError, codigoTarea, useCambiarEstado, useTransiciones } from './comunes';
import { TareaFormEquipo } from './TareaFormEquipo';
import { AccionesVotacion, ResumenVotos } from './Votacion';

/** EQ-06 / IN-03: detalle de una tarea del equipo en un panel lateral. */
export function DetalleTareaEquipo({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { equipo } = useEquipoActual();
  const consulta = useTareaEquipo(equipo.id, id);
  const noExiste = consulta.error instanceof ErrorApi && consulta.error.estado === 404;
  return (
    <PanelLateral
      abierto
      onCerrar={onCerrar}
      titulo={
        consulta.data ? (
          <span className="tabular text-muted">{codigoTarea(consulta.data.codigo)}</span>
        ) : noExiste ? (
          'Tarea no encontrada'
        ) : (
          'Tarea'
        )
      }
      ancho={580}
      nombre={
        equipo.mi_rol === 'invitado'
          ? 'NX/IN-03-Detalle-tarea-compartida'
          : 'NX/EQ-06-Detalle-tarea'
      }
    >
      {noExiste ? (
        <Vacio
          titulo="No encontramos esta tarea"
          texto="Puede que se haya eliminado o que no esté compartida contigo."
          accion={<Boton onClick={onCerrar}>Cerrar</Boton>}
        />
      ) : (
        <div className="p-4 sm:p-6">
          <EstadosDatos
            consulta={consulta}
            esqueleto={
              <div className="space-y-4" role="status" aria-label="Cargando tarea">
                <Esqueleto className="h-7 w-3/4" />
                <Esqueleto className="h-24" />
                <Esqueleto className="h-40" />
              </div>
            }
          >
            {(tarea) => <Contenido key={tarea.id} tarea={tarea} onCerrar={onCerrar} />}
          </EstadosDatos>
        </div>
      )}
    </PanelLateral>
  );
}

function Contenido({ tarea: t, onCerrar }: { tarea: TareaEquipoDetalle; onCerrar: () => void }) {
  const { equipo, usuarioId, base } = useEquipoActual();
  const acciones = useAccionesTarea(equipo.id);
  const cambiar = useCambiarEstado();
  const { motivo: motivoTransicion } = useTransiciones();
  const confirmar = useConfirmar();
  const colorDe = useColorDe();
  const [editando, setEditando] = useState(false);
  const [asignacion, setAsignacion] = useState<'ver' | 'rechazar' | null>(null);
  const [pestana, setPestana] = useState<'comentarios' | 'historial'>('comentarios');
  const [nuevaSub, setNuevaSub] = useState('');
  const [comentario, setComentario] = useState('');
  const [errorCom, setErrorCom] = useState('');

  const rol = equipo.mi_rol;
  const esLider = rol === 'lider';
  const esInvitado = rol === 'invitado';
  const propia = t.responsable?.usuario_id === usuarioId;
  const [reformulando, setReformulando] = useState(false);
  // Desde la Fase 2.5 solo el líder edita: los integrantes ya no proponen (DEC-024).
  const pEditar = esLider;
  const pTrabajar = esLider || (propia && !t.asignacion_pendiente);
  const enFlujo = !['propuesta', 'rechazada', 'cancelada', 'backlog'].includes(t.estado);
  const codigo = codigoTarea(t.codigo);
  const { color } = colorDe(t.responsable?.color_idx);
  const invitados = equipo.miembros.filter((m) => m.rol === 'invitado');

  const borrar = async () => {
    const r = await confirmar({
      titulo: `Eliminar ${codigo}`,
      mensaje: `Se eliminará «${t.titulo}» con sus subtareas y comentarios. No se puede deshacer.`,
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (!r) return;
    acciones.eliminar.mutate(t.id, {
      onSuccess: () => {
        toast(`${codigo} eliminada.`, 'info');
        onCerrar();
      },
      onError: avisarError,
    });
  };

  const enviarComentario = () => {
    const texto = comentario.trim();
    if (!texto) {
      setErrorCom('Escribe un comentario.');
      return;
    }
    acciones.comentar.mutate(
      { id: t.id, texto },
      { onSuccess: () => setComentario(''), onError: (e) => setErrorCom(mensajeDeError(e)) },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-xl leading-snug font-semibold break-words">
          {t.titulo}
        </h3>
        <Menu
          etiqueta="Acciones de la tarea"
          items={[
            {
              etiqueta: 'Editar',
              icono: <Pencil />,
              oculto: !pEditar,
              onClick: () => setEditando(true),
            },
            {
              etiqueta: 'Copiar enlace',
              icono: <Link2 />,
              onClick: () => {
                void navigator.clipboard?.writeText(`${location.origin}${base}/tareas/${t.id}`);
                toast('Enlace copiado.');
              },
            },
            {
              etiqueta: t.archivada ? 'Desarchivar' : 'Archivar',
              icono: t.archivada ? <ArchiveRestore /> : <Archive />,
              oculto: !esLider,
              onClick: () =>
                acciones.editar.mutate(
                  { id: t.id, version: t.version, archivada: !t.archivada },
                  {
                    onSuccess: () =>
                      toast(
                        t.archivada ? `${codigo} desarchivada.` : `${codigo} archivada.`,
                        'info',
                      ),
                    onError: avisarError,
                  },
                ),
            },
            { etiqueta: '', separador: true, oculto: !esLider },
            {
              etiqueta: 'Eliminar',
              icono: <Trash2 />,
              destructivo: true,
              oculto: !esLider,
              onClick: borrar,
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <InsigniaEstado estado={t.estado} />
        <InsigniaSemaforo tarea={t} />
        {enFlujo && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <FormaSvg forma={formaDeEstado(t.estado)} color={color} tamano={12} />
            {NOMBRE_FORMA[formaDeEstado(t.estado)]}
          </span>
        )}
        {esInvitado && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden /> Solo lectura · puedes comentar
          </span>
        )}
        {t.archivada && <span className="text-xs text-muted">Archivada</span>}
      </div>

      {/* Avisos de estado */}
      {t.asignacion_pendiente && propia && (
        <Banner
          tono="warn"
          accion={
            <>
              <Boton tamano="sm" onClick={() => setAsignacion('rechazar')}>
                Rechazar
              </Boton>
              <Boton
                tamano="sm"
                variante="primario"
                icono={<Check className="size-4" />}
                cargando={acciones.responder.isPending}
                onClick={() =>
                  acciones.responder.mutate(
                    { id: t.id, acepta: true },
                    { onSuccess: () => toast('Asignación aceptada.'), onError: avisarError },
                  )
                }
              >
                Aceptar
              </Boton>
            </>
          }
        >
          Te asignaron esta tarea. ¿La aceptas?
        </Banner>
      )}
      {t.asignacion_pendiente && !propia && t.responsable && (
        <Banner tono="info">Esperando que {t.responsable.nombre} acepte la asignación.</Banner>
      )}
      {t.estado === 'atascada' && t.motivo && (
        <Banner tono="danger" icono={<AlertTriangle />}>
          <strong>Atascada:</strong> {t.motivo}
        </Banner>
      )}
      {(t.estado === 'rechazada' || t.estado === 'cancelada') && (
        <Banner
          tono="warn"
          accion={
            esLider && (t.estado === 'cancelada' || t.rechazo_por === 'votacion') ? (
              <Boton tamano="sm" onClick={() => setReformulando(true)}>
                Reformular
              </Boton>
            ) : undefined
          }
        >
          {t.estado === 'cancelada'
            ? 'El líder retiró esta propuesta.'
            : t.rechazo_por === 'votacion'
              ? 'El equipo rechazó esta propuesta por mayoría.'
              : `Rechazada: «${t.motivo}»`}
        </Banner>
      )}
      {t.estado === 'propuesta' && (
        <Banner tono="info" icono={<Inbox />}>
          Propuesta de {t.proponente?.nombre ?? 'el líder'} en votación: los integrantes deciden si
          se acepta para el sprint.
        </Banner>
      )}
      {t.votacion && (
        <section
          aria-label="Votación de la propuesta"
          className="space-y-3 rounded-[12px] border border-line p-3"
          data-name="NX/EQ-05-Votacion-en-detalle"
        >
          <ResumenVotos v={t.votacion} />
          <AccionesVotacion t={t} />
        </section>
      )}

      {/* Campos */}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_1fr] sm:items-center">
        {enFlujo && (
          <>
            <dt className="text-muted">Estado</dt>
            <dd>
              {t.transiciones.length > 0 ? (
                <Selector
                  aria-label="Cambiar estado"
                  className="max-w-64"
                  value={t.estado}
                  onChange={(e) => void cambiar(t, e.target.value as EstadoTarea)}
                >
                  <option value={t.estado}>{NOMBRE_ESTADO[t.estado]} (actual)</option>
                  {t.transiciones.map((v) => (
                    <option key={v} value={v}>
                      {v === 'en_curso' && t.estado === 'completada'
                        ? 'Reabrir (En curso)'
                        : NOMBRE_ESTADO[v]}
                    </option>
                  ))}
                </Selector>
              ) : (
                <ConMotivo
                  motivo={
                    motivoTransicion(t, t.estado === 'completada' ? 'en_curso' : 'completada') ??
                    'No hay cambios de estado disponibles.'
                  }
                >
                  <span className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-line px-3 text-muted">
                    <Lock className="size-4" aria-hidden />
                    {NOMBRE_ESTADO[t.estado]}
                  </span>
                </ConMotivo>
              )}
            </dd>
          </>
        )}
        <dt className="text-muted">Responsable</dt>
        <dd>
          {esLider && !['propuesta', 'rechazada', 'cancelada', 'completada'].includes(t.estado) ? (
            <Selector
              aria-label="Responsable"
              className="max-w-64"
              value={t.responsable?.usuario_id ?? ''}
              disabled={acciones.asignar.isPending}
              onChange={(e) =>
                acciones.asignar.mutate(
                  { id: t.id, version: t.version, responsable_id: e.target.value || null },
                  {
                    onSuccess: (r) =>
                      toast(
                        r.responsable
                          ? `Asignada a ${r.responsable.nombre}.${r.asignacion_pendiente ? ' Debe aceptar la asignación.' : ''}`
                          : 'La tarea quedó sin responsable.',
                      ),
                    onError: avisarError,
                  },
                )
              }
            >
              <option value="">Sin asignar</option>
              {equipo.miembros
                .filter((m) => m.rol !== 'invitado')
                .map((m) => (
                  <option key={m.usuario_id} value={m.usuario_id}>
                    {m.nombre}
                  </option>
                ))}
            </Selector>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Avatar
                persona={
                  t.responsable
                    ? { nombre: t.responsable.nombre, colorIdx: t.responsable.color_idx }
                    : undefined
                }
                tamano={24}
                conAnillo={false}
              />
              {t.responsable?.nombre ?? 'Sin asignar'}
            </span>
          )}
        </dd>
        <dt className="text-muted">Entrega</dt>
        <dd>
          {t.vence_en ? (
            <span className="inline-block first-letter:uppercase">{fechaLarga(t.vence_en)}</span>
          ) : (
            'Sin fecha'
          )}
        </dd>
        <dt className="text-muted">Prioridad</dt>
        <dd>{PRIORIDADES[t.prioridad]}</dd>
        <dt className="text-muted">Etiquetas</dt>
        <dd>{t.etiquetas.join(', ') || 'Sin etiquetas'}</dd>
        {t.proponente && (
          <>
            <dt className="text-muted">Propuesta por</dt>
            <dd>{t.proponente.nombre}</dd>
          </>
        )}
      </dl>

      {enFlujo && (
        <Deslizador
          key={t.version}
          etiqueta="Progreso (posición en el Hill Chart)"
          valor={t.progreso}
          disabled={!pTrabajar || t.estado === 'completada' || acciones.editar.isPending}
          onChange={(progreso) =>
            acciones.editar.mutate(
              { id: t.id, version: t.version, progreso },
              { onError: avisarError },
            )
          }
        />
      )}

      <section aria-labelledby="det-desc">
        <h4 id="det-desc" className="mb-1.5 text-sm font-semibold">
          Descripción
        </h4>
        {t.descripcion ? (
          <p className="text-sm whitespace-pre-wrap text-muted">{t.descripcion}</p>
        ) : pEditar ? (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-sm text-brand hover:underline"
          >
            Agrega contexto
          </button>
        ) : (
          <p className="text-sm text-muted">Sin descripción.</p>
        )}
      </section>

      <section aria-labelledby="det-sub">
        <h4 id="det-sub" className="mb-1.5 flex items-center justify-between text-sm font-semibold">
          Subtareas
          <span className="text-xs font-normal text-muted tabular">
            {t.subtareas_hechas}/{t.subtareas_total}
          </span>
        </h4>
        {t.subtareas.length === 0 && !pTrabajar && (
          <p className="text-sm text-muted">Sin subtareas.</p>
        )}
        <ul className="space-y-1">
          {t.subtareas.map((s) => (
            <li key={s.id} className="flex items-center gap-1">
              <Casilla
                className="flex-1"
                checked={s.hecha}
                disabled={!pTrabajar}
                onChange={(hecha) =>
                  acciones.actualizarSubtarea.mutate(
                    { id: t.id, subId: s.id, hecha },
                    { onError: avisarError },
                  )
                }
                etiqueta={
                  <span className={s.hecha ? 'text-muted line-through' : ''}>{s.titulo}</span>
                }
              />
              {pTrabajar && (
                <button
                  type="button"
                  aria-label={`Eliminar subtarea ${s.titulo}`}
                  onClick={() =>
                    acciones.eliminarSubtarea.mutate(
                      { id: t.id, subId: s.id },
                      { onError: avisarError },
                    )
                  }
                  className="grid size-9 place-items-center rounded-[8px] text-muted hover:bg-surface hover:text-danger-text"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {pTrabajar && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const titulo = nuevaSub.trim();
              if (!titulo) return;
              acciones.crearSubtarea.mutate(
                { id: t.id, titulo },
                { onSuccess: () => setNuevaSub(''), onError: avisarError },
              );
            }}
          >
            <Entrada
              value={nuevaSub}
              onChange={(e) => setNuevaSub(e.target.value)}
              placeholder="Nueva subtarea"
              aria-label="Nueva subtarea"
              maxLength={140}
            />
            <Boton
              type="submit"
              icono={<Plus className="size-4" />}
              cargando={acciones.crearSubtarea.isPending}
            >
              Agregar
            </Boton>
          </form>
        )}
      </section>

      {esLider && (
        <section aria-labelledby="det-comp">
          <h4 id="det-comp" className="mb-1.5 text-sm font-semibold">
            Compartida con invitados
          </h4>
          {invitados.length === 0 ? (
            <p className="text-sm text-muted">
              El equipo no tiene invitados. Invítalos desde Equipo para compartirles tareas.
            </p>
          ) : (
            <ul>
              {invitados.map((m) => {
                const compartida = t.compartida_con.includes(m.membresia_id);
                return (
                  <li key={m.membresia_id}>
                    <Casilla
                      checked={compartida}
                      disabled={acciones.compartir.isPending}
                      etiqueta={m.nombre}
                      descripcion="Puede verla y comentar."
                      onChange={(valor) =>
                        acciones.compartir.mutate(
                          {
                            id: t.id,
                            membresia_ids: valor
                              ? [...t.compartida_con, m.membresia_id]
                              : t.compartida_con.filter((x) => x !== m.membresia_id),
                          },
                          {
                            onSuccess: () =>
                              toast(
                                valor
                                  ? `${m.nombre} ya puede ver esta tarea.`
                                  : `${m.nombre} ya no ve esta tarea.`,
                                'info',
                              ),
                            onError: avisarError,
                          },
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Fase 4 · Chat (CH-03): el chat de la tarea; el invitado entra si está compartida con él. */}
      <Link
        to={`${base}/chat/tarea/${t.id}`}
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-2 text-sm hover:bg-surface"
      >
        <MessageCircle className="size-4 text-brand" aria-hidden /> Abrir el chat de la tarea
      </Link>

      <section>
        {esInvitado ? (
          <h4 className="mb-1.5 text-sm font-semibold">Comentarios</h4>
        ) : (
          <Pestanas
            etiqueta="Actividad de la tarea"
            valor={pestana}
            onChange={setPestana}
            pestanas={[
              { valor: 'comentarios', etiqueta: 'Comentarios', contador: t.comentarios.length },
              { valor: 'historial', etiqueta: 'Historial' },
            ]}
          />
        )}
        {pestana === 'comentarios' || esInvitado ? (
          <div className="mt-3 space-y-2">
            {t.comentarios.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay comentarios.</p>
            ) : (
              <ul className="space-y-2">
                {t.comentarios.map((c) => (
                  <li key={c.id} className="flex gap-2">
                    <Avatar
                      persona={
                        c.autor
                          ? { nombre: c.autor.nombre, colorIdx: c.autor.color_idx }
                          : undefined
                      }
                      tamano={28}
                      conAnillo={false}
                    />
                    <div className="min-w-0 flex-1 rounded-[12px] bg-surface px-3 py-2">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                        <span className="font-medium text-fg">{c.autor?.nombre ?? 'Alguien'}</span>
                        {haceCuanto(c.creado_en)}
                        {(esLider || c.autor?.usuario_id === usuarioId) && (
                          <button
                            type="button"
                            onClick={() =>
                              acciones.eliminarComentario.mutate(
                                { id: t.id, comentarioId: c.id },
                                { onError: avisarError },
                              )
                            }
                            className="ml-auto rounded px-1 hover:text-danger-text hover:underline"
                          >
                            Eliminar
                          </button>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.texto}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <AreaTexto
              value={comentario}
              onChange={(e) => {
                setComentario(e.target.value);
                setErrorCom('');
              }}
              rows={2}
              placeholder="Escribe un comentario"
              aria-label="Nuevo comentario"
              aria-invalid={!!errorCom || undefined}
              maxLength={4000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarComentario();
              }}
            />
            {errorCom && (
              <p className="text-xs font-medium text-danger-text" role="alert">
                {errorCom}
              </p>
            )}
            <Boton onClick={enviarComentario} cargando={acciones.comentar.isPending}>
              Comentar
            </Boton>
          </div>
        ) : (
          <ol className="mt-3 space-y-2">
            {t.historial.map((h) => (
              <li key={h.id} className="text-sm">
                <span>{h.resumen}</span>{' '}
                <span className="text-xs text-muted">· {haceCuanto(h.creado_en)}</span>
              </li>
            ))}
            {t.historial.length === 0 && <li className="text-sm text-muted">Sin actividad.</li>}
          </ol>
        )}
      </section>

      {editando && <TareaFormEquipo abierto editar={t} onCerrar={() => setEditando(false)} />}
      {reformulando && (
        <TareaFormEquipo
          abierto
          reformular={t}
          onCerrar={() => {
            setReformulando(false);
            onCerrar();
          }}
        />
      )}
      {asignacion && (
        <AsignacionModal
          tarea={t}
          rechazar={asignacion === 'rechazar'}
          onCerrar={() => setAsignacion(null)}
        />
      )}
    </div>
  );
}
