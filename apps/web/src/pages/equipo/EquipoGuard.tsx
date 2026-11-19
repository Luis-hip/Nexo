import { puede } from '@nexo/shared';
import { Clock } from 'lucide-react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router';
import { useSesion } from '@/components/shell/contexto';
import { ErrorEstado, EsqueletoTarjetas, SinConexion, SinPermisos } from '@/components/ui';
import { ErrorApi } from '@/lib/api';
import { useEquipo } from '@/lib/consultasEquipo';
import { EquipoCtx, type EquipoActual } from './contexto';
import { DetalleTareaEquipo } from './tareas/DetalleTareaEquipo';
import { TareaFormEquipo } from './tareas/TareaFormEquipo';

/** FALT-02 / IN-04: el acceso del invitado caducó o fue revocado. */
function AccesoTerminado() {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
      data-name="NX/IN-04-Acceso-terminado"
    >
      <span className="grid size-16 place-items-center rounded-full bg-danger/10">
        <Clock className="size-7 text-danger-text" aria-hidden />
      </span>
      <h1 className="text-[22px]">Tu acceso terminó</h1>
      <p className="text-sm text-muted">
        Tu acceso como invitado a este equipo caducó. Pide al líder una nueva invitación para volver
        a entrar.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          to="/app/equipos/unirse"
          className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
        >
          Tengo un código nuevo
        </Link>
        <Link
          to="/app/personal"
          className="inline-flex h-11 items-center rounded-[8px] border border-line px-4 text-sm font-medium"
        >
          Ir a mi espacio
        </Link>
      </div>
    </div>
  );
}

/**
 * Guarda del espacio de equipo: pide el equipo a la API, que comprueba la membresía activa
 * y devuelve el perfil. Quien no pertenece ve «sin acceso»; un invitado caducado, FALT-02.
 */
export function EquipoGuard() {
  const { equipo: equipoId = '' } = useParams();
  const yo = useSesion();
  const consulta = useEquipo(equipoId);
  const [sp, setSp] = useSearchParams();
  const tareaId = sp.get('tarea');
  const quitar = (clave: string) =>
    setSp(
      (previo) => {
        const p = new URLSearchParams(previo);
        p.delete(clave);
        return p;
      },
      { replace: true },
    );

  if (consulta.data) {
    const equipo = consulta.data;
    const contexto: EquipoActual = {
      equipo,
      base: `/app/e/${equipo.id}`,
      usuarioId: yo.usuario.id,
      puede: (accion, ctx) => puede(accion, { perfil: equipo.mi_rol, ...ctx }),
    };
    return (
      <EquipoCtx.Provider value={contexto}>
        <Outlet />
        {/* Capas del equipo: se abren con ?tarea=<id> y ?nueva=tarea desde cualquier pantalla. */}
        {tareaId && <DetalleTareaEquipo id={tareaId} onCerrar={() => quitar('tarea')} />}
        {sp.get('nueva') === 'tarea' && contexto.puede('crear_tarea').permitido && (
          <TareaFormEquipo abierto onCerrar={() => quitar('nueva')} />
        )}
      </EquipoCtx.Provider>
    );
  }
  if (consulta.isPending) return <EsqueletoTarjetas />;
  const error = consulta.error;
  if (error instanceof ErrorApi) {
    if (error.codigo === 'acceso_caducado') return <AccesoTerminado />;
    if (error.codigo === 'sin_conexion')
      return <SinConexion onReintentar={() => consulta.refetch()} />;
    if (error.estado === 404 || error.estado === 400) {
      return (
        <SinPermisos
          motivo="No perteneces a este equipo o el equipo no existe. Para unirte necesitas un enlace o código de invitación del líder."
          salida="/app/equipos/unirse"
          textoSalida="Unirme con un código"
        />
      );
    }
  }
  return <ErrorEstado onReintentar={() => consulta.refetch()} />;
}
