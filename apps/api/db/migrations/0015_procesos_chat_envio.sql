-- Fase 4.1 · Chat en tiempo real, parte 2: escribir (CH-02), reaccionar, fijar y eliminar (CH-06),
-- menciones, lecturas y preferencias por conversación, DEC-CHAT-1.
-- Los mensajes no generan eventos de dominio (no entran a la actividad ni a WhatsApp): solo las
-- menciones crean una notificación para la persona mencionada. Documentación: docs/08.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Procesos (proc_*)
-- ---------------------------------------------------------------------------------------------

/**
 * CH-02: escribe un mensaje (o una respuesta de hilo) en una conversación visible.
 * `p_datos`: `texto` (1 a 4000), `hilo_de_id` (opcional; si apunta a una respuesta, se usa su raíz),
 * `id_cliente` (opcional; reenviar el mismo devuelve el mensaje ya guardado) y `menciones[]`
 * (solo cuentan las personas con acceso a la conversación, y no uno mismo; cada una recibe una
 * notificación si su preferencia «mencion» no la apaga).
 */
CREATE OR REPLACE FUNCTION proc_chat_enviar(p_actor_id uuid, p_conversacion_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE
  c          conversaciones := fn_chat_exigir(p_actor_id, p_conversacion_id);
  v_texto    text := btrim(coalesce(p_datos->>'texto', ''));
  v_cliente  uuid;
  v_hilo     uuid;
  v_id       uuid;
  v_seq      bigint;
  v_destino  uuid;
  v_enlace   text;
BEGIN
  PERFORM fn_exigir_equipo_activo(c.equipo_id);
  IF char_length(v_texto) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'El mensaje debe tener entre 1 y 4000 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    v_cliente := nullif(p_datos->>'id_cliente', '')::uuid;
    v_hilo    := nullif(p_datos->>'hilo_de_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Algún identificador no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;

  -- Reenvío de un mensaje que ya se guardó (conexión inestable): se devuelve el mismo.
  IF v_cliente IS NOT NULL THEN
    SELECT m.id INTO v_id FROM mensajes m
     WHERE m.conversacion_id = c.id AND m.id_cliente = v_cliente AND m.autor_id = p_actor_id;
    IF v_id IS NOT NULL THEN RETURN fn_chat_mensaje_json(v_id, p_actor_id); END IF;
  END IF;

  IF v_hilo IS NOT NULL THEN
    SELECT coalesce(r.hilo_de_id, r.id) INTO v_hilo FROM mensajes r
     WHERE r.id = v_hilo AND r.conversacion_id = c.id AND r.eliminado_en IS NULL AND NOT r.es_sistema;
    IF v_hilo IS NULL THEN
      RAISE EXCEPTION 'No se puede responder a ese mensaje.' USING ERRCODE = 'NX010', HINT = 'hilo_invalido';
    END IF;
  END IF;

  BEGIN
    INSERT INTO mensajes (conversacion_id, autor_id, texto, hilo_de_id, id_cliente)
    VALUES (c.id, p_actor_id, v_texto, v_hilo, v_cliente)
    RETURNING id, seq INTO v_id, v_seq;
  EXCEPTION WHEN unique_violation THEN
    -- Dos envíos simultáneos con el mismo id_cliente: gana el primero.
    SELECT m.id INTO v_id FROM mensajes m
     WHERE m.conversacion_id = c.id AND m.id_cliente = v_cliente AND m.autor_id = p_actor_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Ese identificador de mensaje ya se usó.' USING ERRCODE = 'NX012', HINT = 'conflicto';
    END IF;
    RETURN fn_chat_mensaje_json(v_id, p_actor_id);
  END;

  -- Quien escribe ya leyó hasta su propio mensaje.
  INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, ultimo_leido_seq)
  VALUES (c.id, p_actor_id, v_seq)
  ON CONFLICT (conversacion_id, usuario_id) DO UPDATE
    SET ultimo_leido_seq = greatest(conversacion_lecturas.ultimo_leido_seq, EXCLUDED.ultimo_leido_seq);

  v_enlace := '/app/e/' || c.equipo_id || '/chat/' || c.id;
  FOR v_destino IN
    SELECT DISTINCT u::uuid FROM jsonb_array_elements_text(coalesce(p_datos->'menciones', '[]'::jsonb)) u
  LOOP
    CONTINUE WHEN v_destino = p_actor_id;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM membresias mb WHERE mb.equipo_id = c.equipo_id AND mb.usuario_id = v_destino
                                AND mb.estado = 'activa' AND fn_chat_puede(v_destino, c));
    INSERT INTO mensaje_menciones (mensaje_id, usuario_id) VALUES (v_id, v_destino) ON CONFLICT DO NOTHING;
    IF coalesce((SELECT n.por_app FROM preferencias_notificacion n WHERE n.usuario_id = v_destino AND n.evento = 'mencion'), true) THEN
      PERFORM fn_notificar(v_destino, c.equipo_id, fn_primer_nombre(p_actor_id) || ' te mencionó',
        left(v_texto, 140), v_enlace, 'abrir_chat', c.id::text, 'menciones');
    END IF;
  END LOOP;
  RETURN fn_chat_mensaje_json(v_id, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Elimina un mensaje (borrado lógico: el texto deja de mostrarse y se desfija). Cada quien borra
 * los suyos; el líder también los ajenos de los canales y chats de tarea (moderación), pero no
 * los mensajes directos, que no ve. Los de sistema solo los borra el líder.
 */
CREATE OR REPLACE FUNCTION proc_chat_eliminar(p_actor_id uuid, p_mensaje_id uuid) RETURNS jsonb AS $$
DECLARE
  m   mensajes;
  c   conversaciones;
  v_rol rol_membresia;
BEGIN
  SELECT * INTO m FROM mensajes WHERE id = p_mensaje_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  c := fn_chat_exigir(p_actor_id, m.conversacion_id);
  PERFORM fn_exigir_equipo_activo(c.equipo_id);
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, c.equipo_id);
  IF m.eliminado_en IS NOT NULL THEN RETURN fn_chat_mensaje_json(m.id, p_actor_id); END IF;
  IF NOT (m.autor_id = p_actor_id AND NOT m.es_sistema) AND v_rol <> 'lider' THEN
    RAISE EXCEPTION 'Solo el líder puede eliminar mensajes de otras personas.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  UPDATE mensajes SET eliminado_en = now(), eliminado_por = p_actor_id, fijado = false WHERE id = m.id;
  RETURN fn_chat_mensaje_json(m.id, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** CH-06: el líder fija o desfija un mensaje de un canal o de un chat de tarea. */
CREATE OR REPLACE FUNCTION proc_chat_fijar(p_actor_id uuid, p_mensaje_id uuid, p_fijado boolean) RETURNS jsonb AS $$
DECLARE m mensajes; c conversaciones;
BEGIN
  SELECT * INTO m FROM mensajes WHERE id = p_mensaje_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  c := fn_chat_exigir(p_actor_id, m.conversacion_id);
  PERFORM fn_exigir_equipo_activo(c.equipo_id);
  PERFORM fn_exigir_lider(p_actor_id, c.equipo_id, 'Solo el líder puede fijar o eliminar mensajes de otras personas.');
  IF c.tipo = 'dm' THEN
    RAISE EXCEPTION 'En los mensajes directos no se fijan mensajes.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  IF m.eliminado_en IS NOT NULL OR m.hilo_de_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ese mensaje no se puede fijar.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  UPDATE mensajes SET fijado = coalesce(p_fijado, true) WHERE id = m.id;
  RETURN fn_chat_mensaje_json(m.id, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Reacciona con uno de los 6 tipos; repetir el mismo tipo lo quita. Devuelve las reacciones del mensaje. */
CREATE OR REPLACE FUNCTION proc_chat_reaccionar(p_actor_id uuid, p_mensaje_id uuid, p_tipo text) RETURNS jsonb AS $$
DECLARE m mensajes; c conversaciones; v_tipo tipo_reaccion;
BEGIN
  SELECT * INTO m FROM mensajes WHERE id = p_mensaje_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  c := fn_chat_exigir(p_actor_id, m.conversacion_id);
  PERFORM fn_exigir_equipo_activo(c.equipo_id);
  BEGIN
    v_tipo := p_tipo::tipo_reaccion;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Esa reacción no existe.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  IF m.eliminado_en IS NOT NULL OR m.es_sistema THEN
    RAISE EXCEPTION 'No se puede reaccionar a ese mensaje.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  DELETE FROM mensaje_reacciones WHERE mensaje_id = m.id AND usuario_id = p_actor_id AND tipo = v_tipo;
  IF NOT FOUND THEN
    INSERT INTO mensaje_reacciones (mensaje_id, usuario_id, tipo) VALUES (m.id, p_actor_id, v_tipo);
  END IF;
  RETURN jsonb_build_object('mensaje_id', m.id, 'conversacion_id', c.id, 'reacciones', fn_chat_reacciones_json(m.id, p_actor_id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Avanza el puntero de lectura hasta `p_hasta_seq` (nunca hacia atrás ni más allá del último mensaje). */
CREATE OR REPLACE FUNCTION proc_chat_leer(p_actor_id uuid, p_conversacion_id uuid, p_hasta_seq bigint) RETURNS jsonb AS $$
DECLARE c conversaciones := fn_chat_exigir(p_actor_id, p_conversacion_id); v_tope bigint;
BEGIN
  SELECT coalesce(max(seq), 0) INTO v_tope FROM mensajes WHERE conversacion_id = c.id;
  INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, ultimo_leido_seq)
  VALUES (c.id, p_actor_id, least(greatest(coalesce(p_hasta_seq, 0), 0), v_tope))
  ON CONFLICT (conversacion_id, usuario_id) DO UPDATE
    SET ultimo_leido_seq = greatest(conversacion_lecturas.ultimo_leido_seq, EXCLUDED.ultimo_leido_seq);
  RETURN jsonb_build_object(
    'conversacion_id', c.id,
    'ultimo_leido_seq', (SELECT ultimo_leido_seq FROM conversacion_lecturas WHERE conversacion_id = c.id AND usuario_id = p_actor_id),
    'no_leidos', (fn_chat_conversacion_json(c.id, p_actor_id)->>'no_leidos')::int);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Fija o silencia la conversación solo para quien lo pide (`fijada`, `silenciada`). */
CREATE OR REPLACE FUNCTION proc_chat_preferencias(p_actor_id uuid, p_conversacion_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
DECLARE c conversaciones := fn_chat_exigir(p_actor_id, p_conversacion_id);
BEGIN
  INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, fijada, silenciada)
  VALUES (c.id, p_actor_id, coalesce((p_cambios->>'fijada')::boolean, false), coalesce((p_cambios->>'silenciada')::boolean, false))
  ON CONFLICT (conversacion_id, usuario_id) DO UPDATE SET
    fijada     = coalesce((p_cambios->>'fijada')::boolean, conversacion_lecturas.fijada),
    silenciada = coalesce((p_cambios->>'silenciada')::boolean, conversacion_lecturas.silenciada);
  RETURN fn_chat_conversacion_json(c.id, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_chat_preferencias(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_chat_leer(uuid, uuid, bigint);
DROP FUNCTION IF EXISTS proc_chat_reaccionar(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_chat_fijar(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_chat_eliminar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_chat_enviar(uuid, uuid, jsonb);
