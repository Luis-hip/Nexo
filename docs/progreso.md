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

**Estado:** terminada (tag `fase-1`).

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

## Fase 2 · Equipos, tablero y estados

**Estado:** construida y fusionada (PR #7 a `dev`, #8 a `main`, #9 a `produccion`). Existe el tag `fase-2`; la CI en verde no se pudo comprobar desde la herramienta (no hay `gh`).

### Hecho

- **2.1 Crear y unirse.** `POST /equipos` (quien crea es líder, con color 0 y los canales fijos), `GET /equipos/:id` según el perfil, miembros, e invitaciones: crear (integrante o invitado con 7/14/30 días), listar, revocar, vista previa y aceptar. NX001 se traduce a «El equipo ya tiene N miembros»; con dos conexiones a la vez al último lugar entra una sola. Pantallas PER-06 (4 pasos), PER-07/AUTH-08/AUTH-09 (`/invitacion/:código`), AD-01 miembros, AD-02/AD-03 invitar, FALT-02 (acceso terminado), FALT-06 (equipo lleno) e IN-04 (banner de caducidad).
- **2.2 Tareas de equipo.** Tablero (EQ-02) con columnas por estado y plegado de las vacías, arrastrar y soltar con dnd-kit (ratón y teclado) y «Mover a…»; lista (EQ-03), backlog priorizable (EQ-04), detalle (EQ-06), crear/proponer (EQ-07), triaje con aceptar/rechazar/backlog/pedir cambios (EQ-05), asignar y responder (EQ-08), compartir con invitados, subtareas y comentarios, y «Mis propuestas» (FALT-08). Resumen del equipo (EQ-01) con Hill Chart en solo lectura y resumen reducido del invitado (IN-01 a IN-03).
- **Máquina de estados** compartida en `packages/shared/src/estados.ts`, aplicada en el servidor; la interfaz solo ofrece las transiciones válidas y explica por qué no las otras.
- **2.3 Permisos aplicados.** Cada ruta usa la guarda de sesión, membresía y permiso de la matriz. Pruebas por rol (líder, integrante, invitado y quien no pertenece), incluida una ronda de 14 rutas que deben dar 404 a un ajeno.
- **Concurrencia.** Mover la misma tarjeta desde dos sesiones da 200 y 409; la web explica el conflicto.
- **Eventos de dominio y actividad** en la misma transacción de cada cambio (DEC-022).
- **Verificado en el navegador** con la semilla: líder (crear, mover con menú y con teclado, triaje, miembros y cupo), integrante (aceptar asignación, proponer), invitada (solo lo compartido; backlog y miembros dan «sin acceso») y Paola (crear equipo con los 4 pasos, invitar, y Hilda se une con el código).
- **Pruebas:** 150 en `shared` (la tabla de transiciones por rol), 79 en la API y 80 en la web; 11 pruebas SQL.

### Pendiente o movido a otra fase

- [ ] CI en verde, PR `Dev_Luis` → `dev` → `main` → `produccion` y tag `fase-2`.
- [ ] Revisión **visual** por una persona (claro/oscuro y móvil): solo se tomó una captura del tablero (tema oscuro, escritorio estrecho). El arrastre con el **ratón** no se pudo reproducir con la herramienta de pruebas (suelta de golpe); el arrastre con teclado sí se verificó.
- [ ] Prueba de «mover en dos navegadores a la vez» a nivel de interfaz: está probada en la API (200 y 409) y la web muestra el aviso, pero no se probó con dos navegadores reales.
- [ ] Invitar por correo, solicitudes de ampliación del invitado, salir y expulsar (Fase 3). Chat y WhatsApp (Fase 4). Ver DEC-023.
- [ ] Sin sprint activo no hay planeación: el tablero muestra las tareas del equipo en sus estados; sprints llegan en la Fase 3.

## Fase 2.5 · Cambios de alcance

**Estado:** terminada el 2026-11-17 (rama `feat/fase-2-5` fusionada en `Dev_Luis`, tag `fase-2-5`). Fuente: `docs/07_Cambios_de_Alcance_Fase2.md`.

### Hecho

- **Paso 1 · Documentos y decisiones.** Copiados `07` y `10`; creados `08_Procesos_BD.md`, `09_Seguridad_y_Secretos.md` y `seguridad-incidentes.md`; actualizados `01`–`06`, el README y `decisiones.md` (DEC-024 a DEC-029; DEC-020 marcada como reemplazada en parte). D-02 eliminada (el nombre es Carlos) y D-03 resuelta (Vercel + Render + dominio propio). Mapa de fases con 2.5 y 3.5.

- **Paso 2 · Secretos.** *Informe:* se revisó todo el historial de Git (todas las ramas) y el árbol con patrones de claves (AWS, GitHub, Slack, Meta, llaves privadas, URL con contraseña, asignaciones `secret/token/password`): **no hay secretos**; solo aparece la cadena de desarrollo `nexo:nexo@localhost` de `.env.example` y de la CI, que es pública y desechable. `.env` nunca estuvo en el historial. *Cambios:* `pino` oculta cookies, `set-cookie`, tokens, contraseñas, secretos, claves y cuerpos; `config.ts` exige en producción `SESSION_SECRET` (≥ 32), `ENCRYPTION_KEY` (64 hex), `APP_URL` y `API_URL` (https, sin valor local) y rechaza los valores de `.env.example`; la API comprueba `Origin` en `POST/PUT/PATCH/DELETE`; gitleaks (v8.24.2, historial completo) en la CI con `.gitleaks.toml`; `.env.example` documentado. Pruebas nuevas: 21 en `config.test.ts` y `seguridad.test.ts`. **Sin verificar:** gitleaks no se ejecutó en local (no está instalado; lo corre la CI).
- **Pendiente tuyo (no se puede por CLI aquí):** activar *secret scanning* y *push protection* en GitHub (Settings → Code security) y decidir si el repositorio pasa a privado; hoy no hay `gh` en esta máquina.

- **Paso 3 · Votación de propuestas (DEC-024).** Migraciones `0002_enums_votacion.sql` (valores `votacion` y `cancelada`) y `0003_votacion.sql` (tabla `tarea_votos`, disparador `NX004`, índice fraccionario en PL/pgSQL y los procesos `proc_tarea_proponer`, `proc_tarea_votar`, `proc_tarea_retirar`, `proc_tarea_reformular`, `proc_tarea_votacion` y `proc_tarea_votaciones`, documentados en `docs/08`). API: `POST …/tareas` solo para el líder (con `subtareas[]`), `POST …/voto`, `…/retirar`, `…/reformular`; la vista `triaje` pasó a `votacion`; desapareció `POST …/triaje`. Permisos: salen `proponer_tarea` y `triaje`, entran `votar_propuesta` y `retirar_propuesta`. Web: pestaña **Votación** (`tareas/votacion`) con conteo, quién votó y mi voto; FALT-08 es ahora «Por votar» y «Ya votaste»; el formulario del líder gana subtareas y sirve para reformular. La API **no devuelve votos ajenos** (ni al líder). Semilla: las propuestas son de la líder y T-08 trae 3 votos.
- **Pruebas del paso 3:** 15 pruebas SQL de procesos (`pnpm db:test:procesos`: líder e invitado no votan, voto doble, fuera de `propuesta`, mayoría con 3, 4 y 7 integrantes, empate, rechazo, sin integrantes, retirar, reformular, salida del equipo, visibilidad) además de las 11 de integridad; 170 en `shared`, 102 en la API (40 de tareas de equipo, con una que compara la mayoría y el índice fraccionario de TypeScript contra los de la BD) y 87 en la web. Las pruebas de triaje se reemplazaron a propósito por las de votación. **Verificado en el navegador** con la semilla: Carlos cambia su voto en T-08 y el conteo se actualiza; Valeria crea T-10 con una subtarea y queda en votación. **Local con PGlite** (PostgreSQL 17 embebido); la comprobación contra PostgreSQL 16 la hace la CI.
- **Control nuevo en la CI:** `pnpm db:test:procesos` y `pnpm procesos:verificar` (falla si una migración crea un `proc_*` sin apartado en `docs/08`).

- **Paso 4 · Todo el acceso a datos pasa por procesos (DEC-025).** Migraciones `0004` (cuenta, sesiones, preferencias, contacto y acceso de desarrollo), `0005` (equipos e invitaciones), `0006` (tareas de equipo, con la tabla `transiciones_estado`), `0007` (espacio personal) y `0008_roles`. Son **49 procesos** en total, todos en `docs/08`; se migraron también las lecturas, así que no quedó nada para la Fase 3. En la API, servicios y rutas ya no tienen SQL ni transacciones: el único que llama a la BD es `repositorios/procesos.ts`, que valida cada respuesta con Zod (`packages/shared/src/respuestas.ts`) y traduce los errores `NX0xx`. Una **regla de ESLint** impide que vuelva a aparecer SQL fuera de ahí. Se borró `repositorios/eventos.ts`: los eventos los registra cada proceso.
- **Roles:** `nexo_app` (creado sin inicio de sesión ni contraseña) solo ejecuta `proc_*`; no lee ni escribe tablas, vistas ni auxiliares, y no tiene los procesos del acceso de desarrollo. `nexo_migraciones` es quien ejecuta las migraciones (en local y CI, el usuario de `DATABASE_URL`). La contraseña y el `LOGIN` de `nexo_app` se ponen en el despliegue (Fase 3.5).
- **Pruebas del paso 4:** 52 pruebas SQL de procesos (antes 15): un caso permitido y uno prohibido por proceso, más «todo proceso es `SECURITY DEFINER`» y «con `nexo_app` no se lee ninguna tabla». En la API, **104** pruebas (las 102 anteriores sin cambiar sus expectativas, más la que compara `transiciones_estado` con `estados.ts` y la del rol `nexo_app`); 170 en `shared` y 87 en la web. **Verificado** con la API en marcha (sesión, `/yo`, conteos, votación, `Origin` rechazado) y en el navegador (tablero de la líder sin errores en la consola).

### Para revisión de Luis (valores por confirmar del 07)

- **V-10:** toda tarea nueva del líder entra en votación; desaparece el destino «backlog directo».
- **V-11:** se mantiene la asignación de DEC-020; si el responsable rechaza, el líder reasigna directamente sin nueva votación.
- **Empate:** se aplicó V-4 (el empate sigue abierto) frente a la regla 4 del `07` («ya no es posible alcanzar la mayoría»). Ver DEC-024.
- **Backlog:** se agregaron las transiciones del líder `aceptada ↔ backlog`, que el `07` no menciona, para no perder el paso del backlog al tablero.
- **«8 integrantes»:** imposible con el tope de 8 miembros (líder incluida); se probó con 7.

### Pendiente

- [ ] **Abrir el PR `Dev_Luis` → `dev`** (lo tiene que crear una persona con sesión en GitHub: no hay `gh` en esta máquina y el navegador de la herramienta no tiene sesión). Enlace listo: <https://github.com/Luis-hip/Nexo/compare/dev...Dev_Luis?expand=1>.
- [ ] Activar *secret scanning* y *push protection* en GitHub y decidir si el repositorio pasa a privado (ver Paso 2).
- [ ] Revisar los valores por confirmar V-10 y V-11 y las desviaciones anotadas arriba.

### Cierre

- **CI en verde** con PostgreSQL 16 real en el PR #10 (`feat/fase-2-5` → `Dev_Luis`), commit `4b93540`: gitleaks sobre todo el historial, migraciones `0001`–`0008`, 11 pruebas SQL de integridad y 52 de procesos, control de `docs/08`, tipos al día, `typecheck`, lint, formato, 361 pruebas (170 `shared`, 104 API, 87 web) y build.
- **gitleaks en la CI:** en la primera corrida marcó dos falsos positivos (los valores de ejemplo de las pruebas de seguridad y la frase «secretos: `09_Seguridad_y_Secretos.md`» de `docs/01`); se permitieron con expresiones concretas en `.gitleaks.toml`, sin excluir archivos. Ahora cada hallazgo aparece como anotación del PR (archivo, línea y regla; el valor va redactado).
- **Criterio de terminado de la `07` (sección 7):** documentos 07–10 ✔; informe de secretos, redacción, arranque seguro y gitleaks ✔; votación probada (3 → 2, 4 → 3, líder e invitado no votan, la API no devuelve votos ajenos) ✔; todo acceso a datos por `proc_*` documentados, regla de lint y `nexo_app` sin tablas ✔; pruebas de la Fase 2 en verde sin cambiar expectativas (salvo las de triaje, a propósito) ✔; `progreso.md` y `decisiones.md` ✔; tag `fase-2-5` ✔. Solo falta abrir el PR a `dev` (ver arriba).
