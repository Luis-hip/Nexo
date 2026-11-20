-- Fase 4.1 · Chat en tiempo real, parte 3: abrir el chat de una tarea (CH-03), mensajes directos
-- (CH-04, CH-07), búsqueda (CH-08) y convertir un mensaje en tarea (CH-09), DEC-CHAT-1.
-- Documentación: docs/08_Procesos_BD.md, sección «Fase 4 · Chat».

-- Up Migration

/**
 * CH-03: abre (y la primera vez crea) el chat de una tarea del equipo. Un invitado solo entra a
 * las tareas compartidas con él; lo demás es 404. Un equipo archivado no crea chats nuevos.
 */
CREATE OR REPLACE FUNCTION proc_chat_conversacion_tarea(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid) RETURNS jsonb AS $$
DECLARE
  v_mem  record;
  t      tareas;
  v_conv uuid;
BEGIN
  SELECT * INTO v_mem FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  SELECT * INTO t FROM tareas WHERE id = p_tarea_id AND equipo_id = p_equipo_id;
  IF t.id IS NULL
     OR (v_mem.rol = 'invitado' AND NOT EXISTS (SELECT 1 FROM tarea_compartida tc
                                                 WHERE tc.tarea_id = t.id AND tc.membresia_id = v_mem.membresia_id)) THEN
    RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
  END IF;
  SELECT id INTO v_conv FROM conversaciones WHERE tarea_id = t.id AND tipo = 'tarea';
  IF v_conv IS NULL THEN
    PERFORM fn_exigir_equipo_activo(p_equipo_id);
    INSERT INTO conversaciones (equipo_id, tipo, nombre, tarea_id)
    VALUES (p_equipo_id, 'tarea', fn_codigo_tarea(t.codigo) || ' · ' || t.titulo, t.id)
    ON CONFLICT (tarea_id) WHERE tipo = 'tarea' DO NOTHING;
    SELECT id INTO v_conv FROM conversaciones WHERE tarea_id = t.id AND tipo = 'tarea';
  END IF;
  RETURN fn_chat_conversacion_json(v_conv, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * CH-04 y CH-07: abre (y la primera vez crea) el mensaje directo con otra persona del equipo.
 * Solo entre líder e integrantes: un invitado no escribe a nadie y a un invitado no se le escribe.
 * Hay una sola conversación por pareja (el par se guarda en orden).
 */
CREATE OR REPLACE FUNCTION proc_chat_dm_abrir(p_actor_id uuid, p_equipo_id uuid, p_otro_id uuid) RETURNS jsonb AS $$
DECLARE v_conv uuid; v_a uuid := least(p_actor_id, p_otro_id); v_b uuid := greatest(p_actor_id, p_otro_id);
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no pueden enviar mensajes directos.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF p_otro_id = p_actor_id OR NOT EXISTS (
       SELECT 1 FROM membresias m WHERE m.equipo_id = p_equipo_id AND m.usuario_id = p_otro_id
          AND m.estado = 'activa' AND m.rol <> 'invitado') THEN
    RAISE EXCEPTION 'Elige a otra persona del equipo (líder o integrante).' USING ERRCODE = 'NX010', HINT = 'destinatario_invalido';
  END IF;
  SELECT id INTO v_conv FROM conversaciones
   WHERE equipo_id = p_equipo_id AND tipo = 'dm' AND dm_usuario_a = v_a AND dm_usuario_b = v_b;
  IF v_conv IS NULL THEN
    PERFORM fn_exigir_equipo_activo(p_equipo_id);
    INSERT INTO conversaciones (equipo_id, tipo, dm_usuario_a, dm_usuario_b)
    VALUES (p_equipo_id, 'dm', v_a, v_b)
    ON CONFLICT (equipo_id, dm_usuario_a, dm_usuario_b) WHERE tipo = 'dm' DO NOTHING;
    SELECT id INTO v_conv FROM conversaciones
     WHERE equipo_id = p_equipo_id AND tipo = 'dm' AND dm_usuario_a = v_a AND dm_usuario_b = v_b;
  END IF;
  RETURN fn_chat_conversacion_json(v_conv, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * CH-08: busca texto en español en las conversaciones del equipo que la persona puede ver
 * (o solo en una). Usa el índice `ix_mensajes_busqueda`; los mensajes eliminados y los de
 * sistema no aparecen. El fragmento marca lo encontrado con «…».
 */
CREATE OR REPLACE FUNCTION proc_chat_buscar(
  p_actor_id uuid, p_equipo_id uuid, p_texto text, p_conversacion_id uuid DEFAULT NULL, p_limite int DEFAULT 30
) RETURNS jsonb AS $$
DECLARE v_q tsquery; v_lim int := least(greatest(coalesce(p_limite, 30), 1), 50);
BEGIN
  PERFORM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF char_length(btrim(coalesce(p_texto, ''))) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Escribe entre 2 y 100 caracteres para buscar.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  v_q := websearch_to_tsquery('spanish', p_texto);
  IF v_q::text = '' THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(r.j ORDER BY r.rango DESC, r.seq DESC)
      FROM (SELECT m.seq, ts_rank(to_tsvector('spanish', m.texto), v_q) AS rango,
                   jsonb_build_object(
                     'mensaje_id', m.id, 'seq', m.seq, 'conversacion_id', c.id, 'tipo', c.tipo,
                     'conversacion', fn_chat_conversacion_json(c.id, p_actor_id)->>'nombre',
                     'autor', CASE WHEN m.autor_id IS NULL THEN NULL ELSE fn_persona_json(c.equipo_id, m.autor_id) END,
                     'fragmento', ts_headline('spanish', m.texto, v_q,
                                   'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=8'),
                     'creado_en', fn_iso(m.creado_en)) AS j
              FROM conversaciones c JOIN mensajes m ON m.conversacion_id = c.id
             WHERE c.equipo_id = p_equipo_id AND (p_conversacion_id IS NULL OR c.id = p_conversacion_id)
               AND fn_chat_puede(p_actor_id, c)
               AND m.eliminado_en IS NULL AND NOT m.es_sistema
               AND to_tsvector('spanish', m.texto) @@ v_q
             ORDER BY ts_rank(to_tsvector('spanish', m.texto), v_q) DESC, m.seq DESC
             LIMIT v_lim) r), '[]'::jsonb);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * CH-09: el líder convierte un mensaje en una propuesta de tarea (entra a votación, DEC-024).
 * `p_datos` (opcional): `titulo` (si falta, la primera línea del mensaje, hasta 140), `descripcion`,
 * `prioridad`, `responsable_id`. La tarea guarda su `mensaje_origen_id`, el mensaje queda ligado a
 * ella y la conversación recibe un aviso de sistema. Un mensaje se convierte una sola vez; los
 * mensajes directos son privados y no se convierten.
 */
CREATE OR REPLACE FUNCTION proc_chat_mensaje_a_tarea(p_actor_id uuid, p_mensaje_id uuid, p_datos jsonb DEFAULT '{}'::jsonb) RETURNS jsonb AS $$
DECLARE
  m        mensajes;
  c        conversaciones;
  t        tareas;
  v_titulo text;
  v_sis    uuid;
BEGIN
  SELECT * INTO m FROM mensajes WHERE id = p_mensaje_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  c := fn_chat_exigir(p_actor_id, m.conversacion_id);
  PERFORM fn_exigir_lider(p_actor_id, c.equipo_id, 'Solo el líder convierte mensajes en tareas. Comparte la idea en el chat para que la proponga.');
  PERFORM fn_exigir_equipo_activo(c.equipo_id);
  IF c.tipo = 'dm' THEN
    RAISE EXCEPTION 'Los mensajes directos son privados: no se convierten en tareas.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF m.eliminado_en IS NOT NULL OR m.es_sistema OR btrim(m.texto) = '' THEN
    RAISE EXCEPTION 'Ese mensaje no se puede convertir en tarea.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  IF m.tarea_vinculada_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ese mensaje ya se convirtió en la tarea %.', fn_codigo_tarea((SELECT codigo FROM tareas WHERE id = m.tarea_vinculada_id))
      USING ERRCODE = 'NX012', HINT = 'ya_convertido';
  END IF;

  v_titulo := left(coalesce(nullif(btrim(p_datos->>'titulo'), ''), btrim(split_part(btrim(m.texto), E'\n', 1))), 140);
  t := fn_tarea_insertar_propuesta(p_actor_id, c.equipo_id,
         jsonb_build_object('titulo', v_titulo,
                            'descripcion', coalesce(p_datos->>'descripcion', CASE WHEN btrim(m.texto) <> v_titulo THEN m.texto ELSE '' END),
                            'prioridad', coalesce(p_datos->>'prioridad', 'media'),
                            'responsable_id', p_datos->>'responsable_id'));
  UPDATE tareas SET mensaje_origen_id = m.id WHERE id = t.id;
  UPDATE mensajes SET tarea_vinculada_id = t.id WHERE id = m.id;

  PERFORM fn_registrar_evento(c.equipo_id, p_actor_id,
    CASE WHEN t.estado = 'propuesta' THEN 'tarea.propuesta' ELSE 'tarea.creada' END,
    'tarea', t.id,
    jsonb_build_object('estado', t.estado, 'responsable_id', t.responsable_id, 'sprint_id', t.sprint_id, 'mensaje_id', m.id),
    fn_primer_nombre(p_actor_id) || CASE WHEN t.estado = 'propuesta' THEN ' propuso ' ELSE ' creó ' END
      || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» desde el chat'
      || CASE WHEN t.estado = 'propuesta' THEN ' (en votación)' ELSE ' (aceptada: el equipo no tiene integrantes)' END);

  INSERT INTO mensajes (conversacion_id, es_sistema, texto)
  VALUES (c.id, true, fn_primer_nombre(p_actor_id) || ' convirtió un mensaje en la tarea ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '».')
  RETURNING id INTO v_sis;
  RETURN jsonb_build_object(
    'tarea', jsonb_build_object('id', t.id, 'codigo', t.codigo, 'estado', t.estado),
    'mensaje', fn_chat_mensaje_json(m.id, p_actor_id),
    'sistema', fn_chat_mensaje_json(v_sis, p_actor_id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_chat_mensaje_a_tarea(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_chat_buscar(uuid, uuid, text, uuid, int);
DROP FUNCTION IF EXISTS proc_chat_dm_abrir(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_chat_conversacion_tarea(uuid, uuid, uuid);
