import {
  COLUMNAS_RETRO,
  type ColumnaRetro,
  type NotaRetro,
  type Retrospectiva,
  type Sprint,
} from '@nexo/shared';
import { CheckCheck, CircleDot, ListPlus, MessagesSquare, Trash2, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAcciones } from '@/components/shell/contexto';
import {
  AreaTexto,
  Avatar,
  Banner,
  Boton,
  BotonIcono,
  Casilla,
  EsqueletoTarjetas,
  EstadosDatos,
  Selector,
  Tarjeta,
  Vacio,
  cx,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesSprint, useRetro, useSprints } from '@/lib/consultasSprints';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from '../contexto';
import { codigoTarea } from '../tareas/comunes';

const COLUMNAS: Record<ColumnaRetro, { titulo: string; ayuda: string }> = {
  bien: { titulo: 'Salió bien', ayuda: 'Lo que conviene repetir.' },
  mejorar: { titulo: 'Por mejorar', ayuda: 'Lo que estorbó o se puede hacer mejor.' },
  acciones: { titulo: 'Acciones', ayuda: 'Compromisos concretos para el siguiente sprint.' },
};
const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');

/**
 * EQ-12: retrospectiva de un sprint cerrado. Sin `:sprintId`, la del último sprint cerrado;
 * un selector cambia de sprint.
 */
export function RetroRuta() {
  const { equipo, base } = useEquipoActual();
  const { sprintId } = useParams();
  const nav = useNavigate();
  const lista = useSprints(equipo.id);
  return (
    <EstadosDatos
      consulta={lista}
      esqueleto={<EsqueletoTarjetas n={3} />}
      estaVacio={(l) => !l.some((s) => s.estado === 'cerrado')}
      vacio={
        <Vacio
          icono={<MessagesSquare />}
          titulo="Aún no hay retrospectivas"
          texto="La retrospectiva se abre al cerrar un sprint: el equipo anota qué salió bien, qué mejorar y qué acciones tomar."
        />
      }
    >
      {(sprints) => {
        const cerrados = sprints.filter((s) => s.estado === 'cerrado');
        const actual = cerrados.find((s) => s.id === sprintId) ?? cerrados[0];
        if (!actual) return null;
        return (
          <div className="space-y-4" data-name="NX/EQ-12-Retrospectiva">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Sprint</span>
                <Selector
                  value={actual.id}
                  onChange={(e) => nav(`${base}/sprints/retro/${e.target.value}`)}
                  className="w-auto"
                >
                  {cerrados.map((s) => (
                    <option key={s.id} value={s.id}>
                      Sprint {s.numero}
                      {s.objetivo ? ` · ${s.objetivo}` : ''}
                    </option>
                  ))}
                </Selector>
              </label>
            </div>
            <RetroSprint key={actual.id} sprint={actual} />
          </div>
        );
      }}
    </EstadosDatos>
  );
}

function RetroSprint({ sprint }: { sprint: Sprint }) {
  const { equipo, puede } = useEquipoActual();
  const consulta = useRetro(equipo.id, sprint.id);
  const { iniciarRetro } = useAccionesSprint(equipo.id);
  const modera = puede('moderar_retro').permitido;
  return (
    <EstadosDatos
      consulta={consulta}
      esqueleto={<EsqueletoTarjetas n={3} />}
      estaVacio={(d) => d.retro === null}
      vacio={
        <Vacio
          icono={<MessagesSquare />}
          titulo={`El Sprint ${sprint.numero} no tiene retrospectiva`}
          texto={
            modera
              ? 'Ábrela para que el equipo escriba sus notas y vote.'
              : 'El líder todavía no la abre.'
          }
          accion={
            modera ? (
              <Boton
                variante="primario"
                cargando={iniciarRetro.isPending}
                onClick={() => iniciarRetro.mutate(sprint.id, { onError: avisar })}
              >
                Abrir retrospectiva
              </Boton>
            ) : undefined
          }
        />
      }
    >
      {({ retro }) => retro && <Tablero retro={retro} modera={modera} />}
    </EstadosDatos>
  );
}

function Tablero({ retro, modera }: { retro: Retrospectiva; modera: boolean }) {
  const { equipo } = useEquipoActual();
  const { avanzar } = useAccionesSprint(equipo.id);
  const confirmar = useConfirmar();
  const quedan = Math.max(retro.votos_por_persona - retro.mis_votos_usados, 0);

  const cerrarFase = async (fase: 'votacion' | 'cerrada') => {
    const ok = await confirmar(
      fase === 'votacion'
        ? {
            titulo: 'Cerrar la votación',
            mensaje:
              'Ya no se podrán agregar notas ni votar. Las notas quedan ordenadas por votos.',
            confirmar: 'Cerrar votación',
          }
        : {
            titulo: `Cerrar la retrospectiva del Sprint ${retro.sprint_numero}`,
            mensaje: 'Queda de solo lectura. Las acciones se pueden seguir convirtiendo en tareas.',
            confirmar: 'Cerrar retrospectiva',
          },
    );
    if (ok) avanzar.mutate({ sprintId: retro.sprint_id, fase }, { onError: avisar });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Banner
          tono={retro.cerrada ? 'ok' : retro.votacion_cerrada ? 'info' : 'marca'}
          icono={<CircleDot />}
          className="min-w-0 flex-1"
        >
          {retro.cerrada
            ? 'Retrospectiva cerrada: solo lectura.'
            : retro.votacion_cerrada
              ? 'La votación se cerró. Las notas están ordenadas por votos.'
              : `Escribe notas y vota las más importantes. Te ${quedan === 1 ? 'queda 1 voto' : `quedan ${quedan} votos`} de ${retro.votos_por_persona}.`}
        </Banner>
        {modera && !retro.cerrada && (
          <div className="flex flex-wrap gap-2">
            {!retro.votacion_cerrada && (
              <Boton onClick={() => cerrarFase('votacion')}>Cerrar votación</Boton>
            )}
            <Boton
              variante="primario"
              icono={<CheckCheck className="size-4" />}
              onClick={() => cerrarFase('cerrada')}
            >
              Cerrar retrospectiva
            </Boton>
          </div>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNAS_RETRO.map((c) => (
          <Columna key={c} columna={c} retro={retro} modera={modera} quedan={quedan} />
        ))}
      </div>
    </div>
  );
}

function Columna({
  columna,
  retro,
  modera,
  quedan,
}: {
  columna: ColumnaRetro;
  retro: Retrospectiva;
  modera: boolean;
  quedan: number;
}) {
  const notas = retro.notas
    .filter((n) => n.columna === columna)
    .sort((a, b) =>
      retro.votacion_cerrada ? b.votos - a.votos : a.creada_en.localeCompare(b.creada_en),
    );
  const { titulo, ayuda } = COLUMNAS[columna];
  return (
    <section
      aria-labelledby={`col-${columna}`}
      className="flex flex-col gap-3 rounded-[12px] bg-surface p-3"
    >
      <div>
        <h2 id={`col-${columna}`} className="font-semibold">
          {titulo} <span className="text-sm font-normal text-muted tabular">({notas.length})</span>
        </h2>
        <p className="text-xs text-muted">{ayuda}</p>
      </div>
      {!retro.votacion_cerrada && <NuevaNota columna={columna} retro={retro} />}
      <ul className="space-y-2">
        {notas.map((n) => (
          <Nota key={n.id} nota={n} retro={retro} modera={modera} quedan={quedan} />
        ))}
      </ul>
      {notas.length === 0 && <p className="text-sm text-muted">Sin notas todavía.</p>}
    </section>
  );
}

function NuevaNota({ columna, retro }: { columna: ColumnaRetro; retro: Retrospectiva }) {
  const { equipo } = useEquipoActual();
  const { agregarNota } = useAccionesSprint(equipo.id);
  const [texto, setTexto] = useState('');
  const [anonima, setAnonima] = useState(false);
  const enviar = () => {
    if (!texto.trim()) return;
    agregarNota.mutate(
      { sprintId: retro.sprint_id, columna, texto: texto.trim(), anonima },
      { onSuccess: () => setTexto(''), onError: avisar },
    );
  };
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <AreaTexto
        aria-label={`Nota para «${COLUMNAS[columna].titulo}»`}
        rows={2}
        maxLength={500}
        value={texto}
        placeholder="Escribe una nota…"
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Casilla checked={anonima} onChange={setAnonima} etiqueta="Anónima" />
        <Boton
          type="submit"
          tamano="sm"
          disabled={!texto.trim()}
          cargando={agregarNota.isPending}
          icono={<ListPlus className="size-4" />}
        >
          Agregar
        </Boton>
      </div>
    </form>
  );
}

function Nota({
  nota,
  retro,
  modera,
  quedan,
}: {
  nota: NotaRetro;
  retro: Retrospectiva;
  modera: boolean;
  quedan: number;
}) {
  const { equipo } = useEquipoActual();
  const { votar, eliminarNota, notaATarea } = useAccionesSprint(equipo.id);
  const acc = useAcciones();
  const confirmar = useConfirmar();
  const votacionAbierta = !retro.votacion_cerrada && !retro.cerrada;
  const sinVotos = !nota.voto_mio && quedan === 0;
  const puedeBorrar = !retro.cerrada && (modera || (nota.mia && !retro.votacion_cerrada));

  const borrar = async () => {
    const ok = await confirmar({
      titulo: 'Eliminar la nota',
      mensaje: `«${nota.texto}» se borra con sus votos.`,
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (ok) eliminarNota.mutate(nota.id, { onError: avisar });
  };
  const convertir = () =>
    notaATarea.mutate(nota.id, {
      onSuccess: (t) =>
        toast(`${codigoTarea(t.codigo)} quedó como propuesta: el equipo la votará.`),
      onError: avisar,
    });

  return (
    <li>
      <Tarjeta className="space-y-2 p-3">
        <p className="text-sm break-words whitespace-pre-line">{nota.texto}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {nota.autor ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar
                persona={{ nombre: nota.autor.nombre, colorIdx: nota.autor.color_idx }}
                tamano={20}
              />
              {nota.autor.nombre.split(' ')[0]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <UserRoundX className="size-3.5" aria-hidden /> Anónima
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1">
            <button
              type="button"
              aria-pressed={nota.voto_mio}
              aria-label={nota.voto_mio ? 'Quitar mi voto' : 'Votar esta nota'}
              disabled={!votacionAbierta || sinVotos || votar.isPending}
              title={
                !votacionAbierta
                  ? 'La votación se cerró.'
                  : sinVotos
                    ? 'Ya usaste tus 3 votos: quita uno para votar esta nota.'
                    : undefined
              }
              onClick={() =>
                votar.mutate({ notaId: nota.id, dar: !nota.voto_mio }, { onError: avisar })
              }
              className={cx(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2 font-medium tabular transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                nota.voto_mio
                  ? 'border-brand bg-brand/10 text-fg'
                  : 'border-line bg-raised text-muted hover:text-fg',
              )}
            >
              <CircleDot className="size-3.5" aria-hidden />
              {nota.votos}
            </button>
            {puedeBorrar && (
              <BotonIcono etiqueta="Eliminar nota" tamano="sm" onClick={borrar}>
                <Trash2 className="size-4" />
              </BotonIcono>
            )}
          </span>
        </div>
        {nota.tarea_id ? (
          <button
            type="button"
            className="text-xs text-brand hover:underline"
            onClick={() => nota.tarea_id && acc.abrirTarea(nota.tarea_id)}
          >
            Ya es una tarea · ver
          </button>
        ) : (
          modera &&
          !equipo.estado.startsWith('archiv') && (
            <Boton tamano="sm" variante="texto" cargando={notaATarea.isPending} onClick={convertir}>
              Convertir en tarea
            </Boton>
          )
        )}
      </Tarjeta>
    </li>
  );
}
