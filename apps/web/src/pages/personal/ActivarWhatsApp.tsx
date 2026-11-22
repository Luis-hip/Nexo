import type { ResultadoEnvioWa } from '@nexo/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Boton, Encabezado, EsqueletoTarjetas, EstadosDatos, Tarjeta } from '@/components/ui';
import { ActivarWhatsApp } from '@/components/whatsapp/Registro';
import { api, mensajeDeError } from '@/lib/api';
import { useAccionesWhatsAppYo, useWhatsAppYo } from '@/lib/consultasWhatsApp';
import { toast } from '@/lib/toasts';
import { destinoSeguro } from '@/pages/auth/comunes';

/**
 * `/app/whatsapp/activar` (docs/13_Plan_Integrado_Pendientes.md, 1.1): registro y verificación con
 * un destino. Llegan aquí el aviso al unirse a un equipo (`?equipo=`) y «Enviarme mi reporte» sin
 * número verificado (`?accion=reporte`). Al quedar verificado se completa lo pendiente y regresa.
 */
export function ActivarWhatsAppPagina() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const volver = destinoSeguro(sp.get('volver')) ?? '/app/personal';
  const accion = sp.get('accion');
  const equipo = sp.get('equipo');
  const consulta = useWhatsAppYo();
  const acciones = useAccionesWhatsAppYo();
  const reporte = useMutation({
    mutationFn: () => api<ResultadoEnvioWa>('/yo/whatsapp/reporte', { metodo: 'POST' }),
  });
  const hecho = useRef(false);
  const w = consulta.data;
  const listo = !!w?.verificado && !!w.consentimiento;

  useEffect(() => {
    if (!listo || hecho.current) return;
    hecho.current = true;
    void (async () => {
      try {
        if (equipo) await acciones.consentimiento.mutateAsync({ equipoId: equipo, acepta: true });
        if (accion === 'reporte') {
          const r = await reporte.mutateAsync();
          toast(
            r.enviados > 0
              ? 'Listo: tu reporte va en camino a tu WhatsApp.'
              : 'Tu número quedó activo, pero no se pudo enviar el reporte.',
            r.enviados > 0 ? 'ok' : 'warn',
          );
        } else toast('WhatsApp activado.');
      } catch (e) {
        toast(mensajeDeError(e), 'warn');
      }
      nav(volver, { replace: true });
    })();
  }, [listo, equipo, accion, acciones.consentimiento, reporte, nav, volver]);

  const descripcion =
    accion === 'reporte'
      ? 'Para mandarte tu reporte necesitamos tu número verificado. Al terminar te lo enviamos.'
      : equipo
        ? 'Activa WhatsApp para recibir los avisos de este equipo.'
        : 'Recibe en tu WhatsApp los avisos de tus equipos y tu reporte cuando lo pidas.';
  return (
    <div className="mx-auto max-w-xl space-y-5" data-name="NX/WA-Activar-Pagina">
      <Encabezado titulo="Activa WhatsApp" descripcion={descripcion} />
      <Tarjeta className="p-4 sm:p-5">
        <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={1} />}>
          {(datos) => <ActivarWhatsApp w={datos} />}
        </EstadosDatos>
      </Tarjeta>
      <Boton variante="fantasma" onClick={() => nav(volver)}>
        Ahora no
      </Boton>
    </div>
  );
}
