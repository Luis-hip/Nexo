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
| `NX002` | El líder saliente no vota (elección) | «El líder saliente no participa en la votación.» | `0001` (disparador), `0010` (`proc_eleccion_votar`) |
| `NX003` | Límite de votos de retrospectiva (3 por persona) | «Ya usaste tus 3 votos en esta retrospectiva.» | `0001` (disparador), `0009` (`proc_retro_votar`) |
| `NX004` | Voto de propuesta no permitido (vota el líder o un invitado, o la tarea no está en votación) | «Solo los integrantes votan las propuestas; el líder propone.» | `0003` |
| `NX005` | El actor no tiene permiso para la operación (no es el líder, invitado caducado…) | El mensaje del proceso, en español | `0003` |
| `NX006` | No encontrado: el equipo o la tarea no existen **para ese actor** (DEC-014, DEC-018) | «No encontramos ese equipo.» / «No encontramos esa tarea.» | `0003` |
| `NX007` | El estado no admite la operación (votación cerrada, propuesta que no se puede retirar o reformular) | El mensaje del proceso | `0003` |
| `NX008` | Conflicto de versión (concurrencia optimista) | «Alguien cambió esta tarea. Recárgala para ver la versión más reciente.» | `0003` |
| `NX009` | Equipo archivado (solo lectura) | «El equipo está archivado: solo lectura.» | `0003` |
| `NX010` | Datos inválidos que solo la BD puede comprobar (responsable que no es miembro…) | El mensaje del proceso | `0003` |
| `NX011` | Ya no disponible: invitación caducada, usada o revocada | «Esta invitación caducó. Pide una nueva al líder del equipo.» y variantes | `0005` |
| `NX012` | Conflicto que no es de versión: ya es miembro, o el tablero cambió mientras se movía una tarjeta | El mensaje del proceso | `0005` |

**Forma de un error de proceso.** `SQLSTATE` (la clase del error) + `MESSAGE` (texto en español para el usuario) + `HINT` (código de la API, p. ej. `tarea_no_encontrada`) + `DETAIL` opcional en JSON (p. ej. `{"version_actual": 5}`). La API los traduce en un solo lugar (`repositorios/procesos.ts`): `NX002`/`NX004`/`NX005`/`NX009` → 403, `NX006` → 404, `NX007` → 422, `NX001`/`NX003`/`NX008`/`NX012` → 409, `NX010` → 400, `NX011` → 410. Para `NX001` (equipo lleno) la API arma el mensaje con `mensajeEquipoLleno()` de `packages/shared` a partir de `max_miembros`, que viaja en el detalle. Los códigos nuevos se agregan aquí al crearlos.

## 4. Índice de procesos

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_tarea_proponer` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_votar` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_retirar` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_reformular` | Tareas · votación | `0003_votacion.sql` | Vigente |
| `proc_tarea_votacion` | Tareas · votación (lectura) | `0003_votacion.sql` | Vigente |
| `proc_tarea_votaciones` | Tareas · votación (lectura) | `0003_votacion.sql` | Vigente |
| `proc_sesion_resolver` | Cuenta · sesiones (lectura) | `0004_procesos_cuenta.sql` | Vigente |
| `proc_sesion_revocar` | Cuenta · sesiones | `0004_procesos_cuenta.sql` | Vigente |
| `proc_dev_usuarios` | Desarrollo (lectura) | `0004_procesos_cuenta.sql` | Vigente |
| `proc_dev_sesion_crear` | Desarrollo | `0004_procesos_cuenta.sql` | Vigente |
| `proc_usuario_yo` | Cuenta | `0004_procesos_cuenta.sql` | Vigente |
| `proc_usuario_preferencias_guardar` | Cuenta | `0004_procesos_cuenta.sql` | Vigente |
| `proc_usuario_perfil_guardar` | Cuenta | `0004_procesos_cuenta.sql` | Vigente |
| `proc_contacto_enviar` | Contacto | `0004_procesos_cuenta.sql` | Vigente |
| `proc_equipo_contexto` | Equipos (lectura) | `0005_procesos_equipos.sql` | Vigente |
| `proc_equipo_crear` | Equipos | `0005_procesos_equipos.sql` | Vigente |
| `proc_equipo_obtener` | Equipos (lectura) | `0005_procesos_equipos.sql` | Vigente |
| `proc_equipo_miembros` | Equipos (lectura) | `0005_procesos_equipos.sql` | Vigente |
| `proc_invitacion_crear` | Invitaciones | `0005_procesos_equipos.sql` | Vigente |
| `proc_invitacion_listar` | Invitaciones (lectura) | `0005_procesos_equipos.sql` | Vigente |
| `proc_invitacion_revocar` | Invitaciones | `0005_procesos_equipos.sql` | Vigente |
| `proc_invitacion_ver` | Invitaciones (lectura) | `0005_procesos_equipos.sql` | Vigente |
| `proc_invitacion_aceptar` | Invitaciones | `0005_procesos_equipos.sql` | Vigente |
| `proc_tarea_listar` | Tareas de equipo (lectura) | `0006_procesos_tareas_equipo.sql` (cambia en `0009`) | Vigente |
| `proc_tarea_conteos` | Tareas de equipo (lectura) | `0006_procesos_tareas_equipo.sql` (cambia en `0009`) | Vigente |
| `proc_tarea_obtener` | Tareas de equipo (lectura) | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_editar` | Tareas de equipo | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_eliminar` | Tareas de equipo | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_cambiar_estado` | Tareas de equipo · estados | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_mover` | Tareas de equipo · tablero | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_asignar` | Tareas de equipo · asignación | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_responder_asignacion` | Tareas de equipo · asignación | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_tarea_compartir` | Tareas de equipo | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_subtarea_crear` | Tareas de equipo · subtareas | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_subtarea_actualizar` | Tareas de equipo · subtareas | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_subtarea_eliminar` | Tareas de equipo · subtareas | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_comentario_crear` | Tareas de equipo · comentarios | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_comentario_eliminar` | Tareas de equipo · comentarios | `0006_procesos_tareas_equipo.sql` | Vigente |
| `proc_personal_tarea_listar` | Espacio personal (lectura) | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_tarea_obtener` | Espacio personal (lectura) | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_tarea_crear` | Espacio personal | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_tarea_actualizar` | Espacio personal | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_tarea_eliminar` | Espacio personal | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_subtarea_crear` | Espacio personal · subtareas | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_subtarea_actualizar` | Espacio personal · subtareas | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_subtarea_eliminar` | Espacio personal · subtareas | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_comentario_crear` | Espacio personal · comentarios | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_comentario_eliminar` | Espacio personal · comentarios | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_personal_etiquetas` | Espacio personal (lectura) | `0007_procesos_tareas_personales.sql` | Vigente |
| `proc_sprint_listar` | Sprints (lectura) | `0009_procesos_sprints.sql` | Vigente |
| `proc_sprint_obtener` | Sprints (lectura) | `0009_procesos_sprints.sql` | Vigente |
| `proc_sprint_disponibles` | Sprints (lectura) | `0009_procesos_sprints.sql` | Vigente |
| `proc_sprint_planear` | Sprints | `0009_procesos_sprints.sql` | Vigente |
| `proc_sprint_iniciar` | Sprints | `0009_procesos_sprints.sql` | Vigente |
| `proc_sprint_cerrar` | Sprints | `0009_procesos_sprints.sql` | Vigente |
| `proc_sprint_eliminar` | Sprints | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_iniciar` | Retrospectiva | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_obtener` | Retrospectiva (lectura) | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_nota_agregar` | Retrospectiva | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_nota_eliminar` | Retrospectiva | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_votar` | Retrospectiva | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_avanzar` | Retrospectiva | `0009_procesos_sprints.sql` | Vigente |
| `proc_retro_nota_a_tarea` | Retrospectiva | `0009_procesos_sprints.sql` | Vigente |
| `proc_liderazgo_obtener` | Liderazgo (lectura) | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_liderazgo_transferir` | Liderazgo | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_liderazgo_responder` | Liderazgo | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_liderazgo_cancelar` | Liderazgo | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_eleccion_convocar` | Liderazgo · elección | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_eleccion_votar` | Liderazgo · elección | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_eleccion_vencidas` | Liderazgo · elección (tarea programada) | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_equipo_salir` | Equipos · membresías | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_equipo_expulsar` | Equipos · membresías | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_invitado_gestionar` | Equipos · membresías | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_equipo_configuracion` | Equipos (lectura) | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_equipo_configurar` | Equipos | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_equipo_archivar` | Equipos | `0010_procesos_liderazgo.sql` | Vigente |
| `proc_calendario_equipo` | Calendario (lectura) | `0011_procesos_vistas.sql` | Vigente |
| `proc_reunion_crear` | Calendario | `0011_procesos_vistas.sql` | Vigente |
| `proc_reunion_editar` | Calendario | `0011_procesos_vistas.sql` | Vigente |
| `proc_reunion_cancelar` | Calendario | `0011_procesos_vistas.sql` | Vigente |
| `proc_reunion_responder` | Calendario | `0011_procesos_vistas.sql` | Vigente |
| `proc_actividad_listar` | Actividad (lectura) | `0011_procesos_vistas.sql` | Vigente |
| `proc_notificacion_listar` | Notificaciones (lectura) | `0011_procesos_vistas.sql` | Vigente |
| `proc_notificacion_marcar` | Notificaciones | `0011_procesos_vistas.sql` | Vigente |
| `proc_reporte_equipo` | Reportes (lectura) | `0011_procesos_vistas.sql` | Vigente |
| `proc_reporte_exportar` | Reportes (lectura) | `0011_procesos_vistas.sql` | Vigente |
| `proc_plantilla_listar` | Plantillas (lectura) | `0011_procesos_vistas.sql` | Vigente |
| `proc_plantilla_crear` | Plantillas | `0011_procesos_vistas.sql` | Vigente |
| `proc_plantilla_eliminar` | Plantillas | `0011_procesos_vistas.sql` | Vigente |
| `proc_plantilla_usar` | Plantillas | `0011_procesos_vistas.sql` | Vigente |
| `proc_archivo_listar` | Archivos (lectura) | `0012_archivos.sql` | Vigente |
| `proc_archivo_subir` | Archivos | `0012_archivos.sql` | Vigente |
| `proc_archivo_descargar` | Archivos (lectura) | `0012_archivos.sql` | Vigente |
| `proc_archivo_eliminar` | Archivos | `0012_archivos.sql` | Vigente |
| `proc_usuario_ajustes` | Cuenta · ajustes (lectura) | `0013_procesos_ajustes.sql` | Vigente |
| `proc_usuario_ajustes_guardar` | Cuenta · ajustes | `0013_procesos_ajustes.sql` | Vigente |
| `proc_reporte_personal` | Espacio personal (lectura) | `0013_procesos_ajustes.sql` | Vigente |

**Auxiliares (`fn_*`, no las llama la aplicación)** creadas en `0003`: índice fraccionario (`fn_orden_entre`, `fn_orden_al_final` y sus partes), `fn_votacion_resultado`, `fn_votacion_resumen`, `fn_integrantes_activos`, `fn_registrar_evento`, `fn_membresia_actor`, `fn_exigir_lider`, `fn_exigir_equipo_activo`, `fn_exigir_responsable`, `fn_exigir_version`, `fn_bloquear_tarea`, `fn_fijar_etiquetas`, `fn_tarea_insertar_propuesta`, y los disparadores `fn_voto_propuesta_valido` y `fn_membresia_descarta_votos`.

**Auxiliares de `0004` a `0007`:** `fn_iso` (fechas como `Date.toISOString()`), formas JSON (`fn_usuario_json`, `fn_preferencias_json`, `fn_miembros_json`, `fn_invitacion_json`, `fn_persona_json`, `fn_tarea_equipo_json`, `fn_tarea_equipo_detalle`, `fn_comentario_equipo_json`, `fn_tarea_personal_json`, `fn_tarea_personal_detalle`, `fn_comentario_personal_json`), invitaciones (`fn_codigo_invitacion`, `fn_invitacion_vigente`), tareas (`fn_exigir_tarea_visible`, `fn_bloquear_tarea_visible`, `fn_columna_ordenar`, `fn_transicion_permitida`, `fn_exigir_trabajo_en_tarea`, `fn_tarea_aplicar_estado`, `fn_exigir_gestion_subtareas`, `fn_nombre_estado`), espacio personal (`fn_tarea_propia`, `fn_fijar_etiquetas_personales`, `fn_actividad_personal`) y la tabla `transiciones_estado` (copia de `estados.ts`). La `0008` agrega `fn_conceder_procesos`.

**Auxiliares de `0009` (sprints y retrospectiva):** permisos (`fn_exigir_ve_sprints`, `fn_exigir_gestion_sprints`, que además bloquea la fila del equipo, y `fn_exigir_moderar_retro`), fechas (`fn_hoy_equipo`, «hoy» en la zona horaria del equipo), sprints (`fn_sprint_bloquear`, `fn_sprint_conteo`, `fn_sprint_instantanea`, `fn_sprint_json`, `fn_sprint_serie`, `fn_sprint_capacidad_json`, `fn_sprint_detalle`, `fn_estado_planeable`, `fn_tarea_de_sprint_cerrado`) y retrospectiva (`fn_retro_asegurar`, `fn_retro_detalle`, `fn_retro_nota_bloquear`). La `0009` también cambia `fn_registrar_evento`: los eventos `sprint.*` quedan en `actividad` con tipo `sprint` (antes, todo lo que no era tarea era `equipo`).

**Auxiliares de `0010` (liderazgo y equipo):** avisos (`fn_notificar`, `fn_notificar_equipo`, `fn_enlace_liderazgo`), membresías (`fn_membresia_bloquear`, `fn_miembro_retirado`, `fn_votaciones_reevaluar`: recuenta las propuestas abiertas cuando cambian los integrantes, misma regla que `proc_tarea_votar`), cambio de líder (`fn_cambiar_lider`) y elección (`fn_eleccion_finalistas`, `fn_eleccion_votantes`, `fn_eleccion_resolver`, `fn_eleccion_json`, `fn_transferencia_json`, `fn_liderazgo_json`).

**Auxiliares de `0011` y `0012` (vistas y archivos):** `fn_exigir_no_invitado`, reuniones (`fn_reunion_ocurrencias`, que expande las repeticiones; `fn_reunion_json`, `fn_reunion_editable`), `fn_plantilla_json`, archivos (`fn_archivo_tipo`, la lista de tipos permitidos; `fn_archivo_json`) y la tabla `archivo_contenidos` (0012). La `0011` cambia otra vez `fn_registrar_evento`: los eventos `reunion.*` quedan en `actividad` con tipo `reunion`.

**Auxiliares de `0013` (ajustes):** `fn_eventos_notificacion` (los avisos configurables) y `fn_ajustes_json`.

## 4b. Roles de la BD

| Rol | Para qué | Permisos |
|---|---|---|
| `nexo_migraciones` | Dueño del esquema. Es el rol con el que se **ejecutan las migraciones** (`DATABASE_URL_MIGRACIONES`; solo CI y despliegue) | Todo sobre el esquema. No lo crea ninguna migración: es quien las ejecuta. En local y en la CI ese papel lo hace el usuario de `DATABASE_URL` |
| `nexo_app` | La API en producción (`DATABASE_URL`) | **Solo `EXECUTE` sobre `proc_*`** (menos `proc_dev_*`). Sin permisos sobre tablas, vistas ni secuencias, y sin acceso a las auxiliares `fn_*` |

- La migración `0008_roles.sql` crea `nexo_app` **sin inicio de sesión y sin contraseña** (ningún secreto en el repositorio, `09`) y aplica los permisos con `fn_conceder_procesos()`. En el despliegue, una persona lo habilita: `ALTER ROLE nexo_app LOGIN PASSWORD '…'` (el valor va solo al panel del alojamiento).
- **Por qué funciona:** todos los procesos son `SECURITY DEFINER` con `SET search_path = public, pg_temp`: se ejecutan con los permisos del dueño, validan al actor (`p_actor_id`) y son la única puerta a los datos. Aunque alguien robe la conexión de la aplicación, no puede leer ni escribir tablas a mano.
- **Convención:** toda migración que cree o cambie procesos termina con `SELECT fn_conceder_procesos();` (es idempotente). La prueba `P52` falla si un `proc_*` quedó sin conceder o si `nexo_app` alcanza alguna tabla, y `P51` si un proceso no es `SECURITY DEFINER`.
- **Acceso de desarrollo:** `proc_dev_usuarios` y `proc_dev_sesion_crear` no se conceden a `nexo_app`. En local y en la CI la API se conecta con el dueño del esquema, por eso el *dev login* funciona ahí y no puede funcionar en producción.
- **Lo que sí queda en la API:** `repositorios/procesos.ts` (la llamada `select proc_x(…)`), la conexión (`db/conexion.ts`) y las pruebas, que preparan y comprueban datos con SQL directo como dueño. Una regla de ESLint impide importar `kysely` o escribir consultas en el resto de `apps/api/src`.

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

### proc_sesion_resolver
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Resuelve la sesión de una petición a partir del hash del token de la cookie.
- **Parámetros:** `p_token_hash bytea` · SHA-256 del token opaco. **No recibe `p_actor_id`**: es lo que averigua quién es el actor.
- **Retorno:** `jsonb` `{ sesion_id, usuario: { id, correo, nombre, cargo, descripcion, zona_horaria, avatar_url } }`, o `NULL` si no hay sesión vigente.
- **Reglas y validaciones:** la sesión no debe estar revocada ni vencida y la cuenta no debe estar eliminada; nunca devuelve el hash de la contraseña.
- **Errores:** ninguno: una sesión inválida devuelve `NULL` y la API responde 401.
- **Tablas que toca:** lectura `sesiones`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/cuenta.ts` → `resolverSesion()`; se llama en cada petición (`autenticacion.ts`).
- **Pruebas:** `pruebas_procesos.sql` P16; `app.test.ts` y `yo.test.ts` (sesiones).
- **Ejemplo de llamada:** `select proc_sesion_resolver($1)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_sesion_revocar
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Cierra una sesión del actor.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_sesion_id uuid` · sesión a cerrar.
- **Retorno:** `jsonb` `{ revocada: boolean }`.
- **Reglas y validaciones:** solo revoca una sesión **del propio actor** que siga vigente; la de otra persona no se toca (`revocada: false`).
- **Errores:** ninguno.
- **Tablas que toca:** escritura `sesiones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/cuenta.ts` → `revocarSesion()`; `POST /salir`.
- **Pruebas:** `pruebas_procesos.sql` P17; `yo.test.ts`.
- **Ejemplo de llamada:** `select proc_sesion_revocar($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_dev_usuarios
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Lista los usuarios de la semilla para el selector del acceso de desarrollo.
- **Parámetros:** ninguno.
- **Retorno:** `jsonb` arreglo de `{ id, correo, nombre, cargo }`, por nombre.
- **Reglas y validaciones:** solo existe para el acceso de desarrollo (`DEV_LOGIN_ENABLED=true`). **No se concede al rol `nexo_app`**: en producción la API no puede ejecutarlo.
- **Errores:** `42501` · lo ejecuta `nexo_app`.
- **Tablas que toca:** lectura `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/cuenta.ts` → `usuariosDev()`; `GET /dev/usuarios`.
- **Pruebas:** `pruebas_procesos.sql` P18, P52; `app.test.ts`.
- **Ejemplo de llamada:** `select proc_dev_usuarios()`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_dev_sesion_crear
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Crea una sesión real para un usuario de la semilla, sin contraseña (solo desarrollo y CI).
- **Parámetros:** `p_correo text`. `p_token_hash bytea` · hash del token. `p_ip text`. `p_expira_en timestamptz`.
- **Retorno:** `jsonb` `{ usuario: { id, correo, nombre } }`.
- **Reglas y validaciones:** guarda solo el **hash** del token; la sesión se marca con `dispositivo = dev-login`. **No se concede a `nexo_app`**.
- **Errores:** `NX006` · no existe un usuario con ese correo (404, `usuario_no_encontrado`). `42501` · lo ejecuta `nexo_app`.
- **Tablas que toca:** lectura `usuarios`; escritura `sesiones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/cuenta.ts` → `crearSesionDev()`; `POST /dev/login`.
- **Pruebas:** `pruebas_procesos.sql` P18; `app.test.ts`.
- **Ejemplo de llamada:** `select proc_dev_sesion_crear($1, $2, $3, $4)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_usuario_yo
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Equipos activos de la persona (con su perfil en cada uno) y sus preferencias.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta.
- **Retorno:** `jsonb` `{ equipos: [{ id, nombre, rol, color_idx, caduca_en }], preferencias: {…} }`.
- **Reglas y validaciones:** solo membresías activas en equipos activos; si la persona aún no tiene fila de preferencias, la crea con los valores por defecto.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `membresias`, `equipos`; lectura y escritura `preferencias_usuario`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/cuenta.ts` → `yo()`; `GET /yo`.
- **Pruebas:** `pruebas_procesos.sql` P19; `yo.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_yo($1)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_usuario_preferencias_guardar
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Guarda cualquier subconjunto de las preferencias propias.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_cambios jsonb` · subconjunto de `{ tema, densidad, tamano_texto, reducir_movimiento, formato_hora, formato_fecha, tour_visto, idioma, resumen_diario }`.
- **Retorno:** `jsonb` con las nueve preferencias como quedaron.
- **Reglas y validaciones:** solo cambia lo que viene en `p_cambios`; cada quien solo toca las suyas.
- **Errores:** `22P02` / `23514` · valor fuera del catálogo (lo evita la validación Zod de la API).
- **Tablas que toca:** lectura y escritura `preferencias_usuario`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/cuenta.ts` → `guardarPreferencias()`; `PATCH /yo/preferencias`.
- **Pruebas:** `pruebas_procesos.sql` P20; `yo.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_preferencias_guardar($1, '{"tema":"oscuro"}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_usuario_perfil_guardar
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Actualiza el perfil propio.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_cambios jsonb` · subconjunto de `{ nombre, cargo, descripcion, zona_horaria }`.
- **Retorno:** `jsonb` con el usuario de la sesión (`UsuarioSesion`).
- **Reglas y validaciones:** solo el perfil del actor; exige al menos un cambio.
- **Errores:** `NX010` · sin cambios (400, `validacion`). `NX006` · la cuenta no existe o está eliminada. `23514` · nombre fuera de 2 a 80 caracteres.
- **Tablas que toca:** escritura `usuarios`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/cuenta.ts` → `guardarPerfil()`; `PATCH /yo/perfil`.
- **Pruebas:** `pruebas_procesos.sql` P21; `yo.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_perfil_guardar($1, '{"cargo":"QA"}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_contacto_enviar
- **Migración:** `0004_procesos_cuenta.sql`
- **Propósito:** Guarda un mensaje del formulario público de contacto.
- **Parámetros:** `p_nombre text`. `p_correo text`. `p_asunto text`. `p_mensaje text`. **No hay actor**: la ruta no tiene sesión.
- **Retorno:** `jsonb` `{ recibido: true }`.
- **Reglas y validaciones:** el mensaje mide de 10 a 4000 caracteres (lo exige la tabla); la ruta lleva límite de peticiones.
- **Errores:** `23514` · mensaje demasiado corto o largo (lo evita la validación Zod).
- **Tablas que toca:** escritura `contacto_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/cuenta.ts` → `enviarContacto()`; `POST /contacto`.
- **Pruebas:** `pruebas_procesos.sql` P22, P52; `contacto.test.ts`.
- **Ejemplo de llamada:** `select proc_contacto_enviar($1, $2, $3, $4)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0004`.

### proc_equipo_contexto
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Comprueba que el actor es miembro activo del equipo de la ruta y devuelve su perfil.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `{ membresia_id, rol, equipo: { nombre, estado, max_miembros } }`.
- **Reglas y validaciones:** quien no pertenece recibe 404, igual que si el equipo no existiera (DEC-018); un invitado cuyo acceso caducó, 403.
- **Errores:** `NX006` · el actor no pertenece al equipo (404) (`equipo_no_encontrado`). `NX005` · invitado caducado (403, `acceso_caducado`).
- **Tablas que toca:** lectura `membresias`, `equipos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/equipos.ts` → `contexto()`; lo usa `contextoEquipo()` en todas las rutas `/equipos/:equipoId/*`.
- **Pruebas:** `pruebas_procesos.sql` P23; `equipos.test.ts` y `tareasEquipo.test.ts` (404 a quien no pertenece).
- **Ejemplo de llamada:** `select proc_equipo_contexto($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_equipo_crear
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Crea un equipo; quien lo crea queda como líder.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_datos jsonb` · `{ nombre, descripcion?, duracion_sprint_semanas?, max_miembros? }`.
- **Retorno:** `jsonb` `{ id }`.
- **Reglas y validaciones:** el creador es líder con el color 0; se crean los dos canales fijos (equipo e invitados); `max_miembros` de 1 a 8 (por defecto 8).
- **Errores:** `23514` · nombre fuera de 2 a 60 caracteres o `max_miembros` fuera de 1 a 8 (lo evita Zod).
- **Tablas que toca:** escritura `equipos`, `membresias`, `conversaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.creado` («Paola Reyes creó el equipo «…»»).
- **Lo llama:** `repositorios/equipos.ts` → `crear()`; `POST /equipos`.
- **Pruebas:** `pruebas_procesos.sql` P24; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_crear($1, '{"nombre":"Equipo nuevo"}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_equipo_obtener
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Datos del equipo según el perfil de quien consulta.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `EquipoDetalle`: `{ id, nombre, descripcion, estado, max_miembros, miembros_activos, invitados_activos, mi_rol, mi_membresia_id, lider, miembros[], sprints[], etiquetas[] }`.
- **Reglas y validaciones:** un **invitado** recibe `miembros`, `sprints` y `etiquetas` vacíos; los sprints cerrados no se incluyen.
- **Errores:** `NX006` · el actor no pertenece al equipo (404). `NX005` · invitado caducado.
- **Tablas que toca:** lectura `equipos`, `membresias`, `usuarios`, `sprints`, `etiquetas`, `v_equipo_cupo`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/equipos.ts` → `obtener()`; `GET /equipos/:equipoId`.
- **Pruebas:** `pruebas_procesos.sql` P25; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_obtener($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_equipo_miembros
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Miembros activos del equipo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` arreglo de `{ membresia_id, usuario_id, nombre, rol, color_idx, caduca_en }`: líder, integrantes (por color) e invitados.
- **Reglas y validaciones:** lo consultan el líder y los integrantes.
- **Errores:** `NX005` · un invitado (403). `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/equipos.ts` → `miembros()`; `GET /equipos/:equipoId/miembros`.
- **Pruebas:** `pruebas_procesos.sql` P26; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_miembros($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_invitacion_crear
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** El líder genera un código de invitación de un solo uso.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_datos jsonb` · `{ rol_destino: integrante|invitado, dias_validez?, duracion_invitado_dias? }`.
- **Retorno:** `jsonb` `Invitacion`: `{ id, codigo, rol_destino, estado, caduca_en, duracion_invitado_dias, creada_en, aceptada_por }`.
- **Reglas y validaciones:** solo el líder; equipo no archivado; el código tiene el formato `NX4-821Q` con un alfabeto sin 0/O ni 1/I/L (DEC-019) y es único; la duración del invitado solo aplica a invitados.
- **Errores:** `NX005` · no es el líder. `NX006` · el actor no pertenece al equipo (404). `NX009` · equipo archivado (403).
- **Tablas que toca:** lectura `membresias`, `equipos`, `usuarios`; escritura `invitaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `invitacion.creada`.
- **Lo llama:** `repositorios/equipos.ts` → `crearInvitacion()`; `POST /equipos/:equipoId/invitaciones`.
- **Pruebas:** `pruebas_procesos.sql` P27; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_invitacion_crear($1, $2, '{"rol_destino":"integrante","dias_validez":7}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_invitacion_listar
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Invitaciones del equipo, de la más reciente a la más antigua.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` arreglo de `Invitacion`.
- **Reglas y validaciones:** solo el líder; una pendiente cuyo plazo ya pasó se muestra como `caducada`.
- **Errores:** `NX005` · no es el líder. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `invitaciones`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/equipos.ts` → `listarInvitaciones()`; `GET /equipos/:equipoId/invitaciones`.
- **Pruebas:** `pruebas_procesos.sql` P28; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_invitacion_listar($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_invitacion_revocar
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** El líder revoca una invitación que sigue pendiente.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_invitacion_id uuid`.
- **Retorno:** `jsonb` `Invitacion` con `estado: revocada`.
- **Reglas y validaciones:** solo el líder; solo invitaciones pendientes de ese equipo.
- **Errores:** `NX006` · no hay una invitación pendiente con ese id (404, `invitacion_no_encontrada`). `NX005` · no es el líder.
- **Tablas que toca:** escritura `invitaciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/equipos.ts` → `revocarInvitacion()`; `POST /equipos/:equipoId/invitaciones/:invitacionId/revocar`.
- **Pruebas:** `pruebas_procesos.sql` P29; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_invitacion_revocar($1, $2, $3)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_invitacion_ver
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Vista previa de una invitación antes de unirse.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_codigo text` · código ya normalizado (la API acepta también el enlace completo).
- **Retorno:** `jsonb` `VistaInvitacion`: `{ codigo, equipo: { id, nombre, descripcion }, lider, miembros_activos, max_miembros, rol_destino, duracion_invitado_dias, caduca_en, ya_miembro }`.
- **Reglas y validaciones:** no exige pertenecer al equipo; solo sirve una invitación pendiente, vigente y de un equipo activo.
- **Errores:** `NX006` · no existe (404, `invitacion_no_existe`). `NX011` · caducada, usada o revocada (410, `invitacion_caducada` / `invitacion_usada` / `invitacion_revocada`).
- **Tablas que toca:** lectura `invitaciones`, `equipos`, `membresias`, `usuarios`, `v_equipo_cupo`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/equipos.ts` → `verInvitacion()`; `GET /invitaciones/:codigo`.
- **Pruebas:** `pruebas_procesos.sql` P30; `equipos.test.ts`.
- **Ejemplo de llamada:** `select proc_invitacion_ver($1, 'NX4-821Q')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

### proc_invitacion_aceptar
- **Migración:** `0005_procesos_equipos.sql`
- **Propósito:** Unirse a un equipo con un código de invitación.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_codigo text` · código ya normalizado.
- **Retorno:** `jsonb` `{ equipo_id, rol, whatsapp_activo }`.
- **Reglas y validaciones:** la invitación es de **un solo uso**: se marca `aceptada` en la misma transacción que crea la membresía; el integrante recibe el primer color libre y el invitado, una caducidad (7, 14 o 30 días); las altas del equipo se serializan con el mismo bloqueo que usa el disparador del tope; si el equipo está lleno, todo se deshace y la invitación sigue pendiente (DEC-019).
- **Errores:** `NX006` / `NX011` · invitación inexistente, caducada, usada o revocada. `NX012` · ya es miembro (409, `ya_miembro`, con `equipo_id` en el detalle). `NX001` · equipo lleno (409, `equipo_lleno`, con `max_miembros` en el detalle).
- **Tablas que toca:** lectura `equipos`; escritura `invitaciones`, `membresias`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `membresia.creada` («… se unió al equipo como integrante»).
- **Lo llama:** `repositorios/equipos.ts` → `aceptarInvitacion()`; `POST /invitaciones/:codigo/aceptar`.
- **Pruebas:** `pruebas_procesos.sql` P31, P234; `equipos.test.ts` (incluida la de dos personas a la vez al último lugar).
- **Ejemplo de llamada:** `select proc_invitacion_aceptar($1, 'NX4-821Q')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`. 2026-11-21 · con número de WhatsApp verificado y consentimiento general, la membresía nueva queda con `consentimiento_wa = true`; devuelve `whatsapp_activo` (docs/13, 1.1) · `0036_invitacion_whatsapp.sql`.

### proc_tarea_listar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Tareas del equipo según la vista.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_vista text` · `tablero` | `backlog` | `votacion` | `mias` | `todas`.
- **Retorno:** `jsonb` arreglo de `TareaEquipo`, por orden de columna (índice fraccionario) y código. En `votacion` y `mias` cada propuesta lleva `votacion` (resumen, V-8).
- **Reglas y validaciones:** no incluye archivadas; `tablero` = aceptada a completada, sin las tareas de sprints cerrados; `votacion` = propuestas abiertas y las que no prosperaron; `mias` = propuestas abiertas y las que el actor ya votó (FALT-08); un **invitado** solo recibe las compartidas con su membresía y no tiene `backlog`, `votacion` ni `mias`.
- **Errores:** `NX005` · invitado en una vista que no le corresponde. `NX010` · vista inválida. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `tareas`, `v_tareas_semaforo`, `tarea_compartida`, `tarea_votos`, `tarea_etiquetas`, `etiquetas`, `subtareas`, `comentarios_tarea`, `usuarios`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/tareasEquipo.ts` → `listar()`; `GET /equipos/:equipoId/tareas?vista=`.
- **Pruebas:** `pruebas_procesos.sql` P32 y P61; `tareasEquipo.test.ts` «ver tareas».
- **Ejemplo de llamada:** `select proc_tarea_listar($1, $2, 'tablero')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`. 2026-11-17 · `tablero` ya no incluye las tareas de un sprint cerrado (siguen en `todas` y en el detalle del sprint) · `0009`.

### proc_tarea_conteos
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Conteos para las pestañas de tareas.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `{ tablero, backlog, votacion }` (`votacion` = propuestas abiertas).
- **Reglas y validaciones:** no cuenta archivadas; los invitados no lo consultan.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `tareas`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/tareasEquipo.ts` → `conteos()`; `GET /equipos/:equipoId/tareas/conteos`.
- **Pruebas:** `pruebas_procesos.sql` P33 y P61; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_tarea_conteos($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`. 2026-11-17 · `tablero` ya no cuenta las tareas de un sprint cerrado · `0009`.

### proc_tarea_obtener
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Detalle de una tarea del equipo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea.
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API). Incluye `subtareas[]`, `comentarios[]`, `historial[]` (últimos 50), `compartida_con[]` y `votacion`.
- **Reglas y validaciones:** un invitado solo alcanza las tareas compartidas con él y no recibe historial ni votación; `compartida_con` solo lo ve el líder; `votacion` solo existe en las propuestas (origen `propuesta`).
- **Errores:** `NX006` · la tarea no es del equipo o el actor no la alcanza (404). `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `tareas`, `v_tareas_semaforo`, `subtareas`, `comentarios_tarea`, `actividad`, `tarea_compartida`, `tarea_votos`, `usuarios`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/tareasEquipo.ts` → `obtener()`; `GET /equipos/:equipoId/tareas/:tareaId`.
- **Pruebas:** `pruebas_procesos.sql` P34; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_tarea_obtener($1, $2, $3)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_editar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Edita los datos de una tarea.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_version int` · versión que tenía el cliente. `p_cambios jsonb` · solo lo que cambia de `{ titulo, descripcion, prioridad, vence_en (admite null), progreso, archivada, etiquetas[] }`.
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API).
- **Reglas y validaciones:** el **líder** edita cualquier tarea; un **integrante** solo actualiza el `progreso` de **su** tarea, con la asignación ya aceptada; el permiso se comprueba antes que la versión; una tarea completada tiene el 100 %; siempre sube `version`; las etiquetas nuevas se crean en el equipo.
- **Errores:** `NX005` · no puede editarla (403). `NX008` · versión vieja (409). `NX010` · avance distinto de 100 en una completada (400). `NX006` · la tarea no es del equipo o el actor no la alcanza (404). `NX009` · equipo archivado (403).
- **Tablas que toca:** lectura `membresias`, `equipos`; escritura `tareas`, `etiquetas`, `tarea_etiquetas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.progreso` (solo avance) o `tarea.editada`.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `editar()`; `PATCH /equipos/:equipoId/tareas/:tareaId`.
- **Pruebas:** `pruebas_procesos.sql` P35; `tareasEquipo.test.ts` «editar…».
- **Ejemplo de llamada:** `select proc_tarea_editar($1, $2, $3, 4, '{"titulo":"Nuevo título"}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_eliminar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** El líder elimina una tarea.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea.
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** solo el líder; se borran en cascada sus subtareas, comentarios, etiquetas y votos.
- **Errores:** `NX005` · no es el líder. `NX006` · la tarea no es del equipo o el actor no la alcanza (404). `NX009` · equipo archivado (403).
- **Tablas que toca:** escritura `tareas` (y en cascada), `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.eliminada`.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `eliminar()`; `DELETE /equipos/:equipoId/tareas/:tareaId`.
- **Pruebas:** `pruebas_procesos.sql` P36; `tareasEquipo.test.ts` «solo el líder elimina».
- **Ejemplo de llamada:** `select proc_tarea_eliminar($1, $2, $3)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_cambiar_estado
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Cambia el estado de una tarea según la máquina de estados.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_version int`. `p_estado text` · destino. `p_motivo text` · obligatorio para `atascada`.
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API).
- **Reglas y validaciones:** solo el líder o el responsable (con la asignación aceptada); la transición debe existir en `transiciones_estado` (copia de `estados.ts`); orden de las comprobaciones: permiso → versión → transición; la tarea queda al final de su nueva columna; al **completar**: avance 100, fecha de cierre, resultado (`a_tiempo` o `con_retraso`) y subtareas hechas; al **reabrir** (solo el líder): se limpian y el avance baja a 90 como máximo; al pasar a `en_curso` con avance 0 sube a 5; al `backlog` sale del sprint y del backlog a `aceptada` entra al sprint activo.
- **Errores:** `NX005` · no es el líder ni el responsable (403). `NX008` · versión vieja (409). `NX007` · transición no permitida (422). `NX010` · atascar sin motivo (400). `NX006` · la tarea no es del equipo o el actor no la alcanza (404). `NX009` · equipo archivado (403). *La API comprueba antes lo mismo con `packages/shared` para dar el motivo exacto en español.*
- **Tablas que toca:** lectura `transiciones_estado`, `sprints`, `membresias`; escritura `tareas`, `subtareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.completada` o `tarea.estado_cambiado` (con `de`, `a`, motivo y resultado).
- **Lo llama:** `repositorios/tareasEquipo.ts` → `cambiarEstado()`; `POST /equipos/:equipoId/tareas/:tareaId/estado`.
- **Pruebas:** `pruebas_procesos.sql` P37; `tareasEquipo.test.ts` «máquina de estados en el servidor» y la comparación de `transiciones_estado` con `estados.ts`.
- **Ejemplo de llamada:** `select proc_tarea_cambiar_estado($1, $2, $3, 4, 'en_curso', null)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_mover
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Arrastrar y soltar: mueve la tarea entre dos vecinas y, si cambia de columna, de estado.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_version int`. `p_antes_id uuid` · la que queda arriba (o null). `p_despues_id uuid` · la que queda abajo (o null). `p_estado text` · columna de destino si cambia. `p_motivo text`.
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API).
- **Reglas y validaciones:** calcula el nuevo `orden` con el índice fraccionario (`fn_orden_entre`); bloquea la columna y, si hay claves repetidas, las reparte antes (DEC-021); sin vecinas va al final; con una sola, junto a ella; si cambia de columna aplica las reglas de `proc_tarea_cambiar_estado`; **solo el líder reordena** dentro de una columna.
- **Errores:** `NX005` · no puede moverla o reordenar (403). `NX008` · versión vieja (409). `NX007` · transición no permitida (422). `NX010` · atascar sin motivo. `NX012` · las vecinas ya no están en esa columna (409, `conflicto_orden`). `NX006` · la tarea no es del equipo o el actor no la alcanza (404).
- **Tablas que toca:** lectura `transiciones_estado`, `sprints`; escritura `tareas`, `subtareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** los de `proc_tarea_cambiar_estado` si cambia de columna; ninguno si solo reordena.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `mover()`; `POST /equipos/:equipoId/tareas/:tareaId/mover`.
- **Pruebas:** `pruebas_procesos.sql` P38; `tareasEquipo.test.ts` «mover tarjetas» (incluida la de dos personas a la vez: 200 y 409).
- **Ejemplo de llamada:** `select proc_tarea_mover($1, $2, $3, 4, $5, $6, null, null)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_asignar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** El líder asigna o quita al responsable.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_version int`. `p_responsable_id uuid` · o null para dejarla sin responsable.
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API).
- **Reglas y validaciones:** solo el líder; el responsable debe ser líder o integrante activo; queda con la asignación pendiente salvo que sea el propio líder; **no** se asigna una propuesta en votación, rechazada, retirada ni una tarea completada (V-11).
- **Errores:** `NX005` · no es el líder. `NX008` · versión vieja. `NX007` · el estado no admite asignar (422). `NX010` · el responsable no es miembro (400, `responsable_invalido`). `NX006` · la tarea no es del equipo o el actor no la alcanza (404).
- **Tablas que toca:** lectura `membresias`, `usuarios`; escritura `tareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.asignada` o `tarea.desasignada`.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `asignar()`; `POST /equipos/:equipoId/tareas/:tareaId/asignar`.
- **Pruebas:** `pruebas_procesos.sql` P39; `tareasEquipo.test.ts` «asignar y responder».
- **Ejemplo de llamada:** `select proc_tarea_asignar($1, $2, $3, 4, $5)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_responder_asignacion
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** El responsable acepta o rechaza la asignación.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_acepta boolean`. `p_motivo text` · obligatorio al rechazar.
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API).
- **Reglas y validaciones:** solo responde quien tiene la asignación pendiente; al **rechazar**, la tarea conserva su estado y queda sin responsable para que el líder la reasigne directamente, sin nueva votación (V-11).
- **Errores:** `NX007` · no tiene una asignación pendiente (422, `sin_asignacion_pendiente`). `NX010` · rechazo sin motivo. `NX006` · la tarea no es del equipo o el actor no la alcanza (404).
- **Tablas que toca:** escritura `tareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.asignacion_aceptada` o `tarea.asignacion_rechazada` (con el motivo).
- **Lo llama:** `repositorios/tareasEquipo.ts` → `responderAsignacion()`; `POST /equipos/:equipoId/tareas/:tareaId/asignacion`.
- **Pruebas:** `pruebas_procesos.sql` P40; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_tarea_responder_asignacion($1, $2, $3, false, 'Estoy saturado')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_tarea_compartir
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** El líder elige qué invitados ven la tarea.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_membresias uuid[]` · membresías de invitados (sustituye la lista anterior).
- **Retorno:** `jsonb` con el detalle de la tarea (`TareaEquipoDetalle` sin `transiciones`, que calcula la API).
- **Reglas y validaciones:** solo el líder; todas deben ser membresías **activas de invitados de este equipo**; una lista vacía deja de compartirla.
- **Errores:** `NX005` · no es el líder. `NX010` · alguna no es un invitado activo del equipo (400). `NX006` · la tarea no es del equipo o el actor no la alcanza (404).
- **Tablas que toca:** lectura `membresias`; escritura `tarea_compartida`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.compartida` (con el número de invitados).
- **Lo llama:** `repositorios/tareasEquipo.ts` → `compartir()`; `PUT /equipos/:equipoId/tareas/:tareaId/compartida`.
- **Pruebas:** `pruebas_procesos.sql` P41, P32; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_tarea_compartir($1, $2, $3, $4::uuid[])`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_subtarea_crear
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Agrega una subtarea a una tarea del equipo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_titulo text`.
- **Retorno:** `jsonb` `{ id, titulo, hecha }`.
- **Reglas y validaciones:** las subtareas las gestiona el líder o el responsable de la tarea.
- **Errores:** `NX005` · no es el líder ni el responsable (403). `NX006` · la tarea no es del equipo o el actor no la alcanza (404). `NX009` · equipo archivado (403).
- **Tablas que toca:** escritura `subtareas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `crearSubtarea()`; `POST …/tareas/:tareaId/subtareas`.
- **Pruebas:** `pruebas_procesos.sql` P42; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_subtarea_crear($1, $2, $3, 'Paso 1')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_subtarea_actualizar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Cambia el título de una subtarea o la marca como hecha.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_subtarea_id uuid`. `p_cambios jsonb` · `{ titulo?, hecha? }`.
- **Retorno:** `jsonb` `{ id, titulo, hecha }`.
- **Reglas y validaciones:** el líder o el responsable de la tarea; la subtarea debe ser de esa tarea.
- **Errores:** `NX005` · sin permiso. `NX006` · la subtarea no existe en esa tarea (404, `subtarea_no_encontrada`).
- **Tablas que toca:** escritura `subtareas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `actualizarSubtarea()`; `PATCH …/subtareas/:subId`.
- **Pruebas:** `pruebas_procesos.sql` P42; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_subtarea_actualizar($1, $2, $3, $4, '{"hecha":true}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_subtarea_eliminar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Elimina una subtarea.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_subtarea_id uuid`.
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** el líder o el responsable de la tarea.
- **Errores:** `NX005` · sin permiso. `NX006` · la subtarea no existe en esa tarea.
- **Tablas que toca:** escritura `subtareas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `eliminarSubtarea()`; `DELETE …/subtareas/:subId`.
- **Pruebas:** `pruebas_procesos.sql` P42.
- **Ejemplo de llamada:** `select proc_subtarea_eliminar($1, $2, $3, $4)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_comentario_crear
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Comenta en una tarea del equipo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_texto text`.
- **Retorno:** `jsonb` `{ id, texto, autor: { usuario_id, nombre, color_idx }, creado_en, editado_en }`.
- **Reglas y validaciones:** comentan el líder, los integrantes y los invitados **con la tarea compartida**.
- **Errores:** `NX006` · la tarea no es del equipo o el actor no la alcanza (404) (un invitado sin la tarea compartida). `NX009` · equipo archivado (403).
- **Tablas que toca:** escritura `comentarios_tarea`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.comentada`.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `comentar()`; `POST …/tareas/:tareaId/comentarios`.
- **Pruebas:** `pruebas_procesos.sql` P43; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_comentario_crear($1, $2, $3, 'Un comentario')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_comentario_eliminar
- **Migración:** `0006_procesos_tareas_equipo.sql`
- **Propósito:** Elimina un comentario de una tarea del equipo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · tarea. `p_comentario_id uuid`.
- **Retorno:** `jsonb` `{ eliminado: true }`.
- **Reglas y validaciones:** cada quien borra sus comentarios; el líder, además, los ajenos.
- **Errores:** `NX006` · el comentario no existe o no es suyo (404, `comentario_no_encontrado`).
- **Tablas que toca:** escritura `comentarios_tarea`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasEquipo.ts` → `eliminarComentario()`; `DELETE …/comentarios/:comentarioId`.
- **Pruebas:** `pruebas_procesos.sql` P43; `tareasEquipo.test.ts`.
- **Ejemplo de llamada:** `select proc_comentario_eliminar($1, $2, $3, $4)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0006`.

### proc_personal_tarea_listar
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Tareas personales del actor, con filtros.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_filtros jsonb` · `{ estado?: [], prioridad?: [], etiqueta?, q?, archivadas }`.
- **Retorno:** `jsonb` arreglo de `TareaPersonal`, por fecha de entrega (las que no tienen, al final) y código.
- **Reglas y validaciones:** solo las del actor (`dueno_id`); `q` busca en el título sin distinguir mayúsculas y con los comodines `%` y `_` escapados; por defecto no incluye archivadas.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `tareas`, `v_tareas_semaforo`, `tarea_etiquetas`, `etiquetas`, `subtareas`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/tareasPersonales.ts` → `listar()`; `GET /personal/tareas`.
- **Pruebas:** `pruebas_procesos.sql` P45; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_tarea_listar($1, '{"estado":["en_curso"]}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_tarea_obtener
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Detalle de una tarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea.
- **Retorno:** `jsonb` `TareaPersonalDetalle` (con `subtareas[]` y `comentarios[]`).
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014).
- **Errores:** `NX006` · no es suya o no existe (404, `tarea_no_encontrada`).
- **Tablas que toca:** lectura `tareas`, `v_tareas_semaforo`, `subtareas`, `comentarios_tarea`, `tarea_etiquetas`, `etiquetas`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/tareasPersonales.ts` → `obtener()`; `GET /personal/tareas/:id`.
- **Pruebas:** `pruebas_procesos.sql` P44; `personal.test.ts` (privacidad).
- **Ejemplo de llamada:** `select proc_personal_tarea_obtener($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_tarea_crear
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Crea una tarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_datos jsonb` · `{ titulo, descripcion?, prioridad?, vence_en?, etiquetas?: [] }`.
- **Retorno:** `jsonb` `TareaPersonalDetalle`.
- **Reglas y validaciones:** nace «Por hacer» (`habilitada`), sin votación ni asignación; el dueño es su responsable (DEC-012); las etiquetas son privadas y no distinguen mayúsculas.
- **Errores:** `23514` · título vacío o de más de 140 caracteres (lo evita Zod).
- **Tablas que toca:** escritura `tareas`, `etiquetas`, `tarea_etiquetas`, `actividad`.
- **Eventos que genera:** solo actividad personal «Creaste «…»» (DEC-013: sin evento de dominio).
- **Lo llama:** `repositorios/tareasPersonales.ts` → `crear()`; `POST /personal/tareas`.
- **Pruebas:** `pruebas_procesos.sql` P44; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_tarea_crear($1, '{"titulo":"Estudiar"}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_tarea_actualizar
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Actualiza una tarea personal (datos, estado, avance, archivado, etiquetas).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea. `p_datos jsonb` · `version` y solo lo que cambia de `{ titulo, descripcion, prioridad, vence_en, estado, motivo, progreso, archivada, etiquetas[] }`.
- **Retorno:** `jsonb` `TareaPersonalDetalle`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014); concurrencia optimista por `version`; la persona mueve su tarea libremente entre sus estados; atascar exige motivo; al completar: 100 %, fecha de cierre y resultado; al reabrir se limpian; siempre sube `version`.
- **Errores:** `NX006` · no es suya. `NX008` · versión vieja (409). `NX010` · atascar sin motivo o avance distinto de 100 en una completada (400).
- **Tablas que toca:** escritura `tareas`, `etiquetas`, `tarea_etiquetas`, `actividad`.
- **Eventos que genera:** actividad personal «Completaste «…»» al completar.
- **Lo llama:** `repositorios/tareasPersonales.ts` → `actualizar()`; `PATCH /personal/tareas/:id`.
- **Pruebas:** `pruebas_procesos.sql` P46; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_tarea_actualizar($1, $2, '{"version":3,"estado":"completada"}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_tarea_eliminar
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Elimina una tarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea.
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014).
- **Errores:** `NX006` · no es suya o no existe.
- **Tablas que toca:** escritura `tareas` (y en cascada), `actividad`.
- **Eventos que genera:** actividad personal «Eliminaste «…»».
- **Lo llama:** `repositorios/tareasPersonales.ts` → `eliminar()`; `DELETE /personal/tareas/:id`.
- **Pruebas:** `pruebas_procesos.sql` P47; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_tarea_eliminar($1, $2)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_subtarea_crear
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Agrega una subtarea a una tarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea. `p_titulo text`.
- **Retorno:** `jsonb` `{ id, titulo, hecha }`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014).
- **Errores:** `NX006` · la tarea no es suya.
- **Tablas que toca:** escritura `subtareas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasPersonales.ts` → `crearSubtarea()`; `POST /personal/tareas/:id/subtareas`.
- **Pruebas:** `pruebas_procesos.sql` P48; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_subtarea_crear($1, $2, 'Paso 1')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_subtarea_actualizar
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Cambia una subtarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea. `p_subtarea_id uuid`. `p_cambios jsonb` · `{ titulo?, hecha? }`.
- **Retorno:** `jsonb` `{ id, titulo, hecha }`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014).
- **Errores:** `NX006` · la tarea no es suya, o la subtarea no existe en ella (`subtarea_no_encontrada`).
- **Tablas que toca:** escritura `subtareas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasPersonales.ts` → `actualizarSubtarea()`; `PATCH /personal/tareas/:id/subtareas/:subId`.
- **Pruebas:** `pruebas_procesos.sql` P48; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_subtarea_actualizar($1, $2, $3, '{"hecha":true}')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_subtarea_eliminar
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Elimina una subtarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea. `p_subtarea_id uuid`.
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014).
- **Errores:** `NX006` · la tarea no es suya, o la subtarea no existe en ella.
- **Tablas que toca:** escritura `subtareas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasPersonales.ts` → `eliminarSubtarea()`; `DELETE /personal/tareas/:id/subtareas/:subId`.
- **Pruebas:** `pruebas_procesos.sql` P48; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_subtarea_eliminar($1, $2, $3)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_comentario_crear
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Agrega una nota a una tarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea. `p_texto text`.
- **Retorno:** `jsonb` `{ id, texto, autor_id, creado_en, editado_en }`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014).
- **Errores:** `NX006` · la tarea no es suya.
- **Tablas que toca:** escritura `comentarios_tarea`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasPersonales.ts` → `comentar()`; `POST /personal/tareas/:id/comentarios`.
- **Pruebas:** `pruebas_procesos.sql` P49; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_comentario_crear($1, $2, 'Una nota')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_comentario_eliminar
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Elimina una nota de una tarea personal.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_tarea_id uuid` · tarea. `p_comentario_id uuid`.
- **Retorno:** `jsonb` `{ eliminado: true }`.
- **Reglas y validaciones:** la tarea debe ser del actor (`dueno_id`); una ajena responde `NX006`, sin revelar que existe (DEC-014); solo borra comentarios propios.
- **Errores:** `NX006` · la tarea no es suya, o el comentario no existe (`comentario_no_encontrado`).
- **Tablas que toca:** escritura `comentarios_tarea`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/tareasPersonales.ts` → `eliminarComentario()`; `DELETE /personal/tareas/:id/comentarios/:comentarioId`.
- **Pruebas:** `pruebas_procesos.sql` P49; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_comentario_eliminar($1, $2, $3)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_personal_etiquetas
- **Migración:** `0007_procesos_tareas_personales.sql`
- **Propósito:** Etiquetas personales del actor.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta.
- **Retorno:** `jsonb` arreglo de nombres, en orden alfabético.
- **Reglas y validaciones:** solo las etiquetas del actor.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `etiquetas`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/tareasPersonales.ts` → `etiquetas()`; `GET /personal/etiquetas`.
- **Pruebas:** `pruebas_procesos.sql` P50; `personal.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_etiquetas($1)`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0007`.

### proc_sprint_listar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Todos los sprints del equipo (planificados, activo e historial, EQ-13).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` arreglo de `SprintResumen` (`id`, `numero`, `objetivo`, `inicio`, `fin`, `estado`, `cerrado_en`, `total`, `completadas`, `retro`), del más reciente al más antiguo.
- **Reglas y validaciones:** los invitados no ven los sprints. En un sprint cerrado, `total` y `completadas` salen de su última instantánea (la de cierre); en los demás se cuentan en vivo.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `sprints`, `sprint_instantaneas`, `tareas`, `retrospectivas`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/sprints.ts` → `listarSprints()`; `GET /equipos/:equipoId/sprints`.
- **Pruebas:** `pruebas_procesos.sql` P57; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_listar($1, $2)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_sprint_obtener
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Detalle de un sprint; sin `p_sprint_id`, el sprint activo (EQ-09).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint (opcional; `NULL` = el activo).
- **Retorno:** `jsonb` `SprintDetalle` (el resumen más `capacidad[]` por miembro activo con `horas` y `tareas`, `serie[]` del burndown con `dia`, `total` y `completadas`, y `tareas[]` como `TareaEquipo`), o `null` si se pidió el activo y no hay.
- **Reglas y validaciones:** los invitados no ven los sprints. Mientras el sprint está activo, el último punto de `serie` es el de hoy calculado en vivo (no espera a la instantánea nocturna). «Hoy» es la fecha en la zona horaria del equipo.
- **Errores:** `NX005` · un invitado. `NX006` · el sprint no es del equipo, o el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `sprints`, `sprint_capacidad`, `sprint_instantaneas`, `tareas`, `v_tareas_semaforo`, `retrospectivas`, `membresias`, `usuarios`, `equipos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/sprints.ts` → `obtenerSprint()`; `GET /equipos/:equipoId/sprints/activo` y `GET /equipos/:equipoId/sprints/:sprintId`.
- **Pruebas:** `pruebas_procesos.sql` P56; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_obtener($1, $2, null)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_sprint_disponibles
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Tareas que pueden entrar a un sprint al planearlo (EQ-10).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` arreglo de `TareaEquipo`, por código.
- **Reglas y validaciones:** tareas del equipo sin sprint, no archivadas, en `backlog`, `aceptada`, `habilitada`, `en_curso` o `atascada` (las aceptadas por votación que no se han terminado; DEC-031). Las propuestas, rechazadas, retiradas y completadas no entran. Los invitados no la consultan.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `tareas`, `v_tareas_semaforo`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/sprints.ts` → `disponibles()`; `GET /equipos/:equipoId/sprints/disponibles`.
- **Pruebas:** `pruebas_procesos.sql` P58; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_disponibles($1, $2)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_sprint_planear
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Crea un sprint planificado o cambia el plan de uno planificado: objetivo, fechas, capacidad y tareas (EQ-10).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · `NULL` para crear; el sprint planificado para cambiarlo. `p_datos jsonb` · `{ objetivo?, inicio?, fin?, capacidad?: [{ usuario_id, horas }], tarea_ids?: uuid[] }`; solo lo que cambia.
- **Retorno:** `jsonb` `SprintDetalle`.
- **Reglas y validaciones:** solo el líder, con el equipo activo. Número consecutivo por equipo. Fechas por defecto: empieza hoy o el día después del último sprint (lo que sea más tarde) y dura `duracion_sprint_semanas` del equipo. `fin > inicio` y las fechas no se cruzan con las de otro sprint planificado o activo. `capacidad` y `tarea_ids` **reemplazan** la lista completa: las horas van de 0 a 300 y solo para miembros activos (no invitados); las tareas deben estar disponibles (ver `proc_sprint_disponibles`) o ya ser de este sprint. Las que salen del plan quedan sin sprint; las del backlog que entran pasan a `aceptada` (al final de la columna). Solo se cambia un sprint **planificado**.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · el sprint no es del equipo. `NX007` · el sprint ya no está planificado. `NX010` · fechas inválidas o cruzadas, objetivo de más de 300 caracteres, horas fuera de rango o capacidad para quien no es miembro. `NX012` · alguna tarea ya no está disponible (está en otro sprint, se completó o se archivó).
- **Tablas que toca:** lectura `equipos`, `membresias`; escritura `sprints`, `sprint_capacidad`, `tareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `sprint.planeado` o `sprint.plan_actualizado` («Valeria planeó el Sprint 4 (3 tareas)») y un `tarea.sprint_asignado` por cada tarea que entra («Valeria puso T-09 «…» en el Sprint 4», en el historial de la tarea).
- **Lo llama:** `repositorios/sprints.ts` → `planear()`; `POST /equipos/:equipoId/sprints` y `PATCH /equipos/:equipoId/sprints/:sprintId`.
- **Pruebas:** `pruebas_procesos.sql` P53 y P54; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_planear($1, $2, null, '{"objetivo": "Chat", "tarea_ids": ["…"]}')`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_sprint_iniciar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Inicia un sprint planificado (EQ-09).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint.
- **Retorno:** `jsonb` `SprintDetalle`.
- **Reglas y validaciones:** solo el líder, con el equipo activo; el sprint debe estar planificado y no puede haber otro activo (además lo garantiza el índice `ux_un_sprint_activo`). Si se inicia **antes** de su fecha, se recorre a hoy y conserva su duración (así el burndown empieza hoy); si se inicia tarde, conserva sus fechas; si su fin ya pasó, hay que cambiar las fechas primero. Guarda la instantánea del día de inicio.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · el sprint no es del equipo. `NX007` · el sprint ya no está planificado. `NX010` · el plazo del sprint ya pasó (`fechas_vencidas`). `NX012` · hay otro sprint activo.
- **Tablas que toca:** escritura `sprints`, `sprint_instantaneas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `sprint.iniciado` («Valeria inició el Sprint 4»).
- **Lo llama:** `repositorios/sprints.ts` → `iniciar()`; `POST /equipos/:equipoId/sprints/:sprintId/iniciar`.
- **Pruebas:** `pruebas_procesos.sql` P55; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_iniciar($1, $2, $3)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_sprint_cerrar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Cierra el sprint activo con su instantánea final y crea la retrospectiva (EQ-11).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint. `p_pendientes text` · `liberar` (por defecto: las tareas sin terminar quedan sin sprint) o `siguiente` (pasan al sprint planificado más próximo).
- **Retorno:** `jsonb` `SprintDetalle` del sprint cerrado (sus `tareas` son las completadas; `total` y `completadas`, los de la instantánea final).
- **Reglas y validaciones:** solo el líder, con el equipo activo, y solo el sprint activo. La instantánea final se guarda **antes** de mover las pendientes, así cuenta todo lo que tuvo el sprint. Las completadas se quedan en el sprint (salen del tablero, `proc_tarea_listar`). Las pendientes conservan su estado. Crea la retrospectiva si no existe.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · el sprint no es del equipo. `NX007` · el sprint no está activo, o se pidió `siguiente` con pendientes y no hay un sprint planificado. `NX010` · destino inválido.
- **Tablas que toca:** escritura `sprints`, `sprint_instantaneas`, `tareas`, `retrospectivas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `sprint.cerrado` con `{ total, completadas, pendientes, destino }` («Valeria cerró el Sprint 3: 5 de 7 tareas completadas»).
- **Lo llama:** `repositorios/sprints.ts` → `cerrar()`; `POST /equipos/:equipoId/sprints/:sprintId/cerrar`.
- **Pruebas:** `pruebas_procesos.sql` P59, P60 y P61; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_cerrar($1, $2, $3, 'siguiente')`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_sprint_eliminar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Borra un sprint planificado.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint.
- **Retorno:** `jsonb` `{ eliminado: true }`.
- **Reglas y validaciones:** solo el líder, con el equipo activo, y solo un sprint planificado. Sus tareas quedan sin sprint (vuelven a estar disponibles); su capacidad se borra.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · el sprint no es del equipo. `NX007` · el sprint ya empezó o se cerró.
- **Tablas que toca:** escritura `sprints`, `sprint_capacidad`, `tareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `sprint.eliminado` («Valeria borró el plan del Sprint 4»).
- **Lo llama:** `repositorios/sprints.ts` → `eliminar()`; `DELETE /equipos/:equipoId/sprints/:sprintId`.
- **Pruebas:** `pruebas_procesos.sql` P62; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_sprint_eliminar($1, $2, $3)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_iniciar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Abre la retrospectiva de un sprint cerrado que aún no tiene (al cerrar un sprint se crea sola).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint.
- **Retorno:** `jsonb` `Retrospectiva` (ver `proc_retro_obtener`).
- **Reglas y validaciones:** solo el líder (modera la retrospectiva), con el equipo activo; el sprint debe estar cerrado. Una retrospectiva por sprint (`retrospectivas.sprint_id UNIQUE`): repetir devuelve la misma.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · el sprint no es del equipo. `NX007` · el sprint no está cerrado.
- **Tablas que toca:** lectura `sprints`, `retro_notas`, `retro_votos`; escritura `retrospectivas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `sprint.retro_iniciada` (solo si la crea).
- **Lo llama:** `repositorios/sprints.ts` → `iniciarRetro()`; `POST /equipos/:equipoId/sprints/:sprintId/retro`.
- **Pruebas:** `pruebas_procesos.sql` P63; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_iniciar($1, $2, $3)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_obtener
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Retrospectiva de un sprint con sus notas (EQ-12).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint.
- **Retorno:** `jsonb` `Retrospectiva` (`id`, `sprint_id`, `sprint_numero`, `votacion_cerrada`, `cerrada`, `votos_por_persona` = 3, `mis_votos_usados`, `notas[]` con `columna`, `texto`, `anonima`, `mia`, `autor` (nulo si es anónima), `grupo`, `tarea_id`, `votos` y `voto_mio`), o `null` si el sprint aún no tiene retrospectiva.
- **Reglas y validaciones:** los invitados no la ven. De los votos solo se devuelve el total por nota y si el actor votó; nunca quién votó.
- **Errores:** `NX005` · un invitado. `NX006` · el sprint no es del equipo, o el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `sprints`, `retrospectivas`, `retro_notas`, `retro_votos`, `usuarios`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/sprints.ts` → `obtenerRetro()`; `GET /equipos/:equipoId/sprints/:sprintId/retro`.
- **Pruebas:** `pruebas_procesos.sql` P64; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_obtener($1, $2, $3)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_nota_agregar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Agrega una nota a la retrospectiva: Bien, Mejorar o Acciones.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint. `p_columna text` · `bien` | `mejorar` | `acciones`. `p_texto text` · 1 a 500 caracteres (sin espacios sobrantes). `p_anonima boolean` · si es anónima.
- **Retorno:** `jsonb` `{ id }`.
- **Reglas y validaciones:** líder e integrantes (participar en la retrospectiva), con el equipo activo, mientras la votación siga abierta. Una nota anónima **no guarda** quién la escribió (`autor_id` nulo).
- **Errores:** `NX005` · un invitado. `NX009` · equipo archivado. `NX006` · el sprint no tiene retrospectiva. `NX007` · la votación o la retrospectiva ya se cerraron. `NX010` · texto vacío o largo, o columna inválida.
- **Tablas que toca:** lectura `membresias`; escritura `retro_notas`.
- **Eventos que genera:** **ninguno**, a propósito: un evento con su actor revelaría quién escribió una nota anónima (DEC-031).
- **Lo llama:** `repositorios/sprints.ts` → `agregarNota()`; `POST /equipos/:equipoId/sprints/:sprintId/retro/notas`.
- **Pruebas:** `pruebas_procesos.sql` P65; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_nota_agregar($1, $2, $3, 'mejorar', 'Revisar antes de cerrar', true)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_nota_eliminar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Elimina una nota de la retrospectiva.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_nota_id uuid` · nota.
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** su autora mientras la votación siga abierta, o el líder hasta que se cierre la retrospectiva. Una nota anónima solo la borra el líder (no se sabe quién la escribió). Con la nota se borran sus votos.
- **Errores:** `NX005` · un invitado, o alguien que no es la autora ni el líder. `NX009` · equipo archivado. `NX006` · la nota no es de una retrospectiva del equipo. `NX007` · la retrospectiva ya se cerró.
- **Tablas que toca:** lectura `retrospectivas`; escritura `retro_notas`, `retro_votos`.
- **Eventos que genera:** ninguno (ver `proc_retro_nota_agregar`).
- **Lo llama:** `repositorios/sprints.ts` → `eliminarNota()`; `DELETE /equipos/:equipoId/retro/notas/:notaId`.
- **Pruebas:** `pruebas_procesos.sql` P67; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_nota_eliminar($1, $2, $3)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_votar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Pone o quita un punto de voto en una nota.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_nota_id uuid` · nota. `p_dar boolean` · `true` pone el voto, `false` lo quita.
- **Retorno:** `jsonb` `{ nota_id, votos, voto_mio, mis_votos_usados }`.
- **Reglas y validaciones:** líder e integrantes, con el equipo activo, mientras la votación siga abierta. **3 puntos por persona y retrospectiva**, a lo más uno por nota: el proceso responde `NX003` al cuarto y, aunque alguien se salte el proceso, el disparador `trg_retro_limite_votos` (0001) también lo impide. Quitar un voto que no existe no falla.
- **Errores:** `NX003` · ya usó sus 3 votos («Ya usaste tus 3 votos en esta retrospectiva.»). `NX005` · un invitado. `NX009` · equipo archivado. `NX006` · la nota no es de una retrospectiva del equipo. `NX007` · la votación ya se cerró. `NX012` · ya votó esa nota.
- **Tablas que toca:** lectura `retro_notas`, `retrospectivas`; escritura `retro_votos`.
- **Eventos que genera:** ninguno: los votos de la retrospectiva son privados.
- **Lo llama:** `repositorios/sprints.ts` → `votarNota()`; `POST /equipos/:equipoId/retro/notas/:notaId/voto`.
- **Pruebas:** `pruebas_procesos.sql` P66; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_votar($1, $2, $3, true)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_avanzar
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** El líder cierra la votación o la retrospectiva completa.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_sprint_id uuid` · sprint. `p_fase text` · `votacion` (ya no se vota ni se agregan notas) | `cerrada` (también cierra la votación).
- **Retorno:** `jsonb` `Retrospectiva`.
- **Reglas y validaciones:** solo el líder, con el equipo activo. Las fases solo avanzan: no se reabre una votación ni una retrospectiva.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · el sprint no tiene retrospectiva. `NX007` · esa fase ya se cerró. `NX010` · fase inválida.
- **Tablas que toca:** escritura `retrospectivas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `sprint.retro_votacion_cerrada` o `sprint.retro_cerrada`.
- **Lo llama:** `repositorios/sprints.ts` → `avanzarRetro()`; `POST /equipos/:equipoId/sprints/:sprintId/retro/avanzar`.
- **Pruebas:** `pruebas_procesos.sql` P68; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_avanzar($1, $2, $3, 'votacion')`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_retro_nota_a_tarea
- **Migración:** `0009_procesos_sprints.sql`
- **Propósito:** Convierte una nota (normalmente una acción) en una propuesta de tarea.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_nota_id uuid` · nota.
- **Retorno:** `jsonb` `{ id, codigo, estado }` de la tarea nueva.
- **Reglas y validaciones:** solo el líder, con el equipo activo; también con la retrospectiva cerrada. La tarea nace como **propuesta** y va a votación (DEC-024; sin integrantes, aceptada); el título es el texto de la nota (recortado a 140 caracteres) y la descripción dice de qué retrospectiva viene. La nota guarda `tarea_id`; una nota se convierte una sola vez.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX006` · la nota no es de una retrospectiva del equipo. `NX012` · la nota ya se convirtió.
- **Tablas que toca:** escritura `tareas`, `retro_notas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.propuesta` («Valeria propuso T-12 «…» desde la retrospectiva del Sprint 3»).
- **Lo llama:** `repositorios/sprints.ts` → `notaATarea()`; `POST /equipos/:equipoId/retro/notas/:notaId/tarea`.
- **Pruebas:** `pruebas_procesos.sql` P69; `sprints.test.ts`.
- **Ejemplo de llamada:** `select proc_retro_nota_a_tarea($1, $2, $3)`
- **Historial:** 2026-11-17 · creación · `0009`.

### proc_liderazgo_obtener
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** Estado del liderazgo del equipo (AD-07 a AD-09) y su historial (FALT-07).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `Liderazgo`: `transferencia` pendiente (o `null`), `eleccion` abierta (o `null`) e `historial[]` de transferencias resueltas y elecciones cerradas, de la más reciente a la más antigua. Cada elección trae `fase`, `ronda`, `plazo_en`, `saliente`, `ganador`, `candidatos[]` (con `finalista` y `votos`), `votantes_total`, `votaron[]` y `mi_voto`.
- **Reglas y validaciones:** los invitados no lo ven. Mientras la elección está abierta, `votos` de cada candidato es `null`: se ve cuántos y quiénes votaron, nunca por quién (como V-8).
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `transferencias_liderazgo`, `elecciones`, `eleccion_candidatos`, `eleccion_votos`, `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/liderazgo.ts` → `obtener()`; `GET /equipos/:equipoId/liderazgo` (antes resuelve las elecciones vencidas con `proc_eleccion_vencidas`).
- **Pruebas:** `pruebas_procesos.sql` P73; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_liderazgo_obtener($1, $2)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_liderazgo_transferir
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder propone a un integrante como nuevo líder (AD-07).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_a_id uuid` · integrante propuesto. `p_saldra boolean` · si el líder sale del equipo al aceptarse.
- **Retorno:** `jsonb` `Liderazgo`.
- **Reglas y validaciones:** solo el líder, con el equipo activo; el destino debe ser integrante activo (no invitado). Una sola transferencia pendiente (además el índice `ux_transferencia_pendiente`) y ninguna con una elección abierta. Avisa a la persona propuesta (notificación `liderazgo`).
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX010` · el destino no es integrante. `NX012` · ya hay una transferencia pendiente o una elección abierta.
- **Tablas que toca:** escritura `transferencias_liderazgo`, `notificaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.transferencia_propuesta`.
- **Lo llama:** `repositorios/liderazgo.ts` → `transferir()`; `POST /equipos/:equipoId/liderazgo/transferencias`.
- **Pruebas:** `pruebas_procesos.sql` P70; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_liderazgo_transferir($1, $2, $3, false)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_liderazgo_responder
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** La persona propuesta acepta o rechaza el liderazgo (AD-08).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_transferencia_id uuid` · transferencia. `p_acepta boolean`.
- **Retorno:** `jsonb` `Liderazgo`.
- **Reglas y validaciones:** solo la persona propuesta y solo una transferencia pendiente. Al aceptar, el líder pasa a integrante (o sale del equipo si `saldra`) y la persona pasa a líder; sus votos de propuestas abiertas se descartan (el líder no vota) y las votaciones se recuentan. Avisa al líder anterior.
- **Errores:** `NX005` · no es la persona propuesta. `NX006` · la transferencia no es del equipo. `NX007` · ya no está pendiente. `NX009` · equipo archivado. `NX012` · la persona ya no es integrante.
- **Tablas que toca:** escritura `transferencias_liderazgo`, `membresias`, `tarea_votos`, `tareas`, `notificaciones`, `equipos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.transferencia_aceptada` o `equipo.transferencia_rechazada` (y los de propuestas que se resuelvan al recontar).
- **Lo llama:** `repositorios/liderazgo.ts` → `responder()`; `POST /equipos/:equipoId/liderazgo/transferencias/:id/respuesta`.
- **Pruebas:** `pruebas_procesos.sql` P70 y P71; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_liderazgo_responder($1, $2, $3, true)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_liderazgo_cancelar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder cancela la transferencia que propuso.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_transferencia_id uuid` · transferencia.
- **Retorno:** `jsonb` `Liderazgo`.
- **Reglas y validaciones:** solo el líder y solo una transferencia pendiente.
- **Errores:** `NX005` · no es el líder. `NX006` · la transferencia no es del equipo. `NX007` · ya no está pendiente.
- **Tablas que toca:** escritura `transferencias_liderazgo`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.transferencia_cancelada`.
- **Lo llama:** `repositorios/liderazgo.ts` → `cancelar()`; `POST /equipos/:equipoId/liderazgo/transferencias/:id/cancelar`.
- **Pruebas:** `pruebas_procesos.sql` P72; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_liderazgo_cancelar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_eleccion_convocar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder convoca una elección de líder (AD-09).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `Liderazgo`.
- **Reglas y validaciones:** solo el líder, con el equipo activo; una sola elección abierta (además `ux_eleccion_abierta`) y ninguna con una transferencia pendiente. Son candidatos **todos los integrantes activos** (la fase de postulación no se usa, DEC-032). La votación dura `votacion_plazo_horas` del equipo (72 por defecto). El líder queda como **interino** hasta el resultado y no vota. Avisa a los integrantes.
- **Errores:** `NX005` · no es el líder. `NX007` · el equipo no tiene integrantes. `NX009` · equipo archivado. `NX012` · ya hay una elección abierta o una transferencia pendiente.
- **Tablas que toca:** escritura `elecciones`, `eleccion_candidatos`, `notificaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.eleccion_convocada`.
- **Lo llama:** `repositorios/liderazgo.ts` → `convocar()`; `POST /equipos/:equipoId/liderazgo/eleccion`.
- **Pruebas:** `pruebas_procesos.sql` P74; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_eleccion_convocar($1, $2)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_eleccion_votar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** Un integrante vota en la elección de líder.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_eleccion_id uuid` · elección. `p_candidato_id uuid` · persona candidata.
- **Retorno:** `jsonb` `Liderazgo`.
- **Reglas y validaciones:** solo integrantes; el líder saliente no vota (`NX002`, también lo impide el disparador `trg_voto_valido` de la `0001`). Un voto por ronda y no se cambia. En la ronda 2 solo se vota por los empatados. Si ya votaron todos los integrantes, la ronda se resuelve en el acto (ver `proc_eleccion_vencidas`).
- **Errores:** `NX002` · vota el líder saliente. `NX005` · un invitado. `NX006` · la elección no es del equipo. `NX007` · la elección ya terminó. `NX009` · equipo archivado. `NX010` · el candidato no es de esta ronda. `NX012` · ya votó en la ronda.
- **Tablas que toca:** escritura `eleccion_votos` (y, al resolverse, `elecciones`, `membresias`, `tarea_votos`, `tareas`, `notificaciones`), `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.eleccion_votada` (sin el candidato), y al resolverse `equipo.lider_elegido`, `equipo.eleccion_empate` o `equipo.eleccion_sin_votos`.
- **Lo llama:** `repositorios/liderazgo.ts` → `votar()`; `POST /equipos/:equipoId/liderazgo/eleccion/:id/voto`.
- **Pruebas:** `pruebas_procesos.sql` P75 a P77; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_eleccion_votar($1, $2, $3, $4)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_eleccion_vencidas
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** Tarea programada (sin actor): resuelve las elecciones cuyo plazo venció.
- **Parámetros:** ninguno (es la excepción a `p_actor_id`: la llama el sistema, no una persona).
- **Retorno:** `jsonb` `{ resueltas }`.
- **Reglas y validaciones:** por cada elección abierta con `plazo_en` vencido cierra la ronda: gana quien tenga más votos entre los finalistas que sigan siendo integrantes; **empate en la ronda 1** → ronda 2 de desempate de `votacion_desempate_horas` (24 por defecto) solo entre los empatados; **empate en la ronda 2** → gana quien lleva más tiempo en el equipo; **sin votos en la ronda 1** → `sin_votos` y el saliente sigue como líder. Al haber ganador cambia el líder (el saliente pasa a integrante). Bloquea cada elección con `FOR UPDATE SKIP LOCKED`, así varias instancias no se pisan.
- **Errores:** ninguno propio.
- **Tablas que toca:** escritura `elecciones`, `membresias`, `tarea_votos`, `tareas`, `notificaciones`, `equipos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.lider_elegido`, `equipo.eleccion_empate` o `equipo.eleccion_sin_votos` (actor nulo).
- **Lo llama:** `repositorios/liderazgo.ts` → `vencerElecciones()`, desde el temporizador `apps/api/src/trabajos/plazos.ts` (cada minuto; `pg-boss` lo sustituye en la Fase 4) y antes de `GET /equipos/:equipoId/liderazgo`.
- **Pruebas:** `pruebas_procesos.sql` P76 y P77 (elección de punta a punta con plazos acortados); `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_eleccion_vencidas()`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_equipo_salir
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** Salir del equipo (AD-10).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `{ salio: true }`.
- **Reglas y validaciones:** integrantes e invitados; el líder primero transfiere el liderazgo (o convoca una elección). La membresía queda `salio` (se conserva el historial). Sus tareas sin terminar quedan sin responsable, se cancela una transferencia pendiente hacia esa persona, sus votos de propuestas abiertas se descartan (disparador de la `0003`) y las votaciones se recuentan (DEC-024). Funciona también con el equipo archivado.
- **Errores:** `NX007` · es el líder. `NX006` · no pertenece al equipo.
- **Tablas que toca:** escritura `membresias`, `tareas`, `tarea_votos`, `transferencias_liderazgo`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.miembro_salio`.
- **Lo llama:** `repositorios/liderazgo.ts` → `salir()`; `POST /equipos/:equipoId/salir`.
- **Pruebas:** `pruebas_procesos.sql` P78; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_salir($1, $2)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_equipo_expulsar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder expulsa a un integrante o invitado (AD-11).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_membresia_id uuid` · membresía.
- **Retorno:** `jsonb` arreglo de `Miembro` (la lista actualizada).
- **Reglas y validaciones:** solo el líder, con el equipo activo, y no a sí mismo. La membresía queda `expulsada`; lo demás igual que `proc_equipo_salir`. La persona recibe una notificación.
- **Errores:** `NX005` · no es el líder. `NX006` · la membresía no está activa en el equipo. `NX009` · equipo archivado. `NX010` · se expulsa a sí mismo.
- **Tablas que toca:** escritura `membresias`, `tareas`, `tarea_votos`, `transferencias_liderazgo`, `notificaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.miembro_expulsado`.
- **Lo llama:** `repositorios/liderazgo.ts` → `expulsar()`; `POST /equipos/:equipoId/miembros/:membresiaId/expulsar`.
- **Pruebas:** `pruebas_procesos.sql` P79; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_expulsar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_invitado_gestionar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder amplía el acceso de un invitado o lo convierte en integrante (AD-05).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_membresia_id uuid` · membresía del invitado. `p_accion text` · `ampliar` | `convertir`. `p_dias int` · 7, 14 o 30 (solo `ampliar`).
- **Retorno:** `jsonb` arreglo de `Miembro`.
- **Reglas y validaciones:** solo el líder, con el equipo activo, y solo sobre un invitado activo. `ampliar` suma los días a partir de hoy o de su caducidad, lo que sea más tarde. `convertir` le da color, quita la caducidad y lo deja como integrante (cuenta para el tope: `NX001` si el equipo está lleno); deja de necesitar las tareas compartidas y las votaciones se recuentan.
- **Errores:** `NX001` · equipo lleno. `NX005` · no es el líder. `NX006` · la membresía no está activa. `NX007` · no es invitado. `NX009` · equipo archivado. `NX010` · acción o días inválidos.
- **Tablas que toca:** escritura `membresias`, `tarea_compartida`, `tareas`, `notificaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.invitado_ampliado` o `equipo.invitado_convertido`.
- **Lo llama:** `repositorios/liderazgo.ts` → `gestionarInvitado()`; `POST /equipos/:equipoId/miembros/:membresiaId/invitado`.
- **Pruebas:** `pruebas_procesos.sql` P80; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_invitado_gestionar($1, $2, $3, 'ampliar', 7)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_equipo_configuracion
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** Configuración actual del equipo (AD-06).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `ConfiguracionEquipo` (`nombre`, `descripcion`, `estado`, `duracion_sprint_semanas`, `zona_horaria`, `votacion_plazo_horas`, `votacion_desempate_horas`, `max_miembros`, `archivado_en`).
- **Reglas y validaciones:** líder e integrantes; los invitados no.
- **Errores:** `NX005` · un invitado. `NX006` · no pertenece al equipo.
- **Tablas que toca:** lectura `equipos`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/liderazgo.ts` → `configuracion()`; `GET /equipos/:equipoId/configuracion`.
- **Pruebas:** `pruebas_procesos.sql` P81; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_configuracion($1, $2)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_equipo_configurar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder cambia los datos y reglas del equipo (AD-06).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_cambios jsonb` · solo lo que cambia: `nombre`, `descripcion`, `duracion_sprint_semanas`, `zona_horaria`, `votacion_plazo_horas`, `votacion_desempate_horas`, `max_miembros`.
- **Retorno:** `jsonb` `ConfiguracionEquipo`.
- **Reglas y validaciones:** solo el líder, con el equipo activo. La zona horaria debe existir en `pg_timezone_names`; el tope de miembros no baja de los miembros activos; los rangos los cuidan los `CHECK` de `equipos` (se traducen a `NX010`).
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX010` · valor fuera de rango, zona inválida o tope menor que los miembros.
- **Tablas que toca:** escritura `equipos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.configurado` (con la lista de campos).
- **Lo llama:** `repositorios/liderazgo.ts` → `configurar()`; `PATCH /equipos/:equipoId/configuracion`.
- **Pruebas:** `pruebas_procesos.sql` P81; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_configurar($1, $2, '{"votacion_plazo_horas": 48}')`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_equipo_archivar
- **Migración:** `0010_procesos_liderazgo.sql`
- **Propósito:** El líder archiva el equipo o lo reactiva (AD-12).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_archivar boolean`.
- **Retorno:** `jsonb` `ConfiguracionEquipo`.
- **Reglas y validaciones:** solo el líder. Archivado, el equipo es de solo lectura (`NX009` en toda escritura). No se archiva con una elección abierta.
- **Errores:** `NX005` · no es el líder. `NX012` · hay una elección abierta.
- **Tablas que toca:** escritura `equipos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.archivado` o `equipo.reactivado`.
- **Lo llama:** `repositorios/liderazgo.ts` → `archivar()`; `POST /equipos/:equipoId/archivar`.
- **Pruebas:** `pruebas_procesos.sql` P82; `liderazgo.test.ts`.
- **Ejemplo de llamada:** `select proc_equipo_archivar($1, $2, true)`
- **Historial:** 2026-11-18 · creación · `0010`.

### proc_calendario_equipo
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Calendario del equipo (EQ-14): reuniones y entregas entre dos fechas.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_desde timestamptz`, `p_hasta timestamptz` · rango (de 1 a 62 días).
- **Retorno:** `jsonb` `{ reuniones[], entregas[] }`: cada **ocurrencia** de cada reunión (`Reunion`, con el `inicio` de esa fecha, la asistencia y `mi_respuesta`) y las tareas (`TareaEquipo`) que vencen en el rango.
- **Reglas y validaciones:** los invitados no lo ven. Las reuniones `semanal` se repiten cada 7 días y las `diaria_lv` de lunes a viernes (el día se mira en la zona horaria del equipo), hasta dos años; las canceladas no salen. Las entregas excluyen propuestas, rechazadas, retiradas y archivadas.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404). `NX010` · rango inválido.
- **Tablas que toca:** lectura `reuniones`, `reunion_asistencia`, `tareas`, `v_tareas_semaforo`, `equipos`, `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `calendario()`; `GET /equipos/:equipoId/calendario?desde=&hasta=`.
- **Pruebas:** `pruebas_procesos.sql` P84; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_calendario_equipo($1, $2, $3, $4)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_reunion_crear
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Crear una reunión del equipo (EQ-15).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_datos jsonb` · `{ titulo, inicio, duracion_min?, repeticion?, lugar?, descripcion?, recordatorio_min?, avisar_wa? }`.
- **Retorno:** `jsonb` `Reunion`.
- **Reglas y validaciones:** líder o integrante (matriz `crear_reunion`), con el equipo activo. Se invita a todo el equipo (sin invitados): quien la crea queda con «sí» y los demás con «pendiente» y reciben un aviso (`ver_reunion`). Título de 1 a 120 caracteres y duración de 5 a 720 minutos (los `CHECK` se traducen a `NX010`).
- **Errores:** `NX005` · un invitado. `NX009` · equipo archivado. `NX010` · datos inválidos.
- **Tablas que toca:** escritura `reuniones`, `reunion_asistencia`, `notificaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `reunion.creada` (la actividad queda con tipo `reunion`).
- **Lo llama:** `repositorios/vistas.ts` → `crearReunion()`; `POST /equipos/:equipoId/reuniones`.
- **Pruebas:** `pruebas_procesos.sql` P83; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_reunion_crear($1, $2, '{"titulo": "Revisión", "inicio": "…"}')`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_reunion_editar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Cambiar una reunión (toda la serie).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_reunion_id uuid`. `p_cambios jsonb` · solo lo que cambia.
- **Retorno:** `jsonb` `Reunion`.
- **Reglas y validaciones:** quien la creó o el líder, con el equipo activo; no una cancelada. Mismas validaciones que al crear.
- **Errores:** `NX005` · no la creó ni es líder, o un invitado. `NX006` · no existe o está cancelada. `NX009` · equipo archivado. `NX010` · datos inválidos.
- **Tablas que toca:** escritura `reuniones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `reunion.editada`.
- **Lo llama:** `repositorios/vistas.ts` → `editarReunion()`; `PATCH /equipos/:equipoId/reuniones/:id`.
- **Pruebas:** `pruebas_procesos.sql` P85; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_reunion_editar($1, $2, $3, '{"lugar": "Sala 2"}')`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_reunion_cancelar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Cancelar una reunión (toda la serie).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_reunion_id uuid`.
- **Retorno:** `jsonb` `{ cancelada: true }`.
- **Reglas y validaciones:** quien la creó o el líder, con el equipo activo. Avisa a quienes no habían dicho que no.
- **Errores:** `NX005` · no la creó ni es líder. `NX006` · no existe o ya está cancelada. `NX009` · equipo archivado.
- **Tablas que toca:** escritura `reuniones`, `notificaciones`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `reunion.cancelada`.
- **Lo llama:** `repositorios/vistas.ts` → `cancelarReunion()`; `POST /equipos/:equipoId/reuniones/:id/cancelar`.
- **Pruebas:** `pruebas_procesos.sql` P86; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_reunion_cancelar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_reunion_responder
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Responder la asistencia a una reunión.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_reunion_id uuid`. `p_respuesta text` · `si` | `no` | `quiza`.
- **Retorno:** `jsonb` `Reunion`.
- **Reglas y validaciones:** líder o integrante, con el equipo activo; la respuesta vale para toda la serie.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404). `NX006` · no existe o está cancelada. `NX009` · equipo archivado. `NX010` · respuesta inválida.
- **Tablas que toca:** escritura `reunion_asistencia`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/vistas.ts` → `responderReunion()`; `POST /equipos/:equipoId/reuniones/:id/asistencia`.
- **Pruebas:** `pruebas_procesos.sql` P87; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_reunion_responder($1, $2, $3, 'si')`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_actividad_listar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Registro de actividad del equipo (EQ-18).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tipo text` · `tarea` | `sprint` | `reunion` | `equipo` o nulo. `p_antes timestamptz` · para paginar. `p_limite int` · de 1 a 100 (50).
- **Retorno:** `jsonb` `{ items[], hay_mas }`; cada item con `tipo`, `accion`, `resumen`, `autor`, `objeto_tipo`, `objeto_id` y `creado_en`, del más reciente al más antiguo.
- **Reglas y validaciones:** los invitados no lo ven. Las notas y los votos de la retrospectiva no generan actividad (anonimato, DEC-031).
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404). `NX010` · tipo inválido.
- **Tablas que toca:** lectura `actividad`, `usuarios`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `actividad()`; `GET /equipos/:equipoId/actividad?tipo=&antes=`.
- **Pruebas:** `pruebas_procesos.sql` P88; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_actividad_listar($1, $2, 'tarea', null, 50)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_notificacion_listar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Notificaciones de la persona (NT-01).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_solo_no_leidas boolean`. `p_limite int` · de 1 a 100 (50).
- **Retorno:** `jsonb` `{ no_leidas, items[] }`; cada item con `equipo` (nombre), `categoria`, `titulo`, `texto`, `enlace`, `accion_tipo`, `creada_en` y `leida_en`.
- **Reglas y validaciones:** solo las del actor; no dependen de un equipo (una persona expulsada recibe la suya).
- **Errores:** ninguno.
- **Tablas que toca:** lectura `notificaciones`, `equipos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `notificaciones()`; `GET /notificaciones`.
- **Pruebas:** `pruebas_procesos.sql` P89; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_notificacion_listar($1, false, 50)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_notificacion_marcar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Marcar notificaciones como leídas (NT-01).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_id uuid` · una notificación, o nulo para todas.
- **Retorno:** `jsonb` `{ no_leidas }`.
- **Reglas y validaciones:** solo las del actor.
- **Errores:** `NX006` · la notificación no es del actor.
- **Tablas que toca:** escritura `notificaciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/vistas.ts` → `marcarNotificacion()`; `POST /notificaciones/leidas` y `POST /notificaciones/:id/leida`.
- **Pruebas:** `pruebas_procesos.sql` P90; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_notificacion_marcar($1, null)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_reporte_equipo
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Reporte del equipo (EQ-16).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `ReporteEquipo`: `por_estado{}`, `completadas`, `a_tiempo`, `con_retraso`, `vencidas`, `por_persona[]` (abiertas, completadas y a tiempo de cada miembro) y `sprints[]` (los últimos 6 iniciados con su total y completadas).
- **Reglas y validaciones:** los invitados no lo ven; no cuenta archivadas.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `tareas`, `sprints`, `sprint_instantaneas`, `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `reporte()`; `GET /equipos/:equipoId/reportes`.
- **Pruebas:** `pruebas_procesos.sql` P91; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_reporte_equipo($1, $2)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_reporte_exportar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Filas para exportar el reporte (EQ-17).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_solo_mias boolean` · solo las tareas del actor.
- **Retorno:** `jsonb` arreglo de filas (`codigo`, `titulo`, `estado`, `prioridad`, `responsable`, `sprint`, `progreso`, `vence_en`, `completada_en`, `resultado`, `creado_en`). La API arma el CSV.
- **Reglas y validaciones:** el líder exporta todo o lo suyo; un integrante **solo lo suyo** (matriz `exportar_reportes` «propio»); los invitados no.
- **Errores:** `NX005` · un invitado, o un integrante que pide todo. `NX006` · el actor no pertenece al equipo.
- **Tablas que toca:** lectura `tareas`, `usuarios`, `sprints`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `exportar()`; `GET /equipos/:equipoId/reportes/exportar?solo_mias=`.
- **Pruebas:** `pruebas_procesos.sql` P92; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_reporte_exportar($1, $2, true)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_plantilla_listar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Plantillas del equipo (EQ-20).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` arreglo de `Plantilla` (`nombre`, `tipo`, `descripcion`, `elementos[]`).
- **Reglas y validaciones:** líder e integrantes; los invitados no.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `plantillas`, `plantilla_elementos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `plantillas()`; `GET /equipos/:equipoId/plantillas`.
- **Pruebas:** `pruebas_procesos.sql` P94; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_plantilla_listar($1, $2)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_plantilla_crear
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Crear una plantilla del equipo (EQ-20).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_datos jsonb` · `{ nombre, tipo: sprint|proyecto|retro, descripcion?, elementos: text[] }`.
- **Retorno:** `jsonb` `Plantilla`.
- **Reglas y validaciones:** solo el líder (matriz `crear_plantilla`), con el equipo activo. De 1 a 30 elementos de 1 a 140 caracteres; nombre de 1 a 80.
- **Errores:** `NX005` · no es el líder. `NX009` · equipo archivado. `NX010` · datos inválidos.
- **Tablas que toca:** escritura `plantillas`, `plantilla_elementos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.plantilla_creada`.
- **Lo llama:** `repositorios/vistas.ts` → `crearPlantilla()`; `POST /equipos/:equipoId/plantillas`.
- **Pruebas:** `pruebas_procesos.sql` P93; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_plantilla_crear($1, $2, '{"nombre": "Arranque", "tipo": "proyecto", "elementos": ["CI"]}')`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_plantilla_eliminar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Eliminar una plantilla del equipo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_plantilla_id uuid`.
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** solo el líder, con el equipo activo.
- **Errores:** `NX005` · no es el líder. `NX006` · la plantilla no es del equipo. `NX009` · equipo archivado.
- **Tablas que toca:** escritura `plantillas`, `plantilla_elementos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.plantilla_eliminada`.
- **Lo llama:** `repositorios/vistas.ts` → `eliminarPlantilla()`; `DELETE /equipos/:equipoId/plantillas/:id`.
- **Pruebas:** `pruebas_procesos.sql` P96; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_plantilla_eliminar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_plantilla_usar
- **Migración:** `0011_procesos_vistas.sql`
- **Propósito:** Usar una plantilla de proyecto: propone sus elementos como tareas.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_plantilla_id uuid`.
- **Retorno:** `jsonb` `{ creadas }`.
- **Reglas y validaciones:** solo el líder (las tareas nacen como **propuestas** y van a votación, DEC-024). Solo las plantillas de tipo `proyecto` crean tareas; las de sprint y retrospectiva son guías.
- **Errores:** `NX005` · no es el líder. `NX006` · la plantilla no es del equipo. `NX007` · es una guía. `NX009` · equipo archivado.
- **Tablas que toca:** escritura `tareas`, `subtareas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.propuestas_de_plantilla`.
- **Lo llama:** `repositorios/vistas.ts` → `usarPlantilla()`; `POST /equipos/:equipoId/plantillas/:id/usar`.
- **Pruebas:** `pruebas_procesos.sql` P95; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_plantilla_usar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0011`.

### proc_archivo_listar
- **Migración:** `0012_archivos.sql`
- **Propósito:** Archivos del equipo o de una tarea (EQ-19).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_tarea_id uuid` · opcional.
- **Retorno:** `jsonb` arreglo de `Archivo` (`nombre`, `mime`, `tipo`, `tamano_bytes`, `subido_por`, `tarea`, `puedo_eliminar`), los más recientes primero.
- **Reglas y validaciones:** líder e integrantes; los invitados no (matriz `ver_archivos`). No incluye los eliminados.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404).
- **Tablas que toca:** lectura `archivos`, `tareas`, `usuarios`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `archivos()`; `GET /equipos/:equipoId/archivos?tarea_id=`.
- **Pruebas:** `pruebas_procesos.sql` P98; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_archivo_listar($1, $2, null)`
- **Historial:** 2026-11-18 · creación · `0012`.

### proc_archivo_subir
- **Migración:** `0012_archivos.sql`
- **Propósito:** Subir un archivo, opcionalmente adjunto a una tarea (EQ-19).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_nombre text`, `p_mime text`, `p_datos bytea`, `p_tarea_id uuid` · opcional.
- **Retorno:** `jsonb` `Archivo`.
- **Reglas y validaciones:** líder e integrantes (matriz `adjuntar_archivos`), con el equipo activo. **Máximo 5 MB** y solo los tipos de `fn_archivo_tipo`: PDF, imágenes PNG/JPEG/GIF/WebP, texto, Markdown, CSV, documentos y hojas de Office y OpenDocument, presentaciones .pptx y ZIP (ni ejecutables ni SVG). Guarda el SHA-256. El contenido va a `archivo_contenidos` (DEC-033).
- **Errores:** `NX005` · un invitado. `NX006` · la tarea no es del equipo. `NX009` · equipo archivado. `NX010` · tipo no permitido, tamaño o nombre inválido.
- **Tablas que toca:** escritura `archivos`, `archivo_contenidos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.archivo_subido`, o `tarea.archivo_adjuntado` (en el historial de la tarea).
- **Lo llama:** `repositorios/vistas.ts` → `subirArchivo()`; `POST /equipos/:equipoId/archivos`.
- **Pruebas:** `pruebas_procesos.sql` P97; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_archivo_subir($1, $2, 'notas.txt', 'text/plain', $3, null)`
- **Historial:** 2026-11-18 · creación · `0012`.

### proc_archivo_descargar
- **Migración:** `0012_archivos.sql`
- **Propósito:** Contenido de un archivo para descargarlo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_archivo_id uuid`.
- **Retorno:** `jsonb` `{ nombre, mime, contenido }` (base64); la API lo entrega como binario con `Content-Disposition: attachment`.
- **Reglas y validaciones:** líder e integrantes; no los eliminados.
- **Errores:** `NX005` · un invitado. `NX006` · el actor no pertenece al equipo (404). `NX006` · el archivo no es del equipo o se eliminó.
- **Tablas que toca:** lectura `archivos`, `archivo_contenidos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/vistas.ts` → `descargarArchivo()`; `GET /equipos/:equipoId/archivos/:id/descarga`.
- **Pruebas:** `pruebas_procesos.sql` P99; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_archivo_descargar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0012`.

### proc_archivo_eliminar
- **Migración:** `0012_archivos.sql`
- **Propósito:** Eliminar un archivo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo. `p_archivo_id uuid`.
- **Retorno:** `jsonb` `{ eliminado: true }`.
- **Reglas y validaciones:** quien lo subió o el líder, con el equipo activo. Se borra el contenido y el registro queda con `eliminado_en`.
- **Errores:** `NX005` · no lo subió ni es líder, o un invitado. `NX006` · no existe o ya se eliminó. `NX009` · equipo archivado.
- **Tablas que toca:** escritura `archivos`, `archivo_contenidos`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.archivo_eliminado`.
- **Lo llama:** `repositorios/vistas.ts` → `eliminarArchivo()`; `DELETE /equipos/:equipoId/archivos/:id`.
- **Pruebas:** `pruebas_procesos.sql` P100; `vistas.test.ts`.
- **Ejemplo de llamada:** `select proc_archivo_eliminar($1, $2, $3)`
- **Historial:** 2026-11-18 · creación · `0012`.

### proc_usuario_ajustes
- **Migración:** `0013_procesos_ajustes.sql`
- **Propósito:** Ajustes de avisos y privacidad de la persona (PF-04, PF-06).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta.
- **Retorno:** `jsonb` `AjustesUsuario`: `silencio_desde`, `silencio_hasta` («HH:MM» o null), `resumen_diario`, `estado_visible`, `primer_dia` y `notificaciones[]` con `evento`, `por_app`, `por_whatsapp` y `por_correo` para cada aviso configurable (`fn_eventos_notificacion`).
- **Reglas y validaciones:** solo los del actor. Si nunca los cambió, devuelve los valores por defecto (avisos en la app, sin WhatsApp ni correo, sin silencio, estado visible).
- **Errores:** ninguno propio.
- **Tablas que toca:** lectura `preferencias_usuario` (la crea si falta), `preferencias_notificacion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/ajustes.ts` → `obtener()`; `GET /yo/ajustes`.
- **Pruebas:** `pruebas_procesos.sql` P101; `ajustes.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_ajustes($1)`
- **Historial:** 2026-11-18 · creación · `0013`.

### proc_usuario_ajustes_guardar
- **Migración:** `0013_procesos_ajustes.sql`
- **Propósito:** Guardar los ajustes de avisos y privacidad (PF-04, PF-06).
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_cambios jsonb` · solo lo que cambia: `silencio_desde` y `silencio_hasta` (juntos), `resumen_diario`, `estado_visible`, `primer_dia` (`lunes` | `domingo`) y `notificaciones[]`.
- **Retorno:** `jsonb` `AjustesUsuario`.
- **Reglas y validaciones:** solo los del actor. Las horas de silencio van completas (inicio y fin) y en formato válido; los avisos deben ser de la lista; `primer_dia` lo valida el `CHECK` de la tabla. Los canales WhatsApp y correo se guardan, pero los envíos llegan en las Fases 4 y 5 (DEC-034).
- **Errores:** `NX010` · silencio incompleto, hora inválida, aviso desconocido o día inválido.
- **Tablas que toca:** escritura `preferencias_usuario`, `preferencias_notificacion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/ajustes.ts` → `guardar()`; `PATCH /yo/ajustes`.
- **Pruebas:** `pruebas_procesos.sql` P102; `ajustes.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_ajustes_guardar($1, '{"estado_visible": false}')`
- **Historial:** 2026-11-18 · creación · `0013`.

### proc_reporte_personal
- **Migración:** `0013_procesos_ajustes.sql`
- **Propósito:** Reporte personal (FALT-01): tareas personales y las de equipo a tu cargo.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta.
- **Retorno:** `jsonb` `ReportePersonal`: `por_estado{}`, `completadas`, `a_tiempo`, `con_retraso`, `vencidas` y `por_espacio[]` (el espacio personal y cada equipo con sus abiertas y completadas).
- **Reglas y validaciones:** cuenta las tareas personales del actor y las de equipo de las que es responsable **solo en los equipos donde sigue activo**; no cuenta archivadas.
- **Errores:** ninguno propio.
- **Tablas que toca:** lectura `tareas`, `membresias`, `equipos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/ajustes.ts` → `reportePersonal()`; `GET /personal/reporte`.
- **Pruebas:** `pruebas_procesos.sql` P103; `ajustes.test.ts`.
- **Ejemplo de llamada:** `select proc_reporte_personal($1)`
- **Historial:** 2026-11-18 · creación · `0013`.

---

## Fase 4 · Chat

Procesos del chat en tiempo real (`03`, tarea 4.1; DEC-CHAT-1 en `decisiones.md`). Migraciones `0014` a `0016` (el rango `0014`–`0019` es del chat; WhatsApp numera desde `0031`, DEC-AUTH-2). Pruebas `P104`–`P129` en `pruebas_procesos.sql` (rango reservado `P104`–`P149`) y `apps/api/src/rutas/chat.test.ts`.

**Regla única de acceso (`fn_chat_puede`).** `equipo`: líder e integrantes. `invitados`: todos los miembros activos, invitados incluidos. `tarea`: líder e integrantes; un invitado solo si la tarea está compartida con su membresía. `dm`: solo las dos personas, y las dos deben seguir siendo líder o integrante activos. Un invitado con el acceso caducado no ve nada (`NX005 acceso_caducado`). Quien no tiene acceso recibe `NX006` (404), como si la conversación no existiera. `fn_chat_exigir` aplica la regla y la usan todos los procesos que reciben una conversación o un mensaje.

**Eventos.** Los mensajes **no** generan eventos de dominio ni actividad (no entran al registro del equipo ni al despachador de WhatsApp). Solo `proc_chat_mensaje_a_tarea` registra `tarea.propuesta`/`tarea.creada`, como `proc_tarea_proponer`. Las menciones crean una notificación (`fn_notificar`, categoría `menciones`, acción `abrir_chat`).

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_chat_conversaciones` | Chat (lectura) | `0014_procesos_chat_lectura.sql` | Vigente |
| `proc_chat_mensajes` | Chat (lectura) | `0014_procesos_chat_lectura.sql` | Vigente |
| `proc_chat_hilo` | Chat (lectura) | `0014_procesos_chat_lectura.sql` | Vigente |
| `proc_chat_fijados` | Chat (lectura) | `0014_procesos_chat_lectura.sql` | Vigente |
| `proc_chat_miembros` | Chat (lectura) | `0014_procesos_chat_lectura.sql` | Vigente |
| `proc_chat_salas` | Chat (lectura, tiempo real) | `0014_procesos_chat_lectura.sql` | Vigente |
| `proc_chat_enviar` | Chat | `0015_procesos_chat_envio.sql` | Vigente |
| `proc_chat_eliminar` | Chat · moderación | `0015_procesos_chat_envio.sql` | Vigente |
| `proc_chat_fijar` | Chat · moderación | `0015_procesos_chat_envio.sql` | Vigente |
| `proc_chat_reaccionar` | Chat | `0015_procesos_chat_envio.sql` | Vigente |
| `proc_chat_leer` | Chat | `0015_procesos_chat_envio.sql` | Vigente |
| `proc_chat_preferencias` | Chat | `0015_procesos_chat_envio.sql` | Vigente |
| `proc_chat_conversacion_tarea` | Chat | `0016_procesos_chat_conversaciones.sql` | Vigente |
| `proc_chat_dm_abrir` | Chat | `0016_procesos_chat_conversaciones.sql` | Vigente |
| `proc_chat_buscar` | Chat (lectura) | `0016_procesos_chat_conversaciones.sql` | Vigente |
| `proc_chat_mensaje_a_tarea` | Chat · tareas | `0016_procesos_chat_conversaciones.sql` | Vigente |

Auxiliares nuevos (solo los ejecuta el dueño): `fn_chat_puede`, `fn_chat_exigir`, `fn_chat_reacciones_json`, `fn_chat_mensaje_json`, `fn_chat_conversacion_json`. Índice nuevo: `ix_menciones_usuario` en `mensaje_menciones(usuario_id)`.

### proc_chat_conversaciones
- **Migración:** `0014_procesos_chat_lectura.sql`
- **Propósito:** CH-01: conversaciones del equipo que la persona puede ver.
- **Parámetros:** `p_actor_id uuid` · quién ejecuta. `p_equipo_id uuid` · equipo.
- **Retorno:** `jsonb` `ConversacionChat[]`: `{ id, equipo_id, tipo, nombre, tarea, con, ultimo, no_leidos, menciones_sin_leer, fijada, silenciada }`, primero las fijadas y luego por actividad reciente.
- **Reglas y validaciones:** solo las que pasan `fn_chat_puede`; los chats de tarea salen cuando tienen al menos un mensaje que no es de sistema. `nombre` según el tipo (canal, «Invitados», «T-01 · título» o el nombre de la otra persona). `no_leidos` cuenta mensajes ajenos, no eliminados y no de sistema posteriores al puntero de lectura; sin puntero, solo los posteriores a que la persona entró al equipo (`membresias.desde`). `ultimo` ignora los eliminados.
- **Errores:** `NX006` · no pertenece al equipo. `NX005` · invitado con acceso caducado.
- **Tablas que toca:** lectura `conversaciones`, `mensajes`, `mensaje_menciones`, `conversacion_lecturas`, `membresias`, `tarea_compartida`, `tareas`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `conversaciones()`; `GET /equipos/:equipoId/chat/conversaciones`.
- **Pruebas:** P110, P111, P115, P119, P129; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_conversaciones($1, $2)`
- **Historial:** 2026-11-19 · creación · `0014`.

### proc_chat_mensajes
- **Migración:** `0014_procesos_chat_lectura.sql`
- **Propósito:** CH-02, CH-03, CH-04, CH-10: una página de mensajes de la conversación.
- **Parámetros:** `p_actor_id uuid`. `p_conversacion_id uuid`. `p_antes bigint` (opcional) · `seq` del mensaje más antiguo ya cargado. `p_limite int` (opcional, 40; entre 1 y 100).
- **Retorno:** `jsonb` `{ conversacion: ConversacionChat, items: MensajeChat[], hay_mas }`; los `items` van del más antiguo al más nuevo. Un `MensajeChat` lleva autor, texto (vacío si se eliminó), `eliminado`, `hilo_de_id`, `respuestas`, `fijado`, `tarea` ligada, `reacciones[] { tipo, total, yo }`, `menciones[]`, `leido_por` y fechas.
- **Reglas y validaciones:** acceso por `fn_chat_exigir`; no incluye las respuestas de hilo (se cuentan en `respuestas` de la raíz); `leido_por` cuenta los punteros que llegaron al mensaje, sin el autor.
- **Errores:** `NX006` · conversación inexistente o sin acceso. `NX005` · acceso caducado.
- **Tablas que toca:** lectura `mensajes`, `conversaciones`, `mensaje_reacciones`, `mensaje_menciones`, `conversacion_lecturas`, `tareas`, `membresias`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `mensajes()`; `GET /chat/conversaciones/:id/mensajes?antes&limite`.
- **Pruebas:** P104, P109, P127, P128; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_mensajes($1, $2, null, 40)`
- **Historial:** 2026-11-19 · creación · `0014`.

### proc_chat_hilo
- **Migración:** `0014_procesos_chat_lectura.sql`
- **Propósito:** CH-05: un hilo completo.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid` · la raíz o cualquiera de sus respuestas.
- **Retorno:** `jsonb` `{ raiz: MensajeChat, respuestas: MensajeChat[] }` (respuestas de la más antigua a la más nueva).
- **Reglas y validaciones:** acceso a la conversación del mensaje.
- **Errores:** `NX006` · mensaje inexistente o sin acceso.
- **Tablas que toca:** lectura `mensajes` y las del JSON del mensaje.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `hilo()`; `GET /chat/mensajes/:id/hilo`.
- **Pruebas:** P107; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_hilo($1, $2)`
- **Historial:** 2026-11-19 · creación · `0014`.

### proc_chat_fijados
- **Migración:** `0014_procesos_chat_lectura.sql`
- **Propósito:** CH-06: mensajes fijados de la conversación.
- **Parámetros:** `p_actor_id uuid`. `p_conversacion_id uuid`.
- **Retorno:** `jsonb` `MensajeChat[]`, el más reciente primero.
- **Reglas y validaciones:** acceso a la conversación; no incluye eliminados.
- **Errores:** `NX006` · sin acceso.
- **Tablas que toca:** lectura `mensajes` y las del JSON del mensaje.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `fijados()`; `GET /chat/conversaciones/:id/fijados`.
- **Pruebas:** P117; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_fijados($1, $2)`
- **Historial:** 2026-11-19 · creación · `0014`.

### proc_chat_miembros
- **Migración:** `0014_procesos_chat_lectura.sql`
- **Propósito:** personas con acceso a la conversación **en este momento** (menciones con @ y audiencia del tiempo real).
- **Parámetros:** `p_actor_id uuid`. `p_conversacion_id uuid`.
- **Retorno:** `jsonb` `{ usuario_id, nombre, color_idx, rol }[]` (líder primero, por color).
- **Reglas y validaciones:** el actor debe tener acceso; cada miembro activo pasa por `fn_chat_puede`. Se calcula en cada llamada: si se deja de compartir una tarea o alguien sale, deja de aparecer.
- **Errores:** `NX006` · sin acceso.
- **Tablas que toca:** lectura `membresias`, `usuarios`, `conversaciones`, `tarea_compartida`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `miembros()`; `GET /chat/conversaciones/:id/miembros` y `tiempoReal.ts` (antes de cada emisión).
- **Pruebas:** P113, P120, P127; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_miembros($1, $2)`
- **Historial:** 2026-11-19 · creación · `0014`.

### proc_chat_salas
- **Migración:** `0014_procesos_chat_lectura.sql`
- **Propósito:** salas de Socket.IO de una persona: todas las conversaciones que puede ver en sus equipos activos.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ conversacion_id, equipo_id }[]`.
- **Reglas y validaciones:** solo equipos con membresía activa y conversaciones que pasan `fn_chat_puede`; el cliente no elige salas.
- **Errores:** ninguno propio (sin equipos devuelve `[]`).
- **Tablas que toca:** lectura `conversaciones`, `membresias`, `tarea_compartida`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `salas()`; `tiempoReal.ts` al conectar y en `chat:sincronizar`.
- **Pruebas:** P113, P121, P127.
- **Ejemplo de llamada:** `select proc_chat_salas($1)`
- **Historial:** 2026-11-19 · creación · `0014`.

### proc_chat_enviar
- **Migración:** `0015_procesos_chat_envio.sql`
- **Propósito:** CH-02 y CH-05: escribir un mensaje o una respuesta de hilo.
- **Parámetros:** `p_actor_id uuid`. `p_conversacion_id uuid`. `p_datos jsonb` · `{ texto, hilo_de_id?, id_cliente?, menciones?: uuid[] }`.
- **Retorno:** `jsonb` `MensajeChat`.
- **Reglas y validaciones:** acceso a la conversación; equipo no archivado; texto recortado de 1 a 4000 caracteres. `hilo_de_id` debe ser un mensaje vivo, no de sistema, de la misma conversación; si es una respuesta se usa su raíz (hilos de un nivel). `id_cliente`: reenviar el mismo devuelve el mensaje ya guardado (RN-CHT-02); si lo usó otra persona, `NX012`. Menciones: solo cuentan las personas con acceso a la conversación y no uno mismo; cada una recibe una notificación salvo que haya apagado «mencion» en la app (`preferencias_notificacion`). El puntero de lectura del autor avanza a su mensaje.
- **Errores:** `NX006` · sin acceso. `NX009` · equipo archivado. `NX010` · texto vacío o largo, identificador inválido o hilo inválido. `NX012` · `id_cliente` de otra persona.
- **Tablas que toca:** escritura `mensajes`, `mensaje_menciones`, `conversacion_lecturas`, `notificaciones`; lectura `preferencias_notificacion`, `membresias`.
- **Eventos que genera:** ninguno (solo notificaciones de mención).
- **Lo llama:** `repositorios/chat.ts` → `enviar()`; `POST /chat/conversaciones/:id/mensajes` (emite `chat:mensaje`).
- **Pruebas:** P105, P106, P107, P108; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_enviar($1, $2, '{"texto": "Hola"}')`
- **Historial:** 2026-11-19 · creación · `0015`.

### proc_chat_eliminar
- **Migración:** `0015_procesos_chat_envio.sql`
- **Propósito:** eliminar un mensaje (borrado lógico) y moderación del líder.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid`.
- **Retorno:** `jsonb` `MensajeChat` (`eliminado: true`, texto vacío).
- **Reglas y validaciones:** cada quien borra lo suyo; el líder borra también lo ajeno y los mensajes de sistema, pero solo donde tiene acceso (no los mensajes directos ajenos). Se guarda `eliminado_por` y el mensaje se desfija. Borrar dos veces no falla.
- **Errores:** `NX005` · borrar lo ajeno sin ser líder. `NX006` · mensaje inexistente o sin acceso. `NX009` · equipo archivado.
- **Tablas que toca:** escritura `mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `eliminar()`; `DELETE /chat/mensajes/:id` (emite `chat:mensaje_actualizado`).
- **Pruebas:** P116; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_eliminar($1, $2)`
- **Historial:** 2026-11-19 · creación · `0015`.

### proc_chat_fijar
- **Migración:** `0015_procesos_chat_envio.sql`
- **Propósito:** CH-06: el líder fija o desfija un mensaje.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid`. `p_fijado boolean`.
- **Retorno:** `jsonb` `MensajeChat`.
- **Reglas y validaciones:** solo el líder (matriz: `moderar_chat`); solo en canales y chats de tarea; no se fijan respuestas de hilo ni mensajes eliminados.
- **Errores:** `NX005` · no es el líder. `NX006` · sin acceso. `NX007` · directo, respuesta o eliminado. `NX009` · equipo archivado.
- **Tablas que toca:** escritura `mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `fijar()`; `POST /chat/mensajes/:id/fijar` (emite `chat:mensaje_actualizado`).
- **Pruebas:** P116, P117; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_fijar($1, $2, true)`
- **Historial:** 2026-11-19 · creación · `0015`.

### proc_chat_reaccionar
- **Migración:** `0015_procesos_chat_envio.sql`
- **Propósito:** reaccionar a un mensaje (6 tipos de `tipo_reaccion`); repetir el tipo lo quita.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid`. `p_tipo text`.
- **Retorno:** `jsonb` `{ mensaje_id, conversacion_id, reacciones[] }`.
- **Reglas y validaciones:** acceso a la conversación; equipo activo; no a mensajes eliminados ni de sistema; una reacción de cada tipo por persona (clave primaria).
- **Errores:** `NX006` · sin acceso. `NX007` · mensaje eliminado o de sistema. `NX009` · archivado. `NX010` · tipo inexistente.
- **Tablas que toca:** escritura `mensaje_reacciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `reaccionar()`; `POST /chat/mensajes/:id/reaccion` (emite `chat:reaccion`).
- **Pruebas:** P118; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_reaccionar($1, $2, 'hecho')`
- **Historial:** 2026-11-19 · creación · `0015`.

### proc_chat_leer
- **Migración:** `0015_procesos_chat_envio.sql`
- **Propósito:** avanzar el puntero de lectura (`conversacion_lecturas`).
- **Parámetros:** `p_actor_id uuid`. `p_conversacion_id uuid`. `p_hasta_seq bigint`.
- **Retorno:** `jsonb` `{ conversacion_id, ultimo_leido_seq, no_leidos }`.
- **Reglas y validaciones:** acceso a la conversación; nunca retrocede ni pasa del último mensaje. Funciona también en un equipo archivado.
- **Errores:** `NX006` · sin acceso.
- **Tablas que toca:** escritura `conversacion_lecturas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `leer()`; `POST /chat/conversaciones/:id/lectura` (emite `chat:lectura`).
- **Pruebas:** P110, P126, P128; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_leer($1, $2, 120)`
- **Historial:** 2026-11-19 · creación · `0015`.

### proc_chat_preferencias
- **Migración:** `0015_procesos_chat_envio.sql`
- **Propósito:** fijar arriba o silenciar una conversación, solo para quien lo pide.
- **Parámetros:** `p_actor_id uuid`. `p_conversacion_id uuid`. `p_cambios jsonb` · `{ fijada?, silenciada? }`.
- **Retorno:** `jsonb` `ConversacionChat`.
- **Reglas y validaciones:** acceso a la conversación; lo que no viene se conserva.
- **Errores:** `NX006` · sin acceso.
- **Tablas que toca:** escritura `conversacion_lecturas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `preferencias()`; `PATCH /chat/conversaciones/:id/preferencias`.
- **Pruebas:** P119.
- **Ejemplo de llamada:** `select proc_chat_preferencias($1, $2, '{"silenciada": true}')`
- **Historial:** 2026-11-19 · creación · `0015`.

### proc_chat_conversacion_tarea
- **Migración:** `0016_procesos_chat_conversaciones.sql`
- **Propósito:** CH-03: abrir (y la primera vez crear) el chat de una tarea.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tarea_id uuid`.
- **Retorno:** `jsonb` `ConversacionChat`.
- **Reglas y validaciones:** la tarea debe ser del equipo; un invitado solo abre tareas compartidas con él. Un chat por tarea (`ux_conv_tarea`, con `ON CONFLICT DO NOTHING` ante dos aperturas a la vez). Un equipo archivado no crea chats nuevos, pero abre los existentes.
- **Errores:** `NX006` · tarea ajena, inexistente o no compartida. `NX009` · crear en equipo archivado.
- **Tablas que toca:** lectura `tareas`, `tarea_compartida`, `membresias`; escritura `conversaciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `conversacionTarea()`; `POST /equipos/:equipoId/chat/tareas/:tareaId/conversacion` (la web: botón del detalle de la tarea y ruta `chat/tarea/:tareaId`).
- **Pruebas:** P111, P112, P113, P126; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_conversacion_tarea($1, $2, $3)`
- **Historial:** 2026-11-19 · creación · `0016`.

### proc_chat_dm_abrir
- **Migración:** `0016_procesos_chat_conversaciones.sql`
- **Propósito:** CH-04 y CH-07: abrir (y la primera vez crear) el mensaje directo con otra persona del equipo.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_otro_id uuid`.
- **Retorno:** `jsonb` `ConversacionChat` (nombre = la otra persona).
- **Reglas y validaciones:** solo entre líder e integrantes activos (matriz: `mensajes_directos`); no a uno mismo; una conversación por pareja (par ordenado `dm_usuario_a < dm_usuario_b`, `ux_conv_dm`). Nadie más la ve, ni el líder.
- **Errores:** `NX005` · el actor es invitado. `NX006` · el actor no es del equipo. `NX009` · crear en equipo archivado. `NX010` · destinatario inválido (uno mismo, invitado o ajeno).
- **Tablas que toca:** lectura `membresias`; escritura `conversaciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/chat.ts` → `abrirDm()`; `POST /equipos/:equipoId/chat/dm`.
- **Pruebas:** P111, P114, P115, P126; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_dm_abrir($1, $2, $3)`
- **Historial:** 2026-11-19 · creación · `0016`.

### proc_chat_buscar
- **Migración:** `0016_procesos_chat_conversaciones.sql`
- **Propósito:** CH-08: buscar texto en español en el chat del equipo.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_texto text` (2 a 100). `p_conversacion_id uuid` (opcional). `p_limite int` (opcional, 30; hasta 50).
- **Retorno:** `jsonb` `{ mensaje_id, seq, conversacion_id, tipo, conversacion, autor, fragmento, creado_en }[]` ordenado por relevancia; el fragmento marca lo hallado con «…».
- **Reglas y validaciones:** `websearch_to_tsquery('spanish', …)` sobre el índice `ix_mensajes_busqueda`; solo conversaciones que pasan `fn_chat_puede`; sin eliminados ni mensajes de sistema. Una búsqueda solo de palabras vacías («nosotros», «de») devuelve `[]`.
- **Errores:** `NX006` · no pertenece al equipo. `NX010` · texto fuera de largo.
- **Tablas que toca:** lectura `mensajes`, `conversaciones`, `membresias`, `tarea_compartida`, `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/chat.ts` → `buscar()`; `GET /equipos/:equipoId/chat/buscar?q&conversacion_id`.
- **Pruebas:** P122, P123; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_buscar($1, $2, 'reunión', null, 30)`
- **Historial:** 2026-11-19 · creación · `0016`.

### proc_chat_mensaje_a_tarea
- **Migración:** `0016_procesos_chat_conversaciones.sql`
- **Propósito:** CH-09: convertir un mensaje en una propuesta de tarea.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid`. `p_datos jsonb` (opcional) · `{ titulo?, descripcion?, prioridad?, responsable_id? }`.
- **Retorno:** `jsonb` `{ tarea: { id, codigo, estado }, mensaje: MensajeChat, sistema: MensajeChat }`.
- **Reglas y validaciones:** solo el líder (como `proc_tarea_proponer`, DEC-024); equipo activo; no en mensajes directos (son privados); no mensajes eliminados ni de sistema; un mensaje se convierte una sola vez. Usa `fn_tarea_insertar_propuesta`: entra a votación (o queda aceptada si no hay integrantes). Título: el indicado o la primera línea del mensaje (hasta 140); descripción: la indicada o el mensaje completo si es más largo que el título. La tarea guarda `mensaje_origen_id`, el mensaje `tarea_vinculada_id` y la conversación recibe un mensaje de sistema.
- **Errores:** `NX005` · no es el líder o es un directo. `NX006` · sin acceso. `NX007` · eliminado o de sistema. `NX009` · archivado. `NX010` · responsable inválido. `NX012` · ya convertido.
- **Tablas que toca:** escritura `tareas`, `subtareas`, `etiquetas`, `mensajes`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.propuesta` («Valeria propuso T-12 «…» desde el chat (en votación)») o `tarea.creada`; una fila de `actividad`.
- **Lo llama:** `repositorios/chat.ts` → `mensajeATarea()`; `POST /chat/mensajes/:id/tarea`.
- **Pruebas:** P124, P125; `chat.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_mensaje_a_tarea($1, $2, '{}')`
- **Historial:** 2026-11-19 · creación · `0016`.

---

## Fase 5 · Autenticación

Procesos de la autenticación real (`03`, tarea 5.1; DEC-AUTH-1 en `decisiones.md`). Migración `0030_procesos_autenticacion.sql` (`0014`–`0019` son del chat; como el chat y la Fase 5 se despliegan antes, WhatsApp numera desde `0031`, DEC-AUTH-2). Pruebas `P200`–`P208` en `pruebas_procesos.sql` y `apps/api/src/rutas/autenticacion.test.ts`.

**La contraseña nunca llega a la BD.** La API calcula el hash Argon2id (`@node-rs/argon2`) y lo verifica; los procesos solo guardan hashes (y rechazan con `NX010` cualquier valor que no empiece con `$argon2id$`). Los tokens de los enlaces y de las sesiones se guardan como SHA-256. El bloqueo por intentos lo decide la BD.

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_auth_registrar` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_credenciales` | Autenticación (lectura) | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_entrar` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_recuperar` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_restablecer` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_verificacion_solicitar` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_verificar_correo` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_cuenta` | Autenticación (lectura) | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_hash_actual` | Autenticación (lectura) | `0030_procesos_autenticacion.sql` | Vigente |
| `proc_auth_contrasena_cambiar` | Autenticación | `0030_procesos_autenticacion.sql` | Vigente |

Auxiliares nuevos (solo los ejecuta el dueño): `fn_auth_max_intentos` (5), `fn_auth_minutos_bloqueo` (15), `fn_auth_crear_sesion`, `fn_auth_consumir_token`. Sin códigos de error nuevos: se usan `NX006`, `NX010`, `NX011` (enlace vencido, usado o anulado → 410) y `NX012` (correo ya registrado → 409).

### proc_auth_registrar
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-01: crear la cuenta y su primera sesión.
- **Parámetros:** `p_correo text`. `p_nombre text` (2 a 80). `p_hash text` · Argon2id. `p_token_hash bytea` · hash de la cookie. `p_ip text`. `p_dispositivo text`. `p_expira timestamptz`.
- **Retorno:** `jsonb` `{ usuario: UsuarioSesion }`.
- **Reglas y validaciones:** correo en minúsculas y con forma de correo; único (`citext`); crea `preferencias_usuario` y la sesión. El correo queda **sin verificar**: la cuenta se usa igual (DEC-AUTH-1).
- **Errores:** `NX010` · nombre, correo o hash inválidos. `NX012` · el correo ya tiene cuenta («Ese correo ya tiene una cuenta…»).
- **Tablas que toca:** escritura `usuarios`, `preferencias_usuario`, `sesiones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `registrar()`; `POST /auth/registro` (5 por minuto por IP).
- **Pruebas:** P200; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_registrar($1, $2, $3, $4, $5, $6, $7)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_credenciales
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-02, paso 1: el hash guardado de un correo, para que la API verifique la contraseña.
- **Parámetros:** `p_correo text`.
- **Retorno:** `jsonb` `{ usuario_id, hash }` o `NULL` si no hay cuenta con contraseña (o se eliminó).
- **Reglas y validaciones:** sin distinguir mayúsculas. Sin cuenta, la API verifica contra un hash señuelo y responde igual (no revela si el correo existe).
- **Errores:** ninguno.
- **Tablas que toca:** lectura `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/autenticacion.ts` → `credenciales()`; `POST /auth/entrar`.
- **Pruebas:** P201; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_credenciales($1)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_entrar
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-02, paso 2: registrar el resultado de la verificación y, si fue correcta, crear la sesión.
- **Parámetros:** `p_usuario_id uuid`. `p_correcta boolean`. `p_token_hash bytea`. `p_ip text`. `p_dispositivo text`. `p_expira timestamptz`.
- **Retorno:** `jsonb` `{ estado: ok | fallo | bloqueada, usuario? }`.
- **Reglas y validaciones:** con `bloqueado_hasta` en el futuro no entra aunque la contraseña sea correcta. Correcta: reinicia los intentos y crea la sesión. Incorrecta: suma un intento; al **quinto seguido** bloquea **15 minutos** y reinicia el contador. La API responde lo mismo a `fallo` y `bloqueada`. Fila bloqueada con `FOR UPDATE` (dos intentos a la vez no se pisan).
- **Errores:** ninguno (el estado va en el resultado).
- **Tablas que toca:** escritura `usuarios`, `sesiones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `entrar()`; `POST /auth/entrar` (10 por minuto por IP).
- **Pruebas:** P202, P203, P208; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_entrar($1, true, $2, $3, $4, $5)`
- **Historial:** 2026-11-19 · creación · `0030`. 2026-11-21 · verificación en dos pasos (AUTH-07): con la 2FA activa devuelve `estado: '2fa'` y crea un desafío en lugar de la sesión · `0037_dos_pasos.sql`.

### proc_auth_recuperar
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-03: crear el enlace para restablecer la contraseña.
- **Parámetros:** `p_correo text`. `p_token_hash bytea`. `p_expira timestamptz` (la API usa 1 hora).
- **Retorno:** `jsonb` `{ correo, nombre }` para enviar el correo, o `NULL` si no hay cuenta (la API responde igual: 202 con el mismo mensaje).
- **Reglas y validaciones:** anula los enlaces anteriores sin usar del mismo tipo.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `usuarios`; escritura `tokens_verificacion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `recuperar()`; `POST /auth/recuperar` (5 por minuto por IP).
- **Pruebas:** P204; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_recuperar($1, $2, $3)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_restablecer
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-05: guardar la contraseña nueva con el enlace.
- **Parámetros:** `p_token_hash bytea`. `p_hash text` · Argon2id.
- **Retorno:** `jsonb` `{ restablecida: true }`.
- **Reglas y validaciones:** el enlace es de un solo uso, del tipo correcto y vigente. Quita el bloqueo, deja el correo verificado (quien abrió el enlace lo recibió) y **cierra todas las sesiones** de la cuenta.
- **Errores:** `NX010` · hash inválido. `NX011` · enlace inexistente, usado, anulado o vencido («El enlace ya no es válido. Pide uno nuevo.»).
- **Tablas que toca:** escritura `tokens_verificacion`, `usuarios`, `sesiones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `restablecer()`; `POST /auth/restablecer`.
- **Pruebas:** P205; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_restablecer($1, $2)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_verificacion_solicitar
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-06: crear el enlace para verificar el correo de la persona con sesión.
- **Parámetros:** `p_actor_id uuid`. `p_token_hash bytea`. `p_expira timestamptz` (la API usa 24 horas).
- **Retorno:** `jsonb` `{ correo, nombre, verificado }`; si ya estaba verificado no crea enlace.
- **Reglas y validaciones:** anula los enlaces anteriores sin usar. Lo llama el registro y el botón «Enviar enlace» de Ajustes → Cuenta.
- **Errores:** `NX006` · la cuenta no existe.
- **Tablas que toca:** lectura `usuarios`; escritura `tokens_verificacion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `solicitarVerificacion()`; `POST /auth/registro` y `POST /auth/verificacion` (3 por minuto).
- **Pruebas:** P206; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_verificacion_solicitar($1, $2, $3)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_verificar_correo
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** AUTH-06: confirmar el correo con el enlace.
- **Parámetros:** `p_token_hash bytea`.
- **Retorno:** `jsonb` `{ verificado: true }`.
- **Reglas y validaciones:** un solo uso; no hace falta tener sesión; un enlace de restablecer no sirve para verificar.
- **Errores:** `NX011` · enlace inexistente, usado, anulado o vencido.
- **Tablas que toca:** escritura `tokens_verificacion`, `usuarios`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `verificarCorreo()`; `POST /auth/verificar`.
- **Pruebas:** P206; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_verificar_correo($1)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_cuenta
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** PF-02: estado de la cuenta.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ correo, correo_verificado, tiene_contrasena, sesiones_activas }`.
- **Reglas y validaciones:** solo la del actor.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `usuarios`, `sesiones`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/autenticacion.ts` → `cuenta()`; `GET /auth/cuenta`.
- **Pruebas:** P207; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_cuenta($1)`
- **Historial:** 2026-11-19 · creación · `0030`. 2026-11-21 · verificación en dos pasos (AUTH-07): suma `dos_pasos` · `0037_dos_pasos.sql`. 2026-11-21 · suma `google` (cuenta de Google vinculada) · `0038_google.sql`.

### proc_auth_hash_actual
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** PF-02, paso 1: el hash del actor, para verificar la contraseña actual antes de cambiarla.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ hash }` (`null` si la cuenta no tiene contraseña).
- **Reglas y validaciones:** solo la del actor.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `usuarios`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/autenticacion.ts` → `hashActual()`; `POST /auth/contrasena`.
- **Pruebas:** P207; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_hash_actual($1)`
- **Historial:** 2026-11-19 · creación · `0030`.

### proc_auth_contrasena_cambiar
- **Migración:** `0030_procesos_autenticacion.sql`
- **Propósito:** PF-02, paso 2: guardar la contraseña nueva.
- **Parámetros:** `p_actor_id uuid`. `p_sesion_id uuid` · la sesión actual, que se conserva. `p_hash text` · Argon2id.
- **Retorno:** `jsonb` `{ cambiada: true, sesiones_cerradas }`.
- **Reglas y validaciones:** cierra todas las demás sesiones de la cuenta.
- **Errores:** `NX006` · la cuenta no existe. `NX010` · hash inválido.
- **Tablas que toca:** escritura `usuarios`, `sesiones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `cambiarContrasena()`; `POST /auth/contrasena` (5 por minuto).
- **Pruebas:** P207; `autenticacion.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_contrasena_cambiar($1, $2, $3)`
- **Historial:** 2026-11-19 · creación · `0030`.

---

## Fase 4 · WhatsApp

Procesos de WhatsApp (`03`, tareas 4.2 y 4.3; DEC-WA-1 en `decisiones.md`). Migración `0031_procesos_whatsapp.sql` (WhatsApp numera desde `0031` porque el chat y la autenticación se desplegaron antes, DEC-AUTH-2). Pruebas `P150`–`P169` en `pruebas_procesos.sql`, `apps/api/src/rutas/whatsapp.test.ts` y el flujo extremo a extremo «3b» de `apps/web/e2e/flujos.e2e.ts`.

**Esquema (solo agrega):** `whatsapp_configuracion.envio_automatico` y `.ultimo_reporte_en`; `whatsapp_mensajes.entregado_en`, `.leido_en` y `.reporte_id`; índices `ix_wa_msj_pendientes` (Q4 de `02` §13) e `ix_wa_msj_proveedor_id` (estados del webhook; idea de la rama de Isac). La migración marca como procesados los eventos anteriores: el despachador empieza desde ahí.

**Ciclo de un aviso.** Evento de dominio → `proc_wa_procesar_eventos` (según `whatsapp_reglas`: «instantáneo» a la cola, «reporte» al próximo resumen, «apagado» nada) → el líder revisa y envía (`proc_wa_enviar`) o el envío automático (`proc_wa_por_enviar`) → `enviando` → `proc_wa_envio_resultado` → `enviado` | `fallido`. Los reportes los arma `proc_wa_reportes` a la hora fijada. Los procesos de sistema (sin actor) los corre cada minuto el temporizador de la API (`trabajos/whatsapp.ts`).

**Consentimiento (WA-07).** `fn_wa_mencion` solo nombra («@Nombre») a quien tiene `membresias.consentimiento_wa = true`; sin consentimiento el texto no la nombra. El envío directo solo llega a quien tiene número, consentimiento general y del equipo.

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_wa_procesar_eventos` | WhatsApp · sistema | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_vencimientos` | WhatsApp · sistema | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_reportes` | WhatsApp · sistema | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_por_enviar` | WhatsApp · sistema | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_envio_resultado` | WhatsApp · sistema | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_webhook_registrar` | WhatsApp · sistema (4.3) | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_panel` | WhatsApp (lectura) | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_cola` | WhatsApp (lectura) | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_historial` | WhatsApp (lectura) | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_mensaje_editar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_descartar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_reintentar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_enviar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_conectar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_desconectar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_configurar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_regla_guardar` | WhatsApp | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_usuario` | WhatsApp · persona (lectura) | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_usuario_guardar` | WhatsApp · persona | `0031_procesos_whatsapp.sql` | Vigente |
| `proc_wa_consentimiento` | WhatsApp · persona | `0031_procesos_whatsapp.sql` | Vigente |

Auxiliares nuevos (solo el dueño): `fn_wa_regla_de` (evento → regla: reuniones → `reunion`; `tarea.por_vencer` → `urgente`; asignada o rechazada → `asignacion`; aceptada por votación o creada → `aceptada`; propuesta o rechazada por votación → `triaje`; completada, cambio de estado, inicio y cierre de sprint → `actualizacion`), `fn_wa_mencion`, `fn_wa_cuando`, `fn_wa_texto` (plantillas), `fn_wa_notificar_evento`, `fn_wa_en_silencio`, `fn_wa_proximo_reporte`, `fn_wa_mensaje_json`, `fn_wa_para_enviar`, `fn_wa_config_json`, `fn_wa_exigir_config`. Sin códigos de error nuevos.

### proc_wa_procesar_eventos
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** despachador de eventos (outbox, DEC-022): avisos en la app que faltaban y cola de WhatsApp.
- **Parámetros:** `p_limite int` (opcional, 200; hasta 1000).
- **Retorno:** `jsonb` `{ procesados, encolados, notificados }`.
- **Reglas y validaciones:** toma eventos sin procesar en orden con `FOR UPDATE SKIP LOCKED`. Notifica en la app: asignación (al responsable, preferencia `tarea_asignada`), propuesta nueva (a los integrantes, `propuesta_nueva`) y por vencer (al responsable). Si el equipo tiene WhatsApp (no `sin_configurar`) y la regla del evento es `instantaneo` o `reporte`, inserta el aviso con el texto de `fn_wa_texto`. Un evento con error no frena a los demás: se reintenta hasta 5 veces.
- **Errores:** ninguno (cada fallo queda en `eventos_dominio.ultimo_error`).
- **Tablas que toca:** lectura `whatsapp_configuracion`, `whatsapp_reglas`, `tareas`, `reuniones`, `sprints`, `membresias`, `preferencias_notificacion`; escritura `eventos_dominio`, `whatsapp_mensajes`, `notificaciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `procesarEventos()`; `trabajos/whatsapp.ts` (cada minuto) y `POST /dev/whatsapp/ciclo` (solo desarrollo).
- **Pruebas:** P151, P152, P153, P154; `whatsapp.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_procesar_eventos(200)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_vencimientos
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** regla «urgente»: registrar `tarea.por_vencer` de las tareas que vencen en menos de 24 h.
- **Parámetros:** ninguno.
- **Retorno:** `jsonb` `{ registrados }`.
- **Reglas y validaciones:** tareas de equipo abiertas (no completadas, rechazadas, retiradas ni en propuesta), sin archivar; una vez por tarea y fecha de entrega (si la fecha cambia, vuelve a avisar).
- **Errores:** ninguno.
- **Tablas que toca:** lectura `tareas`; escritura `eventos_dominio`, `actividad`.
- **Eventos que genera:** `tarea.por_vencer` («T-03 «…» vence en menos de 24 h»).
- **Lo llama:** `repositorios/whatsapp.ts` → `vencimientos()`; `trabajos/whatsapp.ts`.
- **Pruebas:** P154.
- **Ejemplo de llamada:** `select proc_wa_vencimientos()`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_reportes
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** modo reporte: a la hora fijada, juntar lo pendiente del reporte en un resumen.
- **Parámetros:** `p_ahora timestamptz` (opcional, `now()`).
- **Retorno:** `jsonb` `{ generados }`.
- **Reglas y validaciones:** por equipo conectado o en pausa, cuando ya pasó su próximo reporte (`fn_wa_proximo_reporte`: diario a la hora, o semanal el día y la hora, en la zona del equipo). Crea un aviso `programado` («📋 Resumen de …» con hasta 8 líneas y «…y N más») y marca los incluidos como `cancelado` con `reporte_id`. Sin pendientes no hay resumen, pero la hora cuenta como cumplida.
- **Errores:** ninguno.
- **Tablas que toca:** escritura `whatsapp_configuracion`, `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `reportes()`; `trabajos/whatsapp.ts`.
- **Pruebas:** P161; `whatsapp.test.ts` («un reporte programado se genera y se envía a la hora»).
- **Ejemplo de llamada:** `select proc_wa_reportes(now())`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_por_enviar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** lo que el sistema envía solo: reportes programados que ya tocan y, con envío automático, los instantáneos seleccionados.
- **Parámetros:** `p_limite int` (opcional, 50; hasta 200).
- **Retorno:** `jsonb` `AvisoParaEnviar[]` (`id`, `equipo_id`, `texto`, `proveedor`, `grupo_externo_id`, `destinatarios[]`).
- **Reglas y validaciones:** solo equipos `conectado` (no en pausa ni con error) y fuera de sus horas de silencio; los deja `enviando` y suma un intento (`FOR UPDATE SKIP LOCKED`).
- **Errores:** ninguno.
- **Tablas que toca:** lectura `whatsapp_configuracion`, `whatsapp_usuario`, `membresias`, `equipos`; escritura `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `porEnviar()`; `trabajos/whatsapp.ts`.
- **Pruebas:** P162.
- **Ejemplo de llamada:** `select proc_wa_por_enviar(50)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_envio_resultado
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** registrar el resultado de la entrega de un aviso `enviando`.
- **Parámetros:** `p_mensaje_id uuid`. `p_ok boolean`. `p_proveedor_id text` (id de Meta o «sim-…»). `p_error text`.
- **Retorno:** `jsonb` `MensajeWa`.
- **Reglas y validaciones:** `enviado` (con `enviado_en` e id del proveedor) o `fallido` (con el error, hasta 300 caracteres). Al enviar, actualiza `ultimo_envio_en` y limpia `causa_error`.
- **Errores:** `NX007` · el aviso no se estaba enviando.
- **Tablas que toca:** escritura `whatsapp_mensajes`, `whatsapp_configuracion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `resultadoEnvio()`; `whatsapp/proveedor.ts` → `entregar()`.
- **Pruebas:** P157.
- **Ejemplo de llamada:** `select proc_wa_envio_resultado($1, true, 'sim-…', null)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_webhook_registrar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** 4.3: guardar un evento del webhook de Meta una sola vez y aplicar los estados de entrega.
- **Parámetros:** `p_evento_id text` (único). `p_tipo text`. `p_carga jsonb` (el `value` del cambio de Meta).
- **Retorno:** `jsonb` `{ nuevo, actualizados }`.
- **Reglas y validaciones:** idempotente por `proveedor_evento_id`. Para cada `statuses[]`: `sent`/`delivered`/`read` dejan el aviso enviado y fijan `entregado_en`/`leido_en`; `failed` lo deja `fallido` con el título del error. La API verifica antes la firma HMAC (`X-Hub-Signature-256`).
- **Errores:** ninguno.
- **Tablas que toca:** escritura `whatsapp_webhook_eventos`, `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `registrarWebhook()`; `POST /whatsapp/webhook`.
- **Pruebas:** P168; `whatsapp.test.ts` (firma buena y mala).
- **Ejemplo de llamada:** `select proc_wa_webhook_registrar('…', 'statuses', '{"statuses": […]}')`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_panel
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-01: panel del líder.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`.
- **Retorno:** `jsonb` `PanelWa`: `configuracion` (con `proximo_reporte`), `reglas[6]`, `resumen { en_cola, para_reporte, enviados_hoy, fallidos }` y `personas[]` (consentimiento, en grupo, tiene número).
- **Reglas y validaciones:** solo el líder (matriz: `configurar_whatsapp`).
- **Errores:** `NX005` · no es el líder. `NX006` · no es del equipo.
- **Tablas que toca:** lectura `whatsapp_configuracion`, `whatsapp_reglas`, `whatsapp_mensajes`, `membresias`, `whatsapp_usuario`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/whatsapp.ts` → `panel()`; `GET /equipos/:equipoId/whatsapp`.
- **Pruebas:** P155; `whatsapp.test.ts`; `matriz.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_panel($1, $2)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_cola
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-02: la cola.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`.
- **Retorno:** `jsonb` `{ instantaneos[], para_reporte[], proximo_reporte }`.
- **Reglas y validaciones:** solo el líder (`enviar_cola_whatsapp`); instantáneos pendientes o enviándose, y lo que espera al reporte.
- **Errores:** `NX005`, `NX006`.
- **Tablas que toca:** lectura `whatsapp_mensajes`, `whatsapp_configuracion`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/whatsapp.ts` → `cola()`; `GET /equipos/:equipoId/whatsapp/cola`.
- **Pruebas:** P155; `whatsapp.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_cola($1, $2)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_historial
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-04: historial (enviados, fallidos y descartados).
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_estado text` (opcional: `enviado`, `fallido`, `cancelado`). `p_antes timestamptz` (cursor). `p_limite int` (30; hasta 100).
- **Retorno:** `jsonb` `{ items: MensajeWa[], hay_mas }`, del más reciente al más antiguo.
- **Reglas y validaciones:** líder e integrantes (`ver_historial_whatsapp`); los avisos incluidos en un reporte no salen sueltos.
- **Errores:** `NX005` · invitado. `NX006` · no es del equipo. `NX010` · filtro inválido.
- **Tablas que toca:** lectura `whatsapp_mensajes`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/whatsapp.ts` → `historial()`; `GET /equipos/:equipoId/whatsapp/historial`.
- **Pruebas:** P160; `whatsapp.test.ts`; flujo E2E «3b».
- **Ejemplo de llamada:** `select proc_wa_historial($1, $2, 'enviado', null, 30)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_mensaje_editar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-02: corregir el texto o (de)seleccionar un aviso pendiente.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid`. `p_cambios jsonb` · `{ texto?, seleccionado? }`.
- **Retorno:** `jsonb` `MensajeWa`.
- **Reglas y validaciones:** solo el líder del equipo del aviso; solo avisos `pendiente`; texto de 1 a 400.
- **Errores:** `NX005`, `NX006` · aviso inexistente. `NX007` · ya no está pendiente. `NX010` · texto inválido.
- **Tablas que toca:** escritura `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `editarMensaje()`; `PATCH /whatsapp/mensajes/:id`.
- **Pruebas:** P156; `whatsapp.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_mensaje_editar($1, $2, '{"texto": "…"}')`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_descartar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-02: descartar avisos pendientes.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_ids uuid[]`.
- **Retorno:** `jsonb` `{ descartados }`.
- **Reglas y validaciones:** solo el líder; quedan `cancelado` («Descartado por el líder»).
- **Errores:** `NX005`, `NX006`.
- **Tablas que toca:** escritura `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `descartar()`; `POST /equipos/:equipoId/whatsapp/cola/descartar`.
- **Pruebas:** P159.
- **Ejemplo de llamada:** `select proc_wa_descartar($1, $2, ARRAY[$3]::uuid[])`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_reintentar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-08: devolver a la cola lo que falló.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_ids uuid[]` (NULL = todos los fallidos).
- **Retorno:** `jsonb` `{ reintentados }`.
- **Reglas y validaciones:** solo el líder; vuelven como instantáneos seleccionados.
- **Errores:** `NX005`, `NX006`.
- **Tablas que toca:** escritura `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `reintentar()`; `POST /equipos/:equipoId/whatsapp/cola/reintentar`.
- **Pruebas:** P159.
- **Ejemplo de llamada:** `select proc_wa_reintentar($1, $2, null)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_enviar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-02: el líder envía la cola.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_ids uuid[]` (NULL = los seleccionados).
- **Retorno:** `jsonb` `AvisoParaEnviar[]`; la API los entrega con el proveedor y registra cada resultado.
- **Reglas y validaciones:** solo el líder (`enviar_cola_whatsapp`); equipo activo; WhatsApp conectado (no en pausa ni con error). Los deja `enviando` con `enviado_por`.
- **Errores:** `NX005`, `NX006`, `NX009` · archivado. `NX007` · sin configurar, en pausa o con error.
- **Tablas que toca:** lectura `whatsapp_configuracion`, `whatsapp_usuario`, `membresias`; escritura `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `enviar()`; `POST /equipos/:equipoId/whatsapp/cola/enviar`.
- **Pruebas:** P157, P158, P169; `whatsapp.test.ts`; flujo E2E «3b».
- **Ejemplo de llamada:** `select proc_wa_enviar($1, $2, null)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_conectar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-06: conectar WhatsApp.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_datos jsonb` · `{ proveedor?, grupo_nombre, grupo_externo_id?, enlace_invitacion? }`.
- **Retorno:** `jsonb` `ConfiguracionWa`.
- **Reglas y validaciones:** solo el líder; equipo activo; nombre de 2 a 100; `cloud_api_grupos` exige el id del grupo. Si no hay reglas crea las de siempre (reuniones y vencimientos al instante; lo demás al reporte); si ya hay, no las toca. La API rechaza (409) un proveedor real si el servidor no tiene cuenta de Meta.
- **Errores:** `NX005`, `NX006`, `NX009`, `NX010`.
- **Tablas que toca:** escritura `whatsapp_configuracion`, `whatsapp_reglas`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.whatsapp_conectado`.
- **Lo llama:** `repositorios/whatsapp.ts` → `conectar()`; `POST /equipos/:equipoId/whatsapp/conectar`.
- **Pruebas:** P150; `whatsapp.test.ts`; flujo E2E «3b».
- **Ejemplo de llamada:** `select proc_wa_conectar($1, $2, '{"grupo_nombre": "Equipo · avisos"}')`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_desconectar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-08: desconectar WhatsApp.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`.
- **Retorno:** `jsonb` `ConfiguracionWa`.
- **Reglas y validaciones:** solo el líder; cancela lo pendiente y lo programado; el historial se conserva.
- **Errores:** `NX005`, `NX006`, `NX007` · ya estaba sin configurar.
- **Tablas que toca:** escritura `whatsapp_configuracion`, `whatsapp_mensajes`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.whatsapp_desconectado`.
- **Lo llama:** `repositorios/whatsapp.ts` → `desconectar()`; `POST /equipos/:equipoId/whatsapp/desconectar`.
- **Pruebas:** P165.
- **Ejemplo de llamada:** `select proc_wa_desconectar($1, $2)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_configurar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-05 y WA-08: pausar o reanudar, reporte, agrupar, horas de silencio, envío automático y enlace de invitación.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_cambios jsonb` (solo lo que cambia).
- **Retorno:** `jsonb` `ConfiguracionWa`.
- **Reglas y validaciones:** solo el líder; WhatsApp configurado; `estado` solo `conectado` o `pausado` (reanudar limpia el error); silencio completo; hora y día válidos.
- **Errores:** `NX005`, `NX006`, `NX007` · sin configurar. `NX010` · valor inválido.
- **Tablas que toca:** escritura `whatsapp_configuracion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `configurar()`; `PATCH /equipos/:equipoId/whatsapp/configuracion`.
- **Pruebas:** P158, P164; `whatsapp.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_configurar($1, $2, '{"estado": "pausado"}')`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_regla_guardar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-05: modo de una regla.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tipo text` (una de las 6). `p_modo text` (`instantaneo`, `reporte`, `apagado`).
- **Retorno:** `jsonb` `{ tipo_evento, modo }`.
- **Reglas y validaciones:** solo el líder.
- **Errores:** `NX005`, `NX006`, `NX010` · regla o modo inexistente.
- **Tablas que toca:** escritura `whatsapp_reglas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `guardarRegla()`; `PUT /equipos/:equipoId/whatsapp/reglas/:tipo`.
- **Pruebas:** P163.
- **Ejemplo de llamada:** `select proc_wa_regla_guardar($1, $2, 'triaje', 'instantaneo')`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_usuario
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** PF-05: número, consentimiento general y, por equipo, consentimiento y enlace de invitación.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `WhatsAppUsuario`.
- **Reglas y validaciones:** solo los datos del actor; el enlace del grupo solo se ve con consentimiento en ese equipo.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `whatsapp_usuario`, `membresias`, `equipos`, `whatsapp_configuracion`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/whatsapp.ts` → `usuario()`; `GET /yo/whatsapp`.
- **Pruebas:** P166.
- **Ejemplo de llamada:** `select proc_wa_usuario($1)`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_usuario_guardar
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** PF-05: guardar el número (E.164) y el consentimiento general.
- **Parámetros:** `p_actor_id uuid`. `p_cambios jsonb` · `{ numero?, consentimiento? }` (número vacío = borrarlo).
- **Retorno:** `jsonb` `WhatsAppUsuario`.
- **Reglas y validaciones:** número `+` lada y 8 a 15 dígitos, único; cambiar el número quita la verificación. Consentimiento sin número no. Retirar el consentimiento general (o borrar el número) lo retira en todos los equipos.
- **Errores:** `NX010` · número inválido o sin número. `NX012` · número de otra cuenta.
- **Tablas que toca:** escritura `whatsapp_usuario`, `membresias`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `guardarUsuario()`; `PATCH /yo/whatsapp`.
- **Pruebas:** P166; `whatsapp.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_usuario_guardar($1, '{"numero": "+5212221234567", "consentimiento": true}')`
- **Historial:** 2026-11-19 · creación · `0031`.

### proc_wa_consentimiento
- **Migración:** `0031_procesos_whatsapp.sql`
- **Propósito:** WA-07 y PF-05: aceptar o rechazar los avisos y menciones de un equipo.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_acepta boolean`.
- **Retorno:** `jsonb` `WhatsAppUsuario`.
- **Reglas y validaciones:** líder o integrante del equipo; aceptar exige número y consentimiento general vigentes.
- **Errores:** `NX005` · invitado o acceso caducado. `NX006` · no es del equipo. `NX010` · sin número o sin consentimiento general.
- **Tablas que toca:** escritura `membresias`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `consentimiento()`; `PUT /equipos/:equipoId/whatsapp/consentimiento`.
- **Pruebas:** P167; `whatsapp.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_consentimiento($1, $2, true)`
- **Historial:** 2026-11-19 · creación · `0031`.

---

## Pendientes tras la Fase 5

Procesos de la auditoría del 2026-11-20 (`progreso.md`, «Pendientes tras la Fase 5»; DEC-037). Migración `0032_procesos_pendientes.sql` (no cambia tablas). Pruebas `P210`–`P219` en `pruebas_procesos.sql` y `apps/api/src/rutas/pendientes.test.ts`.

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_personal_agenda` | Espacio personal (lectura) | `0032_procesos_pendientes.sql` | Vigente |
| `proc_datos_exportar` | Cuenta · datos | `0032_procesos_pendientes.sql` | Vigente |
| `proc_cuenta_eliminar` | Cuenta · datos | `0032_procesos_pendientes.sql` | Vigente |
| `proc_solicitud_invitado_crear` | Miembros | `0032_procesos_pendientes.sql` | Vigente |
| `proc_solicitud_invitado_listar` | Miembros (lectura) | `0032_procesos_pendientes.sql` | Vigente |
| `proc_solicitud_invitado_resolver` | Miembros | `0032_procesos_pendientes.sql` | Vigente |
| `proc_sprint_fotos_diarias` | Sprints · sistema | `0032_procesos_pendientes.sql` | Vigente |
| `proc_chat_editar` | Chat | `0032_procesos_pendientes.sql` | Vigente |
| `proc_usuario_foto_guardar` | Cuenta · perfil | `0032_procesos_pendientes.sql` | Vigente |
| `proc_usuario_foto` | Cuenta · perfil (lectura) | `0032_procesos_pendientes.sql` | Vigente |

Auxiliar nuevo: `fn_solicitud_json`. Sin códigos de error nuevos.

### proc_personal_agenda
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** PER-04: reuniones de todos mis equipos en el calendario personal.
- **Parámetros:** `p_actor_id uuid`. `p_desde timestamptz`. `p_hasta timestamptz` (1 a 62 días).
- **Retorno:** `jsonb` `ReunionAgenda[]`: cada ocurrencia (`fn_reunion_json`) con `equipo_id` y `equipo_nombre`.
- **Reglas y validaciones:** equipos activos donde la persona es líder o integrante (el invitado no ve reuniones, como en EQ-14); repeticiones en la zona de cada equipo.
- **Errores:** `NX010` · rango inválido.
- **Tablas que toca:** lectura `membresias`, `equipos`, `reuniones`, `reunion_asistencia`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/pendientes.ts` → `agenda()`; `GET /personal/agenda`.
- **Pruebas:** P210; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_personal_agenda($1, now(), now() + interval '42 days')`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_datos_exportar
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** FALT-09: todo lo que Nexo guarda de la persona, en JSON.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ exportacion_id, generada_en, datos }`; `datos` trae perfil, preferencias, avisos, WhatsApp, equipos, tareas (personales, a su cargo o creadas por ella, con subtareas), comentarios, mensajes, reuniones y notificaciones.
- **Reglas y validaciones:** nunca incluye el hash de la contraseña, `google_sub` ni el bloqueo; deja constancia en `exportaciones_datos` (`lista`, caduca en 7 días).
- **Errores:** `NX006` · cuenta eliminada.
- **Tablas que toca:** lectura de las anteriores; escritura `exportaciones_datos`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/pendientes.ts` → `exportar()`; `GET /yo/datos/exportar` (descarga `nexo-mis-datos-AAAA-MM-DD.json`).
- **Pruebas:** P211; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_datos_exportar($1)`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_cuenta_eliminar
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** FALT-09: eliminar la cuenta.
- **Parámetros:** `p_actor_id uuid` (la API verifica antes la contraseña y la confirmación «ELIMINAR»).
- **Retorno:** `jsonb` `{ eliminada: true }`.
- **Reglas y validaciones:** quien lidera un equipo activo con más personas primero transfiere. Sale de todos los equipos (un equipo donde era la única persona se archiva); se borran tareas personales, número de WhatsApp, sesiones, tokens y notificaciones; sus solicitudes pendientes se rechazan; la cuenta queda anónima («Cuenta eliminada», correo inservible, sin contraseña) y con `eliminado_en`. Lo aportado a los equipos se conserva sin su nombre.
- **Errores:** `NX006` · ya eliminada. `NX007` · es líder de un equipo con más personas.
- **Tablas que toca:** escritura `usuarios`, `membresias`, `equipos`, `tareas`, `whatsapp_usuario`, `sesiones`, `tokens_verificacion`, `notificaciones`, `solicitudes_invitado`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `equipo.miembro_salio` (con `cuenta_eliminada`).
- **Lo llama:** `repositorios/pendientes.ts` → `eliminarCuenta()`; `POST /yo/cuenta/eliminar` (5 por minuto).
- **Pruebas:** P212, P213; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_cuenta_eliminar($1)`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_solicitud_invitado_crear
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** DEC-023: el invitado pide más días (`ampliacion`) o ser integrante (`conversion`).
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_tipo text`.
- **Retorno:** `jsonb` `SolicitudInvitado`.
- **Reglas y validaciones:** solo invitados con acceso vigente; equipo activo; una pendiente por tipo (repetir devuelve la misma); avisa al líder.
- **Errores:** `NX005` · no es invitado o su acceso caducó. `NX006` · no es del equipo. `NX009` · archivado. `NX010` · tipo inválido.
- **Tablas que toca:** escritura `solicitudes_invitado`, `notificaciones`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/pendientes.ts` → `crearSolicitud()`; `POST /equipos/:equipoId/solicitudes`.
- **Pruebas:** P214; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_solicitud_invitado_crear($1, $2, 'ampliacion')`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_solicitud_invitado_listar
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** el líder ve las solicitudes pendientes; el invitado, las suyas.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`.
- **Retorno:** `jsonb` `SolicitudInvitado[]`, de la más reciente a la más antigua.
- **Reglas y validaciones:** el integrante no las ve.
- **Errores:** `NX005` · integrante. `NX006` · no es del equipo.
- **Tablas que toca:** lectura `solicitudes_invitado`, `membresias`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/pendientes.ts` → `solicitudes()`; `GET /equipos/:equipoId/solicitudes`.
- **Pruebas:** P214; `pendientes.test.ts`; `matriz.test.ts` (no filtración).
- **Ejemplo de llamada:** `select proc_solicitud_invitado_listar($1, $2)`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_solicitud_invitado_resolver
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** el líder aprueba o rechaza una solicitud.
- **Parámetros:** `p_actor_id uuid`. `p_equipo_id uuid`. `p_solicitud_id uuid`. `p_aprobar boolean`. `p_dias int` (ampliación: 7, 14 o 30; por defecto 7).
- **Retorno:** `jsonb` `SolicitudInvitado`.
- **Reglas y validaciones:** solo el líder; solo pendientes. Aprobar aplica `proc_invitado_gestionar` (ampliar o convertir; el tope lo cuida `NX001`). Rechazar avisa al invitado; aprobar una ampliación también.
- **Errores:** `NX001` · equipo lleno al convertir. `NX005`, `NX006`. `NX007` · ya respondida o ya no es invitado.
- **Tablas que toca:** escritura `solicitudes_invitado`, `membresias`, `notificaciones` (y lo de `proc_invitado_gestionar`).
- **Eventos que genera:** los de `proc_invitado_gestionar` (`equipo.invitado_ampliado`, `equipo.invitado_convertido`).
- **Lo llama:** `repositorios/pendientes.ts` → `resolverSolicitud()`; `POST /equipos/:equipoId/solicitudes/:solicitudId`.
- **Pruebas:** P215, P216; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_solicitud_invitado_resolver($1, $2, $3, true, 14)`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_sprint_fotos_diarias
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** foto diaria del burndown de cada sprint activo.
- **Parámetros:** ninguno (sistema).
- **Retorno:** `jsonb` `{ sprints }`.
- **Reglas y validaciones:** usa `fn_sprint_instantanea` (una fila por sprint y día, en la zona del equipo); repetir el mismo día solo actualiza.
- **Errores:** ninguno.
- **Tablas que toca:** escritura `sprint_instantaneas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/pendientes.ts` → `fotosDiarias()`; `trabajos/plazos.ts` (cada minuto).
- **Pruebas:** P217.
- **Ejemplo de llamada:** `select proc_sprint_fotos_diarias()`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_chat_editar
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** CH-02: quien escribió un mensaje lo corrige.
- **Parámetros:** `p_actor_id uuid`. `p_mensaje_id uuid`. `p_texto text` (1 a 4000).
- **Retorno:** `jsonb` `MensajeChat` con `editado_en`.
- **Reglas y validaciones:** solo el autor (ni el líder edita mensajes ajenos; puede eliminarlos); no los de sistema ni los eliminados; mismo texto no marca «editado». La API avisa por Socket.IO (`chat:mensaje_actualizado`).
- **Errores:** `NX005` · no es el autor. `NX006` · no existe o no lo ve. `NX007` · eliminado. `NX009` · archivado. `NX010` · texto inválido.
- **Tablas que toca:** escritura `mensajes`.
- **Eventos que genera:** ninguno (los mensajes no son eventos de dominio).
- **Lo llama:** `repositorios/pendientes.ts` → `editarMensaje()`; `PATCH /chat/mensajes/:id`.
- **Pruebas:** P218; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_chat_editar($1, $2, 'Texto corregido')`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_usuario_foto_guardar
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** ONB-02 y PF-01: foto de perfil.
- **Parámetros:** `p_actor_id uuid`. `p_mime text` (`image/png`, `image/jpeg`, `image/webp`). `p_datos bytea` (hasta 1 MB; `NULL` la quita).
- **Retorno:** `jsonb` `{ avatar_url }` (`/usuarios/<id>/foto?v=<archivo>` o `null`).
- **Reglas y validaciones:** se guarda como archivo personal (`archivos.equipo_id` nulo, `storage_key` «foto:…») y reemplaza la anterior.
- **Errores:** `NX006` · cuenta eliminada. `NX010` · tipo o tamaño.
- **Tablas que toca:** escritura `archivos`, `archivo_contenidos`, `usuarios`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/pendientes.ts` → `guardarFoto()`; `PUT /yo/foto`.
- **Pruebas:** P219; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_foto_guardar($1, 'image/png', $2)`
- **Historial:** 2026-11-20 · creación · `0032`.

### proc_usuario_foto
- **Migración:** `0032_procesos_pendientes.sql`
- **Propósito:** servir la foto de perfil de una persona.
- **Parámetros:** `p_usuario_id uuid`.
- **Retorno:** `jsonb` `{ mime, contenido }` (base64).
- **Reglas y validaciones:** la API exige sesión (cualquier persona con sesión ve las fotos, como ve los nombres en sus equipos).
- **Errores:** `NX006` · sin foto.
- **Tablas que toca:** lectura `archivos`, `archivo_contenidos`.
- **Eventos que genera:** ninguno (lectura).
- **Lo llama:** `repositorios/pendientes.ts` → `foto()`; `GET /usuarios/:usuarioId/foto`.
- **Pruebas:** P219; `pendientes.test.ts`.
- **Ejemplo de llamada:** `select proc_usuario_foto($1)`
- **Historial:** 2026-11-20 · creación · `0032`.

---

## Spike WhatsApp 1 a 1

Procesos del canal directo (`11_Plan_Spike_WhatsApp_1a1.md`, DEC-039). Migración `0033_whatsapp_directo.sql`. Pruebas `P220`–`P231` en `pruebas_procesos.sql`, `apps/api/src/whatsapp/spike.test.ts` e `integracion.test.ts`.

**Esquema (solo agrega):** tipos `modo_entrega_wa`, `formato_wa`, `destino_wa`, `estado_entrega_wa`; `whatsapp_configuracion.modo_entrega` (por defecto `grupo`; los equipos con `cloud_api_directo` quedan en `individual`) y `.formato_defecto`; `preferencias_usuario.wa_formato`; `whatsapp_usuario.ultimo_entrante_en`, `.ultimo_teaser_en`, `.codigo_hash`, `.codigo_expira_en`; `whatsapp_mensajes.equipo_id` admite nulo y suma `usuario_id` (reporte personal); tabla **`whatsapp_entregas`** (una fila por destinatario de cada aviso, o una al grupo) con su formato, contenido (≤ 4000), estado, caducidad e id de Meta.

**Procesos de la 0031 que cambian (misma firma):** `proc_wa_enviar` y `proc_wa_por_enviar` reparten el aviso en entregas (`fn_wa_expandir_entregas`) y devuelven también `entregas[]` con el formato, la ventana y si hubo aviso corto reciente; `proc_wa_webhook_registrar` aplica los estados también a la entrega con ese id; `proc_wa_configurar` acepta `modo_entrega` y `formato_defecto`; `proc_wa_conectar` fija `modo_entrega` según el proveedor; `proc_wa_panel` muestra por persona los últimos 4 dígitos, la verificación y el formato (nunca el número completo, R4); `proc_wa_usuario` suma verificación, ventana y formato; `fn_wa_mensaje_json` suma el reparto (`entregas[]`).

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_wa_marcar_entrega` | WhatsApp · sistema | `0033_whatsapp_directo.sql` | Vigente |
| `proc_wa_solicitar_verificacion` | WhatsApp · persona | `0033_whatsapp_directo.sql` | Vigente |
| `proc_wa_registrar_entrante` | WhatsApp · sistema | `0033_whatsapp_directo.sql` | Vigente |
| `proc_wa_entrega_tras_ventana` | WhatsApp · sistema | `0033_whatsapp_directo.sql` | Vigente |
| `proc_wa_crear_reporte_personal` | WhatsApp · persona | `0033_whatsapp_directo.sql` | Vigente |
| `proc_wa_caducar_pendientes` | WhatsApp · sistema | `0033_whatsapp_directo.sql` | Vigente |
| `proc_wa_formato_guardar` | WhatsApp · persona | `0033_whatsapp_directo.sql` | Vigente |

Auxiliares nuevos: `fn_wa_numero_normal` (P-13: México con y sin el `1`), `fn_wa_numero_fin`, `fn_wa_puede_directo`, `fn_wa_formato_de`, `fn_wa_entrega_json`, `fn_wa_expandir_entregas`, `fn_wa_entregas_para_enviar`, `fn_wa_preparar_envio`, `fn_wa_derivar_estado`, `fn_wa_reporte_personal_texto`. Sin códigos de error nuevos.

### proc_wa_marcar_entrega
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** resultado de UNA entrega que el servidor intentó enviar.
- **Parámetros:** `p_entrega_id uuid`. `p_resultado jsonb` · `{ ok, proveedor_id?, error?, plantilla?, variables?, pendiente_ventana?, aviso_corto? }`.
- **Retorno:** `jsonb` `EntregaWa`.
- **Reglas y validaciones:** solo entregas `enviando`. `ok` → `enviado`, o `pendiente_ventana` (caduca en 7 días, P-7) si se mandó el aviso corto de «bajo demanda»; `aviso_corto` anota `ultimo_teaser_en` (P-8). Después deriva el estado del aviso: `enviado` si al menos una salió (con el primer id de Meta), `fallido` si ninguna.
- **Errores:** `NX007` · la entrega no se estaba enviando.
- **Tablas que toca:** escritura `whatsapp_entregas`, `whatsapp_usuario`, `whatsapp_mensajes`, `whatsapp_configuracion`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `marcarEntrega()`; `whatsapp/entregas.ts` → `entregarEntregas()`.
- **Pruebas:** P223, P224; `integracion.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_marcar_entrega($1, '{"ok": true, "proveedor_id": "wamid…"}')`
- **Historial:** 2026-11-21 · creación · `0033`.

### proc_wa_solicitar_verificacion
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** la persona pide verificar su número por WhatsApp (plan §7.1).
- **Parámetros:** `p_actor_id uuid`. `p_numero text` (E.164).
- **Retorno:** `jsonb` `{ codigo, expira_en }`; la API arma el enlace `wa.me/<número de Nexo>?text=VERIFICAR <código>`.
- **Reglas y validaciones:** guarda número y consentimiento como `proc_wa_usuario_guardar`; código de 6 dígitos del que solo se guarda el hash (SHA-256), válido 30 min.
- **Errores:** `NX010` · número inválido. `NX012` · número de otra cuenta.
- **Tablas que toca:** escritura `whatsapp_usuario`, `membresias`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `solicitarVerificacion()`; `POST /yo/whatsapp/verificacion`.
- **Pruebas:** P228; `spike.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_solicitar_verificacion($1, '+5212221234567')`
- **Historial:** 2026-11-21 · creación · `0033`.

### proc_wa_registrar_entrante
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** un mensaje que la persona mandó al número de Nexo (webhook, plan §7.2).
- **Parámetros:** `p_numero text` (el `from` de Meta). `p_texto text`. `p_ahora timestamptz` (opcional).
- **Retorno:** `jsonb` `{ conocido, usuario_id?, numero?, verificado?, baja?, reporte?, respuesta?, entregas[] }`.
- **Reglas y validaciones:** número desconocido → `conocido: false` (no se responde). Abre la ventana (`ultimo_entrante_en`). «VERIFICAR <código>» vigente verifica; «BAJA»/«STOP» retira el consentimiento y cancela lo pendiente; «REPORTE» pide el reporte personal; cualquier otro texto (o el botón «Ver actualización») devuelve **todas** las entregas `pendiente_ventana` no caducadas, ya en `enviando`. Sin nada pendiente responde el menú corto.
- **Errores:** ninguno.
- **Tablas que toca:** escritura `whatsapp_usuario`, `membresias`, `whatsapp_entregas`, `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `registrarEntrante()`; `whatsapp/entregas.ts` → `procesarEntrante()` (webhook y `POST /dev/whatsapp/entrante`).
- **Pruebas:** P225, P227, P228, P232, P233; `spike.test.ts`; `integracion.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_registrar_entrante('5212221234567', 'Ver actualización')`
- **Historial:** 2026-11-21 · creación · `0033`. 2026-11-21 · el texto se limpia con `fn_wa_texto_comando` antes de leer el comando (espacio duro, marcas invisibles, salto de línea y puntuación de WhatsApp; antes «VERIFICAR» desde el enlace `wa.me` no verificaba en producción) · `0034_wa_texto_entrante.sql`, P232. 2026-11-21 · con un código pendiente también vale el código solo («123456», sin «VERIFICAR») · `0035_wa_codigo_solo.sql`, P233.

### proc_wa_entrega_tras_ventana
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** resultado de entregar lo pendiente después de un mensaje entrante (texto dentro de la ventana).
- **Parámetros:** `p_entrega_id uuid`. `p_ok boolean`. `p_proveedor_id text`. `p_error text`.
- **Retorno:** `jsonb` `EntregaWa`.
- **Reglas y validaciones:** `ok` → `enviado` (varias entregas pueden compartir el id de Meta: se mandan juntas en un texto); si falla vuelve a `pendiente_ventana`.
- **Errores:** `NX007` · no se estaba enviando.
- **Tablas que toca:** escritura `whatsapp_entregas`, `whatsapp_mensajes`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `entregaTrasVentana()`; `whatsapp/entregas.ts` → `procesarEntrante()`.
- **Pruebas:** P225; `integracion.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_entrega_tras_ventana($1, true, 'wamid…', null)`
- **Historial:** 2026-11-21 · creación · `0033`.

### proc_wa_crear_reporte_personal
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** «Enviarme mi reporte por WhatsApp» (plan §9), también con «REPORTE».
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `AvisoParaEnviar` con su entrega lista para enviar.
- **Reglas y validaciones:** exige número y consentimiento; hasta 5 por hora. El aviso no tiene equipo (A9); el contenido sale de `fn_wa_reporte_personal_texto` (tareas por estado y próximas entregas, ≤ 4000). Ignora las horas de silencio (lo pide la persona).
- **Errores:** `NX010` · sin número o consentimiento. `NX007` · límite de 5 por hora.
- **Tablas que toca:** lectura `tareas`, `usuarios`; escritura `whatsapp_mensajes`, `whatsapp_entregas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `crearReportePersonal()`; `POST /yo/whatsapp/reporte` y `procesarEntrante()`.
- **Pruebas:** P229; `spike.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_crear_reporte_personal($1)`
- **Historial:** 2026-11-21 · creación · `0033`.

### proc_wa_caducar_pendientes
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** lo que esperaba la ventana y ya caducó (P-7).
- **Parámetros:** `p_ahora timestamptz` (opcional; las pruebas adelantan el reloj).
- **Retorno:** `jsonb` `{ caducadas }`.
- **Reglas y validaciones:** `pendiente_ventana` con `caduca_en` vencido → `caducado` y se borra `contenido` (privacidad); el historial conserva el estado.
- **Errores:** ninguno.
- **Tablas que toca:** escritura `whatsapp_entregas`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `caducarPendientes()`; `trabajos/whatsapp.ts` (cada minuto) y `POST /dev/whatsapp/ciclo?ahora=`.
- **Pruebas:** P226; `spike.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_caducar_pendientes(now())`
- **Historial:** 2026-11-21 · creación · `0033`.

### proc_wa_formato_guardar
- **Migración:** `0033_whatsapp_directo.sql`
- **Propósito:** la persona elige su formato (P-3).
- **Parámetros:** `p_actor_id uuid`. `p_formato text` (`resumen_enlace`, `pdf`, `bajo_demanda` o `NULL` = el de cada equipo).
- **Retorno:** `jsonb` `WhatsAppUsuario`.
- **Reglas y validaciones:** crea la fila de preferencias si falta.
- **Errores:** `NX010` · formato inexistente.
- **Tablas que toca:** escritura `preferencias_usuario`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/whatsapp.ts` → `guardarFormato()`; `PUT /yo/whatsapp/formato`.
- **Pruebas:** P230; `spike.test.ts`; `integracion.test.ts`.
- **Ejemplo de llamada:** `select proc_wa_formato_guardar($1, 'bajo_demanda')`
- **Historial:** 2026-11-21 · creación · `0033`.

---

## Verificación en dos pasos (AUTH-07)

Migración `0037_dos_pasos.sql` (docs/13_Plan_Integrado_Pendientes.md, 1.2). Pruebas `P235`–`P238` y `apps/api/src/rutas/dosPasos.test.ts`.

**Esquema:** `credenciales_2fa` suma `ultimo_paso` (el último paso TOTP aceptado; un código no sirve dos veces) y `creado_en`; tabla nueva **`desafios_2fa`** (segundo paso pendiente del inicio de sesión: token como hash, método `contrasena` o `google`, 5 min, 5 intentos). El secreto TOTP llega cifrado con AES-256-GCM (`apps/api/src/cifrado.ts`, `ENCRYPTION_KEY`) y la API calcula el código (`apps/api/src/totp.ts`); los códigos de respaldo solo se guardan como hash SHA-256.

**Procesos que cambian (misma firma):** `proc_auth_entrar` devuelve `estado: '2fa'` (sin sesión) cuando la persona tiene la 2FA activa, y el token de la sesión pasa a ser el del desafío; `proc_auth_cuenta` suma `dos_pasos`.

Auxiliares: `fn_2fa_activa`, `fn_2fa_crear_desafio`, `fn_2fa_validar` (comprueba y consume un paso TOTP posterior al último o un código de respaldo sin usar), `fn_2fa_estado_json`.

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_2fa_estado` | Autenticación · persona | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_iniciar` | Autenticación · persona | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_secreto` | Autenticación · sistema | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_confirmar` | Autenticación · persona | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_desactivar` | Autenticación · persona | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_respaldo_regenerar` | Autenticación · persona | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_desafio` | Autenticación · sistema | `0037_dos_pasos.sql` | Vigente |
| `proc_2fa_completar` | Autenticación · sistema | `0037_dos_pasos.sql` | Vigente |

### proc_2fa_estado
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** estado de la verificación en dos pasos de la persona (Ajustes → Cuenta).
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ activa, desde, codigos_restantes }`.
- **Reglas y validaciones:** ninguna.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `credenciales_2fa`, `codigos_respaldo_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `estado2fa()`; `GET /auth/2fa`.
- **Pruebas:** P235; `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_estado($1)`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_iniciar
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** primer paso de activar: guarda el secreto nuevo, cifrado y sin confirmar.
- **Parámetros:** `p_actor_id uuid`. `p_secreto_cifrado text` (AES-256-GCM, lo cifra la API).
- **Retorno:** `jsonb` estado (`activa: false`).
- **Reglas y validaciones:** si había una activación a medias, la reemplaza.
- **Errores:** `NX007` · ya está activa. `NX010` · falta el secreto.
- **Tablas que toca:** escritura `credenciales_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `iniciar2fa()`; `POST /auth/2fa/iniciar` (devuelve el secreto en base32, el enlace `otpauth://` y el QR en SVG; nada de eso se guarda en claro).
- **Pruebas:** P235; `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_iniciar($1, 'v1.…')`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_secreto
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** el secreto cifrado de la persona para que la API calcule el código.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ secreto_cifrado, confirmado, ultimo_paso }` o `NULL`.
- **Reglas y validaciones:** solo la API lo usa; nunca se devuelve al navegador.
- **Errores:** ninguno.
- **Tablas que toca:** lectura `credenciales_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `secreto2fa()`; confirmar, desactivar y regenerar.
- **Pruebas:** `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_secreto($1)`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_confirmar
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** segundo paso de activar: la API ya comprobó el primer código.
- **Parámetros:** `p_actor_id uuid`. `p_paso bigint` (paso TOTP del código). `p_hashes text[]` (10 hashes SHA-256 de los códigos de respaldo).
- **Retorno:** `jsonb` estado (`activa: true`, `codigos_restantes: 10`).
- **Reglas y validaciones:** exige una activación pendiente; guarda `ultimo_paso`; borra los códigos de respaldo anteriores. Los códigos en claro solo los ve la persona en esa respuesta.
- **Errores:** `NX007` · no hay activación pendiente. `NX010` · no son 10 códigos.
- **Tablas que toca:** escritura `credenciales_2fa`, `codigos_respaldo_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `confirmar2fa()`; `POST /auth/2fa/confirmar`.
- **Pruebas:** P235; `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_confirmar($1, 59312345, $2::text[])`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_desactivar
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** apagar la verificación en dos pasos.
- **Parámetros:** `p_actor_id uuid`. `p_paso bigint` (o `NULL`). `p_respaldo_hash text` (o `NULL`).
- **Retorno:** `jsonb` estado (`activa: false`).
- **Reglas y validaciones:** pide un segundo factor válido (`fn_2fa_validar`); borra secreto, códigos y desafíos.
- **Errores:** `NX007` · no está activa. `NX010` · código incorrecto.
- **Tablas que toca:** escritura `credenciales_2fa`, `codigos_respaldo_2fa`, `desafios_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `desactivar2fa()`; `POST /auth/2fa/desactivar`.
- **Pruebas:** P238; `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_desactivar($1, NULL, 'hash…')`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_respaldo_regenerar
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** 10 códigos de respaldo nuevos; los anteriores dejan de servir.
- **Parámetros:** `p_actor_id uuid`. `p_paso bigint`. `p_respaldo_hash text`. `p_hashes text[]`.
- **Retorno:** `jsonb` estado.
- **Reglas y validaciones:** pide un segundo factor válido.
- **Errores:** `NX007` · no está activa. `NX010` · código incorrecto o no son 10 códigos.
- **Tablas que toca:** escritura `codigos_respaldo_2fa`, `credenciales_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `regenerarRespaldo2fa()`; `POST /auth/2fa/respaldo`.
- **Pruebas:** P238.
- **Ejemplo de llamada:** `select proc_2fa_respaldo_regenerar($1, 59312346, NULL, $2::text[])`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_desafio
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** datos del desafío vigente para que la API calcule el código del segundo paso.
- **Parámetros:** `p_token_hash bytea` (SHA-256 del desafío que devolvió «entrar»).
- **Retorno:** `jsonb` `{ usuario_id, secreto_cifrado, ultimo_paso, metodo }`.
- **Reglas y validaciones:** solo desafíos no vencidos con la 2FA confirmada.
- **Errores:** `NX011` · el desafío venció o no existe (`desafio_vencido`).
- **Tablas que toca:** lectura `desafios_2fa`, `credenciales_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `desafio2fa()`; `POST /auth/2fa`.
- **Pruebas:** P236, P237; `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_desafio($1)`
- **Historial:** 2026-11-21 · creación · `0037`.

### proc_2fa_completar
- **Migración:** `0037_dos_pasos.sql`
- **Propósito:** segundo paso del inicio de sesión (contraseña o Google).
- **Parámetros:** `p_token_hash bytea`. `p_paso bigint` (paso TOTP válido según la API, `-1` si el código no cuadró, o `NULL`). `p_respaldo_hash text`. `p_sesion_hash bytea`, `p_ip text`, `p_dispositivo text`, `p_expira timestamptz` (la sesión nueva).
- **Retorno:** `jsonb` `{ estado: ok | fallo | agotado, usuario?, intentos_restantes? }`.
- **Reglas y validaciones:** con un factor válido borra el desafío y crea la sesión; si no, suma un intento y al quinto borra el desafío.
- **Errores:** `NX011` · el desafío venció o no existe.
- **Tablas que toca:** escritura `desafios_2fa`, `credenciales_2fa`, `codigos_respaldo_2fa`, `sesiones`, `usuarios`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `completar2fa()`; `POST /auth/2fa`.
- **Pruebas:** P236, P237; `dosPasos.test.ts`.
- **Ejemplo de llamada:** `select proc_2fa_completar($1, 59312345, NULL, $2, '127.0.0.1', 'Firefox', now() + interval '30 days')`
- **Historial:** 2026-11-21 · creación · `0037`.

---

## Entrar con Google (AUTH-07)

Migración `0038_google.sql` (docs/13_Plan_Integrado_Pendientes.md, 1.2). Pruebas `P239`–`P241` y `apps/api/src/rutas/google.test.ts`. La API hace el flujo OAuth 2.0 con PKCE (`GET /auth/google` y `/auth/google/callback`): el estado y el verificador viajan en una cookie cifrada (AES-256-GCM), y el `id_token` se pide directo a Google y se comprueban emisor, audiencia y vigencia. Sin `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` el botón no aparece (`GET /auth/proveedores`).

**Reglas:** cuenta creada o vinculada con Google → el correo queda verificado si Google lo marca verificado; con otro correo, el registro manda el correo de verificación de siempre. Una cuenta que ya existe solo se vincula sola si su correo ya estaba verificado en Nexo; si no, hay que entrar con la contraseña y vincular en Ajustes → Cuenta. Con la 2FA activa, Google también pide el segundo paso.

**Procesos que cambian (misma firma):** `proc_auth_cuenta` suma `google`.

| Proceso | Dominio | Migración | Estado |
|---|---|---|---|
| `proc_auth_google` | Autenticación · sistema | `0038_google.sql` | Vigente |
| `proc_auth_google_desvincular` | Autenticación · persona | `0038_google.sql` | Vigente |
| `proc_2fa_verificar` | Autenticación · persona | `0038_google.sql` | Vigente |

### proc_auth_google
- **Migración:** `0038_google.sql`
- **Propósito:** entrar (o crear la cuenta) con Google, o vincular Google a la cuenta con sesión.
- **Parámetros:** `p_sub text`, `p_correo text`, `p_correo_verificado boolean`, `p_nombre text` (lo que confirmó Google). `p_actor_id uuid` (`NULL` = entrar; con valor = vincular). `p_token_hash bytea`, `p_ip text`, `p_dispositivo text`, `p_expira timestamptz` (la sesión nueva, o el desafío si hay 2FA).
- **Retorno:** `jsonb` `{ estado: ok | 2fa | vinculada, nuevo, usuario? }`.
- **Reglas y validaciones:** ver arriba. Cuenta nueva sin contraseña, con preferencias y `nuevo: true` (la web la lleva a la bienvenida). Respeta el bloqueo por intentos fallidos.
- **Errores:** `NX010` · Google no devolvió los datos. `NX012` · `cuenta_existente` (correo sin verificar en Nexo) o `google_en_uso` (ese Google es de otra cuenta). `NX006` · la cuenta con sesión no existe. `NX007` · cuenta bloqueada.
- **Tablas que toca:** escritura `usuarios`, `preferencias_usuario`, `sesiones` o `desafios_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `google()`; `GET /auth/google/callback`.
- **Pruebas:** P239, P240, P241; `google.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_google('1098…', 'ana@gmail.com', true, 'Ana', NULL, $1, '127.0.0.1', 'Firefox', now() + interval '30 days')`
- **Historial:** 2026-11-21 · creación · `0038`.

### proc_auth_google_desvincular
- **Migración:** `0038_google.sql`
- **Propósito:** quitar Google de la cuenta.
- **Parámetros:** `p_actor_id uuid`.
- **Retorno:** `jsonb` `{ google: false }`.
- **Reglas y validaciones:** solo si la cuenta tiene contraseña; si no, la persona se quedaría sin acceso.
- **Errores:** `NX007` · `sin_contrasena`. `NX006` · no encontrada.
- **Tablas que toca:** escritura `usuarios`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `desvincularGoogle()`; `POST /auth/google/desvincular`.
- **Pruebas:** P241; `google.test.ts`.
- **Ejemplo de llamada:** `select proc_auth_google_desvincular($1)`
- **Historial:** 2026-11-21 · creación · `0038`.

### proc_2fa_verificar
- **Migración:** `0038_google.sql`
- **Propósito:** comprobar (y consumir) un segundo factor para una acción sensible: eliminar una cuenta que solo usa Google.
- **Parámetros:** `p_actor_id uuid`. `p_paso bigint` (o `NULL`/`-1`). `p_respaldo_hash text` (o `NULL`).
- **Retorno:** `jsonb` `{ valido }`.
- **Reglas y validaciones:** falso si la 2FA no está activa.
- **Errores:** ninguno.
- **Tablas que toca:** escritura `credenciales_2fa` o `codigos_respaldo_2fa`.
- **Eventos que genera:** ninguno.
- **Lo llama:** `repositorios/autenticacion.ts` → `verificar2fa()`; `POST /yo/cuenta/eliminar`.
- **Pruebas:** P241.
- **Ejemplo de llamada:** `select proc_2fa_verificar($1, NULL, 'hash…')`
- **Historial:** 2026-11-21 · creación · `0038`.
