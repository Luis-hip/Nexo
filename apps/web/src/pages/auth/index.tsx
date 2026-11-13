import type { Yo } from '@nexo/shared';
import { Crown, FlaskConical, KeyRound, User } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { Logo } from '@/components/shell/Logo';
import {
  Avatar,
  Banner,
  Boton,
  Campo,
  Entrada,
  ErrorEstado,
  EsqueletoLista,
  EstadosDatos,
  Interruptor,
  Radios,
  Segmentado,
  Selector,
  cx,
} from '@/components/ui';
import { ErrorApi, mensajeDeError } from '@/lib/api';
import {
  useDevLogin,
  useGuardarPerfil,
  useGuardarPreferencias,
  useUsuariosDev,
  useYo,
} from '@/lib/consultas';
import { AvisoCookies } from '@/pages/publico/AvisoCookies';

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface pt-safe" data-name="NX/AUTH-layout">
      <header className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="Nexo, inicio">
          <Logo />
        </Link>
        <Link to="/" className="text-sm text-muted hover:text-fg">
          Volver al sitio
        </Link>
      </header>
      <main
        id="contenido"
        className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
      <AvisoCookies />
    </div>
  );
}

function Tarjeta({
  titulo,
  subtitulo,
  children,
  nombre,
  icono,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  nombre: string;
  icono?: ReactNode;
}) {
  return (
    <div
      className="anim-up rounded-[16px] border border-line bg-raised p-6 shadow-soft sm:p-8"
      data-name={nombre}
    >
      {icono && (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-brand/10 text-brand [&>svg]:size-6">
          {icono}
        </div>
      )}
      <h1 className="text-[22px] sm:text-[28px]">{titulo}</h1>
      {subtitulo && <p className="mt-1.5 text-sm text-muted">{subtitulo}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Solo se aceptan destinos internos, para no redirigir fuera de Nexo. */
const destinoSeguro = (volver: string | null) =>
  volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : null;

/**
 * AUTH-02 en la Fase 1: acceso de desarrollo. Mientras no existe la autenticación real
 * (Fase 5), se entra como cualquier usuario de la semilla; la API solo lo permite con
 * DEV_LOGIN_ENABLED=true y nunca en producción.
 */
export function Entrar() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const usuarios = useUsuariosDev();
  const login = useDevLogin();
  const [elegido, setElegido] = useState<string | null>(null);
  const noDisponible = usuarios.error instanceof ErrorApi && usuarios.error.estado === 404;

  const entrar = (correo: string) => {
    setElegido(correo);
    login.mutate(correo, {
      onSuccess: () => nav(destinoSeguro(sp.get('volver')) ?? '/app', { replace: true }),
    });
  };

  return (
    <Tarjeta
      titulo="Inicia sesión"
      subtitulo={sp.get('salio') ? 'Cerraste sesión correctamente.' : 'Qué bueno verte de nuevo.'}
      nombre="NX/AUTH-02-Inicio-sesion"
    >
      {noDisponible ? (
        <Banner tono="info">
          El inicio de sesión con correo y contraseña estará disponible próximamente.
        </Banner>
      ) : (
        <>
          <Banner tono="marca" icono={<FlaskConical />} className="mb-4">
            <strong>Acceso de desarrollo.</strong> Elige un usuario de la semilla para entrar con su
            rol. El registro y la contraseña llegan en la Fase 5.
          </Banner>
          {login.error && (
            <Banner tono="danger" className="mb-4">
              No pudimos iniciar la sesión. {mensajeDeError(login.error)}
            </Banner>
          )}
          <EstadosDatos consulta={usuarios} esqueleto={<EsqueletoLista filas={4} />}>
            {(lista) => (
              <ul className="divide-y divide-line rounded-[12px] border border-line">
                {lista.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={login.isPending}
                      onClick={() => entrar(u.correo)}
                      aria-busy={login.isPending && elegido === u.correo}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface disabled:opacity-60"
                    >
                      <Avatar persona={{ nombre: u.nombre }} tamano={36} conAnillo={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.nombre}</span>
                        <span className="block truncate text-xs text-muted">
                          {u.cargo ? `${u.cargo} · ` : ''}
                          {u.correo}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </EstadosDatos>
        </>
      )}
    </Tarjeta>
  );
}

/** Rutas de autenticación que se construyen en la Fase 5 (registro, recuperar, verificar…). */
export function AuthProximamente({ titulo }: { titulo: string }) {
  return (
    <Tarjeta
      titulo={titulo}
      subtitulo="Esta pantalla se construye en la Fase 5, junto con la autenticación real."
      nombre="NX/AUTH-proximamente"
    >
      <Link
        to="/entrar"
        className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
      >
        Ir a iniciar sesión
      </Link>
    </Tarjeta>
  );
}

/** AUTH-11: sesión expirada. */
export function SesionExpirada() {
  const [sp] = useSearchParams();
  const volver = destinoSeguro(sp.get('volver'));
  return (
    <Tarjeta
      titulo="Tu sesión expiró"
      subtitulo="Por seguridad, vuelve a iniciar sesión. Te llevaremos a donde estabas."
      nombre="NX/AUTH-11-Sesion-expirada"
    >
      <Link
        to={volver ? `/entrar?volver=${encodeURIComponent(volver)}` : '/entrar'}
        className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
      >
        Iniciar sesión
      </Link>
    </Tarjeta>
  );
}

/** ONB-01 a ONB-03: onboarding de 3 pasos. Requiere sesión. */
export function Bienvenida() {
  const consulta = useYo();
  if (consulta.isPending) return <EsqueletoLista filas={3} />;
  if (consulta.data === undefined) return <ErrorEstado onReintentar={() => consulta.refetch()} />;
  if (consulta.data === null) return <Navigate to="/entrar?volver=/bienvenida/1" replace />;
  return <PasosBienvenida yo={consulta.data} />;
}

type Inicio = 'solo' | 'crear' | 'unirme';
const CLAVE_INICIO = 'nexo.onb-inicio';
const DESTINO: Record<Inicio, string> = {
  solo: '/app/personal',
  crear: '/app/equipos/nuevo',
  unirme: '/app/equipos/unirse',
};

function PasosBienvenida({ yo }: { yo: Yo }) {
  const nav = useNavigate();
  const { paso } = useParams();
  const n = Math.min(3, Math.max(1, Number(paso) || 1));
  const perfil = useGuardarPerfil();
  const prefs = useGuardarPreferencias();
  const [nombre, setNombre] = useState(yo.usuario.nombre);
  const [zona, setZona] = useState(
    yo.usuario.zona_horaria || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [inicio, setInicio] = useState<Inicio>(
    () => (sessionStorage.getItem(CLAVE_INICIO) as Inicio | null) ?? 'solo',
  );
  const [error, setError] = useState('');
  const zonas = useMemo(
    () => [
      ...new Set([
        zona,
        'America/Mexico_City',
        'America/Monterrey',
        'America/Tijuana',
        'America/Bogota',
        'America/Lima',
        'Europe/Madrid',
      ]),
    ],
    [zona],
  );

  // Al terminar (u omitir) se deja pendiente el recorrido de primer uso.
  const terminar = (destino: string) =>
    prefs.mutate({ tour_visto: false }, { onSettled: () => nav(destino) });

  const siguiente = () => {
    if (n === 1) {
      if (nombre.trim().length < 2) {
        setError('Escribe tu nombre visible.');
        return;
      }
      perfil.mutate(
        { nombre: nombre.trim(), zona_horaria: zona },
        {
          onSuccess: () => nav('/bienvenida/2'),
          onError: (e) => setError(mensajeDeError(e)),
        },
      );
    } else if (n === 2) {
      sessionStorage.setItem(CLAVE_INICIO, inicio);
      nav('/bienvenida/3');
    } else terminar(DESTINO[inicio]);
  };

  return (
    <div
      className="anim-up rounded-[16px] border border-line bg-raised p-6 shadow-soft sm:p-8"
      data-name={`NX/ONB-0${n}-Bienvenida`}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="tabular">Paso {n} de 3</span>
        <button
          type="button"
          onClick={() => terminar('/app/personal')}
          className="h-9 font-medium text-brand"
        >
          Omitir
        </button>
      </div>
      <div
        className="mt-2 flex gap-1.5"
        role="progressbar"
        aria-valuenow={n}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label="Progreso del onboarding"
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cx('h-1.5 flex-1 rounded-full', i <= n ? 'bg-brand' : 'bg-line')}
          />
        ))}
      </div>

      {n === 1 && (
        <div className="mt-6 space-y-4">
          <h1 className="text-[22px] sm:text-[28px]">Tu perfil</h1>
          <Avatar persona={{ nombre: nombre || yo.usuario.nombre }} tamano={64} />
          <Campo etiqueta="Nombre visible" error={error}>
            <Entrada
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setError('');
              }}
              maxLength={80}
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Zona horaria" ayuda="Detectada automáticamente.">
            <Selector value={zona} onChange={(e) => setZona(e.target.value)}>
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Idioma">
            <Selector
              value={yo.preferencias.idioma}
              onChange={(e) => prefs.mutate({ idioma: e.target.value as 'es-MX' | 'en-US' })}
            >
              <option value="es-MX">Español (México)</option>
              <option value="en-US">English (US)</option>
            </Selector>
          </Campo>
        </div>
      )}

      {n === 2 && (
        <div className="mt-6 space-y-4">
          <h1 className="text-[22px] sm:text-[28px]">¿Cómo quieres empezar?</h1>
          <Radios
            nombre="inicio"
            etiqueta="Elige una opción"
            valor={inicio}
            onChange={setInicio}
            opciones={[
              {
                valor: 'solo',
                etiqueta: (
                  <span className="inline-flex items-center gap-2">
                    <User className="size-4" aria-hidden /> Trabajar en solitario
                  </span>
                ),
                descripcion: 'Tus tareas y tu calendario en tu Espacio personal.',
              },
              {
                valor: 'crear',
                etiqueta: (
                  <span className="inline-flex items-center gap-2">
                    <Crown className="size-4" aria-hidden /> Crear un equipo
                  </span>
                ),
                descripcion: 'Serás su líder e invitarás a tu equipo.',
              },
              {
                valor: 'unirme',
                etiqueta: (
                  <span className="inline-flex items-center gap-2">
                    <KeyRound className="size-4" aria-hidden /> Unirme con un código
                  </span>
                ),
                descripcion: 'Usa el código que te compartió el líder.',
              },
            ]}
          />
        </div>
      )}

      {n === 3 && (
        <div className="mt-6 space-y-4">
          <h1 className="text-[22px] sm:text-[28px]">Preferencias</h1>
          <div>
            <p className="mb-1.5 text-sm font-medium">Tema</p>
            <Segmentado
              etiqueta="Tema"
              valor={yo.preferencias.tema}
              onChange={(tema) => prefs.mutate({ tema })}
              className="w-full [&>button]:flex-1"
              opciones={[
                { valor: 'sistema', etiqueta: 'Sistema' },
                { valor: 'claro', etiqueta: 'Claro' },
                { valor: 'oscuro', etiqueta: 'Oscuro' },
              ]}
            />
          </div>
          <Interruptor
            etiqueta="Resumen diario"
            descripcion="Un resumen de tus pendientes cada mañana."
            checked={yo.preferencias.resumen_diario}
            onChange={(resumen_diario) => prefs.mutate({ resumen_diario })}
          />
        </div>
      )}

      <div className="mt-8 flex justify-between gap-2">
        {n > 1 ? <Boton onClick={() => nav(`/bienvenida/${n - 1}`)}>Atrás</Boton> : <span />}
        <Boton variante="primario" onClick={siguiente} cargando={perfil.isPending}>
          {n < 3 ? 'Continuar' : 'Terminar'}
        </Boton>
      </div>
    </div>
  );
}
