-- Fase 4.1 · Chat en tiempo real, parte 1: lectura (CH-01, CH-02, CH-03, CH-05, CH-06, CH-10), DEC-CHAT-1.
-- Las tablas del chat ya existen en 0001 (`conversaciones`, `mensajes`, `mensaje_reacciones`,
-- `mensaje_menciones`, `conversacion_lecturas`). Aquí: quién puede ver cada conversación (una sola
-- regla, `fn_chat_puede`) y los procesos que listan conversaciones, mensajes, hilos y fijados.
-- Documentación: docs/08_Procesos_BD.md, sección «Fase 4 · Chat».

-- Up Migration

CREATE INDEX IF NOT EXISTS ix_menciones_usuario ON mensaje_menciones(usuario_id);

-- ---------------------------------------------------------------------------------------------
-- 1. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/**
 * ¿Puede esta persona ver y escribir en la conversación? Es la única regla de acceso al chat:
 *  - `equipo`: líder e integrantes (nunca invitados).
 *  - `invitados`: todos los miembros activos, invitados incluidos.
 *  - `tarea`: líder e integrantes; un invitado solo si la tarea está compartida con su membresía.
 *  - `dm`: solo las dos personas, y las dos deben seguir siendo integrantes activos.
 * Un invitado con el acceso caducado no ve nada.
 */
CREATE OR REPLACE FUNCTION fn_chat_puede(p_usuario uuid, c conversaciones) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM membresias m
     WHERE m.equipo_id = c.equipo_id AND m.usuario_id = p_usuario AND m.estado = 'activa'
       AND (m.rol <> 'invitado' OR m.caduca_en IS NULL OR m.caduca_en >= now())
       AND CASE c.tipo
             WHEN 'equipo'    THEN m.rol <> 'invitado'
             WHEN 'invitados' THEN true
             WHEN 'tarea'     THEN m.rol <> 'invitado' OR EXISTS (
                                     SELECT 1 FROM tarea_compartida tc
                                      WHERE tc.tarea_id = c.tarea_id AND tc.membresia_id = m.id)
             WHEN 'dm'        THEN m.rol <> 'invitado' AND p_usuario IN (c.dm_usuario_a, c.dm_usuario_b)
                                   AND EXISTS (SELECT 1 FROM membresias o
                                                WHERE o.equipo_id = c.equipo_id AND o.estado = 'activa' AND o.rol <> 'invitado'
                                                  AND o.usuario_id = CASE WHEN p_usuario = c.dm_usuario_a
                                                                          THEN c.dm_usuario_b ELSE c.dm_usuario_a END)
             ELSE false
           END);
$$ LANGUAGE sql STABLE;

/**
 * Devuelve la conversación si la persona puede verla. Quien no pertenece al equipo o no tiene
 * acceso recibe NX006 (404), como si no existiera (DEC-018); un invitado con el acceso caducado,
 * NX005 `acceso_caducado`.
 */
CREATE OR REPLACE FUNCTION fn_chat_exigir(p_actor uuid, p_conv uuid) RETURNS conversaciones AS $$
DECLARE c conversaciones;
BEGIN
  SELECT * INTO c FROM conversaciones WHERE id = p_conv;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa conversación.' USING ERRCODE = 'NX006', HINT = 'conversacion_no_encontrada';
  END IF;
  PERFORM fn_membresia_actor(p_actor, c.equipo_id);
  IF NOT fn_chat_puede(p_actor, c) THEN
    RAISE EXCEPTION 'No encontramos esa conversación.' USING ERRCODE = 'NX006', HINT = 'conversacion_no_encontrada';
  END IF;
  RETURN c;
END $$ LANGUAGE plpgsql STABLE;

/** Reacciones de un mensaje agrupadas por tipo, con el total y si la persona reaccionó. */
CREATE OR REPLACE FUNCTION fn_chat_reacciones_json(p_mensaje uuid, p_actor uuid) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', x.tipo, 'total', x.total, 'yo', x.yo) ORDER BY x.primera), '[]'::jsonb)
    FROM (SELECT r.tipo, count(*)::int AS total, bool_or(r.usuario_id = p_actor) AS yo, min(r.creada_en) AS primera
            FROM mensaje_reacciones r WHERE r.mensaje_id = p_mensaje GROUP BY r.tipo) x;
$$ LANGUAGE sql STABLE;

/**
 * Mensaje con la forma que devuelve la API (`MensajeChat` de packages/shared). El texto de un
 * mensaje eliminado nunca sale; «leído por» cuenta a quienes avanzaron su puntero hasta él.
 */
CREATE OR REPLACE FUNCTION fn_chat_mensaje_json(p_mensaje uuid, p_actor uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'seq', m.seq, 'conversacion_id', m.conversacion_id,
    'autor', CASE WHEN m.autor_id IS NULL THEN NULL ELSE fn_persona_json(c.equipo_id, m.autor_id) END,
    'es_sistema', m.es_sistema,
    'texto', CASE WHEN m.eliminado_en IS NULL THEN m.texto ELSE '' END,
    'eliminado', m.eliminado_en IS NOT NULL,
    'hilo_de_id', m.hilo_de_id,
    'respuestas', (SELECT count(*)::int FROM mensajes r WHERE r.hilo_de_id = m.id AND r.eliminado_en IS NULL),
    'fijado', m.fijado,
    'tarea', (SELECT jsonb_build_object('id', t.id, 'codigo', t.codigo, 'titulo', t.titulo)
                FROM tareas t WHERE t.id = m.tarea_vinculada_id),
    'reacciones', CASE WHEN m.eliminado_en IS NULL THEN fn_chat_reacciones_json(m.id, p_actor) ELSE '[]'::jsonb END,
    'menciones', (SELECT coalesce(jsonb_agg(mm.usuario_id), '[]'::jsonb) FROM mensaje_menciones mm WHERE mm.mensaje_id = m.id),
    'leido_por', (SELECT count(*)::int FROM conversacion_lecturas l
                   WHERE l.conversacion_id = m.conversacion_id AND l.ultimo_leido_seq >= m.seq
                     AND l.usuario_id IS DISTINCT FROM m.autor_id),
    'creado_en', fn_iso(m.creado_en), 'editado_en', fn_iso(m.editado_en))
    FROM mensajes m JOIN conversaciones c ON c.id = m.conversacion_id
   WHERE m.id = p_mensaje;
$$ LANGUAGE sql STABLE;

/**
 * Conversación con la forma que devuelve la API (`ConversacionChat`): nombre según el tipo, la
 * otra persona de un mensaje directo, el último mensaje y los no leídos de `p_actor`. Sin puntero
 * de lectura solo cuentan los mensajes posteriores a que la persona entrara al equipo.
 */
CREATE OR REPLACE FUNCTION fn_chat_conversacion_json(p_conv uuid, p_actor uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'equipo_id', c.equipo_id, 'tipo', c.tipo,
    'nombre', CASE c.tipo
                WHEN 'equipo' THEN c.nombre
                WHEN 'invitados' THEN 'Invitados'
                WHEN 'tarea' THEN fn_codigo_tarea(t.codigo) || ' · ' || t.titulo
                ELSE (SELECT u.nombre FROM usuarios u
                       WHERE u.id = CASE WHEN p_actor = c.dm_usuario_a THEN c.dm_usuario_b ELSE c.dm_usuario_a END)
              END,
    'tarea', CASE WHEN t.id IS NULL THEN NULL
                  ELSE jsonb_build_object('id', t.id, 'codigo', t.codigo, 'titulo', t.titulo) END,
    'con', CASE WHEN c.tipo = 'dm'
                THEN fn_persona_json(c.equipo_id, CASE WHEN p_actor = c.dm_usuario_a THEN c.dm_usuario_b ELSE c.dm_usuario_a END) END,
    'ultimo', (SELECT jsonb_build_object('texto', u.texto, 'autor_nombre', fn_primer_nombre(u.autor_id),
                                         'es_sistema', u.es_sistema, 'creado_en', fn_iso(u.creado_en))
                 FROM mensajes u WHERE u.conversacion_id = c.id AND u.eliminado_en IS NULL
                ORDER BY u.seq DESC LIMIT 1),
    'no_leidos', nl.total, 'menciones_sin_leer', nl.menciones,
    'fijada', coalesce(l.fijada, false), 'silenciada', coalesce(l.silenciada, false))
    FROM conversaciones c
    LEFT JOIN tareas t ON t.id = c.tarea_id
    LEFT JOIN conversacion_lecturas l ON l.conversacion_id = c.id AND l.usuario_id = p_actor
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM mensaje_menciones mm
                                             WHERE mm.mensaje_id = m.id AND mm.usuario_id = p_actor))::int AS menciones
        FROM mensajes m
       WHERE m.conversacion_id = c.id AND m.seq > coalesce(l.ultimo_leido_seq, 0)
         AND m.autor_id IS DISTINCT FROM p_actor AND m.eliminado_en IS NULL AND NOT m.es_sistema
         AND m.creado_en >= coalesce((SELECT b.desde FROM membresias b
                                       WHERE b.equipo_id = c.equipo_id AND b.usuario_id = p_actor AND b.estado = 'activa'),
                                     'epoch'::timestamptz)
    ) nl
   WHERE c.id = p_conv;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 2. Procesos (proc_*)
-- ---------------------------------------------------------------------------------------------

/**
 * CH-01: conversaciones del equipo que la persona puede ver (canales, mensajes directos y chats
 * de tarea con mensajes), con no leídos y último mensaje; las más recientes primero.
 */
CREATE OR REPLACE FUNCTION proc_chat_conversaciones(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_membresia_actor(p_actor_id, p_equipo_id);
  RETURN coalesce((
    SELECT jsonb_agg(x.j ORDER BY (x.j->>'fijada') DESC, x.actividad DESC NULLS LAST, x.j->>'nombre')
      FROM (SELECT fn_chat_conversacion_json(c.id, p_actor_id) AS j,
                   (SELECT max(m.creado_en) FROM mensajes m WHERE m.conversacion_id = c.id) AS actividad
              FROM conversaciones c
             WHERE c.equipo_id = p_equipo_id AND fn_chat_puede(p_actor_id, c)
               AND (c.tipo <> 'tarea' OR EXISTS (SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id AND NOT m.es_sistema))
           ) x), '[]'::jsonb);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * CH-02, CH-03, CH-04, CH-10: una página de mensajes de la conversación (sin las respuestas de
 * hilo), del más antiguo al más nuevo. `p_antes` es el `seq` del mensaje más antiguo ya cargado.
 */
CREATE OR REPLACE FUNCTION proc_chat_mensajes(
  p_actor_id uuid, p_conversacion_id uuid, p_antes bigint DEFAULT NULL, p_limite int DEFAULT 40
) RETURNS jsonb AS $$
DECLARE
  c      conversaciones := fn_chat_exigir(p_actor_id, p_conversacion_id);
  v_lim  int := least(greatest(coalesce(p_limite, 40), 1), 100);
  v_ids  uuid[];
  v_mas  boolean;
BEGIN
  SELECT array_agg(s.id ORDER BY s.seq DESC) INTO v_ids
    FROM (SELECT m.id, m.seq FROM mensajes m
           WHERE m.conversacion_id = c.id AND m.hilo_de_id IS NULL AND (p_antes IS NULL OR m.seq < p_antes)
           ORDER BY m.seq DESC LIMIT v_lim + 1) s;
  v_mas := coalesce(cardinality(v_ids), 0) > v_lim;
  IF v_mas THEN v_ids := v_ids[1:v_lim]; END IF;
  RETURN jsonb_build_object(
    'conversacion', fn_chat_conversacion_json(c.id, p_actor_id),
    'items', coalesce((SELECT jsonb_agg(fn_chat_mensaje_json(m.id, p_actor_id) ORDER BY m.seq)
                         FROM mensajes m WHERE m.id = ANY (coalesce(v_ids, ARRAY[]::uuid[]))), '[]'::jsonb),
    'hay_mas', v_mas);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** CH-05: un hilo (el mensaje raíz y sus respuestas, de la más antigua a la más nueva). */
CREATE OR REPLACE FUNCTION proc_chat_hilo(p_actor_id uuid, p_mensaje_id uuid) RETURNS jsonb AS $$
DECLARE v_raiz uuid; v_conv uuid;
BEGIN
  SELECT coalesce(m.hilo_de_id, m.id), m.conversacion_id INTO v_raiz, v_conv FROM mensajes m WHERE m.id = p_mensaje_id;
  IF v_raiz IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  PERFORM fn_chat_exigir(p_actor_id, v_conv);
  RETURN jsonb_build_object(
    'raiz', fn_chat_mensaje_json(v_raiz, p_actor_id),
    'respuestas', coalesce((SELECT jsonb_agg(fn_chat_mensaje_json(r.id, p_actor_id) ORDER BY r.seq)
                              FROM mensajes r WHERE r.hilo_de_id = v_raiz), '[]'::jsonb));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** CH-06: mensajes fijados de la conversación, el más reciente primero. */
CREATE OR REPLACE FUNCTION proc_chat_fijados(p_actor_id uuid, p_conversacion_id uuid) RETURNS jsonb AS $$
DECLARE c conversaciones := fn_chat_exigir(p_actor_id, p_conversacion_id);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(fn_chat_mensaje_json(m.id, p_actor_id) ORDER BY m.seq DESC)
                     FROM mensajes m WHERE m.conversacion_id = c.id AND m.fijado AND m.eliminado_en IS NULL), '[]'::jsonb);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Personas con acceso a la conversación ahora mismo (para las menciones con @ y para saber a
 * quién se le emite en tiempo real). Se calcula en cada llamada: si cambia la membresía o se
 * deja de compartir una tarea, el cambio se nota de inmediato.
 */
CREATE OR REPLACE FUNCTION proc_chat_miembros(p_actor_id uuid, p_conversacion_id uuid) RETURNS jsonb AS $$
DECLARE c conversaciones := fn_chat_exigir(p_actor_id, p_conversacion_id);
BEGIN
  RETURN coalesce((SELECT jsonb_agg(fn_persona_json(c.equipo_id, m.usuario_id) || jsonb_build_object('rol', m.rol) ORDER BY m.color_idx NULLS LAST, m.desde)
                     FROM membresias m
                    WHERE m.equipo_id = c.equipo_id AND m.estado = 'activa' AND fn_chat_puede(m.usuario_id, c)), '[]'::jsonb);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Salas de tiempo real de la persona: todas las conversaciones que puede ver en sus equipos
 * activos. El servidor de sockets une la conexión a estas salas y a ninguna otra.
 */
CREATE OR REPLACE FUNCTION proc_chat_salas(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('conversacion_id', c.id, 'equipo_id', c.equipo_id))
                     FROM conversaciones c
                    WHERE c.equipo_id IN (SELECT m.equipo_id FROM membresias m WHERE m.usuario_id = p_actor_id AND m.estado = 'activa')
                      AND fn_chat_puede(p_actor_id, c)), '[]'::jsonb);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_chat_salas(uuid);
DROP FUNCTION IF EXISTS proc_chat_miembros(uuid, uuid);
DROP FUNCTION IF EXISTS proc_chat_fijados(uuid, uuid);
DROP FUNCTION IF EXISTS proc_chat_hilo(uuid, uuid);
DROP FUNCTION IF EXISTS proc_chat_mensajes(uuid, uuid, bigint, int);
DROP FUNCTION IF EXISTS proc_chat_conversaciones(uuid, uuid);
DROP FUNCTION IF EXISTS fn_chat_conversacion_json(uuid, uuid);
DROP FUNCTION IF EXISTS fn_chat_mensaje_json(uuid, uuid);
DROP FUNCTION IF EXISTS fn_chat_reacciones_json(uuid, uuid);
DROP FUNCTION IF EXISTS fn_chat_exigir(uuid, uuid);
DROP FUNCTION IF EXISTS fn_chat_puede(uuid, conversaciones);
DROP INDEX IF EXISTS ix_menciones_usuario;
