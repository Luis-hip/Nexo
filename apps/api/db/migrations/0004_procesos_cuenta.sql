-- Fase 2.5 · Procesos de la BD (DEC-025): cuenta, sesiones, preferencias y contacto.
-- Sustituyen al SQL que había en autenticacion.ts y en rutas/{yo,dev,contacto}.ts.
-- Documentación: docs/08_Procesos_BD.md. Códigos nuevos: NX011 (410, ya no disponible) y
-- NX012 (409, conflicto que no es de versión).

-- Up Migration

/** Fecha en ISO 8601 UTC con milisegundos, igual que `Date.toISOString()` en JavaScript. */
CREATE OR REPLACE FUNCTION fn_iso(p timestamptz) RETURNS text AS $$
  SELECT to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$ LANGUAGE sql STABLE;

/** Datos de la persona que viajan en la sesión (nunca el hash de la contraseña). */
CREATE OR REPLACE FUNCTION fn_usuario_json(p_usuario uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
           'id', u.id, 'correo', u.correo, 'nombre', u.nombre, 'cargo', u.cargo,
           'descripcion', u.descripcion, 'zona_horaria', u.zona_horaria, 'avatar_url', u.avatar_url)
    FROM usuarios u WHERE u.id = p_usuario;
$$ LANGUAGE sql STABLE;

/** Preferencias que usa la web; crea la fila con los valores por defecto si aún no existe. */
CREATE OR REPLACE FUNCTION fn_preferencias_json(p_usuario uuid) RETURNS jsonb AS $$
DECLARE r jsonb;
BEGIN
  INSERT INTO preferencias_usuario (usuario_id) VALUES (p_usuario) ON CONFLICT (usuario_id) DO NOTHING;
  SELECT jsonb_build_object(
           'tema', tema, 'densidad', densidad, 'tamano_texto', tamano_texto,
           'reducir_movimiento', reducir_movimiento, 'formato_hora', formato_hora,
           'formato_fecha', formato_fecha, 'tour_visto', tour_visto, 'idioma', idioma,
           'resumen_diario', resumen_diario)
    INTO r FROM preferencias_usuario WHERE usuario_id = p_usuario;
  RETURN r;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- Sesiones
-- ---------------------------------------------------------------------------------------------

/**
 * Resuelve la sesión de una petición a partir del hash del token de la cookie.
 * Devuelve NULL si no hay sesión vigente (revocada, vencida o de una cuenta eliminada).
 * No recibe `p_actor_id`: es justo lo que averigua quién es el actor.
 */
CREATE OR REPLACE FUNCTION proc_sesion_resolver(p_token_hash bytea) RETURNS jsonb AS $$
  SELECT jsonb_build_object('sesion_id', s.id, 'usuario', fn_usuario_json(u.id))
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
   WHERE s.token_hash = p_token_hash
     AND s.revocada_en IS NULL AND s.expira_en > now() AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Cierra la sesión del actor (solo puede revocar una sesión suya). */
CREATE OR REPLACE FUNCTION proc_sesion_revocar(p_actor_id uuid, p_sesion_id uuid) RETURNS jsonb AS $$
DECLARE v_n int;
BEGIN
  UPDATE sesiones SET revocada_en = now()
   WHERE id = p_sesion_id AND usuario_id = p_actor_id AND revocada_en IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('revocada', v_n > 0);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Acceso de desarrollo (docs/01, sección 8). Estos dos procesos NO se conceden al rol `nexo_app`
-- (migración de roles): en producción no se pueden ejecutar aunque alguien activara la ruta.

/** Usuarios de la semilla para el selector del acceso de desarrollo. */
CREATE OR REPLACE FUNCTION proc_dev_usuarios() RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'correo', correo, 'nombre', nombre, 'cargo', cargo)
                            ORDER BY nombre), '[]'::jsonb)
    FROM usuarios;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Crea una sesión real para un usuario de la semilla, sin contraseña (solo desarrollo y CI). */
CREATE OR REPLACE FUNCTION proc_dev_sesion_crear(
  p_correo text, p_token_hash bytea, p_ip text, p_expira_en timestamptz
) RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM usuarios WHERE correo = p_correo::citext;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No existe un usuario con ese correo.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  INSERT INTO sesiones (usuario_id, token_hash, dispositivo, ip, expira_en)
  VALUES (v_id, p_token_hash, 'dev-login', nullif(p_ip, '')::inet, p_expira_en);
  RETURN (SELECT jsonb_build_object('usuario', jsonb_build_object('id', id, 'correo', correo, 'nombre', nombre))
            FROM usuarios WHERE id = v_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- Usuario: equipos, preferencias y perfil
-- ---------------------------------------------------------------------------------------------

/** GET /yo: los equipos activos de la persona (con su perfil en cada uno) y sus preferencias. */
CREATE OR REPLACE FUNCTION proc_usuario_yo(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  RETURN jsonb_build_object(
    'equipos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'id', e.id, 'nombre', e.nombre, 'rol', m.rol, 'color_idx', m.color_idx,
                         'caduca_en', fn_iso(m.caduca_en)) ORDER BY e.nombre), '[]'::jsonb)
                  FROM membresias m JOIN equipos e ON e.id = m.equipo_id
                 WHERE m.usuario_id = p_actor_id AND m.estado = 'activa' AND e.estado = 'activo'),
    'preferencias', fn_preferencias_json(p_actor_id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Guarda cualquier subconjunto de las preferencias propias y devuelve cómo quedaron. */
CREATE OR REPLACE FUNCTION proc_usuario_preferencias_guardar(p_actor_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_preferencias_json(p_actor_id);  -- asegura que exista la fila
  UPDATE preferencias_usuario SET
    tema               = coalesce((p_cambios->>'tema')::tema_ui, tema),
    densidad           = coalesce((p_cambios->>'densidad')::densidad_ui, densidad),
    tamano_texto       = coalesce((p_cambios->>'tamano_texto')::tamano_texto_ui, tamano_texto),
    reducir_movimiento = coalesce((p_cambios->>'reducir_movimiento')::boolean, reducir_movimiento),
    formato_hora       = coalesce(p_cambios->>'formato_hora', formato_hora),
    formato_fecha      = coalesce(p_cambios->>'formato_fecha', formato_fecha),
    tour_visto         = coalesce((p_cambios->>'tour_visto')::boolean, tour_visto),
    idioma             = coalesce(p_cambios->>'idioma', idioma),
    resumen_diario     = coalesce((p_cambios->>'resumen_diario')::boolean, resumen_diario)
   WHERE usuario_id = p_actor_id;
  RETURN fn_preferencias_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Actualiza el perfil propio (nombre, cargo, descripción, zona horaria). */
CREATE OR REPLACE FUNCTION proc_usuario_perfil_guardar(p_actor_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
BEGIN
  IF p_cambios IS NULL OR p_cambios = '{}'::jsonb THEN
    RAISE EXCEPTION 'No hay nada que cambiar.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE usuarios SET
    nombre       = coalesce(p_cambios->>'nombre', nombre),
    cargo        = coalesce(p_cambios->>'cargo', cargo),
    descripcion  = coalesce(p_cambios->>'descripcion', descripcion),
    zona_horaria = coalesce(p_cambios->>'zona_horaria', zona_horaria)
   WHERE id = p_actor_id AND eliminado_en IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu cuenta.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  RETURN fn_usuario_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- Contacto (formulario público, sin sesión)
-- ---------------------------------------------------------------------------------------------

/** Guarda un mensaje del formulario público de contacto. No hay actor: es una ruta sin sesión. */
CREATE OR REPLACE FUNCTION proc_contacto_enviar(p_nombre text, p_correo text, p_asunto text, p_mensaje text)
RETURNS jsonb AS $$
BEGIN
  INSERT INTO contacto_mensajes (nombre, correo, asunto, mensaje)
  VALUES (p_nombre, p_correo, p_asunto, p_mensaje);
  RETURN jsonb_build_object('recibido', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Deja los permisos al día (rol nexo_app, migración 0008). En la primera aplicación la función
-- aún no existe; la 0008 la crea y la ejecuta.
DO $$ BEGIN
  IF to_regproc('fn_conceder_procesos') IS NOT NULL THEN PERFORM fn_conceder_procesos(); END IF;
END $$;

-- Down Migration
DROP FUNCTION IF EXISTS proc_contacto_enviar(text, text, text, text);
DROP FUNCTION IF EXISTS proc_usuario_perfil_guardar(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_usuario_preferencias_guardar(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_usuario_yo(uuid);
DROP FUNCTION IF EXISTS proc_dev_sesion_crear(text, bytea, text, timestamptz);
DROP FUNCTION IF EXISTS proc_dev_usuarios();
DROP FUNCTION IF EXISTS proc_sesion_revocar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_sesion_resolver(bytea);
DROP FUNCTION IF EXISTS fn_preferencias_json(uuid);
DROP FUNCTION IF EXISTS fn_usuario_json(uuid);
DROP FUNCTION IF EXISTS fn_iso(timestamptz);
