import type { Notificacion } from '@nexo/shared';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Boton,
  Encabezado,
  EsqueletoLista,
  EstadosDatos,
  Segmentado,
  Vacio,
  cx,
} from '@/components/ui';
import { useAccionesNotificaciones, useNotificaciones } from '@/lib/consultasVistas';
import { fechaCorta, hora } from '@/lib/fechas';

/** NT-01: centro de notificaciones de la persona (de todos sus equipos). */
export function Notificaciones() {
  const consulta = useNotificaciones();
  const { marcar, marcarTodas } = useAccionesNotificaciones();
  const [filtro, setFiltro] = useState<'todas' | 'no_leidas'>('todas');
  const nav = useNavigate();
  const abrir = (n: Notificacion) => {
    if (!n.leida_en) marcar.mutate(n.id);
    if (n.enlace) nav(n.enlace);
  };
  return (
    <div className="space-y-4" data-name="NX/NT-01-Notificaciones">
      <Encabezado
        titulo="Notificaciones"
        descripcion="Avisos de tus equipos: liderazgo, elecciones, reuniones y más."
        acciones={
          <Boton
            tamano="sm"
            icono={<CheckCheck className="size-4" />}
            disabled={!consulta.data?.no_leidas}
            cargando={marcarTodas.isPending}
            onClick={() => marcarTodas.mutate()}
          >
            Marcar todo como leído
          </Boton>
        }
      />
      <Segmentado
        etiqueta="Qué notificaciones ver"
        valor={filtro}
        onChange={setFiltro}
        opciones={[
          { valor: 'todas', etiqueta: 'Todas' },
          { valor: 'no_leidas', etiqueta: 'Sin leer', contador: consulta.data?.no_leidas },
        ]}
      />
      <EstadosDatos
        consulta={{
          ...consulta,
          data: consulta.data?.items.filter((n) => filtro === 'todas' || !n.leida_en),
        }}
        esqueleto={<EsqueletoLista filas={5} />}
        vacio={
          <Vacio
            icono={<Bell />}
            titulo="Estás al día"
            texto="Aquí llegan los avisos de tus equipos."
          />
        }
      >
        {(lista) => (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {lista.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => abrir(n)}
                  className={cx(
                    'flex w-full items-start gap-3 p-3 text-left hover:bg-surface',
                    !n.leida_en && 'bg-brand/5',
                  )}
                >
                  <span
                    className={cx(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      n.leida_en ? 'bg-transparent' : 'bg-brand',
                    )}
                    aria-label={n.leida_en ? undefined : 'Sin leer'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{n.titulo}</span>
                    {n.texto && <span className="block text-sm text-muted">{n.texto}</span>}
                    <span className="text-xs text-muted tabular">
                      {n.equipo ? `${n.equipo} · ` : ''}
                      {fechaCorta(n.creada_en)} · {hora(n.creada_en)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </EstadosDatos>
    </div>
  );
}
