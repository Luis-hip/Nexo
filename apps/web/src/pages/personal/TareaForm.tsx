import {
  esquemaCrearTareaPersonal,
  type PrioridadTarea,
  type TareaPersonalDetalle,
} from '@nexo/shared';
import { useState } from 'react';
import { AreaTexto, Banner, Boton, Campo, Entrada, Modal, Selector } from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useActualizarTarea, useCrearTarea, useEtiquetas } from '@/lib/consultas';
import { aInputFecha, deInputFecha } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { EditorEtiquetas } from './EditorEtiquetas';

interface Valores {
  titulo: string;
  descripcion: string;
  vence: string;
  prioridad: PrioridadTarea;
  etiquetas: string[];
}

const VACIO: Valores = {
  titulo: '',
  descripcion: '',
  vence: '',
  prioridad: 'media',
  etiquetas: [],
};

/** EQ-07 en el espacio personal: crear o editar una tarea propia. */
export function TareaForm({
  abierto,
  onCerrar,
  editar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  editar?: TareaPersonalDetalle;
}) {
  const crear = useCrearTarea();
  const actualizar = useActualizarTarea();
  const { data: sugeridas = [] } = useEtiquetas();
  const [v, setV] = useState<Valores>(() =>
    editar
      ? {
          titulo: editar.titulo,
          descripcion: editar.descripcion,
          vence: aInputFecha(editar.vence_en ?? undefined),
          prioridad: editar.prioridad,
          etiquetas: editar.etiquetas,
        }
      : VACIO,
  );
  const [errores, setErrores] = useState<Partial<Record<keyof Valores, string>>>({});
  const [otra, setOtra] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const guardando = crear.isPending || actualizar.isPending;

  const set = <K extends keyof Valores>(k: K, val: Valores[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrorGuardar('');
  };

  /** Valida con el mismo esquema Zod que el servidor; devuelve los datos o `null`. */
  const validar = () => {
    const e: Partial<Record<keyof Valores, string>> = {};
    const venceIso = v.vence ? deInputFecha(v.vence) : undefined;
    const r = esquemaCrearTareaPersonal.safeParse({
      titulo: v.titulo,
      descripcion: v.descripcion.trim(),
      prioridad: v.prioridad,
      vence_en: venceIso ?? null,
      etiquetas: v.etiquetas,
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
      actualizar.mutate(
        { id: editar.id, version: editar.version, ...datos },
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
    crear.mutate(datos, {
      onSuccess: (t) => {
        toast(`Tarea T-${String(t.codigo).padStart(2, '0')} creada.`);
        if (otra) {
          setV({ ...VACIO, prioridad: v.prioridad, vence: v.vence, etiquetas: v.etiquetas });
          setTimeout(
            () => document.querySelector<HTMLElement>(`[data-campo="titulo"]`)?.focus(),
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
      titulo={editar ? 'Editar tarea' : 'Nueva tarea'}
      descripcion="Se guardará en tu Espacio personal."
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
          <Boton variante="primario" onClick={guardar} cargando={guardando}>
            {editar ? 'Guardar cambios' : 'Crear tarea'}
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
        </div>
        <EditorEtiquetas
          valor={v.etiquetas}
          onChange={(x) => set('etiquetas', x)}
          sugeridas={sugeridas}
          error={errores.etiquetas}
        />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
