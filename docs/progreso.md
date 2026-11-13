# Nexo · Progreso

> Se actualiza al terminar cada fase (docs/03, sección 1.7): qué se hizo, qué quedó pendiente.

## Fase 0 · Arranque del repositorio y de la BD

**Estado:** en curso.

### Hecho

- **0.2 Monorepo** con pnpm: `apps/web` (Vite + React 19 + TypeScript + Tailwind v4 + react-router), `apps/api` (Fastify + TypeScript + `tsx`), `packages/shared` (Zod, constantes). `tsconfig.base.json` con `strict: true`, ESLint, Prettier y scripts raíz `dev`, `build`, `typecheck`, `lint`, `test`.
- **0.3 BD local:** `docker-compose.yml` con `postgres:16`; los tres scripts copiados sin modificar; migraciones con `node-pg-migrate`; scripts `db:migrate`, `db:seed`, `db:test`, `db:reset`.
- **0.4** Las **11 pruebas `OK`** salen sin cambios en los scripts (en local con PGlite; ver DEC-002). Confirmado en la CI con PostgreSQL 16.
- **0.5 Tipos generados** con `kysely-codegen` en `apps/api/src/db/tipos.ts` (versionado); la CI comprueba que siguen al día.
- **0.6 CI** en `.github/workflows/ci.yml`: instala, levanta PostgreSQL 16, migra, siembra, pruebas SQL (falla si no hay 11 `OK`), tipos, `typecheck`, `lint`, formato, `test` y `build`.
- **0.8 Dev login:** `POST /dev/login { email }` y `GET /dev/usuarios`, solo con `DEV_LOGIN_ENABLED=true`; crean sesiones reales (token opaco, *hash* SHA-256 en `sesiones`, cookie `HttpOnly; SameSite=Lax`). El servidor **se niega a arrancar** con `NODE_ENV=production` y `DEV_LOGIN_ENABLED=true` (prueba automática).
- **0.1 (parcial):** `README.md`, `.gitignore`, plantillas de *issues* (tarea, error) y de PR; convención de ramas `dev`, `main`, `produccion` y `Dev_<Nombre>` (DEC-001).
- **CI en verde en `main`** con PostgreSQL 16 real: las 11 pruebas SQL `OK` (también con `psql`) y los tipos generados coinciden con la BD.

### Pendiente

- [ ] **Proteger `main`, `dev` y `produccion`** en GitHub: exigir PR y el check **Verificar (BD, tipos, lint, pruebas, build)** en verde; prohibir *push* directo (DEC-001).
- [ ] Confirmar que el repositorio es **privado** y decidir la **licencia** (DEC-009).
- [ ] Tablero de proyecto en GitHub (Por hacer / En curso / En revisión / Hecho) e *issues* por fase y módulo grande.
- [ ] **0.7 WhatsApp** (Carlos e Isac, con Jova): cuenta de Meta for Developers, app, WABA, número de pruebas, verificación de la empresa, y llenar `docs/whatsapp-verificacion.md`. Con eso, decidir **D-01**.
- [ ] Probar `docker compose up -d` + `pnpm db:reset` en una máquina con Docker (la de Luis aún no lo tiene).

## Fase 1 · Base, roles y espacio personal

**Estado:** en curso.

### Hecho

- **1.3b API base:** resolución de sesión por cookie en cada petición (`sesiones`, token opaco con hash), `401 no_autenticado`, formato único de error, CORS al `APP_URL`, `GET /yo` (usuario, equipos y perfil en cada uno) y `POST /salir` (revoca la sesión).
- **Matriz de permisos** en `packages/shared/src/permisos.ts` (las 30 acciones de `01` más 10 del prototipo × 4 perfiles) con su prueba parametrizada (120 casos) y la guardia `exigirPermiso` en la API.
- **1.4 API del espacio personal:** CRUD de tareas personales (`/personal/tareas`) con filtros (estado, prioridad, etiqueta, texto, archivadas), semáforo, concurrencia optimista (`409`), subtareas, etiquetas y comentarios propios. Capas rutas → servicios → repositorios.
- **Privacidad probada:** otra persona no ve las tareas ni puede leer, editar, borrar, comentar o agregar subtareas (prueba automática por ruta).
- **Preferencias, perfil y contacto en la API:** `PATCH /yo/preferencias`, `PATCH /yo/perfil` y `POST /contacto` (público, con límite de peticiones; guarda en `contacto_mensajes`).
- **1.1 Sistema de diseño:** tokens de `src/index.css` del prototipo en `apps/web/src/styles/tokens.css` (expuestos con `@theme inline`, tema claro/oscuro con `[data-theme]`); componentes del prototipo en `components/ui/` (botones, campos, tarjeta, insignias, avatar, modal, panel lateral, hoja, toast, banner, pestañas, menú, estados, esqueletos) más `Tabla` y `EstadosDatos` (cargando, vacío, error, sin permiso, sin conexión). Página interna `/interna/componentes` (solo en desarrollo). Prueba automática de contraste ≥ 4.5:1 en ambos temas.
- **1.2 Páginas públicas** del prototipo, responsivas: `/`, `/caracteristicas`, `/como-funciona`, `/whatsapp-info`, `/para-quien`, `/ayuda`, `/ayuda/:articulo`, `/acerca`, `/contacto` (envía a la API), `/terminos`, `/privacidad`, 404, 500 y aviso de cookies. La ayuda lee de `pages/publico/contenido.ts`.
- **1.3 Estructura de la app:** `AppShell` (barra lateral, rail en tablet, barra inferior en móvil, selector de espacios GL-02, menú de perfil GL-03, búsqueda simple GL-01), rutas con carga diferida, `EquipoGuard`, layouts público y de autenticación, y `/entrar` con el selector de usuarios de la semilla (*dev login*).
- **1.4 Pantallas personales con datos reales:** PER-01 inicio (con Hill Chart en solo lectura), PER-02 mis tareas (lista y tablero con arrastrar y «Mover a…»), PER-03 detalle (estado, avance, subtareas, comentarios, archivar, eliminar), PER-04 calendario de entregas y PER-05 equipos.
- **1.5 Onboarding:** ONB-01 a ONB-03 (`/bienvenida/:paso`) guardan nombre, zona horaria, idioma, tema y resumen diario; el recorrido de primer uso (ONB-04) guarda `tour_visto`.
- **Verificado en el navegador** con la semilla: entrar como Paola y como Valeria; crear, editar, completar y borrar una tarea; otra persona recibe «No encontramos esta tarea»; contacto; bienvenida; y sin desbordamiento horizontal a 360 px en 17 pantallas.

### Pendiente o movido a otra fase

- [ ] Revisión **visual** por una persona (claro/oscuro y móvil): la verificación automática cubrió contraste, estructura y desbordamiento, no el aspecto.
- [ ] PR `Dev_Luis` → `dev` con CI en verde y tag `fase-1`.
- [ ] Rutas que muestran «Próximamente» hasta su fase: crear/unirse a equipo y todo `/app/e/:equipo/*` (Fase 2); reportes personales (FALT-01), notificaciones y `/ajustes/*` (Fase 3); registro, recuperar, verificar, 2FA e invitaciones (Fase 5).
- [ ] En el calendario personal solo hay entregas de tareas; reuniones y eventos llegan con el calendario del equipo (Fase 3). El Hill Chart aún no se arrastra (Fase 3, tarea 3.1).
- [ ] El formulario de contacto no admite adjuntos y el onboarding no sube foto de perfil: la subida de archivos llega con EQ-19 (Fase 3).
- [ ] El aviso de cookies guarda la elección en el navegador; no hay analítica instalada.
