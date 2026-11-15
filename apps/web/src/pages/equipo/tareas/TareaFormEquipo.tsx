import {
  esquemaCrearTareaEquipo,
  type PrioridadTarea,
  type TareaEquipoDetalle,
} from '@nexo/shared';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { AreaTexto, Banner, Boton, Campo, Entrada, Modal, Selector } from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesTarea } from '@/lib/consultasEquipo';
import { aInputFecha, deInputFecha } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { EditorEtiquetas } from '@/pages/personal/EditorEtiquetas';
import { useEquipoActual } from '../contexto';
import { codigoTarea } from './comunes';

interface Valores {
  titulo: string;
  descripcion: string;
  vence: string;
  prioridad: PrioridadTarea;
  etiquetas: string[];
  responsableId: string;
  destino: 'tablero' | 'backlog';
}

/**
 * EQ-07: crear, proponer o editar una tarea del equipo. El líder crea directamente (elige
 * responsable y si va al tablero o al backlog); el integrante crea una **propuesta** que
 * va a triaje.
 */
export function TareaFormEquipo({
  abierto,
  onCerrar,
  editar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  editar?: TareaEquipoDetalle;
}) {
  const { equipo, usuarioId } = useEquipoActual();
  const acciones = useAccionesTarea(equipo.id);
  const esLider = equipo.mi_rol === 'lider';
  const propuesta = !esLider && !editar;
  const sprintActivo = equipo.sprints.find((s) => s.estado === 'activo');
  const inicial: Valores = {
    titulo: editar?.titulo ?? '',
    descripcion: editar?.descripcion ?? '',
    vence: aInputFecha(editar?.vence_en ?? undefined),
    prioridad: editar?.prioridad ?? 'media',
    etiquetas: editar?.etiquetas ?? [],
    responsableId: '',
    destino: 'tablero',
  };
  const [v, setV] = useState(inicial);
  const [errores, setErrores] = useState<Partial<Record<keyof Valores, string>>>({});
  const [otra, setOtra] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const guardando = acciones.crear.isPending || acciones.editar.isPending;

  const set = <K extends keyof Valores>(k: K, val: Valores[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrorGuardar('');
  };

  /** Misma validación (Zod) que el servidor; devuelve los datos o `null`. */
  const validar = () => {
    const e: Partial<Record<keyof Valores, string>> = {};
    const venceIso = v.vence ? deInputFecha(v.vence) : undefined;
    const r = esquemaCrearTareaEquipo.safeParse({
      titulo: v.titulo,
      descripcion: v.descripcion.trim(),
      prioridad: v.prioridad,
      vence_en: venceIso ?? null,
      etiquetas: v.etiquetas,
      responsable_id: v.responsableId || null,
      destino: v.destino,
    });
    if (!r.success) {
      for (const i of r.error.issues) {
        const campo = i.path[0] === 'vence_en' ? 'vence' : (i.path[0] as keyof Valores);
        e[campo] ??= i.message;
      }
    }
    if (!editar && venceIso && new Date(venceIso).getTime() < Date.now() - 86_400_000) {
      e.vence = 'La fecha de entrega no puede estar en el pasado.';
    }
    setErrores(e);
    const primero = Object.keys(e)[0];
    if (primero) {
      document.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus();
      return null;
    }
    return r.data ?? null;
  };

  const guardar = () => {
    const datos = validar();
    if (!datos || guardando) return;
    const alFallar = (e: unknown) => setErrorGuardar(mensajeDeError(e));
    if (editar) {
      acciones.editar.mutate(
        {
          id: editar.id,
          version: editar.version,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          prioridad: datos.prioridad,
          vence_en: datos.vence_en,
          etiquetas: datos.etiquetas,
        },
        {
          onSuccess: () => {
            toast('Cambios guardados.');
            onCerrar();
          },
          onError: alFallar,
        },
      );
      return;
    }
    acciones.crear.mutate(datos, {
      onSuccess: (t) => {
        toast(
          propuesta
            ? `Propuesta ${codigoTarea(t.codigo)} enviada a triaje.`
            : `Tarea ${codigoTarea(t.codigo)} creada.`,
        );
        if (otra) {
          setV({ ...inicial, destino: v.destino, prioridad: v.prioridad });
          setTimeout(
            () => document.querySelector<HTMLElement>('[data-campo="titulo"]')?.focus(),
            20,
          );
        } else onCerrar();
      },
      onError: alFallar,
    });
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      nombre="NX/EQ-07-Crear-tarea"
      movil="completa"
      titulo={
        editar
          ? `Editar ${codigoTarea(editar.codigo)}`
          : propuesta
            ? 'Proponer tarea'
            : 'Nueva tarea'
      }
      descripcion={
        propuesta
          ? 'Tu propuesta irá a triaje; el líder decide si entra al tablero.'
          : `Equipo: ${equipo.nombre}`
      }
      pie={
        <>
          {!editar && (
            <label className="mr-auto flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={otra}
                onChange={(e) => setOtra(e.target.checked)}
                className="size-5 accent-[var(--brand-primary)]"
              />
              Crear y agregar otra
            </label>
          )}
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            cargando={guardando}
            icono={propuesta ? <Inbox className="size-4" /> : undefined}
          >
            {editar ? 'Guardar cambios' : propuesta ? 'Enviar propuesta' : 'Crear tarea'}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        className="space-y-4"
        noValidate
      >
        {errorGuardar && (
          <Banner
            tono="danger"
            accion={
              <Boton tamano="sm" onClick={guardar}>
                Reintentar
              </Boton>
            }
          >
            No se pudo guardar. {errorGuardar}
          </Banner>
        )}
        <Campo
          etiqueta="Título"
          error={errores.titulo}
          contador={<span className="text-xs text-muted tabular">{v.titulo.length}/140</span>}
        >
          <Entrada
            data-campo="titulo"
            value={v.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            onBlur={() => v.titulo && validar()}
            placeholder="Por ejemplo: Revisar el flujo de notificaciones"
            maxLength={140}
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Descripción" opcional error={errores.descripcion}>
          <AreaTexto
            data-campo="descripcion"
            value={v.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            placeholder="Contexto, criterios de aceptación o enlaces"
          />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          {esLider && !editar && (
            <Campo
              etiqueta="Responsable"
              opcional
              ayuda={
                v.responsableId && v.responsableId !== usuarioId
                  ? 'Deberá aceptar la asignación.'
                  : undefined
              }
            >
              <Selector
                data-campo="responsableId"
                value={v.responsableId}
                onChange={(e) => set('responsableId', e.target.value)}
              >
                <option value="">Sin asignar</option>
                {equipo.miembros
                  .filter((m) => m.rol !== 'invitado')
                  .map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.nombre}
                    </option>
                  ))}
              </Selector>
            </Campo>
          )}
          <Campo etiqueta="Fecha de entrega" opcional error={errores.vence}>
            <Entrada
              data-campo="vence"
              type="date"
              value={v.vence}
              onChange={(e) => set('vence', e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Prioridad">
            <Selector
              data-campo="prioridad"
              value={v.prioridad}
              onChange={(e) => set('prioridad', e.target.value as PrioridadTarea)}
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </Selector>
          </Campo>
          {esLider && !editar && (
            <Campo etiqueta="Destino">
              <Selector
                data-campo="destino"
                value={v.destino}
                onChange={(e) => set('destino', e.target.value as Valores['destino'])}
              >
                <option value="tablero">
                  {sprintActivo ? `Tablero (Sprint ${sprintActivo.numero})` : 'Tablero'}
                </option>
                <option value="backlog">Backlog</option>
              </Selector>
            </Campo>
          )}
        </div>
        <EditorEtiquetas
          valor={v.etiquetas}
          onChange={(x) => set('etiquetas', x)}
          sugeridas={equipo.etiquetas}
          error={errores.etiquetas}
        />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
