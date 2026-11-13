import { CheckSquare, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { HillChart, type PuntoHill } from '@/components/charts/HillChart';
import {
  Acordeon,
  AreaTexto,
  Avatar,
  Banner,
  Barra,
  Boton,
  BotonIcono,
  Buscador,
  Campo,
  Casilla,
  Chip,
  Deslizador,
  Entrada,
  ErrorEstado,
  EsqueletoLista,
  EstadosDatos,
  Hoja,
  Insignia,
  InsigniaEstado,
  InsigniaRol,
  InsigniaSemaforo,
  Interruptor,
  Menu,
  Modal,
  PanelLateral,
  Pestanas,
  PilaAvatares,
  Radios,
  Segmentado,
  Selector,
  SinConexion,
  SinPermisos,
  Tabla,
  Tarjeta,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { BurbujaWA } from '@/components/whatsapp/BurbujaWA';
import { ErrorApi } from '@/lib/api';
import { guardarApariencia, useApariencia } from '@/lib/apariencia';
import { enDias } from '@/lib/fechas';
import { toast } from '@/lib/toasts';

const PERSONAS = [
  'Valeria Mendoza',
  'Carlos Ramírez',
  'Daniela Torres',
  'Emilio Cruz',
  'Fernanda Ruiz',
  'Gabriel Soto',
  'Hilda Vargas',
  'Iván Pérez',
].map((nombre, colorIdx) => ({ nombre, colorIdx }));

const PUNTOS: PuntoHill[] = [
  ['Vista de reportes', 2, 'en_curso', 62, 4],
  ['API de notificaciones', 1, 'en_curso', 48, 3],
  ['Integración con WhatsApp', 3, 'atascada', 35, 1],
  ['Login', 4, 'completada', 100, -2],
  ['Chat por tarea', 6, 'habilitada', 12, 8],
].map(([titulo, colorIdx, estado, progreso, dias], i) => ({
  id: String(i),
  codigo: `T-0${i + 1}`,
  titulo: titulo as string,
  responsable: PERSONAS[colorIdx as number]?.nombre ?? '',
  colorIdx: colorIdx as number,
  estado: estado as PuntoHill['estado'],
  progreso: progreso as number,
  vence_en: enDias(dias as number),
  resultado: estado === 'completada' ? 'a_tiempo' : null,
}));

type Estado = 'cargando' | 'vacio' | 'error' | 'sin_permiso' | 'sin_conexion' | 'datos';
const ERRORES: Partial<Record<Estado, ErrorApi>> = {
  error: new ErrorApi(500, 'error_interno', 'Ocurrió un error inesperado.'),
  sin_permiso: new ErrorApi(403, 'sin_permiso', 'Solo el líder puede gestionar los sprints.'),
  sin_conexion: new ErrorApi(0, 'sin_conexion', 'Sin conexión.'),
};

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="border-b border-line pb-2 text-lg">{titulo}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/**
 * Página interna de pruebas (tarea 1.1): muestra todos los componentes base en claro y oscuro.
 * Solo existe en desarrollo (ver enrutador); no forma parte del producto.
 */
export function Componentes() {
  const { tema } = useApariencia();
  const confirmar = useConfirmar();
  const [texto, setTexto] = useState('');
  const [casilla, setCasilla] = useState(true);
  const [interruptor, setInterruptor] = useState(false);
  const [radio, setRadio] = useState<'a' | 'b'>('a');
  const [pestana, setPestana] = useState<'uno' | 'dos'>('uno');
  const [avance, setAvance] = useState(40);
  const [busqueda, setBusqueda] = useState('');
  const [chip, setChip] = useState(true);
  const [capa, setCapa] = useState<'modal' | 'panel' | 'hoja' | null>(null);
  const [estado, setEstado] = useState<Estado>('datos');

  return (
    <main id="contenido" className="mx-auto max-w-[1100px] space-y-10 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Página interna · no se publica</p>
          <h1 className="text-[28px]">Componentes de Nexo</h1>
        </div>
        <Segmentado
          etiqueta="Tema"
          valor={tema}
          onChange={(v) => guardarApariencia({ tema: v })}
          opciones={[
            { valor: 'sistema', etiqueta: 'Sistema' },
            { valor: 'claro', etiqueta: 'Claro' },
            { valor: 'oscuro', etiqueta: 'Oscuro' },
          ]}
        />
      </header>

      <Seccion titulo="Acciones">
        <Boton variante="primario" icono={<Plus className="size-4" />}>
          Primario
        </Boton>
        <Boton>Secundario</Boton>
        <Boton variante="texto">Terciario</Boton>
        <Boton variante="destructivo" icono={<Trash2 className="size-4" />}>
          Destructivo
        </Boton>
        <Boton variante="primario" cargando>
          Guardando
        </Boton>
        <Boton disabled motivo="Solo el líder puede asignar responsables.">
          Deshabilitado con motivo
        </Boton>
        <BotonIcono etiqueta="Editar" contador={3}>
          <Pencil className="size-5" />
        </BotonIcono>
        <Menu
          items={[
            { etiqueta: 'Editar', icono: <Pencil /> },
            {
              etiqueta: 'Duplicar',
              icono: <Copy />,
              deshabilitado: true,
              motivo: 'Solo el líder.',
            },
            { etiqueta: '', separador: true },
            { etiqueta: 'Eliminar', icono: <Trash2 />, destructivo: true },
          ]}
        />
        <Chip activo={chip} onClick={() => setChip(!chip)}>
          Chip
        </Chip>
        <Segmentado
          etiqueta="Vista"
          valor={radio}
          onChange={setRadio}
          opciones={[
            { valor: 'a', etiqueta: 'Lista' },
            { valor: 'b', etiqueta: 'Tablero', contador: 2 },
          ]}
        />
      </Seccion>

      <Seccion titulo="Formularios">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <Campo etiqueta="Texto" ayuda="Ayuda debajo del campo.">
            <Entrada
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe algo"
            />
          </Campo>
          <Campo etiqueta="Con error" error="Escribe un título para la tarea.">
            <Entrada defaultValue="" />
          </Campo>
          <Campo etiqueta="Área de texto" opcional>
            <AreaTexto placeholder="Contexto o enlaces" />
          </Campo>
          <Campo etiqueta="Selector">
            <Selector defaultValue="media">
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </Selector>
          </Campo>
          <Casilla
            checked={casilla}
            onChange={setCasilla}
            etiqueta="Casilla"
            descripcion="Con descripción"
          />
          <Interruptor
            checked={interruptor}
            onChange={setInterruptor}
            etiqueta="Interruptor"
            descripcion="Activa o desactiva una opción"
          />
          <Radios
            nombre="demo"
            etiqueta="Radios"
            valor={radio}
            onChange={setRadio}
            opciones={[
              { valor: 'a', etiqueta: 'Opción A', descripcion: 'Con descripción' },
              { valor: 'b', etiqueta: 'Opción B' },
            ]}
          />
          <div className="space-y-3">
            <Deslizador etiqueta="Deslizador" valor={avance} onChange={setAvance} />
            <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar" />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Identidad y estado">
        {PERSONAS.map((p) => (
          <Avatar key={p.nombre} persona={p} />
        ))}
        <Avatar />
        <PilaAvatares personas={PERSONAS} />
        <InsigniaRol rol="lider" />
        <InsigniaRol rol="integrante" />
        <InsigniaRol rol="invitado" />
        {(
          ['propuesta', 'habilitada', 'en_curso', 'atascada', 'completada', 'rechazada'] as const
        ).map((e) => (
          <InsigniaEstado key={e} estado={e} />
        ))}
        <InsigniaSemaforo tarea={{ estado: 'en_curso', vence_en: enDias(6), resultado: null }} />
        <InsigniaSemaforo tarea={{ estado: 'en_curso', vence_en: enDias(1), resultado: null }} />
        <InsigniaSemaforo tarea={{ estado: 'en_curso', vence_en: enDias(-2), resultado: null }} />
        {(['neutro', 'marca', 'ok', 'warn', 'danger', 'info'] as const).map((t) => (
          <Insignia key={t} tono={t}>
            {t}
          </Insignia>
        ))}
      </Seccion>

      <Seccion titulo="Datos">
        <Tarjeta className="w-full p-4 sm:w-72">
          <p className="text-sm text-muted">Tarjeta</p>
          <p className="text-xl font-semibold tabular">43 %</p>
          <Barra etiqueta="Avance" valor={43} className="mt-2" />
        </Tarjeta>
        <Tabla
          className="w-full"
          titulo="Tareas de ejemplo"
          columnas={[
            { clave: 'codigo', titulo: 'Código', celda: (p: PuntoHill) => p.codigo },
            { clave: 'titulo', titulo: 'Tarea', celda: (p) => p.titulo },
            {
              clave: 'estado',
              titulo: 'Estado',
              celda: (p) => <InsigniaEstado estado={p.estado} />,
            },
            { clave: 'avance', titulo: 'Avance', numerica: true, celda: (p) => `${p.progreso} %` },
          ]}
          filas={PUNTOS}
          idFila={(p) => p.id}
        />
        <Tarjeta className="w-full p-4">
          <HillChart puntos={PUNTOS} etiqueta="Hill Chart de ejemplo" />
        </Tarjeta>
        <div className="w-full sm:w-80">
          <BurbujaWA texto="⏰ «Integración con WhatsApp» vence mañana. Responsable: Emilio." />
        </div>
      </Seccion>

      <Seccion titulo="Capas y avisos">
        <Boton onClick={() => setCapa('modal')}>Abrir modal</Boton>
        <Boton onClick={() => setCapa('panel')}>Abrir panel lateral</Boton>
        <Boton onClick={() => setCapa('hoja')}>Abrir hoja</Boton>
        <Boton onClick={() => toast('Cambios guardados.')}>Toast</Boton>
        <Boton onClick={() => toast('No se pudo guardar.', 'danger')}>Toast de error</Boton>
        <Boton
          onClick={async () => {
            const r = await confirmar({
              titulo: 'Eliminar tarea',
              mensaje: 'Esta acción no se puede deshacer.',
              confirmar: 'Eliminar',
              destructivo: true,
            });
            toast(r ? 'Confirmado.' : 'Cancelado.', 'info');
          }}
        >
          Confirmación
        </Boton>
        <div className="w-full space-y-2">
          <Banner tono="info">Aviso informativo persistente.</Banner>
          <Banner tono="ok">Todo en orden.</Banner>
          <Banner tono="warn" accion={<Boton tamano="sm">Revisar</Boton>}>
            Los envíos a WhatsApp están en pausa.
          </Banner>
          <Banner tono="danger" onCerrar={() => {}}>
            <strong>Sin conexión.</strong> No podrás guardar cambios.
          </Banner>
        </div>
        <div className="w-full">
          <Pestanas
            etiqueta="Pestañas de ejemplo"
            valor={pestana}
            onChange={setPestana}
            pestanas={[
              { valor: 'uno', etiqueta: 'Comentarios', contador: 4 },
              { valor: 'dos', etiqueta: 'Historial' },
            ]}
          />
          <p className="pt-3 text-sm text-muted">Contenido de «{pestana}».</p>
          <Acordeon titulo="Acordeón">Contenido que se despliega.</Acordeon>
        </div>
      </Seccion>

      <Seccion titulo="Los cinco estados de una pantalla de datos (EstadosDatos)">
        <Segmentado
          etiqueta="Estado"
          valor={estado}
          onChange={setEstado}
          opciones={[
            { valor: 'datos', etiqueta: 'Con datos' },
            { valor: 'cargando', etiqueta: 'Cargando' },
            { valor: 'vacio', etiqueta: 'Vacío' },
            { valor: 'error', etiqueta: 'Error' },
            { valor: 'sin_permiso', etiqueta: 'Sin permiso' },
            { valor: 'sin_conexion', etiqueta: 'Sin conexión' },
          ]}
        />
        <div className="w-full">
          <EstadosDatos
            consulta={{
              data:
                estado === 'datos' ? ['Tarea 1', 'Tarea 2'] : estado === 'vacio' ? [] : undefined,
              isPending: estado === 'cargando',
              error: ERRORES[estado] ?? null,
              refetch: () => toast('Reintentando…', 'info'),
            }}
            vacio={
              <Vacio
                icono={<CheckSquare />}
                titulo="Sin tareas"
                texto="Crea tu primera tarea."
                accion={<Boton variante="primario">Nueva tarea</Boton>}
              />
            }
          >
            {(datos) => (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {datos.map((d) => (
                  <li key={d} className="p-3 text-sm">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </EstadosDatos>
        </div>
        <div className="grid w-full gap-3 lg:grid-cols-2">
          <EsqueletoLista filas={2} />
          <ErrorEstado onReintentar={() => {}} />
          <SinConexion onReintentar={() => {}} />
          <Tarjeta>
            <SinPermisos nivel="h2" motivo="Los invitados no ven los sprints." />
          </Tarjeta>
        </div>
      </Seccion>

      <Modal
        abierto={capa === 'modal'}
        onCerrar={() => setCapa(null)}
        titulo="Modal"
        descripcion="Con trampa de foco y cierre con Esc."
        pie={
          <>
            <Boton onClick={() => setCapa(null)}>Cancelar</Boton>
            <Boton variante="primario" onClick={() => setCapa(null)}>
              Aceptar
            </Boton>
          </>
        }
      >
        <Campo etiqueta="Campo dentro del modal">
          <Entrada autoFocus />
        </Campo>
      </Modal>
      <PanelLateral
        abierto={capa === 'panel'}
        onCerrar={() => setCapa(null)}
        titulo="Panel lateral"
      >
        <p className="p-5 text-sm text-muted">Contenido del panel.</p>
      </PanelLateral>
      <Hoja abierto={capa === 'hoja'} onCerrar={() => setCapa(null)} titulo="Hoja inferior">
        <p className="text-sm text-muted">Contenido de la hoja.</p>
      </Hoja>
    </main>
  );
}
