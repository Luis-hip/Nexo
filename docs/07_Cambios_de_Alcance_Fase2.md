# Nexo · Fase 2.5 · Cambios de alcance

> **Para quién es.** Para Code (o cualquier IA) que mantenga los documentos y el código. Es la **Fase 2.5** (entre la Fase 2, ya terminada, y la Fase 3). Son **tres cambios** decididos por el equipo el 2026-11-15; el cuarto (despliegue) pasó al documento `10` (Fase 3.5). Este archivo es la fuente: cada cambio indica **qué se actualiza, dónde y cómo se prueba**. Todo queda registrado en `docs/decisiones.md` (DEC-024 a DEC-028) y en los documentos que correspondan. Si algo contradice a `01`, `02`, `03`, `04` o `05`, **manda este archivo**, y esos documentos se corrigen.
>
> **Reglas de siempre:** rama `Dev_Luis`; PR a `dev`; preguntar antes de cada `git push`; migraciones nuevas, nunca editar `0001`; si algo no está definido, la opción más simple anotada en `decisiones.md`; si es irreversible, preguntar.

## 0. Valores por defecto (**confirmados por el equipo el 2026-11-16**)

| # | Tema | Valor por defecto usado en este archivo |
|---|---|---|
| V-1 | Regla de aceptación de una propuesta | **Mayoría simple de los integrantes activos** (más de la mitad de todos, no solo de los que votaron) |
| V-2 | ¿Vota el líder? | **No**: el líder propone; solo votan los integrantes activos. Invitados no votan |
| V-3 | Plazo de votación | **Sin plazo** en la Fase 2 (el líder puede retirar la propuesta); un plazo automático queda como mejora |
| V-4 | Empate o sin mayoría | La propuesta **sigue en votación**; el líder puede retirarla o reformularla |
| V-5 | Equipo sin integrantes activos (solo el líder) | El líder **acepta directamente** (no hay quién vote) |
| V-6 | Alcance de los procesos de BD | **Todo lo nuevo nace como proceso**; lo ya hecho en las Fases 1 y 2 se migra en una tarea dedicada **dentro de la Fase 2.5, antes de empezar la Fase 3** (ver 2.7); si el tiempo aprieta, primero las escrituras y las lecturas simples pasan a la Fase 3 |
| V-7 | Dónde desplegar | **Decidido: front en Vercel; API, worker y BD en Render; dominio propio.** El plan está en `docs/10_Plan_de_Despliegue.md` (Fase 3.5). D-03 queda **resuelta** |
| V-8 | Visibilidad de los votos | **Conteo de votos más quién ya votó** (sin mostrar el voto de cada persona a los demás); cada integrante ve **su propio voto**. El líder ve lo mismo que los integrantes |
| V-10 | **Por confirmar.** Qué pasa con lo que crea el líder | **Toda tarea nueva que crea el líder entra en votación** (estado `propuesta`); desaparece el destino «backlog directo» de DEC-020. El backlog sigue existiendo para tareas ya aceptadas sin sprint y para las que el líder aparta |
| V-11 | **Por confirmar.** Asignación de responsable | Se **mantiene** el flujo de DEC-020: el líder asigna al proponer o después de aceptada, y el responsable acepta o rechaza la asignación (con motivo). Si la rechaza, el líder **reasigna directamente**, sin nueva votación (hoy vuelve a triaje) |
| V-9 | Nombre del integrante | El nombre es **Carlos**. Se elimina la decisión D-02 y toda pregunta o nota sobre «Carlos/Carlo» en todos los documentos |


## 0b. Estado real del repositorio (revisado el 2026-11-16, rama `dev` en `a6d7895`)

> Lo que sigue se verificó leyendo el código de las Fases 1 y 2. Donde este documento diga «hoy», se refiere a esto.

| Tema | Estado actual |
|---|---|
| Fase 2 | Construida y fusionada en `dev` (PR #7), `main` (PR #8) y `produccion` (PR #9). `progreso.md` aún dice «pendiente de CI, PR y tag `fase-2`»: actualizarlo. La CI en verde **no se pudo comprobar desde fuera** |
| Migraciones | Solo `0001_esquema.sql`; la Fase 2 no necesitó una `0002` |
| Decisiones | `decisiones.md` llega a **DEC-023**. Por eso los cambios de este documento son **DEC-024 a DEC-029** (antes se habían numerado DEC-011 a DEC-016, que ya existían) |
| Triaje hoy (DEC-020) | El **líder crea** directo (al tablero o al backlog, con responsable); el **integrante propone** (`propuesta`); el líder decide en triaje: aceptar (con destino y responsable), rechazar, mandar al backlog o **pedir cambios** (`cambios_pedidos`). «Mis propuestas» es FALT-08. **Esto es lo que cambia** |
| Código con SQL | **~100 usos** de Kysely (`selectFrom`, `insertInto`, `updateTable`, `deleteFrom`, `sql`) en 11 archivos que no son pruebas: `repositorios/{eventos,tareasPersonales,tareasEquipo}.ts`, `equipos/contexto.ts`, `autenticacion.ts`, `servicios/{equipos,tareasPersonales,tareasEquipo}.ts`, `rutas/{contacto,dev,yo}.ts`. La capa de servicios abre transacciones y mezcla lógica con consultas (`servicios/tareasEquipo.ts` tiene 921 líneas); hay **rutas y servicios que consultan directo la BD**, no solo repositorios |
| Pruebas | 150 en `shared`, 79 en la API (contra una BD real migrada y sembrada, `pnpm db:reset`), 80 en la web y 11 SQL. Son la red de seguridad del refactor |
| Secretos hoy | `.env` ignorado y `.env.example` con valores de ejemplo (`SESSION_SECRET=cambia-esto…`, `ENCRYPTION_KEY` de ceros). `pino` ya oculta `req.headers.cookie` y `req.headers.authorization`. `config.ts` solo valida `NODE_ENV`, `PORT`, `DATABASE_URL`, `APP_URL`, `DEV_LOGIN_ENABLED`: **no exige ni valida** `SESSION_SECRET` ni `ENCRYPTION_KEY`, y `APP_URL` tiene valor por omisión local. La CI **no** tiene gitleaks |
| Cookie y CORS hoy | Cookie `HttpOnly`, `SameSite=Lax`, `Secure` solo en producción y **sin `Domain`**; CORS con `origin: APP_URL` y `credentials: true`; el front usa `credentials: 'include'`. No se comprueba el encabezado `Origin` |
| No existe aún | Socket.IO, `pg-boss`, webhook de WhatsApp, roles `nexo_migraciones`/`nexo_app`, `tarea_votos`, `docs/08`, `docs/09`, `docs/10` en el repositorio |

### Excepción a «las pruebas no cambian»
Al construir la **votación** (sección 1) cambian a propósito las pruebas de triaje (`rutas/tareasEquipo.test.ts`, 710 líneas; `permisos.test.ts` y `estados.test.ts` en `shared`). La regla «las pruebas existentes siguen en verde sin cambiar sus expectativas» de 2.7 aplica **al refactor a procesos**, que se hace **después** de la votación.

---

## 1. Cambio 1 · El triaje pasa a ser una votación de los integrantes (DEC-024)

### 1.1 Qué estaba mal
Los documentos decían: el integrante **propone** tareas y el líder las **acepta o rechaza** en triaje. **Es al revés.** Lo correcto:

- El **líder** propone las tareas, **con sus subtareas**.
- Los **integrantes** votan si cada propuesta se **acepta para el sprint** o no.

**Cómo está hoy (DEC-020):** el integrante propone y el líder decide en triaje (aceptar con destino y responsable, rechazar, backlog o pedir cambios). Eso se **reemplaza** por la votación. DEC-020 queda como «Reemplazada en parte por DEC-024» (la asignación y la aceptación de la asignación se mantienen, V-11).

### 1.2 Reglas nuevas
1. Solo el **líder** crea o propone tareas. Crea la tarea **junto con sus subtareas** en una sola operación; queda en estado `propuesta`.
2. Los **integrantes activos** votan **aceptar** o **rechazar**, con un comentario opcional. Pueden **cambiar su voto** mientras la propuesta siga en votación.
3. **Aceptación (V-1):** cuando más de la mitad de los integrantes activos votan «aceptar», la propuesta pasa a `aceptada` y queda **disponible para el sprint** (planeación, EQ-10).
4. **Rechazo:** cuando más de la mitad votan «rechazar», o ya no es posible alcanzar la mayoría para aceptar, pasa a `rechazada`. El líder puede **reformularla** como una propuesta nueva (se conserva el historial).
5. **Empate o sin mayoría (V-4):** sigue en `propuesta`. El líder puede **retirarla** (estado `cancelada`).
6. **Sin integrantes (V-5):** el líder acepta directamente.
7. El líder **no vota** (V-2). Los invitados no ven ni votan propuestas.
8. Un integrante **ya no crea ni propone** tareas. Sus ideas van por el chat o los comentarios.
9. La votación solo existe mientras la tarea está en `propuesta`; después queda **cerrada** y los votos se conservan como historial.
10. Quien salga del equipo o sea expulsado: sus votos de propuestas **abiertas** se descartan; los de propuestas cerradas se conservan.
11. Cada voto genera un evento de dominio y una fila de actividad; al resolverse la propuesta se genera el evento para WhatsApp («propuesta aceptada» / «propuesta rechazada»).

### 1.3 Cambios en la base de datos (migración nueva `0002`, no tocar `0001`)
- Tabla **`tarea_votos`**: `tarea_id`, `usuario_id`, `voto` (`aceptar`/`rechazar`), `comentario`, `votado_en`, `actualizado_en`; clave única `(tarea_id, usuario_id)`.
- Reglas en la BD (como las demás): solo vota un **miembro activo con rol `integrante`** del mismo equipo; solo si la tarea está en `propuesta`; el líder y los invitados no pueden votar (usar un SQLSTATE nuevo `NX004` con su mensaje; registrar en el catálogo de errores del doc 02).
- El tipo `rechazo_por` hoy es `('lider','responsable')`: agregar el valor **`votacion`** (`ALTER TYPE … ADD VALUE`, que debe ir en su propia migración o fuera de una transacción; comprobarlo). La columna `cambios_pedidos` deja de usarse (**no se borra** en la `0002`; se anota como obsoleta).
- `proponente_id` de una propuesta debe ser el **líder activo** del equipo (regla en el proceso; verificar el disparador existente).
- Ajustar el enum `politica_propuestas ('triaje','libre')`: agregar el valor **`votacion`** y usarlo como valor por defecto; documentar qué pasa con `libre` (sin uso en el MVP) y con `triaje` (queda obsoleto). Si el cambio de enum complica la migración, la opción más simple y justificada, anotada en la DEC.
- `whatsapp_reglas.tipo_evento`: el valor `triaje` se interpreta como **votación de propuestas**; si hace falta, agregar `propuesta_aceptada` y `propuesta_rechazada` (documentarlo).
- **Semilla:** hoy hay una propuesta creada por un integrante. Cambiarla para que la cree el líder y agregar algunos votos de ejemplo. Documentar el cambio de semilla (la semilla no es una migración, pero se registra).
- Actualizar `docs/02_Base_de_Datos.md`: diagrama ER, cardinalidades (nueva relación tarea 1—N votos, usuario 1—N votos), reglas RN, sección de pruebas y diccionario.
- Pruebas SQL nuevas (en un archivo aparte, ver 2.6): voto de un líder (falla `NX004`), voto de un invitado (falla), voto doble (actualiza, no duplica), voto fuera de `propuesta` (falla), mayoría exacta con 3, 4 y 8 integrantes, empate con 4 integrantes.

### 1.4 Cambios en el código (archivos reales)
- **`packages/shared/src/permisos.ts`:** quitar `proponer_tarea` y `triaje` (y el texto de `crear_tarea`: «Como integrante, propones tareas y el líder las acepta en triaje»); agregar `votar_propuesta` y `retirar_propuesta`; actualizar `permisos.test.ts` (hoy 120 casos).
- **`packages/shared/src/estados.ts`:** `propuesta` ya no «sale por triaje»: se resuelve por la votación (`aceptada` o `rechazada`) o por retiro (`cancelada`). Hoy dice «Las propuestas se deciden en triaje» y «el líder la reasigna en triaje»: reescribir esos motivos. Actualizar `estados.test.ts`. Agregar los esquemas de voto y de creación con `subtareas[]` en `packages/shared/src/tareas.ts`.
- **`servicios/tareasEquipo.ts`:** `crear()` hoy usa `propuesta = ctx.rol !== 'lider'` → pasa a **solo líder**, siempre en estado `propuesta`, con sus subtareas en la misma transacción (V-10). `triaje()` (aceptar/rechazar/backlog/pedir cambios) se reemplaza por `votar()`; agregar `retirar()` y `reformular()`. **Desde el primer día estas operaciones nacen como procesos** (`proc_tarea_proponer`, `proc_tarea_votar`, …; sección 2), no como más Kysely.
- **Rutas** (`rutas/tareasEquipo.ts`): `POST /equipos/:equipoId/tareas/:tareaId/triaje` se reemplaza por `POST …/voto`; agregar `POST …/retirar` y `POST …/reformular`; la vista `triaje` de `GET /equipos/:equipoId/tareas` pasa a `votacion` (y los conteos). Mantener el estilo y las guardas de sesión, membresía y permiso (`contextoEquipo()`).
- **Web:** `pages/equipo/tareas/index.tsx`, `DetalleTareaEquipo.tsx`, `TareaFormEquipo.tsx` (el formulario lo usa solo el líder y gana subtareas), `AsignacionModal.tsx`, `pages/equipo/Resumen.tsx`, `lib/consultasEquipo.ts` y la ruta `tareas/triaje` de `enrutador.tsx` → **«Votación de propuestas»**, ruta `tareas/votacion`. Según V-8: se muestra el **conteo** y **quién ya votó**, no el voto individual de los demás; cada integrante ve su propio voto. La API **no devuelve** los votos ajenos mientras la propuesta está abierta (tampoco al líder); una vez cerrada, solo el conteo final. **FALT-08** («Mis propuestas») pasa a **«Propuestas por votar y mis votos»**.
- **Semilla (`semilla.sql`):** hay propuestas creadas por un integrante; cambiarlas para que las cree el líder y agregar algunos votos de ejemplo. Documentarlo.
- **Eventos:** `tarea.propuesta` pasa a significar «el líder propuso»; agregar `tarea.votada`, `tarea.aceptada_por_votacion` y `tarea.rechazada_por_votacion` (siguen sin consumidor, DEC-022).

### 1.5 Cambios en `01_Contexto_y_Especificaciones.md`
- Sección 2.1 (perfiles): **Líder** «propone tareas con subtareas, gestiona sprints…»; **Integrante** «vota las propuestas, cambia el estado de **sus** tareas…» (quitar «Propone tareas»).
- Sección 2.2 (matriz):

| Acción | Personal | Líder | Integrante | Invitado |
|---|:-:|:-:|:-:|:-:|
| Crear / proponer tarea con subtareas | ✔ | ✔ | ✖ | ✖ |
| **Votar propuesta (aceptar para el sprint)** | — | ✖ | ✔ | ✖ |
| Retirar o reformular propuesta | — | ✔ | ✖ | ✖ |

  Eliminar la fila «Proponer tarea (va a triaje)» y la fila «Triaje (aceptar/rechazar)».
- Sección 2.3, regla 3: «El **líder propone** las tareas (con sus subtareas); los **integrantes votan** si se aceptan para el sprint (mayoría simple de los integrantes activos)».
- Sección 2.4 (estados): `propuesta → (votación) → aceptada/backlog → …`.
- Sección 3 (árbol de rutas): `tareas/{lista, backlog, votacion, :id}`.
- Sección 3.3 y `03` sección 9.2: ajustar FALT-08.
- Aviso: el prototipo de Figma decía lo contrario (decisión por defecto #4 de `progreso.ts`); el prototipo **no se corrige**, pero esta regla lo reemplaza.

### 1.6 Cambios en `03_Plan_de_Accion.md`
- Fase 2, tareas 2.2.4 y 2.2.5: reescribir como: «**Crear tarea con subtareas (EQ-07, solo líder)**» y «**Votación de propuestas (EQ-05)**: los integrantes votan; al alcanzar mayoría pasa a aceptada o rechazada; el líder puede retirar o reformular».
- Criterio de terminado de la Fase 2: agregar «Una propuesta con 3 integrantes se acepta con 2 votos a favor; con 4, con 3; el líder y un invitado no pueden votar (pruebas automáticas)».

### 1.7 Cambios en `04_Articulo.md` (redes de Petri)
Cambiar el proclet **Tarea** (tabla B.9.4.1):

| Tipo | Elemento | Significado |
|---|---|---|
| Lugar | `Propuesta` | El **líder** propuso la tarea con sus subtareas (marca inicial) |
| Transición | `Votar (integrantes)` | Los integrantes emiten su voto |
| Lugar | `En votación` | Esperando mayoría |
| Transición | `Aceptar por mayoría` | Más de la mitad de los integrantes acepta |
| Transición | `Rechazar por mayoría` | Más de la mitad rechaza |
| Lugar | `Rechazada` | Estado final del rechazo (el líder puede reformular) |
| Lugar | `Aceptada` | Disponible para el sprint |

y ajustar el resto (`Asignada`, `En curso`, …) para que parta de `Aceptada`. En la tabla B.9.4.3 cambiar «`Rechazar (líder)` → «Propuesta rechazada»» por «`Rechazar por mayoría` → «Propuesta rechazada»» y agregar «`Aceptar por mayoría` → «Propuesta aceptada»». Actualizar los escenarios B.9.4.4 (1 y 2 pasan por la votación) y el texto de B.10/B.8 si menciona el triaje. Mantener las marcas `[VERIFICAR]`.

### 1.8 Cambios en `05_Cronograma.md` y en `01` (tabla de fases)
Solo si mencionan triaje: reemplazar por «votación de propuestas».

---

## 2. Cambio 2 · Procesos en la base de datos: el código no lleva SQL de negocio (DEC-025)

### 2.1 Regla
**Toda operación sobre datos es un proceso almacenado en PostgreSQL** (función o procedimiento) creado por una migración. El código de la API **no contiene** `SELECT/INSERT/UPDATE/DELETE` con tablas, filtros ni uniones.

> **Qué sí queda en el código (sé honesto en la documentación):** una **llamada** al proceso (por ejemplo `select * from proc_tarea_votar($1,$2,$3)`) en **un único lugar**: la capa `apps/api/src/repositorios/`. Esa llamada no contiene lógica; la lógica, las consultas y las validaciones viven en la BD.

### 2.2 Convenciones
- **Nombre:** `proc_<dominio>_<accion>` (`proc_tarea_proponer`, `proc_tarea_votar`, `proc_equipo_crear`, `proc_whatsapp_encolar`).
- **Funciones auxiliares y disparadores** conservan el prefijo `fn_` y **no** son invocables por la aplicación (se les revoca `EXECUTE`).
- **Parámetros:** siempre reciben `p_actor_id` (quién ejecuta). El proceso **verifica membresía y rol** del actor como **defensa en profundidad**; la matriz de `packages/shared` sigue siendo la que decide en la API.
- **Retorno:** `jsonb` o un tipo compuesto bien definido; los errores se señalan con `RAISE EXCEPTION … USING ERRCODE = 'NX0xx'` y se mantiene el **catálogo de códigos** (NX001–NX004…) en el doc 08.
- **Transacciones:** cada proceso es atómico; inserta el evento de dominio dentro de la misma transacción.
- **Seguridad:** `SECURITY DEFINER` solo cuando haga falta, con `SET search_path = public, pg_temp`, y siempre validando al actor.
- **Roles de la BD:** `nexo_migraciones` (dueño del esquema; solo la CI/despliegue) y **`nexo_app`** (la API): solo `EXECUTE` sobre `proc_*`; **sin permisos directos sobre tablas**. Así, aunque alguien robe la conexión de la app, no puede leer ni escribir tablas a mano. Las lecturas también pasan por procesos o por vistas autorizadas.
- **Migraciones:** cada proceso nuevo o cambiado va en una migración nueva con `-- Up Migration` y `-- Down Migration`.

### 2.3 Capa de la API
- `apps/api/src/repositorios/*.ts`: una función tipada por proceso; valida la respuesta con un esquema Zod de `packages/shared`.
- Los **servicios** y las **rutas** no importan nada de Kysely ni escriben SQL. Se agrega una regla de ESLint o una prueba que falle si aparece `selectFrom`, `insertInto`, `updateTable`, `deleteFrom` o una cadena SQL fuera de `repositorios/`.
- Los tipos de las tablas generados por `kysely-codegen` ya no los usa la aplicación; pueden conservarse solo para pruebas o retirarse (decidir y anotar en la DEC).

### 2.4 Documento nuevo: `docs/08_Procesos_BD.md`
Registro vivo, **un apartado por proceso**. Plantilla:

```
### proc_<dominio>_<accion>
- Migración: 000N_nombre.sql
- Propósito: qué hace, en una frase.
- Parámetros: nombre · tipo · descripción.
- Retorno: forma exacta del resultado.
- Reglas y validaciones: lista (quién puede, en qué estado, límites).
- Errores: SQLSTATE · cuándo · mensaje para el usuario.
- Tablas que toca: lectura / escritura.
- Eventos que genera: evento de dominio y actividad.
- Lo llama: archivo y función del repositorio; ruta HTTP.
- Pruebas: archivo y caso.
- Ejemplo de llamada.
- Historial: fecha · cambio · migración.
```
Incluye al inicio: la **regla** (2.1), las **convenciones** (2.2), el **catálogo de errores** y una **tabla índice** (proceso · dominio · migración · estado).
**Control:** un script `scripts/verificar-procesos-doc.ts` (en la CI) falla si existe un `CREATE FUNCTION/PROCEDURE proc_*` en las migraciones que no aparezca en `08`. La plantilla de PR agrega la casilla «Documenté el proceso en `docs/08_Procesos_BD.md`».

### 2.5 Documentos que se actualizan
- `02_Base_de_Datos.md`: sección 8 (reglas), 9, 12 (migraciones), 13 (las 7 consultas clave pasan a ser procesos o vistas) y una sección nueva «Procesos y roles de la BD» que remite al doc 08.
- `01_Contexto_y_Especificaciones.md`: sección 6 (la fila de **Kysely** cambia a «llamar procesos tipados y validados con Zod») y la 7.1 (capas: `rutas → servicios → repositorios → procesos de la BD`); sección 10 (convenciones 4 y 5: la lógica de datos vive en procesos).
- `03_Plan_de_Accion.md`: regla de ejecución nueva «Todo acceso a datos es un proceso (`docs/08`)» y la tarea 2.7.
- `06_README_AGENTS.md`: agregar `07` y `08` y `09` a la tabla de documentos.

### 2.6 Pruebas
- Archivo nuevo `apps/api/db/tests/pruebas_procesos.sql` (el de las 11 pruebas **no se toca**: `db:test` sigue exigiendo exactamente 11 `OK`). Un script `db:test:procesos` ejecuta el nuevo y exige el total esperado de líneas `OK`; la CI agrega ese paso.
- Cada proceso tiene al menos un caso permitido y uno prohibido.
- Prueba de roles: conectado como `nexo_app`, `select * from tareas` **falla** por falta de permisos; `select proc_…` funciona.

### 2.7 Tarea dedicada de la Fase 2.5: migrar lo existente
1. Inventariar todas las consultas actuales: son los **11 archivos** de la sección 0b (~100 usos). Empezar por los de equipos y tareas (`servicios/{equipos,tareasEquipo}.ts`, `repositorios/{eventos,tareasEquipo}.ts`, `equipos/contexto.ts`), seguir con `autenticacion.ts` y `rutas/{yo,dev,contacto}.ts` y terminar con las tareas personales.
2. Crear un proceso por operación en migraciones nuevas, documentarlo en `08` y reescribir el repositorio para llamarlo.
3. Que las pruebas de integración existentes sigan en verde **sin cambiar sus expectativas** (es un refactor: el comportamiento no cambia).
4. Activar los roles `nexo_migraciones`/`nexo_app` **al final**, cuando ya no quede SQL directo.
5. **Riesgo de reglas duplicadas.** La máquina de estados vive en TypeScript (`packages/shared/src/estados.ts`) y la usan la web y la API. Si las transiciones se reescriben en PL/pgSQL habrá **dos copias**. Mitigación: la fuente de verdad sigue en `estados.ts`; la BD guarda una tabla de transiciones (`transiciones_estado`) o la comprueba en el proceso; **una prueba compara ambas** y falla si difieren. Lo mismo vale para el cálculo de la mayoría de la votación. Anotarlo en la DEC-025.
6. **Costo y riesgo:** es un refactor grande entre dos fases. Hacerlo en una rama propia (`proc/migracion-existente`, saliendo de `Dev_Luis`) y por dominios; si el tiempo aprieta, migrar primero escrituras y operaciones críticas (equipos, membresías, tareas, votos, sesiones) y dejar las lecturas simples para la Fase 3, **anotándolo en `progreso.md`**.

---

## 3. Cambio 3 · Secretos y claves: nada sensible fuera de quien tiene permiso (DEC-026)

### 3.1 Qué cuenta como secreto
`DATABASE_URL` (con contraseña), `SESSION_SECRET`, `ENCRYPTION_KEY`, tokens y claves de WhatsApp/Meta (`WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`), credenciales de correo, claves del proveedor de alojamiento, tokens de GitHub, contraseñas de roles de la BD y cualquier clave de terceros.

### 3.2 Reglas
1. **Nunca** en el repositorio, en commits, en issues, en PR, en capturas, en registros ni en documentos. En `docs/` solo nombres de variables, nunca valores.
2. `.env` está en `.gitignore`; **solo se sube `.env.example`** con valores **falsos** y comentarios.
3. **El navegador no recibe secretos.** Todo lo que sale a la web (variables `VITE_*`) se considera **público**. Las llamadas a WhatsApp, correo y terceros las hace solo la API.
4. **Producción:** los secretos viven **solo en las variables de entorno del proveedor de alojamiento** y, para la CI, en **GitHub → Settings → Secrets and variables → Actions**. Solo las personas con rol de desarrollador/administrador del alojamiento y del repositorio pueden verlos o cambiarlos. La CI de pruebas usa valores **desechables** que no sirven fuera de ella.
5. **Un secreto distinto por entorno** (local, CI, producción). Nunca se reutiliza el de producción en local.
6. **En la BD:** los tokens de terceros (por ejemplo el de WhatsApp) se guardan **cifrados** (AES-256-GCM con `ENCRYPTION_KEY`). La API **nunca los devuelve**: responde solo `configurado: true/false`.
7. **Registros:** configurar `pino` con **redacción** (`redact`) de `authorization`, `cookie`, `set-cookie`, `token`, `password`, `secret`, `*.token`, `*.clave`. Prohibido registrar cuerpos de peticiones de login o de WhatsApp completos.
8. **Arranque seguro:** la API valida todas las variables con Zod al iniciar y **no arranca** si falta o es débil un secreto en producción (mínimo de longitud para `SESSION_SECRET` y `ENCRYPTION_KEY`), como ya hace con `DEV_LOGIN_ENABLED`.
9. **Detección:** activar **GitHub secret scanning y push protection** (en Settings → Code security) y agregar **gitleaks** a la CI para que un PR con una clave falle. Revisar **todo el historial** de Git una vez ahora.
10. **Si algo se filtra:** no basta borrarlo; hay que **rotarlo de inmediato** (generar uno nuevo, actualizarlo en el proveedor y revocar el viejo) y anotarlo en `docs/seguridad-incidentes.md` sin escribir el valor.
11. **Rotación:** documentar el procedimiento para `SESSION_SECRET` (invalida sesiones), `ENCRYPTION_KEY` (requiere re-cifrar los tokens guardados) y el token de WhatsApp.
12. **Acceso mínimo:** colaboradores de GitHub con permiso de escritura solo los desarrolladores; los accesos a Meta for Developers, al alojamiento y a la BD de producción, solo quien los necesita; cuentas con **verificación en dos pasos**.

> **Ojo con el repositorio público.** Si el repositorio sigue público, cualquiera puede leer todo el código y los documentos. Eso no es un problema si se cumplen estas reglas, pero cualquier secreto que se suba **se considera robado** al instante. Decidir si pasa a privado (ver la nota sobre la protección de ramas en DEC-001).

### 3.3 Documento nuevo: `docs/09_Seguridad_y_Secretos.md`
Contiene: la lista de secretos (solo nombres), dónde vive cada uno y quién tiene acceso, las reglas de 3.2, el procedimiento de rotación, el procedimiento ante una filtración y la lista de verificación previa a producción.

### 3.4 Documentos que se actualizan
`01` sección 8 (tabla de variables: columna «dónde vive» y «quién accede») y sección 10 (convención 8 y 9); `03` Fase 5.4 y Fase 6 (paso 2: secretos); `02` sección 11 (seguridad y privacidad); `README.md` (sección «Secretos»).

### 3.5 Tareas para Code ahora (según el estado real, sección 0b)
1. Revisar el **historial de Git** y el árbol en busca de secretos; informar el resultado (una sola vez; después lo hace gitleaks).
2. **Ya existe** la redacción de `req.headers.cookie` y `req.headers.authorization` en `pino`: **ampliarla** (`set-cookie`, `*.token`, `*.password`, `*.secret`, cuerpos de login y de WhatsApp).
3. **`config.ts`:** hoy no valida secretos. Agregar `SESSION_SECRET` y `ENCRYPTION_KEY` (longitud mínima, `ENCRYPTION_KEY` de 64 hex), `APP_URL` y `API_URL` **obligatorias** en producción (sin el valor local por omisión) y **rechazar en producción los valores de `.env.example`** (la cadena `cambia-esto…`, la clave de ceros). Pruebas automáticas como la de `DEV_LOGIN_ENABLED`.
4. Agregar **gitleaks** a `.github/workflows/ci.yml`.
5. Comprobar el encabezado **`Origin`** en las peticiones que modifican datos.
6. Crear `docs/09_Seguridad_y_Secretos.md` y `docs/seguridad-incidentes.md` (plantilla vacía).
7. **Pedir al usuario** (no hacerlo solo) activar secret scanning y push protection en GitHub y decidir si el repositorio pasa a privado.

---

## 4. El despliegue ya no es parte de este documento

El **Cambio 4 (despliegue)** pasó a un documento propio: **`docs/10_Plan_de_Despliegue.md`** (**Fase 3.5**, después de la Fase 3). Decisión tomada el 2026-11-16: **front en Vercel; API, worker y BD en Render; dominio propio con subdominios `app.` y `api.`**. En la Fase 2.5 **no se despliega nada ni se crean cuentas**. Solo se actualizan los documentos como indica la sección 6 (paso 1).

## 5. Registro en `docs/decisiones.md`

| ID | Tema | Estado |
|---|---|---|
| DEC-020 (existente) | Tareas de equipo: destino, triaje y asignación | **Reemplazada en parte por DEC-024** |
| DEC-024 | El triaje pasa a ser votación de los integrantes sobre propuestas del líder (V-1 a V-5, V-8) | Vigente; valores confirmados |
| DEC-025 | Procesos almacenados en la BD; la API no lleva SQL de negocio; roles `nexo_migraciones` y `nexo_app` | Vigente; alcance V-6 confirmado |
| DEC-026 | Política de secretos y claves | Vigente |
| DEC-027 | Alojamiento: front en Vercel; API, worker y BD en Render; dominio propio (detalle en `docs/10`, Fase 3.5) | Vigente; D-03 resuelta |
| DEC-028 | Nuevos documentos `07` (Fase 2.5), `08`, `09` y `10` (Fase 3.5); actualización de `01`–`06` y del README | Vigente |
| DEC-029 | El nombre del integrante es **Carlos** (se elimina D-02) y V-8 (visibilidad de votos) | Vigente |

## 6. Orden de trabajo sugerido para Code

0. **Nombre (V-9):** elimina la decisión D-02 y toda pregunta sobre «Carlos/Carlo» en `01`, `04`, `05`, `06`, `decisiones.md` y donde aparezca; el nombre es **Carlos**.
1. **Documentos primero** (una sola rama `docs/fase-2-5`, saliendo de `Dev_Luis`): crear `docs/07` (este archivo), `docs/08_Procesos_BD.md`, `docs/09_Seguridad_y_Secretos.md` y `docs/10_Plan_de_Despliegue.md`; actualizar `01`, `02`, `03`, `04`, `05`, `06` y `decisiones.md` según las secciones 1.5–1.8, 2.5 y 3.4. Además:
   - `03` (mapa de fases): agregar **Fase 2.5** (este documento, con su criterio de terminado de la sección 7) y **Fase 3.5 · Despliegue** (documento `10`, después de la Fase 3). La Fase 6 deja de contener el despliegue y queda como cierre, con la referencia al documento `10`.
   - `05` (cronograma): agregar las fases 2.5 y 3.5 con los mismos responsables de desarrollo.
   - `01` sección 0: D-03 **resuelta** (Vercel + Render + dominio propio) y sección 8 con esa decisión y la referencia al documento `10`.
   - `06`: agregar `07`, `08`, `09` y `10` a la tabla de documentos.
   - Pregunta antes del `push`.
2. **Secretos** (3.5): informe, redacción de registros, gitleaks.
3. **Votación** (sección 1): migración `0002` (`tarea_votos`, enum, procesos), pruebas, API, permisos, estados y pantalla. Cambian a propósito las pruebas de triaje (ver 0b).
4. **Migración de lo existente a procesos** (2.7), terminando con los roles de la BD.
5. Cerrar la **Fase 2.5** con el criterio de la sección 7, `progreso.md` al día y la CI en verde.
6. **No** desplegar ni crear cuentas: el despliegue es la Fase 3.5 (`docs/10`).

## 7. Criterio de terminado de la Fase 2.5

- [ ] Documentos `07`, `08`, `09` y `10` creados; `01`–`06`, `decisiones.md` y el README actualizados; no queda ninguna pregunta sobre «Carlos/Carlo» ni la regla antigua del triaje.
- [ ] Informe de secretos entregado (historial y árbol sin secretos, o secretos rotados); `pino` con redacción; arranque con validaciones; gitleaks en la CI.
- [ ] Una propuesta con 3 integrantes se acepta con 2 votos a favor; con 4, con 3; el líder y un invitado no pueden votar; la API no devuelve votos ajenos mientras la propuesta está abierta (pruebas automáticas).
- [ ] Toda operación sobre datos pasa por un proceso `proc_*` documentado en `docs/08`; no hay SQL de negocio fuera de `repositorios/` (prueba o regla de lint); `nexo_app` no puede leer tablas directamente.
- [ ] Las pruebas de la Fase 2 siguen en verde sin cambiar sus expectativas; las 11 pruebas SQL y las de procesos pasan; la CI está en verde.
- [ ] `progreso.md` actualizado (Fase 2 cerrada, Fase 2.5 hecha) y `decisiones.md` con DEC-024 a DEC-029; DEC-020 marcada como reemplazada en parte.
- [ ] Etiqueta `fase-2-5` en `Dev_Luis` y PR a `dev`.
