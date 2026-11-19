-- Fase 2.5 · Procesos de la BD (DEC-025): espacio personal.
-- Sustituyen al SQL de servicios/tareasPersonales.ts y repositorios/tareasPersonales.ts.
-- Las tareas personales son privadas (docs/01, 2.3.8): todo proceso filtra por dueño y una
-- tarea ajena responde NX006 (404), sin revelar que existe (DEC-014). No generan eventos de
-- dominio, solo actividad personal (DEC-013). Documentación: docs/08_Procesos_BD.md.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------------------------

/** Tarea personal con la forma que devuelve la API (`TareaPersonal` de packages/shared). */
CREATE OR REPLACE FUNCTION fn_tarea_personal_json(p_tarea uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'codigo', t.codigo, 'titulo', t.titulo, 'descripcion', t.descripcion,
    'estado', t.estado, 'prioridad', t.prioridad, 'progreso', t.progreso,
    'vence_en', fn_iso(t.vence_en), 'motivo', t.motivo, 'resultado', t.resultado,
    'semaforo', t.semaforo, 'archivada', t.archivada, 'version', t.version,
    'creado_en', fn_iso(t.creado_en), 'actualizado_en', fn_iso(t.actualizado_en),
    'completada_en', fn_iso(t.completada_en),
    'etiquetas', (SELECT coalesce(jsonb_agg(e.nombre ORDER BY e.nombre), '[]'::jsonb)
                    FROM tarea_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
                   WHERE te.tarea_id = t.id),
    'subtareas_total',  (SELECT count(*) FROM subtareas s WHERE s.tarea_id = t.id),
    'subtareas_hechas', (SELECT count(*) FROM subtareas s WHERE s.tarea_id = t.id AND s.hecha))
    FROM v_tareas_semaforo t WHERE t.id = p_tarea;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_comentario_personal_json(c comentarios_tarea) RETURNS jsonb AS $$
  SELECT jsonb_build_object('id', c.id, 'texto', c.texto, 'autor_id', c.autor_id,
                            'creado_en', fn_iso(c.creado_en), 'editado_en', fn_iso(c.editado_en));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_tarea_personal_detalle(p_tarea uuid) RETURNS jsonb AS $$
  SELECT fn_tarea_personal_json(p_tarea) || jsonb_build_object(
    'subtareas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'titulo', s.titulo, 'hecha', s.hecha)
                                            ORDER BY s.orden COLLATE "C", s.id), '[]'::jsonb)
                    FROM subtareas s WHERE s.tarea_id = p_tarea),
    'comentarios', (SELECT coalesce(jsonb_agg(fn_comentario_personal_json(c) ORDER BY c.creado_en, c.id), '[]'::jsonb)
                      FROM comentarios_tarea c WHERE c.tarea_id = p_tarea));
$$ LANGUAGE sql STABLE;

/** Comprueba que la tarea es del actor (y la bloquea si se pide); si no, NX006. */
CREATE OR REPLACE FUNCTION fn_tarea_propia(p_actor uuid, p_tarea uuid, p_bloquear boolean DEFAULT false) RETURNS tareas AS $$
DECLARE t tareas;
BEGIN
  IF p_bloquear THEN
    SELECT * INTO t FROM tareas WHERE id = p_tarea AND dueno_id = p_actor FOR UPDATE;
  ELSE
    SELECT * INTO t FROM tareas WHERE id = p_tarea AND dueno_id = p_actor;
  END IF;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
  END IF;
  RETURN t;
END $$ LANGUAGE plpgsql;

/** Sustituye las etiquetas de una tarea personal; crea las que la persona aún no tenga. */
CREATE OR REPLACE FUNCTION fn_fijar_etiquetas_personales(p_usuario uuid, p_tarea uuid, p_nombres text[]) RETURNS void AS $$
BEGIN
  DELETE FROM tarea_etiquetas WHERE tarea_id = p_tarea;
  IF coalesce(cardinality(p_nombres), 0) = 0 THEN RETURN; END IF;
  -- Sin distinguir mayúsculas (la columna es citext).
  INSERT INTO etiquetas (usuario_id, nombre)
  SELECT DISTINCT ON (lower(n)) p_usuario, n FROM unnest(p_nombres) AS n
  ON CONFLICT (usuario_id, nombre) WHERE usuario_id IS NOT NULL DO NOTHING;
  INSERT INTO tarea_etiquetas (tarea_id, etiqueta_id)
  SELECT p_tarea, e.id FROM etiquetas e
   WHERE e.usuario_id = p_usuario AND e.nombre = ANY (p_nombres::citext[])
  ON CONFLICT DO NOTHING;
END $$ LANGUAGE plpgsql;

/** Actividad del ámbito personal (DEC-013): las tareas personales no generan eventos de dominio. */
CREATE OR REPLACE FUNCTION fn_actividad_personal(p_usuario uuid, p_accion text, p_tarea uuid, p_resumen text) RETURNS void AS $$
  INSERT INTO actividad (usuario_id, autor_id, tipo, accion, objeto_tipo, objeto_id, resumen)
  VALUES (p_usuario, p_usuario, 'tarea', p_accion, 'tarea', p_tarea, p_resumen);
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------------------------
-- Tareas personales
-- ---------------------------------------------------------------------------------------------

/**
 * Tareas personales del actor con filtros: `{ estado?: [], prioridad?: [], etiqueta?, q?, archivadas }`.
 * Ordenadas por fecha de entrega (las que no tienen, al final) y código.
 */
CREATE OR REPLACE FUNCTION proc_personal_tarea_listar(p_actor_id uuid, p_filtros jsonb DEFAULT '{}'::jsonb) RETURNS jsonb AS $$
DECLARE
  v_estados     text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_filtros->'estado', '[]'::jsonb)));
  v_prioridades text[] := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_filtros->'prioridad', '[]'::jsonb)));
  v_etiqueta    text := nullif(p_filtros->>'etiqueta', '');
  v_q           text := nullif(p_filtros->>'q', '');
  v_archivadas  boolean := coalesce((p_filtros->>'archivadas')::boolean, false);
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(fn_tarea_personal_json(t.id) ORDER BY t.vence_en ASC NULLS LAST, t.codigo), '[]'::jsonb)
      FROM tareas t
     WHERE t.dueno_id = p_actor_id AND t.archivada = v_archivadas
       AND (cardinality(v_estados) = 0 OR t.estado::text = ANY (v_estados))
       AND (cardinality(v_prioridades) = 0 OR t.prioridad::text = ANY (v_prioridades))
       -- Los comodines del texto buscado se escapan: se busca tal cual, sin distinguir mayúsculas.
       AND (v_q IS NULL OR t.titulo ILIKE
              '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
       AND (v_etiqueta IS NULL OR EXISTS (
              SELECT 1 FROM tarea_etiquetas te JOIN etiquetas e ON e.id = te.etiqueta_id
               WHERE te.tarea_id = t.id AND e.nombre = v_etiqueta::citext)));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_personal_tarea_obtener(p_actor_id uuid, p_tarea_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_tarea_propia(p_actor_id, p_tarea_id);
  RETURN fn_tarea_personal_detalle(p_tarea_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Crea una tarea personal: nace «Por hacer» (`habilitada`), sin votación ni asignación (DEC-012). */
CREATE OR REPLACE FUNCTION proc_personal_tarea_crear(p_actor_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO tareas (dueno_id, responsable_id, creada_por, codigo, estado, titulo, descripcion, prioridad, vence_en)
  VALUES (p_actor_id, p_actor_id, p_actor_id, 0, 'habilitada', p_datos->>'titulo',
          coalesce(p_datos->>'descripcion', ''),
          coalesce(p_datos->>'prioridad', 'media')::prioridad_tarea,
          nullif(p_datos->>'vence_en', '')::timestamptz)
  RETURNING id INTO v_id;
  PERFORM fn_fijar_etiquetas_personales(p_actor_id, v_id,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'etiquetas', '[]'::jsonb))));
  PERFORM fn_actividad_personal(p_actor_id, 'creada', v_id, 'Creaste «' || (p_datos->>'titulo') || '»');
  RETURN fn_tarea_personal_detalle(v_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Actualiza una tarea personal. `p_datos` lleva `version` y solo los campos que cambian.
 * La persona mueve su tarea libremente entre sus estados; al completar se fijan el 100 %, la
 * fecha de cierre y el resultado (a tiempo o con retraso); al reabrir se limpian.
 */
CREATE OR REPLACE FUNCTION proc_personal_tarea_actualizar(p_actor_id uuid, p_tarea_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE
  t          tareas;
  v_estado   estado_tarea;
  v_vence    timestamptz;
  v_completa boolean;
  v_reabre   boolean;
  v_ahora    timestamptz := clock_timestamp();
BEGIN
  t := fn_tarea_propia(p_actor_id, p_tarea_id, true);
  PERFORM fn_exigir_version(t, (p_datos->>'version')::int);
  v_estado := coalesce((p_datos->>'estado')::estado_tarea, t.estado);
  v_vence := CASE WHEN p_datos ? 'vence_en' THEN (p_datos->>'vence_en')::timestamptz ELSE t.vence_en END;
  v_completa := v_estado = 'completada' AND t.estado <> 'completada';
  v_reabre := v_estado <> 'completada' AND t.estado = 'completada';

  IF v_estado = 'completada' AND p_datos ? 'progreso' AND (p_datos->>'progreso')::int <> 100 THEN
    RAISE EXCEPTION 'Una tarea completada tiene el 100 %% de avance.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_estado = 'atascada' AND t.estado <> 'atascada' AND nullif(p_datos->>'motivo', '') IS NULL THEN
    RAISE EXCEPTION 'Para marcar la tarea como atascada escribe el motivo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;

  UPDATE tareas SET
    actualizado_en = v_ahora,   -- siempre hay UPDATE: el disparador sube `version`
    titulo      = coalesce(p_datos->>'titulo', titulo),
    descripcion = coalesce(p_datos->>'descripcion', descripcion),
    prioridad   = coalesce((p_datos->>'prioridad')::prioridad_tarea, prioridad),
    vence_en    = v_vence,
    archivada   = coalesce((p_datos->>'archivada')::boolean, archivada),
    progreso    = CASE WHEN v_completa THEN 100 ELSE coalesce((p_datos->>'progreso')::smallint, progreso) END,
    estado      = v_estado,
    motivo      = CASE WHEN NOT (p_datos ? 'estado') THEN motivo
                       WHEN v_estado = 'atascada' THEN coalesce(p_datos->>'motivo', motivo)
                       ELSE NULL END,
    completada_en = CASE WHEN v_completa THEN v_ahora WHEN v_reabre THEN NULL ELSE completada_en END,
    resultado     = CASE WHEN v_completa
                           THEN (CASE WHEN v_vence IS NOT NULL AND v_ahora > v_vence THEN 'con_retraso' ELSE 'a_tiempo' END)::resultado_tarea
                         WHEN v_reabre THEN NULL ELSE resultado END
   WHERE id = t.id;

  IF p_datos ? 'etiquetas' THEN
    PERFORM fn_fijar_etiquetas_personales(p_actor_id, t.id,
      ARRAY(SELECT jsonb_array_elements_text(p_datos->'etiquetas')));
  END IF;
  IF v_completa THEN
    PERFORM fn_actividad_personal(p_actor_id, 'completada', t.id,
      'Completaste «' || coalesce(p_datos->>'titulo', t.titulo) || '»');
  END IF;
  RETURN fn_tarea_personal_detalle(t.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_personal_tarea_eliminar(p_actor_id uuid, p_tarea_id uuid) RETURNS jsonb AS $$
DECLARE v_titulo text;
BEGIN
  DELETE FROM tareas WHERE id = p_tarea_id AND dueno_id = p_actor_id RETURNING titulo INTO v_titulo;
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
  END IF;
  PERFORM fn_actividad_personal(p_actor_id, 'eliminada', NULL, 'Eliminaste «' || v_titulo || '»');
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- Subtareas, comentarios y etiquetas personales
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION proc_personal_subtarea_crear(p_actor_id uuid, p_tarea_id uuid, p_titulo text) RETURNS jsonb AS $$
DECLARE s subtareas;
BEGIN
  PERFORM fn_tarea_propia(p_actor_id, p_tarea_id);
  INSERT INTO subtareas (tarea_id, titulo) VALUES (p_tarea_id, p_titulo) RETURNING * INTO s;
  RETURN jsonb_build_object('id', s.id, 'titulo', s.titulo, 'hecha', s.hecha);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_personal_subtarea_actualizar(
  p_actor_id uuid, p_tarea_id uuid, p_subtarea_id uuid, p_cambios jsonb
) RETURNS jsonb AS $$
DECLARE s subtareas;
BEGIN
  PERFORM fn_tarea_propia(p_actor_id, p_tarea_id);
  UPDATE subtareas SET titulo = coalesce(p_cambios->>'titulo', titulo),
                       hecha  = coalesce((p_cambios->>'hecha')::boolean, hecha)
   WHERE id = p_subtarea_id AND tarea_id = p_tarea_id
  RETURNING * INTO s;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa subtarea.' USING ERRCODE = 'NX006', HINT = 'subtarea_no_encontrada';
  END IF;
  RETURN jsonb_build_object('id', s.id, 'titulo', s.titulo, 'hecha', s.hecha);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_personal_subtarea_eliminar(p_actor_id uuid, p_tarea_id uuid, p_subtarea_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_tarea_propia(p_actor_id, p_tarea_id);
  DELETE FROM subtareas WHERE id = p_subtarea_id AND tarea_id = p_tarea_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos esa subtarea.' USING ERRCODE = 'NX006', HINT = 'subtarea_no_encontrada';
  END IF;
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_personal_comentario_crear(p_actor_id uuid, p_tarea_id uuid, p_texto text) RETURNS jsonb AS $$
DECLARE c comentarios_tarea;
BEGIN
  PERFORM fn_tarea_propia(p_actor_id, p_tarea_id);
  INSERT INTO comentarios_tarea (tarea_id, autor_id, texto) VALUES (p_tarea_id, p_actor_id, p_texto) RETURNING * INTO c;
  RETURN fn_comentario_personal_json(c);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_personal_comentario_eliminar(p_actor_id uuid, p_tarea_id uuid, p_comentario_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_tarea_propia(p_actor_id, p_tarea_id);
  DELETE FROM comentarios_tarea WHERE id = p_comentario_id AND tarea_id = p_tarea_id AND autor_id = p_actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos ese comentario.' USING ERRCODE = 'NX006', HINT = 'comentario_no_encontrado';
  END IF;
  RETURN jsonb_build_object('eliminado', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Etiquetas personales del actor, en orden alfabético. */
CREATE OR REPLACE FUNCTION proc_personal_etiquetas(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(nombre ORDER BY nombre), '[]'::jsonb) FROM etiquetas WHERE usuario_id = p_actor_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Deja los permisos al día (rol nexo_app, migración 0008). En la primera aplicación la función
-- aún no existe; la 0008 la crea y la ejecuta.
DO $$ BEGIN
  IF to_regproc('fn_conceder_procesos') IS NOT NULL THEN PERFORM fn_conceder_procesos(); END IF;
END $$;

-- Down Migration
DROP FUNCTION IF EXISTS proc_personal_etiquetas(uuid);
DROP FUNCTION IF EXISTS proc_personal_comentario_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_personal_comentario_crear(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_personal_subtarea_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_personal_subtarea_actualizar(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_personal_subtarea_crear(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_personal_tarea_eliminar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_personal_tarea_actualizar(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_personal_tarea_crear(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_personal_tarea_obtener(uuid, uuid);
DROP FUNCTION IF EXISTS proc_personal_tarea_listar(uuid, jsonb);
DROP FUNCTION IF EXISTS fn_actividad_personal(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS fn_fijar_etiquetas_personales(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS fn_tarea_propia(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS fn_tarea_personal_detalle(uuid);
DROP FUNCTION IF EXISTS fn_comentario_personal_json(comentarios_tarea);
DROP FUNCTION IF EXISTS fn_tarea_personal_json(uuid);
