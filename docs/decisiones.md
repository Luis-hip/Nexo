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
