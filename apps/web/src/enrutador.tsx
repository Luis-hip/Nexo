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
          // Autenticación real: Fase 5.
          ...(
            [
              ['registro', 'Crea tu cuenta'],
              ['recuperar', 'Recupera tu contraseña'],
              ['recuperar/enviado', 'Revisa tu correo'],
              ['restablecer', 'Restablece tu contraseña'],
              ['verificar', 'Verifica tu correo'],
              ['2fa', 'Verificación en dos pasos'],
            ] as const
          ).map(([path, titulo]): RouteObject => ({
            path,
            lazy: async () => {
              const { AuthProximamente } = await auth();
              return { element: <AuthProximamente titulo={titulo} /> };
            },
          })),
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
          { path: 'app/personal/reportes', element: proximamente('Reportes personales', 3) },
          { path: 'app/equipos/nuevo', lazy: diferida(equipos, (m) => m.CrearEquipo) },
          { path: 'app/equipos/unirse', lazy: diferida(equipos, (m) => m.Unirse) },
          { path: 'app/notificaciones', element: proximamente('Notificaciones', 3) },
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
                path: 'equipo',
                lazy: async () => {
                  const { Miembros } = await equipo();
                  return {
                    element: (
                      <Requiere permiso="ver_miembros">
                        <Miembros />
                      </Requiere>
                    ),
                  };
                },
              },
              { path: 'chat/*', element: proximamente('Chat del equipo', 4) },
              { path: 'whatsapp/*', element: proximamente('WhatsApp', 4) },
              { path: '*', element: proximamente('Esta sección del equipo', 3) },
            ],
          },
          { path: 'ajustes/*', element: proximamente('Ajustes', 3) },
        ],
      },
    ],
  },
];

export const enrutador = createBrowserRouter(rutas);
