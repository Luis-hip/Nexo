import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  Lock,
  RefreshCw,
  WifiOff,
  X,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cx } from './cx';
import { Boton } from './basicos';

/** Plantilla de estado vacío: ilustración mínima, texto y acción. */
export function Vacio({
  icono,
  titulo,
  texto,
  accion,
  className,
  compacto,
  nivel = 'p',
}: {
  icono?: ReactNode;
  titulo: string;
  texto?: ReactNode;
  accion?: ReactNode;
  className?: string;
  compacto?: boolean;
  nivel?: 'p' | 'h1' | 'h2';
}) {
  const T = nivel;
  return (
    <div
      data-cmp="cmp/estados/vacio"
      className={cx(
        'flex flex-col items-center text-center',
        compacto ? 'gap-2 py-6' : 'gap-3 px-4 py-12',
        className,
      )}
    >
      <div
        className={cx('relative grid place-items-center', compacto ? 'size-12' : 'size-20')}
        aria-hidden
      >
        <svg viewBox="0 0 80 80" className="absolute inset-0 size-full text-line">
          <circle
            cx="40"
            cy="40"
            r="38"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />
          <circle cx="40" cy="40" r="26" fill="var(--bg-surface)" />
        </svg>
        <span className={cx('relative text-muted', compacto ? '[&>svg]:size-5' : '[&>svg]:size-7')}>
          {icono}
        </span>
      </div>
      <div className="max-w-sm">
        <T
          className={cx(
            'font-semibold',
            compacto ? 'text-sm' : nivel === 'h1' ? 'text-[22px]' : 'text-base',
          )}
        >
          {titulo}
        </T>
        {texto && <p className="mt-1 text-sm text-muted">{texto}</p>}
      </div>
      {accion && <div className="mt-1 flex flex-wrap justify-center gap-2">{accion}</div>}
    </div>
  );
}

export function Esqueleto({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cx('skeleton', className)} style={style} aria-hidden />;
}

export function EsqueletoLista({ filas = 5 }: { filas?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[12px] border border-line p-4">
          <Esqueleto className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Esqueleto className="h-3.5" style={{ width: `${60 - (i % 3) * 12}%` }} />
            <Esqueleto className="h-3 w-1/3" />
          </div>
          <Esqueleto className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoTarjetas({ n = 3 }: { n?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Cargando">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-[12px] border border-line p-5">
          <Esqueleto className="h-4 w-1/2" />
          <Esqueleto className="h-8 w-1/3" />
          <Esqueleto className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function ErrorEstado({
  titulo = 'No pudimos cargar esta sección',
  texto = 'Revisa tu conexión e inténtalo de nuevo.',
  onReintentar,
}: {
  titulo?: string;
  texto?: string;
  onReintentar?: () => void;
}) {
  return (
    <div
      data-cmp="cmp/estados/error"
      role="alert"
      className="flex flex-col items-center gap-3 rounded-[12px] border border-danger/30 bg-danger/5 px-4 py-10 text-center"
    >
      <AlertTriangle className="size-7 text-danger" aria-hidden />
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="mt-1 text-sm text-muted">{texto}</p>
      </div>
      {onReintentar && (
        <Boton icono={<RefreshCw className="size-4" />} onClick={onReintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}

export function SinPermisos({
  motivo,
  quien = 'al líder del equipo',
  salida = '/app',
  textoSalida = 'Volver al inicio',
  nivel = 'h1',
}: {
  motivo?: string;
  quien?: string;
  salida?: string;
  textoSalida?: string;
  nivel?: 'h1' | 'h2';
}) {
  const T = nivel;
  return (
    <div
      data-name="NX/GL-05-Sin-permisos"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <div className="grid size-16 place-items-center rounded-full bg-surface">
        <Lock className="size-7 text-muted" aria-hidden />
      </div>
      <div>
        <T className="text-[22px]">No tienes acceso a esta sección</T>
        <p className="mt-2 text-sm text-muted">
          {motivo ?? 'Tu rol en este espacio no incluye esta vista.'}
        </p>
        <p className="mt-1 text-sm text-muted">Si lo necesitas, pídelo {quien}.</p>
      </div>
      <Link
        to={salida}
        className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
      >
        {textoSalida}
      </Link>
    </div>
  );
}

/** Pantalla o bloque de «sin conexión» (GL-05). */
export function SinConexion({ onReintentar }: { onReintentar?: () => void }) {
  return (
    <div
      data-cmp="cmp/estados/sin-conexion"
      role="alert"
      className="flex flex-col items-center gap-3 rounded-[12px] border border-warn/40 bg-warn/10 px-4 py-10 text-center"
    >
      <WifiOff className="size-7 text-warn-text" aria-hidden />
      <div>
        <p className="font-semibold">Sin conexión</p>
        <p className="mt-1 text-sm text-muted">
          No pudimos comunicarnos con Nexo. Revisa tu internet e inténtalo de nuevo.
        </p>
      </div>
      {onReintentar && (
        <Boton icono={<RefreshCw className="size-4" />} onClick={onReintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}

/** Forma mínima de una consulta (compatible con el resultado de useQuery). */
export interface ConsultaDatos<T> {
  data: T | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * Los cinco estados de toda pantalla de datos (docs/01, 5.3): cargando, vacío, error,
 * sin permiso y sin conexión. Si hay datos, pinta el contenido con ellos.
 */
export function EstadosDatos<T>({
  consulta,
  esqueleto,
  vacio,
  estaVacio,
  children,
}: {
  consulta: ConsultaDatos<T>;
  esqueleto?: ReactNode;
  vacio?: ReactNode;
  estaVacio?: (datos: T) => boolean;
  children: (datos: T) => ReactNode;
}) {
  const { data, isPending, error, refetch } = consulta;
  if (data === undefined) {
    if (isPending) return <>{esqueleto ?? <EsqueletoLista />}</>;
    const err = error as { estado?: number; codigo?: string; message?: string } | null;
    if (err?.codigo === 'sin_conexion') return <SinConexion onReintentar={() => refetch()} />;
    if (err?.estado === 403) return <SinPermisos motivo={err.message} nivel="h2" />;
    return (
      <ErrorEstado
        texto={err?.estado && err.estado < 500 && err.message ? err.message : undefined}
        onReintentar={() => refetch()}
      />
    );
  }
  const sinDatos = estaVacio ? estaVacio(data) : Array.isArray(data) && data.length === 0;
  if (sinDatos && vacio) return <>{vacio}</>;
  return <>{children(data)}</>;
}

export function Banner({
  tono = 'info',
  icono,
  children,
  accion,
  onCerrar,
  className,
}: {
  tono?: 'info' | 'warn' | 'danger' | 'ok' | 'marca';
  icono?: ReactNode;
  children: ReactNode;
  accion?: ReactNode;
  onCerrar?: () => void;
  className?: string;
}) {
  const I =
    tono === 'danger'
      ? XCircle
      : tono === 'warn'
        ? AlertTriangle
        : tono === 'ok'
          ? CheckCircle2
          : Info;
  const cls = {
    info: 'border-info/30 bg-info/8 text-fg',
    warn: 'border-warn/40 bg-warn/10 text-fg',
    danger: 'border-danger/35 bg-danger/8 text-fg',
    ok: 'border-ok/35 bg-ok/8 text-fg',
    marca: 'border-brand/30 bg-brand/8 text-fg',
  }[tono];
  const ic = {
    info: 'text-info-text',
    warn: 'text-warn-text',
    danger: 'text-danger-text',
    ok: 'text-ok-text',
    marca: 'text-brand',
  }[tono];
  return (
    <div
      data-cmp="cmp/capas/banner"
      role={tono === 'danger' ? 'alert' : 'status'}
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-4 py-2.5 text-sm',
        cls,
        className,
      )}
    >
      <span className={cx('shrink-0 [&>svg]:size-5', ic)} aria-hidden>
        {icono ?? <I />}
      </span>
      <div className="min-w-0 flex-1 basis-48">{children}</div>
      {accion && <div className="flex flex-wrap gap-2">{accion}</div>}
      {onCerrar && (
        <button
          type="button"
          aria-label="Descartar"
          onClick={onCerrar}
          className="-mr-2 grid size-9 place-items-center rounded-[8px] text-muted hover:bg-surface"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
