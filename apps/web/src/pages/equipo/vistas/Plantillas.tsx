import type { Plantilla, TipoPlantilla } from '@nexo/shared';
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  AreaTexto,
  Banner,
  Boton,
  BotonIcono,
  Campo,
  Encabezado,
  Entrada,
  EsqueletoTarjetas,
  EstadosDatos,
  Insignia,
  Modal,
  Selector,
  Tarjeta,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesVistas, usePlantillas } from '@/lib/consultasVistas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';

const TIPO: Record<TipoPlantilla, string> = {
  proyecto: 'Proyecto',
  sprint: 'Sprint',
  retro: 'Retrospectiva',
};
const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');

/**
 * EQ-20: plantillas del equipo. Las de proyecto proponen sus elementos como tareas (van a
 * votación); las de sprint y retrospectiva son guías para seguir.
 */
export function Plantillas() {
  const { equipo, puede } = useEquipoActual();
  const consulta = usePlantillas(equipo.id);
  const [nueva, setNueva] = useState(false);
  const crea = puede('crear_plantilla').permitido && equipo.estado === 'activo';
  return (
    <div className="space-y-4" data-name="NX/EQ-20-Plantillas">
      <Encabezado
        titulo="Plantillas"
        descripcion="Listas reutilizables para arrancar un proyecto, planear un sprint o guiar la retrospectiva."
        acciones={
          crea ? (
            <Boton
              variante="primario"
              icono={<Plus className="size-4" />}
              onClick={() => setNueva(true)}
            >
              Nueva plantilla
            </Boton>
          ) : undefined
        }
      />
      <EstadosDatos
        consulta={consulta}
        esqueleto={<EsqueletoTarjetas n={2} />}
        vacio={
          <Vacio
            icono={<LayoutTemplate />}
            titulo="Aún no hay plantillas"
            texto={
              crea
                ? 'Crea la primera para no empezar de cero.'
                : 'El líder crea las plantillas del equipo.'
            }
          />
        }
      >
        {(lista) => (
          <div className="grid gap-3 md:grid-cols-2">
            {lista.map((p) => (
              <TarjetaPlantilla key={p.id} p={p} lider={crea} />
            ))}
          </div>
        )}
      </EstadosDatos>
      {nueva && <NuevaPlantilla onCerrar={() => setNueva(false)} />}
    </div>
  );
}

function TarjetaPlantilla({ p, lider }: { p: Plantilla; lider: boolean }) {
  const { equipo } = useEquipoActual();
  const { usarPlantilla, eliminarPlantilla } = useAccionesVistas(equipo.id);
  const confirmar = useConfirmar();
  const usar = async () => {
    const ok = await confirmar({
      titulo: `Usar «${p.nombre}»`,
      mensaje: `Se proponen ${p.elementos.length} tareas; el equipo las votará como cualquier propuesta.`,
      confirmar: 'Proponer tareas',
    });
    if (ok)
      usarPlantilla.mutate(p.id, {
        onSuccess: (r) => toast(`${r.creadas} tareas propuestas: ya están en Votación.`),
        onError: avisar,
      });
  };
  const borrar = async () => {
    const ok = await confirmar({
      titulo: `Eliminar «${p.nombre}»`,
      mensaje: 'No afecta las tareas ya creadas.',
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (ok) eliminarPlantilla.mutate(p.id, { onError: avisar });
  };
  return (
    <Tarjeta className="space-y-2 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{p.nombre}</h2>
          {p.descripcion && <p className="text-sm text-muted">{p.descripcion}</p>}
        </div>
        <Insignia tono="marca">{TIPO[p.tipo]}</Insignia>
        {lider && (
          <BotonIcono etiqueta={`Eliminar ${p.nombre}`} tamano="sm" onClick={() => void borrar()}>
            <Trash2 className="size-4" />
          </BotonIcono>
        )}
      </div>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm">
        {p.elementos.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ol>
      {lider && p.tipo === 'proyecto' && (
        <Boton tamano="sm" cargando={usarPlantilla.isPending} onClick={() => void usar()}>
          Proponer estas tareas
        </Boton>
      )}
    </Tarjeta>
  );
}

function NuevaPlantilla({ onCerrar }: { onCerrar: () => void }) {
  const { equipo } = useEquipoActual();
  const { crearPlantilla } = useAccionesVistas(equipo.id);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoPlantilla>('proyecto');
  const [descripcion, setDescripcion] = useState('');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  const elementos = texto
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const guardar = () => {
    setError(undefined);
    crearPlantilla.mutate(
      { nombre: nombre.trim(), tipo, descripcion: descripcion.trim(), elementos },
      {
        onSuccess: () => {
          toast('Plantilla creada.');
          onCerrar();
        },
        onError: (e) => setError(mensajeDeError(e)),
      },
    );
  };
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nueva plantilla"
      nombre="NX/EQ-20-Nueva-plantilla"
      pie={
        <>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!nombre.trim() || elementos.length === 0}
            cargando={crearPlantilla.isPending}
            onClick={guardar}
          >
            Crear
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Entrada value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector value={tipo} onChange={(e) => setTipo(e.target.value as TipoPlantilla)}>
              {(Object.keys(TIPO) as TipoPlantilla[]).map((k) => (
                <option key={k} value={k}>
                  {TIPO[k]}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
        <Campo etiqueta="Descripción" opcional>
          <Entrada
            value={descripcion}
            maxLength={500}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Campo>
        <Campo etiqueta="Elementos" ayuda={`Uno por línea (${elementos.length} de 30).`}>
          <AreaTexto rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        {error && <Banner tono="danger">{error}</Banner>}
      </div>
    </Modal>
  );
}
