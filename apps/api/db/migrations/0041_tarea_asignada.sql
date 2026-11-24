-- Tareas asignadas del líder (DEC-040, resuelve V-10 de DEC-024; pruebas de usabilidad del 2026-11-23).
-- El líder tiene dos formas de crear una tarea con sus subtareas:
--   · **Asignada** (la principal): nace `aceptada`, con `origen = 'directa'`, con responsable y, si hay
--     sprint activo, dentro de él, como si se hubiera planeado al inicio. No pasa por votación.
--   · **Propuesta** (la secundaria): `proc_tarea_proponer`, entra en votación de los integrantes.
-- El responsable acepta o rechaza la asignación igual que siempre (V-11). Pruebas: P260–P263.

-- Up Migration

/**
 * El líder crea una tarea ya asignada, con sus subtareas y etiquetas, sin votación.
 * Exige responsable (líder o integrante activo). Si es otra persona, queda pendiente de que acepte.
 */
CREATE OR REPLACE FUNCTION proc_tarea_asignar_nueva(p_actor_id uuid, p_equipo_id uuid, p_datos jsonb)
RETURNS jsonb AS $$
DECLARE
  v_responsable uuid := nullif(p_datos->>'responsable_id', '')::uuid;
  v_nombre      text;
  v_sprint      uuid;
  v_orden_sub   text := NULL;
  v_sub         text;
  v_tarea       text;
  t             tareas;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id,
    'Solo el líder asigna tareas. Comparte tus ideas en el chat o en los comentarios.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  IF v_responsable IS NULL THEN
    RAISE EXCEPTION 'Elige a la persona responsable de la tarea.' USING ERRCODE = 'NX010', HINT = 'responsable_requerido';
  END IF;
  v_nombre := fn_exigir_responsable(p_equipo_id, v_responsable);
  SELECT id INTO v_sprint FROM sprints WHERE equipo_id = p_equipo_id AND estado = 'activo';

  INSERT INTO tareas (equipo_id, codigo, titulo, descripcion, prioridad, vence_en, estado, origen,
                      proponente_id, responsable_id, asignacion_pendiente, sprint_id, orden, creada_por)
  VALUES (p_equipo_id, 0, p_datos->>'titulo', coalesce(p_datos->>'descripcion', ''),
          coalesce(p_datos->>'prioridad', 'media')::prioridad_tarea,
          nullif(p_datos->>'vence_en', '')::timestamptz, 'aceptada', 'directa',
          NULL, v_responsable, v_responsable <> p_actor_id,
          v_sprint, fn_orden_al_final(p_equipo_id, 'aceptada'), p_actor_id)
  RETURNING * INTO t;

  FOR v_sub IN SELECT jsonb_array_elements_text(coalesce(p_datos->'subtareas', '[]'::jsonb)) LOOP
    v_orden_sub := fn_orden_entre(v_orden_sub, NULL);
    INSERT INTO subtareas (tarea_id, titulo, orden) VALUES (t.id, v_sub, v_orden_sub);
  END LOOP;
  PERFORM fn_fijar_etiquetas(p_equipo_id, t.id,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'etiquetas', '[]'::jsonb))));

  v_tarea := fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»';
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.creada', 'tarea', t.id,
    jsonb_build_object('estado', t.estado, 'origen', 'directa', 'responsable_id', v_responsable,
                       'sprint_id', v_sprint,
                       'subtareas', jsonb_array_length(coalesce(p_datos->'subtareas', '[]'::jsonb))),
    fn_primer_nombre(p_actor_id) || ' creó ' || v_tarea
      || CASE WHEN v_sprint IS NOT NULL THEN ' en el sprint activo' ELSE '' END);
  -- Igual que «Asignar»: avisa al responsable para que acepte o rechace (V-11).
  IF v_responsable <> p_actor_id THEN
    PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.asignada', 'tarea', t.id,
      jsonb_build_object('responsable_id', v_responsable, 'anterior_id', NULL),
      fn_primer_nombre(p_actor_id) || ' asignó ' || v_tarea || ' a ' || split_part(v_nombre, ' ', 1));
  END IF;
  RETURN jsonb_build_object('id', t.id, 'codigo', t.codigo, 'estado', t.estado);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration

DROP FUNCTION IF EXISTS proc_tarea_asignar_nueva(uuid, uuid, jsonb);
