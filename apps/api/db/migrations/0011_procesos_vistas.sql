-- Fase 3.4 · Vistas secundarias del equipo (DEC-033): calendario y reuniones (EQ-14, EQ-15),
-- reportes y exportación (EQ-16, EQ-17), actividad (EQ-18), plantillas (EQ-20) y notificaciones
-- (NT-01). Las tablas ya existen en 0001 (`reuniones`, `reunion_asistencia`, `actividad`,
-- `plantillas`, `plantilla_elementos`, `notificaciones`). Documentación: docs/08_Procesos_BD.md.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. La actividad distingue también las reuniones (`actividad.tipo = 'reunion'`)
-- ---------------------------------------------------------------------------------------------
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
  VALUES (p_equipo, p_actor,
          CASE WHEN v_categoria IN ('tarea', 'sprint', 'reunion') THEN v_categoria ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb), v_ahora);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 2. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/** Rol del actor en el equipo; los invitados reciben NX005 con el motivo de la matriz. */
CREATE OR REPLACE FUNCTION fn_exigir_no_invitado(p_actor uuid, p_equipo uuid, p_motivo text) RETURNS rol_membresia AS $$
DECLARE v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor, p_equipo);
  IF v_rol = 'invitado' THEN
    RAISE EXCEPTION '%', p_motivo USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN v_rol;
END $$ LANGUAGE plpgsql STABLE;

/**
 * Fechas en que ocurre una reunión dentro de [desde, hasta): una vez, cada semana o de lunes a
 * viernes (el día de la semana se mira en la zona horaria del equipo). Hasta dos años de serie.
 */
CREATE OR REPLACE FUNCTION fn_reunion_ocurrencias(r reuniones, p_desde timestamptz, p_hasta timestamptz, p_zona text)
RETURNS SETOF timestamptz AS $$
  SELECT o.x FROM (
    SELECT CASE r.repeticion
             WHEN 'ninguna' THEN r.inicio
             WHEN 'semanal' THEN r.inicio + make_interval(weeks => g)
             ELSE r.inicio + make_interval(days => g)
           END AS x
      FROM generate_series(0, CASE r.repeticion WHEN 'ninguna' THEN 0 WHEN 'semanal' THEN 104 ELSE 730 END) AS g
  ) o
  WHERE o.x >= p_desde AND o.x < p_hasta
    AND (r.repeticion <> 'diaria_lv' OR extract(isodow FROM o.x AT TIME ZONE p_zona) < 6)
  ORDER BY o.x;
$$ LANGUAGE sql STABLE;

/** Una reunión (en la fecha de una ocurrencia) para quien consulta. */
CREATE OR REPLACE FUNCTION fn_reunion_json(r reuniones, p_actor uuid, p_ocurrencia timestamptz) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'titulo', r.titulo, 'inicio', fn_iso(p_ocurrencia), 'inicio_serie', fn_iso(r.inicio),
    'duracion_min', r.duracion_min, 'repeticion', r.repeticion, 'lugar', r.lugar, 'descripcion', r.descripcion,
    'recordatorio_min', r.recordatorio_min, 'avisar_wa', r.avisar_wa,
    'creada_por', CASE WHEN r.creada_por IS NOT NULL THEN fn_persona_json(r.equipo_id, r.creada_por) END,
    'puedo_editar', r.creada_por = p_actor OR EXISTS (
       SELECT 1 FROM membresias m WHERE m.equipo_id = r.equipo_id AND m.usuario_id = p_actor
          AND m.estado = 'activa' AND m.rol = 'lider'),
    'asistencia', (SELECT jsonb_build_object(
        'si', count(*) FILTER (WHERE a.respuesta = 'si'), 'no', count(*) FILTER (WHERE a.respuesta = 'no'),
        'quiza', count(*) FILTER (WHERE a.respuesta = 'quiza'), 'pendiente', count(*) FILTER (WHERE a.respuesta = 'pendiente'))
        FROM reunion_asistencia a WHERE a.reunion_id = r.id),
    'mi_respuesta', (SELECT a.respuesta FROM reunion_asistencia a WHERE a.reunion_id = r.id AND a.usuario_id = p_actor));
$$ LANGUAGE sql STABLE;

/** Bloquea una reunión vigente del equipo que el actor puede cambiar (quien la creó o el líder). */
CREATE OR REPLACE FUNCTION fn_reunion_editable(p_actor uuid, p_equipo uuid, p_reunion uuid) RETURNS reuniones AS $$
DECLARE r reuniones; v_rol rol_membresia;
BEGIN
  v_rol := fn_exigir_no_invitado(p_actor, p_equipo, 'Los invitados no pueden crear reuniones.');
  PERFORM fn_exigir_equipo_activo(p_equipo);
  SELECT * INTO r FROM reuniones WHERE id = p_reunion AND equipo_id = p_equipo FOR UPDATE;
  IF r.id IS NULL OR r.cancelada_en IS NOT NULL THEN
    RAISE EXCEPTION 'No encontramos esa reunión.' USING ERRCODE = 'NX006', HINT = 'reunion_no_encontrada';
  END IF;
  IF v_rol <> 'lider' AND r.creada_por IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'Solo quien creó la reunión o el líder pueden cambiarla.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN r;
END $$ LANGUAGE plpgsql;

/** Plantilla con sus elementos. */
CREATE OR REPLACE FUNCTION fn_plantilla_json(p plantillas) RETURNS jsonb AS $$
  SELECT jsonb_build_object('id', p.id, 'nombre', p.nombre, 'tipo', p.tipo, 'descripcion', p.descripcion,
    'creada_en', fn_iso(p.creada_en),
    'elementos', (SELECT coalesce(jsonb_agg(e.texto ORDER BY e.orden), '[]'::jsonb)
                    FROM plantilla_elementos e WHERE e.plantilla_id = p.id));
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 3. Calendario y reuniones (EQ-14, EQ-15)
-- ---------------------------------------------------------------------------------------------

/** EQ-14: reuniones (cada ocurrencia) y entregas de tareas entre dos fechas (máx. 62 días). */
CREATE OR REPLACE FUNCTION proc_calendario_equipo(p_actor_id uuid, p_equipo_id uuid, p_desde timestamptz, p_hasta timestamptz)
RETURNS jsonb AS $$
DECLARE v_zona text;
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no ven el calendario completo.');
  IF p_hasta <= p_desde OR p_hasta - p_desde > interval '62 days' THEN
    RAISE EXCEPTION 'El rango del calendario va de 1 a 62 días.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT zona_horaria INTO v_zona FROM equipos WHERE id = p_equipo_id;
  RETURN jsonb_build_object(
    'reuniones', (SELECT coalesce(jsonb_agg(fn_reunion_json(r, p_actor_id, o.x) ORDER BY o.x), '[]'::jsonb)
                    FROM reuniones r CROSS JOIN LATERAL fn_reunion_ocurrencias(r, p_desde, p_hasta, v_zona) AS o(x)
                   WHERE r.equipo_id = p_equipo_id AND r.cancelada_en IS NULL),
    'entregas', (SELECT coalesce(jsonb_agg(fn_tarea_equipo_json(t.id) ORDER BY t.vence_en, t.codigo), '[]'::jsonb)
                   FROM tareas t
                  WHERE t.equipo_id = p_equipo_id AND NOT t.archivada AND t.vence_en >= p_desde AND t.vence_en < p_hasta
                    AND t.estado NOT IN ('propuesta', 'rechazada', 'cancelada')));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * EQ-15: crear una reunión (líder o integrante). Invita a todo el equipo (sin invitados): quien la
 * crea queda con «sí» y los demás reciben un aviso.
 */
CREATE OR REPLACE FUNCTION proc_reunion_crear(p_actor_id uuid, p_equipo_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE r reuniones;
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no pueden crear reuniones.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  BEGIN
    INSERT INTO reuniones (equipo_id, titulo, inicio, duracion_min, repeticion, lugar, descripcion,
                           recordatorio_min, avisar_wa, creada_por)
    VALUES (p_equipo_id, btrim(p_datos->>'titulo'), (p_datos->>'inicio')::timestamptz,
            coalesce((p_datos->>'duracion_min')::smallint, 30),
            coalesce(p_datos->>'repeticion', 'ninguna')::repeticion_reunion,
            coalesce(p_datos->>'lugar', ''), coalesce(p_datos->>'descripcion', ''),
            coalesce((p_datos->>'recordatorio_min')::smallint, 15),
            coalesce((p_datos->>'avisar_wa')::boolean, false), p_actor_id)
    RETURNING * INTO r;
  EXCEPTION WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Revisa el título (1 a 120 caracteres), la fecha y la duración (5 a 720 min).'
      USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  INSERT INTO reunion_asistencia (reunion_id, usuario_id, respuesta)
  SELECT r.id, m.usuario_id, CASE WHEN m.usuario_id = p_actor_id THEN 'si' ELSE 'pendiente' END::respuesta_asistencia
    FROM membresias m WHERE m.equipo_id = p_equipo_id AND m.estado = 'activa' AND m.rol <> 'invitado';
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'reunion.creada', 'reunion', r.id,
    jsonb_build_object('inicio', r.inicio, 'repeticion', r.repeticion),
    fn_primer_nombre(p_actor_id) || ' agendó «' || r.titulo || '»');
  PERFORM fn_notificar(m.usuario_id, p_equipo_id, 'Reunión: ' || r.titulo,
           fn_primer_nombre(p_actor_id) || ' te invitó a una reunión.',
           '/app/e/' || p_equipo_id || '/calendario', 'ver_reunion', r.id::text)
     FROM membresias m
    WHERE m.equipo_id = p_equipo_id AND m.estado = 'activa' AND m.rol <> 'invitado' AND m.usuario_id <> p_actor_id;
  RETURN fn_reunion_json(r, p_actor_id, r.inicio);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Cambiar una reunión: quien la creó o el líder. `p_cambios` lleva solo lo que cambia. */
CREATE OR REPLACE FUNCTION proc_reunion_editar(p_actor_id uuid, p_equipo_id uuid, p_reunion_id uuid, p_cambios jsonb)
RETURNS jsonb AS $$
DECLARE r reuniones;
BEGIN
  r := fn_reunion_editable(p_actor_id, p_equipo_id, p_reunion_id);
  BEGIN
    UPDATE reuniones SET
      titulo           = coalesce(btrim(p_cambios->>'titulo'), titulo),
      inicio           = coalesce((p_cambios->>'inicio')::timestamptz, inicio),
      duracion_min     = coalesce((p_cambios->>'duracion_min')::smallint, duracion_min),
      repeticion       = coalesce((p_cambios->>'repeticion')::repeticion_reunion, repeticion),
      lugar            = coalesce(p_cambios->>'lugar', lugar),
      descripcion      = coalesce(p_cambios->>'descripcion', descripcion),
      recordatorio_min = coalesce((p_cambios->>'recordatorio_min')::smallint, recordatorio_min),
      avisar_wa        = coalesce((p_cambios->>'avisar_wa')::boolean, avisar_wa)
     WHERE id = r.id RETURNING * INTO r;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Revisa el título (1 a 120 caracteres) y la duración (5 a 720 min).'
      USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'reunion.editada', 'reunion', r.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' cambió la reunión «' || r.titulo || '»');
  RETURN fn_reunion_json(r, p_actor_id, r.inicio);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Cancelar una reunión (toda la serie): quien la creó o el líder. Avisa a quienes iban a ir. */
CREATE OR REPLACE FUNCTION proc_reunion_cancelar(p_actor_id uuid, p_equipo_id uuid, p_reunion_id uuid) RETURNS jsonb AS $$
DECLARE r reuniones;
BEGIN
  r := fn_reunion_editable(p_actor_id, p_equipo_id, p_reunion_id);
  UPDATE reuniones SET cancelada_en = now() WHERE id = r.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'reunion.cancelada', 'reunion', r.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' canceló la reunión «' || r.titulo || '»');
  PERFORM fn_notificar(a.usuario_id, p_equipo_id, 'Se canceló: ' || r.titulo, '', '/app/e/' || p_equipo_id || '/calendario')
     FROM reunion_asistencia a
    WHERE a.reunion_id = r.id AND a.usuario_id <> p_actor_id AND a.respuesta IN ('si', 'quiza', 'pendiente');
  RETURN jsonb_build_object('cancelada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Responder la asistencia a una reunión: `si`, `no` o `quiza`. */
CREATE OR REPLACE FUNCTION proc_reunion_responder(p_actor_id uuid, p_equipo_id uuid, p_reunion_id uuid, p_respuesta text)
RETURNS jsonb AS $$
DECLARE r reuniones;
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no ven el calendario completo.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  SELECT * INTO r FROM reuniones WHERE id = p_reunion_id AND equipo_id = p_equipo_id AND cancelada_en IS NULL;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa reunión.' USING ERRCODE = 'NX006', HINT = 'reunion_no_encontrada';
  END IF;
  IF p_respuesta NOT IN ('si', 'no', 'quiza') THEN
    RAISE EXCEPTION 'Responde sí, no o quizá.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO reunion_asistencia (reunion_id, usuario_id, respuesta)
  VALUES (r.id, p_actor_id, p_respuesta::respuesta_asistencia)
  ON CONFLICT (reunion_id, usuario_id) DO UPDATE SET respuesta = EXCLUDED.respuesta;
  RETURN fn_reunion_json(r, p_actor_id, r.inicio);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Actividad (EQ-18) y notificaciones (NT-01)
-- ---------------------------------------------------------------------------------------------

/** EQ-18: registro de actividad del equipo, del más reciente al más antiguo, por páginas. */
CREATE OR REPLACE FUNCTION proc_actividad_listar(
  p_actor_id uuid, p_equipo_id uuid, p_tipo text DEFAULT NULL, p_antes timestamptz DEFAULT NULL, p_limite int DEFAULT 50
) RETURNS jsonb AS $$
DECLARE v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100); v_items jsonb;
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no ven el registro de actividad.');
  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('tarea', 'sprint', 'reunion', 'equipo') THEN
    RAISE EXCEPTION 'El tipo de actividad no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.creado_en DESC), '[]'::jsonb) INTO v_items FROM (
    SELECT a.creado_en, jsonb_build_object(
             'id', a.id, 'tipo', a.tipo, 'accion', a.accion, 'resumen', a.resumen,
             'objeto_tipo', a.objeto_tipo, 'objeto_id', a.objeto_id, 'creado_en', fn_iso(a.creado_en),
             'autor', CASE WHEN a.autor_id IS NOT NULL THEN fn_persona_json(p_equipo_id, a.autor_id) END) AS j
      FROM actividad a
     WHERE a.equipo_id = p_equipo_id AND (p_tipo IS NULL OR a.tipo = p_tipo)
       AND (p_antes IS NULL OR a.creado_en < p_antes)
     ORDER BY a.creado_en DESC LIMIT v_limite + 1) x;
  RETURN jsonb_build_object(
    'items', (SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb)
                FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(e, ord) WHERE ord <= v_limite),
    'hay_mas', jsonb_array_length(v_items) > v_limite);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** NT-01: las notificaciones de la persona (no de un equipo), las más recientes primero. */
CREATE OR REPLACE FUNCTION proc_notificacion_listar(p_actor_id uuid, p_solo_no_leidas boolean DEFAULT false, p_limite int DEFAULT 50)
RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'no_leidas', (SELECT count(*) FROM notificaciones WHERE usuario_id = p_actor_id AND leida_en IS NULL),
    'items', (SELECT coalesce(jsonb_agg(x.j ORDER BY x.creada_en DESC), '[]'::jsonb) FROM (
      SELECT n.creada_en, jsonb_build_object(
               'id', n.id, 'equipo_id', n.equipo_id, 'equipo', e.nombre, 'categoria', n.categoria,
               'icono', n.icono, 'titulo', n.titulo, 'texto', n.texto, 'enlace', n.enlace,
               'accion_tipo', n.accion_tipo, 'accion_ref', n.accion_ref,
               'creada_en', fn_iso(n.creada_en), 'leida_en', fn_iso(n.leida_en)) AS j
        FROM notificaciones n LEFT JOIN equipos e ON e.id = n.equipo_id
       WHERE n.usuario_id = p_actor_id AND (NOT coalesce(p_solo_no_leidas, false) OR n.leida_en IS NULL)
       ORDER BY n.creada_en DESC LIMIT least(greatest(coalesce(p_limite, 50), 1), 100)) x));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** NT-01: marca como leída una notificación propia, o todas si `p_id` es nulo. */
CREATE OR REPLACE FUNCTION proc_notificacion_marcar(p_actor_id uuid, p_id uuid DEFAULT NULL) RETURNS jsonb AS $$
BEGIN
  IF p_id IS NULL THEN
    UPDATE notificaciones SET leida_en = now() WHERE usuario_id = p_actor_id AND leida_en IS NULL;
  ELSE
    UPDATE notificaciones SET leida_en = coalesce(leida_en, now()) WHERE id = p_id AND usuario_id = p_actor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No encontramos esa notificación.' USING ERRCODE = 'NX006', HINT = 'notificacion_no_encontrada';
    END IF;
  END IF;
  RETURN jsonb_build_object('no_leidas',
    (SELECT count(*) FROM notificaciones WHERE usuario_id = p_actor_id AND leida_en IS NULL));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 5. Reportes (EQ-16, EQ-17)
-- ---------------------------------------------------------------------------------------------

/** EQ-16: resumen del trabajo del equipo (estados, cumplimiento, personas y sprints). */
CREATE OR REPLACE FUNCTION proc_reporte_equipo(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no tienen acceso a reportes.');
  RETURN jsonb_build_object(
    'generado_en', fn_iso(now()),
    'por_estado', (SELECT coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) FROM (
        SELECT t.estado::text AS estado, count(*) AS n FROM tareas t
         WHERE t.equipo_id = p_equipo_id AND NOT t.archivada GROUP BY t.estado) x),
    'completadas', (SELECT count(*) FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada AND estado = 'completada'),
    'a_tiempo', (SELECT count(*) FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada AND resultado = 'a_tiempo'),
    'con_retraso', (SELECT count(*) FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada AND resultado = 'con_retraso'),
    'vencidas', (SELECT count(*) FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada AND vence_en < now()
                    AND estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada')),
    'por_persona', (SELECT coalesce(jsonb_agg(fn_persona_json(p_equipo_id, m.usuario_id) || jsonb_build_object(
                       'abiertas', (SELECT count(*) FROM tareas t WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
                                     AND t.responsable_id = m.usuario_id AND t.estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada')),
                       'completadas', (SELECT count(*) FROM tareas t WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
                                     AND t.responsable_id = m.usuario_id AND t.estado = 'completada'),
                       'a_tiempo', (SELECT count(*) FROM tareas t WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
                                     AND t.responsable_id = m.usuario_id AND t.resultado = 'a_tiempo'))
                       ORDER BY m.color_idx), '[]'::jsonb)
                      FROM membresias m WHERE m.equipo_id = p_equipo_id AND m.estado = 'activa' AND m.rol <> 'invitado'),
    'sprints', (SELECT coalesce(jsonb_agg(jsonb_build_object('numero', s.numero, 'estado', s.estado)
                    || fn_sprint_conteo(s.id, s.estado) ORDER BY s.numero), '[]'::jsonb)
                  FROM (SELECT * FROM sprints WHERE equipo_id = p_equipo_id AND estado <> 'planificado'
                         ORDER BY numero DESC LIMIT 6) s));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * EQ-17: filas para exportar (la API arma el CSV). El líder exporta todo o lo suyo; un
 * integrante solo lo suyo (`exportar_reportes` es «propio» para él).
 */
CREATE OR REPLACE FUNCTION proc_reporte_exportar(p_actor_id uuid, p_equipo_id uuid, p_solo_mias boolean) RETURNS jsonb AS $$
DECLARE v_rol rol_membresia;
BEGIN
  v_rol := fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no tienen acceso a reportes.');
  IF v_rol = 'integrante' AND NOT coalesce(p_solo_mias, false) THEN
    RAISE EXCEPTION 'Como integrante solo puedes exportar tus propios datos.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'codigo', fn_codigo_tarea(t.codigo), 'titulo', t.titulo, 'estado', fn_nombre_estado(t.estado),
            'prioridad', t.prioridad, 'responsable', u.nombre, 'sprint', s.numero, 'progreso', t.progreso,
            'vence_en', fn_iso(t.vence_en), 'completada_en', fn_iso(t.completada_en), 'resultado', t.resultado,
            'creado_en', fn_iso(t.creado_en)) ORDER BY t.codigo), '[]'::jsonb)
            FROM tareas t
            LEFT JOIN usuarios u ON u.id = t.responsable_id
            LEFT JOIN sprints s ON s.id = t.sprint_id
           WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
             AND (NOT coalesce(p_solo_mias, false) OR t.responsable_id = p_actor_id));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 6. Plantillas (EQ-20)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION proc_plantilla_listar(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no usan plantillas.');
  RETURN (SELECT coalesce(jsonb_agg(fn_plantilla_json(p) ORDER BY p.tipo, p.nombre), '[]'::jsonb)
            FROM plantillas p WHERE p.equipo_id = p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder crea una plantilla de sprint, proyecto o retrospectiva con su lista de elementos. */
CREATE OR REPLACE FUNCTION proc_plantilla_crear(p_actor_id uuid, p_equipo_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE p plantillas; v_txt text; i int := 0;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder crea plantillas del equipo.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  IF coalesce(jsonb_array_length(p_datos->'elementos'), 0) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Una plantilla lleva de 1 a 30 elementos.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    INSERT INTO plantillas (equipo_id, nombre, tipo, descripcion)
    VALUES (p_equipo_id, btrim(p_datos->>'nombre'), (p_datos->>'tipo')::tipo_plantilla, coalesce(p_datos->>'descripcion', ''))
    RETURNING * INTO p;
  EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation THEN
    RAISE EXCEPTION 'Revisa el nombre (1 a 80 caracteres) y el tipo de la plantilla.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  FOR v_txt IN SELECT btrim(x) FROM jsonb_array_elements_text(p_datos->'elementos') x LOOP
    IF char_length(v_txt) NOT BETWEEN 1 AND 140 THEN
      RAISE EXCEPTION 'Cada elemento lleva de 1 a 140 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
    END IF;
    i := i + 1;
    INSERT INTO plantilla_elementos (plantilla_id, orden, texto) VALUES (p.id, i, v_txt);
  END LOOP;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.plantilla_creada', 'plantilla', p.id,
    jsonb_build_object('tipo', p.tipo), fn_primer_nombre(p_actor_id) || ' creó la plantilla «' || p.nombre || '»');
  RETURN fn_plantilla_json(p);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_plantilla_eliminar(p_actor_id uuid, p_equipo_id uuid, p_plantilla_id uuid) RETURNS jsonb AS $$
DECLARE p plantillas;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder crea plantillas del equipo.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  DELETE FROM plantillas WHERE id = p_plantilla_id AND equipo_id = p_equipo_id RETURNING * INTO p;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa plantilla.' USING ERRCODE = 'NX006', HINT = 'plantilla_no_encontrada';
  END IF;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.plantilla_eliminada', 'plantilla', p.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' eliminó la plantilla «' || p.nombre || '»');
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Usar una plantilla de proyecto: cada elemento se propone como tarea (van a votación, DEC-024),
 * por eso solo la usa el líder. Las de sprint y retrospectiva son guías de lectura.
 */
CREATE OR REPLACE FUNCTION proc_plantilla_usar(p_actor_id uuid, p_equipo_id uuid, p_plantilla_id uuid) RETURNS jsonb AS $$
DECLARE p plantillas; e record; t tareas; n int := 0;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder propone tareas.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  SELECT * INTO p FROM plantillas WHERE id = p_plantilla_id AND equipo_id = p_equipo_id;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa plantilla.' USING ERRCODE = 'NX006', HINT = 'plantilla_no_encontrada';
  END IF;
  IF p.tipo <> 'proyecto' THEN
    RAISE EXCEPTION 'Solo las plantillas de proyecto crean tareas; las demás son guías.' USING ERRCODE = 'NX007', HINT = 'plantilla_guia';
  END IF;
  FOR e IN SELECT texto FROM plantilla_elementos WHERE plantilla_id = p.id ORDER BY orden LOOP
    t := fn_tarea_insertar_propuesta(p_actor_id, p_equipo_id,
           jsonb_build_object('titulo', e.texto, 'descripcion', 'De la plantilla «' || p.nombre || '».'));
    n := n + 1;
  END LOOP;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.propuestas_de_plantilla', 'plantilla', p.id,
    jsonb_build_object('tareas', n), fn_primer_nombre(p_actor_id) || ' propuso ' || n || ' tareas de la plantilla «' || p.nombre || '»');
  RETURN jsonb_build_object('creadas', n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_plantilla_usar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_plantilla_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_plantilla_crear(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_plantilla_listar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_reporte_exportar(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_reporte_equipo(uuid, uuid);
DROP FUNCTION IF EXISTS proc_notificacion_marcar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_notificacion_listar(uuid, boolean, int);
DROP FUNCTION IF EXISTS proc_actividad_listar(uuid, uuid, text, timestamptz, int);
DROP FUNCTION IF EXISTS proc_reunion_responder(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_reunion_cancelar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_reunion_editar(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_reunion_crear(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_calendario_equipo(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS fn_plantilla_json(plantillas);
DROP FUNCTION IF EXISTS fn_reunion_editable(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS fn_reunion_json(reuniones, uuid, timestamptz);
DROP FUNCTION IF EXISTS fn_reunion_ocurrencias(reuniones, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS fn_exigir_no_invitado(uuid, uuid, text);
-- fn_registrar_evento vuelve a la versión de la 0009 (solo tarea y sprint tienen tipo propio).
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
  VALUES (p_equipo, p_actor, CASE WHEN v_categoria IN ('tarea', 'sprint') THEN v_categoria ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb), v_ahora);
END $$ LANGUAGE plpgsql;
