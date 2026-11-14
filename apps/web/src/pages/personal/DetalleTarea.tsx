import type { EstadoTareaPersonal, TareaPersonalDetalle } from '@nexo/shared';
import { Archive, ArchiveRestore, Link2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import {
  AreaTexto,
  Banner,
  Boton,
  Casilla,
  Deslizador,
  Entrada,
  EstadosDatos,
  Esqueleto,
  InsigniaEstado,
  InsigniaSemaforo,
  Menu,
  PanelLateral,
  Selector,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import {
  useActualizarTarea,
  useComentarios,
  useEliminarTarea,
  useSubtareas,
  useTarea,
} from '@/lib/consultas';
import { fechaLarga, haceCuanto } from '@/lib/fechas';
import { PRIORIDADES } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { TareaForm } from './TareaForm';
import { NOMBRE_ESTADO_PERSONAL } from './estados';

export const codigoTarea = (codigo: number) => `T-${String(codigo).padStart(2, '0')}`;

/** PER-03: detalle de una tarea personal en un panel lateral. */
export function DetalleTareaPanel({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const consulta = useTarea(id);
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
      nombre="NX/PER-03-Detalle-tarea-personal"
    >
      {noExiste ? (
        <Vacio
          titulo="No encontramos esta tarea"
          texto="Puede que se haya eliminado o que no sea tuya."
          accion={<Boton onClick={onCerrar}>Cerrar</Boton>}
        />
      ) : (
        <div className="p-4 sm:p-5">
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

function Contenido({ tarea: t, onCerrar }: { tarea: TareaPersonalDetalle; onCerrar: () => void }) {
  const actualizar = useActualizarTarea();
  const eliminar = useEliminarTarea();
  const subtareas = useSubtareas(t.id);
  const comentarios = useComentarios(t.id);
  const confirmar = useConfirmar();
  const [editando, setEditando] = useState(false);
  const [nuevaSub, setNuevaSub] = useState('');
  const [comentario, setComentario] = useState('');
  const [errorCom, setErrorCom] = useState('');

  /** Guarda un cambio con la versión actual; si alguien la cambió antes (409), avisa y recarga. */
  const guardar = (
    cambios: Parameters<typeof actualizar.mutate>[0] extends infer P
      ? Omit<P, 'id' | 'version'>
      : never,
  ) =>
    actualizar.mutate(
      { id: t.id, version: t.version, ...cambios },
      {
        onError: (e) =>
          toast(
            e instanceof ErrorApi && e.estado === 409
              ? 'Alguien cambió esta tarea. Te mostramos la versión más reciente.'
              : mensajeDeError(e),
            'danger',
          ),
      },
    );

  const cambiarEstado = async (estado: EstadoTareaPersonal) => {
    if (estado === t.estado) return;
    if (estado === 'atascada') {
      const r = await confirmar({
        titulo: 'Marcar como atascada',
        mensaje: '¿Qué te bloquea?',
        confirmar: 'Marcar',
        conMotivo: { etiqueta: 'Motivo' },
      });
      if (!r) return;
      guardar({ estado, motivo: r.motivo });
      return;
    }
    guardar({ estado });
  };

  const borrar = async () => {
    const r = await confirmar({
      titulo: 'Eliminar tarea',
      mensaje: `Se eliminará «${t.titulo}» con sus subtareas y comentarios. No se puede deshacer.`,
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (!r) return;
    eliminar.mutate(t.id, {
      onSuccess: () => {
        toast(`${codigoTarea(t.codigo)} eliminada.`, 'info');
        onCerrar();
      },
      onError: (e) => toast(mensajeDeError(e), 'danger'),
    });
  };

  const enviarComentario = () => {
    const texto = comentario.trim();
    if (!texto) {
      setErrorCom('Escribe un comentario.');
      return;
    }
    comentarios.crear.mutate(texto, {
      onSuccess: () => setComentario(''),
      onError: (e) => setErrorCom(mensajeDeError(e)),
    });
  };

  const hechas = t.subtareas.filter((s) => s.hecha).length;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-lg font-semibold break-words">{t.titulo}</h3>
        <Menu
          etiqueta="Acciones de la tarea"
          items={[
            { etiqueta: 'Editar', icono: <Pencil />, onClick: () => setEditando(true) },
            {
              etiqueta: 'Copiar enlace',
              icono: <Link2 />,
              onClick: () => {
                void navigator.clipboard?.writeText(
                  `${location.origin}/app/personal/tareas/${t.id}`,
                );
                toast('Enlace copiado.');
              },
            },
            {
              etiqueta: t.archivada ? 'Desarchivar' : 'Archivar',
              icono: t.archivada ? <ArchiveRestore /> : <Archive />,
              onClick: () => {
                guardar({ archivada: !t.archivada });
                toast(t.archivada ? 'Tarea desarchivada.' : 'Tarea archivada.', 'info');
              },
            },
            { etiqueta: '', separador: true },
            { etiqueta: 'Eliminar', icono: <Trash2 />, destructivo: true, onClick: borrar },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <InsigniaEstado estado={t.estado} nombre={NOMBRE_ESTADO_PERSONAL[t.estado]} />
        <InsigniaSemaforo tarea={t} />
        {t.archivada && <span className="text-xs text-muted">Archivada</span>}
      </div>

      {t.estado === 'atascada' && t.motivo && (
        <Banner tono="danger">
          <strong>Atascada:</strong> {t.motivo}
        </Banner>
      )}

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted">Estado</dt>
        <dd>
          <Selector
            aria-label="Estado"
            className="max-w-56"
            value={t.estado === 'backlog' || t.estado === 'aceptada' ? 'habilitada' : t.estado}
            disabled={actualizar.isPending}
            onChange={(e) => cambiarEstado(e.target.value as EstadoTareaPersonal)}
          >
            {(['habilitada', 'en_curso', 'atascada', 'completada'] as const).map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ESTADO_PERSONAL[e]}
              </option>
            ))}
          </Selector>
        </dd>
        <dt className="text-muted">Entrega</dt>
        <dd>
          {t.vence_en ? <span className="capitalize">{fechaLarga(t.vence_en)}</span> : 'Sin fecha'}
        </dd>
        <dt className="text-muted">Prioridad</dt>
        <dd>{PRIORIDADES[t.prioridad]}</dd>
        <dt className="text-muted">Etiquetas</dt>
        <dd>{t.etiquetas.join(', ') || 'Sin etiquetas'}</dd>
      </dl>

      <Deslizador
        key={t.version}
        etiqueta="Progreso"
        valor={t.progreso}
        disabled={t.estado === 'completada' || actualizar.isPending}
        onChange={(progreso) => guardar({ progreso })}
      />

      <section aria-labelledby="det-desc">
        <h4 id="det-desc" className="mb-1.5 text-sm font-semibold">
          Descripción
        </h4>
        {t.descripcion ? (
          <p className="text-sm whitespace-pre-wrap text-muted">{t.descripcion}</p>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-sm text-brand hover:underline"
          >
            Agrega contexto
          </button>
        )}
      </section>

      <section aria-labelledby="det-sub">
        <h4 id="det-sub" className="mb-1.5 flex items-center justify-between text-sm font-semibold">
          Subtareas
          <span className="text-xs font-normal text-muted tabular">
            {hechas}/{t.subtareas.length}
          </span>
        </h4>
        <ul className="space-y-1">
          {t.subtareas.map((s) => (
            <li key={s.id} className="flex items-center gap-1">
              <Casilla
                className="flex-1"
                checked={s.hecha}
                onChange={(hecha) => subtareas.actualizar.mutate({ id: s.id, hecha })}
                etiqueta={
                  <span className={s.hecha ? 'text-muted line-through' : ''}>{s.titulo}</span>
                }
              />
              <button
                type="button"
                aria-label={`Eliminar subtarea ${s.titulo}`}
                onClick={() => subtareas.eliminar.mutate(s.id)}
                className="grid size-9 place-items-center rounded-[8px] text-muted hover:bg-surface hover:text-danger-text"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const titulo = nuevaSub.trim();
            if (titulo) subtareas.crear.mutate(titulo, { onSuccess: () => setNuevaSub('') });
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
            cargando={subtareas.crear.isPending}
          >
            Agregar
          </Boton>
        </form>
      </section>

      <section aria-labelledby="det-com">
        <h4 id="det-com" className="mb-1.5 text-sm font-semibold">
          Comentarios
        </h4>
        {t.comentarios.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay comentarios. Deja notas para ti aquí.</p>
        ) : (
          <ul className="space-y-2">
            {t.comentarios.map((c) => (
              <li key={c.id} className="rounded-[12px] bg-surface px-3 py-2">
                <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
                <p className="mt-1 flex items-center justify-between text-xs text-muted">
                  {haceCuanto(c.creado_en)}
                  <button
                    type="button"
                    onClick={() => comentarios.eliminar.mutate(c.id)}
                    className="rounded px-1 hover:text-danger-text hover:underline"
                  >
                    Eliminar
                  </button>
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 space-y-2">
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
          <Boton onClick={enviarComentario} cargando={comentarios.crear.isPending}>
            Comentar
          </Boton>
        </div>
      </section>

      {editando && <TareaForm abierto editar={t} onCerrar={() => setEditando(false)} />}
    </div>
  );
}
