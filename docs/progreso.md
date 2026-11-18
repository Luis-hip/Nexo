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

## Fase 3 · Hill Chart, sprints y vistas secundarias

**Estado:** terminada el 2026-11-18 en la rama `feat/fase-3` (PR #11 hacia `Dev_Luis`, CI en verde). Falta fusionar el PR y poner el tag `fase-3` (ver «Cierre»).

### Hecho

- **3.1 Hill Chart arrastrable.** Las figuras se arrastran (ratón o dedo) o se mueven con las flechas (de 5 en 5, un solo guardado) y el avance se guarda con `proc_tarea_editar` (equipo) o `proc_personal_tarea_actualizar` (inicio personal). Mueve el líder cualquier tarea y el responsable las suyas con la asignación aceptada; las completadas no se mueven. El historial es el de cada tarea («Valeria actualizó el avance de T-01 (75 %)»). Pruebas: 4 del componente (`HillChart.test.tsx`). **Verificado** en la app: dos flechas seguidas suben T-01 de 65 a 75 % con un solo guardado y el historial lo registra.
- **3.2 Color de miembros** en `packages/shared/src/color.ts` (la web lo reexporta), con prueba: ningún tono en las bandas del semáforo, los 8 colores se distinguen entre sí (ΔE > 0,08) y de las señales de su tema (ΔE > 0,06). Ver DEC-030: par más cercano y por qué la forma sigue indicando el estado (**para revisión**).

- **3.3 Sprints (EQ-09 a EQ-13).** Migración `0009_procesos_sprints.sql` con 14 procesos (`proc_sprint_listar`, `_obtener`, `_disponibles`, `_planear`, `_iniciar`, `_cerrar`, `_eliminar`; `proc_retro_iniciar`, `_obtener`, `_nota_agregar`, `_nota_eliminar`, `_votar`, `_avanzar`, `_nota_a_tarea`), todos en `docs/08`; además `proc_tarea_listar` y `proc_tarea_conteos` ya no muestran en el tablero las tareas de sprints cerrados. API en `rutas/sprints.ts` (`repositorios/sprints.ts`, esquemas en `packages/shared/src/sprints.ts` y `respuestas.ts`; `NX003` → 409). Web: `pages/equipo/sprints/` con pestañas Activo · Planear · Historial · Retrospectiva, la pantalla de cierre y el burndown (`components/charts/Burndown.tsx`). La semilla trae instantáneas para el burndown y el historial. Decisiones: DEC-031 (qué entra al planear, capacidad sin estimaciones, destino de las pendientes, notas anónimas sin eventos, inicio anticipado).
- **Pruebas de 3.3:** 69 pruebas SQL de procesos (P53–P69 nuevas: un caso permitido y uno prohibido por proceso; el cuarto voto da `NX003` por el proceso y por el disparador; dos sprints activos los impide también el índice), 20 de la API (`sprints.test.ts`, recorrido completo con los cuatro perfiles), 10 de `shared` (burndown y esquemas) y 2 de la web (burndown). Totales: 187 `shared`, 124 API, 93 web. **Verificado en el navegador** con la semilla: Valeria planea el Sprint 4 (20 h para Carlos y T-09 del backlog, que pasa a «Aceptada»), cierra el Sprint 3 mandando 5 pendientes al Sprint 4 y llega a la retrospectiva; escribe tres notas (una anónima, que sale sin autor), usa sus 3 votos (el cuarto botón queda desactivado y la API responde 409), convierte la acción en propuesta y cierra la votación; inicia el Sprint 4 antes de su fecha y queda del 17 al 30 nov. Carlos ve el sprint sin «Cerrar» y la pantalla de cierre le dice «Solo el líder…»; Mariana ve «Los invitados no ven los sprints.». A 375 px no hay desplazamiento horizontal. Ahí apareció el error del inicio anticipado (el sprint seguía empezando el 26 nov), ya corregido. **Local con PGlite**; la CI lo comprueba con PostgreSQL 16.

- **3.5 Liderazgo (AD-04 a AD-12, FALT-07).** Migración `0010_procesos_liderazgo.sql` con 13 procesos (transferir, responder y cancelar el liderazgo; convocar y votar la elección; `proc_eleccion_vencidas`; salir, expulsar, gestionar invitados, ver y cambiar la configuración, archivar), todos en `docs/08`. API en `rutas/liderazgo.ts` (`NX002` → 403) y temporizador de plazos `trabajos/plazos.ts` (cada minuto; `pg-boss` en la Fase 4). Web: `equipo/eleccion` (transferencia, elección e historial), `equipo/ajustes` (configuración, salir, archivar), acciones del líder en Miembros y la ficha `equipo/:id`. Decisiones: DEC-032 (todos son candidatos, voto secreto, desempate por antigüedad, recuento de votaciones al salir, notificaciones).
- **Pruebas de 3.5:** 82 pruebas SQL de procesos (P70–P82; **P76 es una elección de punta a punta con plazos acortados**: empate, desempate, plazo vencido y resultado), 12 de la API (`liderazgo.test.ts`, también resuelta por plazo vencido). Totales: 187 `shared`, 136 API, 93 web. **Verificado en el navegador** con la semilla: Valeria convocó la elección, los siete integrantes votaron (Carlos vio «1 de 7 votaron» y su voto marcado), ganó Daniela con 6 votos, Valeria quedó como integrante y ve el historial con el conteo; Daniela le devolvió el liderazgo con una transferencia. En Miembros, el menú del líder ofrece ampliar o hacer integrante a Mariana (desactivado: «El equipo está lleno.») y expulsar.

- **3.4 Vistas secundarias (EQ-14 a EQ-20, NT-01).** Migraciones `0011_procesos_vistas.sql` (14 procesos: calendario, reuniones, actividad, notificaciones, reportes y plantillas) y `0012_archivos.sql` (tabla `archivo_contenidos` y 4 procesos de archivos), todos en `docs/08`; tipos de Kysely regenerados. API en `rutas/vistas.ts` (CSV de exportación, archivos en base64 con tope de 5 MB, descarga como adjunto). Web: `calendario`, `reportes`, `actividad`, `archivos` y `plantillas` del equipo y `app/notificaciones` con contador en la campana. Decisiones: DEC-033 (repeticiones, CSV seguro, archivos en PostgreSQL, plantillas de proyecto, qué genera notificaciones). Miembros (AD-01, AD-04, AD-05) y configuración (AD-06) quedaron en 3.5.
- **Pruebas de 3.4:** 100 pruebas SQL de procesos (P83–P100), 11 de la API (`vistas.test.ts`) y 7 de `shared` (CSV y esquemas). Totales: 194 `shared`, 147 API, 93 web. **Verificado en el navegador** con la semilla: Carlos agendó una reunión semanal (aparece cada jueves con su asistencia) y subió `minuta.txt`; el reporte muestra 9 tareas y 50 % a tiempo; la actividad lista ambas acciones; Valeria tiene en Notificaciones la invitación (3 sin leer).

- **3.6 Ajustes (PF-01 a PF-09).** Migración `0013_procesos_ajustes.sql` (`proc_usuario_ajustes`, `proc_usuario_ajustes_guardar`), API `GET/PATCH /yo/ajustes` y la web en `/ajustes/*`: perfil, cuenta (cerrar sesión), apariencia, avisos por evento y canal con horas de silencio y resumen diario, privacidad, mis equipos (con salir), atajos y ayuda. PF-05 (WhatsApp personal) queda como «Próximamente» para la Fase 4. DEC-034.
- **3.7 Pantallas faltantes «Fase 3» de `03` 9.2.** FALT-01 reportes personales (`proc_reporte_personal`, `GET /personal/reporte`, `app/personal/reportes`) y FALT-07 historial de liderazgo (en `equipo/eleccion`, 3.5).
- **Pruebas de 3.6 y 3.7:** P101–P103 y 4 de la API (`ajustes.test.ts`). **Verificado en el navegador:** las nueve secciones de Ajustes cargan; marcar «Reuniones por WhatsApp» queda guardado en la API; Carlos ve en Mis reportes sus 2 tareas del Equipo Nexo.

### Cierre

- **CI en verde** en el PR #11 (`feat/fase-3` → `Dev_Luis`), commit `6142acd`: gitleaks, migraciones `0001`–`0013`, 11 pruebas SQL de integridad y **103 de procesos**, control de `docs/08` (**97 procesos**), tipos de Kysely al día, `typecheck`, lint, formato, **438 pruebas** (194 `shared`, 151 API, 93 web) y build. Lo mismo pasa en local con PGlite.
- **Criterio de terminado de `03`, Fase 3:**
  - El Hill Chart muestra datos reales y se actualiza al arrastrar, con persistencia ✔ (3.1).
  - Un sprint se planea, se inicia, se cierra con instantánea y tiene retrospectiva ✔ (3.3).
  - Una elección de liderazgo completa funciona de punta a punta, con plazos acortados en la prueba ✔ (P76 y `liderazgo.test.ts`; en el navegador, una elección real con la semilla).
  - Las pantallas de 3.1 a 3.6 existen o están anotadas como fase posterior ✔ (ver «Fase posterior» abajo).
  - CI en verde ✔. **Tag `fase-3`: pendiente** hasta fusionar el PR #11 en `Dev_Luis` (como se hizo con `fase-2-5`).
- **Fase posterior (anotado a propósito):**
  - PF-05 WhatsApp personal y consentimiento → Fase 4.
  - Exportar o borrar todos los datos (FALT-09) y contraseña, correo y 2FA (PF-02) → Fase 5.
  - Notificaciones de asignaciones, menciones y vencimientos → con el despachador de eventos de la Fase 4 (hoy las crean liderazgo, elecciones y reuniones).
  - `pg-boss` → Fase 4: entonces sustituye al temporizador de plazos de las elecciones y escribe la foto nocturna del burndown.
  - Adjuntar archivos desde el detalle de la tarea (la API ya acepta `tarea_id`), el adjunto del formulario de contacto y la foto de perfil del onboarding.
  - Reuniones personales en el calendario personal (PER-04).

### Siguiente sesión: por dónde seguir

La Fase 3 está completa en `feat/fase-3`. Reglas que siguen en marcha (DEC-025): **todo acceso a datos es un proceso `proc_*`** en una migración nueva (la siguiente es `0014_…`), que termina con `SELECT fn_conceder_procesos();`, se documenta en `docs/08` (la CI falla si no: `pnpm procesos:verificar`), tiene casos en `apps/api/db/tests/pruebas_procesos.sql` (hoy P1–P103; al agregar, subir el número en `apps/api/scripts/pruebas-procesos.ts` y en el texto del paso de `.github/workflows/ci.yml`) y se llama desde `apps/api/src/repositorios/` con `llamarProceso()` y un esquema Zod de `packages/shared/src/respuestas.ts`. Si una migración cambia tablas, correr `pnpm db:tipos` y subir `apps/api/src/db/tipos.ts`.

1. Fusionar el PR #11 (`feat/fase-3` → `Dev_Luis`) y poner el tag `fase-3`; después, el PR `Dev_Luis` → `dev`.
2. **Fase 3.5 · Despliegue** (`10_Plan_de_Despliegue.md`): Vercel + Render + dominio propio. El temporizador de plazos ya corre en el proceso de la API.
3. **Fase 4 · Chat y WhatsApp**, que trae `pg-boss`, el despachador de eventos (notificaciones de asignaciones y menciones) y PF-05.

**BD local sin Docker:** `node node_modules/@electric-sql/pglite-socket/dist/scripts/server.js --db=memory:// --port=5432 --extensions=citext --max-connections=10` desde una carpeta con `@electric-sql/pglite@0.5.16` y `@electric-sql/pglite-socket@0.2.19` instalados; después `pnpm db:reset`, `pnpm db:test`, `pnpm db:test:procesos` y `DATABASE_URL=postgres://nexo:nexo@localhost:5432/nexo pnpm test`.

### Pendiente

- [ ] Fusionar el PR #11 y poner el tag `fase-3`.
- [ ] Revisar DEC-031 a DEC-034, en especial: qué entra al planear (más que «aceptadas»), capacidad sin estimaciones, todos los integrantes como candidatos y desempate por antigüedad (DEC-032), archivos guardados en PostgreSQL (DEC-033).
- [ ] Revisar DEC-030 (forma por miembro) y los pendientes de la Fase 2.5 (PR `Dev_Luis` → `dev`, secret scanning, V-10 y V-11).
