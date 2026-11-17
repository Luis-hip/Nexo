import type { ResumenVotacion, TareaEquipo, Voto } from '@nexo/shared';
import { Check, ChevronDown, ChevronUp, Inbox, Pencil, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { useAcciones } from '@/components/shell/contexto';
import {
  Avatar,
  Banner,
  Boton,
  EstadosDatos,
  InsigniaEstado,
  Tarjeta,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { useAccionesTarea, useTareaEquipo, useTareasEquipo } from '@/lib/consultasEquipo';
import { PRIORIDADES } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { avisarError, codigoTarea } from './comunes';
import { TareaFormEquipo } from './TareaFormEquipo';

const primerNombre = (nombre: string) => nombre.split(' ')[0] ?? nombre;

/**
 * Conteo de una votación (V-8): cuántos votaron, a favor y en contra, y quién ya votó.
 * Nunca muestra el voto de otra persona; cerrada la votación, solo el resultado.
 */
export function ResumenVotos({ v }: { v: ResumenVotacion }) {
  if (!v.abierta) {
    return (
      <p className="text-sm tabular" data-name="NX/EQ-05-Resultado-votacion">
        Resultado de la votación: <strong>{v.aceptar} a favor</strong> · {v.rechazar} en contra
      </p>
    );
  }
  const total = v.total_integrantes ?? 0;
  const necesarios = v.necesarios ?? 0;
  const faltan = Math.max(necesarios - v.aceptar, 0);
  const avance = necesarios > 0 ? Math.min((v.aceptar / necesarios) * 100, 100) : 0;
  return (
    <div className="space-y-1.5" data-name="NX/EQ-05-Conteo-votacion">
      <p className="text-sm tabular">
        <strong>
          {v.emitidos} de {total}
        </strong>{' '}
        {total === 1 ? 'integrante votó' : 'integrantes votaron'} · {v.aceptar} a favor ·{' '}
        {v.rechazar} en contra
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-label="Votos a favor respecto a los necesarios"
        aria-valuemin={0}
        aria-valuemax={necesarios}
        aria-valuenow={Math.min(v.aceptar, necesarios)}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${avance}%` }} />
      </div>
      <p className="text-xs text-muted">
        Se acepta con {necesarios} {necesarios === 1 ? 'voto' : 'votos'} a favor
        {faltan > 0 ? ` (${faltan === 1 ? 'falta 1' : `faltan ${faltan}`})` : ''}.{' '}
        {v.votaron.length > 0
          ? `Ya votaron: ${v.votaron.map((p) => primerNombre(p.nombre)).join(', ')}.`
          : 'Nadie ha votado todavía.'}
      </p>
    </div>
  );
}

/** Botones para votar (integrantes) o retirar la propuesta (líder), según el permiso. */
export function AccionesVotacion({ t }: { t: TareaEquipo }) {
  const { equipo, puede } = useEquipoActual();
  const { votar, retirar } = useAccionesTarea(equipo.id);
  const confirmar = useConfirmar();
  const codigo = codigoTarea(t.codigo);
  const miVoto = t.votacion?.mi_voto ?? null;
  const pVotar = puede('votar_propuesta');
  const pRetirar = puede('retirar_propuesta');
  if (t.estado !== 'propuesta') return null;

  const enviar = (voto: Voto, comentario?: string) =>
    votar.mutate(
      { id: t.id, voto, comentario },
      {
        onSuccess: (r) =>
          toast(
            r.estado === 'aceptada'
              ? `${codigo} quedó aceptada por mayoría.`
              : r.estado === 'rechazada'
                ? `${codigo} fue rechazada por mayoría.`
                : miVoto
                  ? 'Cambiaste tu voto.'
                  : 'Voto registrado.',
            r.estado === 'rechazada' ? 'info' : undefined,
          ),
        onError: avisarError,
      },
    );

  const enContra = async () => {
    const r = await confirmar({
      titulo: `Votar en contra de «${t.titulo}»`,
      mensaje: 'Puedes explicar tu voto. El comentario es privado: los demás no ven cómo votaste.',
      confirmar: 'Votar en contra',
      conMotivo: { etiqueta: 'Comentario', opcional: true },
    });
    if (r) enviar('rechazar', r.motivo?.trim() || undefined);
  };

  const retirarPropuesta = async () => {
    const r = await confirmar({
      titulo: `Retirar ${codigo}`,
      mensaje:
        'La propuesta deja de votarse y queda como «Retirada». Podrás reformularla como una propuesta nueva.',
      confirmar: 'Retirar propuesta',
      destructivo: true,
    });
    if (!r) return;
    retirar.mutate(
      { id: t.id, version: t.version },
      { onSuccess: () => toast(`${codigo} retirada.`, 'info'), onError: avisarError },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pVotar.permitido && (
        <>
          <Boton
            tamano="sm"
            variante={miVoto?.voto === 'aceptar' ? 'primario' : undefined}
            icono={<Check className="size-4" />}
            aria-pressed={miVoto?.voto === 'aceptar'}
            disabled={votar.isPending}
            onClick={() => miVoto?.voto !== 'aceptar' && enviar('aceptar')}
          >
            A favor
          </Boton>
          <Boton
            tamano="sm"
            variante={miVoto?.voto === 'rechazar' ? 'primario' : undefined}
            icono={<X className="size-4" />}
            aria-pressed={miVoto?.voto === 'rechazar'}
            disabled={votar.isPending}
            onClick={() => miVoto?.voto !== 'rechazar' && enContra()}
          >
            En contra
          </Boton>
          <span className="text-xs text-muted">
            {miVoto
              ? `Tu voto: ${miVoto.voto === 'aceptar' ? 'a favor' : 'en contra'}. Puedes cambiarlo mientras siga abierta.`
              : 'Aún no votas.'}
          </span>
        </>
      )}
      {!pVotar.permitido && !pVotar.oculto && (
        <span className="text-xs text-muted">{pVotar.motivo}</span>
      )}
      {pRetirar.permitido && (
        <>
          <span className="flex-1" />
          <Boton
            tamano="sm"
            variante="texto"
            className="text-danger-text"
            icono={<Undo2 className="size-4" />}
            disabled={retirar.isPending}
            onClick={retirarPropuesta}
          >
            Retirar
          </Boton>
        </>
      )}
    </div>
  );
}

/**
 * EQ-05: votación de propuestas (DEC-024). El líder propone tareas con sus subtareas y los
 * integrantes votan si se aceptan para el sprint. Para el integrante es además FALT-08:
 * «Propuestas por votar y mis votos».
 */
export function Votacion() {
  const { equipo } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'votacion');
  const acc = useAcciones();
  const esLider = equipo.mi_rol === 'lider';
  const [verCerradas, setVerCerradas] = useState(false);
  const [reformular, setReformular] = useState<string | null>(null);

  const tarjeta = (t: TareaEquipo) => {
    const codigo = codigoTarea(t.codigo);
    const abierta = t.estado === 'propuesta';
    return (
      <li key={t.id}>
        <Tarjeta className="space-y-3 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <Avatar
              persona={
                t.proponente
                  ? { nombre: t.proponente.nombre, colorIdx: t.proponente.color_idx }
                  : undefined
              }
              tamano={32}
            />
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => acc.abrirTarea(t.id)} className="text-left">
                <span className="block text-xs text-muted tabular">
                  {codigo} · Propone {t.proponente?.nombre ?? 'el líder'} ·{' '}
                  {PRIORIDADES[t.prioridad]}
                  {t.subtareas_total > 0
                    ? ` · ${t.subtareas_total} ${t.subtareas_total === 1 ? 'subtarea' : 'subtareas'}`
                    : ''}
                </span>
                <span className="font-medium hover:underline">{t.titulo}</span>
              </button>
              {t.descripcion && (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{t.descripcion}</p>
              )}
            </div>
            {!abierta && (
              <InsigniaEstado
                estado={t.estado}
                nombre={t.estado === 'rechazada' ? 'Rechazada por votación' : undefined}
              />
            )}
          </div>
          {t.votacion && <ResumenVotos v={t.votacion} />}
          {abierta ? (
            <div className="border-t border-line pt-3">
              <AccionesVotacion t={t} />
            </div>
          ) : (
            esLider && (
              <div className="flex border-t border-line pt-3">
                <Boton
                  tamano="sm"
                  icono={<Pencil className="size-4" />}
                  onClick={() => setReformular(t.id)}
                >
                  Reformular
                </Boton>
              </div>
            )
          )}
        </Tarjeta>
      </li>
    );
  };

  const seccion = (id: string, titulo: string, lista: TareaEquipo[], vacio?: string) => (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 text-base font-semibold">
        {titulo} <span className="text-muted tabular">({lista.length})</span>
      </h2>
      {lista.length > 0 ? (
        <ul className="space-y-3">{lista.map(tarjeta)}</ul>
      ) : (
        vacio && <Vacio compacto icono={<Inbox />} titulo={vacio} />
      )}
    </section>
  );

  return (
    <div className="space-y-6" data-name="NX/EQ-05-Votacion-de-propuestas">
      <Banner
        tono="info"
        accion={
          esLider ? (
            <Boton tamano="sm" variante="primario" onClick={acc.nuevaTarea}>
              Nueva propuesta
            </Boton>
          ) : undefined
        }
      >
        {esLider
          ? 'Tú propones las tareas con sus subtareas y los integrantes votan. Una propuesta se acepta para el sprint con más de la mitad de los integrantes.'
          : 'El líder propone las tareas y tú votas si se aceptan para el sprint. Hace falta más de la mitad de los integrantes. Si tienes una idea, compártela en el chat o en los comentarios.'}
      </Banner>
      <EstadosDatos consulta={consulta}>
        {(tareas) => {
          const abiertas = tareas.filter((t) => t.estado === 'propuesta');
          const cerradas = tareas.filter((t) => t.estado !== 'propuesta');
          const porVotar = abiertas.filter((t) => !t.votacion?.mi_voto);
          const votadas = abiertas.filter((t) => t.votacion?.mi_voto);
          return (
            <>
              {esLider ? (
                seccion('en-votacion', 'En votación', abiertas, 'No hay propuestas en votación')
              ) : (
                <div className="space-y-6" data-name="NX/FALT-08-Por-votar-y-mis-votos">
                  {seccion('por-votar', 'Por votar', porVotar, 'No tienes propuestas por votar')}
                  {votadas.length > 0 && seccion('mis-votos', 'Ya votaste', votadas)}
                </div>
              )}
              {cerradas.length > 0 && (
                <section className="mt-6">
                  <button
                    type="button"
                    onClick={() => setVerCerradas(!verCerradas)}
                    aria-expanded={verCerradas}
                    className="flex min-h-9 items-center gap-2 text-sm font-medium text-muted"
                  >
                    {verCerradas ? (
                      <ChevronUp className="size-4" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4" aria-hidden />
                    )}
                    No prosperaron ({cerradas.length})
                  </button>
                  {verCerradas && <ul className="mt-2 space-y-3">{cerradas.map(tarjeta)}</ul>}
                </section>
              )}
            </>
          );
        }}
      </EstadosDatos>
      {reformular && <Reformular id={reformular} onCerrar={() => setReformular(null)} />}
    </div>
  );
}

/** Carga el detalle (con sus subtareas) y abre el formulario para reformular la propuesta. */
export function Reformular({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { equipo } = useEquipoActual();
  const consulta = useTareaEquipo(equipo.id, id);
  if (!consulta.data) return null;
  return <TareaFormEquipo abierto reformular={consulta.data} onCerrar={onCerrar} />;
}
