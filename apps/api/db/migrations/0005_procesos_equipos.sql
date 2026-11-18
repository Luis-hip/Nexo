-- Fase 2.5 · Procesos de la BD (DEC-025): equipos, miembros e invitaciones.
-- Sustituyen al SQL de equipos/contexto.ts y servicios/equipos.ts. Documentación: docs/08.
--   NX011 ya no disponible (410): invitación caducada, usada o revocada.
--   NX012 conflicto que no es de versión (409): ya es miembro.
--   NX001 equipo lleno (409): lo lanza el disparador de 0001; el proceso le agrega el detalle.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_miembros_json(p_equipo uuid) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'membresia_id', m.id, 'usuario_id', m.usuario_id, 'nombre', u.nombre, 'rol', m.rol,
           'color_idx', m.color_idx, 'caduca_en', fn_iso(m.caduca_en))
           ORDER BY CASE m.rol WHEN 'lider' THEN 0 WHEN 'integrante' THEN 1 ELSE 2 END,
                    m.color_idx, u.nombre), '[]'::jsonb)
    FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
   WHERE m.equipo_id = p_equipo AND m.estado = 'activa';
$$ LANGUAGE sql STABLE;

/** Invitación tal como la devuelve la API: una pendiente cuyo plazo pasó se muestra «caducada». */
CREATE OR REPLACE FUNCTION fn_invitacion_json(i invitaciones) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', i.id, 'codigo', i.codigo,
    'rol_destino', CASE WHEN i.rol_destino = 'invitado' THEN 'invitado' ELSE 'integrante' END,
    'estado', CASE WHEN i.estado = 'pendiente' AND i.caduca_en < now() THEN 'caducada' ELSE i.estado::text END,
    'caduca_en', fn_iso(i.caduca_en), 'duracion_invitado_dias', i.duracion_invitado_dias,
    'creada_en', fn_iso(i.creada_en), 'aceptada_por', i.aceptada_por);
$$ LANGUAGE sql STABLE;

/**
 * Código de invitación con el formato del prototipo (`NX4-821Q`) y un alfabeto sin 0/O ni 1/I/L,
 * para poder dictarlo (DEC-019). Sale de bytes aleatorios de `gen_random_uuid()`.
 */
CREATE OR REPLACE FUNCTION fn_codigo_invitacion() RETURNS text AS $$
DECLARE
  a constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  r text := '';
BEGIN
  FOR i IN 0..4 LOOP
    r := r || substr(a, get_byte(b, i) % length(a) + 1, 1);
  END LOOP;
  RETURN 'NX' || left(r, 1) || '-' || right(r, 4);
END $$ LANGUAGE plpgsql VOLATILE;

/** Busca una invitación utilizable por su código (ya normalizado) o explica por qué no sirve. */
CREATE OR REPLACE FUNCTION fn_invitacion_vigente(p_codigo text, p_bloquear boolean) RETURNS invitaciones AS $$
DECLARE i invitaciones; v_estado_equipo estado_equipo;
BEGIN
  IF p_bloquear THEN
    SELECT * INTO i FROM invitaciones WHERE codigo = p_codigo FOR UPDATE;
  ELSE
    SELECT * INTO i FROM invitaciones WHERE codigo = p_codigo;
  END IF;
  SELECT estado INTO v_estado_equipo FROM equipos WHERE id = i.equipo_id;
  IF i.id IS NULL OR v_estado_equipo IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'No encontramos una invitación con ese código. Revisa que esté bien escrito.'
      USING ERRCODE = 'NX006', HINT = 'invitacion_no_existe';
  END IF;
  IF i.estado = 'aceptada' THEN
    RAISE EXCEPTION 'Esta invitación ya se usó. Pide una nueva al líder del equipo.'
      USING ERRCODE = 'NX011', HINT = 'invitacion_usada';
  END IF;
  IF i.estado = 'revocada' THEN
    RAISE EXCEPTION 'El líder canceló esta invitación. Pídele una nueva.'
      USING ERRCODE = 'NX011', HINT = 'invitacion_revocada';
  END IF;
  IF i.estado = 'caducada' OR i.caduca_en < now() THEN
    RAISE EXCEPTION 'Esta invitación caducó. Pide una nueva al líder del equipo.'
      USING ERRCODE = 'NX011', HINT = 'invitacion_caducada';
  END IF;
  RETURN i;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- Equipos
-- ---------------------------------------------------------------------------------------------

/**
 * Membresía activa del actor en el equipo de la ruta (DEC-018). Quien no pertenece recibe
 * NX006 (404), como si el equipo no existiera; un invitado caducado, NX005 (403).
 */
CREATE OR REPLACE FUNCTION proc_equipo_contexto(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  RETURN (SELECT jsonb_build_object(
            'membresia_id', v_membresia, 'rol', v_rol,
            'equipo', jsonb_build_object('nombre', e.nombre, 'estado', e.estado, 'max_miembros', e.max_miembros))
            FROM equipos e WHERE e.id = p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** PER-06: crea el equipo; quien lo crea es su líder (color 0) y se crean los dos canales fijos. */
CREATE OR REPLACE FUNCTION proc_equipo_crear(p_actor_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE v_id uuid; v_nombre text := p_datos->>'nombre';
BEGIN
  INSERT INTO equipos (nombre, descripcion, duracion_sprint_semanas, max_miembros, creado_por)
  VALUES (v_nombre, coalesce(p_datos->>'descripcion', ''),
          coalesce((p_datos->>'duracion_sprint_semanas')::smallint, 2),
          coalesce((p_datos->>'max_miembros')::smallint, 8), p_actor_id)
  RETURNING id INTO v_id;
  INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx) VALUES (v_id, p_actor_id, 'lider', 0);
  INSERT INTO conversaciones (equipo_id, tipo, nombre)
  VALUES (v_id, 'equipo', v_nombre), (v_id, 'invitados', 'Invitados');
  PERFORM fn_registrar_evento(v_id, p_actor_id, 'equipo.creado', 'equipo', v_id, '{}'::jsonb,
    (SELECT nombre FROM usuarios WHERE id = p_actor_id) || ' creó el equipo «' || v_nombre || '»');
  RETURN jsonb_build_object('id', v_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Datos del equipo según el perfil: un invitado no recibe miembros, sprints ni etiquetas. */
CREATE OR REPLACE FUNCTION proc_equipo_obtener(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia; v_invitado boolean;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  v_invitado := v_rol = 'invitado';
  RETURN (
    SELECT jsonb_build_object(
      'id', e.id, 'nombre', e.nombre, 'descripcion', e.descripcion, 'estado', e.estado,
      'max_miembros', e.max_miembros,
      'miembros_activos', coalesce(c.miembros_activos, 0),
      'invitados_activos', coalesce(c.invitados_activos, 0),
      'mi_rol', v_rol, 'mi_membresia_id', v_membresia,
      'lider', (SELECT jsonb_build_object('usuario_id', m.usuario_id, 'nombre', u.nombre)
                  FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
                 WHERE m.equipo_id = e.id AND m.rol = 'lider' AND m.estado = 'activa'),
      'miembros', CASE WHEN v_invitado THEN '[]'::jsonb ELSE fn_miembros_json(e.id) END,
      'sprints', CASE WHEN v_invitado THEN '[]'::jsonb ELSE
        (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', s.id, 'numero', s.numero, 'estado', s.estado,
                  'inicio', to_char(s.inicio, 'YYYY-MM-DD'), 'fin', to_char(s.fin, 'YYYY-MM-DD'))
                  ORDER BY s.numero), '[]'::jsonb)
           FROM sprints s WHERE s.equipo_id = e.id AND s.estado <> 'cerrado') END,
      'etiquetas', CASE WHEN v_invitado THEN '[]'::jsonb ELSE
        (SELECT coalesce(jsonb_agg(t.nombre ORDER BY t.nombre), '[]'::jsonb)
           FROM etiquetas t WHERE t.equipo_id = e.id) END)
      FROM equipos e LEFT JOIN v_equipo_cupo c ON c.equipo_id = e.id
     WHERE e.id = p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Miembros activos del equipo (líder primero). Los invitados no ven la lista. */
CREATE OR REPLACE FUNCTION proc_equipo_miembros(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven la lista completa de miembros.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN fn_miembros_json(p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- Invitaciones
-- ---------------------------------------------------------------------------------------------

/** AD-02 / AD-03: el líder genera un código de un solo uso para un integrante o un invitado. */
CREATE OR REPLACE FUNCTION proc_invitacion_crear(p_actor_id uuid, p_equipo_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE
  i        invitaciones;
  v_rol    rol_membresia := (p_datos->>'rol_destino')::rol_membresia;
  v_codigo text;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede invitar personas.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  LOOP
    v_codigo := fn_codigo_invitacion();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invitaciones WHERE codigo = v_codigo);
  END LOOP;
  INSERT INTO invitaciones (equipo_id, codigo, rol_destino, caduca_en, duracion_invitado_dias, creada_por)
  VALUES (p_equipo_id, v_codigo, v_rol,
          now() + make_interval(days => coalesce((p_datos->>'dias_validez')::int, 7)),
          CASE WHEN v_rol = 'invitado' THEN (p_datos->>'duracion_invitado_dias')::smallint END,
          p_actor_id)
  RETURNING * INTO i;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'invitacion.creada', 'invitacion', i.id,
    jsonb_build_object('rol_destino', v_rol),
    (SELECT nombre FROM usuarios WHERE id = p_actor_id) || ' creó una invitación de ' || v_rol);
  RETURN fn_invitacion_json(i);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Invitaciones del equipo, de la más reciente a la más antigua (solo el líder). */
CREATE OR REPLACE FUNCTION proc_invitacion_listar(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede invitar personas.');
  RETURN (SELECT coalesce(jsonb_agg(fn_invitacion_json(i) ORDER BY i.creada_en DESC), '[]'::jsonb)
            FROM invitaciones i WHERE i.equipo_id = p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder revoca una invitación que sigue pendiente. */
CREATE OR REPLACE FUNCTION proc_invitacion_revocar(p_actor_id uuid, p_equipo_id uuid, p_invitacion_id uuid)
RETURNS jsonb AS $$
DECLARE i invitaciones;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede invitar personas.');
  UPDATE invitaciones SET estado = 'revocada'
   WHERE id = p_invitacion_id AND equipo_id = p_equipo_id AND estado = 'pendiente'
  RETURNING * INTO i;
  IF i.id IS NULL THEN
    RAISE EXCEPTION 'No hay una invitación pendiente con ese código.'
      USING ERRCODE = 'NX006', HINT = 'invitacion_no_encontrada';
  END IF;
  RETURN fn_invitacion_json(i);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** PER-07 / AUTH-08: vista previa de una invitación antes de unirse. No exige pertenecer al equipo. */
CREATE OR REPLACE FUNCTION proc_invitacion_ver(p_actor_id uuid, p_codigo text) RETURNS jsonb AS $$
DECLARE i invitaciones;
BEGIN
  i := fn_invitacion_vigente(p_codigo, false);
  RETURN (
    SELECT jsonb_build_object(
      'codigo', i.codigo,
      'equipo', jsonb_build_object('id', e.id, 'nombre', e.nombre, 'descripcion', e.descripcion),
      'lider', (SELECT u.nombre FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
                 WHERE m.equipo_id = e.id AND m.rol = 'lider' AND m.estado = 'activa'),
      'miembros_activos', coalesce((SELECT c.miembros_activos FROM v_equipo_cupo c WHERE c.equipo_id = e.id), 0),
      'max_miembros', e.max_miembros,
      'rol_destino', CASE WHEN i.rol_destino = 'invitado' THEN 'invitado' ELSE 'integrante' END,
      'duracion_invitado_dias', i.duracion_invitado_dias,
      'caduca_en', fn_iso(i.caduca_en),
      'ya_miembro', EXISTS (SELECT 1 FROM membresias m
                             WHERE m.equipo_id = e.id AND m.usuario_id = p_actor_id AND m.estado = 'activa'))
      FROM equipos e WHERE e.id = i.equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Unirse con un código. La invitación es de un solo uso y se marca en la misma transacción que
 * crea la membresía. El tope de miembros lo hace cumplir el disparador de 0001 (NX001): si el
 * equipo está lleno, todo se deshace y la invitación sigue pendiente (DEC-019).
 */
CREATE OR REPLACE FUNCTION proc_invitacion_aceptar(p_actor_id uuid, p_codigo text) RETURNS jsonb AS $$
DECLARE
  i           invitaciones;
  v_rol       rol_membresia;
  v_membresia uuid;
  v_equipo    text;
  v_max       int;
BEGIN
  i := fn_invitacion_vigente(p_codigo, true);
  v_rol := CASE WHEN i.rol_destino = 'invitado' THEN 'invitado' ELSE 'integrante' END;
  SELECT nombre, max_miembros INTO v_equipo, v_max FROM equipos WHERE id = i.equipo_id;
  -- Serializa las altas del equipo (el mismo bloqueo que usa el disparador del tope):
  -- así el primer color libre se calcula sin carreras.
  PERFORM pg_advisory_xact_lock(hashtextextended(i.equipo_id::text, 0));

  IF EXISTS (SELECT 1 FROM membresias
              WHERE equipo_id = i.equipo_id AND usuario_id = p_actor_id AND estado = 'activa') THEN
    RAISE EXCEPTION 'Ya perteneces a «%».', v_equipo
      USING ERRCODE = 'NX012', HINT = 'ya_miembro',
            DETAIL = jsonb_build_object('equipo_id', i.equipo_id)::text;
  END IF;

  BEGIN
    INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx, caduca_en)
    VALUES (i.equipo_id, p_actor_id, v_rol,
            CASE WHEN v_rol = 'invitado' THEN NULL ELSE fn_siguiente_color_idx(i.equipo_id) END,
            CASE WHEN v_rol = 'invitado'
                 THEN now() + make_interval(days => coalesce(i.duracion_invitado_dias, 7)) END)
    RETURNING id INTO v_membresia;
  EXCEPTION WHEN SQLSTATE 'NX001' THEN
    RAISE EXCEPTION 'El equipo ya alcanzó su máximo de miembros.'
      USING ERRCODE = 'NX001', HINT = 'equipo_lleno',
            DETAIL = jsonb_build_object('max_miembros', v_max)::text;
  END;

  UPDATE invitaciones SET estado = 'aceptada', aceptada_por = p_actor_id, aceptada_en = now()
   WHERE id = i.id;
  PERFORM fn_registrar_evento(i.equipo_id, p_actor_id, 'membresia.creada', 'membresia', v_membresia,
    jsonb_build_object('rol', v_rol),
    (SELECT nombre FROM usuarios WHERE id = p_actor_id) || ' se unió al equipo como ' || v_rol);
  RETURN jsonb_build_object('equipo_id', i.equipo_id, 'rol', v_rol);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Deja los permisos al día (rol nexo_app, migración 0008). En la primera aplicación la función
-- aún no existe; la 0008 la crea y la ejecuta.
DO $$ BEGIN
  IF to_regproc('fn_conceder_procesos') IS NOT NULL THEN PERFORM fn_conceder_procesos(); END IF;
END $$;

-- Down Migration
DROP FUNCTION IF EXISTS proc_invitacion_aceptar(uuid, text);
DROP FUNCTION IF EXISTS proc_invitacion_ver(uuid, text);
DROP FUNCTION IF EXISTS proc_invitacion_revocar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_invitacion_listar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_invitacion_crear(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_equipo_miembros(uuid, uuid);
DROP FUNCTION IF EXISTS proc_equipo_obtener(uuid, uuid);
DROP FUNCTION IF EXISTS proc_equipo_crear(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_equipo_contexto(uuid, uuid);
DROP FUNCTION IF EXISTS fn_invitacion_vigente(text, boolean);
DROP FUNCTION IF EXISTS fn_codigo_invitacion();
DROP FUNCTION IF EXISTS fn_invitacion_json(invitaciones);
DROP FUNCTION IF EXISTS fn_miembros_json(uuid);
