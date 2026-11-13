import { ArrowRight, KeyRound, Plus, Users } from 'lucide-react';
import { Link } from 'react-router';
import { useSesion } from '@/components/shell/contexto';
import { Encabezado, InsigniaRol, Tarjeta, Vacio } from '@/components/ui';
import { relativo } from '@/lib/fechas';

/** PER-05: equipos a los que pertenece la persona, con su rol en cada uno. */
export function EquiposPersonal() {
  const { equipos } = useSesion();
  return (
    <div className="space-y-4" data-name="NX/PER-05-Equipos">
      <Encabezado
        titulo="Equipos"
        acciones={
          <>
            <Link
              to="/app/equipos/unirse"
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-line px-3 text-sm font-medium hover:bg-surface"
            >
              <KeyRound className="size-4" aria-hidden /> Unirme con código
            </Link>
            <Link
              to="/app/equipos/nuevo"
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-brand px-3 text-sm font-medium text-on-brand"
            >
              <Plus className="size-4" aria-hidden /> Crear equipo
            </Link>
          </>
        }
      />
      {equipos.length === 0 ? (
        <Tarjeta className="p-6">
          <Vacio
            icono={<Users />}
            titulo="Todavía no estás en ningún equipo"
            texto="Crea uno y serás su líder, o únete con el código que te compartieron."
            accion={
              <>
                <Link
                  to="/app/equipos/nuevo"
                  className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
                >
                  Crear equipo
                </Link>
                <Link
                  to="/app/equipos/unirse"
                  className="inline-flex h-11 items-center rounded-[8px] border border-line px-4 text-sm font-medium"
                >
                  Unirme con código
                </Link>
              </>
            }
          />
        </Tarjeta>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {equipos.map((e) => (
            <li key={e.id}>
              <Link
                to={`/app/e/${e.id}`}
                className="block h-full rounded-[12px] border border-line bg-raised p-4 hover:border-line-strong"
              >
                <span className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-[10px] bg-brand/12 text-lg font-semibold text-brand">
                    {e.nombre.replace('Equipo ', '').charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.nombre}</span>
                    {e.caduca_en && (
                      <span className="text-xs text-muted">
                        Tu acceso caduca {relativo(e.caduca_en)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="mt-3 flex items-center justify-between">
                  <InsigniaRol rol={e.rol} />
                  <ArrowRight className="size-4 text-muted" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
