-- Fase 2.5 · Procesos de la BD (DEC-025): tareas de equipo.
-- Sustituyen al SQL de servicios/tareasEquipo.ts y repositorios/{tareasEquipo,eventos}.ts.
-- Documentación: docs/08_Procesos_BD.md.
--
-- Reglas duplicadas (DEC-025): la máquina de estados vive en packages/shared/src/estados.ts;
-- aquí hay una copia en la tabla `transiciones_estado` y una prueba compara ambas.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Copia de la máquina de estados
-- ---------------------------------------------------------------------------------------------
CREATE TABLE transiciones_estado (
  desde estado_tarea NOT NULL,
  hacia estado_tarea NOT NULL,
  quien text NOT NULL CHECK (quien IN ('lider', 'responsable')),
  PRIMARY KEY (desde, hacia, quien)
);
COMMENT ON TABLE transiciones_estado IS
  'Copia de TRANSICIONES de packages/shared/src/estados.ts (fuente de verdad). Una prueba compara ambas.';
INSERT INTO transiciones_estado (desde, hacia, quien) VALUES
  ('backlog',    'aceptada',   'lider'),
  ('aceptada',   'habilitada', 'lider'),
  ('aceptada',   'backlog',    'lider'),
  ('habilitada', 'en_curso',   'lider'), ('habilitada', 'en_curso',   'responsable'),
  ('en_curso',   'atascada',   'lider'), ('en_curso',   'atascada',   'responsable'),
  ('en_curso',   'completada', 'lider'), ('en_curso',   'completada', 'responsable'),
  ('atascada',   'en_curso',   'lider'), ('atascada',   'en_curso',   'responsable'),
  ('atascada',   'completada', 'lider'), ('atascada',   'completada', 'responsable'),
  ('completada', 'en_curso',   'lider');

-- ---------------------------------------------------------------------------------------------
-- 2. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

-- Los eventos de una misma transacción conservan su orden: se sellan con la hora del reloj,
-- no con la del inicio de la transacción (así el historial de la tarea sale en orden).
CREATE OR REPLACE FUNCTION fn_registrar_evento(
  p_equipo uuid, p_actor uuid, p_tipo text, p_objeto_tipo text, p_objeto_id uuid,
  p_carga jsonb, p_resumen text
) RETURNS void AS $$
DECLARE
  v_categoria text := split_part(p_tipo, '.', 1);
  v_accion    text := coalesce(nullif(split_part(p_tipo, '.', 2), ''), 'cambio');
  v_ahora     timestamptz := clock_timestamp();
BEGIN
  INSERT INTO eventos_dominio (equipo_id, tipo, objeto_tipo, objeto_id, actor_id, carga, creado_en)
  VALUES (p_equipo, p_tipo, p_objeto_tipo, p_objeto_id, p_actor, coalesce(p_carga, '{}'::jsonb), v_ahora);
  INSERT INTO actividad (equipo_id, autor_id, tipo, accion, objeto_tipo, objeto_id, resumen, detalle, creado_en)
  VALUES (p_equipo, p_actor, CASE WHEN v_categoria = 'tarea' THEN 'tarea' ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb), v_ahora);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_nombre_estado(p_estado estado_tarea) RETURNS text AS $$
  SELECT CASE p_estado
    WHEN 'propuesta' THEN 'Propuesta' WHEN 'backlog' THEN 'Backlog' WHEN 'aceptada' THEN 'Aceptada'
    WHEN 'habilitada' THEN 'Habilitada' WHEN 'en_curso' THEN 'En curso' WHEN 'atascada' THEN 'Atascada'
    WHEN 'completada' THEN 'Completada' WHEN 'rechazada' THEN 'Rechazada' WHEN 'cancelada' THEN 'Retirada'
  END;
$$ LANGUAGE sql IMMUTABLE;

/** Persona de una tarea con su color en el equipo (NULL si ya no es miembro activo). */
CREATE OR REPLACE FUNCTION fn_persona_json(p_equipo uuid, p_usuario uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object('usuario_id', u.id, 'nombre', u.nombre, 'color_idx', m.color_idx)
    FROM usuarios u
    LEFT JOIN membresias m ON m.usuario_id = u.id AND m.equipo_id = p_equipo AND m.estado = 'activa'
   WHERE u.id = p_usuario;
$$ LANGUAGE sql STABLE;

/** Tarea de equipo con la forma que devuelve la API (`TareaEquipo` de packages/shared). */
CREATE OR REPLACE FUNCTION fn_tarea_equipo_json(p_tarea uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'equipo_id', t.equipo_id, 'codigo', t.codigo, 'titulo', t.titulo,
    'descripcion', t.descripcion, 'estado', t.estado, 'prioridad', t.prioridad,
    'progreso', t.progreso, 'vence_en', fn_iso(t.vence_en), 'motivo', t.motivo,
    'rechazo_por', t.rechazo_por, 'cambios_pedidos', t.cambios_pedidos, 'resultado', t.resultado,
    'semaforo', t.semaforo, 'asignacion_pendiente', t.asignacion_pendiente, 'origen', t.origen,
    'orden', t.orden, 'sprint_id', t.sprint_id, 'archivada', t.archivada, 'version', t.version,
    'creado_en', fn_iso(t.creado_en), 'actualizado_en', fn_iso(t.actualizado_en),
    'completada_en', fn_iso(t.completada_en),
    'responsable', fn_persona_json(t.equipo_id, t.responsable_id),
    'proponente', fn_persona_json(t.equipo_id, t.proponente_id),
    'etiquetas', (SELECT coalesce(jsonb_agg(e.nombre ORDER BY e.nombre), '[]'::jsonb)
                    FROM tarea_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
                   WHERE te.tarea_id = t.id),
    'subtareas_total',  (SELECT count(*) FROM subtareas s WHERE s.tarea_id = t.id),
    'subtareas_hechas', (SELECT count(*) FROM subtareas s WHERE s.tarea_id = t.id AND s.hecha),
    'comentarios_total', (SELECT count(*) FROM comentarios_tarea c WHERE c.tarea_id = t.id))
    FROM v_tareas_semaforo t WHERE t.id = p_tarea;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_comentario_equipo_json(c comentarios_tarea, p_equipo uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object('id', c.id, 'texto', c.texto, 'autor', fn_persona_json(p_equipo, c.autor_id),
                            'creado_en', fn_iso(c.creado_en), 'editado_en', fn_iso(c.editado_en));
$$ LANGUAGE sql STABLE;

/** Un invitado solo alcanza las tareas compartidas con su membresía; para él las demás no existen. */
CREATE OR REPLACE FUNCTION fn_exigir_tarea_visible(p_equipo uuid, p_tarea uuid, p_rol rol_membresia, p_membresia uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tareas WHERE id = p_tarea AND equipo_id = p_equipo)
     OR (p_rol = 'invitado' AND NOT EXISTS (
           SELECT 1 FROM tarea_compartida WHERE tarea_id = p_tarea AND membresia_id = p_membresia)) THEN
    RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

/** Detalle de la tarea para quien consulta (`TareaEquipoDetalle`, sin `transiciones`: las calcula la API). */
CREATE OR REPLACE FUNCTION fn_tarea_equipo_detalle(p_actor uuid, p_equipo uuid, p_tarea uuid) RETURNS jsonb AS $$
DECLARE v_rol rol_membresia; v_origen origen_tarea;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor, p_equipo);
  SELECT origen INTO v_origen FROM tareas WHERE id = p_tarea;
  RETURN fn_tarea_equipo_json(p_tarea) || jsonb_build_object(
    -- La votación solo existe en las propuestas del líder y los invitados no la ven.
    'votacion', CASE WHEN v_origen = 'propuesta' AND v_rol <> 'invitado'
                     THEN fn_votacion_resumen(p_tarea, p_actor) END,
    'subtareas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'titulo', s.titulo, 'hecha', s.hecha)
                                            ORDER BY s.orden COLLATE "C", s.id), '[]'::jsonb)
                    FROM subtareas s WHERE s.tarea_id = p_tarea),
    'comentarios', (SELECT coalesce(jsonb_agg(fn_comentario_equipo_json(c, p_equipo) ORDER BY c.creado_en, c.id), '[]'::jsonb)
                      FROM comentarios_tarea c WHERE c.tarea_id = p_tarea),
    'historial', CASE WHEN v_rol = 'invitado' THEN '[]'::jsonb ELSE
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'resumen', x.resumen, 'autor', x.autor,
                                                    'creado_en', fn_iso(x.creado_en))
                                 ORDER BY x.creado_en DESC), '[]'::jsonb)
         FROM (SELECT a.id, a.resumen, u.nombre AS autor, a.creado_en
                 FROM actividad a LEFT JOIN usuarios u ON u.id = a.autor_id
                WHERE a.objeto_tipo = 'tarea' AND a.objeto_id = p_tarea
                ORDER BY a.creado_en DESC LIMIT 50) x) END,
    -- Con quién está compartida solo lo ve el líder.
    'compartida_con', CASE WHEN v_rol = 'lider'
      THEN (SELECT coalesce(jsonb_agg(tc.membresia_id), '[]'::jsonb) FROM tarea_compartida tc WHERE tc.tarea_id = p_tarea)
      ELSE '[]'::jsonb END);
END $$ LANGUAGE plpgsql STABLE;

/** Bloquea la tarea para la transacción, comprobando que el actor la alcanza. */
CREATE OR REPLACE FUNCTION fn_bloquear_tarea_visible(p_equipo uuid, p_tarea uuid, p_rol rol_membresia, p_membresia uuid)
RETURNS tareas AS $$
DECLARE t tareas;
BEGIN
  t := fn_bloquear_tarea(p_equipo, p_tarea);
  PERFORM fn_exigir_tarea_visible(p_equipo, p_tarea, p_rol, p_membresia);
  RETURN t;
END $$ LANGUAGE plpgsql;

/**
 * Bloquea las tareas de una columna (equipo + estado) y, si hay claves de orden repetidas (la
 * semilla las trae todas en `a0`), las reparte de nuevo para que siempre exista una clave
 * estrictamente entre dos vecinas (DEC-021).
 */
CREATE OR REPLACE FUNCTION fn_columna_ordenar(p_equipo uuid, p_estado estado_tarea) RETURNS void AS $$
DECLARE r record; v_previa text := NULL; v_repetidas boolean := false; v_clave text := NULL;
BEGIN
  FOR r IN SELECT id, orden FROM tareas WHERE equipo_id = p_equipo AND estado = p_estado
            ORDER BY orden COLLATE "C", codigo FOR UPDATE LOOP
    IF v_previa IS NOT NULL AND (r.orden COLLATE "C") <= (v_previa COLLATE "C") THEN v_repetidas := true; END IF;
    v_previa := r.orden;
  END LOOP;
  IF NOT v_repetidas THEN RETURN; END IF;
  FOR r IN SELECT id FROM tareas WHERE equipo_id = p_equipo AND estado = p_estado
            ORDER BY orden COLLATE "C", codigo LOOP
    v_clave := fn_orden_entre(v_clave, NULL);
    UPDATE tareas SET orden = v_clave WHERE id = r.id;
  END LOOP;
END $$ LANGUAGE plpgsql;

/** ¿Puede el actor pasar la tarea a `p_destino`? Misma regla que `transicionesValidas` de shared. */
CREATE OR REPLACE FUNCTION fn_transicion_permitida(t tareas, p_destino estado_tarea, p_rol rol_membresia, p_actor uuid)
RETURNS boolean AS $$
  SELECT CASE
    WHEN p_rol = 'lider' THEN
      EXISTS (SELECT 1 FROM transiciones_estado WHERE desde = t.estado AND hacia = p_destino AND quien = 'lider')
    WHEN p_rol = 'integrante' AND t.responsable_id = p_actor AND NOT t.asignacion_pendiente THEN
      EXISTS (SELECT 1 FROM transiciones_estado WHERE desde = t.estado AND hacia = p_destino AND quien = 'responsable')
    ELSE false
  END;
$$ LANGUAGE sql STABLE;

/** Solo el líder o el responsable trabajan la tarea (regla (p) de `cambiar_estado_tarea`). */
CREATE OR REPLACE FUNCTION fn_exigir_trabajo_en_tarea(t tareas, p_rol rol_membresia, p_actor uuid) RETURNS void AS $$
BEGIN
  IF NOT (p_rol = 'lider' OR (p_rol = 'integrante' AND t.responsable_id = p_actor)) THEN
    RAISE EXCEPTION 'Solo el responsable o el líder pueden cambiar el estado de esta tarea.'
      USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
END $$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Aplica un cambio de estado ya validado: campos que cambian con el estado (avance, fecha de
 * cierre, resultado, sprint), subtareas al completar y el evento de dominio.
 */
CREATE OR REPLACE FUNCTION fn_tarea_aplicar_estado(
  p_actor uuid, p_equipo uuid, t tareas, p_destino estado_tarea, p_motivo text, p_orden text
) RETURNS void AS $$
DECLARE
  v_ahora     timestamptz := clock_timestamp();
  v_completa  boolean := p_destino = 'completada';
  v_reabre    boolean := t.estado = 'completada' AND p_destino <> 'completada';
  v_resultado resultado_tarea;
  v_quien     text := fn_primer_nombre(p_actor);
  v_tarea     text := fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»';
BEGIN
  IF v_completa THEN
    v_resultado := CASE WHEN t.vence_en IS NOT NULL AND v_ahora > t.vence_en THEN 'con_retraso' ELSE 'a_tiempo' END;
  END IF;
  UPDATE tareas SET
    estado        = p_destino,
    motivo        = CASE WHEN p_destino = 'atascada' THEN p_motivo END,
    progreso      = CASE WHEN v_completa THEN 100
                         WHEN v_reabre THEN least(progreso, 90)
                         WHEN p_destino = 'en_curso' AND progreso = 0 THEN 5
                         ELSE progreso END,
    completada_en = CASE WHEN v_completa THEN v_ahora WHEN v_reabre THEN NULL ELSE completada_en END,
    resultado     = CASE WHEN v_completa THEN v_resultado WHEN v_reabre THEN NULL ELSE resultado END,
    -- Al backlog sale del sprint; del backlog al tablero entra al sprint activo, si lo hay.
    sprint_id     = CASE WHEN p_destino = 'backlog' THEN NULL
                         WHEN t.estado = 'backlog' AND p_destino = 'aceptada'
                           THEN (SELECT id FROM sprints WHERE equipo_id = p_equipo AND estado = 'activo')
                         ELSE sprint_id END,
    orden         = coalesce(p_orden, orden)
   WHERE id = t.id;
  IF v_completa THEN UPDATE subtareas SET hecha = true WHERE tarea_id = t.id; END IF;

  PERFORM fn_registrar_evento(p_equipo, p_actor,
    CASE WHEN v_completa THEN 'tarea.completada' ELSE 'tarea.estado_cambiado' END, 'tarea', t.id,
    jsonb_strip_nulls(jsonb_build_object('de', t.estado, 'a', p_destino, 'motivo', p_motivo, 'resultado', v_resultado))
      || jsonb_build_object('responsable_id', t.responsable_id),
    CASE
      WHEN v_completa THEN v_quien || ' completó ' || v_tarea
                           || CASE WHEN v_resultado = 'con_retraso' THEN ' (con retraso)' ELSE ' a tiempo' END
      WHEN p_destino = 'atascada' THEN v_quien || ' marcó ' || v_tarea || ' como atascada: «' || coalesce(p_motivo, '') || '»'
      WHEN t.estado = 'completada' THEN v_quien || ' reabrió ' || v_tarea
      ELSE v_quien || ' pasó ' || v_tarea || ' de ' || fn_nombre_estado(t.estado) || ' a ' || fn_nombre_estado(p_destino)
    END);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 3. Procesos de lectura
-- ---------------------------------------------------------------------------------------------

/**
 * Tareas del equipo según la vista. Un invitado solo recibe las compartidas con él y no tiene
 * backlog ni votación. En `votacion` y `mias` cada propuesta lleva su resumen de votación (V-8).
 */
CREATE OR REPLACE FUNCTION proc_tarea_listar(p_actor_id uuid, p_equipo_id uuid, p_vista text DEFAULT 'tablero')
RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia; v_con_votacion boolean;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF p_vista NOT IN ('tablero', 'backlog', 'votacion', 'mias', 'todas') THEN
    RAISE EXCEPTION 'La vista no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_rol = 'invitado' AND p_vista IN ('backlog', 'votacion', 'mias') THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  v_con_votacion := p_vista IN ('votacion', 'mias') AND v_rol <> 'invitado';
  RETURN (
    SELECT coalesce(jsonb_agg(
             fn_tarea_equipo_json(t.id)
               || CASE WHEN v_con_votacion THEN jsonb_build_object('votacion',
                    CASE WHEN t.origen = 'propuesta' THEN fn_votacion_resumen(t.id, p_actor_id) END)
                  ELSE '{}'::jsonb END
             ORDER BY t.orden COLLATE "C", t.codigo), '[]'::jsonb)
      FROM tareas t
     WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
       AND (v_rol <> 'invitado' OR EXISTS (
              SELECT 1 FROM tarea_compartida tc WHERE tc.tarea_id = t.id AND tc.membresia_id = v_membresia))
       AND CASE p_vista
             WHEN 'tablero'  THEN t.estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada', 'completada')
             WHEN 'backlog'  THEN t.estado = 'backlog'
             WHEN 'votacion' THEN t.estado IN ('propuesta', 'rechazada', 'cancelada')
             WHEN 'mias'     THEN t.estado = 'propuesta' OR EXISTS (
                                    SELECT 1 FROM tarea_votos v WHERE v.tarea_id = t.id AND v.usuario_id = p_actor_id)
             ELSE true
           END);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Conteos para las pestañas de tareas: tablero, backlog y propuestas abiertas en votación. */
CREATE OR REPLACE FUNCTION proc_tarea_conteos(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'tablero',  count(*) FILTER (WHERE estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada', 'completada')),
      'backlog',  count(*) FILTER (WHERE estado = 'backlog'),
      'votacion', count(*) FILTER (WHERE estado = 'propuesta'))
      FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Detalle de una tarea del equipo (subtareas, comentarios, historial, votación). */
CREATE OR REPLACE FUNCTION proc_tarea_obtener(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid) RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, p_tarea_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Editar y eliminar
-- ---------------------------------------------------------------------------------------------

/**
 * El líder edita cualquier tarea. Un integrante solo actualiza el avance de SU tarea (ya aceptada
 * la asignación). `p_cambios` lleva solo los campos que cambian; `vence_en` puede ser null.
 */
CREATE OR REPLACE FUNCTION proc_tarea_editar(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_version int, p_cambios jsonb
) RETURNS jsonb AS $$
DECLARE
  t             tareas;
  v_membresia   uuid;
  v_rol         rol_membresia;
  v_campos      text[];
  v_solo_avance boolean;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  SELECT coalesce(array_agg(k), '{}') INTO v_campos FROM jsonb_object_keys(p_cambios) AS k WHERE k <> 'etiquetas';
  v_solo_avance := v_campos = ARRAY['progreso'] AND NOT (p_cambios ? 'etiquetas');
  -- Primero el permiso y después la versión: a quien no puede editar no se le dice nada más.
  IF v_rol <> 'lider' AND NOT (v_rol = 'integrante' AND v_solo_avance
                               AND t.responsable_id = p_actor_id AND NOT t.asignacion_pendiente) THEN
    RAISE EXCEPTION 'Solo el líder puede editar tareas de otras personas.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  PERFORM fn_exigir_version(t, p_version);
  IF p_cambios ? 'progreso' AND t.estado = 'completada' AND (p_cambios->>'progreso')::int <> 100 THEN
    RAISE EXCEPTION 'Una tarea completada tiene el 100 %% de avance.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;

  UPDATE tareas SET
    actualizado_en = now(),   -- siempre hay UPDATE: el disparador sube `version`
    titulo      = coalesce(p_cambios->>'titulo', titulo),
    descripcion = coalesce(p_cambios->>'descripcion', descripcion),
    prioridad   = coalesce((p_cambios->>'prioridad')::prioridad_tarea, prioridad),
    vence_en    = CASE WHEN p_cambios ? 'vence_en' THEN (p_cambios->>'vence_en')::timestamptz ELSE vence_en END,
    progreso    = coalesce((p_cambios->>'progreso')::smallint, progreso),
    archivada   = coalesce((p_cambios->>'archivada')::boolean, archivada)
   WHERE id = t.id;
  IF p_cambios ? 'etiquetas' THEN
    PERFORM fn_fijar_etiquetas(p_equipo_id, t.id,
      ARRAY(SELECT jsonb_array_elements_text(p_cambios->'etiquetas')));
  END IF;

  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN v_solo_avance THEN 'tarea.progreso' ELSE 'tarea.editada' END, 'tarea', t.id,
    jsonb_build_object('campos', to_jsonb(v_campos), 'responsable_id', t.responsable_id),
    CASE WHEN v_solo_avance
      THEN fn_primer_nombre(p_actor_id) || ' actualizó el avance de ' || fn_codigo_tarea(t.codigo)
           || ' (' || (p_cambios->>'progreso') || ' %)'
      ELSE fn_primer_nombre(p_actor_id) || ' editó ' || fn_codigo_tarea(t.codigo)
           || ' «' || coalesce(p_cambios->>'titulo', t.titulo) || '»'
    END);
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder elimina una tarea (con sus subtareas, comentarios y votos). */
CREATE OR REPLACE FUNCTION proc_tarea_eliminar(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid) RETURNS jsonb AS $$
DECLARE t tareas;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede editar tareas de otras personas.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea(p_equipo_id, p_tarea_id);
  DELETE FROM tareas WHERE id = t.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.eliminada', 'tarea', t.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' eliminó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»');
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 5. Estados y tablero
-- ---------------------------------------------------------------------------------------------

/** Cambia el estado de una tarea si la máquina de estados lo permite; queda al final de su columna. */
CREATE OR REPLACE FUNCTION proc_tarea_cambiar_estado(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_version int, p_estado text, p_motivo text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE t tareas; v_membresia uuid; v_rol rol_membresia; v_destino estado_tarea := p_estado::estado_tarea;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  PERFORM fn_exigir_trabajo_en_tarea(t, v_rol, p_actor_id);
  PERFORM fn_exigir_version(t, p_version);
  IF NOT fn_transicion_permitida(t, v_destino, v_rol, p_actor_id) THEN
    RAISE EXCEPTION 'Ese cambio de estado no está permitido.' USING ERRCODE = 'NX007', HINT = 'transicion_invalida';
  END IF;
  IF v_destino = 'atascada' AND nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Para marcar la tarea como atascada escribe el motivo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  PERFORM fn_columna_ordenar(p_equipo_id, v_destino);
  PERFORM fn_tarea_aplicar_estado(p_actor_id, p_equipo_id, t, v_destino, p_motivo,
                                  fn_orden_al_final(p_equipo_id, v_destino, t.id));
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Arrastrar y soltar: «mover la tarea entre A y B». Calcula el nuevo orden (índice fraccionario)
 * y, si cambia de columna, valida y aplica la transición de estado. Solo el líder reordena
 * dentro de una columna.
 */
CREATE OR REPLACE FUNCTION proc_tarea_mover(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_version int,
  p_antes_id uuid, p_despues_id uuid, p_estado text DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  t           tareas;
  v_membresia uuid;
  v_rol       rol_membresia;
  v_destino   estado_tarea;
  v_cambia    boolean;
  v_ids       uuid[];
  v_ordenes   text[];
  i_antes     int;
  i_despues   int;
  v_orden     text;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  -- Permiso, después la versión y por último qué movimiento es: si otra persona ya la movió,
  -- quien llega tarde recibe 409 y no un error que no entendería.
  PERFORM fn_exigir_trabajo_en_tarea(t, v_rol, p_actor_id);
  PERFORM fn_exigir_version(t, p_version);
  v_destino := coalesce(p_estado::estado_tarea, t.estado);
  v_cambia := v_destino <> t.estado;
  IF v_cambia THEN
    IF NOT fn_transicion_permitida(t, v_destino, v_rol, p_actor_id) THEN
      RAISE EXCEPTION 'Ese cambio de estado no está permitido.' USING ERRCODE = 'NX007', HINT = 'transicion_invalida';
    END IF;
    IF v_destino = 'atascada' AND nullif(btrim(p_motivo), '') IS NULL THEN
      RAISE EXCEPTION 'Para marcar la tarea como atascada escribe el motivo.' USING ERRCODE = 'NX010', HINT = 'validacion';
    END IF;
  ELSIF v_rol <> 'lider' THEN
    RAISE EXCEPTION 'Solo el líder puede reordenar las tareas del tablero.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;

  PERFORM fn_columna_ordenar(p_equipo_id, v_destino);
  SELECT array_agg(id ORDER BY orden COLLATE "C", codigo), array_agg(orden ORDER BY orden COLLATE "C", codigo)
    INTO v_ids, v_ordenes
    FROM tareas WHERE equipo_id = p_equipo_id AND estado = v_destino AND id <> t.id;
  i_antes := array_position(v_ids, p_antes_id);
  i_despues := array_position(v_ids, p_despues_id);
  IF (p_antes_id IS NOT NULL AND i_antes IS NULL) OR (p_despues_id IS NOT NULL AND i_despues IS NULL) THEN
    -- Las vecinas ya no están en esa columna: otra persona movió algo.
    RAISE EXCEPTION 'El tablero cambió mientras movías la tarjeta. Te mostramos el orden más reciente.'
      USING ERRCODE = 'NX012', HINT = 'conflicto_orden';
  END IF;
  IF p_antes_id IS NULL AND p_despues_id IS NULL THEN
    v_orden := fn_orden_entre(v_ordenes[cardinality(v_ordenes)], NULL);   -- sin vecinas: al final
  ELSE
    -- Con una sola vecina se inserta junto a ella.
    v_orden := fn_orden_entre(
      CASE WHEN i_antes IS NOT NULL THEN v_ordenes[i_antes] WHEN i_despues > 1 THEN v_ordenes[i_despues - 1] END,
      CASE WHEN i_despues IS NOT NULL THEN v_ordenes[i_despues] WHEN i_antes IS NOT NULL THEN v_ordenes[i_antes + 1] END);
  END IF;

  IF v_cambia THEN
    PERFORM fn_tarea_aplicar_estado(p_actor_id, p_equipo_id, t, v_destino, p_motivo, v_orden);
  ELSE
    UPDATE tareas SET orden = v_orden WHERE id = t.id;
  END IF;
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 6. Asignación y compartir
-- ---------------------------------------------------------------------------------------------

/** El líder asigna (o quita) al responsable; el asignado debe aceptar (V-11). */
CREATE OR REPLACE FUNCTION proc_tarea_asignar(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_version int, p_responsable_id uuid
) RETURNS jsonb AS $$
DECLARE t tareas; v_responsable text;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id,
    'Solo el líder puede asignar responsables. Puedes solicitar un cambio en los comentarios.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea(p_equipo_id, p_tarea_id);
  PERFORM fn_exigir_version(t, p_version);
  -- V-11: el líder asigna al proponer o cuando la propuesta ya fue aceptada.
  IF t.estado IN ('propuesta', 'rechazada', 'cancelada', 'completada') THEN
    RAISE EXCEPTION '%', CASE t.estado
        WHEN 'completada' THEN 'La tarea ya está completada.'
        WHEN 'propuesta'  THEN 'La propuesta sigue en votación; asigna al responsable cuando se acepte.'
        ELSE 'Esta propuesta no fue aceptada; reformúlala para volver a votarla.' END
      USING ERRCODE = 'NX007', HINT = 'transicion_invalida';
  END IF;
  IF p_responsable_id IS NOT NULL THEN v_responsable := fn_exigir_responsable(p_equipo_id, p_responsable_id); END IF;
  UPDATE tareas SET responsable_id = p_responsable_id,
                    asignacion_pendiente = p_responsable_id IS NOT NULL AND p_responsable_id <> p_actor_id
   WHERE id = t.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN p_responsable_id IS NOT NULL THEN 'tarea.asignada' ELSE 'tarea.desasignada' END, 'tarea', t.id,
    jsonb_build_object('responsable_id', p_responsable_id, 'anterior_id', t.responsable_id),
    fn_primer_nombre(p_actor_id) || CASE WHEN v_responsable IS NOT NULL
      THEN ' asignó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» a ' || split_part(v_responsable, ' ', 1)
      ELSE ' dejó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» sin responsable' END);
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * El responsable acepta la asignación o la rechaza con motivo. Si la rechaza, la tarea conserva
 * su estado y queda sin responsable para que el líder la reasigne directamente (V-11).
 */
CREATE OR REPLACE FUNCTION proc_tarea_responder_asignacion(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_acepta boolean, p_motivo text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE t tareas; v_membresia uuid; v_rol rol_membresia; v_tarea text;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  IF t.responsable_id IS DISTINCT FROM p_actor_id OR NOT t.asignacion_pendiente THEN
    RAISE EXCEPTION 'No tienes una asignación pendiente en esta tarea.'
      USING ERRCODE = 'NX007', HINT = 'sin_asignacion_pendiente';
  END IF;
  IF NOT p_acepta AND nullif(btrim(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'Explica por qué rechazas la asignación.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  v_tarea := fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»';
  IF p_acepta THEN
    UPDATE tareas SET asignacion_pendiente = false WHERE id = t.id;
  ELSE
    UPDATE tareas SET asignacion_pendiente = false, responsable_id = NULL WHERE id = t.id;
  END IF;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN p_acepta THEN 'tarea.asignacion_aceptada' ELSE 'tarea.asignacion_rechazada' END, 'tarea', t.id,
    jsonb_strip_nulls(jsonb_build_object('responsable_id', p_actor_id, 'motivo', p_motivo)),
    fn_primer_nombre(p_actor_id) || CASE WHEN p_acepta
      THEN ' aceptó la asignación de ' || v_tarea
      ELSE ' rechazó la asignación de ' || v_tarea || ': «' || p_motivo || '»; el líder la reasigna' END);
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder elige qué invitados (por membresía) ven la tarea; sustituye la lista anterior. */
CREATE OR REPLACE FUNCTION proc_tarea_compartir(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_membresias uuid[]
) RETURNS jsonb AS $$
DECLARE t tareas; v_unicos uuid[]; v_n int;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede invitar personas.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea(p_equipo_id, p_tarea_id);
  SELECT coalesce(array_agg(DISTINCT m), '{}') INTO v_unicos FROM unnest(coalesce(p_membresias, '{}')) AS m;
  v_n := cardinality(v_unicos);
  IF v_n <> (SELECT count(*) FROM membresias
              WHERE id = ANY (v_unicos) AND equipo_id = p_equipo_id AND rol = 'invitado' AND estado = 'activa') THEN
    RAISE EXCEPTION 'Solo se comparte con invitados activos de este equipo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  DELETE FROM tarea_compartida WHERE tarea_id = t.id;
  INSERT INTO tarea_compartida (tarea_id, membresia_id) SELECT t.id, m FROM unnest(v_unicos) AS m;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.compartida', 'tarea', t.id,
    jsonb_build_object('invitados', v_n),
    fn_primer_nombre(p_actor_id) || ' compartió ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» con '
      || v_n || CASE WHEN v_n = 1 THEN ' invitado' ELSE ' invitados' END);
  RETURN fn_tarea_equipo_detalle(p_actor_id, p_equipo_id, t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 7. Subtareas y comentarios (las subtareas las gestiona el líder o el responsable)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_exigir_gestion_subtareas(p_actor uuid, p_equipo uuid, p_tarea uuid) RETURNS tareas AS $$
DECLARE t tareas; v_membresia uuid; v_rol rol_membresia;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor, p_equipo);
  PERFORM fn_exigir_equipo_activo(p_equipo);
  t := fn_bloquear_tarea_visible(p_equipo, p_tarea, v_rol, v_membresia);
  PERFORM fn_exigir_trabajo_en_tarea(t, v_rol, p_actor);
  RETURN t;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION proc_subtarea_crear(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_titulo text)
RETURNS jsonb AS $$
DECLARE s subtareas;
BEGIN
  PERFORM fn_exigir_gestion_subtareas(p_actor_id, p_equipo_id, p_tarea_id);
  INSERT INTO subtareas (tarea_id, titulo) VALUES (p_tarea_id, p_titulo) RETURNING * INTO s;
  RETURN jsonb_build_object('id', s.id, 'titulo', s.titulo, 'hecha', s.hecha);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_subtarea_actualizar(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_subtarea_id uuid, p_cambios jsonb
) RETURNS jsonb AS $$
DECLARE s subtareas;
BEGIN
  PERFORM fn_exigir_gestion_subtareas(p_actor_id, p_equipo_id, p_tarea_id);
  UPDATE subtareas SET titulo = coalesce(p_cambios->>'titulo', titulo),
                       hecha  = coalesce((p_cambios->>'hecha')::boolean, hecha)
   WHERE id = p_subtarea_id AND tarea_id = p_tarea_id
  RETURNING * INTO s;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa subtarea.' USING ERRCODE = 'NX006', HINT = 'subtarea_no_encontrada';
  END IF;
  RETURN jsonb_build_object('id', s.id, 'titulo', s.titulo, 'hecha', s.hecha);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_subtarea_eliminar(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_subtarea_id uuid
) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_gestion_subtareas(p_actor_id, p_equipo_id, p_tarea_id);
  DELETE FROM subtareas WHERE id = p_subtarea_id AND tarea_id = p_tarea_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos esa subtarea.' USING ERRCODE = 'NX006', HINT = 'subtarea_no_encontrada';
  END IF;
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Comentan el líder, los integrantes y los invitados con la tarea compartida. */
CREATE OR REPLACE FUNCTION proc_comentario_crear(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_texto text)
RETURNS jsonb AS $$
DECLARE t tareas; c comentarios_tarea; v_membresia uuid; v_rol rol_membresia;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  INSERT INTO comentarios_tarea (tarea_id, autor_id, texto) VALUES (t.id, p_actor_id, p_texto) RETURNING * INTO c;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.comentada', 'tarea', t.id,
    jsonb_build_object('comentario_id', c.id, 'responsable_id', t.responsable_id),
    fn_primer_nombre(p_actor_id) || ' comentó en ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»');
  RETURN fn_comentario_equipo_json(c, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Cada quien borra sus comentarios; el líder, además, los ajenos. */
CREATE OR REPLACE FUNCTION proc_comentario_eliminar(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_comentario_id uuid
) RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  PERFORM fn_bloquear_tarea_visible(p_equipo_id, p_tarea_id, v_rol, v_membresia);
  DELETE FROM comentarios_tarea
   WHERE id = p_comentario_id AND tarea_id = p_tarea_id AND (v_rol = 'lider' OR autor_id = p_actor_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese comentario.' USING ERRCODE = 'NX006', HINT = 'comentario_no_encontrado';
  END IF;
  RETURN jsonb_build_object('eliminado', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Deja los permisos al día (rol nexo_app, migración 0008). En la primera aplicación la función
-- aún no existe; la 0008 la crea y la ejecuta.
DO $$ BEGIN
  IF to_regproc('fn_conceder_procesos') IS NOT NULL THEN PERFORM fn_conceder_procesos(); END IF;
END $$;

-- Down Migration
DROP FUNCTION IF EXISTS proc_comentario_eliminar(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_comentario_crear(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_subtarea_eliminar(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_subtarea_actualizar(uuid, uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_subtarea_crear(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS fn_exigir_gestion_subtareas(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_tarea_compartir(uuid, uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS proc_tarea_responder_asignacion(uuid, uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS proc_tarea_asignar(uuid, uuid, uuid, int, uuid);
DROP FUNCTION IF EXISTS proc_tarea_mover(uuid, uuid, uuid, int, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS proc_tarea_cambiar_estado(uuid, uuid, uuid, int, text, text);
DROP FUNCTION IF EXISTS proc_tarea_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_tarea_editar(uuid, uuid, uuid, int, jsonb);
DROP FUNCTION IF EXISTS proc_tarea_obtener(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_tarea_conteos(uuid, uuid);
DROP FUNCTION IF EXISTS proc_tarea_listar(uuid, uuid, text);
DROP FUNCTION IF EXISTS fn_tarea_aplicar_estado(uuid, uuid, tareas, estado_tarea, text, text);
DROP FUNCTION IF EXISTS fn_exigir_trabajo_en_tarea(tareas, rol_membresia, uuid);
DROP FUNCTION IF EXISTS fn_transicion_permitida(tareas, estado_tarea, rol_membresia, uuid);
DROP FUNCTION IF EXISTS fn_columna_ordenar(uuid, estado_tarea);
DROP FUNCTION IF EXISTS fn_bloquear_tarea_visible(uuid, uuid, rol_membresia, uuid);
DROP FUNCTION IF EXISTS fn_tarea_equipo_detalle(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS fn_exigir_tarea_visible(uuid, uuid, rol_membresia, uuid);
DROP FUNCTION IF EXISTS fn_comentario_equipo_json(comentarios_tarea, uuid);
DROP FUNCTION IF EXISTS fn_tarea_equipo_json(uuid);
DROP FUNCTION IF EXISTS fn_persona_json(uuid, uuid);
DROP FUNCTION IF EXISTS fn_nombre_estado(estado_tarea);
DROP TABLE IF EXISTS transiciones_estado;
-- fn_registrar_evento vuelve a la versión de la 0003 (hora del inicio de la transacción).
CREATE OR REPLACE FUNCTION fn_registrar_evento(
  p_equipo uuid, p_actor uuid, p_tipo text, p_objeto_tipo text, p_objeto_id uuid,
  p_carga jsonb, p_resumen text
) RETURNS void AS $$
DECLARE
  v_categoria text := split_part(p_tipo, '.', 1);
  v_accion    text := coalesce(nullif(split_part(p_tipo, '.', 2), ''), 'cambio');
BEGIN
  INSERT INTO eventos_dominio (equipo_id, tipo, objeto_tipo, objeto_id, actor_id, carga)
  VALUES (p_equipo, p_tipo, p_objeto_tipo, p_objeto_id, p_actor, coalesce(p_carga, '{}'::jsonb));
  INSERT INTO actividad (equipo_id, autor_id, tipo, accion, objeto_tipo, objeto_id, resumen, detalle)
  VALUES (p_equipo, p_actor, CASE WHEN v_categoria = 'tarea' THEN 'tarea' ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb));
END $$ LANGUAGE plpgsql;
