import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from './components/shell/AppShell';
import { Raiz } from './components/shell/Raiz';
import { Requiere } from './pages/equipo/contexto';
import { EquipoGuard } from './pages/equipo/EquipoGuard';
import { Proximamente } from './pages/Proximamente';

/** Carga diferida de una pantalla: cada grupo de páginas va en su propio fragmento. */
const diferida =
  <M,>(cargar: () => Promise<M>, elegir: (m: M) => ComponentType) =>
  async () => ({ Component: elegir(await cargar()) });

const publico = () => import('./pages/publico');
const auth = () => import('./pages/auth');
const equipos = () => import('./pages/equipos');
const equipo = () => import('./pages/equipo');
const sprints = () => import('./pages/equipo/sprints');
const vistas = () => import('./pages/equipo/vistas');
const ajustes = () => import('./pages/ajustes');
const chat = () => import('./pages/equipo/chat');
const whatsapp = () => import('./pages/equipo/whatsapp');
const proximamente = (titulo: string, fase: number) => <Proximamente titulo={titulo} fase={fase} />;

// Árbol de rutas del prototipo (docs/01, 3.2). Lo que aún no se construye muestra «Próximamente».
const rutas: RouteObject[] = [
  {
    Component: Raiz,
    children: [
      {
        lazy: diferida(publico, (m) => m.PublicoLayout),
        children: [
          { index: true, lazy: diferida(publico, (m) => m.Landing) },
          { path: 'caracteristicas', lazy: diferida(publico, (m) => m.Caracteristicas) },
          { path: 'como-funciona', lazy: diferida(publico, (m) => m.ComoFunciona) },
          { path: 'whatsapp-info', lazy: diferida(publico, (m) => m.WhatsAppInfo) },
          { path: 'para-quien', lazy: diferida(publico, (m) => m.ParaQuien) },
          { path: 'ayuda', lazy: diferida(publico, (m) => m.AyudaCentro) },
          { path: 'ayuda/:articulo', lazy: diferida(publico, (m) => m.AyudaArticulo) },
          { path: 'contacto', lazy: diferida(publico, (m) => m.Contacto) },
          { path: 'acerca', lazy: diferida(publico, (m) => m.Acerca) },
          { path: 'terminos', lazy: diferida(publico, (m) => m.Terminos) },
          { path: 'privacidad', lazy: diferida(publico, (m) => m.Privacidad) },
          { path: 'error', lazy: diferida(publico, (m) => m.Error500) },
          { path: '*', lazy: diferida(publico, (m) => m.Error404) },
        ],
      },
      {
        lazy: diferida(auth, (m) => m.AuthLayout),
        children: [
          { path: 'entrar', lazy: diferida(auth, (m) => m.Entrar) },
          { path: 'sesion-expirada', lazy: diferida(auth, (m) => m.SesionExpirada) },
          { path: 'bienvenida/:paso', lazy: diferida(auth, (m) => m.Bienvenida) },
          // Fase 5.1: autenticación real (AUTH-01 a AUTH-06).
          { path: 'registro', lazy: diferida(auth, (m) => m.Registro) },
          { path: 'recuperar', lazy: diferida(auth, (m) => m.Recuperar) },
          { path: 'recuperar/enviado', lazy: diferida(auth, (m) => m.RecuperarEnviado) },
          { path: 'restablecer', lazy: diferida(auth, (m) => m.Restablecer) },
          { path: 'verificar', lazy: diferida(auth, (m) => m.Verificar) },
          {
            // 2FA (AUTH-07): fase posterior.
            path: '2fa',
            lazy: async () => {
              const { AuthProximamente } = await auth();
              return { element: <AuthProximamente titulo="Verificación en dos pasos" /> };
            },
          },
        ],
      },
      // El enlace que comparte el líder: lleva a la vista previa de la invitación.
      { path: 'invitacion/:codigo', lazy: diferida(equipos, (m) => m.EnlaceInvitacion) },
      ...(import.meta.env.DEV
        ? [
            {
              // Página interna de componentes (tarea 1.1): solo existe en desarrollo, no se publica.
              path: 'interna/componentes',
              lazy: diferida(
                () => import('./pages/interna/Componentes'),
                (m) => m.Componentes,
              ),
            } satisfies RouteObject,
          ]
        : []),
      {
        Component: AppShell,
        children: [
          { path: 'app', element: <Navigate to="/app/personal" replace /> },
          {
            path: 'app/personal',
            lazy: diferida(
              () => import('./pages/personal/Inicio'),
              (m) => m.InicioPersonal,
            ),
          },
          {
            path: 'app/personal/tareas',
            lazy: diferida(
              () => import('./pages/personal/MisTareas'),
              (m) => m.MisTareas,
            ),
          },
          {
            path: 'app/personal/tareas/:id',
            lazy: diferida(
              () => import('./pages/personal/MisTareas'),
              (m) => m.MisTareasDetalle,
            ),
          },
          {
            path: 'app/personal/calendario',
            lazy: diferida(
              () => import('./pages/personal/Calendario'),
              (m) => m.CalendarioPersonal,
            ),
          },
          {
            path: 'app/personal/equipos',
            lazy: diferida(
              () => import('./pages/personal/Equipos'),
              (m) => m.EquiposPersonal,
            ),
          },
          {
            path: 'app/personal/reportes',
            lazy: diferida(
              () => import('./pages/personal/Reportes'),
              (m) => m.ReportesPersonales,
            ),
          },
          {
            // docs/13 1.1: registro y verificación de WhatsApp con destino (aviso al unirse, reporte).
            path: 'app/whatsapp/activar',
            lazy: diferida(
              () => import('./pages/personal/ActivarWhatsApp'),
              (m) => m.ActivarWhatsAppPagina,
            ),
          },
          { path: 'app/equipos/nuevo', lazy: diferida(equipos, (m) => m.CrearEquipo) },
          { path: 'app/equipos/unirse', lazy: diferida(equipos, (m) => m.Unirse) },
          {
            path: 'app/notificaciones',
            lazy: diferida(
              () => import('./pages/Notificaciones'),
              (m) => m.Notificaciones,
            ),
          },
          {
            path: 'app/e/:equipo',
            Component: EquipoGuard,
            children: [
              { index: true, lazy: diferida(equipo, (m) => m.Resumen) },
              {
                path: 'tareas',
                lazy: diferida(equipo, (m) => m.TareasLayout),
                children: [
                  { index: true, lazy: diferida(equipo, (m) => m.TableroRuta) },
                  { path: 'lista', lazy: diferida(equipo, (m) => m.ListaRuta) },
                  {
                    path: 'backlog',
                    lazy: async () => {
                      const { Backlog } = await equipo();
                      return {
                        element: (
                          <Requiere permiso="ver_sprints">
                            <Backlog />
                          </Requiere>
                        ),
                      };
                    },
                  },
                  {
                    path: 'votacion',
                    lazy: async () => {
                      const { Votacion } = await equipo();
                      return {
                        element: (
                          <Requiere permiso="ver_sprints">
                            <Votacion />
                          </Requiere>
                        ),
                      };
                    },
                  },
                  { path: ':id', lazy: diferida(equipo, (m) => m.TareaRuta) },
                ],
              },
              {
                // Fase 3.3: sprints y retrospectiva (EQ-09 a EQ-13). Los invitados no los ven.
                path: 'sprints',
                lazy: async () => {
                  const { SprintsLayout } = await sprints();
                  return {
                    element: (
                      <Requiere permiso="ver_sprints">
                        <SprintsLayout />
                      </Requiere>
                    ),
                  };
                },
                children: [
                  { index: true, element: <Navigate to="activo" replace /> },
                  { path: 'activo', lazy: diferida(sprints, (m) => m.SprintActivo) },
                  { path: 'planear', lazy: diferida(sprints, (m) => m.PlanearSprint) },
                  {
                    path: 'cerrar',
                    lazy: async () => {
                      const { CerrarSprint } = await sprints();
                      return {
                        element: (
                          <Requiere permiso="gestionar_sprints">
                            <CerrarSprint />
                          </Requiere>
                        ),
                      };
                    },
                  },
                  { path: 'historial', lazy: diferida(sprints, (m) => m.HistorialSprints) },
                  {
                    path: 'historial/:sprintId',
                    lazy: diferida(sprints, (m) => m.SprintHistorico),
                  },
                  { path: 'retro', lazy: diferida(sprints, (m) => m.RetroRuta) },
                  { path: 'retro/:sprintId', lazy: diferida(sprints, (m) => m.RetroRuta) },
                ],
              },
              ...(
                [
                  ['equipo', 'Miembros'],
                  // Fase 3.5: liderazgo y elección (AD-07 a AD-09), ajustes (AD-06) y ficha (AD-04).
                  ['equipo/eleccion', 'Liderazgo'],
                  ['equipo/ajustes', 'AjustesEquipo'],
                  ['equipo/:miembroId', 'MiembroDetalle'],
                ] as const
              ).map(([path, nombre]) => ({
                path,
                lazy: async () => {
                  const Pantalla = (await equipo())[nombre];
                  return {
                    element: (
                      <Requiere permiso="ver_miembros">
                        <Pantalla />
                      </Requiere>
                    ),
                  };
                },
              })),
              // Fase 3.4: vistas secundarias del equipo (EQ-14 a EQ-20).
              ...(
                [
                  ['calendario', 'CalendarioEquipo', 'ver_calendario'],
                  ['reportes', 'Reportes', 'ver_reportes'],
                  ['actividad', 'Actividad', 'ver_actividad'],
                  ['archivos', 'Archivos', 'ver_archivos'],
                  ['plantillas', 'Plantillas', 'usar_plantilla'],
                ] as const
              ).map(([path, nombre, permiso]) => ({
                path,
                lazy: async () => {
                  const Pantalla = (await vistas())[nombre];
                  return {
                    element: (
                      <Requiere permiso={permiso}>
                        <Pantalla />
                      </Requiere>
                    ),
                  };
                },
              })),
              // Fase 4 · Chat (CH-01 a CH-10). Los invitados entran: ven el canal de Invitados.
              { path: 'chat', lazy: diferida(chat, (m) => m.Chat) },
              { path: 'chat/tarea/:tareaId', lazy: diferida(chat, (m) => m.ChatDeTarea) },
              { path: 'chat/:conversacionId', lazy: diferida(chat, (m) => m.Chat) },
              {
                // Fase 4.2: WhatsApp (WA-01 a WA-08). El integrante solo ve el historial.
                path: 'whatsapp',
                lazy: async () => {
                  const { WhatsAppLayout } = await whatsapp();
                  return {
                    element: (
                      <Requiere permiso="ver_historial_whatsapp">
                        <WhatsAppLayout />
                      </Requiere>
                    ),
                  };
                },
                children: [
                  { index: true, lazy: diferida(whatsapp, (m) => m.PanelWhatsApp) },
                  { path: 'cola', lazy: diferida(whatsapp, (m) => m.ColaWhatsApp) },
                  { path: 'historial', lazy: diferida(whatsapp, (m) => m.HistorialWhatsApp) },
                  { path: 'reglas', lazy: diferida(whatsapp, (m) => m.ReglasWhatsApp) },
                  { path: 'personas', lazy: diferida(whatsapp, (m) => m.PersonasWhatsApp) },
                  { path: 'conectar', lazy: diferida(whatsapp, (m) => m.ConectarWhatsApp) },
                ],
              },
              { path: '*', element: proximamente('Esta sección del equipo', 3) },
            ],
          },
          {
            // Fase 3.6: ajustes de la persona (PF-01 a PF-09).
            path: 'ajustes',
            lazy: diferida(ajustes, (m) => m.AjustesLayout),
            children: [
              { index: true, element: <Navigate to="perfil" replace /> },
              ...(
                [
                  ['perfil', 'Perfil'],
                  ['cuenta', 'Cuenta'],
                  ['apariencia', 'Apariencia'],
                  ['notificaciones', 'Notificaciones'],
                  ['whatsapp', 'WhatsAppPersonal'],
                  ['privacidad', 'Privacidad'],
                  ['equipos', 'MisEquipos'],
                  ['atajos', 'Atajos'],
                  ['ayuda', 'Ayuda'],
                ] as const
              ).map(([path, nombre]) => ({ path, lazy: diferida(ajustes, (m) => m[nombre]) })),
            ],
          },
        ],
      },
    ],
  },
];

export const enrutador = createBrowserRouter(rutas);
