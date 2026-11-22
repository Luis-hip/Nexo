import { esquemaCrearSoporte, type CuentaParaSoporte, type SoporteCreado } from '@nexo/shared';
import {
  BarChart3,
  Copy,
  Inbox,
  LifeBuoy,
  LogOut,
  Mail,
  Search,
  ShieldCheck,
  Unlock,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { DosPasosAjustes } from '@/components/auth/DosPasos';
import { Logo } from '@/components/shell/Logo';
import {
  Banner,
  Boton,
  Campo,
  Casilla,
  Encabezado,
  Entrada,
  EsqueletoLista,
  EsqueletoTarjetas,
  EstadosDatos,
  Insignia,
  Tarjeta,
  cx,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useSalir, useYo } from '@/lib/consultas';
import { useCuenta, useDosPasos } from '@/lib/consultasAuth';
import { useMetricasContacto, usePendientesContacto } from '@/lib/consultasContacto';
import {
  useAccionesCuenta,
  useBitacora,
  useBuscarCuenta,
  useCrearSoporte,
  useEquipoSoporte,
  usePlataforma,
} from '@/lib/consultasSoporte';
import { toast } from '@/lib/toasts';
import { CambiarContrasena } from '@/pages/ajustes';

/**
 * Tablero del rol «Soporte de Nexo» (docs/15_Rol_Soporte.md). Separado de la app de personas: sin
 * espacio personal ni equipos. Hasta activar la verificación en dos pasos solo se ve esa pantalla.
 */

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function SoporteShell() {
  const yo = useYo();
  const loc = useLocation();
  const dosPasos = useDosPasos();
  const esSoporte = yo.data?.usuario.tipo_cuenta === 'soporte';
  const pendientes = usePendientesContacto(esSoporte && !!dosPasos.data?.activa).data?.nuevos ?? 0;
  // Mientras se activa la 2FA la pantalla no cambia, aunque ya esté activa: así se ven (una sola
  // vez) los códigos de respaldo hasta que la persona confirma que los guardó.
  const [activando, setActivando] = useState(false);
  const mostrarActivacion = !dosPasos.data?.activa || activando;
  if (yo.isPending) return <EsqueletoLista filas={4} />;
  if (yo.data === null || yo.data === undefined) {
    return <Navigate to={`/entrar?volver=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  // Una cuenta de persona no tiene tablero de soporte.
  if (!esSoporte) return <Navigate to="/app" replace />;
  const enlaces: [string, string, typeof Inbox, number?][] = [
    ['/soporte', 'Inicio', BarChart3],
    ['/soporte/contacto', 'Contacto', Inbox, pendientes],
    ['/soporte/cuentas', 'Cuentas', UserCog],
    ['/soporte/equipo', 'Equipo de soporte', Users],
    ['/soporte/cuenta', 'Mi cuenta', ShieldCheck],
  ];
  return (
    <div className="min-h-dvh bg-canvas" data-name="NX/SOP-Shell">
      <a href="#contenido" className="sr-only focus:not-sr-only">
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-raised/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2">
            <Logo />
            <Insignia tono="marca">
              <LifeBuoy className="size-3.5" aria-hidden /> Soporte
            </Insignia>
          </span>
          {!mostrarActivacion && (
            <nav
              aria-label="Secciones de soporte"
              className="order-3 w-full sm:order-none sm:w-auto"
            >
              <ul className="flex gap-1 overflow-x-auto">
                {enlaces.map(([a, t, I, n]) => (
                  <li key={a}>
                    <NavLink
                      to={a}
                      end={a === '/soporte'}
                      className={({ isActive }) =>
                        cx(
                          'inline-flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm whitespace-nowrap',
                          isActive
                            ? 'bg-brand/12 font-semibold text-brand'
                            : 'text-muted hover:bg-surface',
                        )
                      }
                    >
                      <I className="size-4" aria-hidden /> {t}
                      {!!n && (
                        <span
                          className="rounded-full bg-brand px-1.5 text-xs font-semibold text-on-brand tabular"
                          aria-label={`${n} nuevos`}
                        >
                          {n > 99 ? '99+' : n}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <Salir nombre={yo.data.usuario.nombre} />
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        {dosPasos.isPending ? (
          <EsqueletoTarjetas n={2} />
        ) : mostrarActivacion ? (
          <ActivarDosPasos
            onEmpezar={() => setActivando(true)}
            onTerminar={() => setActivando(false)}
          />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function Salir({ nombre }: { nombre: string }) {
  const salir = useSalir();
  const nav = useNavigate();
  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{nombre}</span>
      <Boton
        tamano="sm"
        variante="fantasma"
        icono={<LogOut className="size-4" />}
        cargando={salir.isPending}
        onClick={() => salir.mutate(undefined, { onSettled: () => nav('/entrar?salio=1') })}
      >
        Cerrar sesión
      </Boton>
    </div>
  );
}

/** Obligatoria para soporte (docs/15 §4): hasta activarla no hay más pantallas. */
function ActivarDosPasos({
  onEmpezar,
  onTerminar,
}: {
  onEmpezar: () => void;
  onTerminar: () => void;
}) {
  // Desde que se ve esta pantalla, se queda hasta cerrar los códigos de respaldo.
  useEffect(() => onEmpezar(), [onEmpezar]);
  return (
    <div className="mx-auto max-w-2xl space-y-4" data-name="NX/SOP-2FA">
      <Encabezado
        titulo="Activa la verificación en dos pasos"
        descripcion="Las cuentas de soporte la necesitan para entrar al tablero: protegen los mensajes y las cuentas de las personas."
      />
      <DosPasosAjustes onTerminar={onTerminar} />
    </div>
  );
}

// --- Inicio ------------------------------------------------------------------------------------

export function InicioSoporte() {
  const p = usePlataforma();
  const c = useMetricasContacto();
  return (
    <div className="space-y-5" data-name="NX/SOP-Inicio">
      <Encabezado
        titulo="Inicio"
        descripcion="Cómo está Nexo y qué necesita atención. Sin datos personales."
      />
      <EstadosDatos consulta={c} esqueleto={<EsqueletoTarjetas n={4} />}>
        {(m) => (
          <section aria-labelledby="t-contacto" className="space-y-2">
            <h2 id="t-contacto" className="text-sm font-semibold">
              Contacto (últimos 30 días)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra
                titulo="Nuevos sin atender"
                valor={m.por_estado.nuevo}
                destacada={m.por_estado.nuevo > 0}
              />
              <Cifra titulo="Abiertos" valor={m.abiertos} />
              <Cifra
                titulo="Primera respuesta"
                valor={m.primera_respuesta_horas === null ? '—' : `${m.primera_respuesta_horas} h`}
              />
              <Cifra
                titulo="Resolución"
                valor={m.resolucion_horas === null ? '—' : `${m.resolucion_horas} h`}
              />
            </div>
          </section>
        )}
      </EstadosDatos>
      <EstadosDatos consulta={p} esqueleto={<EsqueletoTarjetas n={4} />}>
        {(d) => {
          const max = Math.max(1, ...d.altas_por_semana.map((s) => s.altas));
          return (
            <section aria-labelledby="t-plataforma" className="space-y-2">
              <h2 id="t-plataforma" className="text-sm font-semibold">
                Plataforma
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Cifra titulo="Cuentas" valor={d.cuentas} />
                <Cifra titulo="Nuevas (7 días)" valor={d.nuevas_7_dias} />
                <Cifra titulo="Activas (30 días)" valor={d.activas_30_dias} />
                <Cifra titulo="Equipos activos" valor={d.equipos_activos} />
                <Cifra titulo="Correo verificado" valor={pct(d.verificadas, d.cuentas)} />
                <Cifra titulo="Con dos pasos" valor={pct(d.con_dos_pasos, d.cuentas)} />
                <Cifra titulo="Con Google" valor={pct(d.con_google, d.cuentas)} />
              </div>
              <Tarjeta className="space-y-2 p-4">
                <h3 className="text-sm font-semibold">Altas por semana</h3>
                <ol className="space-y-1.5" aria-label="Altas por semana">
                  {d.altas_por_semana.map((s) => (
                    <li
                      key={s.semana}
                      className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-xs"
                    >
                      <span className="tabular text-muted">{s.semana}</span>
                      <span className="h-3 rounded-full bg-line">
                        <span
                          className="block h-3 rounded-full bg-brand"
                          style={{ width: `${(s.altas / max) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular">{s.altas}</span>
                    </li>
                  ))}
                </ol>
              </Tarjeta>
            </section>
          );
        }}
      </EstadosDatos>
    </div>
  );
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} %` : '—');

function Cifra({
  titulo,
  valor,
  destacada,
}: {
  titulo: string;
  valor: number | string;
  destacada?: boolean;
}) {
  return (
    <Tarjeta className={cx('p-4', destacada && 'border-brand/50 bg-brand/8')}>
      <p className="text-sm text-muted">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{valor}</p>
    </Tarjeta>
  );
}

// --- Cuentas -----------------------------------------------------------------------------------

export function CuentasSoporte() {
  const buscar = useBuscarCuenta();
  const acc = useAccionesCuenta();
  const bitacora = useBitacora();
  const [correo, setCorreo] = useState('');
  const [cuenta, setCuenta] = useState<CuentaParaSoporte | null>(null);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setCuenta(null);
    buscar.mutate(correo.trim(), { onSuccess: setCuenta });
  };
  const avisar = (e: unknown) => toast(mensajeDeError(e), 'warn');
  return (
    <div className="space-y-5" data-name="NX/SOP-Cuentas">
      <Encabezado
        titulo="Ayuda con cuentas"
        descripcion="Busca una cuenta por su correo exacto para ver su estado y ayudarla. No se ve el contenido de sus equipos, y todo queda en la bitácora."
      />
      <form onSubmit={enviar} className="flex max-w-xl flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Campo etiqueta="Correo de la cuenta">
            <Entrada
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              autoComplete="off"
            />
          </Campo>
        </div>
        <Boton
          type="submit"
          variante="primario"
          icono={<Search className="size-4" />}
          cargando={buscar.isPending}
          disabled={correo.trim().length < 3}
        >
          Buscar
        </Boton>
      </form>
      {buscar.isError && <Banner tono="warn">{mensajeDeError(buscar.error)}</Banner>}
      {cuenta && (
        <Tarjeta className="max-w-2xl space-y-4 p-5" data-name="NX/SOP-Cuenta">
          <div>
            <h2 className="font-semibold">{cuenta.nombre}</h2>
            <p className="text-sm text-muted">{cuenta.correo}</p>
          </div>
          <dl className="grid grid-cols-[11rem_1fr] gap-1.5 text-sm">
            <dt className="text-muted">Creada</dt>
            <dd>{fecha(cuenta.creada_en)}</dd>
            <dt className="text-muted">Correo</dt>
            <dd>
              {cuenta.correo_verificado ? (
                <Insignia tono="ok">Verificado</Insignia>
              ) : (
                <Insignia tono="warn">Sin verificar</Insignia>
              )}
            </dd>
            <dt className="text-muted">Acceso</dt>
            <dd>
              {cuenta.bloqueada_hasta ? (
                <Insignia tono="danger">Bloqueada hasta {fecha(cuenta.bloqueada_hasta)}</Insignia>
              ) : (
                <Insignia tono="ok">Sin bloqueo</Insignia>
              )}
            </dd>
            <dt className="text-muted">Métodos</dt>
            <dd className="flex flex-wrap gap-1.5">
              {cuenta.tiene_contrasena && <Insignia tono="neutro">Contraseña</Insignia>}
              {cuenta.google && <Insignia tono="neutro">Google</Insignia>}
              {cuenta.dos_pasos && <Insignia tono="ok">Dos pasos</Insignia>}
            </dd>
            <dt className="text-muted">Equipos activos</dt>
            <dd className="tabular">{cuenta.equipos_activos}</dd>
            <dt className="text-muted">Última actividad</dt>
            <dd>{fecha(cuenta.ultima_actividad_en)}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            {!cuenta.correo_verificado && (
              <Boton
                icono={<Mail className="size-4" />}
                cargando={acc.verificacion.isPending}
                onClick={() =>
                  acc.verificacion.mutate(cuenta.id, {
                    onSuccess: (r) =>
                      toast(
                        r.enviado
                          ? 'Enviamos un enlace nuevo de verificación.'
                          : 'El enlace se generó, pero el correo no salió (sin proveedor de correo).',
                        r.enviado ? 'ok' : 'warn',
                      ),
                    onError: avisar,
                  })
                }
              >
                Reenviar verificación
              </Boton>
            )}
            {cuenta.bloqueada_hasta && (
              <Boton
                icono={<Unlock className="size-4" />}
                cargando={acc.desbloquear.isPending}
                onClick={() =>
                  acc.desbloquear.mutate(cuenta.id, {
                    onSuccess: (c) => {
                      setCuenta(c);
                      toast('Cuenta desbloqueada.');
                    },
                    onError: avisar,
                  })
                }
              >
                Desbloquear
              </Boton>
            )}
          </div>
        </Tarjeta>
      )}
      <section aria-labelledby="t-bitacora" className="space-y-2">
        <h2 id="t-bitacora" className="text-sm font-semibold">
          Bitácora
        </h2>
        <EstadosDatos consulta={bitacora} esqueleto={<EsqueletoLista filas={4} />}>
          {(b) =>
            b.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay acciones.</p>
            ) : (
              <ol className="divide-y divide-line rounded-[12px] border border-line bg-raised text-sm">
                {b.map((x) => (
                  <li key={x.id} className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5">
                    <span className="font-medium">{ACCION[x.accion]}</span>
                    <span className="text-muted">
                      {x.cuenta ?? (x.detalles.encontrada === false ? 'sin resultado' : '—')}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {x.actor?.nombre ?? '—'} · {fecha(x.creado_en)}
                    </span>
                  </li>
                ))}
              </ol>
            )
          }
        </EstadosDatos>
      </section>
    </div>
  );
}

const ACCION: Record<string, string> = {
  buscar_cuenta: 'Buscó una cuenta',
  desbloquear: 'Desbloqueó',
  reenviar_verificacion: 'Reenvió la verificación',
  crear_soporte: 'Dio de alta en soporte',
};

// --- Equipo de soporte -------------------------------------------------------------------------

export function EquipoSoporte() {
  const equipo = useEquipoSoporte();
  const crear = useCrearSoporte();
  const [abierto, setAbierto] = useState(false);
  const [v, setV] = useState({ correo: '', nombre: '', puede_dar_alta: false });
  const [error, setError] = useState<string>();
  const [creado, setCreado] = useState<SoporteCreado | null>(null);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = esquemaCrearSoporte.safeParse(v);
    if (!r.success) {
      setError(r.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    crear.mutate(r.data, {
      onSuccess: (c) => {
        setCreado(c);
        setAbierto(false);
        setV({ correo: '', nombre: '', puede_dar_alta: false });
      },
      onError: (er) => setError(mensajeDeError(er)),
    });
  };
  return (
    <div className="space-y-5" data-name="NX/SOP-Equipo">
      <Encabezado
        titulo="Equipo de soporte"
        descripcion="Las cuentas de soporte las da de alta otra cuenta de soporte autorizada o un desarrollador. Nadie puede elegir ser soporte al registrarse."
        acciones={
          !abierto && (
            <Boton
              variante="primario"
              icono={<UserPlus className="size-4" />}
              onClick={() => setAbierto(true)}
            >
              Dar de alta
            </Boton>
          )
        }
      />
      {creado && (
        <Banner tono="ok" onCerrar={() => setCreado(null)}>
          <div className="space-y-2">
            <p>
              Se creó la cuenta de <strong>{creado.nombre}</strong> ({creado.correo}).{' '}
              {creado.correo_enviado
                ? 'Le mandamos por correo el enlace para elegir su contraseña.'
                : 'El correo no salió: compártele este enlace (vence en 72 h y solo se muestra ahora).'}
            </p>
            {!creado.correo_enviado && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded-[6px] bg-surface px-2 py-1 text-xs">
                  {creado.enlace}
                </code>
                <Boton
                  tamano="sm"
                  icono={<Copy className="size-4" />}
                  onClick={() =>
                    void navigator.clipboard.writeText(creado.enlace).then(
                      () => toast('Enlace copiado.'),
                      () => toast('No se pudo copiar.', 'warn'),
                    )
                  }
                >
                  Copiar
                </Boton>
              </div>
            )}
          </div>
        </Banner>
      )}
      {abierto && (
        <Tarjeta as="section" className="max-w-xl space-y-3 p-5">
          <h2 className="font-semibold">Nueva cuenta de soporte</h2>
          <form onSubmit={enviar} className="space-y-3" noValidate>
            <Campo etiqueta="Nombre">
              <Entrada
                value={v.nombre}
                onChange={(e) => setV({ ...v, nombre: e.target.value })}
                maxLength={80}
              />
            </Campo>
            <Campo
              etiqueta="Correo"
              ayuda="Uno propio para soporte: un correo que ya tiene cuenta no se convierte."
            >
              <Entrada
                type="email"
                value={v.correo}
                onChange={(e) => setV({ ...v, correo: e.target.value })}
              />
            </Campo>
            <Casilla
              checked={v.puede_dar_alta}
              onChange={(x) => setV({ ...v, puede_dar_alta: x })}
              etiqueta="También puede dar de alta a otras cuentas de soporte"
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Boton type="submit" variante="primario" cargando={crear.isPending}>
                Dar de alta
              </Boton>
              <Boton variante="fantasma" onClick={() => setAbierto(false)}>
                Cancelar
              </Boton>
            </div>
          </form>
        </Tarjeta>
      )}
      <EstadosDatos consulta={equipo} esqueleto={<EsqueletoLista filas={3} />}>
        {(m) => (
          <ul className="divide-y divide-line rounded-[12px] border border-line bg-raised">
            {m.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="font-medium">{p.nombre}</span>
                <span className="text-muted">{p.correo}</span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {!p.activa && <Insignia tono="warn">Sin contraseña aún</Insignia>}
                  {p.dos_pasos ? (
                    <Insignia tono="ok">Dos pasos</Insignia>
                  ) : (
                    <Insignia tono="neutro">Sin dos pasos</Insignia>
                  )}
                  {p.permisos.includes('soporte.alta') && (
                    <Insignia tono="marca">Da de alta</Insignia>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </EstadosDatos>
    </div>
  );
}

// --- Mi cuenta ---------------------------------------------------------------------------------

export function MiCuentaSoporte() {
  const cuenta = useCuenta();
  return (
    <div className="max-w-2xl space-y-4" data-name="NX/SOP-Mi-cuenta">
      <Encabezado titulo="Mi cuenta" descripcion="Tu acceso al tablero de soporte." />
      {cuenta.data && (
        <Tarjeta className="p-4 text-sm">
          <dl className="grid grid-cols-[10rem_1fr] gap-2">
            <dt className="text-muted">Correo</dt>
            <dd>{cuenta.data.correo}</dd>
            <dt className="text-muted">Sesiones abiertas</dt>
            <dd className="tabular">{cuenta.data.sesiones_activas}</dd>
          </dl>
        </Tarjeta>
      )}
      <CambiarContrasena />
      <DosPasosAjustes />
    </div>
  );
}
