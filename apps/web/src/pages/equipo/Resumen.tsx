import type { TareaEquipo } from '@nexo/shared';
import {
  CheckSquare,
  Clock,
  Inbox,
  KanbanSquare,
  Lock,
  MessageCircle,
  UserCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { HillChart } from '@/components/charts/HillChart';
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
  Tarjeta,
  Vacio,
  useColorDe,
} from '@/components/ui';
import { useAccionesTarea, useConteosTareas, useTareasEquipo } from '@/lib/consultasEquipo';
import { formaDeEstado } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from './contexto';
import { avisarError, codigoTarea } from './tareas/comunes';
import { TareasCompartidas } from './tareas';

/**
 * EQ-01: resumen del equipo: Hill Chart (se arrastra para actualizar el avance, Fase 3.1), lo
 * que la persona tiene pendiente y los accesos a la votación. Cada cambio de avance queda en el
 * historial de la tarea («actualizó el avance de T-03 (60 %)»).
 * El invitado ve el resumen reducido (IN-01).
 */
export function Resumen() {
  const { equipo } = useEquipoActual();
  return (
    <div className="space-y-4">
      <AvisoActivarWhatsApp />
      {equipo.mi_rol === 'invitado' ? <ResumenInvitado /> : <ResumenMiembro />}
    </div>
  );
}

/**
 * docs/13 1.1: al unirse sin WhatsApp verificado, el equipo ofrece activarlo (una vez, al llegar
 * desde «Unirme»). Quien ya lo tiene quedó con los avisos del equipo aceptados y no ve nada.
 */
function AvisoActivarWhatsApp() {
  const { equipo } = useEquipoActual();
  const { state, pathname } = useLocation();
  const [visible, setVisible] = useState(
    !!(state as { activarWhatsApp?: boolean } | null)?.activarWhatsApp,
  );
  if (!visible) return null;
  return (
    <Banner
      tono="marca"
      icono={<MessageCircle />}
      onCerrar={() => setVisible(false)}
      accion={
        <Link
          to={`/app/whatsapp/activar?equipo=${equipo.id}&volver=${encodeURIComponent(pathname)}`}
          className="font-medium text-brand hover:underline"
        >
          Activar WhatsApp
        </Link>
      }
    >
      Activa WhatsApp para recibir los avisos de este equipo.
    </Banner>
  );
}

/** IN-01: resumen reducido del invitado, solo con lo compartido. */
function ResumenInvitado() {
  const { equipo } = useEquipoActual();
  return (
    <div className="space-y-4" data-name="NX/IN-01-Resumen-invitado">
      <Encabezado
        titulo={equipo.nombre}
        descripcion={`Eres invitado de este equipo${equipo.lider ? `. Líder: ${equipo.lider.nombre}` : ''}.`}
      />
      <Banner tono="info" icono={<Lock />}>
        Como invitado ves y comentas solo las tareas que el equipo comparte contigo.
      </Banner>
      <h2 className="text-base font-semibold">Tareas compartidas contigo</h2>
      <TareasCompartidas />
    </div>
  );
}

function ResumenMiembro() {
  const { equipo, base, usuarioId } = useEquipoActual();
  const consulta = useTareasEquipo(equipo.id, 'tablero');
  const conteos = useConteosTareas(equipo.id);
  const acc = useAcciones();
  const colorDe = useColorDe();
  const esLider = equipo.mi_rol === 'lider';
  const sprint = equipo.sprints.find((s) => s.estado === 'activo');
  const { editar } = useAccionesTarea(equipo.id);

  /**
   * El avance lo mueve el líder o el responsable con la asignación aceptada (la misma regla que
   * aplica `proc_tarea_editar`). Una tarea completada siempre está al 100 %.
   */
  const puedeMover = (t: TareaEquipo) =>
    t.estado !== 'completada' &&
    (esLider || (t.responsable?.usuario_id === usuarioId && !t.asignacion_pendiente));
  const moverAvance = (t: TareaEquipo, progreso: number) =>
    editar.mutate(
      { id: t.id, version: t.version, progreso },
      {
        onSuccess: () => toast(`${codigoTarea(t.codigo)} quedó en ${progreso} %.`),
        onError: avisarError,
      },
    );

  const lista = (tareas: TareaEquipo[], vacio: string) =>
    tareas.length ? (
      <ul className="divide-y divide-line">
        {tareas.slice(0, 5).map((t) => (
          <li key={t.id} className="flex items-center gap-2 py-2">
            <FormaSvg
              forma={formaDeEstado(t.estado)}
              color={colorDe(t.responsable?.color_idx).color}
              tamano={12}
            />
            <button
              type="button"
              onClick={() => acc.abrirTarea(t.id)}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium"
            >
              {t.titulo}
            </button>
            <InsigniaSemaforo tarea={t} conFecha={false} />
          </li>
        ))}
      </ul>
    ) : (
      <Vacio compacto titulo={vacio} />
    );

  return (
    <div className="space-y-5" data-name="NX/EQ-01-Resumen">
      <Encabezado
        titulo={equipo.nombre}
        descripcion={sprint ? `Sprint ${sprint.numero} activo` : 'Sin sprint activo'}
        acciones={
          <Link
            to={`${base}/tareas`}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-brand px-3 text-sm font-medium text-on-brand"
          >
            <KanbanSquare className="size-4" aria-hidden />
            Abrir tablero
          </Link>
        }
      />
      <EstadosDatos
        consulta={consulta}
        esqueleto={<EsqueletoTarjetas />}
        vacio={
          <Tarjeta className="p-6">
            <Vacio
              icono={<CheckSquare />}
              titulo="El tablero aún no tiene tareas"
              texto={
                esLider
                  ? 'Crea la primera tarea del equipo o invita a tus integrantes desde Equipo.'
                  : 'Aquí verás las tareas cuando el equipo acepte las propuestas del líder. Revisa si hay propuestas por votar.'
              }
              accion={
                esLider ? (
                  <Boton variante="primario" onClick={() => acc.nuevaTarea()}>
                    Nueva tarea
                  </Boton>
                ) : undefined
              }
            />
          </Tarjeta>
        }
      >
        {(tareas) => {
          const mias = tareas.filter((t) => t.responsable?.usuario_id === usuarioId);
          const porAceptar = mias.filter((t) => t.asignacion_pendiente);
          const enMarcha = mias.filter((t) => !t.asignacion_pendiente && t.estado !== 'completada');
          const atascadas = tareas.filter((t) => t.estado === 'atascada');
          const proximas = tareas
            .filter((t) => t.vence_en && t.estado !== 'completada')
            .sort((a, b) => (a.vence_en ?? '').localeCompare(b.vence_en ?? ''));
          return (
            <>
              {porAceptar.length > 0 && (
                <Banner tono="warn" icono={<UserCheck />}>
                  Tienes {porAceptar.length}{' '}
                  {porAceptar.length === 1 ? 'asignación' : 'asignaciones'} por responder:{' '}
                  {porAceptar.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ', '}
                      <button
                        type="button"
                        onClick={() => acc.abrirTarea(t.id)}
                        className="font-medium underline"
                      >
                        {codigoTarea(t.codigo)} {t.titulo}
                      </button>
                    </span>
                  ))}
                </Banner>
              )}
              <Tarjeta as="section" className="p-3 sm:p-5" aria-labelledby="hill-equipo">
                <h2 id="hill-equipo" className="text-base font-semibold">
                  Hill Chart del equipo
                </h2>
                <div className="mt-3">
                  <HillChart
                    puntos={tareas.map((t) => ({
                      ...t,
                      codigo: codigoTarea(t.codigo),
                      responsable: t.responsable?.nombre ?? 'Sin asignar',
                      colorIdx: t.responsable?.color_idx,
                    }))}
                    onAbrir={acc.abrirTarea}
                    etiqueta="Hill Chart del equipo"
                    puedeMover={(id) => {
                      const t = tareas.find((x) => x.id === id);
                      return !!t && puedeMover(t);
                    }}
                    onMover={(id, progreso) => {
                      const t = tareas.find((x) => x.id === id);
                      if (t) moverAvance(t, progreso);
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  El color identifica al responsable y la forma, el estado: triángulo atascada,
                  círculo en marcha, cuadrado completada.{' '}
                  {esLider
                    ? 'Arrastra una figura (o usa las flechas) para actualizar su avance.'
                    : 'Puedes arrastrar tus propias tareas (o usar las flechas) para actualizar su avance.'}
                </p>
              </Tarjeta>
              <div className="grid gap-4 md:grid-cols-3">
                <Tarjeta className="p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CheckSquare className="size-5 text-muted" aria-hidden /> Mis tareas
                  </h2>
                  {lista(enMarcha, 'No tienes tareas en marcha')}
                </Tarjeta>
                <Tarjeta className="p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Clock className="size-5 text-muted" aria-hidden /> Próximas entregas
                  </h2>
                  {lista(proximas, 'Sin entregas próximas')}
                </Tarjeta>
                <Tarjeta className="p-4">
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Inbox className="size-5 text-muted" aria-hidden /> Requiere atención
                  </h2>
                  {atascadas.length > 0 && (
                    <ul className="mb-2 space-y-1.5">
                      {atascadas.slice(0, 3).map((t) => (
                        <li key={t.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => acc.abrirTarea(t.id)}
                            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                          >
                            {t.titulo}
                          </button>
                          <InsigniaEstado estado="atascada" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    to={`${base}/tareas/votacion`}
                    className="flex min-h-9 items-center justify-between text-sm text-brand hover:underline"
                  >
                    {esLider ? 'Propuestas en votación' : 'Propuestas por votar'}
                    <span className="rounded-full bg-surface px-2 text-xs text-muted tabular">
                      {conteos.data?.votacion ?? '–'}
                    </span>
                  </Link>
                  <Link
                    to={`${base}/tareas/backlog`}
                    className="flex min-h-9 items-center justify-between text-sm text-brand hover:underline"
                  >
                    Backlog
                    <span className="rounded-full bg-surface px-2 text-xs text-muted tabular">
                      {conteos.data?.backlog ?? '–'}
                    </span>
                  </Link>
                </Tarjeta>
              </div>
            </>
          );
        }}
      </EstadosDatos>
    </div>
  );
}
