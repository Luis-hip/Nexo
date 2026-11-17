# Nexo · Procesos de la base de datos

> Registro vivo (DEC-025, `07_Cambios_de_Alcance_Fase2.md`, sección 2). **Un apartado por proceso.** Si creas o cambias un proceso en una migración, lo documentas aquí en el mismo PR (la CI lo comprueba con `scripts/verificar-procesos-doc.ts`).

## 1. La regla

**Toda operación sobre datos es un proceso almacenado en PostgreSQL** (función o procedimiento) creado por una migración. El código de la API **no contiene** `SELECT/INSERT/UPDATE/DELETE` con tablas, filtros ni uniones.

> **Qué sí queda en el código (honestidad):** una **llamada** al proceso (por ejemplo `select * from proc_tarea_votar($1,$2,$3)`) en **un único lugar**: la capa `apps/api/src/repositorios/`. Esa llamada no contiene lógica; la lógica, las consultas y las validaciones viven en la BD. Una prueba o regla de lint falla si aparece SQL de negocio fuera de `repositorios/`.

## 2. Convenciones

- **Nombre:** `proc_<dominio>_<accion>` (`proc_tarea_proponer`, `proc_tarea_votar`, `proc_equipo_crear`, `proc_whatsapp_encolar`).
- **Auxiliares y disparadores:** conservan `fn_` / `trg_` y **no** son invocables por la aplicación (se les revoca `EXECUTE`).
- **Parámetros:** siempre `p_actor_id` (quién ejecuta). El proceso verifica **membresía y rol** del actor como defensa en profundidad; la matriz de `packages/shared` sigue decidiendo en la API.
- **Retorno:** `jsonb` o un tipo compuesto bien definido; la API valida la respuesta con un esquema Zod de `packages/shared`.
- **Errores:** `RAISE EXCEPTION … USING ERRCODE = 'NX0xx'` y se mantiene el catálogo de la sección 3.
- **Transacciones:** cada proceso es atómico e inserta su evento de dominio y su fila de `actividad` en la misma transacción.
- **Seguridad:** `SECURITY DEFINER` solo cuando haga falta, con `SET search_path = public, pg_temp`, validando siempre al actor.
- **Roles:** `nexo_migraciones` (dueño del esquema; solo CI y despliegue) y `nexo_app` (la API): **solo `EXECUTE` sobre `proc_*`**, sin permisos sobre tablas. Las lecturas pasan por procesos o por vistas autorizadas.
- **Migraciones:** cada proceso nuevo o cambiado va en una migración nueva con `-- Up Migration` y `-- Down Migration`.
- **Reglas duplicadas:** la máquina de estados y la mayoría de la votación tienen fuente de verdad en TypeScript (`packages/shared`); una prueba compara la copia de la BD y falla si difieren.

## 3. Catálogo de errores

| SQLSTATE | Significado | Mensaje para el usuario | Origen |
|---|---|---|---|
| `NX001` | Equipo lleno | «Este equipo ya tiene 8 miembros activos.» | `0001` |
| `NX002` | El líder saliente no vota (elección) | «El líder saliente no participa en la votación.» | `0001` |
| `NX003` | Límite de votos de retrospectiva | «Ya usaste tus 3 votos.» | `0001` |
| `NX004` | Voto de propuesta no permitido (vota el líder o un invitado, o la tarea no está en votación) | «Solo los integrantes votan las propuestas; el líder propone.» | `0003` |
| `NX005` | El actor no tiene permiso para la operación (no es el líder, invitado caducado…) | El mensaje del proceso, en español | `0003` |
| `NX006` | No encontrado: el equipo o la tarea no existen **para ese actor** (DEC-014, DEC-018) | «No encontramos ese equipo.» / «No encontramos esa tarea.» | `0003` |
| `NX007` | El estado no admite la operación (votación cerrada, propuesta que no se puede retirar o reformular) | El mensaje del proceso | `0003` |
| `NX008` | Conflicto de versión (concurrencia optimista) | «Alguien cambió esta tarea. Recárgala para ver la versión más reciente.» | `0003` |
| `NX009` | Equipo archivado (solo lectura) | «El equipo está archivado: solo lectura.» | `0003` |
| `NX010` | Datos inválidos que solo la BD puede comprobar (responsable que no es miembro…) | El mensaje del proceso | `0003` |

**Forma de un error de proceso.** `SQLSTATE` (la clase del error) + `MESSAGE` (texto en español para el usuario) + `HINT` (código de la API, p. ej. `tarea_no_encontrada`) + `DETAIL` opcional en JSON (p. ej. `{"version_actual": 5}`). La API los traduce en un solo lugar (`repositorios/procesos.ts`): `NX004`/`NX005`/`NX009` → 403, `NX006` → 404, `NX007` → 422, `NX008` → 409, `NX010` → 400. Los códigos nuevos se agregan aquí al crearlos.

## 4. Índice de procesos

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_tarea_proponer` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_votar` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_retirar` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_reformular` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_votacion` | Tareas · votación (lectura) | `0003_votacion.sql` | Vigente |
| `proc_tarea_votaciones` | Tareas · votación (lectura) | `0003_votacion.sql` | Vigente |

**Auxiliares (`fn_*`, no las llama la aplicación)** creadas en `0003`: índice fraccionario (`fn_orden_entre`, `fn_orden_al_final` y sus partes), `fn_votacion_resultado`, `fn_votacion_resumen`, `fn_integrantes_activos`, `fn_registrar_evento`, `fn_membresia_actor`, `fn_exigir_lider`, `fn_exigir_equipo_activo`, `fn_exigir_responsable`, `fn_exigir_version`, `fn_bloquear_tarea`, `fn_fijar_etiquetas`, `fn_tarea_insertar_propuesta`, y los disparadores `fn_voto_propuesta_valido` y `fn_membresia_descarta_votos`.

## 5. Plantilla de apartado

```
### proc_dominio_accion
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

## 6. Procesos

*(Un apartado por proceso, con la plantilla de la sección 5.)*

### proc_tarea_proponer
- **Migración:** `0003_votacion.sql`
- **Propósito:** el líder propone una tarea de equipo **con sus subtareas** en una sola operación; queda en votación (V-10).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_datos jsonb` · `{ titulo, descripcion?, prioridad?, vence_en?, etiquetas?: text[], subtareas?: text[], responsable_id? }`.
- **Retorno:** `jsonb` `{ id, codigo, estado }` (`estado` = `propuesta`, o `aceptada` si el equipo no tiene integrantes).
- **Reglas y validaciones:** el actor debe ser el **líder activo** del equipo; el equipo no puede estar archivado; el responsable, si se indica, debe ser líder o integrante activo (queda con la asignación pendiente si no es el propio líder, V-11); `origen = propuesta` y `proponente_id = actor`; la tarea va al final de su columna (`fn_orden_al_final`); **sin integrantes activos** queda `aceptada` y entra al sprint activo (V-5).
- **Errores:** `NX005` · el actor no es el líder · «Solo el líder propone tareas…». `NX006` · el actor no pertenece al equipo · «No encontramos ese equipo.». `NX009` · equipo archivado. `NX010` · responsable que no es miembro · «El responsable debe ser un miembro del equipo.». `23514` · título vacío o de más de 140 caracteres (lo evita la validación Zod de la API).
- **Tablas que toca:** lectura `membresias`, `equipos`, `sprints`, `usuarios`; escritura `tareas`, `subtareas`, `etiquetas`, `tarea_etiquetas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.propuesta` («Valeria propuso T-10 «…» (en votación)») o `tarea.creada` cuando queda aceptada directamente; una fila de `actividad`.
- **Lo llama:** `repositorios/votacion.ts` → `proponer()`; `POST /equipos/:equipoId/tareas`.
- **Pruebas:** `db/tests/pruebas_procesos.sql` P10, P11; `rutas/tareasEquipo.test.ts` «proponer (EQ-07)».
- **Ejemplo de llamada:** `select proc_tarea_proponer($1, $2, '{"titulo":"Exportar reportes","subtareas":["Diseñar","Programar"]}')`
- **Historial:** 2026-11-16 · creación · `0003`.

### proc_tarea_votar
- **Migración:** `0003_votacion.sql`
- **Propósito:** un integrante activo vota una propuesta (o cambia su voto) y, si se alcanza la mayoría, la propuesta se resuelve en la misma transacción.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tarea_id uuid`. `p_voto text` · `aceptar` | `rechazar`. `p_comentario text` · opcional (hasta 500 caracteres).
- **Retorno:** `jsonb` con el resumen de la votación para el actor (ver `proc_tarea_votacion`) más `estado` (`propuesta`, `aceptada` o `rechazada`).
- **Reglas y validaciones:** solo vota un **integrante activo** del equipo (ni el líder ni los invitados; V-2); solo mientras la tarea está en `propuesta`; un voto por persona: votar otra vez **actualiza** (clave `(tarea_id, usuario_id)`); mayoría simple de **todos** los integrantes activos (`fn_votacion_resultado`, V-1): `aceptar*2 > total` → `aceptada` (entra al sprint activo, al final de la columna); `rechazar*2 > total` → `rechazada` con `rechazo_por = votacion`, motivo «Rechazada por mayoría (r de n)» y sin responsable; en otro caso (incluido el empate, V-4) sigue en `propuesta`.
- **Errores:** `NX004` · vota el líder o un invitado · «Solo los integrantes votan las propuestas; el líder propone.» (403). `NX007` · la tarea ya no está en `propuesta` · «La votación de esta tarea ya cerró.» (422). `NX006` · no pertenece al equipo o la tarea no es del equipo (404). `NX009` · equipo archivado. `NX010` · voto que no es `aceptar` ni `rechazar`.
- **Tablas que toca:** lectura `membresias`, `equipos`, `sprints`, `usuarios`; escritura `tarea_votos`, `tareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.votada` (sin el sentido del voto, V-8: «Carlos votó la propuesta T-08…» o «…cambió su voto en…»); al resolverse, `tarea.aceptada_por_votacion` o `tarea.rechazada_por_votacion` (con el conteo), que son los que usará WhatsApp («Propuesta aceptada» / «Propuesta rechazada»).
- **Lo llama:** `repositorios/votacion.ts` → `votar()`; `POST /equipos/:equipoId/tareas/:tareaId/voto`.
- **Pruebas:** `pruebas_procesos.sql` P1 a P9; `tareasEquipo.test.ts` «votación de propuestas».
- **Ejemplo de llamada:** `select proc_tarea_votar($1, $2, $3, 'aceptar', null)`
- **Historial:** 2026-11-16 · creación · `0003`.

### proc_tarea_retirar
- **Migración:** `0003_votacion.sql`
- **Propósito:** el líder retira una propuesta que sigue en votación (V-3, V-4).
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tarea_id uuid`. `p_version int` · versión que tenía el cliente.
- **Retorno:** `jsonb` `{ id, codigo, estado: 'cancelada' }`.
- **Reglas y validaciones:** solo el líder activo; equipo no archivado; la tarea debe estar en `propuesta`; concurrencia optimista por `version`. La tarea pasa a `cancelada` (se muestra «Retirada»); los votos se conservan como historial.
- **Errores:** `NX005` · no es el líder · «Solo el líder puede retirar o reformular propuestas.». `NX007` · no está en votación. `NX008` · versión vieja (409, con `version_actual` en el detalle). `NX006` · no encontrada.
- **Tablas que toca:** lectura `membresias`, `equipos`; escritura `tareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.retirada`.
- **Lo llama:** `repositorios/votacion.ts` → `retirar()`; `POST /equipos/:equipoId/tareas/:tareaId/retirar`.
- **Pruebas:** `pruebas_procesos.sql` P12; `tareasEquipo.test.ts` «la líder retira una propuesta…».
- **Ejemplo de llamada:** `select proc_tarea_retirar($1, $2, $3, 4)`
- **Historial:** 2026-11-16 · creación · `0003`.

### proc_tarea_reformular
- **Migración:** `0003_votacion.sql`
- **Propósito:** el líder vuelve a proponer una propuesta rechazada por votación o retirada; nace una propuesta **nueva** y la anterior se conserva como historial.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tarea_id uuid` · la propuesta anterior. `p_datos jsonb` · igual que en `proc_tarea_proponer`.
- **Retorno:** `jsonb` `{ id, codigo, estado }` de la propuesta nueva.
- **Reglas y validaciones:** solo el líder; equipo no archivado; la anterior debe estar `cancelada` o `rechazada` con `rechazo_por = votacion`; las mismas reglas que proponer.
- **Errores:** `NX005`, `NX006`, `NX009`, `NX010` como en proponer; `NX007` · la tarea no es una propuesta rechazada ni retirada.
- **Tablas que toca:** las de `proc_tarea_proponer`.
- **Eventos que genera:** `tarea.reformulada` sobre la anterior (con `nueva_id`) y `tarea.propuesta` sobre la nueva (con `reformula_id`).
- **Lo llama:** `repositorios/votacion.ts` → `reformular()`; `POST /equipos/:equipoId/tareas/:tareaId/reformular`.
- **Pruebas:** `pruebas_procesos.sql` P12; `tareasEquipo.test.ts` «rechazada por mayoría: la líder la reformula…».
- **Ejemplo de llamada:** `select proc_tarea_reformular($1, $2, $3, '{"titulo":"Versión 2"}')`
- **Historial:** 2026-11-16 · creación · `0003`.

### proc_tarea_votacion
- **Migración:** `0003_votacion.sql`
- **Propósito:** resumen de la votación de una tarea según quién consulta (V-8).
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tarea_id uuid`.
- **Retorno:** `jsonb` `{ abierta, total_integrantes, necesarios, emitidos, aceptar, rechazar, votaron: [{ usuario_id, nombre }], mi_voto: { voto, comentario, votado_en } | null }`. Con la votación **abierta**: conteo, votos necesarios y quién ya votó. **Cerrada**: solo el conteo final (`votaron` vacío; `total_integrantes` y `necesarios` nulos).
- **Reglas y validaciones:** lo consultan el líder y los integrantes; **nunca** devuelve el voto ni el comentario de otra persona (tampoco al líder); cada quien ve su propio voto.
- **Errores:** `NX005` · un invitado · «Los invitados no ven las propuestas.». `NX006` · no pertenece al equipo o la tarea no es del equipo.
- **Tablas que toca:** lectura `tareas`, `tarea_votos`, `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/votacion.ts` → `resumen()`; `GET /equipos/:equipoId/tareas/:tareaId` (campo `votacion`).
- **Pruebas:** `pruebas_procesos.sql` P14; `tareasEquipo.test.ts` «nadie ve el voto ajeno…».
- **Ejemplo de llamada:** `select proc_tarea_votacion($1, $2, $3)`
- **Historial:** 2026-11-16 · creación · `0003`.

### proc_tarea_votaciones
- **Migración:** `0003_votacion.sql`
- **Propósito:** resúmenes de votación de varias tareas del equipo en una sola llamada (para las listas).
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tareas uuid[]`.
- **Retorno:** `jsonb` objeto `{ "<tarea_id>": resumen }` con la forma de `proc_tarea_votacion`; solo incluye tareas del equipo con `origen = propuesta`.
- **Reglas y validaciones:** mismas reglas de visibilidad (V-8); a un invitado le devuelve `{}`.
- **Errores:** `NX006` · no pertenece al equipo.
- **Tablas que toca:** lectura `tareas`, `tarea_votos`, `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/votacion.ts` → `resumenes()`; `GET /equipos/:equipoId/tareas?vista=votacion|mias`.
- **Pruebas:** `tareasEquipo.test.ts` «nadie ve el voto ajeno…» (lista `vista=votacion`).
- **Ejemplo de llamada:** `select proc_tarea_votaciones($1, $2, $3::uuid[])`
- **Historial:** 2026-11-16 · creación · `0003`.
