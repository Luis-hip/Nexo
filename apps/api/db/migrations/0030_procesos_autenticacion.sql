-- Fase 5.1 · Autenticación real (AUTH-01 a AUTH-06, AUTH-11 y la contraseña de PF-02), DEC-AUTH-1.
-- Las tablas ya existen en 0001 (`usuarios.hash_contrasena`, `intentos_fallidos`, `bloqueado_hasta`,
-- `correo_verificado_en`, `sesiones`, `tokens_verificacion`). La contraseña nunca llega a la BD:
-- la API calcula el hash Argon2id y lo verifica; los procesos guardan hashes y deciden el bloqueo.
-- Numeración: las migraciones 0014–0019 son del chat y 0020–0029 de WhatsApp (ramas en paralelo).
-- Documentación: docs/08_Procesos_BD.md, sección «Fase 5 · Autenticación».

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/** Intentos fallidos seguidos antes de bloquear la cuenta, y minutos de bloqueo. */
CREATE OR REPLACE FUNCTION fn_auth_max_intentos() RETURNS int AS $$ SELECT 5; $$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION fn_auth_minutos_bloqueo() RETURNS int AS $$ SELECT 15; $$ LANGUAGE sql IMMUTABLE;

/** Crea una sesión (mismo mecanismo que el acceso de desarrollo) y devuelve su usuario. */
CREATE OR REPLACE FUNCTION fn_auth_crear_sesion(
  p_usuario uuid, p_token_hash bytea, p_ip text, p_dispositivo text, p_expira timestamptz
) RETURNS void AS $$
BEGIN
  INSERT INTO sesiones (usuario_id, token_hash, ip, dispositivo, expira_en)
  VALUES (p_usuario, p_token_hash, nullif(p_ip, '')::inet, left(coalesce(p_dispositivo, ''), 200), p_expira);
  UPDATE usuarios SET ultima_actividad_en = now() WHERE id = p_usuario;
END $$ LANGUAGE plpgsql;

/** Token de un solo uso vigente; NX011 (410) si no existe, ya se usó o venció. */
CREATE OR REPLACE FUNCTION fn_auth_consumir_token(p_token_hash bytea, p_tipo tipo_token) RETURNS uuid AS $$
DECLARE v_usuario uuid;
BEGIN
  UPDATE tokens_verificacion t SET usado_en = now()
   WHERE t.token_hash = p_token_hash AND t.tipo = p_tipo AND t.usado_en IS NULL AND t.expira_en > now()
     AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = t.usuario_id AND u.eliminado_en IS NULL)
  RETURNING t.usuario_id INTO v_usuario;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'El enlace ya no es válido. Pide uno nuevo.' USING ERRCODE = 'NX011', HINT = 'enlace_invalido';
  END IF;
  RETURN v_usuario;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 2. Procesos (proc_*)
-- ---------------------------------------------------------------------------------------------

/**
 * AUTH-01: registro. Crea la cuenta con el hash Argon2id que calculó la API, sus preferencias y la
 * primera sesión. El correo queda sin verificar (se puede usar la app; la web lo recuerda).
 * Si el correo ya tiene cuenta: NX012 (DEC-AUTH-1 explica por qué el registro sí lo dice).
 */
CREATE OR REPLACE FUNCTION proc_auth_registrar(
  p_correo text, p_nombre text, p_hash text, p_token_hash bytea, p_ip text, p_dispositivo text, p_expira timestamptz
) RETURNS jsonb AS $$
DECLARE v_id uuid; v_nombre text := btrim(coalesce(p_nombre, ''));
BEGIN
  IF p_hash IS NULL OR p_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'La contraseña no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF char_length(v_nombre) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 80 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF btrim(coalesce(p_correo, '')) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'El correo no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    INSERT INTO usuarios (correo, nombre, hash_contrasena)
    VALUES (lower(btrim(p_correo)), v_nombre, p_hash)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.'
      USING ERRCODE = 'NX012', HINT = 'correo_registrado';
  END;
  INSERT INTO preferencias_usuario (usuario_id) VALUES (v_id) ON CONFLICT (usuario_id) DO NOTHING;
  PERFORM fn_auth_crear_sesion(v_id, p_token_hash, p_ip, p_dispositivo, p_expira);
  RETURN jsonb_build_object('usuario', fn_usuario_json(v_id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-02, paso 1: lo que la API necesita para verificar la contraseña. Devuelve NULL si no hay
 * cuenta con contraseña para ese correo (la API responde igual en ambos casos).
 */
CREATE OR REPLACE FUNCTION proc_auth_credenciales(p_correo text) RETURNS jsonb AS $$
  SELECT jsonb_build_object('usuario_id', u.id, 'hash', u.hash_contrasena)
    FROM usuarios u
   WHERE u.correo = lower(btrim(p_correo)) AND u.eliminado_en IS NULL AND u.hash_contrasena IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-02, paso 2: registra el resultado de la verificación. Con la cuenta bloqueada no entra aunque
 * la contraseña sea correcta. Bien: reinicia los intentos y crea la sesión. Mal: suma un intento y,
 * al quinto seguido, bloquea 15 minutos. Devuelve `{ estado: ok | fallo | bloqueada, usuario? }`.
 */
CREATE OR REPLACE FUNCTION proc_auth_entrar(
  p_usuario_id uuid, p_correcta boolean, p_token_hash bytea, p_ip text, p_dispositivo text, p_expira timestamptz
) RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_usuario_id AND eliminado_en IS NULL FOR UPDATE;
  IF u.id IS NULL THEN RETURN jsonb_build_object('estado', 'fallo'); END IF;
  IF u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now() THEN
    RETURN jsonb_build_object('estado', 'bloqueada');
  END IF;
  IF p_correcta THEN
    UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = u.id;
    PERFORM fn_auth_crear_sesion(u.id, p_token_hash, p_ip, p_dispositivo, p_expira);
    RETURN jsonb_build_object('estado', 'ok', 'usuario', fn_usuario_json(u.id));
  END IF;
  IF u.intentos_fallidos + 1 >= fn_auth_max_intentos() THEN
    UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = now() + make_interval(mins => fn_auth_minutos_bloqueo())
     WHERE id = u.id;
    RETURN jsonb_build_object('estado', 'bloqueada');
  END IF;
  UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = u.id;
  RETURN jsonb_build_object('estado', 'fallo');
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-03: pide un enlace para restablecer la contraseña. Anula los enlaces anteriores sin usar.
 * Devuelve `{ correo, nombre }` para enviarlo, o NULL si el correo no tiene cuenta (la API responde
 * lo mismo en ambos casos).
 */
CREATE OR REPLACE FUNCTION proc_auth_recuperar(p_correo text, p_token_hash bytea, p_expira timestamptz) RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  SELECT * INTO u FROM usuarios WHERE correo = lower(btrim(p_correo)) AND eliminado_en IS NULL;
  IF u.id IS NULL THEN RETURN NULL; END IF;
  UPDATE tokens_verificacion SET usado_en = now()
   WHERE usuario_id = u.id AND tipo = 'restablecer_contrasena' AND usado_en IS NULL;
  INSERT INTO tokens_verificacion (usuario_id, tipo, token_hash, expira_en)
  VALUES (u.id, 'restablecer_contrasena', p_token_hash, p_expira);
  RETURN jsonb_build_object('correo', u.correo, 'nombre', u.nombre);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-05: restablece la contraseña con el enlace (un solo uso). Cierra todas las sesiones de la
 * cuenta y quita el bloqueo; el correo queda verificado (quien abrió el enlace lo recibió).
 */
CREATE OR REPLACE FUNCTION proc_auth_restablecer(p_token_hash bytea, p_hash text) RETURNS jsonb AS $$
DECLARE v_usuario uuid;
BEGIN
  IF p_hash IS NULL OR p_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'La contraseña no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  v_usuario := fn_auth_consumir_token(p_token_hash, 'restablecer_contrasena');
  UPDATE usuarios SET hash_contrasena = p_hash, intentos_fallidos = 0, bloqueado_hasta = NULL,
                      correo_verificado_en = coalesce(correo_verificado_en, now())
   WHERE id = v_usuario;
  UPDATE sesiones SET revocada_en = now() WHERE usuario_id = v_usuario AND revocada_en IS NULL;
  RETURN jsonb_build_object('restablecida', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-06: pide (o vuelve a pedir) el enlace para verificar el correo de la persona con sesión.
 * Devuelve `{ correo, nombre, verificado }`; si ya estaba verificado no crea enlace.
 */
CREATE OR REPLACE FUNCTION proc_auth_verificacion_solicitar(p_actor_id uuid, p_token_hash bytea, p_expira timestamptz)
RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_actor_id AND eliminado_en IS NULL;
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos tu cuenta.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  IF u.correo_verificado_en IS NOT NULL THEN
    RETURN jsonb_build_object('correo', u.correo, 'nombre', u.nombre, 'verificado', true);
  END IF;
  UPDATE tokens_verificacion SET usado_en = now()
   WHERE usuario_id = u.id AND tipo = 'verificar_correo' AND usado_en IS NULL;
  INSERT INTO tokens_verificacion (usuario_id, tipo, token_hash, expira_en)
  VALUES (u.id, 'verificar_correo', p_token_hash, p_expira);
  RETURN jsonb_build_object('correo', u.correo, 'nombre', u.nombre, 'verificado', false);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** AUTH-06: confirma el correo con el enlace (un solo uso; no hace falta tener sesión). */
CREATE OR REPLACE FUNCTION proc_auth_verificar_correo(p_token_hash bytea) RETURNS jsonb AS $$
DECLARE v_usuario uuid;
BEGIN
  v_usuario := fn_auth_consumir_token(p_token_hash, 'verificar_correo');
  UPDATE usuarios SET correo_verificado_en = coalesce(correo_verificado_en, now()) WHERE id = v_usuario;
  RETURN jsonb_build_object('verificado', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Estado de la cuenta de la persona (PF-02 y el aviso de verificar correo). */
CREATE OR REPLACE FUNCTION proc_auth_cuenta(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'correo', u.correo, 'correo_verificado', u.correo_verificado_en IS NOT NULL,
    'tiene_contrasena', u.hash_contrasena IS NOT NULL,
    'sesiones_activas', (SELECT count(*)::int FROM sesiones s
                          WHERE s.usuario_id = u.id AND s.revocada_en IS NULL AND s.expira_en > now()))
    FROM usuarios u WHERE u.id = p_actor_id AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** PF-02, paso 1: hash actual de la persona con sesión, para verificar la contraseña actual. */
CREATE OR REPLACE FUNCTION proc_auth_hash_actual(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object('hash', u.hash_contrasena)
    FROM usuarios u WHERE u.id = p_actor_id AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** PF-02, paso 2: guarda la contraseña nueva y cierra las demás sesiones (la actual se conserva). */
CREATE OR REPLACE FUNCTION proc_auth_contrasena_cambiar(p_actor_id uuid, p_sesion_id uuid, p_hash text) RETURNS jsonb AS $$
DECLARE v_n int;
BEGIN
  IF p_hash IS NULL OR p_hash NOT LIKE '$argon2id$%' THEN
    RAISE EXCEPTION 'La contraseña no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE usuarios SET hash_contrasena = p_hash WHERE id = p_actor_id AND eliminado_en IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu cuenta.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  UPDATE sesiones SET revocada_en = now()
   WHERE usuario_id = p_actor_id AND id <> p_sesion_id AND revocada_en IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('cambiada', true, 'sesiones_cerradas', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_auth_contrasena_cambiar(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_auth_hash_actual(uuid);
DROP FUNCTION IF EXISTS proc_auth_cuenta(uuid);
DROP FUNCTION IF EXISTS proc_auth_verificar_correo(bytea);
DROP FUNCTION IF EXISTS proc_auth_verificacion_solicitar(uuid, bytea, timestamptz);
DROP FUNCTION IF EXISTS proc_auth_restablecer(bytea, text);
DROP FUNCTION IF EXISTS proc_auth_recuperar(text, bytea, timestamptz);
DROP FUNCTION IF EXISTS proc_auth_entrar(uuid, boolean, bytea, text, text, timestamptz);
DROP FUNCTION IF EXISTS proc_auth_credenciales(text);
DROP FUNCTION IF EXISTS proc_auth_registrar(text, text, text, bytea, text, text, timestamptz);
DROP FUNCTION IF EXISTS fn_auth_consumir_token(bytea, tipo_token);
DROP FUNCTION IF EXISTS fn_auth_crear_sesion(uuid, bytea, text, text, timestamptz);
DROP FUNCTION IF EXISTS fn_auth_minutos_bloqueo();
DROP FUNCTION IF EXISTS fn_auth_max_intentos();
