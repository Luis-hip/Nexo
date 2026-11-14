import type { EstadoTarea } from '@nexo/shared';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  Crown,
  Eye,
  Inbox,
  User,
  XCircle,
} from 'lucide-react';
import { useTema } from '@/lib/apariencia';
import { colorDeIntegrante, textoSobreIntegrante } from '@/lib/color';
import {
  formaDeEstado,
  NOMBRE_ESTADO,
  NOMBRE_FORMA,
  semaforo,
  type Forma,
  type Nivel,
  type TareaConPlazo,
} from '@/lib/tareas';
import { Insignia, type Tono } from './basicos';
import { cx } from './cx';

/** Persona a mostrar: nombre, índice de color (color_idx de su membresía) y avatar opcional. */
export interface Persona {
  nombre: string;
  colorIdx?: number | null;
  avatarUrl?: string | null;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

/** Color del integrante, siempre derivado de colorDeIntegrante (docs/01, 5.4). */
export function useColorDe() {
  const tema = useTema();
  return (colorIdx?: number | null) => {
    const i = colorIdx ?? 0;
    return { color: colorDeIntegrante(i, tema), texto: textoSobreIntegrante(i, tema) };
  };
}

export function Avatar({
  persona,
  tamano = 36,
  className,
  enLinea,
  conAnillo = true,
}: {
  persona?: Persona;
  tamano?: number;
  className?: string;
  enLinea?: boolean;
  conAnillo?: boolean;
}) {
  const colorDe = useColorDe();
  const { color, texto } = colorDe(persona?.colorIdx);
  const n = persona?.nombre ?? 'Sin asignar';
  return (
    <span
      data-cmp="cmp/identidad/avatar"
      className={cx('relative inline-grid shrink-0 place-items-center rounded-full', className)}
      style={{ width: tamano, height: tamano }}
      title={n}
    >
      {persona ? (
        persona.avatarUrl ? (
          <img
            src={persona.avatarUrl}
            alt=""
            className="size-full rounded-full object-cover"
            style={
              conAnillo
                ? { boxShadow: `0 0 0 2px var(--bg-canvas), 0 0 0 4px ${color}` }
                : undefined
            }
          />
        ) : (
          <span
            className="grid size-full place-items-center rounded-full font-semibold"
            style={{
              background: color,
              color: texto,
              fontSize: tamano * 0.38,
              boxShadow: conAnillo ? `0 0 0 2px var(--bg-canvas), 0 0 0 3.5px ${color}` : undefined,
            }}
          >
            {iniciales(n)}
          </span>
        )
      ) : (
        <span className="grid size-full place-items-center rounded-full border-2 border-dashed border-line-strong text-muted">
          <User style={{ width: tamano * 0.5, height: tamano * 0.5 }} aria-hidden />
        </span>
      )}
      <span className="sr-only">{n}</span>
      {enLinea !== undefined && (
        <span
          className={cx(
            'absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-canvas',
            enLinea ? 'bg-ok' : 'bg-line-strong',
          )}
          aria-label={enLinea ? 'En línea' : 'Desconectado'}
        />
      )}
    </span>
  );
}

export function PilaAvatares({
  personas,
  max = 4,
  tamano = 28,
}: {
  personas: Persona[];
  max?: number;
  tamano?: number;
}) {
  const vis = personas.slice(0, max);
  return (
    <span
      data-cmp="cmp/identidad/pila-avatares"
      className="inline-flex items-center"
      aria-label={personas.map((p) => p.nombre).join(', ')}
    >
      {vis.map((p, i) => (
        <span key={`${p.nombre}-${i}`} className={i ? '-ml-2' : ''}>
          <Avatar persona={p} tamano={tamano} conAnillo={false} className="ring-2 ring-canvas" />
        </span>
      ))}
      {personas.length > max && (
        <span
          className="-ml-2 grid place-items-center rounded-full bg-surface text-xs font-medium text-muted ring-2 ring-canvas tabular"
          style={{ width: tamano, height: tamano }}
        >
          +{personas.length - max}
        </span>
      )}
    </span>
  );
}

export function ChipIntegrante({
  persona,
  forma = 'circulo',
  activo,
  onClick,
}: {
  persona: Persona;
  forma?: Forma;
  activo?: boolean;
  onClick?: () => void;
}) {
  const colorDe = useColorDe();
  const { color } = colorDe(persona.colorIdx);
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? activo : undefined}
      data-cmp="cmp/identidad/chip-integrante"
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border pr-3 pl-2 text-sm whitespace-nowrap transition-colors',
        activo === false ? 'border-line text-muted opacity-60' : 'border-line bg-raised text-fg',
        onClick && 'hover:bg-surface',
      )}
    >
      <FormaSvg forma={forma} color={color} tamano={14} />
      {persona.nombre.split(' ')[0]}
    </Tag>
  );
}

type Rol = 'lider' | 'integrante' | 'invitado' | 'personal';
const ROL: Record<Rol, { t: string; tono: Tono; i: typeof Crown }> = {
  lider: { t: 'Líder', tono: 'marca', i: Crown },
  integrante: { t: 'Integrante', tono: 'neutro', i: User },
  invitado: { t: 'Invitado', tono: 'info', i: Eye },
  personal: { t: 'Personal', tono: 'neutro', i: User },
};
export function InsigniaRol({ rol }: { rol: Rol }) {
  const r = ROL[rol];
  return (
    <Insignia tono={r.tono} icono={<r.i className="size-3.5" aria-hidden />}>
      {r.t}
    </Insignia>
  );
}

export const COLOR_NIVEL: Record<Nivel, string> = {
  ok: 'var(--signal-ok)',
  warn: 'var(--signal-warn)',
  danger: 'var(--signal-danger)',
  info: 'var(--signal-info)',
};

/** Figura de estado: triángulo, círculo o cuadrado; anillo de semáforo opcional. */
export function FormaSvg({
  forma,
  color,
  tamano = 16,
  anillo,
  inicial,
  titulo,
}: {
  forma: Forma;
  color: string;
  tamano?: number;
  anillo?: Nivel;
  inicial?: string;
  titulo?: string;
}) {
  const s = tamano;
  const pad = anillo ? 4 : 0;
  const vb = 24 + pad * 2;
  return (
    <svg
      width={s + (anillo ? s * 0.34 : 0)}
      height={s + (anillo ? s * 0.34 : 0)}
      viewBox={`${-pad} ${-pad} ${vb} ${vb}`}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      className="shrink-0"
      data-cmp={`cmp/identidad/forma-${forma}`}
    >
      {anillo && (
        <FormaPath
          forma={forma}
          escala={1.32}
          fill="none"
          stroke={COLOR_NIVEL[anillo]}
          strokeWidth={2.6}
        />
      )}
      <FormaPath forma={forma} fill={color} stroke="var(--bg-canvas)" strokeWidth={1.5} />
      {inicial && (
        <text
          x="12"
          y={forma === 'triangulo' ? 17 : 16}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="var(--bg-canvas)"
        >
          {inicial}
        </text>
      )}
    </svg>
  );
}

function FormaPath({
  forma,
  escala = 1,
  ...r
}: { forma: Forma; escala?: number } & React.SVGProps<SVGPathElement>) {
  const t = `translate(12 12) scale(${escala}) translate(-12 -12)`;
  if (forma === 'circulo')
    return (
      <circle cx="12" cy="12" r="10" transform={t} {...(r as React.SVGProps<SVGCircleElement>)} />
    );
  if (forma === 'cuadrado')
    return (
      <rect
        x="2.5"
        y="2.5"
        width="19"
        height="19"
        rx="3"
        transform={t}
        {...(r as React.SVGProps<SVGRectElement>)}
      />
    );
  return (
    <path
      d="M12 2.2 22.5 20.8a.9.9 0 0 1-.8 1.3H2.3a.9.9 0 0 1-.8-1.3Z"
      transform={t}
      strokeLinejoin="round"
      {...r}
    />
  );
}

const ICONO_ESTADO: Record<EstadoTarea, typeof Clock> = {
  propuesta: Inbox,
  backlog: Archive,
  aceptada: CircleDashed,
  habilitada: CircleDot,
  en_curso: CircleDot,
  atascada: AlertTriangle,
  completada: CheckCircle2,
  rechazada: XCircle,
};

/** Insignia de estado con icono + texto (nunca solo color). */
export function InsigniaEstado({ estado, nombre }: { estado: EstadoTarea; nombre?: string }) {
  const tono: Tono =
    estado === 'atascada'
      ? 'danger'
      : estado === 'completada'
        ? 'ok'
        : estado === 'propuesta'
          ? 'info'
          : estado === 'en_curso'
            ? 'marca'
            : 'neutro';
  const I = ICONO_ESTADO[estado];
  return (
    <Insignia tono={tono} icono={<I className="size-3.5" aria-hidden />}>
      {nombre ?? NOMBRE_ESTADO[estado]}
    </Insignia>
  );
}

export function InsigniaFormaEstado({ estado, color }: { estado: EstadoTarea; color: string }) {
  const f = formaDeEstado(estado);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <FormaSvg forma={f} color={color} tamano={12} />
      {NOMBRE_FORMA[f]}
    </span>
  );
}

const ICONO_NIVEL: Record<Nivel, typeof Clock> = {
  ok: CheckCircle2,
  warn: Clock,
  danger: AlertTriangle,
  info: Clock,
};

export function InsigniaSemaforo({
  tarea,
  conFecha = true,
}: {
  tarea: TareaConPlazo;
  conFecha?: boolean;
}) {
  const sem = semaforo(tarea);
  if (!sem) return conFecha ? <span className="text-xs text-muted">Sin fecha</span> : null;
  const I = ICONO_NIVEL[sem.nivel];
  const fecha =
    tarea.vence_en && tarea.estado !== 'completada'
      ? new Date(tarea.vence_en)
          .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          .replace('.', '')
      : '';
  return (
    <Insignia tono={sem.nivel} icono={<I className="size-3.5" aria-hidden />}>
      <span className="tabular">
        {sem.texto}
        {conFecha && fecha && sem.nivel === 'ok' ? ` · ${fecha}` : ''}
      </span>
    </Insignia>
  );
}

export function Semaforo({ nivel, children }: { nivel: Nivel; children: React.ReactNode }) {
  const I = ICONO_NIVEL[nivel];
  return (
    <Insignia tono={nivel} icono={<I className="size-3.5" aria-hidden />}>
      {children}
    </Insignia>
  );
}
