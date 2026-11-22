import {
  esquemaContacto,
  NOMBRE_ESTADO_CONTACTO,
  NOMBRE_TIPO_CONTACTO,
  TIPOS_MENSAJE_CONTACTO,
  type ContactoEnviado,
  type DatosContacto,
  type SeguimientoContacto as Seguimiento,
  type TipoContacto,
} from '@nexo/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Info, Search, Send } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AreaTexto,
  Banner,
  Boton,
  Campo,
  Casilla,
  Entrada,
  Insignia,
  Radios,
  Tarjeta,
  cx,
} from '@/components/ui';
import { api, ErrorApi, mensajeDeError } from '@/lib/api';
import { useYo } from '@/lib/consultas';

/**
 * PUB-08 · Contacto y soporte (docs/12_Plan_Contacto.md §8.2 y §8.3). Visitantes y personas con
 * sesión; el contenido de las personas siempre se muestra como texto.
 */

const seccion = 'mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8';

function Pagina({
  titulo,
  intro,
  children,
  nombre,
}: {
  titulo: string;
  intro?: string;
  children: ReactNode;
  nombre: string;
}) {
  return (
    <div className={cx(seccion, 'py-12 sm:py-16')} data-name={nombre}>
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[40px]">{titulo}</h1>
      {intro && <p className="mt-3 max-w-2xl text-lg text-muted">{intro}</p>}
      <div className="mt-10">{children}</div>
    </div>
  );
}

const CLAVE_SITIO = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

/** Cloudflare Turnstile (solo si hay clave pública). El servidor vuelve a comprobarlo. */
function Captcha({ onToken }: { onToken: (t: string | undefined) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!CLAVE_SITIO || !ref.current) return;
    const el = ref.current;
    const pintar = () =>
      window.turnstile?.render(el, {
        sitekey: CLAVE_SITIO,
        language: 'es',
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(undefined),
        'error-callback': () => onToken(undefined),
      });
    if (window.turnstile) {
      pintar();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = pintar;
    document.head.appendChild(s);
  }, [onToken]);
  if (!CLAVE_SITIO) return null;
  return <div ref={ref} />;
}

/** Contexto técnico de un reporte de error: página anterior, navegador y versión de la app. */
function contextoTecnico() {
  let url = '';
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.origin === window.location.origin) url = r.pathname;
  } catch {
    url = '';
  }
  const ua = navigator.userAgent;
  const nav =
    /Edg\/(\d+)/.exec(ua)?.[0].replace('Edg/', 'Edge ') ??
    /Firefox\/(\d+)/.exec(ua)?.[0].replace('/', ' ') ??
    /Chrome\/(\d+)/.exec(ua)?.[0].replace('/', ' ') ??
    /Version\/(\d+).*Safari/.exec(ua)?.[1]?.replace(/^/, 'Safari ') ??
    'Otro';
  return {
    url: url || 'ninguna',
    navegador: nav,
    version_app: (import.meta.env.VITE_VERSION as string | undefined) ?? import.meta.env.MODE,
    idioma: navigator.language,
  };
}

type Errores = Partial<Record<keyof DatosContacto, string>>;

export function Contacto() {
  const yo = useYo().data;
  const [v, setV] = useState<DatosContacto>({
    tipo: 'duda',
    nombre: '',
    correo: '',
    asunto: '',
    mensaje: '',
    web: '',
    acepta_privacidad: false as true,
  });
  const [err, setErr] = useState<Errores>({});
  const [captcha, setCaptcha] = useState<string>();
  const contexto = v.tipo === 'error' ? contextoTecnico() : undefined;
  // Con sesión, nombre y correo vienen de la cuenta (solo lectura; el servidor también lo hace).
  const datos = (): DatosContacto => ({
    ...v,
    ...(yo ? { nombre: yo.usuario.nombre, correo: yo.usuario.correo } : {}),
    contexto,
    captcha_token: captcha,
  });
  const envio = useMutation({
    mutationFn: (d: DatosContacto) =>
      api<ContactoEnviado>('/contacto', { metodo: 'POST', cuerpo: d }),
    // El folio queda arriba: se lleva a la persona al inicio de la página.
    onSuccess: () => window.scrollTo({ top: 0 }),
  });
  const validar = (campo?: keyof DatosContacto) => {
    const r = esquemaContacto.safeParse(datos());
    const e: Errores = {};
    if (!r.success)
      for (const i of r.error.issues) e[i.path[0] as keyof DatosContacto] ??= i.message;
    setErr(campo ? { ...err, [campo]: e[campo] } : e);
    return r.success;
  };
  const enviar = () => {
    if (CLAVE_SITIO && !captcha) {
      setErr({ ...err, captcha_token: 'Completa la verificación de que no eres un robot.' });
      return;
    }
    if (validar() && !envio.isPending) envio.mutate(datos());
  };

  if (envio.isSuccess) {
    return (
      <Pagina titulo="¡Gracias por escribirnos!" nombre="NX/PUB-08-Contacto-exito">
        <Tarjeta className="max-w-xl space-y-4 p-6">
          <CheckCircle2 className="size-8 text-ok" aria-hidden />
          <p>
            Recibimos tu mensaje. Tu folio es{' '}
            <strong className="font-mono tabular">{envio.data.folio}</strong>.
          </p>
          <p className="text-sm text-muted">
            Te mandamos un correo con un enlace para consultar el estado; ahí también verás las
            respuestas del equipo. Guarda el folio por si lo necesitas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
            >
              Volver al inicio
            </Link>
            <Boton
              onClick={() => {
                envio.reset();
                setV({ ...v, asunto: '', mensaje: '' });
              }}
            >
              Enviar otro mensaje
            </Boton>
          </div>
        </Tarjeta>
      </Pagina>
    );
  }

  const limite = envio.error instanceof ErrorApi && envio.error.codigo === 'limite_contacto';
  return (
    <Pagina
      titulo="Contacto"
      intro="Dudas, errores o sugerencias: te leemos y te respondemos por correo."
      nombre="NX/PUB-08-Contacto"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        noValidate
        className="max-w-xl space-y-5"
      >
        {envio.isError && (
          <Banner
            tono={limite ? 'warn' : 'danger'}
            accion={
              !limite && (
                <Boton tamano="sm" onClick={enviar}>
                  Reintentar
                </Boton>
              )
            }
          >
            {limite
              ? mensajeDeError(envio.error)
              : `No pudimos enviar tu mensaje. ${mensajeDeError(envio.error)} Lo que escribiste sigue aquí.`}
          </Banner>
        )}
        <Radios
          nombre="tipo"
          etiqueta="¿Sobre qué nos escribes?"
          valor={v.tipo}
          onChange={(x) => setV({ ...v, tipo: x as TipoContacto })}
          opciones={TIPOS_MENSAJE_CONTACTO.map((t) => ({
            valor: t,
            etiqueta: NOMBRE_TIPO_CONTACTO[t].nombre,
            descripcion: NOMBRE_TIPO_CONTACTO[t].descripcion,
          }))}
        />
        {yo ? (
          <p className="text-sm text-muted">
            Te responderemos como <strong className="text-fg">{yo.usuario.nombre}</strong> a{' '}
            <strong className="text-fg">{yo.usuario.correo}</strong>.
          </p>
        ) : (
          <>
            <Campo etiqueta="Nombre" error={err.nombre}>
              <Entrada
                value={v.nombre}
                onChange={(e) => setV({ ...v, nombre: e.target.value })}
                onBlur={() => validar('nombre')}
                autoComplete="name"
                maxLength={100}
              />
            </Campo>
            <Campo etiqueta="Correo" error={err.correo} ayuda="Ahí te responderemos.">
              <Entrada
                type="email"
                value={v.correo}
                onChange={(e) => setV({ ...v, correo: e.target.value })}
                onBlur={() => validar('correo')}
                autoComplete="email"
                maxLength={254}
              />
            </Campo>
          </>
        )}
        <Campo etiqueta="Asunto" error={err.asunto}>
          <Entrada
            value={v.asunto}
            onChange={(e) => setV({ ...v, asunto: e.target.value })}
            onBlur={() => validar('asunto')}
            maxLength={150}
          />
        </Campo>
        <Campo
          etiqueta="Mensaje"
          error={err.mensaje}
          ayuda={
            v.tipo === 'error'
              ? `Cuéntanos qué hacías, qué esperabas y qué pasó. ${v.mensaje.length}/5000`
              : `${v.mensaje.length}/5000`
          }
        >
          <AreaTexto
            value={v.mensaje}
            onChange={(e) => setV({ ...v, mensaje: e.target.value })}
            onBlur={() => validar('mensaje')}
            rows={6}
            maxLength={5000}
          />
        </Campo>
        {contexto && (
          <p className="flex gap-2 rounded-[8px] border border-line p-3 text-xs text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Para ayudarnos a reproducir el error enviaremos también: página anterior:{' '}
              {contexto.url}; navegador: {contexto.navegador}; versión de la app:{' '}
              {contexto.version_app}; idioma: {contexto.idioma}.
            </span>
          </p>
        )}
        {/* Trampa para bots: invisible para las personas y para los lectores de pantalla. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Sitio web
            <input
              tabIndex={-1}
              autoComplete="off"
              value={v.web ?? ''}
              onChange={(e) => setV({ ...v, web: e.target.value })}
            />
          </label>
        </div>
        <Captcha onToken={setCaptcha} />
        {err.captcha_token && (
          <p role="alert" className="text-sm text-danger">
            {err.captcha_token}
          </p>
        )}
        <div>
          <Casilla
            checked={v.acepta_privacidad === true}
            onChange={(x) => setV({ ...v, acepta_privacidad: x as true })}
            etiqueta={
              <>
                Acepto el {/* En otra pestaña: así no se pierde lo escrito. */}
                <a
                  href="/privacidad"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  aviso de privacidad
                </a>
              </>
            }
            descripcion="Guardamos tu mensaje y tus datos de contacto para atenderte, hasta 12 meses después de resolverlo."
          />
          {err.acepta_privacidad && (
            <p role="alert" className="text-sm text-danger">
              {err.acepta_privacidad}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Boton
            type="submit"
            variante="primario"
            icono={<Send className="size-4" />}
            cargando={envio.isPending}
          >
            {envio.isPending ? 'Enviando…' : 'Enviar mensaje'}
          </Boton>
          <Link to="/contacto/seguimiento" className="text-sm text-brand hover:underline">
            Consultar un mensaje que ya enviaste
          </Link>
        </div>
      </form>
    </Pagina>
  );
}

const TONO_ESTADO = {
  nuevo: 'marca',
  en_revision: 'info',
  esperando_usuario: 'warn',
  resuelto: 'ok',
  descartado: 'neutro',
} as const;

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

/** `/contacto/seguimiento?folio=…&token=…` (enlace del correo) o pegando folio y token. */
export function SeguimientoContacto() {
  const [sp] = useSearchParams();
  const [folio, setFolio] = useState(sp.get('folio') ?? '');
  const [token, setToken] = useState(sp.get('token') ?? '');
  const [buscar, setBuscar] = useState<{ folio: string; token: string } | null>(
    sp.get('folio') && sp.get('token')
      ? { folio: sp.get('folio')!, token: sp.get('token')! }
      : null,
  );
  useEffect(() => {
    // El token no se queda en la barra de direcciones ni en el historial (ni en localStorage).
    if (sp.get('token')) window.history.replaceState(null, '', window.location.pathname);
  }, [sp]);
  const consulta = useQuery({
    queryKey: ['contacto', 'seguimiento', buscar?.folio, buscar?.token],
    queryFn: () =>
      api<Seguimiento>('/contacto/seguimiento', {
        consulta: { folio: buscar!.folio, token: buscar!.token },
      }),
    enabled: !!buscar,
    retry: false,
  });
  const s = consulta.data;
  return (
    <Pagina
      titulo="Seguimiento de tu mensaje"
      intro="Usa el enlace del correo de confirmación, o escribe tu folio y el código del enlace."
      nombre="NX/PUB-08-Seguimiento"
    >
      <div className="max-w-xl space-y-5">
        {!s && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setBuscar({ folio: folio.trim(), token: token.trim() });
            }}
          >
            <Campo etiqueta="Folio" ayuda="Por ejemplo NX-2026-000123.">
              <Entrada value={folio} onChange={(e) => setFolio(e.target.value)} />
            </Campo>
            <Campo
              etiqueta="Código de seguimiento"
              ayuda="Lo que va después de «token=» en el enlace del correo."
            >
              <Entrada
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
            </Campo>
            {consulta.isError && (
              <Banner tono="warn">
                {consulta.error instanceof ErrorApi && consulta.error.estado === 404
                  ? 'No encontramos un mensaje con esos datos. Revisa el folio y el código.'
                  : mensajeDeError(consulta.error)}
              </Banner>
            )}
            <Boton
              type="submit"
              variante="primario"
              icono={<Search className="size-4" />}
              cargando={consulta.isFetching}
              disabled={!folio.trim() || token.trim().length < 10}
            >
              Consultar
            </Boton>
          </form>
        )}
        {s && (
          <Tarjeta className="space-y-4 p-5" data-name="NX/PUB-08-Seguimiento-detalle">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm tabular">{s.folio}</span>
              <Insignia tono={TONO_ESTADO[s.estado]}>{NOMBRE_ESTADO_CONTACTO[s.estado]}</Insignia>
              <Insignia tono="neutro">{NOMBRE_TIPO_CONTACTO[s.tipo].nombre}</Insignia>
            </div>
            <h2 className="text-lg font-semibold">{s.asunto}</h2>
            <dl className="grid grid-cols-[8rem_1fr] gap-1 text-sm">
              <dt className="text-muted">Enviado</dt>
              <dd>{fechaLarga(s.creado_en)}</dd>
              <dt className="text-muted">Actualizado</dt>
              <dd>{fechaLarga(s.actualizado_en)}</dd>
            </dl>
            <div className="space-y-3 border-t border-line pt-3">
              <h3 className="text-sm font-semibold">Respuestas del equipo</h3>
              {s.respuestas.length === 0 ? (
                <p className="text-sm text-muted">
                  Aún no hay respuestas. Te avisaremos por correo.
                </p>
              ) : (
                s.respuestas.map((r) => (
                  <div key={r.creado_en} className="rounded-[10px] bg-surface p-3">
                    <p className="text-xs text-muted">{fechaLarga(r.creado_en)}</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{r.contenido}</p>
                  </div>
                ))
              )}
            </div>
          </Tarjeta>
        )}
      </div>
    </Pagina>
  );
}
