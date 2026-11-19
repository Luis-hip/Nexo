import type { TareaEquipo } from '@nexo/shared';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { AreaTexto, Boton, Campo, InsigniaSemaforo, Modal, Radios } from '@/components/ui';
import { useAccionesTarea } from '@/lib/consultasEquipo';
import { PRIORIDADES } from '@/lib/tareas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { avisarError, codigoTarea } from './comunes';

const MOTIVOS = [
  'Sobrecarga: ya tengo varias tareas en curso',
  'No tengo las habilidades necesarias',
  'La fecha no es realista',
  'Otro motivo',
] as const;

/** EQ-08: aceptar o rechazar una tarea asignada (el rechazo exige motivo). */
export function AsignacionModal({
  tarea: t,
  rechazar = false,
  onCerrar,
}: {
  tarea: TareaEquipo;
  /** Abre directamente en el paso de rechazo. */
  rechazar?: boolean;
  onCerrar: () => void;
}) {
  const { equipo, usuarioId } = useEquipoActual();
  const { responder } = useAccionesTarea(equipo.id);
  const [modo, setModo] = useState<'ver' | 'rechazar'>(rechazar ? 'rechazar' : 'ver');
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number]>(MOTIVOS[0]);
  const [detalle, setDetalle] = useState('');
  const [error, setError] = useState('');
  const pendiente = t.asignacion_pendiente && t.responsable?.usuario_id === usuarioId;

  const aceptar = () =>
    responder.mutate(
      { id: t.id, acepta: true },
      {
        onSuccess: () => {
          toast(`Aceptaste «${t.titulo}».`);
          onCerrar();
        },
        onError: avisarError,
      },
    );
  const enviarRechazo = () => {
    const extra = detalle.trim();
    const texto = motivo === 'Otro motivo' ? extra : `${motivo}${extra ? `. ${extra}` : ''}`;
    if (!texto) {
      setError('Explica el motivo del rechazo.');
      return;
    }
    responder.mutate(
      { id: t.id, acepta: false, motivo: texto },
      {
        onSuccess: () => {
          toast('Rechazaste la asignación. El líder la reasignará.', 'info');
          onCerrar();
        },
        onError: avisarError,
      },
    );
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      nombre="NX/EQ-08-Aceptar-rechazar-asignacion"
      titulo={modo === 'ver' ? 'Tarea asignada' : 'Rechazar asignación'}
      descripcion={
        modo === 'ver'
          ? `${codigoTarea(t.codigo)} · asignada en ${equipo.nombre}`
          : 'La tarea queda sin responsable para que el líder la reasigne; no vuelve a votarse.'
      }
      ancho="sm"
      pie={
        !pendiente ? (
          <Boton onClick={onCerrar}>Cerrar</Boton>
        ) : modo === 'ver' ? (
          <>
            <Boton icono={<X className="size-4" />} onClick={() => setModo('rechazar')}>
              Rechazar
            </Boton>
            <Boton
              variante="primario"
              icono={<Check className="size-4" />}
              onClick={aceptar}
              cargando={responder.isPending}
            >
              Aceptar tarea
            </Boton>
          </>
        ) : (
          <>
            <Boton onClick={() => (rechazar ? onCerrar() : setModo('ver'))}>Volver</Boton>
            <Boton variante="destructivo" onClick={enviarRechazo} cargando={responder.isPending}>
              Rechazar asignación
            </Boton>
          </>
        )
      }
    >
      {modo === 'ver' ? (
        <div className="space-y-3">
          <p className="text-lg font-semibold">{t.titulo}</p>
          {t.descripcion && <p className="text-sm text-muted">{t.descripcion}</p>}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Entrega</dt>
              <dd className="mt-1">
                <InsigniaSemaforo tarea={t} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Prioridad</dt>
              <dd className="mt-1 font-medium">{PRIORIDADES[t.prioridad]}</dd>
            </div>
          </dl>
          {!pendiente && (
            <p className="rounded-[8px] bg-surface p-3 text-sm text-muted">
              Esta asignación ya fue respondida.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Radios
            nombre="motivo"
            etiqueta="Motivo"
            valor={motivo}
            onChange={(x) => {
              setMotivo(x);
              setError('');
            }}
            opciones={MOTIVOS.map((m) => ({ valor: m, etiqueta: m }))}
          />
          <Campo
            etiqueta={motivo === 'Otro motivo' ? 'Describe el motivo' : 'Detalle'}
            opcional={motivo !== 'Otro motivo'}
            error={error}
          >
            <AreaTexto
              value={detalle}
              onChange={(e) => {
                setDetalle(e.target.value);
                setError('');
              }}
              rows={2}
              maxLength={300}
            />
          </Campo>
        </div>
      )}
    </Modal>
  );
}
