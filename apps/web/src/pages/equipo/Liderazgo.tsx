import {
  tiempoRestante,
  type Eleccion,
  type EntradaHistorialLiderazgo,
  type Liderazgo as DatosLiderazgo,
  type Transferencia,
} from '@nexo/shared';
import { Crown, History, Vote } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar,
  Banner,
  Boton,
  Campo,
  Casilla,
  Encabezado,
  EsqueletoTarjetas,
  EstadosDatos,
  Insignia,
  Selector,
  Tarjeta,
  cx,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useAccionesLiderazgo, useLiderazgo } from '@/lib/consultasLiderazgo';
import { fechaCorta } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from './contexto';

const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');
const primer = (nombre: string) => nombre.split(' ')[0] ?? nombre;

/**
 * AD-07 a AD-09 y FALT-07: transferir el liderazgo, convocar y votar la elección de líder, y el
 * historial de cambios de líder. La elección dura 72 h (con 24 h de desempate); el líder
 * saliente no vota y sigue como interino hasta el resultado.
 */
export function Liderazgo() {
  const { equipo } = useEquipoActual();
  const consulta = useLiderazgo(equipo.id);
  return (
    <div className="space-y-5" data-name="NX/AD-09-Liderazgo">
      <Encabezado
        titulo="Liderazgo"
        descripcion="Transfiere el liderazgo, elige a la persona líder por votación y consulta el historial."
      />
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
        {(d) => <Contenido datos={d} />}
      </EstadosDatos>
    </div>
  );
}

function Contenido({ datos }: { datos: DatosLiderazgo }) {
  const { equipo } = useEquipoActual();
  const esLider = equipo.mi_rol === 'lider';
  const libre = !datos.transferencia && !datos.eleccion;
  return (
    <div className="space-y-5">
      {datos.transferencia && <TransferenciaPendiente t={datos.transferencia} />}
      {datos.eleccion && <EleccionAbierta e={datos.eleccion} />}
      {esLider && libre && equipo.estado === 'activo' && <AccionesLider />}
      {!esLider && libre && (
        <p className="text-sm text-muted">
          No hay cambios de liderazgo en curso. Si el líder transfiere el liderazgo o convoca una
          elección, lo verás aquí y te llegará un aviso.
        </p>
      )}
      <Historial entradas={datos.historial} />
    </div>
  );
}

function TransferenciaPendiente({ t }: { t: Transferencia }) {
  const { equipo, usuarioId } = useEquipoActual();
  const { responder, cancelar } = useAccionesLiderazgo(equipo.id);
  const confirmar = useConfirmar();
  const soyDestino = t.a.usuario_id === usuarioId;
  const soyLider = t.de.usuario_id === usuarioId;

  const aceptar = async () => {
    const ok = await confirmar({
      titulo: 'Aceptar el liderazgo',
      mensaje: `Pasarás a ser la persona líder del equipo y ${primer(t.de.nombre)} ${
        t.saldra ? 'saldrá del equipo' : 'quedará como integrante'
      }.`,
      confirmar: 'Aceptar liderazgo',
    });
    if (ok)
      responder.mutate(
        { id: t.id, acepta: true },
        { onSuccess: () => toast('Ahora lideras el equipo.'), onError: avisar },
      );
  };

  return (
    <Tarjeta className="space-y-3 p-4 sm:p-5" data-name="NX/AD-08-Aceptar-liderazgo">
      <div className="flex flex-wrap items-center gap-2">
        <Crown className="size-5 text-brand" aria-hidden />
        <h2 className="font-semibold">Transferencia pendiente</h2>
        <Insignia tono="marca">Pendiente</Insignia>
      </div>
      <p className="text-sm">
        {soyDestino
          ? `${primer(t.de.nombre)} te propone como líder del equipo.`
          : `${primer(t.de.nombre)} propuso a ${t.a.nombre} como líder.`}{' '}
        {t.saldra && `${primer(t.de.nombre)} saldrá del equipo cuando se acepte.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {soyDestino && (
          <>
            <Boton variante="primario" cargando={responder.isPending} onClick={aceptar}>
              Aceptar
            </Boton>
            <Boton
              onClick={() =>
                responder.mutate(
                  { id: t.id, acepta: false },
                  { onSuccess: () => toast('Rechazaste el liderazgo.', 'info'), onError: avisar },
                )
              }
            >
              Rechazar
            </Boton>
          </>
        )}
        {soyLider && (
          <Boton
            variante="fantasma"
            cargando={cancelar.isPending}
            onClick={() =>
              cancelar.mutate(t.id, {
                onSuccess: () => toast('Transferencia cancelada.', 'info'),
                onError: avisar,
              })
            }
          >
            Cancelar transferencia
          </Boton>
        )}
      </div>
    </Tarjeta>
  );
}

function EleccionAbierta({ e }: { e: Eleccion }) {
  const { equipo, puede } = useEquipoActual();
  const { votar } = useAccionesLiderazgo(equipo.id);
  const confirmar = useConfirmar();
  const puedeVotar = puede('votar_eleccion').permitido;
  const finalistas = e.candidatos.filter((c) => c.finalista);
  const elegido = e.candidatos.find((c) => c.usuario_id === e.mi_voto);

  const votarPor = async (candidatoId: string, nombre: string) => {
    const ok = await confirmar({
      titulo: `Votar por ${nombre}`,
      mensaje: 'Tu voto es secreto y no se puede cambiar en esta ronda.',
      confirmar: 'Votar',
    });
    if (ok)
      votar.mutate(
        { eleccionId: e.id, candidatoId },
        { onSuccess: () => toast('Voto registrado.'), onError: avisar },
      );
  };

  return (
    <Tarjeta className="space-y-4 p-4 sm:p-5" data-name="NX/AD-09-Eleccion">
      <div className="flex flex-wrap items-center gap-2">
        <Vote className="size-5 text-brand" aria-hidden />
        <h2 className="font-semibold">
          {e.ronda === 2 ? 'Elección de líder · desempate' : 'Elección de líder'}
        </h2>
        <Insignia tono="marca">{tiempoRestante(e.plazo_en)}</Insignia>
      </div>
      <p className="text-sm text-muted">
        {primer(e.saliente.nombre)} sigue como líder interino hasta el resultado y no vota.
        {e.ronda === 2 && ' Hubo empate: solo se vota entre las personas empatadas.'}
      </p>
      <p className="text-sm tabular">
        <strong>
          {e.votaron.length} de {e.votantes_total}
        </strong>{' '}
        integrantes votaron
        {e.votaron.length > 0 ? `: ${e.votaron.map(primer).join(', ')}.` : '.'}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {finalistas.map((c) => {
          const mio = c.usuario_id === e.mi_voto;
          return (
            <li
              key={c.usuario_id}
              className={cx(
                'flex items-center gap-3 rounded-[10px] border p-3',
                mio ? 'border-brand bg-brand/10' : 'border-line',
              )}
            >
              <Avatar persona={{ nombre: c.nombre, colorIdx: c.color_idx }} tamano={32} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.nombre}</span>
              {puedeVotar && !e.mi_voto && (
                <Boton tamano="sm" onClick={() => votarPor(c.usuario_id, c.nombre)}>
                  Votar
                </Boton>
              )}
              {mio && <Insignia tono="marca">Tu voto</Insignia>}
            </li>
          );
        })}
      </ul>
      {puedeVotar && elegido && (
        <p className="text-sm text-muted">
          Votaste por {elegido.nombre}. Los resultados se ven cuando termina la elección.
        </p>
      )}
      {!puedeVotar && (
        <Banner tono="info">
          {equipo.mi_rol === 'lider'
            ? 'Como líder saliente no votas: el equipo elige.'
            : 'Solo los integrantes votan en la elección de líder.'}
        </Banner>
      )}
    </Tarjeta>
  );
}

function AccionesLider() {
  const { equipo, usuarioId } = useEquipoActual();
  const { transferir, convocar } = useAccionesLiderazgo(equipo.id);
  const confirmar = useConfirmar();
  const integrantes = equipo.miembros.filter(
    (m) => m.rol === 'integrante' && m.usuario_id !== usuarioId,
  );
  const [destino, setDestino] = useState(integrantes[0]?.usuario_id ?? '');
  const [saldra, setSaldra] = useState(false);
  const sinIntegrantes = integrantes.length === 0;

  const proponer = () =>
    transferir.mutate(
      { a_id: destino, saldra },
      {
        onSuccess: () => toast('Propuesta enviada: falta que la persona acepte.'),
        onError: avisar,
      },
    );
  const elegir = async () => {
    const ok = await confirmar({
      titulo: 'Convocar elección de líder',
      mensaje:
        'Votan los integrantes durante el plazo del equipo (72 horas, salvo que lo cambies en Ajustes), con una ronda de desempate si hay empate. Seguirás como líder interino y no votas.',
      confirmar: 'Convocar elección',
    });
    if (ok)
      convocar.mutate(undefined, {
        onSuccess: () => toast('Elección convocada.'),
        onError: avisar,
      });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tarjeta className="space-y-3 p-4 sm:p-5" data-name="NX/AD-07-Transferir-liderazgo">
        <h2 className="font-semibold">Transferir el liderazgo</h2>
        <p className="text-sm text-muted">
          Elige a un integrante. El cambio ocurre cuando esa persona acepta.
        </p>
        <Campo etiqueta="Nueva persona líder">
          <Selector
            value={destino}
            disabled={sinIntegrantes}
            onChange={(ev) => setDestino(ev.target.value)}
          >
            {integrantes.map((m) => (
              <option key={m.usuario_id} value={m.usuario_id}>
                {m.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Casilla
          checked={saldra}
          onChange={setSaldra}
          etiqueta="Salir del equipo cuando acepte"
          descripcion="Si no, te quedas como integrante."
        />
        <Boton
          variante="primario"
          disabled={sinIntegrantes || !destino}
          motivo="Primero invita a un integrante."
          cargando={transferir.isPending}
          onClick={proponer}
        >
          Proponer
        </Boton>
      </Tarjeta>
      <Tarjeta className="space-y-3 p-4 sm:p-5" data-name="NX/AD-09-Convocar-eleccion">
        <h2 className="font-semibold">Elegir por votación</h2>
        <p className="text-sm text-muted">
          Todos los integrantes son candidatos y votan en secreto. Si nadie vota, sigues como líder.
        </p>
        <Boton
          disabled={sinIntegrantes}
          motivo="El equipo no tiene integrantes que puedan ser líder."
          cargando={convocar.isPending}
          onClick={elegir}
        >
          Convocar elección
        </Boton>
      </Tarjeta>
    </div>
  );
}

const ESTADO_TRANSFERENCIA: Record<Transferencia['estado'], string> = {
  pendiente: 'pendiente',
  aceptada: 'aceptada',
  rechazada: 'rechazada',
  cancelada: 'cancelada',
};

function Historial({ entradas }: { entradas: EntradaHistorialLiderazgo[] }) {
  return (
    <section aria-labelledby="hist-liderazgo" data-name="NX/FALT-07-Historial-liderazgo">
      <h2 id="hist-liderazgo" className="mb-2 flex items-center gap-2 text-base font-semibold">
        <History className="size-4" aria-hidden /> Historial
      </h2>
      {entradas.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay cambios de liderazgo.</p>
      ) : (
        <ol className="divide-y divide-line rounded-[12px] border border-line">
          {entradas.map((x) => (
            <li key={x.id} className="space-y-1 p-3 text-sm">
              {x.tipo === 'transferencia' ? (
                <p>
                  <strong>Transferencia</strong> de {x.de.nombre} a {x.a.nombre}:{' '}
                  {ESTADO_TRANSFERENCIA[x.estado]}
                  {x.saldra && x.estado === 'aceptada' ? ` (${primer(x.de.nombre)} salió)` : ''}.
                </p>
              ) : (
                <>
                  <p>
                    <strong>Elección</strong>:{' '}
                    {x.ganador
                      ? `ganó ${x.ganador.nombre}${x.ronda === 2 ? ' tras el desempate' : ''}`
                      : `sin votos; ${primer(x.saliente.nombre)} siguió como líder`}
                    .
                  </p>
                  {x.ganador && (
                    <p className="text-xs text-muted tabular">
                      {x.candidatos
                        .filter((c) => c.finalista)
                        .map((c) => `${primer(c.nombre)}: ${c.votos ?? 0}`)
                        .join(' · ')}
                    </p>
                  )}
                </>
              )}
              <p className="text-xs text-muted">
                {fechaCorta(
                  x.tipo === 'transferencia'
                    ? (x.resuelta_en ?? x.creada_en)
                    : (x.cerrada_en ?? x.creada_en),
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
