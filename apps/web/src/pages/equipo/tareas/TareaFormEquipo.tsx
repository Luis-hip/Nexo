import {
  esquemaCrearTareaEquipo,
  type ModoCrearTarea,
  type PrioridadTarea,
  type TareaEquipoDetalle,
} from '@nexo/shared';
import { Inbox, Plus, UserCheck, X } from 'lucide-react';
import { useState } from 'react';
import {
  AreaTexto,
  Banner,
  Boton,
  Campo,
  Entrada,
  Modal,
  Segmentado,
  Selector,
} from '@/components/ui';
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
  subtareas: string[];
}

const MAX_SUBTAREAS = 30;

/**
 * EQ-07: el **líder** crea una tarea junto con sus subtareas, de dos formas (DEC-040):
 * - **Asignar tarea** (la principal): nace aceptada, con responsable y, si hay sprint activo,
 *   dentro de él, como si se hubiera planeado al inicio. No se vota.
 * - **Proponer a votación** (la secundaria): los integrantes deciden si se acepta (DEC-024).
 * El mismo formulario sirve para editar una tarea y para **reformular** una propuesta rechazada o
 * retirada (nace una propuesta nueva, que siempre vuelve a votación).
 */
export function TareaFormEquipo({
  abierto,
  onCerrar,
  editar,
  reformular,
  modoInicial = 'asignar',
}: {
  abierto: boolean;
  onCerrar: () => void;
  editar?: TareaEquipoDetalle;
  /** Propuesta rechazada por votación o retirada que se vuelve a proponer. */
  reformular?: TareaEquipoDetalle;
  /** Con qué forma abre al crear; el líder puede cambiarla en el formulario. */
  modoInicial?: ModoCrearTarea;
}) {
  const { equipo, usuarioId } = useEquipoActual();
  const acciones = useAccionesTarea(equipo.id);
  const origen = editar ?? reformular;
  const proponiendo = !editar;
  const [modo, setModo] = useState<ModoCrearTarea>(reformular ? 'votacion' : modoInicial);
  /** Crear con la opción de elegir la forma (no al editar ni al reformular). */
  const eligeModo = proponiendo && !reformular;
  const asignando = eligeModo && modo === 'asignar';
  const sprintActivo = equipo.sprints.find((s) => s.estado === 'activo');
  const integrantes = equipo.miembros.filter((m) => m.rol === 'integrante').length;
  const inicial: Valores = {
    titulo: origen?.titulo ?? '',
    descripcion: origen?.descripcion ?? '',
    vence: aInputFecha(origen?.vence_en ?? undefined),
    prioridad: origen?.prioridad ?? 'media',
    etiquetas: origen?.etiquetas ?? [],
    responsableId: '',
    subtareas: reformular?.subtareas.map((s) => s.titulo) ?? [],
  };
  const [v, setV] = useState(inicial);
  const [nuevaSub, setNuevaSub] = useState('');
  const [errores, setErrores] = useState<Partial<Record<keyof Valores, string>>>({});
  const [otra, setOtra] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const guardando =
    acciones.crear.isPending || acciones.editar.isPending || acciones.reformular.isPending;

  const set = <K extends keyof Valores>(k: K, val: Valores[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setErrorGuardar('');
  };

  const agregarSubtarea = () => {
    const titulo = nuevaSub.trim();
    if (!titulo || v.subtareas.length >= MAX_SUBTAREAS) return;
    set('subtareas', [...v.subtareas, titulo]);
    setNuevaSub('');
  };

  /**
   * Misma validación (Zod) que el servidor; devuelve los datos o `null`. Con `soloTitulo` (al salir
   * del título) solo marca el título y no mueve el foco: el responsable obligatorio de «Asignar
   * tarea» no debe aparecer en error ni robar el foco antes de que la persona llegue a él.
   */
  const validar = (soloTitulo = false) => {
    const e: Partial<Record<keyof Valores, string>> = {};
    const venceIso = v.vence ? deInputFecha(v.vence) : undefined;
    // Lo que quedó escrito sin pulsar «Agregar» también cuenta como subtarea.
    const subtareas = [...v.subtareas, nuevaSub].map((s) => s.trim()).filter(Boolean);
    const r = esquemaCrearTareaEquipo.safeParse({
      modo: asignando ? 'asignar' : 'votacion',
      titulo: v.titulo,
      descripcion: v.descripcion.trim(),
      prioridad: v.prioridad,
      vence_en: venceIso ?? null,
      etiquetas: v.etiquetas,
      responsable_id: v.responsableId || null,
      subtareas: proponiendo ? subtareas : [],
    });
    if (!r.success) {
      for (const i of r.error.issues) {
        const campo =
          i.path[0] === 'vence_en'
            ? 'vence'
            : i.path[0] === 'responsable_id'
              ? 'responsableId'
              : (i.path[0] as keyof Valores);
        e[campo] ??= i.message;
      }
    }
    if (proponiendo && venceIso && new Date(venceIso).getTime() < Date.now() - 86_400_000) {
      e.vence = 'La fecha de entrega no puede estar en el pasado.';
    }
    if (soloTitulo) {
      setErrores((x) => ({ ...x, titulo: e.titulo }));
      return null;
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
    const alCrear = (t: TareaEquipoDetalle) => {
      const responsable = equipo.miembros.find((m) => m.usuario_id === datos.responsable_id);
      toast(
        asignando
          ? datos.responsable_id === usuarioId
            ? `Tarea ${codigoTarea(t.codigo)} creada y asignada a ti.`
            : `Tarea ${codigoTarea(t.codigo)} asignada a ${responsable?.nombre.split(' ')[0] ?? 'la persona elegida'}; debe aceptarla.`
          : t.estado === 'propuesta'
            ? `Propuesta ${codigoTarea(t.codigo)} enviada a votación.`
            : `Tarea ${codigoTarea(t.codigo)} aceptada (el equipo aún no tiene integrantes que voten).`,
      );
      if (otra && !reformular) {
        setV({ ...inicial, prioridad: v.prioridad });
        setNuevaSub('');
        setTimeout(() => document.querySelector<HTMLElement>('[data-campo="titulo"]')?.focus(), 20);
      } else onCerrar();
    };
    if (reformular) {
      acciones.reformular.mutate(
        { id: reformular.id, ...datos },
        { onSuccess: alCrear, onError: alFallar },
      );
    } else {
      acciones.crear.mutate(datos, { onSuccess: alCrear, onError: alFallar });
    }
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      nombre="NX/EQ-07-Nueva-tarea"
      movil="completa"
      titulo={
        editar
          ? `Editar ${codigoTarea(editar.codigo)}`
          : reformular
            ? `Reformular ${codigoTarea(reformular.codigo)}`
            : 'Nueva tarea'
      }
      descripcion={
        editar
          ? `Equipo: ${equipo.nombre}`
          : reformular
            ? `Se creará una propuesta nueva que vuelve a votarse; ${codigoTarea(reformular.codigo)} se conserva como historial.`
            : asignando
              ? sprintActivo
                ? `Entra directo al sprint ${sprintActivo.numero}, sin votación, como si se hubiera planeado al inicio.`
                : 'Queda aceptada sin votación, lista para el próximo sprint.'
              : integrantes > 0
                ? `Entrará en votación: se acepta para el sprint con ${Math.floor(integrantes / 2) + 1} de ${integrantes} ${integrantes === 1 ? 'integrante' : 'integrantes'} a favor.`
                : 'El equipo aún no tiene integrantes que voten: la tarea quedará aceptada directamente.'
      }
      pie={
        <>
          {eligeModo && (
            <label className="mr-auto flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={otra}
                onChange={(e) => setOtra(e.target.checked)}
                className="size-5 accent-[var(--brand-primary)]"
              />
              {asignando ? 'Asignar y agregar otra' : 'Proponer y agregar otra'}
            </label>
          )}
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            onClick={guardar}
            cargando={guardando}
            icono={
              asignando ? (
                <UserCheck className="size-4" />
              ) : proponiendo ? (
                <Inbox className="size-4" />
              ) : undefined
            }
          >
            {editar ? 'Guardar cambios' : asignando ? 'Asignar tarea' : 'Enviar a votación'}
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
        {eligeModo && (
          <Segmentado
            etiqueta="Cómo crear la tarea"
            valor={modo}
            onChange={(m) => {
              setModo(m);
              setErrores({});
              setErrorGuardar('');
            }}
            className="w-full [&>button]:flex-1"
            opciones={[
              {
                valor: 'asignar',
                etiqueta: 'Asignar tarea',
                icono: <UserCheck className="size-4" aria-hidden />,
              },
              {
                valor: 'votacion',
                etiqueta: 'Proponer a votación',
                icono: <Inbox className="size-4" aria-hidden />,
              },
            ]}
          />
        )}
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
            onBlur={() => v.titulo && validar(true)}
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
        {proponiendo && (
          <Campo
            etiqueta="Subtareas"
            opcional
            error={errores.subtareas}
            ayuda={
              asignando
                ? 'Los pasos de la tarea. Se crean junto con ella.'
                : 'Los pasos de la tarea. Se crean junto con la propuesta y el equipo los ve al votar.'
            }
          >
            <div className="space-y-2" data-name="NX/EQ-07-Subtareas">
              {v.subtareas.length > 0 && (
                <ol className="space-y-1.5">
                  {v.subtareas.map((s, i) => (
                    <li
                      key={`${i}-${s}`}
                      className="flex items-center gap-2 rounded-[8px] border border-line bg-surface px-3 py-1.5 text-sm"
                    >
                      <span className="w-5 text-xs text-muted tabular">{i + 1}.</span>
                      <span className="min-w-0 flex-1 truncate">{s}</span>
                      <button
                        type="button"
                        aria-label={`Quitar la subtarea «${s}»`}
                        className="grid size-8 place-items-center rounded-[8px] text-muted hover:bg-raised"
                        onClick={() =>
                          set(
                            'subtareas',
                            v.subtareas.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex gap-2">
                <Entrada
                  data-campo="subtareas"
                  aria-label="Nueva subtarea"
                  value={nuevaSub}
                  onChange={(e) => setNuevaSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      agregarSubtarea();
                    }
                  }}
                  placeholder="Escribe un paso y pulsa Enter"
                  maxLength={140}
                />
                <Boton
                  icono={<Plus className="size-4" />}
                  onClick={agregarSubtarea}
                  disabled={!nuevaSub.trim() || v.subtareas.length >= MAX_SUBTAREAS}
                >
                  Agregar
                </Boton>
              </div>
            </div>
          </Campo>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {proponiendo && (
            <Campo
              etiqueta="Responsable"
              opcional={!asignando}
              error={errores.responsableId}
              ayuda={
                v.responsableId && v.responsableId !== usuarioId
                  ? 'Deberá aceptar la asignación.'
                  : asignando
                    ? 'Puedes asignártela a ti.'
                    : 'También puedes asignarla cuando se acepte.'
              }
            >
              <Selector
                data-campo="responsableId"
                value={v.responsableId}
                onChange={(e) => {
                  set('responsableId', e.target.value);
                  setErrores((x) => ({ ...x, responsableId: undefined }));
                }}
              >
                <option value="">{asignando ? 'Elige a la persona' : 'Sin asignar'}</option>
                {equipo.miembros
                  .filter((m) => m.rol !== 'invitado')
                  .map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.usuario_id === usuarioId ? `${m.nombre} (tú)` : m.nombre}
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
