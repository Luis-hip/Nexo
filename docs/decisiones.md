# Nexo · Registro de decisiones

> Regla (docs/03, sección 1.2): si algo no está en `01`/`02`, se elige lo más simple, se anota aquí y se sigue; si es irreversible, se pregunta. Cada entrada: fecha, contexto, decisión y consecuencia. La decisión pendiente del producto D-01 sigue en `01_Contexto_y_Especificaciones.md` (D-02 se eliminó y D-03 quedó resuelta: DEC-027 y DEC-029).

| ID | Fecha | Tema | Estado |
|---|---|---|---|
| DEC-001 | 2026-11-12 | Convención de ramas y *pull requests* (`dev`, `main`, `produccion`, `Dev_<Nombre>`) | Vigente (revisada el mismo día; actualiza `01`, sección 9, y `03`, regla 1) |
| DEC-002 | 2026-11-12 | Primera ejecución de los scripts SQL (tarea 0.4) | Vigente |
| DEC-003 | 2026-11-12 | La migración `0001` no tiene bajada | Vigente |
| DEC-004 | 2026-11-12 | Cómo se ejecutan las pruebas SQL | Vigente |
| DEC-005 | 2026-11-12 | TypeScript 5.9 en lugar de 7 | Vigente |
| DEC-006 | 2026-11-12 | La API se ejecuta con `tsx` (sin compilar) hasta la Fase 6 | Vigente |
| DEC-007 | 2026-11-12 | Formateador: Prettier | Vigente |
| DEC-008 | 2026-11-12 | Tokens de color tomados de la tabla de `01` | Provisional (Fase 1) |
| DEC-009 | 2026-11-12 | Nombre del repositorio y licencia | Licencia pendiente |
| DEC-010 | 2026-11-12 | Versiones fijadas al crear el repositorio | Vigente |
| DEC-011 | 2026-11-12 | Matriz de permisos: textos y acciones del prototipo, evaluación estricta | Vigente |
| DEC-012 | 2026-11-12 | Estados y reglas de las tareas personales | Vigente |
| DEC-013 | 2026-11-12 | Las tareas personales no generan eventos de dominio | Vigente |
| DEC-014 | 2026-11-12 | Una tarea personal ajena responde 404, no 403 | Vigente |
| DEC-015 | 2026-11-12 | Cómo se reutilizó el prototipo en la web | Vigente |
| DEC-016 | 2026-11-12 | Alcance de la Fase 1 frente al prototipo | Vigente |
| DEC-017 | 2026-11-12 | Preferencias de apariencia: servidor y copia local | Vigente |
| DEC-018 | 2026-11-15 | Equipos: acceso por membresía y 404 a quien no pertenece | Vigente |
| DEC-019 | 2026-11-15 | Invitaciones: código, enlace y reglas | Vigente |
| DEC-020 | 2026-11-15 | Tareas de equipo: destino, triaje y asignación | **Reemplazada en parte por DEC-024** |
| DEC-021 | 2026-11-15 | Orden con índice fraccionario y concurrencia | Vigente |
| DEC-022 | 2026-11-15 | Los eventos de dominio se registran; aún nadie los consume | Vigente |
| DEC-023 | 2026-11-15 | Lo que la Fase 2 deja para la Fase 3 | Vigente |
| DEC-024 | 2026-11-16 | El triaje pasa a ser votación de los integrantes sobre propuestas del líder | Vigente; V-10 y V-11 por confirmar |
| DEC-025 | 2026-11-16 | Procesos almacenados en la BD; la API sin SQL de negocio | Vigente |
| DEC-026 | 2026-11-16 | Política de secretos y claves | Vigente |
| DEC-027 | 2026-11-16 | Alojamiento: Vercel + Render + dominio propio (Fase 3.5) | Vigente; D-03 resuelta |
| DEC-028 | 2026-11-16 | Documentos 07–10 y fases 2.5 y 3.5 | Vigente |
| DEC-029 | 2026-11-16 | Nombre «Carlos» (se elimina D-02) y visibilidad de votos | Vigente |
| DEC-030 | 2026-11-17 | Fase 3: Hill Chart arrastrable y color de miembros en `shared` | Vigente; forma por miembro para revisión |

---

## DEC-001 · Convención de ramas y *pull requests*

**Contexto.** `01`, sección 9, proponía solo `main` y ramas cortas `modulo/descripcion`. El equipo decidió tener ramas compartidas por etapa y una rama fija por persona. (Una primera versión de esta decisión, con dos ramas por persona `Dev_<Nombre>_<Back|Front>`, se descartó el mismo día antes de subirse: no se separa back y front.)

**Decisión.**

Ramas compartidas (protegidas: **nadie sube directo**, solo por *pull request* con la CI en verde):

| Rama | Para qué | Recibe PR desde |
|---|---|---|
| `dev` | Integración y pruebas conjuntas del equipo | `Dev_<Nombre>` |
| `main` | Versión estable revisada | `dev` |
| `produccion` | Definitiva: **la que se despliega** (Fase 6) | `main` |

Ramas personales, creadas desde `dev`, **una por integrante** (sin separar back y front):

| Integrante | Rama |
|---|---|
| Luis | `Dev_Luis` |
| Jova | `Dev_Jova` |
| Carlos | `Dev_Carlos` |
| Isac | `Dev_Isac` |

**Flujo:** `Dev_<Nombre>` → PR a `dev` → PR a `main` → PR a `produccion`.

- Cada quien sube (*push*) solo a su rama `Dev_<Nombre>`.
- **Ramas cortas opcionales** (`modulo/descripcion`, p. ej. `tablero/arrastrar-tarjetas`): salen de la rama `Dev_<Nombre>` de su dueño y vuelven a ella por PR. No pueden llamarse `Dev_Luis/…`, porque Git no admite una rama `Dev_Luis` y otra `Dev_Luis/algo` a la vez.
- Antes de abrir un PR a `dev`, la rama personal se actualiza con `dev` (`git pull origin dev`) y los conflictos se resuelven en la propia rama.
- Las promociones `dev` → `main` y `main` → `produccion` se fusionan con **«Create a merge commit»** (no *squash* ni *rebase*), para que las tres ramas compartan historia y no aparezcan conflictos falsos en la siguiente promoción.
- Después de fusionar, la rama `Dev_<Nombre>` **no se borra**: se sigue usando y se vuelve a actualizar con `dev`.
- La CI corre en cada *push* a `main`, `dev`, `produccion` y `Dev_*`, y en cada PR hacia ellas. El check obligatorio es **«Verificar (BD, tipos, lint, pruebas, build)»**.
- Commits en español con el formato `tipo(modulo): descripción` (`feat`, `fix`, `docs`, `test`, `chore`), como dice `01`, sección 9.

**Protección en GitHub** (Settings → Branches, para `main`, `dev` y `produccion`): exigir PR antes de fusionar, exigir el check de CI en verde con la rama al día, incluir a los administradores y prohibir *push* forzado y borrado. Las reglas de protección solo se aplican en repositorios **públicos** o con plan de pago: si el repositorio pasa a privado con el plan gratuito, GitHub deja de hacerlas cumplir.

**Consecuencia.** Un cambio tarda tres PR en llegar a `produccion`, a cambio de probarse juntos en `dev` antes de `main`. Las ramas personales son de larga vida: hay que traer `dev` a menudo y mantener los PR pequeños (un cambio por PR, `03`, sección 1.1).

## DEC-002 · Primera ejecución de los scripts SQL (tarea 0.4)

**Contexto.** `02_Base_de_Datos.md` advierte que los scripts se reconstruyeron y no se volvieron a ejecutar.

**Decisión / resultado.** Se copiaron **sin modificar**: `01_esquema.sql` → `apps/api/db/migrations/0001_esquema.sql`, `02_semilla.sql` → `apps/api/db/seed/semilla.sql`, `03_pruebas.sql` → `apps/api/db/tests/pruebas.sql`. Sobre una base vacía (migrar → sembrar → pruebas) salieron las **11 líneas `OK`** (1, 2, 3, 4, 5, 6, 7, 7b, 8, 9, 10) **sin tener que corregir nada**.

- En local se ejecutó con **PGlite** (PostgreSQL compilado a WebAssembly, con `citext`), porque la máquina de desarrollo aún no tiene Docker ni `psql`. PGlite se basa en PostgreSQL 17, no en 16.
- La verificación contra **PostgreSQL 16** real la hace la CI (servicio `postgres:16`) en cada *push*. Si la CI da un resultado distinto, se registra aquí.

## DEC-003 · La migración `0001` no tiene bajada

**Contexto.** `01`, sección 10.12, pide subida y bajada en cada migración, pero el plan exige copiar `01_esquema.sql` sin modificar. `node-pg-migrate` trata un `.sql` sin marcadores como solo subida.

**Decisión.** `0001_esquema.sql` queda sin bajada. Para volver a empezar en local se usa `pnpm db:reset` (borra el esquema `public`, migra y siembra; se niega a correr con `NODE_ENV=production`). Desde la `0002` en adelante, cada migración lleva los marcadores `-- Up Migration` y `-- Down Migration`.

## DEC-004 · Cómo se ejecutan las pruebas SQL

**Decisión.** `pnpm db:test` ejecuta `pruebas.sql` con un script de Node (`apps/api/scripts/pruebas-sql.ts`): omite los metacomandos de `psql` (`\set …`), se detiene en el primer error (como `ON_ERROR_STOP`), exige **exactamente** las 11 líneas `OK` esperadas y lo hace **dentro de una transacción que se revierte**, para poder repetirlo sin `db:reset` y sin dejar datos de prueba. Funciona sin tener `psql` instalado. La CI, además, ejecuta la forma literal del plan (`psql -v ON_ERROR_STOP=1 … -f pruebas.sql`) y cuenta las 11 líneas.

## DEC-005 · TypeScript 5.9 en lugar de 7

**Contexto.** Al instalar, `pnpm` eligió TypeScript 7, que `typescript-eslint` todavía no soporta (ESLint fallaba al arrancar).

**Decisión.** Se fija `typescript@~5.9` en todo el monorepo. Se puede subir cuando `typescript-eslint` soporte la versión 7.

## DEC-006 · La API se ejecuta con `tsx` hasta la Fase 6

**Contexto.** `packages/shared` se consume como código TypeScript fuente y los imports no llevan extensión; compilar la API con `tsc` no produce ESM ejecutable por Node sin más configuración.

**Decisión.** `build` de la API solo verifica tipos; `dev` y `start` usan `tsx`. La forma de empaquetar para producción (por ejemplo `tsup`/`esbuild`) se decide al preparar el despliegue (Fase 3.5, `10_Plan_de_Despliegue.md`).

## DEC-007 · Formateador: Prettier

`01`, sección 6, permite Prettier u `oxfmt`. Se elige **Prettier** (más extendido; la CI corre `pnpm format:check`). No se formatean `docs/`, los `.sql` ni el archivo de tipos generado.

## DEC-008 · Tokens de color tomados de la tabla de `01`

El zip del prototipo no está en el repositorio. `apps/web/src/styles/tokens.css` usa la tabla de `01`, sección 5.2. En la Fase 1 (tarea 1.1) se contrastan con `src/index.css` del prototipo y se corrigen si difieren.

## DEC-009 · Nombre del repositorio y licencia

El plan sugería `nexo`; el repositorio ya existía como `Luis-hip/Nexo` y se conserva. **La licencia está pendiente**: la decide el equipo (no se agrega `LICENSE` hasta entonces). Verificar que el repositorio sea **privado** al inicio, como pide el plan.

## DEC-010 · Versiones fijadas al crear el repositorio

Quedan en `pnpm-lock.yaml`. Principales: Node ≥ 22 (CI con 22), pnpm 10, React 19.3, react-router 8, Vite 8, Tailwind 4.3, Fastify 5, Kysely 0.29 + kysely-codegen 0.20, node-pg-migrate 9, Zod 4, Vitest 5, ESLint 10. `fastify`, `kysely` y `zod` son las del stack de `01`, sección 6; ninguna librería tuvo que sustituirse.

## DEC-011 · Matriz de permisos: textos y acciones del prototipo, evaluación estricta

`packages/shared/src/permisos.ts` implementa la matriz de `01`, sección 2.2, con una prueba parametrizada (una fila de la tabla = un caso por perfil).

- Los **textos de motivo** son los de `src/lib/permisos.ts` del prototipo. Tres acciones no traían texto (`ver_resumen`, `salir_equipo`, `canal_invitados`) y usan uno genérico.
- El prototipo define **10 acciones más** que la tabla de `01` (guardas de vistas: `archivar_equipo`, `ver_actividad`, `crear_plantilla`, `usar_plantilla`, `ver_miembros`, `ver_calendario`, `ver_archivos`, `ver_sprints`, `configurar_equipo`, `canal_invitados`). Se conservan con sus mismos valores; los nombres pasan de `kebab-case` a `snake_case`.
- **Diferencia deliberada con el prototipo:** allí las reglas (p) y (c) se daban por cumplidas si no se pasaba contexto. Aquí `puede()` es **estricta**: (p) exige `esPropio: true` y (c) exige `esCompartido: true`. El servidor nunca supone.
- El resultado negativo incluye `oculto` (como en el prototipo) para que la web sepa si esconder el control o mostrarlo deshabilitado con el motivo.

## DEC-012 · Estados y reglas de las tareas personales

- Los nombres de estado válidos son los de la BD (`propuesta`, `backlog`, `aceptada`, `habilitada`, `en_curso`, `atascada`, `completada`, `rechazada`), no los de la prosa de `01`, sección 2.4.
- Una tarea personal no pasa por triaje ni asignación: nace en `habilitada` («Por hacer», como en la semilla y en el tablero personal del prototipo) y usa `habilitada`, `en_curso`, `atascada` (con motivo) y `completada`; `backlog` se acepta por compatibilidad y se muestra también como «Por hacer». En el espacio personal la persona puede moverla libremente entre esos estados (el tablero personal del prototipo tiene las columnas Por hacer, En curso, Atascada y Hecha).
- Al completar: avance 100 %, `completada_en = ahora` y `resultado = con_retraso` si ya pasó `vence_en`, o `a_tiempo` en otro caso. Al reabrir se limpian `completada_en` y `resultado`.
- `responsable_id` de una tarea personal es su dueño.
- Las etiquetas personales no distinguen mayúsculas (`citext`) y son privadas de cada persona.

## DEC-013 · Las tareas personales no generan eventos de dominio

`eventos_dominio` alimenta el tiempo real, las notificaciones y WhatsApp, todos de equipo. Las tareas personales son privadas, así que solo dejan una fila en `actividad` (ámbito personal) al crearse, completarse y eliminarse, en la misma transacción.

## DEC-014 · Una tarea personal ajena responde 404, no 403

Para no revelar que una tarea privada existe, cualquier ruta sobre una tarea personal de otra persona responde `404 tarea_no_encontrada`. La privacidad se garantiza porque toda consulta filtra por `dueno_id`; hay una prueba automática por cada ruta.

## DEC-015 · Cómo se reutilizó el prototipo en la web

El zip del prototipo (Figma Make) **no se versiona**: es referencia. De él se copiaron a `apps/web`:

- **Tal cual (adaptando solo tipos estrictos):** `src/index.css` (tokens y utilidades), `components/ui/` (básicos, formularios, capas), `lib/color.ts`, `lib/fechas.ts`, el logo y el recorrido.
- **Adaptado para recibir datos por props en vez de leer el estado simulado:** `identidad.tsx` (el avatar recibe `persona`), `HillChart` (recibe `puntos`), `AppShell`, navegación, páginas públicas, personales y de bienvenida.
- **No se copió:** `store/` (`useReducer`, `localStorage`), el Simulador, `/sistema` ni `/indice`.
- **Nuevo, porque el prototipo no lo traía:** `Tabla` (lo pide la tarea 1.1), `EstadosDatos` (sustituye la carga simulada `Carga`), `SinConexion`, el cliente de API y las consultas con TanStack Query.
- Los nombres de estado pasan de `en-curso`/`con-retraso` a los de la BD (`en_curso`, `con_retraso`).
- Las reglas (permisos, validación) usan `packages/shared`, las mismas que el servidor. Los formularios validan con los esquemas Zod compartidos; **no se instaló `react-hook-form`** todavía porque los formularios de esta fase son pequeños y siguen el patrón del prototipo (se evalúa en la Fase 2 con el formulario de tarea de equipo).
- La burbuja de WhatsApp usa los colores de WhatsApp, no los tokens (excepción deliberada, como en el prototipo).

## DEC-016 · Alcance de la Fase 1 frente al prototipo

- **`/entrar` es el acceso de desarrollo:** lista los usuarios de la semilla (`GET /dev/usuarios`) y entra con `POST /dev/login`. Si la API no tiene `DEV_LOGIN_ENABLED=true`, muestra un aviso. El formulario real llega en la Fase 5.
- **Rutas aún sin construir** muestran una pantalla «Próximamente» con su fase, para que la navegación del prototipo no lleve a un 404.
- **`EquipoGuard`** decide con la membresía que devuelve `GET /yo`. Las rutas de equipo de la Fase 2 la comprueban además en el servidor.
- **Búsqueda (GL-01):** simple, por título, entre las tareas personales.
- **Inicio personal:** incluye el Hill Chart en solo lectura (el plan lo situaba en la Fase 3; se adelantó porque el componente ya hacía falta para la portada). Arrastrar para actualizar el avance sigue en la Fase 3.
- **Calendario personal (PER-04):** muestra entregas de tareas; no hay API de reuniones todavía.
- **Sin subida de archivos:** se quitaron el adjunto de contacto y la foto del onboarding hasta que exista el almacenamiento (Fase 3).
- **Tareas personales nuevas:** nacen en `habilitada` («Por hacer»); ver DEC-012.

## DEC-017 · Preferencias de apariencia: servidor y copia local

La fuente de verdad es `preferencias_usuario` (viene en `GET /yo`, se cambia con `PATCH /yo/preferencias`). La web guarda una copia en `localStorage` para pintar el tema correcto antes de cargar la sesión y en las páginas públicas; al entrar, lo del servidor manda. En las páginas públicas (sin sesión) el selector de tema solo cambia la copia local.

## DEC-018 · Equipos: acceso por membresía y 404 a quien no pertenece

Cada ruta de `/equipos/:id/*` pasa por `contextoEquipo()`: sesión → membresía **activa** en **ese** equipo → permiso de la matriz. Quien no pertenece recibe `404 equipo_no_encontrado`, igual que si el equipo no existiera, para no revelar equipos ajenos (misma idea que DEC-014). Un invitado cuyo acceso caducó recibe `403 acceso_caducado` (pantalla FALT-02). Un equipo archivado es de solo lectura para todo lo que escribe. Un invitado solo alcanza las tareas compartidas con su membresía y para él el backlog, el triaje y los conteos responden 403.

## DEC-019 · Invitaciones: código, enlace y reglas

- El código tiene el formato del prototipo (`NX4-821Q`) y un alfabeto sin 0/O, 1/I/L, para poder dictarlo.
- Una invitación es de **un solo uso**: aceptarla la marca `aceptada` en la misma transacción que crea la membresía. Si el equipo está lleno, la BD rechaza el alta (`NX001`), toda la transacción se deshace y la invitación sigue pendiente.
- Una pendiente cuyo plazo pasó se muestra como «caducada». Al abrir un código inexistente, caducado, usado o revocado la API responde 404/410 con el motivo en español (pantalla AUTH-10).
- Con **dos personas** que se unen a la vez al último lugar, entra una y la otra recibe `409 equipo_lleno` (prueba automática con conexiones simultáneas).
- El invitado **no ocupa lugar** y su membresía caduca a los 7, 14 o 30 días que elige el líder.
- Se usa el mismo bloqueo por equipo que el disparador del tope para calcular el primer color libre (`fn_siguiente_color_idx`) sin carreras.
- **Fuera de alcance:** invitar por correo (no hay envío de correos hasta la Fase 5), que el invitado pida ampliación o ser integrante (`solicitudes_invitado`) y expulsar o salir del equipo (Fase 3, AD-04 a AD-11).

## DEC-020 · Tareas de equipo: destino, triaje y asignación

- El **líder crea** directamente; el **integrante propone** (estado `propuesta`, sin responsable ni destino); el invitado no hace ninguna de las dos.
- La planeación de sprints es de la Fase 3, así que el formulario no elige sprint: la tarea va al **tablero** (queda «Aceptada», ligada al sprint activo si existe) o al **backlog**. En el triaje, «Aceptar» usa el mismo destino.
- Quien no es el líder debe **aceptar la asignación** (`asignacion_pendiente`); mientras tanto no puede mover la tarea. Si la rechaza (con motivo) la tarea vuelve a triaje como «Rechazada por el responsable» para reasignarse.
- El integrante solo corrige **su propia propuesta** mientras está en triaje y actualiza el avance de **su** tarea ya aceptada.
- «Pedir cambios» deja un comentario y `cambios_pedidos`; el integrante ve el estado de sus solicitudes en «Mis propuestas» (FALT-08).
- La máquina de estados vive en `packages/shared/src/estados.ts` con su tabla de casos por rol; la API y la web usan la misma. Un cambio no permitido devuelve `422` con el motivo; un permiso que falta, `403`. El permiso se comprueba **antes** que la versión.

## DEC-021 · Orden con índice fraccionario y concurrencia

- «Mover la tarea entre A y B» recibe las dos vecinas y el servidor calcula la clave con `fractional-indexing`, dentro de una transacción que bloquea la tarea y la columna. Si hay claves repetidas (la semilla las trae todas en `a0`) las reparte de nuevo la primera vez.
- Dos movimientos simultáneos de la misma tarjeta: uno gana y el otro recibe `409 conflicto_version`; la web lo explica («Alguien cambió esta tarea…») y vuelve a consultar el tablero.
- Solo el líder **reordena** dentro de una columna (prioridad visible del equipo); cualquier responsable mueve su tarjeta entre columnas válidas.
- Con **filtros activos** no se puede arrastrar (el orden mostrado no es el real).
- Se usa **dnd-kit** con ratón y teclado (Tab hasta el asa, Espacio y flechas). En móvil (< 640 px) el tablero es una pestaña por columna con el menú «Mover a…», sin arrastre.
- Las columnas vacías se pliegan, como pide `01` 2.3.11.

## DEC-022 · Los eventos de dominio se registran; aún nadie los consume

Cada cambio de equipo inserta su fila en `eventos_dominio` y en `actividad` **en la misma transacción** (patrón *outbox*). Hoy no hay procesador: el tiempo real, las notificaciones y WhatsApp los leerán en las Fases 3 y 4. Una prueba comprueba que los eventos quedan con `procesado_en` nulo y que un rechazo por permisos no deja ningún evento.

## DEC-023 · Lo que la Fase 2 deja para la Fase 3

Queda sin construir, con «Próximamente» en la web: sprints (planear, cerrar, retro), calendario, reportes, actividad, archivos, plantillas, ajustes del equipo, elección y transferencia de liderazgo, salir y expulsar, y todo el chat y WhatsApp (Fase 4). El tablero muestra todas las tareas que están en sus columnas, haya o no sprint activo. `react-hook-form` sigue sin instalarse: los formularios validan con los esquemas Zod compartidos (ver DEC-015).

## DEC-024 · El triaje pasa a ser una votación de los integrantes sobre propuestas del líder

**Fecha:** 2026-11-16 · **Fuente:** `07_Cambios_de_Alcance_Fase2.md`, sección 1. **Reemplaza en parte a DEC-020.**

El **líder propone** las tareas junto con sus subtareas (una sola operación; estado `propuesta`) y los **integrantes activos votan** aceptar o rechazar (con comentario opcional; pueden cambiar su voto mientras siga abierta). Valores confirmados el 2026-11-16: **V-1** acepta la mayoría simple de **todos** los integrantes activos; **V-2** el líder no vota y los invitados tampoco; **V-3** sin plazo (el líder puede retirarla); **V-4** empate o sin mayoría → sigue en `propuesta`, el líder puede retirarla (`cancelada`) o reformularla; **V-5** sin integrantes el líder acepta directamente; **V-8** se muestra el conteo y quién ya votó, **no** el voto de los demás (la API no lo devuelve mientras está abierta, ni al líder); cada integrante ve el suyo. Un integrante ya no crea ni propone tareas. Quien sale o es expulsado pierde sus votos de propuestas **abiertas**.

**Por confirmar (marcados para revisión de Luis):** **V-10** toda tarea nueva del líder entra en votación (desaparece el destino «backlog directo» de DEC-020); **V-11** la asignación y su aceptación se mantienen (DEC-020), y si el responsable la rechaza el líder **reasigna directamente**, sin nueva votación.

**Sigue vigente de DEC-020:** la asignación, que el responsable acepte o rechace con motivo, la máquina de estados compartida y el orden por índice fraccionario.

**Cómo quedó construido (2026-11-16) y en qué se aparta del `07` (para revisión):**

- **Dos migraciones, no una.** `0002_enums_votacion.sql` solo agrega valores a enums y `0003_votacion.sql` trae la tabla `tarea_votos`, el disparador y los procesos. PostgreSQL no deja usar un valor nuevo de enum en la transacción que lo crea, así que no cabían en una sola `0002`.
- **Estado `cancelada`.** El `07` pide que una propuesta retirada quede `cancelada`, pero ese valor no existía en `estado_tarea`: lo agrega la `0002`. En la interfaz se llama «Retirada».
- **Empate (regla 4 frente a V-4).** La regla 4 del `07` dice que se rechaza cuando «ya no es posible alcanzar la mayoría», y V-4 (confirmado) dice que el empate sigue en votación. Como el voto se puede cambiar mientras esté abierta, se aplicó **V-4**: se acepta con más de la mitad a favor, se rechaza con más de la mitad en contra y **cualquier otro caso (2 y 2 con 4 integrantes) sigue abierto**. Si el equipo prefiere que el empate total rechace, es un cambio de una línea en `resultadoVotacion` y en `fn_votacion_resultado`.
- **«8 integrantes» no existe.** El `07` pide probar la mayoría con 3, 4 y 8 integrantes, pero un equipo admite 8 miembros **contando a la líder**: el máximo son 7 integrantes (mayoría de 4). La prueba SQL usa 7 y comprueba además la función con 8 (mayoría de 5).
- **Backlog.** Al desaparecer el triaje desaparecía también la única forma de pasar tareas entre el backlog y el tablero. Se agregaron a la máquina de estados las transiciones **del líder** `aceptada → backlog` y `backlog → aceptada` (el «backlog para las que el líder aparta» de V-10).
- **V-11 en la práctica.** Si el responsable rechaza la asignación, la tarea **conserva su estado** y queda sin responsable; la líder la reasigna con «Asignar». Ya no pasa a `rechazada` ni se usa `rechazo_por = 'responsable'`.
- **Visibilidad (V-8).** Ni el evento de dominio ni la actividad dicen si el voto fue a favor o en contra, y el comentario del voto solo lo ve quien votó. Con un solo voto emitido, el conteo sí permite deducirlo: es inherente a mostrar conteo y votantes.
- **Quien sale del equipo** pierde sus votos de propuestas abiertas (disparador). La mayoría se vuelve a calcular en el siguiente voto, no en ese momento; al construir «salir y expulsar» (Fase 3) ese proceso debe volver a evaluar las propuestas abiertas.
- **Editar una propuesta en votación** sigue permitido a la líder (edita cualquier tarea); los votos no se reinician. Para un cambio de fondo está «Reformular».
- **`whatsapp_reglas.tipo_evento = 'triaje'`** se conserva y se interpreta como votación de propuestas; no hizo falta agregar valores. **`politica_propuestas`**: valor por defecto `votacion`; `triaje` queda obsoleto y `libre` sin uso en el MVP.
- **Semilla:** T-07, T-08 y T-09 ahora las propone la líder, y T-08 trae tres votos de ejemplo.

## DEC-025 · Procesos almacenados en la BD; la API no lleva SQL de negocio

**Fecha:** 2026-11-16 · **Fuente:** `07`, sección 2 · **Alcance (V-6) confirmado:** todo lo nuevo nace como proceso; lo de las Fases 1 y 2 se migra en una tarea dedicada de la Fase 2.5.

Toda operación sobre datos es un proceso `proc_<dominio>_<accion>` (documentado en `08_Procesos_BD.md`); la API solo lo llama desde `repositorios/`. Roles `nexo_migraciones` (dueño) y `nexo_app` (solo `EXECUTE`). Riesgo de **reglas duplicadas** (estados, mayoría): la fuente de verdad sigue en `packages/shared`, la BD guarda una copia y una prueba compara ambas. Refactor en rama propia por dominios; si el tiempo aprieta, primero escrituras y operaciones críticas y las lecturas simples pasan a la Fase 3 (anotado en `progreso.md`). Los tipos de `kysely-codegen` quedan para pruebas (decisión final al terminar el refactor).

**Cómo quedó construido (2026-11-17):**

- **Migraciones por dominio:** `0004_procesos_cuenta.sql` (sesiones, preferencias, perfil, contacto y acceso de desarrollo), `0005_procesos_equipos.sql` (contexto de equipo, equipos e invitaciones), `0006_procesos_tareas_equipo.sql` (tablero, estados, asignación, subtareas y comentarios), `0007_procesos_tareas_personales.sql` (espacio personal) y `0008_roles.sql`. En total **49 procesos** (6 de la votación + 43 que sustituyen al SQL que había en 11 archivos), todos en `docs/08`. No quedó nada para la Fase 3: se migraron también las lecturas.
- **La API ya no escribe SQL.** Los servicios y las rutas no importan `kysely` ni abren transacciones; el único archivo que llama a la BD es `repositorios/procesos.ts` (`select proc_x($1, …)`), que además valida cada respuesta con un esquema Zod de `packages/shared/src/respuestas.ts` y traduce los errores `NX0xx`. **Una regla de ESLint** falla si aparece `selectFrom`, `insertInto`, `updateTable`, `deleteFrom`, `transaction`, una plantilla `sql` o una importación de `kysely`/`pg` fuera de `repositorios/procesos.ts`, `db/` y las pruebas.
- **Kysely y `kysely-codegen` se conservan**, pero con otro papel: Kysely es solo el cliente que ejecuta la llamada al proceso (y el que usan las pruebas para preparar y comprobar datos) y los tipos generados (`src/db/tipos.ts`) los usan solo las pruebas; la CI sigue comprobando que estén al día. `fractional-indexing` queda solo para la prueba que compara el índice fraccionario de la BD con la librería.
- **Reglas duplicadas:** la máquina de estados vive en `packages/shared/src/estados.ts` y la BD tiene una copia en la tabla `transiciones_estado`; el índice fraccionario y la mayoría de la votación tienen su copia en PL/pgSQL. **Tres pruebas** (`tareasEquipo.test.ts`) comparan cada copia con su original y fallan si difieren. La API comprueba la transición con `estados.ts` antes de llamar al proceso para responder con el motivo exacto en español; el proceso lo vuelve a comprobar dentro de su transacción.
- **Orden del tablero:** los procesos ordenan las claves con `COLLATE "C"` (como JavaScript). Antes se ordenaban con la intercalación de la BD, que en PostgreSQL con `en_US.utf8` puede desordenar claves con mayúsculas y minúsculas mezcladas; era un error latente que no se había manifestado.
- **Roles:** `0008_roles.sql` crea `nexo_app` **sin inicio de sesión y sin contraseña** (el secreto se pone en el despliegue, `09`) y `fn_conceder_procesos()` le deja solo `EXECUTE` sobre `proc_*`, sin tablas, vistas, secuencias ni auxiliares. Los procesos del acceso de desarrollo (`proc_dev_*`) no se le conceden. `nexo_migraciones` no lo crea ninguna migración: es el rol con el que se ejecutan (en local y en la CI lo hace el usuario de `DATABASE_URL`). Toda migración nueva que toque procesos debe terminar con `SELECT fn_conceder_procesos();`.
- **Pruebas:** `pruebas_procesos.sql` pasó de 15 a **52** casos (al menos un permitido y un prohibido por proceso, más `P51`: todo proceso es `SECURITY DEFINER` con `search_path` fijo, y `P52`: con el rol `nexo_app` no se lee ni escribe ninguna tabla). Las pruebas de integración de la Fase 2 siguen en verde **sin cambiar sus expectativas** (las de triaje se habían cambiado a propósito en el paso 3).
- **Eventos en orden:** `fn_registrar_evento` sella cada evento con `clock_timestamp()`, para que los de una misma transacción (votar y aceptar por mayoría) salgan en orden en el historial.

## DEC-026 · Política de secretos y claves

**Fecha:** 2026-11-16 · **Fuente:** `07`, sección 3 · **Detalle:** `09_Seguridad_y_Secretos.md`.

Ningún secreto en el repositorio; el navegador no recibe secretos; producción solo en variables del alojamiento y de la CI; un secreto distinto por entorno; tokens de terceros cifrados y nunca devueltos; registros con redacción; arranque seguro con validación Zod; gitleaks y secret scanning; rotación y registro de incidentes.

## DEC-027 · Alojamiento: Vercel + Render + dominio propio

**Fecha:** 2026-11-16 · **Detalle:** `10_Plan_de_Despliegue.md` (Fase 3.5). Front en **Vercel**; API, worker y PostgreSQL en **Render**; dominio propio con `app.` y `api.`; despliegue automático solo desde `produccion`. **Resuelve D-03.** No se despliega ni se crean cuentas hasta después de la Fase 3.

## DEC-028 · Documentos nuevos y fases 2.5 y 3.5

**Fecha:** 2026-11-16. Se agregan `07` (cambios de alcance), `08` (procesos de la BD), `09` (seguridad y secretos), `10` (plan de despliegue) y `seguridad-incidentes.md`; se actualizan `01`–`06` y el README. El mapa de fases de `03` suma la **Fase 2.5** y la **Fase 3.5**; la Fase 6 queda como cierre.

## DEC-029 · Nombre del integrante y visibilidad de votos

**Fecha:** 2026-11-16. El integrante se llama **Carlos**; se elimina la decisión D-02 y toda nota sobre «Carlo». Visibilidad de votos (V-8): ver DEC-024.

## DEC-030 · Fase 3: Hill Chart arrastrable y color de miembros

**Fecha:** 2026-11-17 · **Fuente:** `03`, Fase 3, tareas 3.1 y 3.2.

- **Hill Chart (3.1).** Las figuras se arrastran con ratón o dedo, o se mueven con las flechas del teclado (de 5 en 5; se guarda una sola vez, 0,6 s después de la última pulsación). El avance se guarda con el proceso que ya existía (`proc_tarea_editar`, o `proc_personal_tarea_actualizar` en el inicio personal), así que no hizo falta una migración. Mueve el **líder** cualquier tarea y el **responsable** las suyas con la asignación aceptada; las **completadas** no se mueven (siempre están al 100 %). El **historial** es el de cada tarea: cada cambio deja «Valeria actualizó el avance de T-01 (75 %)». Mover una figura en el Hill Chart **no cambia el estado** de la tarea (para eso está el tablero).
- **Color (3.2).** El cálculo pasa de `apps/web/src/lib/color.ts` a `packages/shared/src/color.ts` (la web lo reexporta) sin cambiar los colores del prototipo. La prueba comprueba que ningún tono cae en las bandas del semáforo, que los 8 colores se distinguen entre sí (ΔE OKLab > 0,08) y que cada color se distingue de las señales de **su** tema (ΔE > 0,06, unas 3 veces lo apenas perceptible). El par más cercano es el miembro 1 frente al verde del tema claro (ΔE ≈ 0,067): las bandas del prototipo no están centradas en los tonos reales de las señales (el ámbar real está en ~58°, fuera de la banda 60–100°). Si el equipo quiere más margen, se pueden ajustar las bandas, lo que cambia el color de algunos miembros.
- **Forma por miembro (para revisión).** `01` 5.4 dice que cada miembro tiene además una **forma**. Pero en el Hill Chart (prototipo y leyenda actual) la forma ya indica el **estado** (triángulo atascada, círculo en marcha, cuadrado completada) y usarla también para la persona confundiría. Se mantiene la forma por estado; la identidad sin depender del color la dan las **iniciales** (avatares y, con muchos responsables, dentro de las figuras) y la **etiqueta accesible** de cada figura.

## DEC-031 · Fase 3.3: sprints, cierre con instantánea y retrospectiva

**Fecha:** 2026-11-17 · **Fuente:** `03`, Fase 3, tarea 3.3 (EQ-09 a EQ-13) · **Detalle:** `08_Procesos_BD.md` (14 procesos de la `0009`).

- **Ciclo.** `planificado → activo → cerrado`; uno activo por equipo (proceso + índice `ux_un_sprint_activo`). Puede haber varios planificados, sin fechas cruzadas. Solo el líder planea, inicia, cierra y borra (un planificado). Al **iniciar antes** de la fecha planeada el sprint se recorre a hoy con la misma duración (si no, el burndown empezaría días después); con el plazo vencido hay que cambiar las fechas.
- **Qué entra al planear (EQ-10).** Las tareas del equipo **sin sprint** que ya pasaron la votación y no se terminaron: `backlog`, `aceptada`, `habilitada`, `en_curso` y `atascada`. Es más que «las aceptadas»: así entran también las que quedaron libres al cerrar el sprint anterior (pueden ir en curso). Las del backlog pasan a `aceptada` al entrar. Las propuestas, rechazadas, retiradas y completadas no entran.
- **Capacidad.** Horas por persona y sprint (`sprint_capacidad`, 0–300). Las tareas **no tienen estimación** en el modelo, así que el plan compara horas con el **número de tareas** de cada responsable y avisa «sin horas» a quien tiene tareas y 0 h. Si el equipo quiere estimar, es una columna nueva en `tareas` (fase posterior).
- **Cierre (EQ-11).** La instantánea final se guarda **antes** de mover las pendientes, así el historial dice cuánto tuvo el sprint («5 de 7»). Las completadas se quedan en el sprint y **salen del tablero** (`proc_tarea_listar` y `proc_tarea_conteos` ya no muestran tareas de sprints cerrados; siguen en `todas` y en el historial). Las pendientes conservan estado y responsable y van a donde elija el líder: `siguiente` (el planificado más próximo) o `liberar` (sin sprint, por defecto). Un sprint cerrado no se reabre.
- **Instantáneas y burndown.** `sprint_instantaneas` tiene una foto por día: la guardan el inicio y el cierre; mientras el sprint está activo, el punto de **hoy** se calcula en vivo. La foto de cada noche (para los días sin cambios) la hará la tarea programada de `pg-boss` (Fase 3.5); mientras tanto, el burndown lleva el último valor conocido. «Hoy» es la fecha en la zona horaria del equipo. Las fechas de sprint viajan como `AAAA-MM-DD` y la web las lee como día local (`fechaDia`).
- **Retrospectiva (EQ-12).** Se crea sola al cerrar (o la abre el líder en sprints viejos). Notas en *Salió bien*, *Por mejorar* y *Acciones*; una nota **anónima no guarda autor** y por eso las notas y los votos **no generan eventos ni actividad** (un evento con actor la delataría). 3 puntos de voto por persona, uno por nota: el proceso responde `NX003` (409 «Ya usaste tus 3 votos en esta retrospectiva.») y el disparador de la `0001` lo impide aunque se salte el proceso. Los totales por nota son visibles para todo el equipo; quién votó, no. El líder cierra la votación (ya no hay notas ni votos), cierra la retrospectiva y puede convertir una nota en **propuesta** de tarea, que va a votación (DEC-024).
- **Actividad.** `fn_registrar_evento` ahora deja los eventos `sprint.*` con tipo `sprint` (antes caían en `equipo`); servirá para la vista de actividad (3.4).
- **Rutas web.** `sprints/{activo, planear, cerrar, historial, historial/:id, retro, retro/:id}`. El árbol de `01` no tenía `historial` (EQ-13): se agregó como pestaña.

## DEC-032 · Fase 3.5: liderazgo, elección y administración del equipo

**Fecha:** 2026-11-18 · **Fuente:** `03`, Fase 3, tarea 3.5 (AD-04 a AD-12) y regla 2 de `01` 2.3 · **Detalle:** `08_Procesos_BD.md` (13 procesos de la `0010`).

- **Transferencia (AD-07, AD-08).** El líder propone a un **integrante** (no a un invitado) y, si quiere, sale del equipo al aceptarse (`saldra`). Cambia cuando la persona acepta; el líder la puede cancelar. Una sola pendiente por equipo y ninguna con una elección abierta.
- **Elección (AD-09).** La convoca el líder. **Todos los integrantes son candidatos**: la fase `postulacion` del esquema no se usa, porque la regla de `01` habla de votación de 72 h y no de postulaciones; si el equipo las quiere, se agrega una fase antes de votar. El voto es **secreto** (mientras está abierta se ve cuántos y quiénes votaron, como V-8) y **no se cambia** dentro de la ronda (PK de `eleccion_votos`). Gana la **mayoría simple de los votos emitidos** (el candidato con más votos). Si votaron todos, se resuelve en el acto. **Empate** → ronda 2 de `votacion_desempate_horas` (24 h) solo entre los empatados; **empate otra vez** → gana quien lleva más tiempo en el equipo (`membresias.desde`), para que siempre haya resultado. **Sin votos** → el saliente sigue como líder. El saliente no vota (`NX002`, proceso y disparador) y es **interino** con todos sus permisos hasta el resultado. Los plazos los toma el equipo (`votacion_plazo_horas`, `votacion_desempate_horas`), que el líder cambia en Ajustes.
- **Plazos.** `proc_eleccion_vencidas` (sin actor; la excepción a `p_actor_id`) resuelve las vencidas. Lo llama un **temporizador cada minuto en el proceso de la API** (`trabajos/plazos.ts`) y también la ruta `GET /liderazgo` antes de leer. `pg-boss` llega en la Fase 4 (`10`, sección 3); entonces el temporizador pasa a ser un trabajo de la cola. Con varias instancias es seguro (`FOR UPDATE SKIP LOCKED`).
- **Salir y expulsar (AD-10, AD-11).** El líder no sale sin transferir antes. Quien sale o es expulsado: membresía `salio`/`expulsada` (se conserva el historial), sus tareas sin terminar quedan **sin responsable**, se cancela una transferencia hacia esa persona y **las votaciones abiertas se recuentan** (DEC-024: con menos integrantes una propuesta puede alcanzar la mayoría). Lo mismo al cambiar de líder: el nuevo líder pierde sus votos abiertos.
- **Invitados (AD-05).** El líder amplía su acceso 7, 14 o 30 días o los hace integrantes (color, sin caducidad; cuentan para el tope, `NX001`). La matriz no tenía una acción para «ampliar»: se usa `convertir_invitado`.
- **Configurar y archivar (AD-06, AD-12).** Nombre, descripción, duración del sprint, zona horaria (validada contra `pg_timezone_names`), plazos de la elección y tope de miembros (no baja de los miembros activos). Archivado, el equipo es de solo lectura (`NX009`) y se puede reactivar; no se archiva con una elección abierta.
- **Avisos.** Estas acciones crean notificaciones dentro de la app (`notificaciones`, para NT-01): a quien se propone como líder, a los integrantes al convocar, empatar o resolver una elección, y a quien es expulsado o convertido.
- **Rutas web.** `equipo/eleccion` (liderazgo, como en el árbol de `01`), `equipo/ajustes` y `equipo/:miembroId` (AD-04).

## DEC-033 · Fase 3.4: vistas secundarias y archivos

**Fecha:** 2026-11-18 · **Fuente:** `03`, Fase 3, tarea 3.4 (EQ-14 a EQ-20, NT-01) · **Detalle:** `08_Procesos_BD.md` (14 procesos de la `0011` y 4 de la `0012`).

- **Calendario y reuniones (EQ-14, EQ-15).** Una reunión invita a todo el equipo (sin invitados); quien la crea queda con «sí» y los demás reciben un aviso. Las repeticiones (`semanal`, `diaria_lv`) se expanden en el proceso dentro del rango pedido (máximo 62 días), mirando el día de la semana en la zona horaria del equipo; editar o cancelar afecta a toda la serie (no hay excepciones por fecha). La edita o cancela quien la creó o el líder. El calendario personal (PER-04) sigue mostrando solo las tareas personales: las reuniones personales (`reuniones.dueno_id`) quedan para una fase posterior.
- **Reportes (EQ-16, EQ-17).** El reporte lo ven líder e integrantes. La exportación es CSV armado en la API desde `proc_reporte_exportar`: el líder exporta todo o lo suyo; el integrante solo lo suyo (`exportar_reportes` «propio»), y la BD lo vuelve a exigir. El CSV lleva BOM (Excel lo abre en UTF-8) y las celdas que empiezan como fórmula (`= + - @`) llevan un apóstrofo para que una hoja de cálculo no las ejecute.
- **Actividad (EQ-18).** `fn_registrar_evento` ahora también separa `reunion`; la vista filtra por `tarea`, `sprint`, `reunion` y `equipo` y pagina por fecha.
- **Archivos (EQ-19).** El contenido se guarda **en PostgreSQL** (`archivo_contenidos`, `bytea`) con tope de **5 MB** y una lista cerrada de tipos (PDF, imágenes PNG/JPEG/GIF/WebP, texto, Markdown, CSV, Office y OpenDocument, ZIP; ni ejecutables ni SVG). Así el MVP no necesita otro servicio de almacenamiento y el respaldo de Render incluye los archivos; `storage_key` (`bd:<id>`) permite moverlos después a un almacén de objetos. La API recibe el archivo en base64 (cuerpo de hasta 8 MB solo en esa ruta) y lo entrega como adjunto con `X-Content-Type-Options: nosniff`. Lo borra quien lo subió o el líder (se borra el contenido y queda el registro). **Pendiente:** adjuntar desde el detalle de la tarea (la API ya acepta `tarea_id`), el adjunto del formulario de contacto y la foto de perfil del onboarding.
- **Plantillas (EQ-20).** Las crea y elimina el líder. Solo las de **proyecto** se «usan»: proponen cada elemento como tarea (van a votación, DEC-024). Las de sprint y retrospectiva son guías de lectura.
- **Notificaciones (NT-01).** Son de la persona, no del equipo. Por ahora las crean los procesos de liderazgo, elección y reuniones (DEC-032); las de asignaciones, menciones y vencimientos llegan con el despachador de eventos (`eventos_dominio`) de la Fase 4. La campana muestra cuántas hay sin leer (se consulta cada minuto).

## DEC-034 · Fase 3.6 y 3.7: ajustes de la persona y reporte personal

**Fecha:** 2026-11-18 · **Fuente:** `03`, Fase 3, tareas 3.6 (PF-01 a PF-09) y 3.7 (FALT-01, FALT-07) · **Detalle:** `08_Procesos_BD.md` (3 procesos de la `0013`).

- **Rutas.** Los ajustes viven en `/ajustes/{perfil, cuenta, apariencia, notificaciones, whatsapp, privacidad, equipos, atajos, ayuda}`, como ya los enlazaba la navegación (el árbol de `01` dice `/app/ajustes/…`; se mantuvo la ruta de la navegación).
- **Perfil y apariencia (PF-01, PF-03)** usan los procesos que ya existían (`proc_usuario_perfil_guardar`, `proc_usuario_preferencias_guardar`). La foto de perfil queda para cuando haya archivos personales.
- **Cuenta (PF-02).** Muestra el correo y cierra la sesión; contraseña, cambio de correo y verificación en dos pasos llegan con la autenticación real (Fase 5).
- **Avisos (PF-04).** Por cada aviso configurable (`fn_eventos_notificacion`) se guarda si llega en Nexo y por WhatsApp (y por correo, sin pantalla todavía). Se guardan desde ahora; los envíos por WhatsApp son de la Fase 4 y por correo de la 5. También horas de silencio (completas: inicio y fin) y resumen diario.
- **WhatsApp personal (PF-05)** queda como «Próximamente» hasta la Fase 4 (número, verificación y consentimiento).
- **Privacidad (PF-06).** Mostrar o no el estado y el primer día de la semana. Exportar todos los datos o borrar la cuenta es FALT-09 (Fase 5).
- **Mis equipos (PF-07).** Lista con el rol en cada equipo y «Salir» (`proc_equipo_salir`; el líder primero transfiere). **Atajos (PF-08)** y **Ayuda (PF-09)** son pantallas de lectura.
- **Reporte personal (FALT-01).** Tareas personales y las de equipo a cargo de la persona, **solo de los equipos donde sigue activa** (lo de un equipo que dejó ya no es suyo), con un resumen por espacio. **FALT-07** (historial de transferencias y elecciones) está en `equipo/eleccion` (DEC-032).

## DEC-035 · Fase 3.5: preparación del despliegue (archivos, sin desplegar)

**Fecha:** 2026-11-18 · **Fuente:** `10_Plan_de_Despliegue.md`, sección 6 · **Estado:** archivos preparados; **nada desplegado todavía**.

- **Empaquetado de la API (DEC-006).** Se mantiene `tsx` en producción (`tsx` está en `dependencies`); `build` sigue siendo solo la comprobación de tipos. Es lo más simple y evita un empaquetador nuevo; se revisa si el arranque o la memoria (512 MB) dan problemas.
- **Migraciones.** `db:migrate` usa `DATABASE_URL_MIGRACIONES` si existe y, si no, `DATABASE_URL` (local y CI no cambian). En Render corre como `preDeployCommand`, con las dependencias de desarrollo instaladas (`--prod=false`) porque `node-pg-migrate` es de desarrollo. La semilla no se carga.
- **`render.yaml`.** Servicio web `nexo-api` (plan `0.5c-512mb`) y BD `nexo-bd` (PostgreSQL 16, plan `0.1c-256mb`), región `virginia` (se eligió por cercanía; no se puede cambiar después), rama `produccion`, `autoDeployTrigger: checksPass`, `healthCheckPath: /salud`, dominio `api.nexo.lol`. Secretos con `sync: false` (`DATABASE_URL`, `ENCRYPTION_KEY`) o generados por Render (`SESSION_SECRET`). Sintaxis comprobada en la documentación de Render el 2026-11-18; **sin comprobar**: `corepack` en el entorno de Render y la URL del repositorio en el primer despliegue.
- **`apps/web/vercel.json`.** Vite, `pnpm build`, salida `dist`, reescritura a `index.html` y despliegue automático **solo** de `produccion` (`git.deploymentEnabled`, con comodín `*` comprobado en la documentación de Vercel el 2026-11-18). En el proyecto hay que fijar *Root Directory* = `apps/web` y `VITE_API_URL=https://api.nexo.lol`.
- **`trustProxy` en producción.** Detrás del proxy de Render, el límite de peticiones (contacto) vería a todo el mundo como una sola IP; con `trustProxy` usa `X-Forwarded-For`.
- **`.node-version` = 22** (Render lo lee; coincide con `engines` y la CI).
- **Dominio.** `nexo.lol` en Porkbun; subdominios `app.` (Vercel) y `api.` (Render). El dominio raíz debería redirigir a `app.` para que Meta tenga un sitio público que revisar (tarea 0.7).

## DEC-036 · Render en plan gratuito (API y base de datos)

**Fecha:** 2026-11-18 · **Fuente:** decisión del equipo al ver el costo del Blueprint ($17.50/mes: API $7 y BD $10.50) · **Reemplaza en parte:** DEC-035 y la sección 3 de `10`.

- **Qué cambia.** `render.yaml` usa `plan: free` para `nexo-api` y `nexo-bd`. Sin `preDeployCommand` (solo de pago): las migraciones corren en `startCommand` antes de la API.
- **Límites aceptados.** La API duerme a los 15 min sin tráfico; los temporizadores no corren dormida; la BD **expira a los 30 días** y no tiene copias ni restauración (`10`, sección 3 ✔). Detalle y fechas en `docs/operacion.md`, sección 7.
- **Cuándo se revisa.** Antes de ~2026-12-18 (vencimiento de la BD) y antes de la Fase 4 (el chat necesita la API encendida): pasar a `0.5c-512mb` y `0.1c-256mb` o exportar los datos.
- **Criterio de la Fase 3.5 que queda sin cumplir:** «copias de seguridad y restauración probada».

---

## Fase 4 · Chat

*Decisiones del chat (tarea 4.1). Llevan el prefijo `DEC-CHAT-` para no chocar con la numeración que use la parte de WhatsApp, que se trabaja en paralelo en otra rama; al juntar ambas partes se pueden renumerar.*

## DEC-CHAT-1 · Fase 4.1: chat en tiempo real

**Fecha:** 2026-11-19 · **Fuente:** `03`, Fase 4, tarea 4.1 (CH-01 a CH-10) · **Detalle:** `08_Procesos_BD.md`, sección «Fase 4 · Chat» (16 procesos de `0014` a `0016`).

- **Una sola regla de acceso en la BD (`fn_chat_puede`).** Canal del equipo: líder e integrantes. Canal de Invitados: todos. Chat de tarea: líder e integrantes, y el invitado solo si la tarea está compartida con él. Mensaje directo: solo las dos personas, **ni el líder lo ve**; si una sale del equipo, deja de verse para las dos. Quien no tiene acceso recibe 404, como en el resto de la API (DEC-018).
- **Tiempo real.** Socket.IO en el mismo servidor de la API, autenticado con la cookie de sesión. El servidor une cada conexión a una sala por conversación visible (`proc_chat_salas`); el cliente no pide salas. **Al emitir se vuelve a calcular la audiencia** (`proc_chat_miembros`) y solo reciben las conexiones de esas personas: así, si a un invitado se le deja de compartir una tarea o alguien sale del equipo, deja de recibir aunque su conexión siga abierta (cuesta una consulta por emisión; con equipos de hasta 8 es poco). No se usa una sala general «por equipo»: no hay eventos que deba recibir todo el equipo sin filtrar, y una sala así le llegaría al invitado.
- **El socket solo recibe.** Los mensajes se envían por HTTP (validados con Zod y con la misma API de errores) y el socket solo avisa; la web vuelve a pedir lo afectado. Es más simple, las reacciones traen «yo» según quien mira y, al reconectar, lo perdido llega por HTTP.
- **Mensajes sin eventos de dominio.** Escribir, reaccionar, fijar o borrar no genera `eventos_dominio` ni actividad: llenaría el registro del equipo y la cola de WhatsApp de ruido. Solo convertir un mensaje en tarea registra `tarea.propuesta`, igual que proponer.
- **Menciones.** Se escriben `@Nombre Apellido` (la web propone nombres al teclear `@`). Solo cuentan las personas con acceso a la conversación; cada una recibe una notificación «X te mencionó» (categoría `menciones`, abre el chat) salvo que haya apagado «Menciones» en la app (PF-04). No se notifica por WhatsApp desde aquí: eso le toca al despachador de la Fase 4.2.
- **Moderación (matriz `moderar_chat`).** Solo el líder fija mensajes y borra los ajenos; cada quien borra los suyos. El borrado es lógico (el texto deja de salir). No se fijan mensajes en los directos ni respuestas de hilo.
- **Hilos de un solo nivel.** Responder a una respuesta se cuelga de la raíz.
- **Convertir en tarea (CH-09) es del líder**, porque desde DEC-024 solo el líder propone: la tarea entra a votación con el título de la primera línea (editable) y deja un aviso en el chat. Los directos no se convierten (son privados).
- **No leídos.** Puntero por persona y conversación; quien entra a un equipo no ve como pendiente el historial anterior a su ingreso. Silenciar quita la conversación de la insignia de la barra.
- **Búsqueda (CH-08).** `websearch_to_tsquery('spanish', …)` sobre el índice GIN que ya existía; el fragmento marca lo encontrado con «…» y la web lo resalta sin interpretar HTML. Las palabras vacías del español («nosotros», «de») no se pueden buscar solas.
- **Fuera de esta tarea (anotado en `progreso.md`):** adjuntar archivos en el chat (la tabla lo permite; `proc_archivo_subir` solo acepta `tarea_id`), editar mensajes, indicador de «escribiendo…», `pg-boss` y el despachador de eventos (comparten diseño con WhatsApp; se decidirán al juntar ambas partes).

---

## Fase 5 · Autenticación

*Decisiones de la tarea 5.1. Prefijo `DEC-AUTH-` por la misma razón que `DEC-CHAT-`: la parte de WhatsApp se trabaja en paralelo.*

## DEC-AUTH-1 · Fase 5.1: autenticación real

**Fecha:** 2026-11-19 · **Fuente:** `03`, Fase 5, tarea 5.1 (AUTH-01 a AUTH-06, AUTH-11) y PF-02 · **Detalle:** `08_Procesos_BD.md`, sección «Fase 5 · Autenticación» (10 procesos de la `0030`).

- **Argon2id con `@node-rs/argon2`** (binarios precompilados; no necesita compilar en Render ni en Windows) y no con `argon2`, que nombraba `01`. Mismo algoritmo, parámetros por defecto de OWASP (19 MiB, t=2, p=1). La contraseña solo existe en la API: la BD recibe el hash y rechaza lo que no sea `$argon2id$…`.
- **Sesiones: el mismo mecanismo del acceso de desarrollo** (token opaco de 32 bytes en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción; en la BD solo su SHA-256; 30 días). `app.nexo.lol` y `api.nexo.lol` son el mismo sitio, así que `Lax` basta. AUTH-11 ya existía.
- **No revelar si un correo existe:** al entrar, la respuesta es la misma con correo inexistente, contraseña equivocada o cuenta bloqueada («El correo o la contraseña no son correctos. Si fallas varias veces seguidas, espera 15 minutos.»); sin cuenta se verifica contra un hash señuelo para que el tiempo no lo delate. «Recuperar» responde siempre 202 con el mismo texto. **El registro sí lo dice** (409 «Ese correo ya tiene una cuenta…»): evitarlo obliga a crear la cuenta solo después de confirmar el correo, y sin proveedor de correo en producción nadie podría registrarse. Se mitiga con el límite de 5 registros por minuto por IP. **Para revisión.**
- **Límite de intentos:** en la BD, 5 fallos seguidos bloquean la cuenta 15 minutos; en la API, límite por IP (registro 5/min, entrar 10/min, recuperar 5/min, reenviar verificación 3/min). En `NODE_ENV=test` los límites por IP se multiplican por 50 para las pruebas.
- **Correo sin verificar no bloquea la cuenta:** se puede usar la app y Ajustes → Cuenta pide confirmarlo. Restablecer la contraseña lo deja verificado.
- **Enlaces de un solo uso:** restablecer vence en 1 hora y verificar en 24 horas; pedir otro anula el anterior. Restablecer cierra **todas** las sesiones; cambiar la contraseña desde Ajustes (pide la actual) cierra las **demás**.
- **Correos.** `src/correo.ts` con tres proveedores: `consola` (local y pruebas; escribe el enlace en el registro de la API), `resend` (API HTTP de Resend, `RESEND_API_KEY`) y `ninguno`. En producción el servidor **no arranca** con `consola` (los enlaces llevan tokens) ni con `resend` sin clave; sin clave usa `ninguno`: se puede registrar y entrar, pero no recuperar la contraseña ni verificar el correo. El remitente es `CORREO_REMITENTE` (por defecto `no-responder@nexo.lol`; Resend exige verificar el dominio).
- **Semilla:** todas las personas entran con «Nexo-2026» (hash en `semilla.sql`; la semilla nunca se carga en producción). El acceso de desarrollo sigue, ahora plegado bajo el formulario de AUTH-02 y solo si la API lo tiene activo.
- **Fuera de esta tarea:** 2FA (AUTH-07, «solo si hay tiempo» en `03`), cambiar el correo, iniciar sesión con Google (`usuarios.google_sub` existe) y 5.2 a 5.5.

## DEC-AUTH-2 · Desplegar el chat y la Fase 5 antes que WhatsApp

**Fecha:** 2026-11-19 · **Fuente:** decisión de Luis («desplegar ya chat + login») · **Reemplaza:** el orden chat → WhatsApp → Fase 5 acordado antes ese mismo día.

- **Qué cambia.** `produccion` recibe el chat (`0014`–`0016`) y la Fase 5 (`0030`) sin WhatsApp. Como `node-pg-migrate` aplica en orden y rechaza una migración con número menor que otra ya aplicada (`checkOrder`), **las migraciones de WhatsApp deben numerarse desde `0031`**. Sus pruebas de procesos siguen en `P150`–`P199` (no dependen del orden).
- **Por qué.** Sin autenticación real no se podía entrar a la app desplegada (en producción no hay acceso de desarrollo); esto permite ver las vistas en línea ya.
- **Costo.** Quien hace WhatsApp renumera sus archivos antes de juntar; el flujo extremo a extremo «chat y aviso de WhatsApp» y las capturas de WhatsApp se completan al juntar.

## DEC-AUTH-3 · Fase 5.2 a 5.5: validación, permisos, rendimiento y accesibilidad

**Fecha:** 2026-11-19 · **Fuente:** `03`, Fase 5.

- **Mensajes de Zod en español** con `z.config(z.locales.es())` en `packages/shared/src/idioma.ts`, que se importa primero en el índice: vale para la API y la web. Los mensajes propios de cada campo se conservan.
- **Prueba de la matriz:** se considera *permitida* una petición que no responde 401, 403 ni 404; *prohibida*, la que da 403 o 404 (la API usa 404 para no revelar lo ajeno). Para no cambiar datos las sondas mandan cuerpos inválidos (la guardia va antes de validar) o versiones viejas. Toda acción debe tener sonda o un motivo escrito: la prueba falla si se agrega una acción sin cubrir.
- **`usar_plantilla` es ver las plantillas**; convertir una de proyecto en tareas lo guarda `crear_tarea` (solo el líder propone, DEC-024 y DEC-033). La matriz no cambia.
- **Rendimiento:** «tabla grande» = 5000 filas o más; la CI corre `db:volumen` y `db:explain` al final, sobre PostgreSQL 16, y falla con un `Seq Scan` en una tabla grande. **Excepción: Q4** (lote del worker de WhatsApp) hace `Seq Scan` en PostgreSQL 16 y su índice es de la cola de WhatsApp, que esta rama no toca: queda marcada como pendiente (se informa, no falla) hasta que esa rama agregue `CREATE INDEX ix_wa_msj_pendientes ON whatsapp_mensajes (creado_en) WHERE estado = 'pendiente' AND seleccionado AND tipo_envio = 'instantaneo'`.
- **Extremo a extremo con Playwright** en `apps/web/e2e/` (Chromium). La configuración levanta la API en modo `test` y la web; en local reutiliza las que estén abiertas. Las cuentas son nuevas en cada corrida (`@e2e.test`); el recorrido de primer uso se marca como visto por la API para que no tape las pantallas.
- **Accesibilidad:** axe-core falla con problemas *serious* o *critical*. Tokens `--signal-ok-text` y `--signal-warn-text` del tema claro pasan a `#166534` y `#92400e` (las insignias teñidas no llegaban a 4.5:1). Las iniciales del avatar eligen texto oscuro o blanco según el **contraste medido** (WCAG) y no por la luminosidad OKLCH; las iniciales son decorativas (`aria-hidden`) porque el nombre ya va en texto oculto.

---

## Fase 4 · WhatsApp

## DEC-WA-1 · Fase 4.2 y 4.3: WhatsApp simulado de extremo a extremo

**Fecha:** 2026-11-19 · **Fuente:** `03`, Fase 4, tareas 4.2 y 4.3; decisión de Luis de juntar la rama de Isac y completar la Fase 4 · **Detalle:** `08_Procesos_BD.md`, sección «Fase 4 · WhatsApp» (20 procesos de la `0031`).

- **La rama `Dev_Isac` se juntó conservando nuestro chat.** Isac implementó otra vez el chat (4.1), no WhatsApp: rutas y repositorio con SQL directo (contra DEC-025) y una `0014` que chocaba con la nuestra. Se fusionó su historial (`git merge -s ours`) y se tomó lo útil: el índice por `proveedor_mensaje_id` (para los estados del webhook). `pg-boss` no se adoptó (ver abajo).
- **Despachador en el temporizador de la API, sin `pg-boss`.** Cada minuto (`trabajos/whatsapp.ts`, como los plazos de las elecciones): vencimientos, eventos, reportes y envíos. Razones: `nexo_app` no tiene permisos sobre tablas ni puede crear el esquema que `pg-boss` necesita (DEC-025), hay una sola instancia y los procesos ya usan `FOR UPDATE SKIP LOCKED`. En el plan gratuito de Render la API duerme sin tráfico; al despertar, el primer ciclo pone todo al día (un reporte puede salir tarde). **Para revisión** si se pasa a varias instancias o a un *worker* aparte.
- **El despachador también crea los avisos dentro de la app** que la Fase 3 dejó pendientes: asignación (al responsable), propuesta nueva (a los integrantes) y vencimiento (al responsable), con las preferencias de PF-04.
- **Eventos → reglas** (`fn_wa_regla_de`): reuniones → `reunion`; por vencer → `urgente`; asignada o rechazada → `asignacion`; aceptada por votación o creada → `aceptada`; propuesta o rechazada → `triaje` (votación, `07`); completada, cambio de estado, inicio y cierre de sprint → `actualizacion`. Plantillas en `fn_wa_texto`, con los datos actuales y ≤ 400 caracteres.
- **El líder revisa y envía (por defecto);** el envío automático es opcional. Pausa y error detienen todo envío; las horas de silencio, solo lo automático. Al conectar se crean las reglas de siempre: reuniones y vencimientos al instante, lo demás al reporte diario de las 18:00.
- **Reporte:** a la hora fijada (zona del equipo) se juntan los pendientes en un resumen `programado` que sale solo; los incluidos quedan `cancelado` con `reporte_id` para no duplicarse en el historial.
- **Consentimiento (WA-07, PF-05):** número E.164, consentimiento general y por equipo (`membresias.consentimiento_wa`). Sin consentimiento **no se nombra** a la persona («ya tiene responsable»); con él, «@Nombre». El envío directo solo llega a quien tiene las tres cosas. El invitado no participa.
- **4.3, envío real: no se hizo.** La API de grupos exige una cuenta de empresa oficial (OBA), que a su vez exige la verificación del negocio, 30 días de registro y un número real (`docs/whatsapp-verificacion.md`); hoy solo hay un número de pruebas. Queda **construido y probado sin cuenta**: la capa `ProveedorWhatsApp` (`simulado`, `cloud_api_grupos`, `cloud_api_directo`) y el webhook con verificación de suscripción y **firma HMAC-SHA256** sobre el cuerpo crudo, idempotente. El servidor solo llama a Meta con `WHATSAPP_PROVIDER=real` (y en producción exige las cuatro variables); activarlo envía mensajes reales y es decisión del equipo. El llamado a la API de grupos **no se probó** con una cuenta real; sí contra un servidor que imita la API de Meta (`integracion.test.ts`, con `WHATSAPP_API_URL`, que en producción solo puede ser `graph.facebook.com`).
- **FALT-03 y FALT-04 (unirse al grupo y aprobar solicitudes) no se construyeron:** dependen de la API de grupos (webhook `group_participants_update` y endpoints de aprobación), sin cuenta OBA no se pueden probar. Mientras tanto, el líder guarda el enlace de invitación y cada persona con consentimiento lo ve en Ajustes → WhatsApp. D-01 sigue pendiente.

## DEC-WA-2 · WhatsApp con el número de pruebas; la verificación del negocio queda en pausa

**Fecha:** 2026-11-20 · **Fuente:** decisión de Luis: «con el número de pruebas ya pudimos conectar Nexo a WhatsApp y probar el envío; nos mantenemos sobre esa línea» · **Resuelve:** D-01 para esta etapa.

- **Línea de trabajo:** el envío real usa el **número de pruebas** de la WABA de Meta con **mensajes directos** (`cloud_api_directo`): un mensaje por persona del equipo que dio su número y su consentimiento. El número de pruebas solo entrega a los destinatarios dados de alta en Meta for Developers (hasta 5).
- **D-01 (capacidad de grupos):** resuelta para esta etapa: no se usan grupos, así que el tope de 8 miembros por equipo se queda como está (`max_miembros`, por defecto 8) y no depende de Meta.
- **Ignorado hasta nuevo aviso:** verificación del negocio, solicitud de OBA, número real, API de grupos (`cloud_api_grupos` sigue construido pero sin usar) y las pantallas FALT-03 y FALT-04. En `progreso.md` se marcan `[~]` y no cuentan como faltantes. Si Meta aprueba la verificación, se retoma desde DEC-WA-1.
- **Ventana de 24 horas:** Meta solo acepta texto libre si la persona escribió al número en las últimas 24 h; fuera de esa ventana hay que usar una plantilla aprobada. Nexo intenta el texto y, si Meta responde que está fuera de la ventana, manda la plantilla configurada (`WHATSAPP_PLANTILLA`, por defecto `hello_world`, que viene aprobada en toda WABA de prueba).
- **Producción sigue en `simulado`** hasta que el equipo ponga el token y el id del número en Render (docs/operacion.md §10). Las pruebas reales se hacen en local con `pnpm --filter @nexo/api wa:probar`.

## DEC-037 · Pendientes tras la Fase 5

**Fecha:** 2026-11-20 · **Fuente:** auditoría de `03` (Fases 0 a 5) en `progreso.md`, «Pendientes tras la Fase 5» · **Detalle:** `08_Procesos_BD.md`, sección del mismo nombre.

- **Agenda personal (PER-04):** solo reuniones de equipos donde la persona es líder o integrante; el invitado no ve reuniones (como en EQ-14).
- **Exportar mis datos (FALT-09):** JSON inmediato (sin cola), con todo lo de la persona y nunca secretos; queda registro en `exportaciones_datos`.
- **Eliminar la cuenta (FALT-09):** contraseña y la palabra «ELIMINAR». Quien lidera un equipo con más personas primero transfiere; un equipo donde solo estaba esa persona se archiva. La cuenta se **anonimiza** («Cuenta eliminada») en vez de borrarse, para no romper lo que aportó a los equipos (autoría de tareas, mensajes y actividad).
- **Solicitudes del invitado (DEC-023):** una pendiente por tipo; aprobar reutiliza AD-05 (`proc_invitado_gestionar`), así el tope de miembros (NX001) se respeta igual.
- **Invitar por correo (AD-02):** la invitación sigue siendo el enlace o el código; el correo solo lo manda (no se guarda la dirección). En producción depende de Resend.
- **Foto diaria del burndown:** en el temporizador de la API (`trabajos/plazos.ts`), no en `pg-boss` (DEC-WA-1).
- **Chat:** editar solo quien escribió (el líder puede eliminar, no editar, mensajes ajenos). «Escribiendo…» no se guarda: el servidor lo reenvía solo a la sala si la conexión ya está en ella, y como mucho cada 2 s. El socket del chat escucha en todo el equipo para que la insignia de no leídos sea en tiempo real.
- **Foto de perfil:** archivo personal en PostgreSQL (como DEC-033), PNG, JPEG o WebP hasta 1 MB, servido solo con sesión.
- **Adjunto del formulario de contacto: no se hace.** `contacto_mensajes` no tiene dónde guardarlo y abrir la subida de archivos a visitantes sin sesión es un riesgo de abuso. Queda como fase posterior.

