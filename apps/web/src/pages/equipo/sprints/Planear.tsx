import type { SprintDetalle, TareaEquipo } from '@nexo/shared';
import { CalendarPlus, Lock, Play, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Avatar,
  Banner,
  Boton,
  Campo,
  Casilla,
  Entrada,
  EsqueletoTarjetas,
  EstadosDatos,
  InsigniaEstado,
  Segmentado,
  Tarjeta,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesSprint, useDisponibles, useSprint, useSprints } from '@/lib/consultasSprints';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { codigoTarea } from '../tareas/comunes';
import { DetalleSprint } from './comunes';

const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');

/**
 * EQ-10: planear el siguiente sprint. El líder fija objetivo, fechas, horas por persona y qué
 * tareas entran (las aceptadas que no están en otro sprint). Los integrantes ven el plan.
 */
export function PlanearSprint() {
  const { equipo, puede } = useEquipoActual();
  const lista = useSprints(equipo.id);
  const gestiona = puede('gestionar_sprints').permitido;
  const [elegido, setElegido] = useState<string | 'nuevo' | null>(null);

  return (
    <EstadosDatos consulta={lista} esqueleto={<EsqueletoTarjetas n={2} />}>
      {(sprints) => {
        const planificados = sprints
          .filter((s) => s.estado === 'planificado')
          .sort((a, b) => a.numero - b.numero);
        const activo = sprints.find((s) => s.estado === 'activo');
        const actual =
          elegido === 'nuevo'
            ? null
            : (planificados.find((s) => s.id === elegido) ?? planificados[0] ?? null);
        if (!actual && !gestiona) {
          return (
            <Vacio
              icono={<CalendarPlus />}
              titulo="No hay sprints planificados"
              texto="Cuando el líder planee el siguiente sprint, aquí verás su objetivo, sus tareas y la capacidad del equipo."
            />
          );
        }
        return (
          <div className="space-y-4" data-name="NX/EQ-10-Planear-sprint">
            {(planificados.length > 0 || elegido === 'nuevo') && (
              <Segmentado
                etiqueta="Sprint a planear"
                tamano="sm"
                valor={actual?.id ?? 'nuevo'}
                onChange={(v) => setElegido(v)}
                opciones={[
                  ...planificados.map((s) => ({ valor: s.id, etiqueta: `Sprint ${s.numero}` })),
                  ...(gestiona ? [{ valor: 'nuevo', etiqueta: 'Nuevo sprint' }] : []),
                ]}
              />
            )}
            {gestiona ? (
              <PlanLider
                key={actual?.id ?? 'nuevo'}
                sprintId={actual?.id ?? null}
                activo={activo?.numero ?? null}
                alCrear={(id) => setElegido(id)}
                alBorrar={() => setElegido(null)}
              />
            ) : (
              actual && <PlanLectura sprintId={actual.id} />
            )}
          </div>
        );
      }}
    </EstadosDatos>
  );
}

function PlanLectura({ sprintId }: { sprintId: string }) {
  const { equipo } = useEquipoActual();
  const consulta = useSprint(equipo.id, sprintId);
  return (
    <div className="space-y-3">
      <Banner tono="info" icono={<Lock />}>
        Solo el líder planea, inicia y cierra los sprints.
      </Banner>
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
        {(s) => <DetalleSprint sprint={s} conBurndown={false} />}
      </EstadosDatos>
    </div>
  );
}

/** Carga el sprint (si existe) y las tareas disponibles antes de mostrar el formulario. */
function PlanLider(props: {
  sprintId: string | null;
  activo: number | null;
  alCrear: (id: string) => void;
  alBorrar: () => void;
}) {
  const { equipo } = useEquipoActual();
  const sprint = useSprint(equipo.id, props.sprintId ?? undefined);
  const disponibles = useDisponibles(equipo.id);
  if (props.sprintId && sprint.data === undefined) {
    return (
      <EstadosDatos consulta={sprint} esqueleto={<EsqueletoTarjetas n={2} />}>
        {() => null}
      </EstadosDatos>
    );
  }
  return (
    <EstadosDatos consulta={disponibles} esqueleto={<EsqueletoTarjetas n={2} />}>
      {(lista) => (
        <FormPlan
          {...props}
          sprint={props.sprintId ? (sprint.data ?? null) : null}
          libres={lista}
        />
      )}
    </EstadosDatos>
  );
}

function FormPlan({
  sprint,
  libres,
  activo,
  alCrear,
  alBorrar,
}: {
  sprint: SprintDetalle | null;
  libres: TareaEquipo[];
  activo: number | null;
  alCrear: (id: string) => void;
  alBorrar: () => void;
}) {
  const { equipo } = useEquipoActual();
  const { planear, iniciar, eliminar } = useAccionesSprint(equipo.id);
  const confirmar = useConfirmar();
  const [objetivo, setObjetivo] = useState(sprint?.objetivo ?? '');
  const [inicio, setInicio] = useState(sprint?.inicio ?? '');
  const [fin, setFin] = useState(sprint?.fin ?? '');
  const miembros = equipo.miembros.filter((m) => m.rol !== 'invitado');
  const [horas, setHoras] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      miembros.map((m) => [
        m.usuario_id,
        sprint?.capacidad.find((c) => c.usuario_id === m.usuario_id)?.horas ?? 0,
      ]),
    ),
  );
  const candidatas = useMemo(() => [...(sprint?.tareas ?? []), ...libres], [sprint, libres]);
  const [elegidas, setElegidas] = useState<Set<string>>(
    () => new Set(sprint?.tareas.map((t) => t.id) ?? []),
  );
  const [error, setError] = useState<string>();

  const tareasDe = (usuarioId: string) =>
    candidatas.filter((t) => elegidas.has(t.id) && t.responsable?.usuario_id === usuarioId).length;
  const totalHoras = Object.values(horas).reduce((n, h) => n + h, 0);
  const fechasMal = !!inicio && !!fin && fin <= inicio;

  const alternar = (id: string, si: boolean) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (si) s.add(id);
      else s.delete(id);
      return s;
    });

  const guardar = () => {
    setError(undefined);
    planear.mutate(
      {
        id: sprint?.id,
        objetivo: objetivo.trim(),
        ...(inicio && { inicio }),
        ...(fin && { fin }),
        capacidad: Object.entries(horas).map(([usuario_id, h]) => ({ usuario_id, horas: h })),
        tarea_ids: [...elegidas],
      },
      {
        onSuccess: (s) => {
          toast(sprint ? `Plan del Sprint ${s.numero} guardado.` : `Sprint ${s.numero} planeado.`);
          if (!sprint) alCrear(s.id);
        },
        onError: (e) => setError(mensajeDeError(e)),
      },
    );
  };

  const empezar = async () => {
    if (!sprint) return;
    const ok = await confirmar({
      titulo: `Iniciar el Sprint ${sprint.numero}`,
      mensaje: 'El sprint pasa a activo y empieza a contar su burndown desde hoy.',
      confirmar: 'Iniciar sprint',
    });
    if (ok)
      iniciar.mutate(sprint.id, {
        onSuccess: (s) => toast(`Sprint ${s.numero} iniciado.`),
        onError: avisar,
      });
  };

  const borrar = async () => {
    if (!sprint) return;
    const ok = await confirmar({
      titulo: `Borrar el plan del Sprint ${sprint.numero}`,
      mensaje: 'Sus tareas quedan sin sprint y podrás planearlas de nuevo.',
      confirmar: 'Borrar plan',
      destructivo: true,
    });
    if (ok)
      eliminar.mutate(sprint.id, {
        onSuccess: () => {
          toast(`Plan del Sprint ${sprint.numero} borrado.`, 'info');
          alBorrar();
        },
        onError: avisar,
      });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <Tarjeta className="space-y-4 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">
          {sprint ? `Plan del Sprint ${sprint.numero}` : 'Nuevo sprint'}
        </h2>
        <Campo etiqueta="Objetivo" opcional contador={`${objetivo.length}/300`}>
          <Entrada
            value={objetivo}
            maxLength={300}
            placeholder="¿Qué quiere lograr el equipo en este sprint?"
            onChange={(e) => setObjetivo(e.target.value)}
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Empieza"
            opcional
            ayuda={sprint ? undefined : 'Si lo dejas vacío, el día después del último sprint.'}
          >
            <Entrada type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo
            etiqueta="Termina"
            opcional
            error={fechasMal ? 'Debe terminar después de empezar.' : undefined}
            ayuda={sprint ? undefined : 'Si lo dejas vacío, según la duración del equipo.'}
          >
            <Entrada type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="plan-capacidad">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 id="plan-capacidad" className="font-semibold">
            Capacidad del equipo
          </h3>
          <span className="text-sm text-muted tabular">{totalHoras} h en total</span>
        </div>
        <ul className="space-y-2">
          {miembros.map((m) => {
            const n = tareasDe(m.usuario_id);
            return (
              <li key={m.usuario_id} className="flex flex-wrap items-center gap-3">
                <Avatar persona={{ nombre: m.nombre, colorIdx: m.color_idx }} tamano={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.nombre}</span>
                <span
                  className={
                    n > 0 && (horas[m.usuario_id] ?? 0) === 0
                      ? 'text-xs text-warn-text'
                      : 'text-xs text-muted'
                  }
                >
                  {n} {n === 1 ? 'tarea' : 'tareas'}
                  {n > 0 && (horas[m.usuario_id] ?? 0) === 0 ? ' · sin horas' : ''}
                </span>
                <label className="flex items-center gap-1.5 text-sm">
                  <span className="sr-only">Horas de {m.nombre}</span>
                  <Entrada
                    type="number"
                    min={0}
                    max={300}
                    inputMode="numeric"
                    className="w-20 text-right tabular"
                    value={horas[m.usuario_id] ?? 0}
                    onChange={(e) =>
                      setHoras((h) => ({
                        ...h,
                        [m.usuario_id]: Math.min(
                          300,
                          Math.max(0, Math.round(+e.target.value || 0)),
                        ),
                      }))
                    }
                  />
                  h
                </label>
              </li>
            );
          })}
        </ul>
      </Tarjeta>

      <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="plan-tareas">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 id="plan-tareas" className="font-semibold">
            Tareas
          </h3>
          <span className="text-sm text-muted tabular">
            {elegidas.size} de {candidatas.length} elegidas
          </span>
        </div>
        <p className="mb-3 text-sm text-muted">
          Entran las tareas aceptadas que no están en otro sprint. Las del backlog pasan a
          «Aceptada».
        </p>
        {candidatas.length === 0 ? (
          <p className="text-sm text-muted">
            No hay tareas disponibles: las propuestas aceptadas por votación aparecerán aquí.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {candidatas.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <Casilla
                  checked={elegidas.has(t.id)}
                  onChange={(v) => alternar(t.id, v)}
                  etiqueta={
                    <span>
                      <span className="mr-2 text-xs text-muted tabular">
                        {codigoTarea(t.codigo)}
                      </span>
                      {t.titulo}
                    </span>
                  }
                  className="min-w-0 flex-1"
                />
                <InsigniaEstado estado={t.estado} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {error && (
        <Banner tono="danger" icono={<Lock />}>
          {error}
        </Banner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Boton type="submit" variante="primario" cargando={planear.isPending} disabled={fechasMal}>
          {sprint ? 'Guardar plan' : 'Planear sprint'}
        </Boton>
        {sprint && (
          <>
            <Boton
              icono={<Play className="size-4" />}
              onClick={empezar}
              cargando={iniciar.isPending}
              disabled={activo !== null}
              motivo={
                activo !== null ? `Cierra el Sprint ${activo} antes de iniciar este.` : undefined
              }
            >
              Iniciar sprint
            </Boton>
            <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={borrar}>
              Borrar plan
            </Boton>
          </>
        )}
      </div>
    </form>
  );
}
