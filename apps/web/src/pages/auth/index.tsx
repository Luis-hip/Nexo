import type { Yo } from '@nexo/shared';
import { Crown, KeyRound, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { Logo } from '@/components/shell/Logo';
import {
  Avatar,
  Boton,
  Campo,
  Entrada,
  ErrorEstado,
  EsqueletoLista,
  Interruptor,
  Radios,
  Segmentado,
  Selector,
  cx,
} from '@/components/ui';
import { mensajeDeError } from '@/lib/api';
import { useGuardarPerfil, useGuardarPreferencias, useYo } from '@/lib/consultas';
import { AvisoCookies } from '@/pages/publico/AvisoCookies';
import { destinoSeguro, Tarjeta } from './comunes';

// Fase 5.1: AUTH-01 a AUTH-06 (registro, entrar, recuperar, restablecer y verificar).
export { Entrar, Recuperar, RecuperarEnviado, Registro, Restablecer, Verificar } from './Acceso';

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

/** Rutas de autenticación que aún no existen (2FA, AUTH-07: fase posterior). */
export function AuthProximamente({ titulo }: { titulo: string }) {
  return (
    <Tarjeta
      titulo={titulo}
      subtitulo="La verificación en dos pasos llega en una fase posterior."
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
