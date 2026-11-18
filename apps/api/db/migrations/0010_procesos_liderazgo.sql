-- Fase 3.5 · Liderazgo y administración del equipo (AD-04 a AD-12), DEC-032.
-- Transferencia de liderazgo, elección (72 h con 24 h de desempate; el saliente no vota, NX002,
-- y queda como interino), salir, expulsar, archivar, gestionar invitados y configurar el equipo.
-- Las tablas ya existen en 0001 (`transferencias_liderazgo`, `elecciones`, `eleccion_candidatos`,
-- `eleccion_votos`, `notificaciones`). Documentación: docs/08_Procesos_BD.md.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/** Notificación dentro de la app (NT-01) para una persona. */
CREATE OR REPLACE FUNCTION fn_notificar(
  p_usuario uuid, p_equipo uuid, p_titulo text, p_texto text, p_enlace text,
  p_accion_tipo text DEFAULT NULL, p_accion_ref text DEFAULT NULL, p_categoria text DEFAULT 'equipo'
) RETURNS void AS $$
  INSERT INTO notificaciones (usuario_id, equipo_id, categoria, icono, titulo, texto, enlace, accion_tipo, accion_ref)
  VALUES (p_usuario, p_equipo, p_categoria::categoria_notificacion,
          CASE WHEN p_accion_tipo IN ('liderazgo', 'ver_eleccion') THEN 'crown' ELSE 'bell' END,
          p_titulo, coalesce(p_texto, ''), p_enlace, p_accion_tipo, p_accion_ref);
$$ LANGUAGE sql;

/** Notifica a todos los miembros activos del equipo (sin invitados), menos a `p_excepto`. */
CREATE OR REPLACE FUNCTION fn_notificar_equipo(
  p_equipo uuid, p_excepto uuid, p_titulo text, p_texto text, p_enlace text, p_accion_tipo text DEFAULT NULL
) RETURNS void AS $$
  SELECT fn_notificar(m.usuario_id, p_equipo, p_titulo, p_texto, p_enlace, p_accion_tipo)
    FROM membresias m
   WHERE m.equipo_id = p_equipo AND m.estado = 'activa' AND m.rol <> 'invitado'
     AND m.usuario_id IS DISTINCT FROM p_excepto;
$$ LANGUAGE sql;

/** Ruta de la pantalla de liderazgo del equipo. */
CREATE OR REPLACE FUNCTION fn_enlace_liderazgo(p_equipo uuid) RETURNS text AS $$
  SELECT '/app/e/' || p_equipo || '/equipo/liderazgo';
$$ LANGUAGE sql IMMUTABLE;

/**
 * Vuelve a contar las propuestas abiertas del equipo (DEC-024): cuando cambia el número de
 * integrantes (alguien sale, es expulsado o cambia de rol) una propuesta puede alcanzar la mayoría.
 * Misma regla que `proc_tarea_votar`.
 */
CREATE OR REPLACE FUNCTION fn_votaciones_reevaluar(p_equipo uuid, p_actor uuid) RETURNS void AS $$
DECLARE t tareas; v_aceptar int; v_rechaza int; v_total int; v_result text; v_sprint uuid;
BEGIN
  v_total := fn_integrantes_activos(p_equipo);
  SELECT id INTO v_sprint FROM sprints WHERE equipo_id = p_equipo AND estado = 'activo';
  FOR t IN SELECT * FROM tareas WHERE equipo_id = p_equipo AND estado = 'propuesta' ORDER BY codigo FOR UPDATE LOOP
    SELECT count(*) FILTER (WHERE voto = 'aceptar'), count(*) FILTER (WHERE voto = 'rechazar')
      INTO v_aceptar, v_rechaza FROM tarea_votos WHERE tarea_id = t.id;
    v_result := fn_votacion_resultado(v_aceptar, v_rechaza, v_total);
    IF v_result = 'aceptada' THEN
      UPDATE tareas
         SET estado = 'aceptada', sprint_id = v_sprint, motivo = NULL, rechazo_por = NULL,
             orden = fn_orden_al_final(p_equipo, 'aceptada', t.id)
       WHERE id = t.id;
      PERFORM fn_registrar_evento(p_equipo, p_actor, 'tarea.aceptada_por_votacion', 'tarea', t.id,
        jsonb_build_object('aceptar', v_aceptar, 'rechazar', v_rechaza, 'total', v_total, 'sprint_id', v_sprint,
                           'reevaluada', true, 'proponente_id', t.proponente_id, 'responsable_id', t.responsable_id),
        'El equipo aceptó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» por mayoría ('
          || v_aceptar || ' de ' || v_total || ') al cambiar los integrantes');
    ELSIF v_result = 'rechazada' THEN
      UPDATE tareas
         SET estado = 'rechazada', rechazo_por = 'votacion', sprint_id = NULL,
             responsable_id = NULL, asignacion_pendiente = false,
             motivo = 'Rechazada por mayoría (' || v_rechaza || ' de ' || v_total || ')'
       WHERE id = t.id;
      PERFORM fn_registrar_evento(p_equipo, p_actor, 'tarea.rechazada_por_votacion', 'tarea', t.id,
        jsonb_build_object('aceptar', v_aceptar, 'rechazar', v_rechaza, 'total', v_total, 'reevaluada', true,
                           'proponente_id', t.proponente_id),
        'El equipo rechazó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» por mayoría ('
          || v_rechaza || ' de ' || v_total || ') al cambiar los integrantes');
    END IF;
  END LOOP;
END $$ LANGUAGE plpgsql;

/**
 * Quien deja el equipo (sale, es expulsado o se va al transferir el liderazgo): sus tareas sin
 * terminar quedan sin responsable, se cancela una transferencia pendiente hacia esa persona y se
 * vuelven a contar las votaciones abiertas. Sus votos de propuestas abiertas ya los descarta el
 * disparador `trg_membresia_descarta_votos` (0003).
 */
CREATE OR REPLACE FUNCTION fn_miembro_retirado(p_equipo uuid, p_usuario uuid, p_actor uuid) RETURNS void AS $$
BEGIN
  UPDATE tareas SET responsable_id = NULL, asignacion_pendiente = false
   WHERE equipo_id = p_equipo AND responsable_id = p_usuario
     AND estado NOT IN ('completada', 'rechazada', 'cancelada');
  UPDATE transferencias_liderazgo SET estado = 'cancelada', resuelta_en = now()
   WHERE equipo_id = p_equipo AND estado = 'pendiente' AND a_id = p_usuario;
  PERFORM fn_votaciones_reevaluar(p_equipo, p_actor);
END $$ LANGUAGE plpgsql;

/**
 * Cambia el líder: `p_de` pasa a integrante (o sale del equipo si `p_de_sale`) y `p_a` pasa a
 * líder. El orden importa por el índice `ux_un_lider_activo`. El nuevo líder ya no vota
 * propuestas: sus votos abiertos se descartan y las votaciones se vuelven a contar.
 */
CREATE OR REPLACE FUNCTION fn_cambiar_lider(p_equipo uuid, p_de uuid, p_a uuid, p_de_sale boolean, p_actor uuid)
RETURNS void AS $$
BEGIN
  IF p_de_sale THEN
    UPDATE membresias SET estado = 'salio', hasta = now()
     WHERE equipo_id = p_equipo AND usuario_id = p_de AND estado = 'activa';
  ELSE
    UPDATE membresias SET rol = 'integrante'
     WHERE equipo_id = p_equipo AND usuario_id = p_de AND estado = 'activa' AND rol = 'lider';
  END IF;
  UPDATE membresias SET rol = 'lider'
   WHERE equipo_id = p_equipo AND usuario_id = p_a AND estado = 'activa' AND rol = 'integrante';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La persona elegida ya no es integrante del equipo.' USING ERRCODE = 'NX012', HINT = 'miembro_no_disponible';
  END IF;
  DELETE FROM tarea_votos v USING tareas t
   WHERE v.tarea_id = t.id AND t.equipo_id = p_equipo AND t.estado = 'propuesta' AND v.usuario_id = p_a;
  IF p_de_sale THEN
    PERFORM fn_miembro_retirado(p_equipo, p_de, p_actor);
  ELSE
    PERFORM fn_votaciones_reevaluar(p_equipo, p_actor);
  END IF;
  UPDATE equipos SET actualizado_en = now() WHERE id = p_equipo;
END $$ LANGUAGE plpgsql;

/** Candidatos que se pueden votar en la ronda actual: todos en la 1; en la 2, los empatados. */
CREATE OR REPLACE FUNCTION fn_eleccion_finalistas(e elecciones) RETURNS uuid[] AS $$
  SELECT CASE WHEN e.ronda = 1 THEN
    (SELECT coalesce(array_agg(c.usuario_id), '{}') FROM eleccion_candidatos c WHERE c.eleccion_id = e.id)
  ELSE
    (SELECT coalesce(array_agg(x.candidato_id), '{}') FROM (
       SELECT v.candidato_id, count(*) AS n, max(count(*)) OVER () AS maximo
         FROM eleccion_votos v WHERE v.eleccion_id = e.id AND v.ronda = 1
        GROUP BY v.candidato_id) x
      WHERE x.n = x.maximo)
  END;
$$ LANGUAGE sql STABLE;

/** Integrantes activos que pueden votar en la elección (el saliente nunca). */
CREATE OR REPLACE FUNCTION fn_eleccion_votantes(e elecciones) RETURNS int AS $$
  SELECT count(*)::int FROM membresias m
   WHERE m.equipo_id = e.equipo_id AND m.estado = 'activa' AND m.rol = 'integrante'
     AND m.usuario_id <> e.saliente_id;
$$ LANGUAGE sql STABLE;

/**
 * Cierra la ronda actual. Gana quien tenga más votos entre los finalistas que sigan siendo
 * integrantes. Empate en la ronda 1 → ronda 2 de desempate (`votacion_desempate_horas`) solo entre
 * los empatados. Empate en la ronda 2 → gana quien lleva más tiempo en el equipo. Sin votos en la
 * ronda 1 → `sin_votos`: el líder saliente sigue siéndolo.
 */
CREATE OR REPLACE FUNCTION fn_eleccion_resolver(p_eleccion uuid, p_actor uuid) RETURNS void AS $$
DECLARE
  e         elecciones;
  v_fin     uuid[];
  v_max     int;
  v_top     uuid[];
  v_ganador uuid;
  v_horas   smallint;
BEGIN
  SELECT * INTO e FROM elecciones WHERE id = p_eleccion FOR UPDATE;
  IF e.cerrada_en IS NOT NULL THEN RETURN; END IF;
  v_fin := fn_eleccion_finalistas(e);

  SELECT max(n) INTO v_max FROM (
    SELECT count(*) AS n FROM eleccion_votos v
      JOIN membresias m ON m.equipo_id = e.equipo_id AND m.usuario_id = v.candidato_id
                       AND m.estado = 'activa' AND m.rol = 'integrante'
     WHERE v.eleccion_id = e.id AND v.ronda = e.ronda AND v.candidato_id = ANY (v_fin)
     GROUP BY v.candidato_id) x;

  IF v_max IS NULL AND e.ronda = 1 THEN
    UPDATE elecciones SET fase = 'sin_votos', cerrada_en = now() WHERE id = e.id;
    PERFORM fn_registrar_evento(e.equipo_id, p_actor, 'equipo.eleccion_sin_votos', 'eleccion', e.id, '{}'::jsonb,
      'La elección de líder terminó sin votos: ' || fn_primer_nombre(e.saliente_id) || ' sigue como líder');
    PERFORM fn_notificar_equipo(e.equipo_id, NULL, 'La elección terminó sin votos',
      fn_primer_nombre(e.saliente_id) || ' sigue como líder del equipo.', fn_enlace_liderazgo(e.equipo_id), 'ver_eleccion');
    RETURN;
  END IF;

  SELECT coalesce(array_agg(x.candidato_id), '{}') INTO v_top FROM (
    SELECT v.candidato_id FROM eleccion_votos v
      JOIN membresias m ON m.equipo_id = e.equipo_id AND m.usuario_id = v.candidato_id
                       AND m.estado = 'activa' AND m.rol = 'integrante'
     WHERE v.eleccion_id = e.id AND v.ronda = e.ronda AND v.candidato_id = ANY (v_fin)
     GROUP BY v.candidato_id HAVING count(*) = v_max) x;

  IF cardinality(v_top) > 1 AND e.ronda = 1 THEN
    SELECT votacion_desempate_horas INTO v_horas FROM equipos WHERE id = e.equipo_id;
    UPDATE elecciones SET ronda = 2, fase = 'empate', plazo_en = now() + make_interval(hours => v_horas)
     WHERE id = e.id;
    PERFORM fn_registrar_evento(e.equipo_id, p_actor, 'equipo.eleccion_empate', 'eleccion', e.id,
      jsonb_build_object('empatados', to_jsonb(v_top)),
      'Empate en la elección de líder: hay una ronda de desempate de ' || v_horas || ' h');
    PERFORM fn_notificar_equipo(e.equipo_id, NULL, 'Empate en la elección de líder',
      'Vota de nuevo entre las personas empatadas; tienes ' || v_horas || ' horas.', fn_enlace_liderazgo(e.equipo_id), 'ver_eleccion');
    RETURN;
  END IF;

  -- Un solo ganador, o empate en la ronda 2 (o sin votos en ella): gana quien lleva más tiempo.
  SELECT m.usuario_id INTO v_ganador FROM membresias m
   WHERE m.equipo_id = e.equipo_id AND m.estado = 'activa' AND m.rol = 'integrante'
     AND m.usuario_id = ANY (CASE WHEN cardinality(v_top) > 0 THEN v_top ELSE v_fin END)
   ORDER BY m.desde, m.usuario_id LIMIT 1;
  IF v_ganador IS NULL THEN
    UPDATE elecciones SET fase = 'sin_votos', cerrada_en = now() WHERE id = e.id;
    RETURN;
  END IF;
  PERFORM fn_cambiar_lider(e.equipo_id, e.saliente_id, v_ganador, false, p_actor);
  UPDATE elecciones SET fase = 'resultado', ganador_id = v_ganador, cerrada_en = now() WHERE id = e.id;
  PERFORM fn_registrar_evento(e.equipo_id, p_actor, 'equipo.lider_elegido', 'eleccion', e.id,
    jsonb_build_object('ganador_id', v_ganador, 'ronda', e.ronda),
    (SELECT nombre FROM usuarios WHERE id = v_ganador) || ' es la nueva persona líder del equipo (elección)');
  PERFORM fn_notificar_equipo(e.equipo_id, NULL, 'Hay nueva persona líder',
    (SELECT nombre FROM usuarios WHERE id = v_ganador) || ' ganó la elección.', fn_enlace_liderazgo(e.equipo_id), 'ver_eleccion');
END $$ LANGUAGE plpgsql;

/**
 * Elección para quien consulta. Los votos de cada candidato solo se muestran cuando la elección
 * cerró; mientras está abierta se ve cuántos votaron y quiénes, nunca por quién (como V-8).
 */
CREATE OR REPLACE FUNCTION fn_eleccion_json(p_actor uuid, e elecciones) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'fase', e.fase, 'ronda', e.ronda, 'plazo_en', fn_iso(e.plazo_en),
    'creada_en', fn_iso(e.creada_en), 'cerrada_en', fn_iso(e.cerrada_en),
    'saliente', fn_persona_json(e.equipo_id, e.saliente_id),
    'ganador', CASE WHEN e.ganador_id IS NOT NULL THEN fn_persona_json(e.equipo_id, e.ganador_id) END,
    'candidatos', (SELECT coalesce(jsonb_agg(fn_persona_json(e.equipo_id, c.usuario_id)
                      || jsonb_build_object(
                           'finalista', c.usuario_id = ANY (fn_eleccion_finalistas(e)),
                           'votos', CASE WHEN e.cerrada_en IS NOT NULL THEN
                             (SELECT count(*) FROM eleccion_votos v
                               WHERE v.eleccion_id = e.id AND v.ronda = e.ronda AND v.candidato_id = c.usuario_id) END)
                      ORDER BY u.nombre), '[]'::jsonb)
                     FROM eleccion_candidatos c JOIN usuarios u ON u.id = c.usuario_id
                    WHERE c.eleccion_id = e.id),
    'votantes_total', fn_eleccion_votantes(e),
    'votaron', (SELECT coalesce(jsonb_agg(u.nombre ORDER BY u.nombre), '[]'::jsonb)
                  FROM eleccion_votos v JOIN usuarios u ON u.id = v.votante_id
                 WHERE v.eleccion_id = e.id AND v.ronda = e.ronda),
    'mi_voto', (SELECT v.candidato_id FROM eleccion_votos v
                 WHERE v.eleccion_id = e.id AND v.ronda = e.ronda AND v.votante_id = p_actor));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_transferencia_json(t transferencias_liderazgo) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'estado', t.estado, 'saldra', t.saldra,
    'de', fn_persona_json(t.equipo_id, t.de_id), 'a', fn_persona_json(t.equipo_id, t.a_id),
    'creada_en', fn_iso(t.creada_en), 'resuelta_en', fn_iso(t.resuelta_en));
$$ LANGUAGE sql STABLE;

/** Estado del liderazgo (AD-07 a AD-09 y FALT-07): transferencia pendiente, elección abierta e historial. */
CREATE OR REPLACE FUNCTION fn_liderazgo_json(p_actor uuid, p_equipo uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'transferencia', (SELECT fn_transferencia_json(t) FROM transferencias_liderazgo t
                       WHERE t.equipo_id = p_equipo AND t.estado = 'pendiente'),
    'eleccion', (SELECT fn_eleccion_json(p_actor, e) FROM elecciones e
                  WHERE e.equipo_id = p_equipo AND e.cerrada_en IS NULL),
    'historial', (SELECT coalesce(jsonb_agg(x.j ORDER BY x.fecha DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('tipo', 'transferencia') || fn_transferencia_json(t) AS j,
               coalesce(t.resuelta_en, t.creada_en) AS fecha
          FROM transferencias_liderazgo t WHERE t.equipo_id = p_equipo AND t.estado <> 'pendiente'
        UNION ALL
        SELECT jsonb_build_object('tipo', 'eleccion') || fn_eleccion_json(p_actor, e), e.cerrada_en
          FROM elecciones e WHERE e.equipo_id = p_equipo AND e.cerrada_en IS NOT NULL) x));
$$ LANGUAGE sql STABLE;

/** Membresía activa del equipo por id, bloqueada; si no, NX006. */
CREATE OR REPLACE FUNCTION fn_membresia_bloquear(p_equipo uuid, p_membresia uuid) RETURNS membresias AS $$
DECLARE m membresias;
BEGIN
  SELECT * INTO m FROM membresias WHERE id = p_membresia AND equipo_id = p_equipo AND estado = 'activa' FOR UPDATE;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos a esa persona en el equipo.' USING ERRCODE = 'NX006', HINT = 'miembro_no_encontrado';
  END IF;
  RETURN m;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 2. Liderazgo: lectura, transferencia y elección
-- ---------------------------------------------------------------------------------------------

/** Transferencia pendiente, elección abierta e historial de cambios de líder. Los invitados no. */
CREATE OR REPLACE FUNCTION proc_liderazgo_obtener(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven el liderazgo del equipo.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN fn_liderazgo_json(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** AD-07: el líder propone a un integrante como nuevo líder; puede salir del equipo al aceptarse. */
CREATE OR REPLACE FUNCTION proc_liderazgo_transferir(p_actor_id uuid, p_equipo_id uuid, p_a_id uuid, p_saldra boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede transferir el liderazgo.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  PERFORM 1 FROM equipos WHERE id = p_equipo_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM membresias WHERE equipo_id = p_equipo_id AND usuario_id = p_a_id
                    AND estado = 'activa' AND rol = 'integrante') THEN
    RAISE EXCEPTION 'El liderazgo se transfiere a un integrante del equipo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF EXISTS (SELECT 1 FROM elecciones WHERE equipo_id = p_equipo_id AND cerrada_en IS NULL) THEN
    RAISE EXCEPTION 'Hay una elección de líder en curso.' USING ERRCODE = 'NX012', HINT = 'eleccion_abierta';
  END IF;
  IF EXISTS (SELECT 1 FROM transferencias_liderazgo WHERE equipo_id = p_equipo_id AND estado = 'pendiente') THEN
    RAISE EXCEPTION 'Ya hay una transferencia pendiente: cancélala antes de proponer otra.'
      USING ERRCODE = 'NX012', HINT = 'transferencia_pendiente';
  END IF;
  INSERT INTO transferencias_liderazgo (equipo_id, de_id, a_id, saldra)
  VALUES (p_equipo_id, p_actor_id, p_a_id, coalesce(p_saldra, false)) RETURNING id INTO v_id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.transferencia_propuesta', 'transferencia', v_id,
    jsonb_build_object('a_id', p_a_id, 'saldra', coalesce(p_saldra, false)),
    fn_primer_nombre(p_actor_id) || ' propuso a ' || fn_primer_nombre(p_a_id) || ' como líder del equipo');
  PERFORM fn_notificar(p_a_id, p_equipo_id, fn_primer_nombre(p_actor_id) || ' te propone como líder',
    'Acepta o rechaza la transferencia del liderazgo.', fn_enlace_liderazgo(p_equipo_id), 'liderazgo', v_id::text);
  RETURN fn_liderazgo_json(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** AD-08: la persona propuesta acepta (pasa a ser líder) o rechaza la transferencia. */
CREATE OR REPLACE FUNCTION proc_liderazgo_responder(p_actor_id uuid, p_equipo_id uuid, p_transferencia_id uuid, p_acepta boolean)
RETURNS jsonb AS $$
DECLARE t transferencias_liderazgo;
BEGIN
  PERFORM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  PERFORM 1 FROM equipos WHERE id = p_equipo_id FOR UPDATE;
  SELECT * INTO t FROM transferencias_liderazgo WHERE id = p_transferencia_id AND equipo_id = p_equipo_id FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa transferencia.' USING ERRCODE = 'NX006', HINT = 'transferencia_no_encontrada';
  END IF;
  IF t.a_id <> p_actor_id THEN
    RAISE EXCEPTION 'Solo la persona propuesta responde la transferencia.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF t.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Esa transferencia ya no está pendiente.' USING ERRCODE = 'NX007', HINT = 'transferencia_resuelta';
  END IF;
  UPDATE transferencias_liderazgo SET estado = CASE WHEN p_acepta THEN 'aceptada' ELSE 'rechazada' END::estado_transferencia,
         resuelta_en = now()
   WHERE id = t.id;
  IF p_acepta THEN
    PERFORM fn_cambiar_lider(p_equipo_id, t.de_id, t.a_id, t.saldra, p_actor_id);
  END IF;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN p_acepta THEN 'equipo.transferencia_aceptada' ELSE 'equipo.transferencia_rechazada' END,
    'transferencia', t.id, jsonb_build_object('de_id', t.de_id, 'saldra', t.saldra),
    fn_primer_nombre(p_actor_id) || CASE WHEN p_acepta
      THEN ' aceptó el liderazgo del equipo' || CASE WHEN t.saldra THEN ' (' || fn_primer_nombre(t.de_id) || ' salió del equipo)' ELSE '' END
      ELSE ' rechazó la transferencia del liderazgo' END);
  PERFORM fn_notificar(t.de_id, p_equipo_id,
    fn_primer_nombre(p_actor_id) || CASE WHEN p_acepta THEN ' aceptó el liderazgo' ELSE ' rechazó el liderazgo' END,
    '', fn_enlace_liderazgo(p_equipo_id), 'liderazgo', t.id::text);
  RETURN fn_liderazgo_json(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder cancela la transferencia que propuso. */
CREATE OR REPLACE FUNCTION proc_liderazgo_cancelar(p_actor_id uuid, p_equipo_id uuid, p_transferencia_id uuid) RETURNS jsonb AS $$
DECLARE t transferencias_liderazgo;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede transferir el liderazgo.');
  SELECT * INTO t FROM transferencias_liderazgo WHERE id = p_transferencia_id AND equipo_id = p_equipo_id FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa transferencia.' USING ERRCODE = 'NX006', HINT = 'transferencia_no_encontrada';
  END IF;
  IF t.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Esa transferencia ya no está pendiente.' USING ERRCODE = 'NX007', HINT = 'transferencia_resuelta';
  END IF;
  UPDATE transferencias_liderazgo SET estado = 'cancelada', resuelta_en = now() WHERE id = t.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.transferencia_cancelada', 'transferencia', t.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' canceló la transferencia del liderazgo');
  RETURN fn_liderazgo_json(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AD-09: el líder convoca una elección. Son candidatos todos los integrantes activos; votan ellos
 * durante `votacion_plazo_horas` (72 por defecto). El líder saliente no vota (NX002) y sigue como
 * líder interino hasta el resultado.
 */
CREATE OR REPLACE FUNCTION proc_eleccion_convocar(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
DECLARE v_id uuid; v_horas smallint;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede convocar una elección.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  PERFORM 1 FROM equipos WHERE id = p_equipo_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM elecciones WHERE equipo_id = p_equipo_id AND cerrada_en IS NULL) THEN
    RAISE EXCEPTION 'Ya hay una elección de líder en curso.' USING ERRCODE = 'NX012', HINT = 'eleccion_abierta';
  END IF;
  IF EXISTS (SELECT 1 FROM transferencias_liderazgo WHERE equipo_id = p_equipo_id AND estado = 'pendiente') THEN
    RAISE EXCEPTION 'Hay una transferencia pendiente: cancélala antes de convocar una elección.'
      USING ERRCODE = 'NX012', HINT = 'transferencia_pendiente';
  END IF;
  IF fn_integrantes_activos(p_equipo_id) = 0 THEN
    RAISE EXCEPTION 'El equipo no tiene integrantes que puedan ser líder.' USING ERRCODE = 'NX007', HINT = 'sin_integrantes';
  END IF;
  SELECT votacion_plazo_horas INTO v_horas FROM equipos WHERE id = p_equipo_id;
  INSERT INTO elecciones (equipo_id, fase, ronda, plazo_en, saliente_id)
  VALUES (p_equipo_id, 'votacion', 1, now() + make_interval(hours => v_horas), p_actor_id)
  RETURNING id INTO v_id;
  INSERT INTO eleccion_candidatos (eleccion_id, usuario_id)
  SELECT v_id, usuario_id FROM membresias
   WHERE equipo_id = p_equipo_id AND estado = 'activa' AND rol = 'integrante';
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.eleccion_convocada', 'eleccion', v_id,
    jsonb_build_object('plazo_horas', v_horas),
    fn_primer_nombre(p_actor_id) || ' convocó una elección de líder (' || v_horas || ' h)');
  PERFORM fn_notificar_equipo(p_equipo_id, p_actor_id, 'Elección de líder',
    'Vota por quién quieres que lidere el equipo; tienes ' || v_horas || ' horas.', fn_enlace_liderazgo(p_equipo_id), 'ver_eleccion');
  RETURN fn_liderazgo_json(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Un integrante vota una vez por ronda por un candidato de esa ronda. Si ya votaron todos los
 * integrantes, la ronda se resuelve en el acto (no hace falta esperar el plazo).
 */
CREATE OR REPLACE FUNCTION proc_eleccion_votar(p_actor_id uuid, p_equipo_id uuid, p_eleccion_id uuid, p_candidato_id uuid)
RETURNS jsonb AS $$
DECLARE e elecciones; v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  SELECT * INTO e FROM elecciones WHERE id = p_eleccion_id AND equipo_id = p_equipo_id FOR UPDATE;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa elección.' USING ERRCODE = 'NX006', HINT = 'eleccion_no_encontrada';
  END IF;
  IF p_actor_id = e.saliente_id OR v_rol = 'lider' THEN
    RAISE EXCEPTION 'El líder saliente no participa en la votación.' USING ERRCODE = 'NX002', HINT = 'saliente_no_vota';
  END IF;
  IF v_rol <> 'integrante' THEN
    RAISE EXCEPTION 'Solo los integrantes votan en la elección de líder.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF e.cerrada_en IS NOT NULL THEN
    RAISE EXCEPTION 'La elección ya terminó.' USING ERRCODE = 'NX007', HINT = 'eleccion_cerrada';
  END IF;
  IF EXISTS (SELECT 1 FROM eleccion_votos WHERE eleccion_id = e.id AND ronda = e.ronda AND votante_id = p_actor_id) THEN
    RAISE EXCEPTION 'Ya votaste en esta ronda.' USING ERRCODE = 'NX012', HINT = 'voto_repetido';
  END IF;
  IF NOT (p_candidato_id = ANY (fn_eleccion_finalistas(e))) THEN
    RAISE EXCEPTION 'Elige a una de las personas candidatas de esta ronda.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO eleccion_votos (eleccion_id, ronda, votante_id, candidato_id) VALUES (e.id, e.ronda, p_actor_id, p_candidato_id);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.eleccion_votada', 'eleccion', e.id,
    jsonb_build_object('ronda', e.ronda), fn_primer_nombre(p_actor_id) || ' votó en la elección de líder');
  IF (SELECT count(*) FROM eleccion_votos WHERE eleccion_id = e.id AND ronda = e.ronda) >= fn_eleccion_votantes(e) THEN
    PERFORM fn_eleccion_resolver(e.id, p_actor_id);
  END IF;
  RETURN fn_liderazgo_json(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Tarea programada (sin actor): resuelve las elecciones cuyo plazo ya venció. La llama cada
 * minuto el temporizador de la API (`trabajos/plazos.ts`; `pg-boss` lo sustituye en la Fase 4).
 * Con varias instancias no se pisan: cada elección se bloquea y las ocupadas se saltan.
 */
CREATE OR REPLACE FUNCTION proc_eleccion_vencidas() RETURNS jsonb AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM elecciones WHERE cerrada_en IS NULL AND plazo_en <= now()
            ORDER BY plazo_en FOR UPDATE SKIP LOCKED LOOP
    PERFORM fn_eleccion_resolver(r.id, NULL);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('resueltas', n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 3. Membresías: salir, expulsar, invitados
-- ---------------------------------------------------------------------------------------------

/** AD-10: salir del equipo. El líder primero transfiere el liderazgo (o lo cede por elección). */
CREATE OR REPLACE FUNCTION proc_equipo_salir(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol = 'lider' THEN
    RAISE EXCEPTION 'Transfiere el liderazgo antes de salir del equipo.' USING ERRCODE = 'NX007', HINT = 'lider_no_sale';
  END IF;
  UPDATE membresias SET estado = 'salio', hasta = now() WHERE id = v_membresia;
  PERFORM fn_miembro_retirado(p_equipo_id, p_actor_id, p_actor_id);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.miembro_salio', 'membresia', v_membresia,
    jsonb_build_object('rol', v_rol), fn_primer_nombre(p_actor_id) || ' salió del equipo');
  RETURN jsonb_build_object('salio', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** AD-11: el líder expulsa a un integrante o invitado. */
CREATE OR REPLACE FUNCTION proc_equipo_expulsar(p_actor_id uuid, p_equipo_id uuid, p_membresia_id uuid) RETURNS jsonb AS $$
DECLARE m membresias;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede expulsar miembros.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  m := fn_membresia_bloquear(p_equipo_id, p_membresia_id);
  IF m.usuario_id = p_actor_id THEN
    RAISE EXCEPTION 'No puedes expulsarte: para dejar el equipo transfiere el liderazgo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE membresias SET estado = 'expulsada', hasta = now() WHERE id = m.id;
  PERFORM fn_miembro_retirado(p_equipo_id, m.usuario_id, p_actor_id);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.miembro_expulsado', 'membresia', m.id,
    jsonb_build_object('usuario_id', m.usuario_id, 'rol', m.rol),
    fn_primer_nombre(p_actor_id) || ' expulsó a ' || fn_primer_nombre(m.usuario_id) || ' del equipo');
  PERFORM fn_notificar(m.usuario_id, NULL, 'Ya no perteneces a ' || (SELECT nombre FROM equipos WHERE id = p_equipo_id),
    'El líder te quitó del equipo.', '/app/personal/equipos');
  RETURN fn_miembros_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AD-05: el líder amplía el acceso de un invitado (`ampliar`, 7, 14 o 30 días más) o lo
 * convierte en integrante (`convertir`, con color; el tope de miembros lo cuida NX001).
 */
CREATE OR REPLACE FUNCTION proc_invitado_gestionar(
  p_actor_id uuid, p_equipo_id uuid, p_membresia_id uuid, p_accion text, p_dias int DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE m membresias;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede convertir invitados en integrantes.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  m := fn_membresia_bloquear(p_equipo_id, p_membresia_id);
  IF m.rol <> 'invitado' THEN
    RAISE EXCEPTION 'Esa persona no es invitada.' USING ERRCODE = 'NX007', HINT = 'no_es_invitado';
  END IF;
  IF p_accion = 'convertir' THEN
    UPDATE membresias SET rol = 'integrante', caduca_en = NULL, color_idx = fn_siguiente_color_idx(p_equipo_id)
     WHERE id = m.id;
    DELETE FROM tarea_compartida WHERE membresia_id = m.id;   -- como integrante ya ve todo
    PERFORM fn_votaciones_reevaluar(p_equipo_id, p_actor_id);
    PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.invitado_convertido', 'membresia', m.id, '{}'::jsonb,
      fn_primer_nombre(p_actor_id) || ' hizo integrante a ' || fn_primer_nombre(m.usuario_id));
    PERFORM fn_notificar(m.usuario_id, p_equipo_id, 'Ahora eres integrante de ' || (SELECT nombre FROM equipos WHERE id = p_equipo_id),
      'Ya ves todo el trabajo del equipo.', '/app/e/' || p_equipo_id);
  ELSIF p_accion = 'ampliar' THEN
    IF p_dias IS NULL OR p_dias NOT IN (7, 14, 30) THEN
      RAISE EXCEPTION 'El acceso se amplía 7, 14 o 30 días.' USING ERRCODE = 'NX010', HINT = 'validacion';
    END IF;
    UPDATE membresias SET caduca_en = greatest(coalesce(caduca_en, now()), now()) + make_interval(days => p_dias)
     WHERE id = m.id;
    PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.invitado_ampliado', 'membresia', m.id,
      jsonb_build_object('dias', p_dias),
      fn_primer_nombre(p_actor_id) || ' amplió ' || p_dias || ' días el acceso de ' || fn_primer_nombre(m.usuario_id));
  ELSE
    RAISE EXCEPTION 'La acción no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  RETURN fn_miembros_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Equipo: configurar (AD-06) y archivar (AD-12)
-- ---------------------------------------------------------------------------------------------

/** AD-06: el líder cambia los datos y reglas del equipo. `p_cambios` lleva solo lo que cambia. */
CREATE OR REPLACE FUNCTION proc_equipo_configurar(p_actor_id uuid, p_equipo_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
DECLARE v_activos int; v_zona text := p_cambios->>'zona_horaria';
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder configura el equipo.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  PERFORM 1 FROM equipos WHERE id = p_equipo_id FOR UPDATE;
  IF v_zona IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_zona) THEN
    RAISE EXCEPTION 'La zona horaria no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT count(*) INTO v_activos FROM membresias
   WHERE equipo_id = p_equipo_id AND estado = 'activa' AND rol IN ('lider', 'integrante');
  IF (p_cambios->>'max_miembros')::int < v_activos THEN
    RAISE EXCEPTION 'El equipo ya tiene % miembros: el tope no puede ser menor.', v_activos
      USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    UPDATE equipos SET
      nombre                   = coalesce(btrim(p_cambios->>'nombre'), nombre),
      descripcion              = coalesce(p_cambios->>'descripcion', descripcion),
      duracion_sprint_semanas  = coalesce((p_cambios->>'duracion_sprint_semanas')::smallint, duracion_sprint_semanas),
      zona_horaria             = coalesce(v_zona, zona_horaria),
      votacion_plazo_horas     = coalesce((p_cambios->>'votacion_plazo_horas')::smallint, votacion_plazo_horas),
      votacion_desempate_horas = coalesce((p_cambios->>'votacion_desempate_horas')::smallint, votacion_desempate_horas),
      max_miembros             = coalesce((p_cambios->>'max_miembros')::smallint, max_miembros)
     WHERE id = p_equipo_id;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Algún valor está fuera de rango.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.configurado', 'equipo', p_equipo_id,
    jsonb_build_object('campos', (SELECT coalesce(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(p_cambios) k)),
    fn_primer_nombre(p_actor_id) || ' cambió la configuración del equipo');
  RETURN proc_equipo_configuracion(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Configuración actual del equipo (AD-06). Los invitados no la ven. */
CREATE OR REPLACE FUNCTION proc_equipo_configuracion(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven la configuración del equipo.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN (SELECT jsonb_build_object(
            'nombre', e.nombre, 'descripcion', e.descripcion, 'estado', e.estado,
            'duracion_sprint_semanas', e.duracion_sprint_semanas, 'zona_horaria', e.zona_horaria,
            'votacion_plazo_horas', e.votacion_plazo_horas, 'votacion_desempate_horas', e.votacion_desempate_horas,
            'max_miembros', e.max_miembros, 'archivado_en', fn_iso(e.archivado_en))
            FROM equipos e WHERE e.id = p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** AD-12: el líder archiva el equipo (queda de solo lectura) o lo reactiva. */
CREATE OR REPLACE FUNCTION proc_equipo_archivar(p_actor_id uuid, p_equipo_id uuid, p_archivar boolean) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede archivar o eliminar el equipo.');
  IF p_archivar AND EXISTS (SELECT 1 FROM elecciones WHERE equipo_id = p_equipo_id AND cerrada_en IS NULL) THEN
    RAISE EXCEPTION 'Hay una elección de líder en curso.' USING ERRCODE = 'NX012', HINT = 'eleccion_abierta';
  END IF;
  UPDATE equipos SET estado = CASE WHEN p_archivar THEN 'archivado' ELSE 'activo' END::estado_equipo,
         archivado_en = CASE WHEN p_archivar THEN now() END
   WHERE id = p_equipo_id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN p_archivar THEN 'equipo.archivado' ELSE 'equipo.reactivado' END, 'equipo', p_equipo_id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || CASE WHEN p_archivar THEN ' archivó el equipo' ELSE ' reactivó el equipo' END);
  RETURN proc_equipo_configuracion(p_actor_id, p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_equipo_archivar(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_equipo_configurar(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_equipo_configuracion(uuid, uuid);
DROP FUNCTION IF EXISTS proc_invitado_gestionar(uuid, uuid, uuid, text, int);
DROP FUNCTION IF EXISTS proc_equipo_expulsar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_equipo_salir(uuid, uuid);
DROP FUNCTION IF EXISTS proc_eleccion_vencidas();
DROP FUNCTION IF EXISTS proc_eleccion_votar(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_eleccion_convocar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_liderazgo_cancelar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_liderazgo_responder(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_liderazgo_transferir(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_liderazgo_obtener(uuid, uuid);
DROP FUNCTION IF EXISTS fn_membresia_bloquear(uuid, uuid);
DROP FUNCTION IF EXISTS fn_liderazgo_json(uuid, uuid);
DROP FUNCTION IF EXISTS fn_transferencia_json(transferencias_liderazgo);
DROP FUNCTION IF EXISTS fn_eleccion_json(uuid, elecciones);
DROP FUNCTION IF EXISTS fn_eleccion_resolver(uuid, uuid);
DROP FUNCTION IF EXISTS fn_eleccion_votantes(elecciones);
DROP FUNCTION IF EXISTS fn_eleccion_finalistas(elecciones);
DROP FUNCTION IF EXISTS fn_cambiar_lider(uuid, uuid, uuid, boolean, uuid);
DROP FUNCTION IF EXISTS fn_miembro_retirado(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS fn_votaciones_reevaluar(uuid, uuid);
DROP FUNCTION IF EXISTS fn_enlace_liderazgo(uuid);
DROP FUNCTION IF EXISTS fn_notificar_equipo(uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS fn_notificar(uuid, uuid, text, text, text, text, text, text);
