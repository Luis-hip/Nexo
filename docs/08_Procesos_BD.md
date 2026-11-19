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
- **Retorno:** `jsonb` `{ equipo_id, rol }`.
- **Reglas y validaciones:** la invitación es de **un solo uso**: se marca `aceptada` en la misma transacción que crea la membresía; el integrante recibe el primer color libre y el invitado, una caducidad (7, 14 o 30 días); las altas del equipo se serializan con el mismo bloqueo que usa el disparador del tope; si el equipo está lleno, todo se deshace y la invitación sigue pendiente (DEC-019).
- **Errores:** `NX006` / `NX011` · invitación inexistente, caducada, usada o revocada. `NX012` · ya es miembro (409, `ya_miembro`, con `equipo_id` en el detalle). `NX001` · equipo lleno (409, `equipo_lleno`, con `max_miembros` en el detalle).
- **Tablas que toca:** lectura `equipos`; escritura `invitaciones`, `membresias`, `eventos_dominio`, `actividad`.
- **Eventos que genera:** `membresia.creada` («… se unió al equipo como integrante»).
- **Lo llama:** `repositorios/equipos.ts` → `aceptarInvitacion()`; `POST /invitaciones/:codigo/aceptar`.
- **Pruebas:** `pruebas_procesos.sql` P31; `equipos.test.ts` (incluida la de dos personas a la vez al último lugar).
- **Ejemplo de llamada:** `select proc_invitacion_aceptar($1, 'NX4-821Q')`
- **Historial:** 2026-11-16 · creación (sustituye al SQL que estaba en la API) · `0005`.

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

Procesos del chat en tiempo real (`03`, tarea 4.1; DEC-CHAT-1 en `decisiones.md`). Migraciones `0014` a `0016` (el rango `0014`–`0019` es del chat; WhatsApp usa desde `0020`). Pruebas `P104`–`P129` en `pruebas_procesos.sql` (rango reservado `P104`–`P149`) y `apps/api/src/rutas/chat.test.ts`.

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
