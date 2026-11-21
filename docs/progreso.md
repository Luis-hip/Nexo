# Nexo · Progreso

> Se actualiza al terminar cada fase (docs/03, sección 1.7): qué se hizo, qué quedó pendiente.

## Estado general

*Actualizado el 2026-11-21: pendientes tras la Fase 5 resueltos (P-01 a P-10), WhatsApp real probado con el número de pruebas y cuentas de la semilla en producción (DEC-038). Siguiente: Fase 6 · Cierre.*

| Fase | Estado | Etiqueta | Dónde está |
|---|---|---|---|
| 0 · Arranque | Terminada (lo de personas que quedaba está `[~]` ignorado hasta nuevo aviso o es la revisión de Docker) | — | `produccion` |
| 1 · Base, roles y espacio personal | Terminada | `fase-1` | `main` |
| 2 · Equipos, tablero y estados | Terminada | `fase-2` | `main` y `produccion` |
| 2.5 · Cambios de alcance | Terminada | `fase-2-5` | `dev` y `main` |
| 3 · Hill Chart, sprints y vistas secundarias | Terminada | `fase-3` | `dev` y `main` |
| 3.5 · Despliegue | En línea con las Fases 0–5; prueba de humo hecha. Copias, raíz `nexo.lol` y plan de pago: `[~]` ignorados hasta nuevo aviso | — | `produccion` |
| 4 · Chat y WhatsApp | Terminada y en producción (WhatsApp en modo simulado; envío real comprobado en local con el número de pruebas, DEC-WA-2) | `fase-4` | `produccion` |
| 5 · Autenticación, QA y permisos | Terminada y en producción | `fase-5` | `produccion` |
| Pendientes tras la Fase 5 | Terminados y en producción (P-01 a P-10, DEC-037 y DEC-038) | — | `produccion` |
| 6 · Cierre | **Siguiente** | — | — |

**`produccion` tiene las Fases 0 a 5** (último: PR #33, `4a2edff`, 2026-11-21) y de ella salen los despliegues: front en Vercel (`https://app.nexo.lol`) y API en Render (`https://api.nexo.lol`), ambos en plan gratuito (DEC-036; la BD expira el **2026-12-18**). Detalle y pendientes en la Fase 3.5 y en `docs/operacion.md`. Flujo de ramas: `Dev_<Nombre>` → `dev` → `main` → `produccion`, siempre por PR con la CI en verde (DEC-001).

Las casillas `[x]` de abajo son pendientes que ya se cumplieron (se dejan con su comprobación para no perder el historial); las `[ ]` siguen abiertas; las `[~]` están **ignoradas hasta nuevo aviso** (no cuentan como faltantes: dependen de la verificación del negocio en Meta, DEC-WA-2).

## Fase 0 · Arranque del repositorio y de la BD

**Estado:** construida; la CI está en verde en `main`. Los cuatro pendientes de abajo son de personas (decisiones o cuentas), no de código.

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

- [x] **Proteger `main`, `dev` y `produccion`** en GitHub (DEC-001). Comprobado el 2026-11-18: las tres ramas figuran como protegidas (`protected: true`); el detalle de las reglas (PR obligatorio y el check **Verificar (BD, tipos, lint, pruebas, build)**) no se pudo leer sin sesión de administrador.
- [~] (Ignorado hasta nuevo aviso, 2026-11-20.) Confirmar que el repositorio es **privado** y decidir la **licencia** (DEC-009). Hoy el repositorio es **público** y no tiene licencia (comprobado el 2026-11-18).
- [ ] Tablero de proyecto en GitHub (Por hacer / En curso / En revisión / Hecho) e *issues* por fase y módulo grande.
- [x] **0.7 WhatsApp** (Carlos e Isac, con Jova). **Hecho lo necesario (2026-11-20):** cuenta, app, WABA de prueba y número de pruebas; D-01 resuelta para esta etapa (DEC-WA-2: mensajes directos con el número de pruebas). [~] La verificación de la empresa, la OBA y los grupos quedan **ignorados hasta nuevo aviso**. Historial:: cuenta de Meta for Developers, app, WABA, número de pruebas, verificación de la empresa, y llenar `docs/whatsapp-verificacion.md`. Con eso, decidir **D-01**. **Avance (2026-11-18):** cuenta, app «Nexo conexión de equipos», WABA de prueba y número de pruebas **hechos**; `docs/whatsapp-verificacion.md` llenado con datos oficiales (preguntas 2 y 6 y la tarifa en MXN, «no se pudo verificar»). **Pendiente:** verificación de la empresa (faltan documentos reales; el sitio `nexo.lol` ya existe pero el dominio raíz sigue en el parking de Porkbun), solicitud de OBA (exige verificación, 30 días y un número real) y decidir D-01. Capturas de evidencia sin adjuntar.
- [ ] Probar `docker compose up -d` + `pnpm db:reset` en una máquina con Docker (la de Luis aún no lo tiene). Mientras tanto la BD se cubre con `pnpm db:local` (PGlite) y con la CI en PostgreSQL 16.

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
- [x] PR `Dev_Luis` → `dev` con CI en verde y tag `fase-1`. Hecho: el tag existe y la Fase 1 llegó a `dev` y `main` junto con la Fase 2.
- [x] Rutas que mostraban «Próximamente»: crear o unirse a un equipo y `/app/e/:equipo/*` (Fase 2), reportes personales, notificaciones y `/ajustes/*` (Fase 3) y las invitaciones (Fase 2) ya funcionan. **Siguen en «Próximamente»:** registro, recuperar contraseña, verificar correo y 2FA (Fase 5) y WhatsApp personal (Fase 4).
- [x] (Hecho 2026-11-20, P-02.) En el calendario personal solo hay entregas de tareas; las reuniones del equipo ya están en el calendario del equipo (Fase 3), pero **no** en el personal (PER-04): queda para una fase posterior. *(El Hill Chart ya se arrastra: Fase 3.1.)*
- [x] (2026-11-20, P-09: foto de perfil hecha en el onboarding y en Ajustes; el adjunto del contacto queda en fase posterior, DEC-037.) El formulario de contacto no admite adjuntos y el onboarding no sube foto de perfil. La API de archivos (EQ-19, Fase 3) ya existe; falta enlazarla en esas dos pantallas.
- Nota: el aviso de cookies guarda la elección en el navegador; no hay analítica instalada.

## Fase 2 · Equipos, tablero y estados

**Estado:** terminada. PR #7 a `dev`, #8 a `main` y #9 a `produccion`; tag `fase-2`; la CI quedó en verde en `dev`, `main` y `produccion` (comprobado el 2026-11-18).

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

- [x] CI en verde, PR `Dev_Luis` → `dev` → `main` → `produccion` y tag `fase-2`.
- [ ] Revisión **visual** por una persona (claro/oscuro y móvil): solo se tomó una captura del tablero (tema oscuro, escritorio estrecho). El arrastre con el **ratón** no se pudo reproducir con la herramienta de pruebas (suelta de golpe); el arrastre con teclado sí se verificó.
- [ ] Prueba de «mover en dos navegadores a la vez» a nivel de interfaz: está probada en la API (200 y 409) y la web muestra el aviso, pero no se probó con dos navegadores reales.
- [x] Salir y expulsar: hechos en la Fase 3, tarea 3.5 «Liderazgo» (DEC-032).
- [x] (Hecho 2026-11-20, P-04 y P-05.) Invitar por correo (necesita el envío de correos, Fase 5) y **solicitudes del invitado** para ampliar su acceso o ser integrante (la tabla `solicitudes_invitado` existe, pero no hay proceso ni pantalla; no estaba en 3.1–3.7). Chat y WhatsApp: Fase 4. Ver DEC-023.
- [x] Sin sprint activo no había planeación: los sprints llegaron en la Fase 3.3 (DEC-031).

## Fase 2.5 · Cambios de alcance

**Estado:** terminada el 2026-11-17 (rama `feat/fase-2-5` fusionada en `Dev_Luis`, tag `fase-2-5`), y llevada a `dev` y `main` junto con la Fase 3 (PR #12 y el siguiente de `dev` a `main`). Fuente: `docs/07_Cambios_de_Alcance_Fase2.md`.

### Hecho

- **Paso 1 · Documentos y decisiones.** Copiados `07` y `10`; creados `08_Procesos_BD.md`, `09_Seguridad_y_Secretos.md` y `seguridad-incidentes.md`; actualizados `01`–`06`, el README y `decisiones.md` (DEC-024 a DEC-029; DEC-020 marcada como reemplazada en parte). D-02 eliminada (el nombre es Carlos) y D-03 resuelta (Vercel + Render + dominio propio). Mapa de fases con 2.5 y 3.5.

- **Paso 2 · Secretos.** *Informe:* se revisó todo el historial de Git (todas las ramas) y el árbol con patrones de claves (AWS, GitHub, Slack, Meta, llaves privadas, URL con contraseña, asignaciones `secret/token/password`): **no hay secretos**; solo aparece la cadena de desarrollo `nexo:nexo@localhost` de `.env.example` y de la CI, que es pública y desechable. `.env` nunca estuvo en el historial. *Cambios:* `pino` oculta cookies, `set-cookie`, tokens, contraseñas, secretos, claves y cuerpos; `config.ts` exige en producción `SESSION_SECRET` (≥ 32), `ENCRYPTION_KEY` (64 hex), `APP_URL` y `API_URL` (https, sin valor local) y rechaza los valores de `.env.example`; la API comprueba `Origin` en `POST/PUT/PATCH/DELETE`; gitleaks (v8.24.2, historial completo) en la CI con `.gitleaks.toml`; `.env.example` documentado. Pruebas nuevas: 21 en `config.test.ts` y `seguridad.test.ts`. **Sin verificar:** gitleaks no se ejecutó en local (no está instalado; lo corre la CI).
- **Pendiente tuyo (no se puede por CLI aquí):** activar *secret scanning* y *push protection* en GitHub (Settings → Code security) y decidir si el repositorio pasa a privado (hoy es público); no hay `gh` en esta máquina.

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

- [x] **Abrir el PR `Dev_Luis` → `dev`.** Hecho: PR #12 (incluye las Fases 2.5 y 3).
- [~] (Ignorado hasta nuevo aviso, 2026-11-20.) Activar *secret scanning* y *push protection* en GitHub y decidir si el repositorio pasa a privado (ver Paso 2). Hoy es público.
- [ ] Revisar los valores por confirmar V-10 y V-11 y las desviaciones anotadas arriba (decisión de Luis).

### Cierre

- **CI en verde** con PostgreSQL 16 real en el PR #10 (`feat/fase-2-5` → `Dev_Luis`), commit `4b93540`: gitleaks sobre todo el historial, migraciones `0001`–`0008`, 11 pruebas SQL de integridad y 52 de procesos, control de `docs/08`, tipos al día, `typecheck`, lint, formato, 361 pruebas (170 `shared`, 104 API, 87 web) y build.
- **gitleaks en la CI:** en la primera corrida marcó dos falsos positivos (los valores de ejemplo de las pruebas de seguridad y la frase «secretos: `09_Seguridad_y_Secretos.md`» de `docs/01`); se permitieron con expresiones concretas en `.gitleaks.toml`, sin excluir archivos. Ahora cada hallazgo aparece como anotación del PR (archivo, línea y regla; el valor va redactado).
- **Criterio de terminado de la `07` (sección 7):** documentos 07–10 ✔; informe de secretos, redacción, arranque seguro y gitleaks ✔; votación probada (3 → 2, 4 → 3, líder e invitado no votan, la API no devuelve votos ajenos) ✔; todo acceso a datos por `proc_*` documentados, regla de lint y `nexo_app` sin tablas ✔; pruebas de la Fase 2 en verde sin cambiar expectativas (salvo las de triaje, a propósito) ✔; `progreso.md` y `decisiones.md` ✔; tag `fase-2-5` ✔. El PR a `dev` se abrió junto con la Fase 3 (PR #12).

## Fase 3 · Hill Chart, sprints y vistas secundarias

**Estado:** terminada el 2026-11-18 (rama `feat/fase-3` fusionada en `Dev_Luis` con el PR #11, tag `fase-3`) y llevada a `dev` (PR #12) y a `main`. La CI quedó en verde en cada paso.

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
  - CI en verde ✔ y tag `fase-3` ✔: el PR #11 se fusionó en `Dev_Luis` por avance directo (sin commit de fusión, como la 2.5) y el tag apunta a `583ee77`.
- **Fase posterior (anotado a propósito):**
  - PF-05 WhatsApp personal y consentimiento → Fase 4.
  - Exportar o borrar todos los datos (FALT-09) y contraseña, correo y 2FA (PF-02) → Fase 5.
  - Notificaciones de asignaciones, menciones y vencimientos → con el despachador de eventos de la Fase 4 (hoy las crean liderazgo, elecciones y reuniones).
  - `pg-boss` → Fase 4: entonces sustituye al temporizador de plazos de las elecciones y escribe la foto nocturna del burndown.
  - Adjuntar archivos desde el detalle de la tarea (la API ya acepta `tarea_id`), el adjunto del formulario de contacto y la foto de perfil del onboarding.
  - Reuniones personales en el calendario personal (PER-04).

### Siguiente sesión: por dónde seguir

Las Fases 0 a 3 están completas y en `main`; la Fase 4 se empieza desde `Dev_Luis` (que debe estar al día con `dev`: `git pull origin dev`) en una rama nueva, por ejemplo `feat/fase-4`. Reglas que siguen en marcha (DEC-025): **todo acceso a datos es un proceso `proc_*`** en una migración nueva (la siguiente es `0014_…`), que termina con `SELECT fn_conceder_procesos();`, se documenta en `docs/08` (la CI falla si no: `pnpm procesos:verificar`), tiene casos en `apps/api/db/tests/pruebas_procesos.sql` (hoy P1–P103, la siguiente es **P104**; al agregar, subir el número en `apps/api/scripts/pruebas-procesos.ts` y en el texto del paso de `.github/workflows/ci.yml`) y se llama desde `apps/api/src/repositorios/` con `llamarProceso()` y un esquema Zod de `packages/shared/src/respuestas.ts`. Si una migración cambia tablas, correr `pnpm db:tipos` y subir `apps/api/src/db/tipos.ts`.

1. **Fase 4 · Chat y WhatsApp** (`03`, Fase 4): Socket.IO con la cookie de sesión, salas por equipo y conversación, WhatsApp simulado de punta a punta y envío real solo si la cuenta de Meta está lista. Trae `pg-boss` (sustituye al temporizador de plazos de `trabajos/plazos.ts` y escribe la foto nocturna del burndown), el despachador de eventos (notificaciones de asignaciones, menciones y vencimientos) y PF-05.
2. **Antes de la 4.3 (envío real):** la tarea **0.7 WhatsApp** (cuenta de Meta, WABA, número de pruebas, verificación de la empresa y `docs/whatsapp-verificacion.md`; Carlos e Isac, con Jova) y la decisión D-01. Sin eso, la 4.2 sigue en modo simulado.
3. **Fase 3.5 · Despliegue** (`10_Plan_de_Despliegue.md`, `operacion.md`, DEC-035 y DEC-036): **hecho el 2026-11-18** el front en Vercel (`app.nexo.lol`), la API y la BD en Render en plan gratuito (`api.nexo.lol`), el rol `nexo_app` y 13 migraciones aplicadas. **Pendiente:** prueba de humo (sin `DEV_LOGIN` en producción no hay cómo entrar hasta la Fase 5), copias y restauración (no existen en el plan gratuito), redirigir `nexo.lol` a `app.`, limitar el acceso externo a la BD y pasar a plan de pago antes del 2026-12-18 o exportar los datos.

**BD local sin Docker:** `pnpm db:local` en una terminal aparte que quede abierta (PGlite en el puerto 5432, datos en `.pglite/`, ignorada por git; sobreviven al cerrarla); después `pnpm db:reset` la primera vez, `pnpm db:test`, `pnpm db:test:procesos` y `DATABASE_URL=postgres://nexo:nexo@localhost:5432/nexo pnpm test`. Si la terminal se cierra, la API da `ECONNREFUSED` en el 5432 y el acceso de desarrollo no carga usuarios.

### Pendiente

Decisiones y revisiones que son de personas (no bloquean la Fase 4):

- [ ] Revisar DEC-031 a DEC-034, en especial: qué entra al planear (más que «aceptadas»), capacidad sin estimaciones, todos los integrantes como candidatos y desempate por antigüedad (DEC-032), archivos guardados en PostgreSQL (DEC-033).
- [ ] Revisar DEC-030 (forma por miembro) y V-10 y V-11 de la Fase 2.5.
- [x] PR `Dev_Luis` → `dev` → `main` de las Fases 2.5 y 3 (pendiente de la Fase 2.5): hecho el 2026-11-18.
- [~] (Ignorado hasta nuevo aviso, 2026-11-20.) Activar *secret scanning* y *push protection* y decidir privacidad y licencia del repositorio (Fases 0 y 2.5).
- [ ] Revisión **visual** por una persona del tablero, sprints y ajustes en claro/oscuro y móvil (Fases 1 a 3). La verificación automática cubrió contraste, estructura y desbordamiento, no el aspecto.

## Fase 4 · Chat

**Estado:** la parte del chat (tarea 4.1) está construida en la rama `feat/fase-4-chat` (sale de `Dev_Luis`). La parte de WhatsApp (4.2, 4.3, PF-05, FALT-03/04 y consentimiento) la hace otro integrante en paralelo en su rama. El tag `fase-4` se crea al juntar ambas partes. Reservas para no chocar: migraciones `0014`–`0019` y pruebas de procesos `P104`–`P149` para el chat; WhatsApp usa pruebas desde `P150` y, como el chat y la Fase 5 se despliegan antes (DEC-AUTH-2), migraciones desde `0031`.

### Hecho

- **Base de datos.** Migraciones `0014_procesos_chat_lectura.sql`, `0015_procesos_chat_envio.sql` y `0016_procesos_chat_conversaciones.sql` con **16 procesos `proc_chat_*`** (todos en `docs/08`, sección «Fase 4 · Chat») y una sola regla de acceso, `fn_chat_puede`. No hubo cambios de tablas (solo el índice `ix_menciones_usuario`), así que `apps/api/src/db/tipos.ts` no cambia. Quedan libres `0017`–`0019`.
- **API.** `rutas/chat.ts` y `repositorios/chat.ts`: conversaciones, mensajes paginados por cursor, enviar (con `id_cliente` para no duplicar), hilos, reacciones, menciones con notificación, lecturas, fijar y silenciar conversaciones, fijar y eliminar mensajes (moderación del líder), mensajes directos, chat por tarea, búsqueda y convertir un mensaje en tarea.
- **Tiempo real.** `src/tiempoReal.ts`: Socket.IO en el mismo servidor, autenticado con la cookie de sesión; salas por conversación que decide el servidor; la audiencia se recalcula en cada emisión. Ver DEC-CHAT-1.
- **Web.** `/app/e/:equipo/chat` y `/chat/:conversacion` con CH-01 (lista con no leídos y menciones), CH-02 (canal del equipo), CH-03 (chat de tarea: botón «Abrir el chat de la tarea» en el detalle y ruta `chat/tarea/:tareaId`), CH-04 y CH-07 (mensajes directos y «Nueva»), CH-05 (hilo en panel), CH-06 (fijados), CH-08 (búsqueda con resaltado), CH-09 (convertir en tarea, solo líder) y CH-10 (canal de Invitados). Insignia de no leídos junto a «Chat» en la barra lateral. Menciones con sugerencias al escribir `@`.
- **Pruebas.** 26 pruebas SQL de procesos (**P104–P129**; `pnpm db:test:procesos` da 129 OK), 9 de la API en `chat.test.ts` (incluida la de tiempo real con tres sockets: **Carlos y Daniela reciben el mensaje del equipo y Mariana, la invitada, no**; ella sí recibe el del canal de Invitados) y 4 de la web (`menciones.test.ts`). Totales locales: 194 `shared`, 160 API, 97 web; `procesos:verificar` cuenta 113 procesos. Contadores actualizados en `apps/api/scripts/pruebas-procesos.ts` (ahora por rangos, uno por línea, para que la rama de WhatsApp agregue el suyo sin conflicto) y en el nombre del paso de `.github/workflows/ci.yml`.
- **Verificado en el navegador** con la semilla (como Carlos): canal del equipo, mención a Valeria con sugerencia y resaltado, un mensaje de Valeria enviado por la API desde fuera **apareció sin recargar** y «Leído por» se actualizó solo; respuesta en un hilo con el panel lateral a 1280 px; vista de una columna a 800 px. Sin errores en la consola. **Local con PGlite**; la CI lo comprueba con PostgreSQL 16 (aún no corre: no se ha hecho push).

### Criterio de la Fase 4 que cubre esta parte

- [x] «Dos navegadores con distintos usuarios intercambian mensajes en tiempo real; un invitado **no** recibe mensajes del chat del equipo (prueba)»: probado de forma automática en `chat.test.ts` con tres conexiones reales. En la interfaz se probó con un navegador y un segundo usuario por la API, **no con dos navegadores reales**.
- [x] Los demás puntos del criterio son de WhatsApp: cubiertos en «Fase 4 · WhatsApp» (abajo).
- [x] CI en verde (PR #23 a #30).

### Pendiente o movido

- [x] **El despachador de eventos** (avisos de asignaciones, propuestas y vencimientos) se hizo con WhatsApp (ver abajo, DEC-WA-1), en el temporizador de la API y **sin `pg-boss`**. Siguen sin hacerse: sustituir `trabajos/plazos.ts` y la foto nocturna del burndown.
- [x] (2026-11-20, P-07.) Editar mensajes e indicador de «escribiendo…» hechos. Adjuntar archivos en el chat queda en fase posterior (los archivos se adjuntan a la tarea, P-03).
- [x] (2026-11-20, P-10.) La insignia de no leídos es en tiempo real en todo el equipo (antes, cada 2 minutos fuera del chat).
- [ ] Render en plan gratuito duerme la API a los 15 minutos: el socket se reconecta al despertar, pero el primer mensaje tarda (DEC-036).
- [ ] Revisión **visual** por una persona del chat en claro/oscuro y móvil.
- [x] Las decisiones del chat usan el prefijo `DEC-CHAT-` y las de WhatsApp `DEC-WA-`: se conservan así (no se renumera, para no romper referencias).

### Fase 4 · WhatsApp (4.2 y 4.3)

**Estado:** terminada y en producción desde el 2026-11-19 (PR #27 → #29 → #28 → #30, tag `fase-4` en `de2f9a1`). Se construyó en `feat/fase-4-whatsapp` (sale de `produccion` con el chat y la Fase 5). La rama `Dev_Isac` se juntó ahí (`5f5e9fa`): traía otra versión del chat, no WhatsApp, y se conservó la nuestra (DEC-WA-1).

#### Hecho

- **Base de datos.** Migración `0031_procesos_whatsapp.sql` con **20 procesos `proc_wa_*`** (en `docs/08`, «Fase 4 · WhatsApp»): despachador de eventos, vencimientos, reportes, envíos, resultado de entrega y webhook (sistema); panel, cola, historial, editar, descartar, reintentar, enviar, conectar, desconectar, configurar y reglas (líder); número, consentimiento general y por equipo (persona). Agrega columnas (`envio_automatico`, `ultimo_reporte_en`, `entregado_en`, `leido_en`, `reporte_id`) y los índices `ix_wa_msj_pendientes` (**Q4 ya no hace barrido: 7 de 7**) e `ix_wa_msj_proveedor_id`. El despachador también crea los avisos en la app que faltaban (asignación, propuesta nueva, vencimiento).
- **API.** `rutas/whatsapp.ts`, `repositorios/whatsapp.ts`, `whatsapp/proveedor.ts` (`simulado`, `cloud_api_grupos`, `cloud_api_directo`) y `trabajos/whatsapp.ts` (ciclo cada minuto). Webhook `GET`/`POST /whatsapp/webhook` con firma HMAC-SHA256 e idempotencia. `WHATSAPP_PROVIDER=simulado` por defecto: **no se envía nada real**.
- **Web.** `/app/e/:equipo/whatsapp`: WA-01 panel, WA-02 y WA-03 cola con vista previa tipo WhatsApp (editar, seleccionar, descartar, enviar), WA-04 historial (también para integrantes), WA-05 reglas y reporte, WA-06 conectar (asistente de 3 pasos; solo el simulado está activo), WA-07 consentimiento por persona y WA-08 pausa, error, reintentar y desconectar. **PF-05** en Ajustes → WhatsApp (número, consentimiento general y por equipo).
- **Pruebas.** 20 SQL (**P150–P169**; `db:test:procesos` da **158 OK**), 10 de la API (`whatsapp.test.ts`: cola → enviar → historial, consentimiento, reporte a la hora, webhook con firma buena y mala), las 3 sondas de WhatsApp en `matriz.test.ts`, el flujo extremo a extremo «3b» (aviso simulado: conectar, enviar y verlo en el historial) y WA-01, 02, 04, 05, 07 y PF-05 en `revision.e2e.ts` (axe y 360 px). `procesos:verificar` cuenta **143** procesos.
- **Integración con la API de Meta (imitada).** `apps/api/src/whatsapp/integracion.test.ts` corre el servidor con `WHATSAPP_PROVIDER=real` contra un servidor local que imita la API Cloud de Meta (`WHATSAPP_API_URL`; en producción solo se acepta `https://graph.facebook.com/…`): envío directo (una petición por persona con consentimiento, con token y cuerpo exactos), envío al grupo, error de Meta → fallido → reintento → enviado, estados «entregado», «leído» y «failed» por el webhook firmado (sin duplicar) y el modo simulado sin llamadas a Meta. 6 pruebas; la API queda en 191.
- **Capturas** para el artículo en `docs/capturas/` (`wa-01` a `wa-07` y `pf-05`, escritorio y móvil).
- **Verificado en el navegador** con la semilla: Valeria conecta el simulado, la cola muestra el vencimiento y la reunión con la burbuja, envía y aparecen en el historial; Carlos ve solo el historial.

#### Criterio de la Fase 4

- [x] Dos navegadores intercambian mensajes en tiempo real; el invitado no recibe los del equipo (`chat.test.ts`, flujo E2E 3).
- [x] Un evento de tarea genera el aviso con la plantilla correcta; el líder lo envía y sale en el historial como enviado (P151, P157, `whatsapp.test.ts`, E2E «3b»).
- [x] Sin consentimiento no se menciona a la persona (P152, `whatsapp.test.ts`).
- [x] Un reporte programado se genera y se envía a la hora (P161, P162, `whatsapp.test.ts`).
- [x] Envío real: **nota explícita de por qué no se hizo** (DEC-WA-1: falta la cuenta OBA; el proveedor real y el webhook están construidos y probados sin cuenta).
- [x] CI en verde y tag `fase-4` (en `de2f9a1`, 2026-11-20).

#### Pendiente

- [~] **Envío a grupos (4.3 con API de grupos):** verificación de la empresa, OBA y número real. Ignorado hasta nuevo aviso (DEC-WA-2).
- [ ] **Envío real con el número de pruebas** (mensajes directos, DEC-WA-2): ver «Pendientes tras la Fase 5».
- [~] **FALT-03 y FALT-04** (unirse al grupo y aprobar solicitudes): necesitan la API de grupos con OBA. Ignorado hasta nuevo aviso; mientras, el enlace de invitación se ve en Ajustes → WhatsApp.
- [~] Verificar el número por código (`whatsapp_usuario.verificado_en` existe, no hay flujo): ignorado hasta nuevo aviso (P-11). D-01 ya resuelta (DEC-WA-2).
- [ ] La API duerme en el plan gratuito de Render: los reportes pueden salir tarde (al despertar).
- [x] Desplegado el 2026-11-19 (Render, *Manual Deploy* de `de2f9a1`): la `0031` se aplicó y marcó como procesados los eventos viejos; `/yo/whatsapp` responde 401 sin sesión y el webhook rechaza peticiones sin firma.

## Fase 5 · Autenticación, QA y permisos

**Estado:** construida en la rama `feat/fase-5-auth` (sale de `feat/fase-4-chat`, así que trae también el chat). **Se despliega junto con el chat antes que WhatsApp** (decisión del 2026-11-19, DEC-AUTH-2): la parte de WhatsApp, que se hace en paralelo en otra rama, debe numerar sus migraciones **desde `0031`** (no `0020`) porque las migraciones se aplican en orden (`checkOrder`) y producción ya tendrá la `0030`. Sus pruebas de procesos siguen en `P150`–`P199`. El tag `fase-5` se crea con la CI en verde en `produccion`; el `fase-4`, al juntar WhatsApp.

### Hecho

- **5.1 Autenticación real.** Migración `0030` con **10 procesos `proc_auth_*`** (en `docs/08`, «Fase 5 · Autenticación»). Registro, entrar, salir, recuperar y restablecer contraseña, verificar correo, sesión expirada y cambio de contraseña en Ajustes → Cuenta. Argon2id, bloqueo de 15 min tras 5 fallos, límite por IP, respuestas que no revelan si un correo existe al entrar o recuperar, correos por consola (local) o Resend (producción). DEC-AUTH-1.
- **5.2 Validaciones.** Todos los cuerpos de la API se validan con Zod (`validar()` en cada ruta). Ahora **los mensajes que genera Zod salen en español** en la API y la web (`packages/shared/src/idioma.ts`; antes un campo faltante respondía «Invalid input…»). Los formularios de registro, entrar, recuperar, restablecer, tareas personales y de equipo, crear equipo, contacto, **reuniones, plantillas y configuración del equipo** validan en el cliente con el mismo esquema que la API (`apps/web/src/lib/validacion.ts`). Los campos de texto llevan `maxLength` igual al del esquema. Los demás (comentarios, notas de retro, chat) son de un solo campo y muestran el mensaje del servidor.
- **5.3 QA de permisos.** `apps/api/src/rutas/matriz.test.ts` recorre **las 41 acciones de la matriz** contra la API real para líder, integrante, invitado y una persona ajena (más de 150 comprobaciones), en un equipo que crea y borra la propia prueba; la del perfil personal y la de **no filtración** (19 lecturas del equipo y del chat dan 404 a quien no pertenece). Las 3 de WhatsApp quedan anotadas como «sin ruta en esta rama». Encontró que «usar plantilla» crea tareas y por eso lo guarda `crear_tarea` (DEC-033): la sonda se separó en ver plantillas (`usar_plantilla`) y convertirlas en tareas (`crear_tarea`). Sesiones: cerrar sesión invalida el token y uno vencido da 401 (`autenticacion.test.ts`, P208).
- **5.4 Rendimiento.** `pnpm db:volumen` (semilla de `02` 14.3: 50 equipos, 500 usuarios, 20 000 tareas, 200 000 mensajes y 10 000 avisos de WhatsApp) y `pnpm db:explain` (`EXPLAIN (ANALYZE, BUFFERS)` de las 7 consultas de `02` §13). En local (PGlite/PostgreSQL 18) ninguna hace barrido secuencial sobre tablas grandes; evidencia en `docs/rendimiento.md`. **En la CI, con PostgreSQL 16, Q4 (siguiente lote del worker de WhatsApp) sí hace `Seq Scan` en `whatsapp_mensajes`:** el índice parcial es de la cola de WhatsApp, que esta rama no toca, así que Q4 queda como *pendiente de la rama de WhatsApp* (se informa, no hace fallar) y las otras 6 sí hacen fallar la CI. El índice a agregar está en `apps/api/scripts/explain.ts` y en DEC-AUTH-3.
- **5.4 Extremo a extremo.** Playwright (`apps/web/e2e/flujos.e2e.ts`): (1) registrarse, crear equipo e invitar, y la otra persona se une con el código; (2) proponer una tarea, votarla, aceptar la asignación, habilitarla, empezarla y completarla; (3) chat en tiempo real entre dos navegadores. Pasa en local (dos corridas seguidas) y corre en la CI. El aviso de WhatsApp simulado del tercer flujo se suma al juntar la rama de WhatsApp.
- **5.4 Accesibilidad y móvil.** `apps/web/e2e/revision.e2e.ts` recorre 14 pantallas con líder, integrante e invitada: **sin desplazamiento horizontal a 360 px**, **axe-core (WCAG 2.1 A y AA) sin problemas graves ni críticos** y el primer Tab llega a «Saltar al contenido». Lo que encontró y se corrigió: contraste de las iniciales del avatar (6 de 16 colores bajo 4.5:1; ahora el texto se elige por contraste medido, con prueba), de las insignias verde y ámbar en tema claro (tokens un tono más oscuros), de los días de otro mes en el calendario (sin `opacity-60`), tablas con desplazamiento horizontal sin foco de teclado, y el nombre accesible del menú de perfil (WCAG 2.5.3). `prefers-reduced-motion` ya estaba en `index.css`.
- **5.5 Capturas.** `CAPTURAS=1 pnpm --filter @nexo/web e2e e2e/revision.e2e.ts` guarda en `docs/capturas/` 28 capturas de la app real (14 pantallas, escritorio y móvil): resumen del líder, integrante e invitada, tablero, votación, sprint activo, chat y canal de Invitados, calendario, reportes, miembros, inicio personal y cuenta. Las del artículo de WhatsApp (figuras 3–5 y 7–10) se toman al juntar esa rama.
- **Pruebas.** SQL de procesos: **138 OK**. API: 175 (11 de autenticación, 4 de la matriz). Web: 100 unitarias + 7 extremo a extremo. `shared`: 197.

### Criterio de terminado de la Fase 5

- [x] Registrar, entrar, salir y recuperar contraseña con una cuenta real (local, pruebas automáticas y extremo a extremo; en producción, tras el despliegue).
- [x] `DEV_LOGIN_ENABLED=false` en producción y el servidor lo exige.
- [x] La prueba de la matriz completa pasa (`matriz.test.ts`).
- [x] Las 7 consultas pasan la revisión de `EXPLAIN`: Q4 la cubre desde la `0031` el índice `ix_wa_msj_pendientes` (rama de WhatsApp).
- [x] Los 3 flujos extremo a extremo pasan (en la CI desde este PR).
- [x] CI en verde en `produccion` (PR #23 → #24 → #25 → #26).
- [x] Tag `fase-5` (en `0c02066`).

### Despliegue (2026-11-19)

- `produccion` en `0c02066` (PR #26). **Vercel** publicó el front solo; **Render no desplegó por su cuenta** (igual que con el PR #22): se lanzó a mano con *Manual Deploy → Deploy latest commit* y quedó *Live* en 1 min 14 s.
- Comprobado en producción: `/auth/cuenta` responde 401 (antes 404), `/auth/entrar` con una cuenta inexistente responde 401 con el mensaje genérico (llega a la BD: la `0030` está aplicada), `/dev/usuarios` da 404 (no hay acceso de desarrollo) y Socket.IO responde.
- **Prueba de humo:** una persona del equipo creó una cuenta en `app.nexo.lol/registro`; la sesión abre y Ajustes → Cuenta muestra el correo «Sin verificar» y 1 sesión. Sin Resend no llega el correo de verificación (esperado).
- El aviso «Sin conexión» que se vio en el navegador de pruebas viene de `navigator.onLine = false` de ese navegador, no de la app.

### Pendiente

- [~] (Ignorado hasta nuevo aviso, 2026-11-20.) **Cuenta de Resend** y dominio verificado para enviar correos en producción; poner `RESEND_API_KEY` en Render. Sin ella se puede registrar y entrar, pero no recuperar la contraseña ni verificar el correo.
- [x] (Hecho en `feat/fase-4-whatsapp`: `0031`, índice, `explain.ts` y sondas.) **Avisar a quien hace WhatsApp** que renumere sus migraciones desde `0031` (DEC-AUTH-2), que agregue en una de ellas el índice `ix_wa_msj_pendientes` para Q4 (y quite `pendiente` de Q4 en `explain.ts`), y que sume a `matriz.test.ts` las sondas de `configurar_whatsapp`, `enviar_cola_whatsapp` y `ver_historial_whatsapp`.
- [ ] Revisar DEC-AUTH-1 (el registro sí dice si un correo ya tiene cuenta).
- [ ] 2FA (AUTH-07), cambio de correo e inicio con Google: fase posterior.
- [x] Capturas de WhatsApp para el artículo (`docs/capturas/wa-*` y `pf-05-*`).
- [ ] Revisión visual por una persona: la automática cubre contraste, desbordamiento y estructura, no el aspecto.

## Pendientes tras la Fase 5 (auditoría del 2026-11-20)

Cruce de `03` (Fases 0 a 5, sección 9 y criterio de la 3.5 en `10`) con lo construido. Se trabajan en `Dev_Luis`. **Tipo:** *código* (lo hace el equipo de desarrollo), *persona* (decisión, cuenta o revisión que no se puede automatizar) o *ignorado* (`[~]`, DEC-WA-2).

| # | Pendiente | Origen | Tipo | Cómo se aborda | Estado |
|---|---|---|---|---|---|
| P-01 | Exportar y eliminar mis datos (FALT-09, PF-06) | `03` 9.2, Fase 5 | código | `proc_datos_exportar` y `proc_cuenta_eliminar`; Ajustes → Privacidad descarga el JSON y elimina la cuenta con contraseña y «ELIMINAR» | Hecho (2026-11-20) |
| P-02 | Reuniones del equipo en el calendario personal (PER-04) | Fase 1 | código | `proc_personal_agenda`; las reuniones salen en el mes y en el día elegido, con enlace al equipo | Hecho (2026-11-20) |
| P-03 | Adjuntar archivos desde el detalle de la tarea (EQ-06 / EQ-19) | Fase 3 | código | Sección «Archivos» con «Adjuntar» en el detalle (mismas reglas: 5 MB y tipos permitidos) | Hecho (2026-11-20) |
| P-04 | Invitar por correo (AD-02) | Fase 2 | código | «Enviar por correo» en cada invitación pendiente (`POST …/invitaciones/:id/enviar`); en producción sale cuando haya Resend (P-18) | Hecho (2026-11-20) |
| P-05 | Solicitudes del invitado (DEC-023) | Fase 2 | código | `proc_solicitud_invitado_*`: botones en el banner del invitado; «Solicitudes de invitados» en Miembros con aprobar (7, 14 o 30 días) o rechazar | Hecho (2026-11-20) |
| P-06 | Foto diaria del burndown | Fase 3 → 4 | código | `proc_sprint_fotos_diarias` en el temporizador de `trabajos/plazos.ts` | Hecho (2026-11-20) |
| P-07 | Chat: editar mensajes e indicador «escribiendo…» | Fase 4 | código | `proc_chat_editar` («(editado)») y «X está escribiendo…» por Socket.IO solo a la sala | Hecho (2026-11-20) |
| P-08 | Envío real con el número de pruebas (DEC-WA-2) | Fase 4.3 | código + persona | Plantilla fuera de la ventana de 24 h (DEC-WA-2) y `pnpm --filter @nexo/api wa:probar +52…`; la prueba real necesita el token y el id del número de Meta en `apps/api/.env` y un destinatario dado de alta en Meta | Hecho (2026-11-21): envío real a WhatsApp comprobado |
| P-09 | Adjunto en contacto y foto de perfil en el onboarding | Fase 1 | código | Foto de perfil en el onboarding y en Ajustes → Perfil (`proc_usuario_foto_*`). El formulario público de contacto **no** admite adjuntos: `contacto_mensajes` no tiene dónde guardarlos y abrir la subida a visitantes sin sesión es riesgo de abuso (DEC-037) | Foto hecha; adjunto del contacto a fase posterior |
| P-10 | Insignia de no leídos del chat en tiempo real fuera del chat | Fase 4 | código | El socket del chat escucha en todo el equipo; la insignia cambia al momento | Hecho (2026-11-20) |
| P-11 | Verificar el número de WhatsApp por código | Fase 4 | ignorado | Requiere mandar el código por WhatsApp real con un número verificado; con el de pruebas solo llega a destinatarios ya dados de alta | [~] |
| P-12 | Verificación del negocio, OBA, grupos, FALT-03/04 | 0.7 / 4.3 | ignorado | DEC-WA-2 | [~] |
| P-13 | Repositorio privado y licencia; *secret scanning* y *push protection* | Fases 0 y 2.5 | ignorado | Decisión de Luis. Ignorado hasta nuevo aviso (decisión de Luis, 2026-11-20) | [~] |
| P-14 | Tablero de proyecto e *issues* en GitHub | Fase 0 | persona | Decisión del equipo (el seguimiento real vive en `progreso.md`) | Abierto |
| P-15 | Probar `docker compose` en una máquina con Docker | Fase 0 | persona | Falta una máquina con Docker | Abierto |
| P-16 | Revisión visual por una persona (claro/oscuro y móvil) | Fases 1 a 5 | persona | La automática (axe, 360 px) ya pasa | Abierto |
| P-17 | Revisar DEC-030 a DEC-034, V-10, V-11 y DEC-AUTH-1 | Fases 2.5, 3 y 5 | persona | Lectura de Luis | Abierto |
| P-18 | Cuenta de Resend y `RESEND_API_KEY` | Fase 5 | ignorado | Sin ella no hay correos en producción (P-04 depende de esto en producción). Ignorado hasta nuevo aviso (decisión de Luis, 2026-11-20) | [~] |
| P-19 | Copias de seguridad, raíz `nexo.lol`, plan de pago antes del 2026-12-18 y *Auto-Deploy* de Render | Fase 3.5 | ignorado | Paneles de Render y Porkbun. Ignorado hasta nuevo aviso (decisión de Luis, 2026-11-20) | [~] |
| P-20 | 2FA, cambio de correo e inicio con Google | Fase 5 | — | Fuera de alcance («solo si hay tiempo», `03` 5.1): fase posterior | Fase posterior |

### Resultado del trabajo en `Dev_Luis` (2026-11-20)

- **Código:** migración `0032_procesos_pendientes.sql` (11 procesos, todos en `docs/08`, «Pendientes tras la Fase 5»), rutas en `apps/api/src/rutas/pendientes.ts`, WhatsApp con plantilla fuera de la ventana de 24 h y `wa:probar`, y las pantallas de P-01 a P-10. DEC-037.
- **Corrección encontrada al probar:** al aprobar que un invitado sea integrante con el equipo lleno, el aviso decía «El equipo ya tiene 0 miembros». La API ahora toma el tope del mensaje de la BD (también arregla convertir invitados desde el menú de Miembros).
- **Pruebas:** SQL 11 + **168** (P210–P219 nuevas); `procesos:verificar` **153**; API **200** (`pendientes.test.ts` 7, `chat.test.ts` con «escribiendo…» e `integracion.test.ts` de WhatsApp 7, con la plantilla); web 100; `shared` 197; extremo a extremo **8/8**; lint, tipos, formato y build en verde.
- **Verificado en el navegador:** reuniones en el calendario personal (Carlos), editar un mensaje («(editado)»), exportar mis datos, foto de perfil en Perfil y en la cabecera, solicitudes de Mariana en Miembros (aprobar con el equipo lleno da «El equipo ya tiene 8 miembros.»), botones del banner del invitado, archivo adjunto en T-02 y la insignia del chat que sube de 1 a 2 en el Resumen sin recargar.
- **WhatsApp:** el flujo completo (evento → cola → envío → historial → estados del webhook firmado) está probado en simulado y contra una API de Meta imitada, incluida la plantilla de la ventana de 24 h. **No se envió ningún mensaje a WhatsApp real**: en `apps/api/.env` no hay token ni id del número de pruebas (P-08).

### Prueba real de WhatsApp y cuentas en producción (2026-11-21)

- **WhatsApp real (P-08):** desde el número de prueba de Meta (+1 555 183 3695) al número personal de Luis dado de alta como destinatario. `wa:probar`: plantilla `hello_world` y aviso de Nexo aceptados por Meta. En la app local en modo real: reunión → cola → «Enviar» → `enviado` con el id de Meta. El token del panel caduca a las 24 h (`operacion.md` §14).
- **Cuentas de la semilla en producción (DEC-038):** 11 cuentas con el «Equipo Nexo» y todos sus datos, correos `@nexo.lol` y contraseñas propias (en `.credenciales-demo.md`, fuera de git). Comprobado: Valeria entra en `api.nexo.lol` y ve las tareas; la contraseña pública de la semilla es rechazada.

### Despliegue (2026-11-21)

- PR #31 (`Dev_Luis` → `dev`), #32 (`dev` → `main`) y #33 (`main` → `produccion`), con la CI en verde en los tres. `produccion` en `4a2edff`.
- **Render:** *Manual Deploy* de `nexo-api`; la `0032` se aplicó (solo procesos). **Vercel** publicó el front solo.
- **Comprobado en producción** con la cuenta de Carlos (DEC-038): entra, la agenda personal responde, las solicitudes del invitado le dan 403 por ser integrante y la exportación de sus datos responde 200; el front nuevo trae Ajustes → Privacidad (FALT-09) y las solicitudes del invitado.
- Producción sigue con `WHATSAPP_PROVIDER=simulado`. La plantilla `nexo_aviso` está en revisión de Meta.

## Fase 6 · Cierre (siguiente)

Según `03`, Fase 6. Plan:

| # | Tarea | Tipo | Cómo |
|---|---|---|---|
| F6-1 | Secretos de producción con la lista de `09_Seguridad_y_Secretos.md` | código + revisión | Repasar la lista; gitleaks ya corre en la CI |
| F6-2 | Prueba de humo completa en producción: registrar, crear equipo, proponer y votar, chatear y ver un aviso de WhatsApp (simulado) | código (Playwright contra `app.nexo.lol`) + persona | Un flujo E2E apuntando a producción con cuentas creadas para la prueba y borradas al final |
| F6-3 | Webhook de WhatsApp en la URL pública | — | `[~]` Ignorado hasta nuevo aviso: solo con cuenta real y token permanente (DEC-WA-2) |
| F6-4 | `README.md` para que alguien nuevo levante el proyecto en local | código | Instalación, BD local (PGlite o Docker), semilla y cuentas, pruebas y ramas |
| F6-5 | Tabla de verificación del artículo (`04`) sin `[VERIFICAR]` | persona (Carlos e Isac) | Hoy hay 6 marcas (comparativa Trello/Asana y 3 referencias); el código aporta capturas y cifras de pruebas |
| F6-6 | Resumen de lo que quedó fuera | código | Sección final en este archivo |
| F6-7 | Tag `v1.0` | — | Con la CI en verde en `produccion` y F6-1 a F6-6 cerrados |

## Mejoras pendientes (acordadas el 2026-11-21)

Se harán después del spike de WhatsApp 1 a 1 (`docs/11_Plan_Spike_WhatsApp_1a1.md`):

- [x] **Token permanente de WhatsApp y webhook en producción** (2026-11-21): usuario del sistema `nexo-api`, `WHATSAPP_PROVIDER=real` y las variables en Render, webhook en `https://api.nexo.lol/whatsapp/webhook` con el campo `messages` (`operacion.md` §15). Con el número de pruebas solo reciben los destinatarios dados de alta en Meta (hasta 5).
- [ ] **Adjuntos en el chat** (la tabla `archivos` ya tiene `mensaje_id`).
- [ ] **2FA o entrar con Google** (AUTH-07; tablas `credenciales_2fa` y `codigos_respaldo_2fa` y `usuarios.google_sub` ya existen).

## Spike: WhatsApp 1 a 1

Plan y reporte: `docs/11_Plan_Spike_WhatsApp_1a1.md` (secciones 15 y 16), DEC-039. En `Dev_Luis`.

- **Hecho (2026-11-21):** migración `0033` (entregas por persona, `modo_entrega` individual/grupo/ambos, tres formatos, ventana de 24 h, verificación del número, reporte personal, caducidad), 7 procesos nuevos y 9 ajustados, despachador por entregas con PDF (`pdf-lib`), mensajes entrantes (verificar, BAJA, REPORTE), y las pantallas del plan §9.
- **Pruebas:** SQL **180 OK** (P220–P231), API **209** (`spike.test.ts`, `integracion.test.ts`), web 100, E2E 8/8 con axe, `procesos:verificar` **160**.
- **Decisión:** go técnico; la pista B espera a Meta (plantillas en revisión, dos reclasificadas como marketing) y al token permanente con webhook en producción.
- **En producción (2026-11-21, PR #34 a #42):** spike desplegado con las migraciones `0033`–`0035`, `WHATSAPP_PROVIDER=real`, token permanente y webhook. Prueba real con el número de Luis: verificación (B6), «REPORTE» por texto dentro de la ventana (B3) y estados entregado/leído por webhook (B5). Correcciones del día: el código solo verifica, el texto entrante se limpia, «REPORTE» con la ventana abierta no usa plantillas y el paso de verificación se rediseñó (plan §16.2).
- [x] Pista B: B1, B3, B5 y B6.
- [ ] Pista B: B2 y B4 (esperan la aprobación de las plantillas en Meta).

