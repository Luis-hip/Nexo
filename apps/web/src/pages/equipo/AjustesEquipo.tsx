import {
  esquemaConfigurarEquipo,
  type ConfiguracionEquipo,
  type ConfigurarEquipo,
} from '@nexo/shared';
import { Archive, Lock, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AreaTexto,
  Banner,
  Boton,
  Campo,
  Encabezado,
  Entrada,
  EsqueletoTarjetas,
  EstadosDatos,
  Selector,
  Tarjeta,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesLiderazgo, useConfiguracion } from '@/lib/consultasLiderazgo';
import { toast } from '@/lib/toasts';
import { primerError } from '@/lib/validacion';
import { useEquipoActual } from './contexto';

const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');

/** Zonas horarias frecuentes; la actual del equipo se agrega si no está. */
const ZONAS = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Tijuana',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'Europe/Madrid',
  'UTC',
];

/** AD-06 (configuración), AD-10 (salir) y AD-12 (archivar). */
export function AjustesEquipo() {
  const { equipo } = useEquipoActual();
  const consulta = useConfiguracion(equipo.id);
  return (
    <div className="space-y-5" data-name="NX/AD-06-Ajustes-equipo">
      <Encabezado titulo="Ajustes del equipo" descripcion={equipo.nombre} />
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
        {(c) => (
          <>
            <Formulario key={JSON.stringify(c)} config={c} />
            <ZonaDeRiesgo config={c} />
          </>
        )}
      </EstadosDatos>
    </div>
  );
}

function Formulario({ config }: { config: ConfiguracionEquipo }) {
  const { equipo, puede } = useEquipoActual();
  const { configurar } = useAccionesLiderazgo(equipo.id);
  const editable = puede('configurar_equipo').permitido && config.estado === 'activo';
  const [v, setV] = useState(config);
  const [error, setError] = useState<string>();
  const cambia = <K extends keyof ConfiguracionEquipo>(k: K, valor: ConfiguracionEquipo[K]) =>
    setV((x) => ({ ...x, [k]: valor }));
  const claves = [
    'nombre',
    'descripcion',
    'duracion_sprint_semanas',
    'zona_horaria',
    'votacion_plazo_horas',
    'votacion_desempate_horas',
    'max_miembros',
  ] as const;
  const cambios = Object.fromEntries(
    claves.filter((k) => v[k] !== config[k]).map((k) => [k, v[k]]),
  ) as ConfigurarEquipo;
  const hayCambios = Object.keys(cambios).length > 0;
  const zonas = ZONAS.includes(config.zona_horaria) ? ZONAS : [config.zona_horaria, ...ZONAS];
  const numero = (s: string) => Math.round(Number(s) || 0);

  const guardar = () => {
    setError(undefined);
    // Mismo esquema que la API (5.2).
    const invalido = primerError(esquemaConfigurarEquipo, cambios);
    if (invalido) return setError(invalido);
    configurar.mutate(cambios, {
      onSuccess: () => toast('Ajustes guardados.'),
      onError: (e) => setError(mensajeDeError(e)),
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <Tarjeta className="space-y-4 p-4 sm:p-5">
        {!editable && (
          <Banner tono="info" icono={<Lock />}>
            {config.estado === 'archivado'
              ? 'El equipo está archivado: solo lectura.'
              : 'Solo el líder configura el equipo.'}
          </Banner>
        )}
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre">
              <Entrada
                value={v.nombre}
                maxLength={60}
                onChange={(e) => cambia('nombre', e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Zona horaria" ayuda="Define el «hoy» de los sprints y del burndown.">
              <Selector
                value={v.zona_horaria}
                onChange={(e) => cambia('zona_horaria', e.target.value)}
              >
                {zonas.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
          <Campo etiqueta="Descripción" opcional>
            <AreaTexto
              rows={2}
              maxLength={500}
              value={v.descripcion}
              onChange={(e) => cambia('descripcion', e.target.value)}
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo etiqueta="Duración del sprint">
              <Selector
                value={v.duracion_sprint_semanas}
                onChange={(e) => cambia('duracion_sprint_semanas', Number(e.target.value))}
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'semana' : 'semanas'}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Tope de miembros" ayuda="Líder e integrantes, de 1 a 8.">
              <Entrada
                type="number"
                min={1}
                max={8}
                value={v.max_miembros}
                onChange={(e) => cambia('max_miembros', numero(e.target.value))}
              />
            </Campo>
            <Campo etiqueta="Votación de líder (h)" ayuda="De 1 a 336 horas.">
              <Entrada
                type="number"
                min={1}
                max={336}
                value={v.votacion_plazo_horas}
                onChange={(e) => cambia('votacion_plazo_horas', numero(e.target.value))}
              />
            </Campo>
            <Campo etiqueta="Desempate (h)" ayuda="De 1 a 168 horas.">
              <Entrada
                type="number"
                min={1}
                max={168}
                value={v.votacion_desempate_horas}
                onChange={(e) => cambia('votacion_desempate_horas', numero(e.target.value))}
              />
            </Campo>
          </div>
        </fieldset>
        {error && <Banner tono="danger">{error}</Banner>}
        {editable && (
          <Boton
            type="submit"
            variante="primario"
            disabled={!hayCambios}
            cargando={configurar.isPending}
          >
            Guardar cambios
          </Boton>
        )}
      </Tarjeta>
    </form>
  );
}

function ZonaDeRiesgo({ config }: { config: ConfiguracionEquipo }) {
  const { equipo, puede } = useEquipoActual();
  const { salir, archivar } = useAccionesLiderazgo(equipo.id);
  const confirmar = useConfirmar();
  const nav = useNavigate();
  const esLider = equipo.mi_rol === 'lider';
  const archivado = config.estado === 'archivado';

  const dejar = async () => {
    const ok = await confirmar({
      titulo: `Salir de ${equipo.nombre}`,
      mensaje:
        'Dejarás de ver el equipo. Tus tareas sin terminar quedan sin responsable y tus votos de propuestas abiertas se descartan.',
      confirmar: 'Salir del equipo',
      destructivo: true,
    });
    if (ok)
      salir.mutate(undefined, {
        onSuccess: () => {
          toast(`Saliste de ${equipo.nombre}.`, 'info');
          nav('/app/personal/equipos');
        },
        onError: avisar,
      });
  };
  const alternarArchivo = async () => {
    const ok = await confirmar(
      archivado
        ? {
            titulo: 'Reactivar el equipo',
            mensaje: 'El equipo vuelve a admitir cambios.',
            confirmar: 'Reactivar',
          }
        : {
            titulo: `Archivar ${equipo.nombre}`,
            mensaje: 'El equipo queda de solo lectura para todos. Podrás reactivarlo después.',
            confirmar: 'Archivar',
            destructivo: true,
          },
    );
    if (ok)
      archivar.mutate(!archivado, {
        onSuccess: (c) =>
          toast(c.estado === 'archivado' ? 'Equipo archivado.' : 'Equipo reactivado.'),
        onError: avisar,
      });
  };

  return (
    <Tarjeta as="section" className="space-y-3 p-4 sm:p-5" aria-labelledby="riesgo">
      <h2 id="riesgo" className="font-semibold">
        Zona de riesgo
      </h2>
      <div className="flex flex-wrap gap-2">
        <Boton
          icono={<LogOut className="size-4" />}
          disabled={esLider}
          motivo="Transfiere el liderazgo antes de salir del equipo."
          onClick={dejar}
          data-name="NX/AD-10-Salir"
        >
          Salir del equipo
        </Boton>
        {puede('archivar_equipo').permitido && (
          <Boton
            variante={archivado ? 'secundario' : 'destructivo'}
            icono={<Archive className="size-4" />}
            cargando={archivar.isPending}
            onClick={alternarArchivo}
            data-name="NX/AD-12-Archivar"
          >
            {archivado ? 'Reactivar equipo' : 'Archivar equipo'}
          </Boton>
        )}
      </div>
    </Tarjeta>
  );
}
