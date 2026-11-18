import type { DestinoPendientes } from '@nexo/shared';
import { Flag, Lock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Banner,
  Boton,
  EsqueletoTarjetas,
  EstadosDatos,
  InsigniaEstado,
  Radios,
  Tarjeta,
  Vacio,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesSprint, useSprintActivo } from '@/lib/consultasSprints';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { codigoTarea } from '../tareas/comunes';
import { Avance, DetalleSprint } from './comunes';

/** Sin sprint activo: invita al líder a iniciar el planificado o a planear uno. */
function SinSprintActivo() {
  const { equipo, base, puede } = useEquipoActual();
  const nav = useNavigate();
  const planificado = equipo.sprints.find((s) => s.estado === 'planificado');
  const gestiona = puede('gestionar_sprints').permitido;
  return (
    <Vacio
      icono={<Flag />}
      titulo="No hay un sprint activo"
      texto={
        planificado
          ? `El Sprint ${planificado.numero} está planificado y espera a que el líder lo inicie.`
          : 'Cuando el líder planee e inicie un sprint, aquí verás su avance día a día.'
      }
      accion={
        gestiona ? (
          <Boton variante="primario" onClick={() => nav(`${base}/sprints/planear`)}>
            {planificado ? `Revisar el plan del Sprint ${planificado.numero}` : 'Planear un sprint'}
          </Boton>
        ) : undefined
      }
    />
  );
}

/** EQ-09: el sprint activo con su avance, burndown, capacidad y tareas. */
export function SprintActivo() {
  const { equipo, base, puede } = useEquipoActual();
  const nav = useNavigate();
  const consulta = useSprintActivo(equipo.id);
  const gestiona = puede('gestionar_sprints');
  return (
    <EstadosDatos
      consulta={consulta}
      esqueleto={<EsqueletoTarjetas n={2} />}
      estaVacio={(d) => d.sprint === null}
      vacio={<SinSprintActivo />}
    >
      {({ sprint }) =>
        sprint && (
          <DetalleSprint
            nombre="NX/EQ-09-Sprint-activo"
            sprint={sprint}
            acciones={
              gestiona.permitido ? (
                <Boton onClick={() => nav(`${base}/sprints/cerrar`)}>Cerrar sprint</Boton>
              ) : undefined
            }
          />
        )
      }
    </EstadosDatos>
  );
}

/**
 * EQ-11: el líder cierra el sprint activo. Se guarda la instantánea final, se abre la
 * retrospectiva y elige qué pasa con las tareas sin terminar.
 */
export function CerrarSprint() {
  const { equipo, base } = useEquipoActual();
  const nav = useNavigate();
  const consulta = useSprintActivo(equipo.id);
  const { cerrar } = useAccionesSprint(equipo.id);
  const siguiente = equipo.sprints.find((s) => s.estado === 'planificado');
  const [destino, setDestino] = useState<DestinoPendientes>(siguiente ? 'siguiente' : 'liberar');

  return (
    <EstadosDatos
      consulta={consulta}
      esqueleto={<EsqueletoTarjetas n={1} />}
      estaVacio={(d) => d.sprint === null}
      vacio={<SinSprintActivo />}
    >
      {({ sprint }) => {
        if (!sprint) return null;
        const pendientes = sprint.tareas.filter((t) => t.estado !== 'completada');
        const confirmarCierre = () =>
          cerrar.mutate(
            { id: sprint.id, pendientes: pendientes.length > 0 ? destino : 'liberar' },
            {
              onSuccess: (s) => {
                toast(`Sprint ${s.numero} cerrado: ${s.completadas} de ${s.total} completadas.`);
                nav(`${base}/sprints/retro/${s.id}`);
              },
              onError: (e) => toast(mensajeDeError(e), 'danger'),
            },
          );
        return (
          <Tarjeta className="space-y-5 p-4 sm:p-5" data-name="NX/EQ-11-Cerrar-sprint">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Cerrar el Sprint {sprint.numero}</h2>
              <p className="text-sm text-muted">
                Se guarda la foto final del sprint para el historial y se abre la retrospectiva. Un
                sprint cerrado no se vuelve a abrir.
              </p>
            </div>
            <Avance sprint={sprint} />
            {pendientes.length > 0 ? (
              <div className="space-y-3">
                <h3 className="font-semibold">
                  {pendientes.length === 1
                    ? '1 tarea sin terminar'
                    : `${pendientes.length} tareas sin terminar`}
                </h3>
                <ul className="space-y-1.5">
                  {pendientes.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="w-12 shrink-0 text-xs text-muted tabular">
                        {codigoTarea(t.codigo)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                      <InsigniaEstado estado={t.estado} />
                    </li>
                  ))}
                </ul>
                <Radios
                  nombre="pendientes"
                  etiqueta="¿Qué pasa con ellas?"
                  valor={destino}
                  onChange={setDestino}
                  opciones={[
                    {
                      valor: 'siguiente',
                      etiqueta: siguiente
                        ? `Pasan al Sprint ${siguiente.numero}`
                        : 'Pasan al siguiente sprint',
                      descripcion: siguiente
                        ? 'Conservan su estado y su responsable.'
                        : 'Primero planea el siguiente sprint para elegir esta opción.',
                    },
                    {
                      valor: 'liberar',
                      etiqueta: 'Quedan sin sprint',
                      descripcion: 'Siguen en el tablero y podrás planearlas después.',
                    },
                  ]}
                />
                {destino === 'siguiente' && !siguiente && (
                  <Banner tono="warn" icono={<Lock />}>
                    No hay un sprint planificado que reciba las tareas pendientes.
                  </Banner>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Todas las tareas del sprint están completadas.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="primario"
                cargando={cerrar.isPending}
                disabled={destino === 'siguiente' && !siguiente && pendientes.length > 0}
                motivo="Planea el siguiente sprint o deja las tareas sin sprint."
                onClick={confirmarCierre}
              >
                Cerrar el Sprint {sprint.numero}
              </Boton>
              <Boton variante="fantasma" onClick={() => nav(`${base}/sprints/activo`)}>
                Cancelar
              </Boton>
            </div>
          </Tarjeta>
        );
      }}
    </EstadosDatos>
  );
}
