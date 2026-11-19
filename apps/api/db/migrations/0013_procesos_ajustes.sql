-- Fase 3.6 · Ajustes de la persona (PF-04 notificaciones y PF-06 privacidad) y Fase 3.7 · reporte
-- personal (FALT-01), DEC-034.
-- Perfil (PF-01) y apariencia (PF-03) ya tienen sus procesos en la 0004. Aquí: qué avisos quiere
-- recibir y por qué canal (`preferencias_notificacion`), horas de silencio, resumen diario,
-- primer día de la semana y si su estado se ve (`preferencias_usuario`).
-- Documentación: docs/08_Procesos_BD.md.

-- Up Migration

/** Eventos que la persona puede configurar, en el orden en que se muestran. */
CREATE OR REPLACE FUNCTION fn_eventos_notificacion() RETURNS text[] AS $$
  SELECT ARRAY['tarea_asignada', 'propuesta_nueva', 'votacion_resuelta', 'reunion', 'liderazgo', 'sprint', 'mencion'];
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_ajustes_json(p_usuario uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'silencio_desde', to_char(p.silencio_desde, 'HH24:MI'), 'silencio_hasta', to_char(p.silencio_hasta, 'HH24:MI'),
    'resumen_diario', p.resumen_diario, 'estado_visible', p.estado_visible, 'primer_dia', p.primer_dia,
    'notificaciones', (SELECT jsonb_agg(jsonb_build_object(
        'evento', ev, 'por_app', coalesce(n.por_app, true),
        'por_whatsapp', coalesce(n.por_whatsapp, false), 'por_correo', coalesce(n.por_correo, false)) ORDER BY o)
        FROM unnest(fn_eventos_notificacion()) WITH ORDINALITY AS x(ev, o)
        LEFT JOIN preferencias_notificacion n ON n.usuario_id = p_usuario AND n.evento = x.ev))
    FROM preferencias_usuario p WHERE p.usuario_id = p_usuario;
$$ LANGUAGE sql STABLE;

/** PF-04 y PF-06: ajustes de avisos y privacidad de la persona (con los valores por defecto). */
CREATE OR REPLACE FUNCTION proc_usuario_ajustes(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_preferencias_json(p_actor_id);   -- asegura que exista la fila de preferencias
  RETURN fn_ajustes_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Guarda los ajustes. `p_cambios` lleva solo lo que cambia: `silencio_desde` y `silencio_hasta`
 * («HH:MM» o null, juntos), `resumen_diario`, `estado_visible`, `primer_dia` y `notificaciones`
 * (lista de `{ evento, por_app, por_whatsapp, por_correo }`).
 */
CREATE OR REPLACE FUNCTION proc_usuario_ajustes_guardar(p_actor_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
DECLARE n jsonb;
BEGIN
  PERFORM fn_preferencias_json(p_actor_id);
  IF (p_cambios ? 'silencio_desde') <> (p_cambios ? 'silencio_hasta')
     OR ((p_cambios->>'silencio_desde') IS NULL) <> ((p_cambios->>'silencio_hasta') IS NULL) THEN
    RAISE EXCEPTION 'Indica el inicio y el fin de las horas de silencio.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    UPDATE preferencias_usuario SET
      silencio_desde = CASE WHEN p_cambios ? 'silencio_desde' THEN (p_cambios->>'silencio_desde')::time ELSE silencio_desde END,
      silencio_hasta = CASE WHEN p_cambios ? 'silencio_hasta' THEN (p_cambios->>'silencio_hasta')::time ELSE silencio_hasta END,
      resumen_diario = coalesce((p_cambios->>'resumen_diario')::boolean, resumen_diario),
      estado_visible = coalesce((p_cambios->>'estado_visible')::boolean, estado_visible),
      primer_dia     = coalesce(p_cambios->>'primer_dia', primer_dia)
     WHERE usuario_id = p_actor_id;
  EXCEPTION WHEN check_violation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Algún ajuste no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  FOR n IN SELECT * FROM jsonb_array_elements(coalesce(p_cambios->'notificaciones', '[]'::jsonb)) LOOP
    IF NOT (n->>'evento' = ANY (fn_eventos_notificacion())) THEN
      RAISE EXCEPTION 'El tipo de aviso no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
    END IF;
    INSERT INTO preferencias_notificacion (usuario_id, evento, por_app, por_whatsapp, por_correo)
    VALUES (p_actor_id, n->>'evento', coalesce((n->>'por_app')::boolean, true),
            coalesce((n->>'por_whatsapp')::boolean, false), coalesce((n->>'por_correo')::boolean, false))
    ON CONFLICT (usuario_id, evento) DO UPDATE
      SET por_app = EXCLUDED.por_app, por_whatsapp = EXCLUDED.por_whatsapp, por_correo = EXCLUDED.por_correo;
  END LOOP;
  RETURN fn_ajustes_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * FALT-01: reporte personal. Tus tareas personales y las de equipo que tienes a cargo (de los
 * equipos donde sigues activo): estados, cumplimiento y vencidas, y un resumen por equipo.
 */
CREATE OR REPLACE FUNCTION proc_reporte_personal(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  RETURN (WITH mias AS (
    SELECT t.* FROM tareas t
     WHERE NOT t.archivada AND (t.dueno_id = p_actor_id OR (t.responsable_id = p_actor_id AND EXISTS (
             SELECT 1 FROM membresias m WHERE m.equipo_id = t.equipo_id AND m.usuario_id = p_actor_id AND m.estado = 'activa'))))
  SELECT jsonb_build_object(
    'generado_en', fn_iso(now()),
    'por_estado', (SELECT coalesce(jsonb_object_agg(x.estado, x.n), '{}'::jsonb)
                     FROM (SELECT estado::text AS estado, count(*) AS n FROM mias GROUP BY estado) x),
    'completadas', (SELECT count(*) FROM mias WHERE estado = 'completada'),
    'a_tiempo', (SELECT count(*) FROM mias WHERE resultado = 'a_tiempo'),
    'con_retraso', (SELECT count(*) FROM mias WHERE resultado = 'con_retraso'),
    'vencidas', (SELECT count(*) FROM mias WHERE vence_en < now() AND estado NOT IN ('completada', 'rechazada', 'cancelada', 'propuesta')),
    'por_espacio', (SELECT coalesce(jsonb_agg(jsonb_build_object('equipo_id', x.equipo_id, 'nombre', x.nombre,
                       'abiertas', x.abiertas, 'completadas', x.completadas) ORDER BY x.equipo_id IS NOT NULL, x.nombre), '[]'::jsonb)
                      FROM (SELECT m.equipo_id, coalesce(e.nombre, 'Espacio personal') AS nombre,
                                   count(*) FILTER (WHERE m.estado NOT IN ('completada', 'rechazada', 'cancelada', 'propuesta')) AS abiertas,
                                   count(*) FILTER (WHERE m.estado = 'completada') AS completadas
                              FROM mias m LEFT JOIN equipos e ON e.id = m.equipo_id
                             GROUP BY m.equipo_id, e.nombre) x)));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_reporte_personal(uuid);
DROP FUNCTION IF EXISTS proc_usuario_ajustes_guardar(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_usuario_ajustes(uuid);
DROP FUNCTION IF EXISTS fn_ajustes_json(uuid);
DROP FUNCTION IF EXISTS fn_eventos_notificacion();
