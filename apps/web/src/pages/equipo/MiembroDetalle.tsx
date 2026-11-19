import { UserX } from 'lucide-react';
import { useParams } from 'react-router';
import { useAcciones } from '@/components/shell/contexto';
import {
  Avatar,
  Encabezado,
  EsqueletoLista,
  EstadosDatos,
  InsigniaEstado,
  InsigniaRol,
  Tarjeta,
  Vacio,
} from '@/components/ui';
import { useTareasEquipo } from '@/lib/consultasEquipo';
import { relativo } from '@/lib/fechas';
import { useEquipoActual } from './contexto';
import { AccionesMiembro } from './Miembros';
import { codigoTarea } from './tareas/comunes';

/** AD-04: ficha de una persona del equipo con sus tareas y las acciones del líder. */
export function MiembroDetalle() {
  const { equipo } = useEquipoActual();
  const { miembroId } = useParams();
  const acc = useAcciones();
  const m = equipo.miembros.find((x) => x.usuario_id === miembroId);
  const tareas = useTareasEquipo(equipo.id, 'todas', !!m);

  if (!m) {
    return (
      <Vacio
        icono={<UserX />}
        titulo="Esa persona no está en el equipo"
        texto="Puede que haya salido o que el enlace sea de otro equipo."
      />
    );
  }
  return (
    <div className="space-y-5" data-name="NX/AD-04-Detalle-miembro">
      <Encabezado
        titulo={
          <span className="flex items-center gap-3">
            <Avatar persona={{ nombre: m.nombre, colorIdx: m.color_idx }} tamano={44} />
            {m.nombre}
          </span>
        }
        descripcion={
          m.caduca_en ? `Invitado · su acceso caduca ${relativo(m.caduca_en)}` : undefined
        }
        acciones={
          <>
            <InsigniaRol rol={m.rol} />
            <AccionesMiembro m={m} />
          </>
        }
      />
      <Tarjeta as="section" className="p-4 sm:p-5" aria-labelledby="tareas-miembro">
        <h2 id="tareas-miembro" className="mb-3 font-semibold">
          Tareas a su cargo
        </h2>
        <EstadosDatos consulta={tareas} esqueleto={<EsqueletoLista filas={3} />}>
          {(lista) => {
            const suyas = lista.filter((t) => t.responsable?.usuario_id === m.usuario_id);
            return suyas.length === 0 ? (
              <p className="text-sm text-muted">No tiene tareas asignadas.</p>
            ) : (
              <ul className="divide-y divide-line">
                {suyas.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => acc.abrirTarea(t.id)}
                      className="flex w-full items-center gap-3 py-2.5 text-left"
                    >
                      <span className="w-12 shrink-0 text-xs text-muted tabular">
                        {codigoTarea(t.codigo)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {t.titulo}
                      </span>
                      <InsigniaEstado estado={t.estado} />
                    </button>
                  </li>
                ))}
              </ul>
            );
          }}
        </EstadosDatos>
      </Tarjeta>
    </div>
  );
}
