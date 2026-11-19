import type { Repeticion, Reunion, TareaEquipo } from '@nexo/shared';
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, Repeat } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAcciones } from '@/components/shell/contexto';
import {
  AreaTexto,
  Banner,
  Boton,
  BotonIcono,
  Campo,
  Encabezado,
  Entrada,
  Esqueleto,
  EstadosDatos,
  InsigniaSemaforo,
  Modal,
  Segmentado,
  Selector,
  Tarjeta,
  cx,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesVistas, useCalendario } from '@/lib/consultasVistas';
import { hora, mismaFecha } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { codigoTarea } from '../tareas/comunes';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const REPETICION: Record<Repeticion, string> = {
  ninguna: 'Una vez',
  diaria_lv: 'De lunes a viernes',
  semanal: 'Cada semana',
};
const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');

function semanasDelMes(ancla: Date): Date[] {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const desfase = (primero.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, i) => new Date(primero.getFullYear(), primero.getMonth(), 1 - desfase + i),
  );
}

/** EQ-14 y EQ-15: calendario del equipo con reuniones (y sus repeticiones) y entregas. */
export function CalendarioEquipo() {
  const { equipo, puede } = useEquipoActual();
  const acc = useAcciones();
  const hoy = useMemo(() => new Date(), []);
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [dia, setDia] = useState(hoy);
  const [nueva, setNueva] = useState(false);
  const dias = useMemo(() => semanasDelMes(mes), [mes]);
  const desde = dias[0] ?? mes;
  const hasta = useMemo(() => {
    const ultimo = dias.at(-1) ?? mes;
    return new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate() + 1);
  }, [dias, mes]);
  const consulta = useCalendario(equipo.id, desde, hasta);
  const titulo = mayuscula(mes.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
  const mover = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));
  const puedeCrear = puede('crear_reunion').permitido && equipo.estado === 'activo';

  return (
    <div className="space-y-4" data-name="NX/EQ-14-Calendario-equipo">
      <Encabezado
        titulo="Calendario"
        descripcion="Reuniones del equipo y fechas de entrega."
        acciones={
          <>
            <BotonIcono etiqueta="Mes anterior" onClick={() => mover(-1)} tamano="sm">
              <ChevronLeft className="size-5" />
            </BotonIcono>
            <span className="min-w-36 text-center text-sm font-semibold" aria-live="polite">
              {titulo}
            </span>
            <BotonIcono etiqueta="Mes siguiente" onClick={() => mover(1)} tamano="sm">
              <ChevronRight className="size-5" />
            </BotonIcono>
            {puedeCrear && (
              <Boton
                tamano="sm"
                variante="primario"
                icono={<CalendarPlus className="size-4" />}
                onClick={() => setNueva(true)}
              >
                Nueva reunión
              </Boton>
            )}
          </>
        }
      />
      <EstadosDatos consulta={consulta} esqueleto={<Esqueleto className="h-96" />}>
        {(cal) => {
          const reunionesDe = (d: Date) =>
            cal.reuniones.filter((r) => mismaFecha(new Date(r.inicio), d));
          const entregasDe = (d: Date) =>
            cal.entregas.filter((t) => t.vence_en && mismaFecha(new Date(t.vence_en), d));
          return (
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <Tarjeta className="p-2 sm:p-3">
                <div
                  className="grid grid-cols-7 text-center text-xs font-medium text-muted"
                  aria-hidden
                >
                  {DIAS.map((d) => (
                    <div key={d} className="py-1.5">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {dias.map((d) => {
                    const rs = reunionesDe(d);
                    const es = entregasDe(d);
                    const elegido = mismaFecha(d, dia);
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => setDia(d)}
                        aria-pressed={elegido}
                        aria-label={`${d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}: ${rs.length} ${rs.length === 1 ? 'reunión' : 'reuniones'}, ${es.length} ${es.length === 1 ? 'entrega' : 'entregas'}`}
                        className={cx(
                          'flex min-h-14 flex-col items-center gap-1 rounded-[8px] border p-1 text-sm transition-colors sm:min-h-20 sm:items-stretch',
                          elegido
                            ? 'border-brand bg-brand/10'
                            : 'border-transparent hover:bg-surface',
                          d.getMonth() !== mes.getMonth() && 'text-muted opacity-60',
                        )}
                      >
                        <span
                          className={cx(
                            'grid size-7 place-items-center self-center rounded-full tabular sm:self-start',
                            mismaFecha(d, hoy) && 'bg-brand font-semibold text-on-brand',
                          )}
                        >
                          {d.getDate()}
                        </span>
                        <span
                          className="flex flex-wrap justify-center gap-1 sm:justify-start"
                          aria-hidden
                        >
                          {rs.slice(0, 3).map((r) => (
                            <span key={r.id + r.inicio} className="size-2 rounded-full bg-brand" />
                          ))}
                          {es.slice(0, 3).map((t) => (
                            <span key={t.id} className="size-2 rounded-sm bg-warn" />
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 flex gap-4 px-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-brand" aria-hidden /> Reunión
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm bg-warn" aria-hidden /> Entrega
                  </span>
                </p>
              </Tarjeta>
              <section aria-label="Día seleccionado" className="space-y-3">
                <h2 className="font-semibold">
                  {mayuscula(
                    dia.toLocaleDateString('es-MX', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    }),
                  )}
                </h2>
                {reunionesDe(dia).length === 0 && entregasDe(dia).length === 0 && (
                  <p className="text-sm text-muted">Nada agendado este día.</p>
                )}
                {reunionesDe(dia).map((r) => (
                  <TarjetaReunion key={r.id + r.inicio} r={r} />
                ))}
                {entregasDe(dia).map((t) => (
                  <Entrega key={t.id} t={t} onAbrir={() => acc.abrirTarea(t.id)} />
                ))}
              </section>
            </div>
          );
        }}
      </EstadosDatos>
      {nueva && <NuevaReunion dia={dia} onCerrar={() => setNueva(false)} />}
    </div>
  );
}

function Entrega({ t, onAbrir }: { t: TareaEquipo; onAbrir: () => void }) {
  return (
    <Tarjeta className="flex items-center gap-2 p-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onAbrir}>
        <span className="block text-xs text-muted tabular">
          Entrega · {codigoTarea(t.codigo)} {t.vence_en && `· ${hora(t.vence_en)}`}
        </span>
        <span className="block truncate text-sm font-medium">{t.titulo}</span>
      </button>
      <InsigniaSemaforo tarea={t} />
    </Tarjeta>
  );
}

function TarjetaReunion({ r }: { r: Reunion }) {
  const { equipo } = useEquipoActual();
  const { responderReunion, cancelarReunion } = useAccionesVistas(equipo.id);
  const confirmar = useConfirmar();
  const activo = equipo.estado === 'activo';
  const cancelar = async () => {
    const ok = await confirmar({
      titulo: `Cancelar «${r.titulo}»`,
      mensaje:
        r.repeticion === 'ninguna'
          ? 'Se avisa a quienes iban a asistir.'
          : 'Se cancela toda la serie y se avisa a quienes iban a asistir.',
      confirmar: 'Cancelar reunión',
      destructivo: true,
    });
    if (ok)
      cancelarReunion.mutate(r.id, {
        onSuccess: () => toast('Reunión cancelada.', 'info'),
        onError: avisar,
      });
  };
  return (
    <Tarjeta className="space-y-2 p-3" data-name="NX/EQ-15-Reunion">
      <div>
        <p className="text-xs text-muted tabular">
          {hora(r.inicio)} · {r.duracion_min} min
        </p>
        <p className="font-medium">{r.titulo}</p>
        {r.lugar && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3.5" aria-hidden /> {r.lugar}
          </p>
        )}
        {r.repeticion !== 'ninguna' && (
          <p className="flex items-center gap-1 text-xs text-muted">
            <Repeat className="size-3.5" aria-hidden /> {REPETICION[r.repeticion]}
          </p>
        )}
        {r.descripcion && <p className="mt-1 text-sm whitespace-pre-line">{r.descripcion}</p>}
      </div>
      <p className="text-xs text-muted tabular">
        Van {r.asistencia.si} · quizá {r.asistencia.quiza} · no {r.asistencia.no} · sin responder{' '}
        {r.asistencia.pendiente}
      </p>
      {activo && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            etiqueta="Mi asistencia"
            tamano="sm"
            valor={r.mi_respuesta ?? 'pendiente'}
            onChange={(v) =>
              v !== 'pendiente' &&
              responderReunion.mutate({ id: r.id, respuesta: v }, { onError: avisar })
            }
            opciones={[
              { valor: 'si', etiqueta: 'Voy' },
              { valor: 'quiza', etiqueta: 'Quizá' },
              { valor: 'no', etiqueta: 'No voy' },
            ]}
          />
          {r.puedo_editar && (
            <Boton tamano="sm" variante="fantasma" onClick={cancelar}>
              Cancelar
            </Boton>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

const aLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function NuevaReunion({ dia, onCerrar }: { dia: Date; onCerrar: () => void }) {
  const { equipo } = useEquipoActual();
  const { crearReunion } = useAccionesVistas(equipo.id);
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(aLocal(dia));
  const [horaTxt, setHoraTxt] = useState('10:00');
  const [duracion, setDuracion] = useState(30);
  const [repeticion, setRepeticion] = useState<Repeticion>('ninguna');
  const [lugar, setLugar] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string>();

  const guardar = () => {
    setError(undefined);
    const inicio = new Date(`${fecha}T${horaTxt}`);
    if (!titulo.trim() || Number.isNaN(inicio.getTime())) {
      setError('Escribe el título, la fecha y la hora.');
      return;
    }
    crearReunion.mutate(
      {
        titulo: titulo.trim(),
        inicio: inicio.toISOString(),
        duracion_min: duracion,
        repeticion,
        lugar,
        descripcion,
      },
      {
        onSuccess: () => {
          toast('Reunión agendada: el equipo recibió el aviso.');
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
      titulo="Nueva reunión"
      descripcion="Se invita a todo el equipo (no a los invitados)."
      nombre="NX/EQ-15-Nueva-reunion"
      pie={
        <>
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="primario" cargando={crearReunion.isPending} onClick={guardar}>
            Agendar
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo etiqueta="Título">
          <Entrada value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora">
            <Entrada type="time" value={horaTxt} onChange={(e) => setHoraTxt(e.target.value)} />
          </Campo>
          <Campo etiqueta="Duración">
            <Selector value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
        <Campo etiqueta="Se repite">
          <Selector
            value={repeticion}
            onChange={(e) => setRepeticion(e.target.value as Repeticion)}
          >
            {(Object.keys(REPETICION) as Repeticion[]).map((k) => (
              <option key={k} value={k}>
                {REPETICION[k]}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Lugar o enlace" opcional>
          <Entrada value={lugar} maxLength={200} onChange={(e) => setLugar(e.target.value)} />
        </Campo>
        <Campo etiqueta="Descripción" opcional>
          <AreaTexto
            rows={2}
            maxLength={2000}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </Campo>
        {error && <Banner tono="danger">{error}</Banner>}
      </div>
    </Modal>
  );
}
