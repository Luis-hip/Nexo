import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router';
import {
  Menu as MenuIcon,
  X,
  MessageCircle,
  Bell,
  KanbanSquare,
  Users,
  Crown,
  User,
  Eye,
  ArrowRight,
  Zap,
  Clock,
  CheckCircle2,
  Search,
  Flag,
  CalendarDays,
  BarChart3,
  MessageSquareShare,
  Inbox,
  Layers,
  Send,
  Sun,
  Moon,
  Monitor,
  FileQuestion,
  ServerCrash,
  RefreshCw,
  BookOpen,
  ShieldCheck,
  Heart,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { esquemaContacto, type Contacto as DatosContacto } from '@nexo/shared';
import { api, mensajeDeError } from '@/lib/api';
import { guardarApariencia, useApariencia, useTema } from '@/lib/apariencia';
import { Logo } from '@/components/shell/Logo';
import {
  Acordeon,
  AreaTexto,
  Banner,
  Boton,
  Buscador,
  Campo,
  Entrada,
  FormaSvg,
  Radios,
  Segmentado,
  Tarjeta,
  Vacio,
  cx,
} from '@/components/ui';
import { HillChart, type PuntoHill } from '@/components/charts/HillChart';
import { BurbujaWA } from '@/components/whatsapp/BurbujaWA';
import { AvisoCookies } from './AvisoCookies';
import { ARTICULOS, FAQ } from './contenido';
import { colorDeIntegrante } from '@/lib/color';

const enlace = 'text-sm text-muted hover:text-fg';

function SelectorTema({ compacto }: { compacto?: boolean }) {
  const p = useApariencia();
  return (
    <Segmentado
      etiqueta="Tema"
      tamano="sm"
      valor={p.tema}
      onChange={(v) => guardarApariencia({ tema: v })}
      opciones={[
        {
          valor: 'sistema',
          etiqueta: compacto ? <Monitor className="size-4" aria-label="Sistema" /> : 'Sistema',
        },
        {
          valor: 'claro',
          etiqueta: compacto ? <Sun className="size-4" aria-label="Claro" /> : 'Claro',
        },
        {
          valor: 'oscuro',
          etiqueta: compacto ? <Moon className="size-4" aria-label="Oscuro" /> : 'Oscuro',
        },
      ]}
    />
  );
}

export { AvisoCookies };

export function PublicoLayout() {
  const [abierto, setAbierto] = useState(false);
  const nav = [
    ['/caracteristicas', 'Características'],
    ['/como-funciona', 'Cómo funciona'],
    ['/whatsapp-info', 'WhatsApp'],
    ['/ayuda', 'Ayuda'],
  ];
  return (
    <div className="flex min-h-dvh flex-col" data-name="NX/PUB-layout">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur pt-safe">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="Nexo, inicio">
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-6 lg:flex" aria-label="Principal">
            {nav.map(([r = '/', t]) => (
              <NavLink
                key={r}
                to={r}
                className={({ isActive }) => cx(enlace, isActive && 'font-medium text-fg')}
              >
                {t}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1" />
          <div className="hidden lg:block">
            <SelectorTema compacto />
          </div>
          <Link
            to="/entrar"
            className="hidden h-10 items-center px-3 text-sm font-medium sm:inline-flex"
          >
            Iniciar sesión
          </Link>
          <Link
            to="/registro"
            className="hidden h-10 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand sm:inline-flex"
          >
            Empezar gratis
          </Link>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-[8px] lg:hidden"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            onClick={() => setAbierto(!abierto)}
          >
            {abierto ? <X className="size-6" /> : <MenuIcon className="size-6" />}
          </button>
        </div>
        {abierto && (
          <div
            className="anim-fade fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top))] bottom-0 z-40 overflow-y-auto bg-canvas px-4 pt-4 pb-10 lg:hidden"
            role="dialog"
            aria-label="Menú"
          >
            <nav
              className="flex flex-col"
              aria-label="Menú móvil"
              onClick={() => setAbierto(false)}
            >
              {[
                ...nav,
                ['/para-quien', 'Para quién'],
                ['/acerca', 'Acerca de'],
                ['/contacto', 'Contacto'],
              ].map(([r = '/', t]) => (
                <Link
                  key={r}
                  to={r}
                  className="flex min-h-14 items-center border-b border-line text-lg font-medium"
                >
                  {t}
                </Link>
              ))}
            </nav>
            <div className="mt-6 space-y-3">
              <SelectorTema />
              <Link
                to="/registro"
                className="flex h-12 items-center justify-center rounded-[10px] bg-brand font-medium text-on-brand"
              >
                Empezar gratis
              </Link>
              <Link
                to="/entrar"
                className="flex h-12 items-center justify-center rounded-[10px] border border-line font-medium"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        )}
      </header>
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div className="space-y-3">
            <Logo />
            <p className="text-sm text-muted">Tu equipo, en una sola conversación.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Producto</p>
            <ul className="space-y-2">
              {[
                ['/caracteristicas', 'Características'],
                ['/como-funciona', 'Cómo funciona'],
                ['/whatsapp-info', 'WhatsApp'],
                ['/para-quien', 'Para quién'],
              ].map(([r = '/', t]) => (
                <li key={r}>
                  <Link to={r} className={enlace}>
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Nexo</p>
            <ul className="space-y-2">
              {[
                ['/acerca', 'Acerca de'],
                ['/contacto', 'Contacto'],
                ['/ayuda', 'Centro de ayuda'],
              ].map(([r = '/', t]) => (
                <li key={r}>
                  <Link to={r} className={enlace}>
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Legal</p>
            <ul className="space-y-2">
              {[
                ['/terminos', 'Términos de uso'],
                ['/privacidad', 'Privacidad'],
              ].map(([r = '/', t]) => (
                <li key={r}>
                  <Link to={r} className={enlace}>
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="border-t border-line py-4 text-center text-xs text-muted">
          © {new Date().getFullYear()} Nexo
        </p>
      </footer>
      <AvisoCookies />
    </div>
  );
}

const seccion = 'mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8';

/** Tareas de ejemplo para las vistas del producto (no son datos reales). */
function useDemoTareas(): PuntoHill[] {
  const base = (
    id: string,
    titulo: string,
    responsable: string,
    colorIdx: number,
    estado: PuntoHill['estado'],
    progreso: number,
    dias: number,
  ): PuntoHill => ({
    id,
    codigo: id,
    titulo,
    responsable,
    colorIdx,
    estado,
    progreso,
    vence_en: new Date(Date.now() + dias * 86_400_000).toISOString(),
    resultado: estado === 'completada' ? 'a_tiempo' : null,
  });
  return [
    base('A', 'Diseñar vista de reportes', 'Daniela', 2, 'en_curso', 62, 4),
    base('B', 'API de notificaciones', 'Carlos', 1, 'en_curso', 48, 3),
    base('C', 'Integración con WhatsApp', 'Emilio', 3, 'atascada', 35, 0.6),
    base('D', 'Login y recuperación', 'Fernanda', 4, 'completada', 100, -2),
    base('E', 'Tablero con arrastrar y soltar', 'Gabriel', 5, 'en_curso', 76, 5),
    base('F', 'Chat por tarea', 'Hilda', 6, 'habilitada', 12, 8),
    base('G', 'Pruebas de usabilidad', 'Daniela', 2, 'atascada', 20, -1),
  ];
}

function MockResumen() {
  const tareas = useDemoTareas();
  return (
    <div
      className="rounded-[16px] border border-line bg-raised p-3 shadow-modal sm:p-4"
      aria-label="Vista del producto: Resumen con Hill Chart"
      role="img"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-line" />
          ))}
        </span>
        <span className="ml-2 text-xs text-muted">Equipo Nexo · Sprint 3 · día 6 de 14</span>
      </div>
      <div className="pointer-events-none">
        <HillChart puntos={tareas} simplificado alto={200} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        {[
          ['Triaje', '3'],
          ['WhatsApp', '4'],
          ['Entregas', '5'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[10px] bg-surface p-2">
            <p className="text-muted">{k}</p>
            <p className="text-base font-semibold tabular">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const tareas = useDemoTareas();
  const [sel, setSel] = useState<string | null>(null);
  const t = tareas.find((x) => x.id === sel);
  const tema = useTema();
  return (
    <div data-name="NX/PUB-01-Landing">
      <section
        className={cx(seccion, 'grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:py-24')}
      >
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
            <MessageSquareShare className="size-3.5 text-brand" aria-hidden /> Con avisos al grupo
            de WhatsApp
          </p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[40px]">
            Tu equipo, en una sola conversación
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Tareas, chat y avisos en un mismo lugar, para que nada se pierda entre grupos y hojas de
            cálculo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/registro"
              className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-brand px-6 font-medium text-on-brand"
            >
              Empezar gratis <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              to="/como-funciona"
              className="inline-flex h-12 items-center rounded-[10px] border border-line px-6 font-medium hover:bg-surface"
            >
              Ver cómo funciona
            </Link>
          </div>
        </div>
        <MockResumen />
      </section>
      <section className="border-y border-line bg-surface py-14">
        <div className={seccion}>
          <h2 className="text-[22px] sm:text-[28px]">Del caos al ritmo del equipo</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [
                KanbanSquare,
                'Tareas dispersas',
                'Un tablero con flujo claro y triaje: cada tarea tiene responsable, fecha y estado.',
              ],
              [
                MessageCircle,
                'Comunicación fragmentada',
                'Chat del equipo y de cada tarea, con menciones y mensajes convertibles en tareas.',
              ],
              [
                Bell,
                'Avisos perdidos',
                'Notificaciones inteligentes y avisos al grupo de WhatsApp que el líder revisa antes de enviar.',
              ],
            ].map(([I, ti, tx]) => {
              const Ic = I as typeof Bell;
              return (
                <Tarjeta key={ti as string} className="p-5">
                  <Ic className="size-6 text-brand" aria-hidden />
                  <h3 className="mt-3 font-semibold">{ti as string}</h3>
                  <p className="mt-1 text-sm text-muted">{tx as string}</p>
                </Tarjeta>
              );
            })}
          </div>
        </div>
      </section>
      <section className={cx(seccion, 'py-14')}>
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div>
            <h2 className="text-[22px] sm:text-[28px]">El Hill Chart: el avance de un vistazo</h2>
            <p className="mt-2 text-muted">Pasa el cursor o toca una figura para ver su tarea.</p>
            <Tarjeta className="mt-6 p-3 sm:p-5">
              <HillChart puntos={tareas} onAbrir={setSel} etiqueta="Hill Chart de demostración" />
            </Tarjeta>
            {t && (
              <p className="mt-3 text-sm" aria-live="polite">
                Seleccionaste <strong>{t.titulo}</strong> · {t.progreso} %.
              </p>
            )}
          </div>
          <div className="space-y-4 text-sm">
            <h3 className="font-semibold">Leyenda</h3>
            <ul className="space-y-2">
              {(['triangulo', 'circulo', 'cuadrado'] as const).map((f, i) => (
                <li key={f} className="flex items-center gap-2">
                  <FormaSvg forma={f} color="var(--text-secondary)" tamano={16} />
                  {
                    [
                      'Triángulo: atascada',
                      'Círculo: avanza con normalidad',
                      'Cuadrado: completada',
                    ][i]
                  }
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <FormaSvg forma="circulo" color="var(--text-secondary)" tamano={16} anillo="warn" />{' '}
                Anillo ámbar: vence pronto
              </li>
              <li className="flex items-center gap-2">
                <FormaSvg
                  forma="circulo"
                  color="var(--text-secondary)"
                  tamano={16}
                  anillo="danger"
                />{' '}
                Anillo rojo: vencida
              </li>
            </ul>
            <p className="flex flex-wrap items-center gap-1.5 text-muted">
              El color identifica al responsable:{' '}
              {[1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="inline-block size-3 rounded-full"
                  style={{ background: colorDeIntegrante(i, tema) }}
                  aria-hidden
                />
              ))}
            </p>
          </div>
        </div>
      </section>
      <section className="border-y border-line bg-surface py-14">
        <div className={cx(seccion, 'grid items-center gap-10 lg:grid-cols-2')}>
          <div>
            <h2 className="text-[22px] sm:text-[28px]">Comunicación y WhatsApp</h2>
            <ul className="mt-6 space-y-4">
              <li className="flex gap-3">
                <MessageCircle className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <strong>Chat integrado:</strong> por equipo, por tarea y directo, con hilos y
                  menciones.
                </span>
              </li>
              <li className="flex gap-3">
                <Zap className="mt-0.5 size-5 shrink-0 text-warn-text" aria-hidden />
                <span>
                  <strong>Al instante:</strong> reuniones y entregas urgentes llegan al grupo.
                </span>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
                <span>
                  <strong>En el reporte:</strong> lo demás se agrupa en un resumen diario o semanal.
                </span>
              </li>
            </ul>
            <Link
              to="/whatsapp-info"
              className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              Conocer la integración <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="space-y-3">
            <BurbujaWA
              texto="📅 Reunión «Daily» mañana a las 9:30. Confirma tu asistencia en Nexo."
              grupo="Nexo · Equipo"
            />
            <BurbujaWA texto="⏰ «Integración con grupo de WhatsApp» vence mañana. Responsable: Emilio." />
          </div>
        </div>
      </section>
      <section className={cx(seccion, 'py-14')}>
        <h2 className="text-[22px] sm:text-[28px]">Para quién</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              User,
              'Trabajo en solitario',
              'Tus tareas y tu calendario, con un mini Hill Chart.',
              'solitario',
            ],
            [Crown, 'Líder', 'Triaje, sprints, reportes y avisos de WhatsApp.', 'lider'],
            [Users, 'Integrante', 'Tus tareas, propuestas, chat y retrospectiva.', 'integrante'],
            [Eye, 'Invitado', 'Ve y comenta lo que se comparte contigo.', 'invitado'],
          ].map(([I, ti, tx, h]) => {
            const Ic = I as typeof User;
            return (
              <Link
                key={h as string}
                to={`/para-quien#${h}`}
                className="rounded-[12px] border border-line p-5 hover:border-line-strong"
              >
                <Ic className="size-6 text-brand" aria-hidden />
                <h3 className="mt-3 font-semibold">{ti as string}</h3>
                <p className="mt-1 text-sm text-muted">{tx as string}</p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="border-y border-line bg-surface py-14">
        <div className={seccion}>
          <h2 className="text-[22px] sm:text-[28px]">Cómo funciona en 3 pasos</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {['Crea tu espacio', 'Invita a tu equipo', 'Trabaja y comunícate'].map((p, i) => (
              <li key={p} className="rounded-[12px] border border-line bg-raised p-5">
                <span className="grid size-9 place-items-center rounded-full bg-brand text-sm font-semibold text-on-brand">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-semibold">{p}</h3>
                <p className="mt-1 text-sm text-muted">
                  {
                    [
                      'Empieza en tu Espacio personal; es tuyo y privado.',
                      'Comparte un enlace o código. Tú decides el rol de cada persona.',
                      'Organiza el sprint, conversa en el chat y avisa al grupo.',
                    ][i]
                  }
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className={cx(seccion, 'grid gap-10 py-14 lg:grid-cols-2')}>
        <div>
          <h2 className="text-[22px] sm:text-[28px]">Preguntas frecuentes</h2>
          <div className="mt-4">
            {FAQ.map(([q, a]) => (
              <Acordeon key={q} titulo={q}>
                {a}
              </Acordeon>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-[16px] bg-brand/8 p-8 text-center">
          <h2 className="text-[22px] sm:text-[28px]">Empieza hoy, solo o con tu equipo</h2>
          <p className="mt-2 text-muted">Sin tarjeta y sin complicaciones.</p>
          <Link
            to="/registro"
            className="mx-auto mt-6 inline-flex h-12 items-center gap-2 rounded-[10px] bg-brand px-6 font-medium text-on-brand"
          >
            Empezar gratis <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}

function Pagina({
  titulo,
  intro,
  children,
  nombre,
}: {
  titulo: string;
  intro?: string;
  children: ReactNode;
  nombre: string;
}) {
  return (
    <div className={cx(seccion, 'py-12 sm:py-16')} data-name={nombre}>
      <h1 className="text-[28px] font-semibold tracking-tight sm:text-[40px]">{titulo}</h1>
      {intro && <p className="mt-3 max-w-2xl text-lg text-muted">{intro}</p>}
      <div className="mt-10">{children}</div>
    </div>
  );
}

export function Caracteristicas() {
  const items: [typeof Flag, string, string, ReactNode][] = [
    [
      Layers,
      'Hill Chart',
      'Color = responsable, forma = estado y anillo = urgencia. Con vista alternativa en lista.',
      <MockResumen key="h" />,
    ],
    [
      KanbanSquare,
      'Tablero y triaje',
      'Columnas del flujo con arrastrar y soltar y menú «Mover a…». Las propuestas pasan por triaje.',
      <MiniTablero key="t" />,
    ],
    [
      Flag,
      'Sprints y retrospectiva',
      'Planea con capacidad por integrante, sigue el burndown y cierra con retrospectiva.',
      <MiniLista
        key="s"
        items={['Sprint 3 · activo · 43 %', 'Sprint 2 · 12 de 14', 'Sprint 1 · 14 de 15']}
      />,
    ],
    [
      MessageCircle,
      'Chat',
      'Equipo, tareas, directos e invitados. Hilos, reacciones y mensajes convertibles en tareas.',
      <MiniLista
        key="c"
        items={[
          'Valeria: @Emilio escribo a la asesora',
          'Gabriel: el tablero ya soporta «Mover a…»',
          'Nexo: Carlos completó T-09',
        ]}
      />,
    ],
    [
      CalendarDays,
      'Calendario',
      'Reuniones, entregas con semáforo e hitos de sprint, con aviso de conflictos.',
      <MiniLista
        key="ca"
        items={[
          'Mañana 9:30 · Daily',
          'En 6 días 16:00 · Revisión de sprint',
          'En 9 días 11:00 · Demo con la asesora',
        ]}
      />,
    ],
    [
      BarChart3,
      'Reportes',
      'Avance, a tiempo vs. con retraso, velocidad y tendencia. Exporta a PDF o CSV.',
      <MiniLista
        key="r"
        items={[
          'Avance del sprint · 43 %',
          'A tiempo · 2 de 3',
          'Velocidad · 13 tareas por sprint',
        ]}
      />,
    ],
    [
      MessageSquareShare,
      'WhatsApp',
      'Envío rápido y vista detallada de la cola. El líder siempre revisa.',
      <BurbujaWA key="w" texto="✅ Se sumó al Sprint 3: «Reporte semanal automático»." />,
    ],
  ];
  return (
    <Pagina
      titulo="Características"
      intro="Todo lo que tu equipo necesita para organizarse y conversar en un solo lugar."
      nombre="NX/PUB-02-Caracteristicas"
    >
      <div className="space-y-12">
        {items.map(([I, t, d, m], i) => (
          <section key={t} className="grid items-center gap-6 lg:grid-cols-2">
            <div className={cx(i % 2 === 1 && 'lg:order-2')}>
              <I className="size-7 text-brand" aria-hidden />
              <h2 className="mt-3 text-[22px]">{t}</h2>
              <p className="mt-2 text-muted">{d}</p>
            </div>
            <div>{m}</div>
          </section>
        ))}
      </div>
    </Pagina>
  );
}

function MiniLista({ items }: { items: string[] }) {
  return (
    <ul className="divide-y divide-line rounded-[16px] border border-line bg-raised p-2 shadow-soft">
      {items.map((x) => (
        <li key={x} className="px-3 py-3 text-sm">
          {x}
        </li>
      ))}
    </ul>
  );
}
function MiniTablero() {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-[16px] border border-line bg-raised p-3 shadow-soft">
      {[
        ['En curso', ['API de notificaciones', 'Vista de reportes']],
        ['Atascada', ['Integración con WhatsApp']],
        ['Completada', ['Login', 'Guía de estilos']],
      ].map(([c, ts]) => (
        <div key={c as string} className="rounded-[10px] bg-surface p-2">
          <p className="mb-2 text-xs font-semibold">{c as string}</p>
          {(ts as string[]).map((t) => (
            <p key={t} className="mb-1.5 rounded-[8px] border border-line bg-raised p-2 text-xs">
              {t}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ComoFunciona() {
  const pasos: [typeof User, string, string][] = [
    [User, 'Crea tu cuenta', 'Nace con un Espacio personal privado para tus tareas y eventos.'],
    [
      Users,
      'Crea o únete a un equipo',
      'Si lo creas serás su líder; si te unes con un código, serás integrante o invitado.',
    ],
    [
      Inbox,
      'Propón y decide',
      'Los integrantes proponen tareas; el líder las acepta en triaje con responsable y fecha.',
    ],
    [
      Flag,
      'Trabaja en sprints',
      'Las tareas se habilitan al iniciar el sprint y avanzan sobre el Hill Chart.',
    ],
    [MessageCircle, 'Conversa', 'Chat del equipo y de cada tarea; convierte mensajes en tareas.'],
    [Send, 'Avisa al grupo', 'El líder revisa la cola y envía avisos al grupo de WhatsApp.'],
  ];
  return (
    <Pagina
      titulo="Cómo funciona"
      intro="Un recorrido por el día a día con Nexo."
      nombre="NX/PUB-03-Como-funciona"
    >
      <ol className="relative space-y-8 border-l border-line pl-8">
        {pasos.map(([I, t, d], i) => (
          <li key={t} className="relative">
            <span className="absolute top-0 -left-[49px] grid size-8 place-items-center rounded-full border border-line bg-raised">
              <I className="size-4 text-brand" aria-hidden />
            </span>
            <p className="text-xs text-muted">Paso {i + 1}</p>
            <h2 className="text-lg font-semibold">{t}</h2>
            <p className="mt-1 max-w-xl text-muted">{d}</p>
          </li>
        ))}
      </ol>
      <Link
        to="/registro"
        className="mt-10 inline-flex h-12 items-center gap-2 rounded-[10px] bg-brand px-6 font-medium text-on-brand"
      >
        Empezar gratis <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Pagina>
  );
}

export function WhatsAppInfo() {
  return (
    <Pagina
      titulo="Integración con WhatsApp"
      intro="Solo lo importante llega al grupo, y siempre con la revisión del líder."
      nombre="NX/PUB-04-WhatsApp"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Zap className="size-5 text-warn-text" aria-hidden /> Al instante
          </h2>
          <p className="text-muted">
            Reuniones creadas, movidas o canceladas, y entregas que vencen en menos de 24 horas.
          </p>
          <BurbujaWA texto="📅 Reunión «Daily» mañana a las 9:30. Confirma tu asistencia en Nexo." />
          <BurbujaWA texto="⏰ «Integración con grupo de WhatsApp» vence mañana. Responsable: Emilio." />
        </Tarjeta>
        <Tarjeta className="space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Clock className="size-5 text-muted" aria-hidden /> En el reporte diario o semanal
          </h2>
          <p className="text-muted">
            Tareas aceptadas, asignaciones, cambios de estado o fecha y decisiones de triaje.
          </p>
          <BurbujaWA texto="👤 «Documentar la API» ahora es de Hilda." />
          <BurbujaWA texto="📥 Triaje: se aceptó «Filtro por etiquetas»; se rechazó «Tema de alto contraste»." />
        </Tarjeta>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          [ShieldCheck, 'El líder revisa', 'Envío rápido o vista detallada con texto editable.'],
          [Users, 'Consentimiento', 'Cada integrante decide si acepta ser mencionado.'],
          [Clock, 'Horas de silencio', 'Los avisos esperan fuera del horario elegido.'],
        ].map(([I, t, d]) => {
          const Ic = I as typeof Clock;
          return (
            <div key={t as string} className="rounded-[12px] border border-line p-5">
              <Ic className="size-5 text-brand" aria-hidden />
              <h3 className="mt-2 font-semibold">{t as string}</h3>
              <p className="text-sm text-muted">{d as string}</p>
            </div>
          );
        })}
      </div>
    </Pagina>
  );
}

export function ParaQuien() {
  const perfiles: [string, typeof User, string, string[]][] = [
    [
      'solitario',
      User,
      'Trabajo en solitario',
      [
        'Tareas y calendario propios',
        'Mini Hill Chart personal',
        'Crear o unirse a un equipo cuando quieras',
      ],
    ],
    [
      'lider',
      Crown,
      'Líder',
      [
        'Triaje y asignación',
        'Planear, iniciar y cerrar sprints',
        'Reportes completos y exportación',
        'Revisar y enviar avisos de WhatsApp',
        'Gestionar miembros e invitados',
      ],
    ],
    [
      'integrante',
      Users,
      'Integrante',
      [
        'Ejecutar y actualizar tus tareas',
        'Proponer tareas',
        'Chat del equipo, de tareas y directo',
        'Participar en la retrospectiva',
        'Leer reportes',
      ],
    ],
    [
      'invitado',
      Eye,
      'Invitado',
      [
        'Ver las tareas compartidas',
        'Comentar y usar su chat',
        'Canal de Invitados',
        'Acceso con caducidad',
      ],
    ],
  ];
  return (
    <Pagina
      titulo="Para quién"
      intro="El rol define lo que ves. Una persona puede tener roles distintos en cada equipo."
      nombre="NX/PUB-05-Para-quien"
    >
      <div className="grid gap-6 md:grid-cols-2">
        {perfiles.map(([id, I, t, l]) => (
          <section key={id} id={id} className="scroll-mt-24 rounded-[16px] border border-line p-6">
            <I className="size-7 text-brand" aria-hidden />
            <h2 className="mt-3 text-[22px]">{t}</h2>
            <ul className="mt-3 space-y-2">
              {l.map((x) => (
                <li key={x} className="flex gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-text" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
            <Link
              to="/registro"
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              Crear cuenta <ArrowRight className="size-4" aria-hidden />
            </Link>
          </section>
        ))}
      </div>
    </Pagina>
  );
}

export function AyudaCentro() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const cats = [...new Set(ARTICULOS.map((a) => a.categoria))];
  const lista = ARTICULOS.filter(
    (a) =>
      (!cat || a.categoria === cat) &&
      (!q ||
        `${a.titulo} ${a.resumen} ${a.secciones.map((s) => s.p).join(' ')}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  return (
    <Pagina
      titulo="Centro de ayuda"
      intro="Respuestas rápidas para usar Nexo."
      nombre="NX/PUB-06-Ayuda"
    >
      <Buscador valor={q} onChange={setQ} etiqueta="Buscar en la ayuda" className="max-w-xl" />
      <div className="mt-4 flex flex-wrap gap-2">
        {['', ...cats].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={cx(
              'h-9 rounded-full border px-3 text-sm',
              cat === c ? 'border-brand bg-brand/10 font-medium' : 'border-line text-muted',
            )}
          >
            {c || 'Todas'}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <Vacio
          icono={<Search />}
          titulo="Sin resultados"
          texto="Prueba con otras palabras o escríbenos."
          accion={
            <Link to="/contacto" className="text-brand underline">
              Contactar
            </Link>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((a) => (
            <li key={a.slug}>
              <Link
                to={`/ayuda/${a.slug}`}
                className="block h-full rounded-[12px] border border-line p-5 hover:border-line-strong"
              >
                <p className="text-xs text-muted">{a.categoria}</p>
                <h2 className="mt-1 font-semibold">{a.titulo}</h2>
                <p className="mt-1 text-sm text-muted">{a.resumen}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Pagina>
  );
}

export function AyudaArticulo() {
  const { articulo } = useParams();
  const a = ARTICULOS.find((x) => x.slug === articulo);
  if (!a) return <Error404 />;
  const id = (t: string) =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-');
  return (
    <div className={cx(seccion, 'py-12')} data-name="NX/PUB-07-Articulo-ayuda">
      <Link to="/ayuda" className="text-sm text-brand hover:underline">
        ← Centro de ayuda
      </Link>
      <div className="mt-4 grid gap-10 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Índice del artículo" className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-sm font-semibold">En este artículo</p>
          <ul className="space-y-2 text-sm">
            {a.secciones.map((s) => (
              <li key={s.t}>
                <a href={`#${id(s.t)}`} className="text-muted hover:text-fg">
                  {s.t}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-2xl">
          <p className="text-sm text-muted">{a.categoria}</p>
          <h1 className="text-[28px] font-semibold sm:text-[40px]">{a.titulo}</h1>
          {a.secciones.map((s) => (
            <section key={s.t} id={id(s.t)} className="mt-8 scroll-mt-24">
              <h2 className="text-[22px]">{s.t}</h2>
              <p className="mt-2 leading-relaxed text-muted">{s.p}</p>
            </section>
          ))}
          <div className="mt-10 flex flex-wrap items-center gap-3 rounded-[12px] bg-surface p-4 text-sm">
            <BookOpen className="size-5 text-muted" aria-hidden /> ¿Te sirvió este artículo?{' '}
            <Link to="/contacto" className="text-brand underline">
              Escríbenos si necesitas más ayuda
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}

type ErroresContacto = Partial<Record<keyof DatosContacto, string>>;

/** PUB-08: contacto. El mensaje se guarda en la API (tabla contacto_mensajes). */
export function Contacto() {
  const [v, setV] = useState<DatosContacto>({ nombre: '', correo: '', tipo: 'duda', mensaje: '' });
  const [err, setErr] = useState<ErroresContacto>({});
  const envio = useMutation({
    mutationFn: (datos: DatosContacto) =>
      api<{ recibido: boolean }>('/contacto', { metodo: 'POST', cuerpo: datos }),
  });
  /** Misma validación (Zod) que el servidor: al salir de un campo y al enviar. */
  const validar = (campo?: keyof DatosContacto) => {
    const r = esquemaContacto.safeParse(v);
    const e: ErroresContacto = {};
    if (!r.success)
      for (const i of r.error.issues) e[i.path[0] as keyof DatosContacto] ??= i.message;
    setErr(campo ? { ...err, [campo]: e[campo] } : e);
    return r.success ? r.data : null;
  };
  const enviar = () => {
    const datos = validar();
    if (datos && !envio.isPending) envio.mutate(datos);
  };
  if (envio.isSuccess)
    return (
      <Pagina titulo="¡Gracias por escribirnos!" nombre="NX/PUB-08-Contacto-exito">
        <Tarjeta className="max-w-xl p-6">
          <CheckCircle2 className="size-8 text-ok" aria-hidden />
          <p className="mt-3">
            Recibimos tu{' '}
            {v.tipo === 'error' ? 'reporte' : v.tipo === 'sugerencia' ? 'sugerencia' : 'duda'}. Te
            responderemos a <strong>{v.correo.trim()}</strong> en menos de 2 días hábiles.
          </p>
          <div className="mt-5 flex gap-2">
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
            >
              Volver al inicio
            </Link>
            <Boton
              onClick={() => {
                envio.reset();
                setV({ ...v, mensaje: '' });
              }}
            >
              Enviar otro mensaje
            </Boton>
          </div>
        </Tarjeta>
      </Pagina>
    );
  return (
    <Pagina
      titulo="Contacto"
      intro="Dudas, errores o sugerencias: te leemos."
      nombre="NX/PUB-08-Contacto"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        noValidate
        className="max-w-xl space-y-4"
      >
        {envio.isError && (
          <Banner tono="danger">No pudimos enviar tu mensaje. {mensajeDeError(envio.error)}</Banner>
        )}
        <Campo etiqueta="Nombre" error={err.nombre}>
          <Entrada
            value={v.nombre}
            onChange={(e) => setV({ ...v, nombre: e.target.value })}
            onBlur={() => validar('nombre')}
            autoComplete="name"
            maxLength={80}
          />
        </Campo>
        <Campo etiqueta="Correo" error={err.correo}>
          <Entrada
            type="email"
            value={v.correo}
            onChange={(e) => setV({ ...v, correo: e.target.value })}
            onBlur={() => validar('correo')}
            autoComplete="email"
          />
        </Campo>
        <Radios
          nombre="tipo"
          etiqueta="Tipo"
          horizontal
          valor={v.tipo}
          onChange={(x) => setV({ ...v, tipo: x })}
          opciones={[
            { valor: 'duda', etiqueta: 'Duda' },
            { valor: 'error', etiqueta: 'Error' },
            { valor: 'sugerencia', etiqueta: 'Sugerencia' },
          ]}
        />
        <Campo etiqueta="Mensaje" error={err.mensaje}>
          <AreaTexto
            value={v.mensaje}
            onChange={(e) => setV({ ...v, mensaje: e.target.value })}
            onBlur={() => validar('mensaje')}
            rows={5}
            maxLength={4000}
          />
        </Campo>
        <Boton
          type="submit"
          variante="primario"
          icono={<Send className="size-4" />}
          cargando={envio.isPending}
        >
          Enviar mensaje
        </Boton>
      </form>
    </Pagina>
  );
}

export function Acerca() {
  return (
    <Pagina
      titulo="Acerca de Nexo"
      intro="Nacimos en un salón de clases, cansados de perder tareas entre grupos de chat."
      nombre="NX/PUB-09-Acerca"
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-[22px]">Misión</h2>
          <p className="mt-2 leading-relaxed text-muted">
            Ayudar a equipos pequeños a organizar su trabajo y comunicarse en un solo lugar. Creemos
            que una buena herramienta no agrega ruido: muestra lo esencial y deja lo demás a un
            clic.
          </p>
          <h2 className="mt-8 text-[22px]">Principios</h2>
          <ul className="mt-2 space-y-2 text-muted">
            <li>Minimalismo funcional y divulgación progresiva.</li>
            <li>La comunicación en primer plano.</li>
            <li>Accesible por diseño: nunca dependemos solo del color.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-[22px]">Equipo</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4">
            {[
              ['Valeria Mendoza', 'Producto'],
              ['Daniela Torres', 'Diseño UX'],
              ['Carlos Ramírez', 'Backend'],
              ['Fernanda Ruiz', 'Frontend'],
            ].map(([n = '', r], i) => (
              <li key={n} className="flex items-center gap-3">
                <span
                  className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ background: colorDeIntegrante(i, 'claro') }}
                >
                  {n
                    .split(' ')
                    .map((x) => x[0])
                    .join('')}
                </span>
                <span>
                  <span className="block text-sm font-medium">{n}</span>
                  <span className="text-xs text-muted">{r}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Heart className="size-4" aria-hidden /> Hecho en México.
          </p>
        </section>
      </div>
    </Pagina>
  );
}

function Legal({
  titulo,
  nombre,
  secciones,
}: {
  titulo: string;
  nombre: string;
  secciones: [string, string][];
}) {
  const id = (t: string) =>
    t
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-');
  return (
    <Pagina
      titulo={titulo}
      intro={`Última actualización: 1 de agosto de ${new Date().getFullYear()}.`}
      nombre={nombre}
    >
      <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Índice" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <ul className="space-y-2 text-sm">
            {secciones.map(([t]) => (
              <li key={t}>
                <a href={`#${id(t)}`} className="text-muted hover:text-fg">
                  {t}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden max-w-2xl space-y-8 lg:block">
          {secciones.map(([t, p]) => (
            <section key={t} id={id(t)} className="scroll-mt-24">
              <h2 className="text-[22px]">{t}</h2>
              <p className="mt-2 leading-relaxed text-muted">{p}</p>
            </section>
          ))}
        </div>
        <div className="lg:hidden">
          {secciones.map(([t, p]) => (
            <Acordeon key={t} titulo={t}>
              {p}
            </Acordeon>
          ))}
        </div>
      </div>
    </Pagina>
  );
}

export function Terminos() {
  return (
    <Legal
      titulo="Términos de uso"
      nombre="NX/PUB-10-Terminos"
      secciones={[
        [
          '1. Aceptación',
          'Al crear una cuenta aceptas estos términos. Si los usas en nombre de un equipo, confirmas que tienes autorización para hacerlo.',
        ],
        [
          '2. Cuentas y espacios',
          'Cada cuenta tiene un Espacio personal. Los roles (líder, integrante, invitado) existen por equipo y determinan qué puedes ver y hacer.',
        ],
        [
          '3. Contenido del equipo',
          'Las tareas, mensajes y archivos pertenecen al equipo que los crea. El líder puede moderar el chat y eliminar mensajes ajenos con aviso.',
        ],
        [
          '4. Integración con WhatsApp',
          'El líder conecta el grupo y revisa cada aviso antes de enviarlo. Cada integrante decide si acepta ser mencionado.',
        ],
        [
          '5. Uso aceptable',
          'No uses Nexo para enviar spam, contenido ilegal o para acosar a otras personas.',
        ],
        [
          '6. Suspensión',
          'Podemos suspender cuentas que incumplan estos términos, avisando con anticipación cuando sea posible.',
        ],
        [
          '7. Cambios',
          'Si cambiamos estos términos te avisaremos dentro de la app con al menos 15 días de anticipación.',
        ],
        [
          '8. Contacto',
          'Escríbenos desde la página de Contacto para cualquier duda sobre estos términos.',
        ],
      ]}
    />
  );
}
export function Privacidad() {
  return (
    <Legal
      titulo="Aviso de privacidad"
      nombre="NX/PUB-11-Privacidad"
      secciones={[
        [
          '1. Datos que recopilamos',
          'Nombre, correo, zona horaria, preferencias y el contenido que creas en tus equipos. Si conectas WhatsApp, el número que verifiques.',
        ],
        [
          '2. Para qué los usamos',
          'Para ofrecerte el servicio, enviar notificaciones según tus preferencias y mejorar Nexo con métricas agregadas.',
        ],
        [
          '3. Con quién los compartimos',
          'Con los miembros de tus equipos según su rol, y con proveedores que nos ayudan a operar el servicio bajo contrato.',
        ],
        [
          '4. Cookies',
          'Usamos cookies necesarias para la sesión y, si lo aceptas, de analítica. Puedes cambiar tu elección en el aviso de cookies.',
        ],
        [
          '5. Tus derechos',
          'Puedes acceder, rectificar, exportar o eliminar tus datos desde Ajustes › Privacidad y datos.',
        ],
        [
          '6. Conservación',
          'Conservamos tus datos mientras tu cuenta esté activa. Al eliminarla, los borramos en un plazo máximo de 30 días.',
        ],
        [
          '7. Seguridad',
          'Cifrado en tránsito, verificación en dos pasos opcional y control de sesiones activas.',
        ],
        ['8. Contacto', 'Para dudas de privacidad, escríbenos desde la página de Contacto.'],
      ]}
    />
  );
}

export function Error404() {
  const nav = useNavigate();
  return (
    <div className={cx(seccion, 'py-20')} data-name="NX/PUB-12-Error-404">
      <Vacio
        nivel="h1"
        icono={<FileQuestion />}
        titulo="No encontramos esta página"
        texto="Es posible que el enlace esté mal escrito o que la página ya no exista."
        accion={
          <>
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
            >
              Volver al inicio
            </Link>
            <Boton onClick={() => nav(-1)}>Regresar</Boton>
          </>
        }
      />
    </div>
  );
}
export function Error500() {
  const nav = useNavigate();
  return (
    <div className={cx(seccion, 'py-20')} data-name="NX/PUB-13-Error-500">
      <Vacio
        nivel="h1"
        icono={<ServerCrash />}
        titulo="Algo salió mal de nuestro lado"
        texto="Ya estamos trabajando en ello. Inténtalo de nuevo en unos momentos."
        accion={
          <>
            <Boton
              variante="primario"
              icono={<RefreshCw className="size-4" />}
              onClick={() => nav('/')}
            >
              Reintentar
            </Boton>
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-[8px] border border-line px-4 text-sm font-medium"
            >
              Volver al inicio
            </Link>
          </>
        }
      />
    </div>
  );
}
