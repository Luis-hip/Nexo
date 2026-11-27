import type { TipoActividad } from '@nexo/shared';
import { Activity } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar,
  Boton,
  Encabezado,
  EsqueletoLista,
  EstadosDatos,
  Segmentado,
  Vacio,
} from '@/components/ui';
import { useActividad } from '@/lib/consultasVistas';
import { fechaCorta, hora } from '@/lib/fechas';
import { useEquipoActual } from '../contexto';

type Filtro = TipoActividad | 'todo';

/** EQ-18 · Historial (antes «Actividad»): cambios del equipo, filtrable por tipo y por páginas. */
export function Actividad() {
  const { equipo } = useEquipoActual();
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const consulta = useActividad(equipo.id, filtro === 'todo' ? undefined : filtro);
  const items = consulta.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-4" data-name="NX/EQ-18-Actividad">
      <Encabezado
        titulo="Historial"
        descripcion="Todo lo que pasa en el equipo, del más reciente al más antiguo."
      />
      <Segmentado
        etiqueta="Tipo de cambio"
        valor={filtro}
        onChange={setFiltro}
        opciones={[
          { valor: 'todo', etiqueta: 'Todo' },
          { valor: 'tarea', etiqueta: 'Tareas' },
          { valor: 'sprint', etiqueta: 'Sprints' },
          { valor: 'reunion', etiqueta: 'Reuniones' },
          { valor: 'equipo', etiqueta: 'Equipo' },
        ]}
      />
      <EstadosDatos
        consulta={{ ...consulta, data: consulta.data ? items : undefined }}
        esqueleto={<EsqueletoLista filas={6} />}
        vacio={
          <Vacio
            icono={<Activity />}
            titulo="Sin historial todavía"
            texto="Aquí aparecerá cada cambio del equipo."
          />
        }
      >
        {(lista) => (
          <>
            <ol className="divide-y divide-line rounded-[12px] border border-line">
              {lista.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3">
                  {a.autor ? (
                    <Avatar
                      persona={{ nombre: a.autor.nombre, colorIdx: a.autor.color_idx }}
                      tamano={28}
                    />
                  ) : (
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-surface"
                      aria-hidden
                    >
                      <Activity className="size-4 text-muted" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{a.resumen}</span>
                    <span className="text-xs text-muted tabular">
                      {fechaCorta(a.creado_en)} · {hora(a.creado_en)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {consulta.hasNextPage && (
              <Boton
                className="mt-3"
                cargando={consulta.isFetchingNextPage}
                onClick={() => void consulta.fetchNextPage()}
              >
                Cargar más
              </Boton>
            )}
          </>
        )}
      </EstadosDatos>
    </div>
  );
}
