import type { Yo } from '@nexo/shared';
import {
  Bell,
  Check,
  ChevronsUpDown,
  Compass,
  HelpCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  UserCircle,
  Users,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import {
  Avatar,
  Banner,
  Boton,
  BotonIcono,
  ErrorEstado,
  Esqueleto,
  Hoja,
  InsigniaRol,
  Popover,
  Segmentado,
  SinConexion,
  cx,
} from '@/components/ui';
import { ErrorApi } from '@/lib/api';
import { aplicarPreferencias } from '@/lib/apariencia';
import { useGuardarPreferencias, useSalir, useYo } from '@/lib/consultas';
import { DetalleTareaPanel } from '@/pages/personal/DetalleTarea';
import { TareaForm } from '@/pages/personal/TareaForm';
import { Busqueda } from './Busqueda';
import { AccionesCtx, perfilEn, SesionCtx, type AccionesGlobales } from './contexto';
import { Logo } from './Logo';
import { navegacion, pie, type ItemNav } from './navegacion';
import { Tour } from './Tour';

function useEnLinea() {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener('online', f);
      window.addEventListener('offline', f);
      return () => {
        window.removeEventListener('online', f);
        window.removeEventListener('offline', f);
      };
    },
    () => navigator.onLine,
  );
}

/** Carga la sesión antes de pintar la app; sin sesión, manda a entrar. */
export function AppShell() {
  const consulta = useYo();
  const loc = useLocation();
  if (consulta.isPending) return <ShellCargando />;
  if (consulta.data === undefined) {
    const sinConexion =
      consulta.error instanceof ErrorApi && consulta.error.codigo === 'sin_conexion';
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        {sinConexion ? (
          <SinConexion onReintentar={() => consulta.refetch()} />
        ) : (
          <ErrorEstado onReintentar={() => consulta.refetch()} />
        )}
      </div>
    );
  }
  if (consulta.data === null) {
    return (
      <Navigate to={`/entrar?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
    );
  }
  return <Shell yo={consulta.data} />;
}

function ShellCargando() {
  return (
    <div
      className="mx-auto max-w-[1280px] space-y-4 px-4 py-6"
      role="status"
      aria-label="Cargando Nexo"
    >
      <Esqueleto className="h-10 w-48" />
      <Esqueleto className="h-40" />
      <Esqueleto className="h-24" />
    </div>
  );
}

function Shell({ yo }: { yo: Yo }) {
  const nav = useNavigate();
  const { equipo } = useParams();
  const [sp, setSp] = useSearchParams();
  const enLinea = useEnLinea();
  const equipoId = equipo ?? null;
  const perfil = perfilEn(yo, equipoId) ?? 'personal';
  const n = navegacion(perfil, equipoId);
  const [masAbierto, setMasAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState(false);
  const guardarPrefs = useGuardarPreferencias();
  const [tour, setTour] = useState(!yo.preferencias.tour_visto);
  const cerrarTour = () => {
    setTour(false);
    if (!yo.preferencias.tour_visto) guardarPrefs.mutate({ tour_visto: true });
  };

  // Las preferencias guardadas en el servidor mandan sobre las de este navegador.
  const { preferencias } = yo;
  useEffect(() => aplicarPreferencias(preferencias), [preferencias]);
  const [formTarea, setFormTarea] = useState(false);
  const tareaParam = sp.get('tarea');

  const acciones: AccionesGlobales = {
    nuevaTarea: () => setFormTarea(true),
    abrirTarea: (id) =>
      setSp((previo) => {
        const p = new URLSearchParams(previo);
        p.set('tarea', id);
        return p;
      }),
  };
  const cerrarTarea = () => {
    const p = new URLSearchParams(sp);
    p.delete('tarea');
    setSp(p, { replace: true });
  };

  // En la Fase 1 solo se crean tareas personales; en un equipo el botón llega con la Fase 2.
  const crear = !equipoId ? { etiqueta: 'Nueva tarea', accion: () => setFormTarea(true) } : null;

  // Atajos de teclado globales: Ctrl/⌘+K busca, N crea.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const escribiendo =
        el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBusqueda(true);
        return;
      }
      if (escribiendo || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role=dialog][aria-modal=true]')) return;
      if (e.key.toLowerCase() === 'n' && crear) {
        e.preventDefault();
        crear.accion();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <SesionCtx.Provider value={yo}>
      <AccionesCtx.Provider value={acciones}>
        <div className="min-h-dvh sm:pl-20 lg:pl-64" data-name="NX/shell">
          {/* Barra lateral (escritorio) */}
          <aside
            className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex"
            aria-label="Navegación principal"
            data-cmp="cmp/navegacion/barra-lateral"
          >
            <div className="flex h-16 items-center px-4">
              <Link
                to="/"
                className="flex items-center gap-2"
                aria-label="Nexo, ir al sitio público"
              >
                <Logo />
              </Link>
            </div>
            <div className="px-3 pb-2">
              <SelectorEspacios yo={yo} equipoId={equipoId} ancho />
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-2">
              {(['Trabajo', 'Comunicación', 'Gestión'] as const).map((g) => {
                const items = n.lateral.filter((i) => i.grupo === g);
                if (!items.length) return null;
                return (
                  <div key={g} className="mb-4">
                    <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
                      {g}
                    </p>
                    <ul className="space-y-0.5">
                      {items.map((i) => (
                        <li key={i.clave}>
                          <EnlaceNav item={i} variante="lateral" />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
            <div className="space-y-0.5 border-t border-line px-3 py-3">
              {pie().map((i) => (
                <EnlaceNav key={i.clave} item={i} variante="lateral" />
              ))}
            </div>
          </aside>

          {/* Rail (tablet) */}
          <nav
            className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col items-center gap-1 border-r border-line bg-surface py-3 sm:flex lg:hidden"
            aria-label="Navegación principal"
            data-cmp="cmp/navegacion/rail"
          >
            <Link to="/" aria-label="Nexo" className="mb-2">
              <Logo soloIcono />
            </Link>
            {n.lateral.slice(0, 7).map((i) => (
              <EnlaceNav key={i.clave} item={i} variante="rail" />
            ))}
            <button
              type="button"
              onClick={() => setMasAbierto(true)}
              className="flex w-16 flex-col items-center gap-1 rounded-[10px] py-2 text-[11px] text-muted hover:bg-raised hover:text-fg"
            >
              <MoreHorizontal className="size-6" aria-hidden />
              Más
            </button>
          </nav>

          {/* Barra superior */}
          <header
            className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur pt-safe"
            data-cmp="cmp/navegacion/barra-superior"
          >
            <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-1.5 px-3 sm:h-16 sm:gap-2 sm:px-6 lg:px-8">
              <div className="min-w-0 flex-1 lg:hidden">
                <SelectorEspacios yo={yo} equipoId={equipoId} />
              </div>
              <button
                type="button"
                onClick={() => setBusqueda(true)}
                className="hidden h-10 w-full max-w-md items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-sm text-muted hover:border-line-strong lg:flex"
                data-tour="buscar"
              >
                <Search className="size-[18px]" aria-hidden />
                <span className="flex-1 text-left">Buscar tareas…</span>
                <kbd className="rounded border border-line px-1.5 text-xs">Ctrl K</kbd>
              </button>
              <div className="hidden flex-1 lg:block" />
              <BotonIcono etiqueta="Buscar" onClick={() => setBusqueda(true)} className="lg:hidden">
                <Search className="size-5" />
              </BotonIcono>
              {crear && (
                <Boton
                  variante="primario"
                  tamano="sm"
                  icono={<Plus className="size-4" />}
                  onClick={crear.accion}
                  className="max-sm:hidden"
                  data-tour="crear"
                >
                  {crear.etiqueta}
                </Boton>
              )}
              <BotonIcono
                etiqueta="Notificaciones"
                onClick={() => nav('/app/notificaciones')}
                data-tour="notificaciones"
              >
                <Bell className="size-5" />
              </BotonIcono>
              <MenuPerfil yo={yo} equipoId={equipoId} onTour={() => setTour(true)} />
            </div>
          </header>

          <main
            id="contenido"
            tabIndex={-1}
            className="mx-auto max-w-[1280px] px-4 pt-4 pb-[calc(104px+env(safe-area-inset-bottom))] outline-none sm:px-6 sm:pt-6 sm:pb-12 lg:px-8"
          >
            {!enLinea && (
              <Banner tono="danger" icono={<WifiOff />} className="mb-4">
                <strong>Sin conexión.</strong> No podrás guardar cambios hasta que vuelva la
                conexión.
              </Banner>
            )}
            <Outlet />
          </main>

          {/* Botón flotante (móvil) */}
          {crear && (
            <button
              type="button"
              onClick={crear.accion}
              aria-label={crear.etiqueta}
              className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-[16px] bg-brand text-on-brand shadow-modal sm:hidden"
              data-cmp="cmp/acciones/boton-flotante"
            >
              <Plus className="size-6" aria-hidden />
            </button>
          )}

          {/* Barra inferior (móvil) */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur pb-safe sm:hidden"
            aria-label="Navegación principal"
            data-cmp="cmp/navegacion/barra-inferior"
          >
            <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-1">
              {n.inferior.map((i) => (
                <li key={i.clave} className="flex-1">
                  <EnlaceNav item={i} variante="inferior" />
                </li>
              ))}
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setMasAbierto(true)}
                  aria-haspopup="dialog"
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted"
                >
                  <MoreHorizontal className="size-6" aria-hidden />
                  Más
                </button>
              </li>
            </ul>
          </nav>

          <Hoja
            abierto={masAbierto}
            onCerrar={() => setMasAbierto(false)}
            titulo="Más"
            nombre="NX/navegacion-mas"
          >
            <ul className="grid grid-cols-3 gap-2 pb-2">
              {[
                ...n.lateral.filter((i) => !n.inferior.includes(i) && !n.mas.includes(i)),
                ...n.mas,
              ].map((i) => (
                <li key={i.clave}>
                  <Link
                    to={i.ruta}
                    onClick={() => setMasAbierto(false)}
                    className="flex flex-col items-center gap-2 rounded-[12px] border border-line p-3 text-center text-sm hover:bg-surface"
                  >
                    <i.icono className="size-6 text-muted" aria-hidden />
                    {i.etiqueta}
                  </Link>
                </li>
              ))}
            </ul>
          </Hoja>

          <Busqueda abierto={busqueda} onCerrar={() => setBusqueda(false)} />
          <Tour abierto={tour} onCerrar={cerrarTour} />
          {formTarea && <TareaForm abierto onCerrar={() => setFormTarea(false)} />}
          {tareaParam && <DetalleTareaPanel id={tareaParam} onCerrar={cerrarTarea} />}
        </div>
      </AccionesCtx.Provider>
    </SesionCtx.Provider>
  );
}

function EnlaceNav({
  item,
  variante,
}: {
  item: ItemNav;
  variante: 'lateral' | 'rail' | 'inferior';
}) {
  const loc = useLocation();
  const activo = item.exacto
    ? loc.pathname === item.ruta
    : loc.pathname === item.ruta || loc.pathname.startsWith(item.ruta + '/');
  const I = item.icono;
  if (variante === 'lateral')
    return (
      <NavLink
        to={item.ruta}
        end={item.exacto}
        aria-current={activo ? 'page' : undefined}
        className={cx(
          'flex h-10 items-center gap-3 rounded-[8px] px-3 text-sm transition-colors',
          activo
            ? 'bg-raised font-medium text-fg shadow-soft'
            : 'text-muted hover:bg-raised/60 hover:text-fg',
        )}
      >
        <I className={cx('size-5', activo && 'text-brand')} aria-hidden />
        {item.etiqueta}
      </NavLink>
    );
  if (variante === 'rail')
    return (
      <NavLink
        to={item.ruta}
        end={item.exacto}
        aria-current={activo ? 'page' : undefined}
        className={cx(
          'flex w-16 flex-col items-center gap-1 rounded-[10px] py-2 text-[11px] transition-colors',
          activo
            ? 'bg-raised font-medium text-fg shadow-soft'
            : 'text-muted hover:bg-raised/60 hover:text-fg',
        )}
      >
        <I className={cx('size-6', activo && 'text-brand')} aria-hidden />
        <span className="max-w-full truncate px-1">{item.etiqueta}</span>
      </NavLink>
    );
  return (
    <NavLink
      to={item.ruta}
      end={item.exacto}
      aria-current={activo ? 'page' : undefined}
      className={cx(
        'flex h-full flex-col items-center justify-center gap-0.5 text-[11px]',
        activo ? 'font-semibold text-brand' : 'text-muted',
      )}
    >
      <span
        className={cx(
          'grid h-7 w-12 place-items-center rounded-full transition-colors',
          activo && 'bg-brand/12',
        )}
      >
        <I className="size-6" aria-hidden />
      </span>
      <span className="max-w-full truncate px-0.5">{item.etiqueta}</span>
    </NavLink>
  );
}

const ROL_TEXTO = { lider: 'Líder', integrante: 'Integrante', invitado: 'Invitado' } as const;
const inicialEquipo = (nombre: string) => nombre.replace('Equipo ', '').charAt(0);

/** GL-02: selector de espacios (Personal + cada equipo con su rol). */
export function SelectorEspacios({
  yo,
  equipoId,
  ancho,
}: {
  yo: Yo;
  equipoId: string | null;
  ancho?: boolean;
}) {
  const nav = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const actual = yo.equipos.find((e) => e.id === equipoId);
  const ir = (ruta: string) => {
    setAbierto(false);
    nav(ruta);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        data-cmp="cmp/navegacion/selector-espacios"
        data-tour="espacios"
        className={cx(
          'flex h-11 max-w-full min-w-0 items-center gap-2 rounded-[10px] px-2 text-left hover:bg-surface',
          ancho && 'w-full border border-line bg-raised px-3',
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-brand/12 text-sm font-semibold text-brand">
          {actual ? inicialEquipo(actual.nombre) : <UserCircle className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {actual?.nombre ?? 'Espacio personal'}
          </span>
          <span className="block truncate text-xs text-muted">
            {actual ? ROL_TEXTO[actual.rol] : 'Solo tú'}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      <Popover
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        anclaRef={ref}
        etiqueta="Cambiar de espacio"
        ancho={320}
      >
        <div className="p-2">
          <p className="px-2 py-1.5 text-xs font-medium text-muted uppercase">Espacios</p>
          <button
            type="button"
            onClick={() => ir('/app/personal')}
            className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-surface"
          >
            <span className="grid size-8 place-items-center rounded-[8px] bg-surface">
              <UserCircle className="size-5 text-muted" aria-hidden />
            </span>
            <span className="flex-1 text-sm font-medium">Espacio personal</span>
            {!equipoId && <Check className="size-4 text-brand" aria-label="Actual" />}
          </button>
          {yo.equipos.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => ir(`/app/e/${e.id}`)}
              className="flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-surface"
            >
              <span className="grid size-8 place-items-center rounded-[8px] bg-brand/12 text-sm font-semibold text-brand">
                {inicialEquipo(e.nombre)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.nombre}</span>
              <InsigniaRol rol={e.rol} />
              {equipoId === e.id && <Check className="size-4 text-brand" aria-label="Actual" />}
            </button>
          ))}
          <div className="my-2 h-px bg-line" />
          <Link
            to="/app/equipos/nuevo"
            onClick={() => setAbierto(false)}
            className="flex min-h-11 items-center gap-3 rounded-[10px] px-2 text-sm text-brand hover:bg-surface"
          >
            <Plus className="size-4" aria-hidden /> Crear un equipo
          </Link>
          <Link
            to="/app/equipos/unirse"
            onClick={() => setAbierto(false)}
            className="flex min-h-11 items-center gap-3 rounded-[10px] px-2 text-sm text-brand hover:bg-surface"
          >
            <Users className="size-4" aria-hidden /> Unirme con un código
          </Link>
        </div>
      </Popover>
    </>
  );
}

/** GL-03: menú de perfil. */
function MenuPerfil({
  yo,
  equipoId,
  onTour,
}: {
  yo: Yo;
  equipoId: string | null;
  onTour: () => void;
}) {
  const nav = useNavigate();
  const guardarPrefs = useGuardarPreferencias();
  const salir = useSalir();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const persona = {
    nombre: yo.usuario.nombre,
    avatarUrl: yo.usuario.avatar_url,
    colorIdx: yo.equipos.find((e) => e.id === equipoId)?.color_idx,
  };
  const item =
    'flex min-h-11 w-full items-center gap-3 rounded-[8px] px-3 text-sm hover:bg-surface';
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-label={`Menú de perfil de ${yo.usuario.nombre}`}
        aria-expanded={abierto}
        className="grid size-11 shrink-0 place-items-center rounded-full"
        data-cmp="cmp/navegacion/menu-perfil"
      >
        <Avatar persona={persona} tamano={32} />
      </button>
      <Popover
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        anclaRef={ref}
        etiqueta="Menú de perfil"
        ancho={300}
      >
        <div className="flex items-center gap-3 border-b border-line p-4">
          <Avatar persona={persona} tamano={40} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{yo.usuario.nombre}</p>
            <p className="truncate text-sm text-muted">{yo.usuario.correo}</p>
          </div>
        </div>
        <div
          className="p-2"
          onClick={(e) =>
            (e.target as HTMLElement).closest('a,[data-cerrar-menu]') && setAbierto(false)
          }
        >
          <Link to="/ajustes/perfil" className={item}>
            <UserCircle className="size-[18px] text-muted" aria-hidden /> Perfil
          </Link>
          <Link to="/ajustes/cuenta" className={item}>
            <Settings className="size-[18px] text-muted" aria-hidden /> Ajustes
          </Link>
          <div className="px-3 py-2">
            <p className="mb-1.5 text-xs text-muted">Tema</p>
            <Segmentado
              etiqueta="Tema"
              valor={yo.preferencias.tema}
              onChange={(tema) => guardarPrefs.mutate({ tema })}
              tamano="sm"
              className="w-full [&>button]:flex-1"
              opciones={[
                { valor: 'sistema', etiqueta: 'Sistema' },
                { valor: 'claro', etiqueta: 'Claro' },
                { valor: 'oscuro', etiqueta: 'Oscuro' },
              ]}
            />
          </div>
          <Link to="/ajustes/ayuda" className={item}>
            <HelpCircle className="size-[18px] text-muted" aria-hidden /> Ayuda
          </Link>
          <button type="button" data-cerrar-menu onClick={onTour} className={item}>
            <Compass className="size-[18px] text-muted" aria-hidden /> Ver el recorrido
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            data-cerrar-menu
            onClick={() => salir.mutate(undefined, { onSettled: () => nav('/entrar?salio=1') })}
            className={cx(item, 'text-danger-text')}
          >
            <LogOut className="size-[18px]" aria-hidden /> Cerrar sesión
          </button>
        </div>
      </Popover>
    </>
  );
}
