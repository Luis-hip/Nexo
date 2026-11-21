import {
  FORMATOS_WA,
  NOMBRE_FORMATO_WA,
  type EntregaWa,
  type FormatoWa,
  type ResultadoEnvioWa,
  type VerificacionWa,
  type WhatsAppUsuario,
} from '@nexo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ExternalLink, FlaskConical, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Boton, Insignia, Radios } from '@/components/ui';
import { api, mensajeDeError } from '@/lib/api';
import { toast } from '@/lib/toasts';

/**
 * Spike WhatsApp 1 a 1 (docs/11_Plan_Spike_WhatsApp_1a1.md §9, DEC-039): verificación del número,
 * formato preferido, «enviarme mi reporte» y, solo fuera de producción, las pruebas del plan §5.4.
 */
const claveYo = ['yo', 'whatsapp'] as const;

const ESTADO_ENTREGA: Record<
  EntregaWa['estado'],
  { texto: string; tono: 'ok' | 'warn' | 'danger' | 'neutro' | 'marca' }
> = {
  pendiente: { texto: 'Pendiente', tono: 'neutro' },
  pendiente_ventana: { texto: 'Espera respuesta', tono: 'warn' },
  enviando: { texto: 'Enviando', tono: 'marca' },
  enviado: { texto: 'Enviado', tono: 'ok' },
  entregado: { texto: 'Entregado', tono: 'ok' },
  leido: { texto: 'Leído', tono: 'ok' },
  fallido: { texto: 'Falló', tono: 'danger' },
  caducado: { texto: 'Caducó', tono: 'neutro' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
};

/** WA-02/WA-04: el reparto de un aviso por persona (sin números completos, R4). */
export function RepartoEntregas({ entregas }: { entregas: EntregaWa[] }) {
  if (entregas.length === 0) return null;
  return (
    <ul
      className="flex flex-wrap gap-1.5"
      aria-label="Reparto del aviso"
      data-name="NX/WA-02-Reparto"
    >
      {entregas.map((x) => {
        const e = ESTADO_ENTREGA[x.estado];
        return (
          <li key={x.id}>
            <Insignia tono={e.tono}>
              {x.destino === 'grupo' ? 'Grupo' : (x.persona?.nombre.split(' ')[0] ?? 'Persona')}
              {x.numero_fin ? ` ${x.numero_fin}` : ''} · {e.texto}
            </Insignia>
          </li>
        );
      })}
    </ul>
  );
}

/** «Enviarme mi reporte por WhatsApp» (plan §9, `/app/personal/reportes` y Ajustes). */
export function EnviarMiReporte({ deshabilitado }: { deshabilitado?: boolean }) {
  const enviar = useMutation({
    mutationFn: () => api<ResultadoEnvioWa>('/yo/whatsapp/reporte', { metodo: 'POST' }),
    onSuccess: (r) =>
      toast(
        r.enviados > 0
          ? 'Listo: tu reporte va en camino a tu WhatsApp.'
          : 'No se pudo enviar tu reporte.',
        r.enviados > 0 ? 'ok' : 'danger',
      ),
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  return (
    <Boton
      icono={<Send className="size-4" />}
      cargando={enviar.isPending}
      disabled={deshabilitado}
      onClick={() => enviar.mutate()}
      data-name="NX/PER-Reporte-WhatsApp"
    >
      Enviarme mi reporte por WhatsApp
    </Boton>
  );
}

/** Ajustes → WhatsApp: verificación, formato, reporte y pruebas de desarrollo. */
export function DirectoPersonal({ w }: { w: WhatsAppUsuario }) {
  const qc = useQueryClient();
  const [verificacion, setVerificacion] = useState<VerificacionWa | null>(null);
  const listo = (d: WhatsAppUsuario) => qc.setQueryData(claveYo, d);
  const pedirCodigo = useMutation({
    mutationFn: () =>
      api<VerificacionWa>('/yo/whatsapp/verificacion', {
        metodo: 'POST',
        cuerpo: { numero: w.numero },
      }),
    onSuccess: (v) => {
      setVerificacion(v);
      void qc.invalidateQueries({ queryKey: claveYo });
    },
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  const formato = useMutation({
    mutationFn: (f: FormatoWa | null) =>
      api<WhatsAppUsuario>('/yo/whatsapp/formato', { metodo: 'PUT', cuerpo: { formato: f } }),
    onSuccess: (d) => {
      listo(d);
      toast('Formato guardado.');
    },
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  const simular = useMutation({
    mutationFn: (texto: string) =>
      api<{ conocido: boolean; entregadas: number }>('/dev/whatsapp/entrante', {
        metodo: 'POST',
        cuerpo: { numero: w.numero, texto },
      }),
    onSuccess: (r) => {
      toast(
        r.entregadas > 0
          ? `Se entregaron ${r.entregadas} aviso(s) pendientes.`
          : 'Respuesta simulada.',
      );
      void qc.invalidateQueries({ queryKey: claveYo });
    },
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  const adelantar = useMutation({
    mutationFn: () =>
      api<{ caducadas: number }>('/dev/whatsapp/ciclo', {
        metodo: 'POST',
        consulta: { ahora: new Date(Date.now() + 8 * 86_400_000).toISOString() },
      }),
    onSuccess: (r) => toast(`Reloj adelantado 8 días: ${r.caducadas} entrega(s) caducaron.`),
  });
  if (!w.numero || !w.consentimiento) return null;
  return (
    <div className="space-y-4 border-t border-line pt-3" data-name="NX/PF-05-Directo">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Verificación del número
          {w.verificado ? (
            <Insignia tono="ok">
              <BadgeCheck className="size-3.5" aria-hidden /> Verificado
            </Insignia>
          ) : (
            <Insignia tono="warn">Sin verificar</Insignia>
          )}
        </h3>
        {!w.verificado && (
          <>
            <p className="text-xs text-muted">
              Manda un mensaje desde tu WhatsApp al número de Nexo con el código. Así comprobamos
              que el número es tuyo y abres la conversación.
            </p>
            {verificacion ? (
              <p className="text-sm">
                Tu código: <strong className="font-mono tabular">{verificacion.codigo}</strong>{' '}
                (caduca en 30 min).{' '}
                <a
                  href={verificacion.enlace}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  Abrir WhatsApp <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </p>
            ) : (
              <Boton
                tamano="sm"
                icono={<ShieldCheck className="size-4" />}
                cargando={pedirCodigo.isPending}
                onClick={() => pedirCodigo.mutate()}
              >
                Verificar mi número
              </Boton>
            )}
          </>
        )}
      </div>
      <div className="space-y-2">
        <Radios
          nombre="formato-wa"
          etiqueta="¿Cómo quieres recibir avisos y reportes?"
          valor={w.formato ?? 'equipo'}
          onChange={(v) => formato.mutate(v === 'equipo' ? null : (v as FormatoWa))}
          opciones={[
            { valor: 'equipo', etiqueta: 'Como lo elija cada equipo' },
            ...FORMATOS_WA.map((f) => ({
              valor: f,
              etiqueta: NOMBRE_FORMATO_WA[f].nombre,
              descripcion: NOMBRE_FORMATO_WA[f].descripcion,
            })),
          ]}
        />
        <p className="text-xs text-muted">
          Escribe <strong>BAJA</strong> al número de Nexo para dejar de recibir avisos, o{' '}
          <strong>REPORTE</strong> para recibir tu reporte.
        </p>
      </div>
      <EnviarMiReporte />
      {import.meta.env.DEV && (
        <div
          className="space-y-2 rounded-[10px] border border-dashed border-line p-3"
          data-name="NX/DEV-Pruebas-WhatsApp"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <FlaskConical className="size-3.5" aria-hidden /> Pruebas (solo desarrollo, plan §5.4)
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton
              tamano="sm"
              cargando={simular.isPending}
              onClick={() => simular.mutate('Ver actualización')}
            >
              Simular respuesta
            </Boton>
            {verificacion && (
              <Boton tamano="sm" onClick={() => simular.mutate(`VERIFICAR ${verificacion.codigo}`)}>
                Simular «VERIFICAR»
              </Boton>
            )}
            <Boton tamano="sm" cargando={adelantar.isPending} onClick={() => adelantar.mutate()}>
              Adelantar reloj 8 días
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
