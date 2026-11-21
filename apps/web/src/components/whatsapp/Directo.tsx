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
import {
  BadgeCheck,
  Copy,
  ExternalLink,
  FlaskConical,
  Loader2,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Acordeon, Boton, Insignia, Radios } from '@/components/ui';
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

/** Número de Nexo legible a partir del enlace wa.me («+1 555 183 3695»). */
function numeroNexo(enlace: string) {
  const d = /wa\.me\/(\d+)/.exec(enlace)?.[1] ?? '';
  return d.length === 11 && d.startsWith('1')
    ? `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
    : `+${d}`;
}

/**
 * Paso de verificación (plan §7.1). Es lo único importante mientras el número no esté verificado:
 * código grande, el mensaje exacto a mandar y un botón principal a WhatsApp. Mientras el código
 * está vigente la pantalla consulta el estado sola y avisa en cuanto queda verificado.
 */
function PasoVerificacion({ w }: { w: WhatsAppUsuario }) {
  const qc = useQueryClient();
  const [verificacion, setVerificacion] = useState<VerificacionWa | null>(null);
  const pedirCodigo = useMutation({
    mutationFn: () =>
      api<VerificacionWa>('/yo/whatsapp/verificacion', {
        metodo: 'POST',
        cuerpo: { numero: w.numero },
      }),
    onSuccess: (v) => setVerificacion(v),
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  const simular = useMutation({
    mutationFn: (texto: string) =>
      api<{ conocido: boolean }>('/dev/whatsapp/entrante', {
        metodo: 'POST',
        cuerpo: { numero: w.numero, texto },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: claveYo }),
    onError: (e) => toast(mensajeDeError(e), 'warn'),
  });
  // Mientras haya un código vigente se revisa el estado cada 4 s (la respuesta llega por WhatsApp).
  useEffect(() => {
    if (!verificacion) return;
    const fin = Date.parse(verificacion.expira_en);
    const t = window.setInterval(() => {
      if (Date.now() > fin) setVerificacion(null);
      else void qc.invalidateQueries({ queryKey: claveYo });
    }, 4000);
    return () => window.clearInterval(t);
  }, [verificacion, qc]);
  const mensaje = verificacion ? `VERIFICAR ${verificacion.codigo}` : '';
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      toast('Mensaje copiado.');
    } catch {
      toast('No se pudo copiar; escríbelo tal cual.', 'warn');
    }
  };
  const hora = verificacion
    ? new Date(verificacion.expira_en).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  return (
    <section
      aria-labelledby="wa-verificar-titulo"
      className="space-y-4 rounded-[12px] border border-brand/35 bg-brand/8 p-4 sm:p-5"
      data-name="NX/PF-05-Verificar"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h3 id="wa-verificar-titulo" className="text-base font-semibold">
            Verifica tu número para recibir avisos
          </h3>
          <p className="text-sm text-muted">
            Es un solo paso: mandas un mensaje desde tu WhatsApp al número de Nexo. Así sabemos que
            el número es tuyo y abres la conversación.
          </p>
        </div>
      </div>
      {!verificacion ? (
        <Boton
          variante="primario"
          tamano="lg"
          icono={<ShieldCheck className="size-5" />}
          cargando={pedirCodigo.isPending}
          onClick={() => pedirCodigo.mutate()}
        >
          Obtener mi código
        </Boton>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted uppercase">Tu código</p>
            <p
              className="font-mono text-4xl font-semibold tracking-[0.3em] text-fg tabular sm:text-5xl"
              aria-label={`Código ${verificacion.codigo.split('').join(' ')}`}
            >
              {verificacion.codigo}
            </p>
            <p className="mt-1 text-xs text-muted">Vence a las {hora}</p>
          </div>
          <ol className="space-y-1 text-sm">
            <li>
              1. Abre WhatsApp y escríbele al número de Nexo{' '}
              <strong className="tabular">{numeroNexo(verificacion.enlace)}</strong>.
            </li>
            <li>
              2. Manda <strong className="font-mono">{mensaje}</strong> (o solo el código).
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a
              href={verificacion.enlace}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[8px] bg-brand px-6 text-base font-medium text-on-brand shadow-soft transition-[filter] hover:brightness-110 active:brightness-95"
            >
              Abrir WhatsApp <ExternalLink className="size-4" aria-hidden />
            </a>
            <Boton tamano="lg" icono={<Copy className="size-4" />} onClick={() => void copiar()}>
              Copiar mensaje
            </Boton>
          </div>
          <p
            className="flex items-center gap-2 text-sm text-muted"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden /> Esperando tu mensaje… esta
            pantalla se actualiza sola.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="text-sm text-brand hover:underline"
              onClick={() => pedirCodigo.mutate()}
            >
              Pedir otro código
            </button>
            {import.meta.env.DEV && (
              <Boton
                tamano="sm"
                variante="fantasma"
                icono={<FlaskConical className="size-3.5" />}
                onClick={() => simular.mutate(mensaje)}
              >
                Simular el mensaje (desarrollo)
              </Boton>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Ajustes → WhatsApp: primero verificar; ya verificado, reporte, formato (plegable) y pruebas. */
export function DirectoPersonal({ w }: { w: WhatsAppUsuario }) {
  const qc = useQueryClient();
  const listo = (d: WhatsAppUsuario) => qc.setQueryData(claveYo, d);
  const estabaVerificado = useRef(w.verificado);
  useEffect(() => {
    if (w.verificado && !estabaVerificado.current) toast('¡Listo! Tu número quedó verificado.');
    estabaVerificado.current = w.verificado;
  }, [w.verificado]);
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
  if (!w.verificado) {
    return (
      <div className="space-y-2 border-t border-line pt-4" data-name="NX/PF-05-Directo">
        <PasoVerificacion w={w} />
        <p className="text-xs text-muted">
          Después de verificar podrás elegir cómo recibir avisos y pedir tu reporte por WhatsApp.
        </p>
      </div>
    );
  }
  const actual = w.formato ? NOMBRE_FORMATO_WA[w.formato].nombre : 'Como lo elija cada equipo';
  return (
    <div className="space-y-4 border-t border-line pt-4" data-name="NX/PF-05-Directo">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Insignia tono="ok">
          <BadgeCheck className="size-3.5" aria-hidden /> Número verificado
        </Insignia>
        <span className="text-muted">Ya puedes recibir avisos y reportes.</span>
      </p>
      <div className="space-y-2">
        <EnviarMiReporte />
        <p className="text-xs text-muted">
          También puedes escribir <strong>REPORTE</strong> al número de Nexo, o{' '}
          <strong>BAJA</strong> para dejar de recibir avisos.
        </p>
      </div>
      <Acordeon
        className="border-t border-line"
        titulo={
          <span className="flex flex-col">
            <span className="text-sm font-semibold">Formato de avisos y reportes</span>
            <span className="text-xs font-normal text-muted">{actual}</span>
          </span>
        }
      >
        <Radios
          nombre="formato-wa"
          etiqueta="¿Cómo quieres recibirlos?"
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
      </Acordeon>
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
            <Boton tamano="sm" cargando={adelantar.isPending} onClick={() => adelantar.mutate()}>
              Adelantar reloj 8 días
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
