import type { Invitacion } from '@nexo/shared';
import { Copy, Link2, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar,
  Banner,
  Barra,
  Boton,
  Encabezado,
  EstadosDatos,
  Insignia,
  InsigniaRol,
  Modal,
  Radios,
  Selector,
  Campo,
  Tarjeta,
  Vacio,
  useConfirmar,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useCrearInvitacion, useInvitaciones, useRevocarInvitacion } from '@/lib/consultasEquipo';
import { fechaCorta, relativo } from '@/lib/fechas';
import { toast } from '@/lib/toasts';
import { useEquipoActual } from './contexto';

const enlaceDe = (codigo: string) => `${location.origin}/invitacion/${codigo}`;

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(aviso);
  } catch {
    toast('No se pudo copiar. Selecciona el texto y cópialo a mano.', 'warn');
  }
}

const ESTADO_INVITACION: Record<
  Invitacion['estado'],
  { texto: string; tono: 'marca' | 'ok' | 'neutro' }
> = {
  pendiente: { texto: 'Pendiente', tono: 'marca' },
  aceptada: { texto: 'Usada', tono: 'ok' },
  revocada: { texto: 'Cancelada', tono: 'neutro' },
  caducada: { texto: 'Caducada', tono: 'neutro' },
};

/** AD-01: miembros del equipo, cupo e invitaciones (solo el líder invita). */
export function Miembros() {
  const { equipo, puede } = useEquipoActual();
  const puedeInvitar = puede('invitar_personas').permitido;
  const [invitar, setInvitar] = useState(false);
  const lleno = equipo.miembros_activos >= equipo.max_miembros;
  const miembros = equipo.miembros.filter((m) => m.rol !== 'invitado');
  const invitados = equipo.miembros.filter((m) => m.rol === 'invitado');

  return (
    <div className="space-y-5" data-name="NX/AD-01-Miembros">
      <Encabezado
        titulo="Equipo"
        descripcion={equipo.descripcion || undefined}
        acciones={
          <Boton
            variante="primario"
            icono={<UserPlus className="size-4" />}
            disabled={!puedeInvitar}
            motivo="Solo el líder puede invitar personas."
            onClick={() => setInvitar(true)}
          >
            Invitar
          </Boton>
        }
      />

      <Tarjeta as="section" className="p-4" aria-labelledby="cupo">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="cupo" className="text-sm font-semibold">
            Lugares del equipo
          </h2>
          <p className="text-sm tabular">
            <strong>{equipo.miembros_activos}</strong> de {equipo.max_miembros}
          </p>
        </div>
        <Barra
          className="mt-2"
          etiqueta="Lugares ocupados"
          valor={(equipo.miembros_activos / equipo.max_miembros) * 100}
          tono={lleno ? 'warn' : 'marca'}
        />
        <p className="mt-2 text-xs text-muted">
          Cuentan el líder y los integrantes. Los invitados ({equipo.invitados_activos}) no ocupan
          lugar.
        </p>
      </Tarjeta>

      {lleno && (
        <Banner tono="warn" icono={<Users />}>
          <span data-name="NX/FALT-06-Equipo-lleno">
            <strong>El equipo está lleno:</strong> tiene sus {equipo.max_miembros} miembros. Aún
            puedes invitar observadores como invitados.
          </span>
        </Banner>
      )}

      <section aria-labelledby="lista-miembros">
        <h2 id="lista-miembros" className="mb-2 text-base font-semibold">
          Miembros <span className="text-muted tabular">({miembros.length})</span>
        </h2>
        <ul className="divide-y divide-line rounded-[12px] border border-line">
          {miembros.map((m) => (
            <li key={m.membresia_id} className="flex items-center gap-3 p-3">
              <Avatar persona={{ nombre: m.nombre, colorIdx: m.color_idx }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.nombre}</span>
              <InsigniaRol rol={m.rol} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="lista-invitados">
        <h2 id="lista-invitados" className="mb-2 text-base font-semibold">
          Invitados <span className="text-muted tabular">({invitados.length})</span>
        </h2>
        {invitados.length === 0 ? (
          <Vacio
            compacto
            titulo="Sin invitados"
            texto="Un invitado ve y comenta solo lo que compartas con él."
          />
        ) : (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {invitados.map((m) => (
              <li key={m.membresia_id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar persona={{ nombre: m.nombre }} conAnillo={false} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.nombre}</span>
                  {m.caduca_en && (
                    <span className="text-xs text-muted">
                      Su acceso caduca {relativo(m.caduca_en)}
                    </span>
                  )}
                </span>
                <InsigniaRol rol="invitado" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {puedeInvitar && <Invitaciones equipoId={equipo.id} />}
      {invitar && (
        <InvitarModal equipoId={equipo.id} lleno={lleno} onCerrar={() => setInvitar(false)} />
      )}
    </div>
  );
}

function Invitaciones({ equipoId }: { equipoId: string }) {
  const consulta = useInvitaciones(equipoId);
  const revocar = useRevocarInvitacion(equipoId);
  const confirmar = useConfirmar();
  return (
    <section aria-labelledby="lista-invitaciones">
      <h2 id="lista-invitaciones" className="mb-2 text-base font-semibold">
        Invitaciones
      </h2>
      <EstadosDatos
        consulta={consulta}
        vacio={
          <Vacio
            compacto
            titulo="Aún no has creado invitaciones"
            texto="Crea una y comparte su enlace o su código."
          />
        }
      >
        {(lista) => (
          <ul className="divide-y divide-line rounded-[12px] border border-line">
            {lista.map((i) => {
              const e = ESTADO_INVITACION[i.estado];
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block font-mono text-sm font-semibold">{i.codigo}</span>
                    <span className="text-xs text-muted">
                      Para {i.rol_destino}
                      {i.duracion_invitado_dias ? ` (${i.duracion_invitado_dias} días)` : ''} ·{' '}
                      {i.estado === 'pendiente'
                        ? `caduca el ${fechaCorta(i.caduca_en)}`
                        : fechaCorta(i.creada_en)}
                    </span>
                  </span>
                  <Insignia tono={e.tono}>{e.texto}</Insignia>
                  {i.estado === 'pendiente' && (
                    <>
                      <Boton
                        tamano="sm"
                        icono={<Link2 className="size-4" />}
                        onClick={() => copiar(enlaceDe(i.codigo), 'Enlace copiado.')}
                      >
                        Copiar enlace
                      </Boton>
                      <Boton
                        tamano="sm"
                        variante="texto"
                        icono={<X className="size-4" />}
                        onClick={async () => {
                          const r = await confirmar({
                            titulo: 'Cancelar invitación',
                            mensaje: `El código ${i.codigo} dejará de funcionar.`,
                            confirmar: 'Cancelar invitación',
                            cancelar: 'Volver',
                            destructivo: true,
                          });
                          if (r) {
                            revocar.mutate(i.id, {
                              onSuccess: () => toast('Invitación cancelada.', 'info'),
                              onError: (err) => toast(mensajeDeError(err), 'danger'),
                            });
                          }
                        }}
                      >
                        Cancelar
                      </Boton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </EstadosDatos>
    </section>
  );
}

/** AD-02 / AD-03: invitar como integrante o como invitado; muestra el código y el enlace. */
function InvitarModal({
  equipoId,
  lleno,
  onCerrar,
}: {
  equipoId: string;
  lleno: boolean;
  onCerrar: () => void;
}) {
  const crear = useCrearInvitacion(equipoId);
  const [rol, setRol] = useState<'integrante' | 'invitado'>(lleno ? 'invitado' : 'integrante');
  const [dias, setDias] = useState<7 | 14 | 30>(14);
  const [validez, setValidez] = useState(7);
  const creada = crear.data;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={creada ? 'Invitación lista' : 'Invitar al equipo'}
      nombre={rol === 'invitado' ? 'NX/AD-03-Invitar-invitado' : 'NX/AD-02-Invitar-integrante'}
      pie={
        creada ? (
          <Boton variante="primario" onClick={onCerrar}>
            Listo
          </Boton>
        ) : (
          <>
            <Boton onClick={onCerrar}>Cancelar</Boton>
            <Boton
              variante="primario"
              cargando={crear.isPending}
              onClick={() =>
                crear.mutate({
                  rol_destino: rol,
                  dias_validez: validez,
                  ...(rol === 'invitado' && { duracion_invitado_dias: dias }),
                })
              }
            >
              Crear invitación
            </Boton>
          </>
        )
      }
    >
      {creada ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Comparte el enlace o el código. Sirve una sola vez y caduca el{' '}
            {fechaCorta(creada.caduca_en)}.
          </p>
          <div className="rounded-[12px] bg-surface p-4 text-center">
            <p className="text-xs text-muted">Código</p>
            <p className="font-mono text-2xl font-semibold tracking-wider">{creada.codigo}</p>
          </div>
          <p className="rounded-[8px] border border-line px-3 py-2 text-sm break-all">
            {enlaceDe(creada.codigo)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton
              icono={<Link2 className="size-4" />}
              onClick={() => copiar(enlaceDe(creada.codigo), 'Enlace copiado.')}
            >
              Copiar enlace
            </Boton>
            <Boton
              icono={<Copy className="size-4" />}
              onClick={() => copiar(creada.codigo, 'Código copiado.')}
            >
              Copiar código
            </Boton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {lleno && (
            <Banner tono="warn">
              El equipo está lleno: una invitación de integrante no podrá aceptarse hasta que se
              libere un lugar.
            </Banner>
          )}
          {crear.isError && <Banner tono="danger">{mensajeDeError(crear.error)}</Banner>}
          <Radios
            nombre="rol"
            etiqueta="¿Cómo entra?"
            valor={rol}
            onChange={setRol}
            opciones={[
              {
                valor: 'integrante',
                etiqueta: 'Integrante',
                descripcion:
                  'Trabaja en el equipo: propone tareas, cambia el estado de las suyas y chatea. Ocupa un lugar.',
              },
              {
                valor: 'invitado',
                etiqueta: 'Invitado',
                descripcion:
                  'Observador externo: ve y comenta solo lo que compartas con él. No ocupa lugar y su acceso caduca.',
              },
            ]}
          />
          {rol === 'invitado' && (
            <Campo etiqueta="Duración del acceso del invitado">
              <Selector
                value={dias}
                onChange={(e) => setDias(Number(e.target.value) as 7 | 14 | 30)}
              >
                <option value={7}>7 días</option>
                <option value={14}>14 días</option>
                <option value={30}>30 días</option>
              </Selector>
            </Campo>
          )}
          <Campo
            etiqueta="La invitación caduca en"
            ayuda="Después de ese plazo el código deja de funcionar."
          >
            <Selector value={validez} onChange={(e) => setValidez(Number(e.target.value))}>
              <option value={1}>1 día</option>
              <option value={3}>3 días</option>
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
            </Selector>
          </Campo>
        </div>
      )}
    </Modal>
  );
}
