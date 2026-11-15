import {
  comprobarTransicion,
  transicionesValidas,
  type EstadoTarea,
  type TareaEquipo,
} from '@nexo/shared';
import { ArrowRightLeft, CheckSquare, GripVertical, MessageSquare } from 'lucide-react';
import { useAcciones } from '@/components/shell/contexto';
import {
  Avatar,
  FormaSvg,
  InsigniaSemaforo,
  Menu,
  cx,
  useColorDe,
  useConfirmar,
  type ItemMenu,
} from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import { useAccionesTarea } from '@/lib/consultasEquipo';
import { COLUMNAS_TABLERO, formaDeEstado, NOMBRE_ESTADO } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';

export const codigoTarea = (codigo: number) => `T-${String(codigo).padStart(2, '0')}`;

/** Avisa de un error de una acción; un 409 se explica como «alguien cambió esta tarea». */
export function avisarError(e: unknown) {
  toast(
    e instanceof ErrorApi && e.estado === 409
      ? 'Alguien cambió esta tarea. Te mostramos la versión más reciente.'
      : mensajeDeError(e),
    'danger',
  );
}

const paraTransicion = (t: TareaEquipo) => ({
  estado: t.estado,
  responsable_id: t.responsable?.usuario_id ?? null,
  asignacion_pendiente: t.asignacion_pendiente,
});

/** Transiciones que la persona puede hacer sobre la tarea (la misma regla que aplica el servidor). */
export function useTransiciones() {
  const { equipo, usuarioId } = useEquipoActual();
  return {
    validas: (t: TareaEquipo) => transicionesValidas(paraTransicion(t), equipo.mi_rol, usuarioId),
    motivo: (t: TareaEquipo, destino: EstadoTarea) => {
      const r = comprobarTransicion(paraTransicion(t), destino, equipo.mi_rol, usuarioId);
      return r.valida ? undefined : r.motivo;
    },
  };
}

/** Cambia el estado respetando las transiciones; pide el motivo para «Atascada». */
export function useCambiarEstado() {
  const { equipo } = useEquipoActual();
  const { estado } = useAccionesTarea(equipo.id);
  const { motivo: motivoDe } = useTransiciones();
  const confirmar = useConfirmar();
  return async (t: TareaEquipo, destino: EstadoTarea) => {
    const invalida = motivoDe(t, destino);
    if (invalida) {
      toast(invalida, 'warn');
      return false;
    }
    let motivo: string | undefined;
    if (destino === 'atascada') {
      const r = await confirmar({
        titulo: `Marcar «${t.titulo}» como atascada`,
        mensaje: 'Explica brevemente qué la bloquea. El equipo y el líder lo verán.',
        confirmar: 'Marcar como atascada',
        conMotivo: { etiqueta: 'Motivo del bloqueo' },
      });
      if (!r) return false;
      motivo = r.motivo;
    }
    estado.mutate(
      { id: t.id, version: t.version, estado: destino, motivo },
      {
        onSuccess: () => toast(`«${t.titulo}» pasó a ${NOMBRE_ESTADO[destino]}.`),
        onError: avisarError,
      },
    );
    return true;
  };
}

/** Opciones «Mover a…» del menú de una tarjeta: las no permitidas explican por qué. */
export function useItemsMoverA() {
  const { validas, motivo } = useTransiciones();
  const cambiar = useCambiarEstado();
  return (t: TareaEquipo): ItemMenu[] => {
    const ok = validas(t);
    return COLUMNAS_TABLERO.filter((c) => c.estado !== t.estado).map((c) => ({
      etiqueta: `Mover a ${c.nombre}`,
      icono: <ArrowRightLeft />,
      deshabilitado: !ok.includes(c.estado),
      motivo: ok.includes(c.estado) ? undefined : motivo(t, c.estado),
      onClick: () => void cambiar(t, c.estado),
    }));
  };
}

/** Tarjeta de tarea del tablero: responsable, plazo y semáforo; estado con forma y texto. */
export function TarjetaTarea({
  t,
  compacta,
  asa,
}: {
  t: TareaEquipo;
  compacta?: boolean;
  /** Atributos del asa de arrastre (dnd-kit), si la tarjeta se puede arrastrar. */
  asa?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const acc = useAcciones();
  const colorDe = useColorDe();
  const itemsMoverA = useItemsMoverA();
  const { color } = colorDe(t.responsable?.color_idx);
  const codigo = codigoTarea(t.codigo);
  return (
    <article
      data-cmp="cmp/datos/tarjeta-tarea"
      className={cx(
        'group relative rounded-[12px] border border-line bg-raised shadow-soft transition-shadow hover:border-line-strong/60',
        compacta ? 'p-3' : 'p-3.5',
      )}
    >
      <div className="flex items-start gap-2">
        {asa && (
          <button
            type="button"
            {...asa}
            aria-label={`Arrastrar ${codigo} ${t.titulo}`}
            className="relative z-[1] -ml-1 hidden h-6 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted/60 hover:text-fg active:cursor-grabbing sm:grid"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        <span className="mt-0.5">
          <FormaSvg
            forma={formaDeEstado(t.estado)}
            color={color}
            tamano={14}
            titulo={`Estado: ${NOMBRE_ESTADO[t.estado]}`}
          />
        </span>
        <button
          type="button"
          onClick={() => acc.abrirTarea(t.id)}
          className="min-w-0 flex-1 text-left after:absolute after:inset-0 after:rounded-[12px] after:content-['']"
        >
          <span className="block text-xs text-muted tabular">{codigo}</span>
          <span className="line-clamp-2 text-sm leading-snug font-medium">{t.titulo}</span>
        </button>
        <div className="relative z-[1] -mt-1 -mr-1">
          <Menu
            etiqueta={`Acciones de ${codigo}`}
            items={[
              { etiqueta: 'Abrir detalle', onClick: () => acc.abrirTarea(t.id) },
              { separador: true, etiqueta: '' },
              ...itemsMoverA(t),
            ]}
          />
        </div>
      </div>
      {t.estado === 'atascada' && t.motivo && !compacta && (
        <p className="mt-2 line-clamp-2 rounded-[8px] bg-danger/8 px-2 py-1 text-xs text-danger-text">
          {t.motivo}
        </p>
      )}
      {t.asignacion_pendiente && (
        <p className="mt-2 text-xs font-medium text-warn-text">Pendiente de aceptación</p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <InsigniaSemaforo tarea={t} />
        <span className="ml-auto flex items-center gap-2.5 text-xs text-muted tabular">
          {t.subtareas_total > 0 && (
            <span
              className="flex items-center gap-1"
              aria-label={`${t.subtareas_hechas} de ${t.subtareas_total} subtareas`}
            >
              <CheckSquare className="size-3.5" aria-hidden />
              {t.subtareas_hechas}/{t.subtareas_total}
            </span>
          )}
          {t.comentarios_total > 0 && (
            <span
              className="flex items-center gap-1"
              aria-label={`${t.comentarios_total} comentarios`}
            >
              <MessageSquare className="size-3.5" aria-hidden />
              {t.comentarios_total}
            </span>
          )}
          <Avatar
            persona={
              t.responsable
                ? { nombre: t.responsable.nombre, colorIdx: t.responsable.color_idx }
                : undefined
            }
            tamano={24}
          />
        </span>
      </div>
    </article>
  );
}
