import {
  NOMBRE_SOLICITUD_INVITADO,
  type SolicitudInvitado,
  type TipoSolicitudInvitado,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Boton, Selector } from '@/components/ui';
import { api, mensajeDeError } from '@/lib/api';
import { relativo } from '@/lib/fechas';
import { toast } from '@/lib/toasts';

/**
 * Solicitudes del invitado (DEC-023, DEC-037): el invitado pide más días o ser integrante; el líder
 * aprueba (AD-05) o rechaza desde Equipo → Miembros.
 */
const clave = (equipoId: string) => ['equipo', equipoId, 'solicitudes'] as const;

export function useSolicitudes(equipoId: string, activo = true) {
  return useQuery({
    queryKey: clave(equipoId),
    queryFn: () => api<SolicitudInvitado[]>(`/equipos/${equipoId}/solicitudes`),
    enabled: activo,
  });
}

/** Botones del invitado (en el banner de caducidad, IN-04). */
export function PedirAlLider({ equipoId }: { equipoId: string }) {
  const qc = useQueryClient();
  const { data } = useSolicitudes(equipoId);
  const pedir = useMutation({
    mutationFn: (tipo: TipoSolicitudInvitado) =>
      api<SolicitudInvitado>(`/equipos/${equipoId}/solicitudes`, {
        metodo: 'POST',
        cuerpo: { tipo },
      }),
    onSuccess: () => {
      toast('Listo: el líder recibió tu solicitud.');
      void qc.invalidateQueries({ queryKey: clave(equipoId) });
    },
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  const pendiente = (tipo: TipoSolicitudInvitado) =>
    (data ?? []).some((s) => s.tipo === tipo && s.estado === 'pendiente');
  return (
    <span className="mt-2 flex flex-wrap gap-2" data-name="NX/IN-04-Solicitudes">
      {(['ampliacion', 'conversion'] as const).map((tipo) => (
        <Boton
          key={tipo}
          tamano="sm"
          disabled={pendiente(tipo)}
          cargando={pedir.isPending && pedir.variables === tipo}
          onClick={() => pedir.mutate(tipo)}
        >
          {pendiente(tipo)
            ? `${NOMBRE_SOLICITUD_INVITADO[tipo]}: pedido`
            : `Pedir: ${NOMBRE_SOLICITUD_INVITADO[tipo].toLowerCase()}`}
        </Boton>
      ))}
    </span>
  );
}

/** Lista del líder: solicitudes pendientes con aprobar o rechazar. */
export function SolicitudesInvitados({ equipoId }: { equipoId: string }) {
  const { data } = useSolicitudes(equipoId);
  if (!data || data.length === 0) return null;
  return (
    <section aria-labelledby="solicitudes-invitados" data-name="NX/AD-05-Solicitudes">
      <h2 id="solicitudes-invitados" className="mb-2 text-base font-semibold">
        Solicitudes de invitados <span className="text-muted tabular">({data.length})</span>
      </h2>
      <ul className="divide-y divide-line rounded-[12px] border border-line">
        {data.map((s) => (
          <FilaSolicitud key={s.id} equipoId={equipoId} s={s} />
        ))}
      </ul>
    </section>
  );
}

function FilaSolicitud({ equipoId, s }: { equipoId: string; s: SolicitudInvitado }) {
  const qc = useQueryClient();
  const [dias, setDias] = useState('7');
  const resolver = useMutation({
    mutationFn: (aprobar: boolean) =>
      api<SolicitudInvitado>(`/equipos/${equipoId}/solicitudes/${s.id}`, {
        metodo: 'POST',
        cuerpo: { aprobar, ...(s.tipo === 'ampliacion' && aprobar ? { dias: Number(dias) } : {}) },
      }),
    onSuccess: (_r, aprobar) => {
      toast(aprobar ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
      void qc.invalidateQueries({ queryKey: ['equipo', equipoId] });
    },
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  const nombre = s.persona?.nombre ?? 'Invitado';
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Avatar persona={{ nombre }} conAnillo={false} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {nombre} · {NOMBRE_SOLICITUD_INVITADO[s.tipo]}
        </span>
        <span className="text-xs text-muted">Pedido {relativo(s.creada_en)}</span>
      </span>
      {s.tipo === 'ampliacion' && (
        <Selector
          aria-label="Días que se amplía"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          className="w-28"
        >
          <option value="7">7 días</option>
          <option value="14">14 días</option>
          <option value="30">30 días</option>
        </Selector>
      )}
      <Boton
        tamano="sm"
        variante="primario"
        icono={<Check className="size-4" />}
        cargando={resolver.isPending && resolver.variables === true}
        onClick={() => resolver.mutate(true)}
      >
        Aprobar
      </Boton>
      <Boton
        tamano="sm"
        icono={<X className="size-4" />}
        cargando={resolver.isPending && resolver.variables === false}
        onClick={() => resolver.mutate(false)}
      >
        Rechazar
      </Boton>
    </li>
  );
}
