import {
  NOMBRE_EVENTO,
  type AjustesUsuario,
  type EquipoDeUsuario,
  type GuardarAjustes,
  type PreferenciaAviso,
} from '@nexo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import {
  AreaTexto,
  Banner,
  Boton,
  Campo,
  Casilla,
  Contrasena,
  Encabezado,
  Entrada,
  EsqueletoTarjetas,
  EstadosDatos,
  InsigniaRol,
  Interruptor,
  Kbd,
  Radios,
  Selector,
  Tarjeta,
  cx,
  useConfirmar,
} from '@/components/ui';
import { api, mensajeDeError, urlApi } from '@/lib/api';
import { claves, useGuardarPerfil, useGuardarPreferencias, useSalir, useYo } from '@/lib/consultas';
import { useCambiarContrasena, useCuenta, useReenviarVerificacion } from '@/lib/consultasAuth';
import { useAccionesWhatsAppYo, useWhatsAppYo } from '@/lib/consultasWhatsApp';
import { FotoPerfil } from '@/components/perfil/FotoPerfil';
import { toast } from '@/lib/toasts';
import { DosPasosAjustes } from '@/components/auth/DosPasos';
import { DirectoPersonal } from '@/components/whatsapp/Directo';
import { RegistroWhatsApp } from '@/components/whatsapp/Registro';

const SECCIONES = [
  ['perfil', 'Perfil'],
  ['cuenta', 'Cuenta'],
  ['apariencia', 'Apariencia'],
  ['notificaciones', 'Notificaciones'],
  ['whatsapp', 'WhatsApp'],
  ['privacidad', 'Privacidad y datos'],
  ['equipos', 'Mis equipos'],
  ['atajos', 'Atajos'],
  ['ayuda', 'Ayuda'],
] as const;

/** Fase 3.6: ajustes de la persona (PF-01 a PF-09) con su navegación lateral. */
export function AjustesLayout() {
  return (
    <div className="space-y-4">
      <Encabezado titulo="Ajustes" descripcion="Tu perfil, tu cuenta y cómo quieres usar Nexo." />
      <div className="grid gap-5 md:grid-cols-[200px_1fr]">
        <nav aria-label="Secciones de ajustes" className="flex gap-1 overflow-x-auto md:flex-col">
          {SECCIONES.map(([ruta, nombre]) => (
            <NavLink
              key={ruta}
              to={`/ajustes/${ruta}`}
              className={({ isActive }) =>
                cx(
                  'shrink-0 rounded-[8px] px-3 py-2 text-sm',
                  isActive
                    ? 'bg-brand/10 font-medium text-fg'
                    : 'text-muted hover:bg-surface hover:text-fg',
                )
              }
            >
              {nombre}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

const avisar = (e: unknown) => toast(mensajeDeError(e), 'danger');

/** PF-01: nombre, cargo, descripción y zona horaria. */
export function Perfil() {
  const { data: yo } = useYo();
  const guardar = useGuardarPerfil();
  const u = yo?.usuario;
  const [v, setV] = useState({
    nombre: u?.nombre ?? '',
    cargo: u?.cargo ?? '',
    descripcion: u?.descripcion ?? '',
    zona_horaria: u?.zona_horaria ?? 'America/Mexico_City',
  });
  if (!u) return null;
  const cambios = Object.fromEntries(
    Object.entries(v).filter(([k, x]) => x !== u[k as keyof typeof v]),
  );
  return (
    <Tarjeta as="section" className="space-y-4 p-4 sm:p-5" data-name="NX/PF-01-Perfil">
      <h2 className="font-semibold">Perfil</h2>
      <FotoPerfil nombre={u.nombre} avatarUrl={u.avatar_url} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          <Entrada
            value={v.nombre}
            maxLength={80}
            onChange={(e) => setV({ ...v, nombre: e.target.value })}
          />
        </Campo>
        <Campo etiqueta="Cargo" opcional>
          <Entrada
            value={v.cargo}
            maxLength={80}
            onChange={(e) => setV({ ...v, cargo: e.target.value })}
          />
        </Campo>
      </div>
      <Campo etiqueta="Sobre ti" opcional contador={`${v.descripcion.length}/280`}>
        <AreaTexto
          rows={3}
          maxLength={280}
          value={v.descripcion}
          onChange={(e) => setV({ ...v, descripcion: e.target.value })}
        />
      </Campo>
      <Campo
        etiqueta="Zona horaria"
        ayuda="Las fechas de tus tareas personales se muestran en esta zona."
      >
        <Entrada
          value={v.zona_horaria}
          maxLength={60}
          onChange={(e) => setV({ ...v, zona_horaria: e.target.value })}
        />
      </Campo>
      <Boton
        variante="primario"
        disabled={Object.keys(cambios).length === 0 || v.nombre.trim().length < 2}
        cargando={guardar.isPending}
        onClick={() =>
          guardar.mutate(cambios, { onSuccess: () => toast('Perfil guardado.'), onError: avisar })
        }
      >
        Guardar perfil
      </Boton>
    </Tarjeta>
  );
}

/** PF-02: datos de la cuenta y cerrar sesión. Contraseña y verificación en dos pasos: Fase 5. */
export function Cuenta() {
  const { data: yo } = useYo();
  const cuenta = useCuenta();
  const reenviar = useReenviarVerificacion();
  const salir = useSalir();
  const nav = useNavigate();
  const c = cuenta.data;
  return (
    <div className="space-y-4">
      <Tarjeta as="section" className="space-y-4 p-4 sm:p-5" data-name="NX/PF-02-Cuenta">
        <h2 className="font-semibold">Cuenta</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Correo</dt>
          <dd>{yo?.usuario.correo}</dd>
          <dt className="text-muted">Estado</dt>
          <dd>{c ? (c.correo_verificado ? 'Verificado' : 'Sin verificar') : '…'}</dd>
          <dt className="text-muted">Sesiones abiertas</dt>
          <dd className="tabular">{c?.sesiones_activas ?? '…'}</dd>
        </dl>
        {c && !c.correo_verificado && (
          <Banner
            tono="warn"
            accion={
              <Boton
                tamano="sm"
                cargando={reenviar.isPending}
                onClick={() =>
                  reenviar.mutate(undefined, {
                    onSuccess: () => toast('Te enviamos el enlace. Revisa tu correo.'),
                    onError: avisar,
                  })
                }
              >
                Enviar enlace
              </Boton>
            }
          >
            Confirma tu correo para poder recuperar tu cuenta si olvidas la contraseña.
          </Banner>
        )}
        <Boton
          icono={<LogOut className="size-4" />}
          cargando={salir.isPending}
          onClick={() => salir.mutate(undefined, { onSettled: () => nav('/entrar?salio=1') })}
        >
          Cerrar sesión
        </Boton>
      </Tarjeta>
      {c?.tiene_contrasena && <CambiarContrasena />}
      <DosPasosAjustes />
    </div>
  );
}

/** PF-02: cambiar la contraseña con la actual; se cierran las demás sesiones. */
function CambiarContrasena() {
  const cambiar = useCambiarContrasena();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState('');
  const guardar = () => {
    if (nueva.length < 8) return setError('La contraseña nueva debe tener al menos 8 caracteres.');
    setError('');
    cambiar.mutate(
      { actual, nueva },
      {
        onSuccess: (r) => {
          setActual('');
          setNueva('');
          toast(
            r.sesiones_cerradas > 0
              ? `Contraseña cambiada. Cerramos ${r.sesiones_cerradas} sesión(es) en otros dispositivos.`
              : 'Contraseña cambiada.',
          );
        },
        onError: (e) => setError(mensajeDeError(e)),
      },
    );
  };
  return (
    <Tarjeta as="section" className="space-y-4 p-4 sm:p-5" data-name="NX/PF-02-Contrasena">
      <h2 className="font-semibold">Contraseña</h2>
      <Campo etiqueta="Contraseña actual">
        <Contrasena
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </Campo>
      <Campo etiqueta="Contraseña nueva" error={error} ayuda="Al menos 8 caracteres.">
        <Contrasena
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
      </Campo>
      <Boton
        variante="primario"
        cargando={cambiar.isPending}
        disabled={!actual || !nueva}
        onClick={guardar}
      >
        Cambiar contraseña
      </Boton>
    </Tarjeta>
  );
}

/** PF-03: tema, densidad, tamaño del texto, movimiento y formatos de fecha y hora. */
export function Apariencia() {
  const { data: yo } = useYo();
  const guardar = useGuardarPreferencias();
  const p = yo?.preferencias;
  if (!p) return null;
  const cambiar = (cambios: Parameters<typeof guardar.mutate>[0]) =>
    guardar.mutate(cambios, { onError: avisar });
  return (
    <Tarjeta as="section" className="space-y-5 p-4 sm:p-5" data-name="NX/PF-03-Apariencia">
      <h2 className="font-semibold">Apariencia</h2>
      <Radios
        nombre="tema"
        etiqueta="Tema"
        horizontal
        valor={p.tema}
        onChange={(tema) => cambiar({ tema })}
        opciones={[
          { valor: 'sistema', etiqueta: 'Como el sistema' },
          { valor: 'claro', etiqueta: 'Claro' },
          { valor: 'oscuro', etiqueta: 'Oscuro' },
        ]}
      />
      <Radios
        nombre="densidad"
        etiqueta="Densidad"
        horizontal
        valor={p.densidad}
        onChange={(densidad) => cambiar({ densidad })}
        opciones={[
          { valor: 'comoda', etiqueta: 'Cómoda' },
          { valor: 'compacta', etiqueta: 'Compacta' },
        ]}
      />
      <Radios
        nombre="texto"
        etiqueta="Tamaño del texto"
        horizontal
        valor={p.tamano_texto}
        onChange={(tamano_texto) => cambiar({ tamano_texto })}
        opciones={[
          { valor: 'pequeno', etiqueta: 'Pequeño' },
          { valor: 'normal', etiqueta: 'Normal' },
          { valor: 'grande', etiqueta: 'Grande' },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Formato de hora">
          <Selector
            value={p.formato_hora}
            onChange={(e) => cambiar({ formato_hora: e.target.value as '24h' | '12h' })}
          >
            <option value="24h">24 horas (14:30)</option>
            <option value="12h">12 horas (2:30 p. m.)</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Formato de fecha">
          <Selector
            value={p.formato_fecha}
            onChange={(e) => cambiar({ formato_fecha: e.target.value as 'dd/mm' | 'mm/dd' })}
          >
            <option value="dd/mm">Día y mes (18 nov)</option>
            <option value="mm/dd">Mes y día (nov 18)</option>
          </Selector>
        </Campo>
      </div>
      <Interruptor
        etiqueta="Reducir movimiento"
        descripcion="Quita animaciones y transiciones."
        checked={p.reducir_movimiento}
        onChange={(reducir_movimiento) => cambiar({ reducir_movimiento })}
      />
    </Tarjeta>
  );
}

function useAjustes() {
  const qc = useQueryClient();
  const consulta = useQuery({
    queryKey: ['yo', 'ajustes'],
    queryFn: () => api<AjustesUsuario>('/yo/ajustes'),
  });
  const guardar = useMutation({
    mutationFn: (cambios: GuardarAjustes) =>
      api<AjustesUsuario>('/yo/ajustes', { metodo: 'PATCH', cuerpo: cambios }),
    onSuccess: (a) => qc.setQueryData(['yo', 'ajustes'], a),
    onError: avisar,
  });
  return { consulta, guardar };
}

/** PF-04: qué avisos recibir y por qué canal, horas de silencio y resumen diario. */
export function Notificaciones() {
  const { consulta, guardar } = useAjustes();
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={1} />}>
      {(a) => {
        const cambiarAviso = (
          n: PreferenciaAviso,
          campo: 'por_app' | 'por_whatsapp',
          valor: boolean,
        ) => guardar.mutate({ notificaciones: [{ ...n, [campo]: valor }] });
        return (
          <Tarjeta
            as="section"
            className="space-y-5 p-4 sm:p-5"
            data-name="NX/PF-04-Notificaciones"
          >
            <h2 className="font-semibold">Notificaciones</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5 font-medium">Aviso</th>
                  <th className="py-1.5 text-center font-medium">En Nexo</th>
                  <th className="py-1.5 text-center font-medium">WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.notificaciones.map((n) => (
                  <tr key={n.evento}>
                    <td className="py-2">{NOMBRE_EVENTO[n.evento]}</td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--brand-primary)]"
                        checked={n.por_app}
                        aria-label={`${NOMBRE_EVENTO[n.evento]} en Nexo`}
                        onChange={(e) => cambiarAviso(n, 'por_app', e.target.checked)}
                      />
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--brand-primary)]"
                        checked={n.por_whatsapp}
                        aria-label={`${NOMBRE_EVENTO[n.evento]} por WhatsApp`}
                        onChange={(e) => cambiarAviso(n, 'por_whatsapp', e.target.checked)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted">
              Los avisos por WhatsApp se envían desde la Fase 4; tu elección queda guardada desde
              ahora.
            </p>
            <Silencio
              a={a}
              onGuardar={(c) =>
                guardar.mutate(c, { onSuccess: () => toast('Horas de silencio guardadas.') })
              }
            />
            <Interruptor
              etiqueta="Resumen diario"
              descripcion="Un resumen al día en lugar de cada aviso suelto."
              checked={a.resumen_diario}
              onChange={(resumen_diario) => guardar.mutate({ resumen_diario })}
            />
          </Tarjeta>
        );
      }}
    </EstadosDatos>
  );
}

function Silencio({ a, onGuardar }: { a: AjustesUsuario; onGuardar: (c: GuardarAjustes) => void }) {
  const [activo, setActivo] = useState(a.silencio_desde !== null);
  const [desde, setDesde] = useState(a.silencio_desde ?? '22:00');
  const [hasta, setHasta] = useState(a.silencio_hasta ?? '07:00');
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Horas de silencio</legend>
      <Casilla
        checked={activo}
        onChange={(v) => {
          setActivo(v);
          if (!v) onGuardar({ silencio_desde: null, silencio_hasta: null });
        }}
        etiqueta="No enviarme avisos en un horario"
      />
      {activo && (
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Desde">
            <Entrada type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
          <Boton onClick={() => onGuardar({ silencio_desde: desde, silencio_hasta: hasta })}>
            Guardar horario
          </Boton>
        </div>
      )}
    </fieldset>
  );
}

/**
 * PF-05: número de WhatsApp, consentimiento general y, por equipo, si acepta los avisos y las
 * menciones (WA-07). Sin consentimiento, Nexo no menciona a la persona en ningún aviso.
 */
export function WhatsAppPersonal() {
  const consulta = useWhatsAppYo();
  const acciones = useAccionesWhatsAppYo();
  return (
    <Tarjeta as="section" className="space-y-4 p-4 sm:p-5" data-name="NX/PF-05-WhatsApp">
      <h2 className="font-semibold">WhatsApp</h2>
      <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={2} />}>
        {(w) => {
          return (
            <>
              <RegistroWhatsApp w={w} variante="ajustes" />
              <DirectoPersonal w={w} />
              {w.equipos.length > 0 && (
                <div className="border-t border-line pt-3">
                  <h3 className="mb-1 text-sm font-semibold">Por equipo</h3>
                  <p className="mb-2 text-xs text-muted">
                    Si aceptas, los avisos del grupo pueden mencionarte (@tu nombre). Si no, salen
                    sin tu nombre.
                  </p>
                  <ul className="divide-y divide-line">
                    {w.equipos.map((eq) => (
                      <li key={eq.equipo_id} className="py-1">
                        <Interruptor
                          etiqueta={eq.nombre}
                          descripcion={
                            !eq.whatsapp_conectado
                              ? 'Este equipo aún no conecta WhatsApp.'
                              : eq.enlace_invitacion
                                ? `Únete al grupo: ${eq.enlace_invitacion}`
                                : undefined
                          }
                          checked={eq.consentimiento === true}
                          disabled={!w.consentimiento}
                          onChange={(v) =>
                            acciones.consentimiento.mutate(
                              { equipoId: eq.equipo_id, acepta: v },
                              { onError: avisar },
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          );
        }}
      </EstadosDatos>
    </Tarjeta>
  );
}

/** PF-06: visibilidad del estado y primer día de la semana; FALT-09: exportar y borrar mis datos. */
export function Privacidad() {
  const { consulta, guardar } = useAjustes();
  return (
    <EstadosDatos consulta={consulta} esqueleto={<EsqueletoTarjetas n={1} />}>
      {(a) => (
        <Tarjeta as="section" className="space-y-5 p-4 sm:p-5" data-name="NX/PF-06-Privacidad">
          <h2 className="font-semibold">Privacidad y datos</h2>
          <Interruptor
            etiqueta="Mostrar mi estado"
            descripcion="Tu equipo ve si estás en línea."
            checked={a.estado_visible}
            onChange={(estado_visible) => guardar.mutate({ estado_visible })}
          />
          <Radios
            nombre="primer_dia"
            etiqueta="La semana empieza en"
            horizontal
            valor={a.primer_dia}
            onChange={(primer_dia) => guardar.mutate({ primer_dia })}
            opciones={[
              { valor: 'lunes', etiqueta: 'Lunes' },
              { valor: 'domingo', etiqueta: 'Domingo' },
            ]}
          />
          <MisDatos />
          <Link
            to="/privacidad"
            className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
          >
            Aviso de privacidad <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </Tarjeta>
      )}
    </EstadosDatos>
  );
}

/** FALT-09: descargar todo lo que Nexo guarda de mí y eliminar la cuenta (con contraseña). */
function MisDatos() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const eliminar = useMutation({
    mutationFn: () =>
      api<{ eliminada: true }>('/yo/cuenta/eliminar', {
        metodo: 'POST',
        cuerpo: { contrasena, confirmacion },
      }),
    onSuccess: () => {
      qc.clear();
      toast('Tu cuenta se eliminó. Gracias por usar Nexo.');
      void nav('/', { replace: true });
    },
    onError: (e) => setError(mensajeDeError(e)),
  });
  return (
    <div className="space-y-4 border-t border-line pt-4" data-name="NX/FALT-09-Mis-datos">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Exportar mis datos</h3>
        <p className="text-sm text-muted">
          Descarga en un archivo JSON tu perfil, preferencias, equipos, tareas, comentarios,
          mensajes, reuniones y notificaciones. No incluye tu contraseña.
        </p>
        <a
          href={urlApi('/yo/datos/exportar')}
          download
          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-line px-3 text-sm font-medium hover:bg-surface"
        >
          <Download className="size-4" aria-hidden /> Descargar mis datos
        </a>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-danger">Eliminar mi cuenta</h3>
        <p className="text-sm text-muted">
          Sales de todos tus equipos, se borran tus tareas personales y tu número de WhatsApp, y tu
          nombre deja de aparecer en lo que aportaste. No se puede deshacer. Si eres líder de un
          equipo con más personas, primero transfiere el liderazgo.
        </p>
        {!abierto ? (
          <Boton variante="destructivo" onClick={() => setAbierto(true)}>
            <Trash2 className="size-4" aria-hidden /> Eliminar mi cuenta
          </Boton>
        ) : (
          <div className="space-y-3 rounded-[8px] border border-danger/40 p-3">
            <Campo etiqueta="Tu contraseña">
              <Contrasena
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Escribe ELIMINAR para confirmar" error={error}>
              <Entrada value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton
                variante="destructivo"
                cargando={eliminar.isPending}
                disabled={!contrasena || confirmacion !== 'ELIMINAR'}
                onClick={() => {
                  setError('');
                  eliminar.mutate();
                }}
              >
                Eliminar definitivamente
              </Boton>
              <Boton onClick={() => setAbierto(false)}>Cancelar</Boton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** PF-07: tus equipos y tu rol; salir de uno (el líder primero transfiere el liderazgo). */
export function MisEquipos() {
  const { data: yo } = useYo();
  const equipos = yo?.equipos ?? [];
  return (
    <Tarjeta as="section" className="space-y-3 p-4 sm:p-5" data-name="NX/PF-07-Mis-equipos">
      <h2 className="font-semibold">Mis equipos</h2>
      {equipos.length === 0 ? (
        <p className="text-sm text-muted">Todavía no perteneces a ningún equipo.</p>
      ) : (
        <ul className="divide-y divide-line">
          {equipos.map((e) => (
            <FilaEquipo key={e.id} e={e} />
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Link to="/app/equipos/nuevo" className="text-sm text-brand hover:underline">
          Crear un equipo
        </Link>
        <Link to="/app/equipos/unirse" className="text-sm text-brand hover:underline">
          Unirme con un código
        </Link>
      </div>
    </Tarjeta>
  );
}

function FilaEquipo({ e }: { e: EquipoDeUsuario }) {
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const salir = useMutation({
    mutationFn: () => api<{ salio: true }>(`/equipos/${e.id}/salir`, { metodo: 'POST' }),
    onSuccess: () => {
      toast(`Saliste de ${e.nombre}.`, 'info');
      void qc.invalidateQueries({ queryKey: claves.yo });
    },
    onError: avisar,
  });
  const dejar = async () => {
    const ok = await confirmar({
      titulo: `Salir de ${e.nombre}`,
      mensaje: 'Dejarás de ver el equipo. Tus tareas sin terminar quedan sin responsable.',
      confirmar: 'Salir del equipo',
      destructivo: true,
    });
    if (ok) salir.mutate();
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <Link
        to={`/app/e/${e.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
      >
        {e.nombre}
      </Link>
      <InsigniaRol rol={e.rol} />
      <Boton
        tamano="sm"
        variante="fantasma"
        disabled={e.rol === 'lider'}
        motivo="Transfiere el liderazgo antes de salir del equipo."
        cargando={salir.isPending}
        onClick={() => void dejar()}
      >
        Salir
      </Boton>
    </li>
  );
}

/** PF-08: atajos de teclado. */
export function Atajos() {
  const atajos: [string[], string][] = [
    [['Ctrl', 'K'], 'Buscar (⌘ K en Mac)'],
    [['N'], 'Nueva tarea o propuesta, según el espacio'],
    [['Esc'], 'Cerrar un diálogo o panel'],
    [['←', '→'], 'Mover una figura del Hill Chart (de 5 en 5)'],
    [['Tab'], 'Recorrer los controles de la pantalla'],
  ];
  return (
    <Tarjeta as="section" className="space-y-3 p-4 sm:p-5" data-name="NX/PF-08-Atajos">
      <h2 className="font-semibold">Atajos de teclado</h2>
      <ul className="divide-y divide-line">
        {atajos.map(([teclas, que]) => (
          <li key={que} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{que}</span>
            <span className="flex gap-1">
              {teclas.map((t) => (
                <Kbd key={t}>{t}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Los atajos de una letra no actúan mientras escribes en un campo.
      </p>
    </Tarjeta>
  );
}

/** PF-09: ayuda y contacto. */
export function Ayuda() {
  return (
    <Tarjeta as="section" className="space-y-3 p-4 sm:p-5" data-name="NX/PF-09-Ayuda">
      <h2 className="font-semibold">Ayuda</h2>
      <ul className="space-y-2 text-sm">
        <li>
          <Link to="/ayuda" className="text-brand hover:underline">
            Centro de ayuda
          </Link>{' '}
          — guías de tareas, votación, sprints y WhatsApp.
        </li>
        <li>
          <Link to="/contacto" className="text-brand hover:underline">
            Escríbenos
          </Link>{' '}
          — dudas o problemas con Nexo.
        </li>
        <li>
          <Link to="/como-funciona" className="text-brand hover:underline">
            Cómo funciona Nexo
          </Link>
        </li>
      </ul>
    </Tarjeta>
  );
}
