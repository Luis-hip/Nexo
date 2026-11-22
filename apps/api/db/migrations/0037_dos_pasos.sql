-- AUTH-07 · Verificación en dos pasos (TOTP: Google Authenticator, Authy, Microsoft Authenticator).
-- docs/13_Plan_Integrado_Pendientes.md, 1.2. Las tablas `credenciales_2fa` y `codigos_respaldo_2fa`
-- existen desde 0001. El secreto llega cifrado (AES-256-GCM con ENCRYPTION_KEY) y la API calcula el
-- código: aquí solo se guarda, se decide el resultado y se evita reutilizar un código (ultimo_paso).
-- Con la 2FA activa, el inicio de sesión devuelve un desafío (5 min, 5 intentos) en lugar de la
-- sesión; Google (0038) usará el mismo desafío. Pruebas: P235–P238. Documentación: docs/08.

-- Up Migration

ALTER TABLE credenciales_2fa
  ADD COLUMN ultimo_paso bigint NOT NULL DEFAULT 0,
  ADD COLUMN creado_en timestamptz NOT NULL DEFAULT now();

CREATE TABLE desafios_2fa (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  metodo     text NOT NULL CHECK (metodo IN ('contrasena', 'google')),
  intentos   smallint NOT NULL DEFAULT 0,
  expira_en  timestamptz NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_desafios_2fa_usuario ON desafios_2fa(usuario_id);
COMMENT ON TABLE desafios_2fa IS 'Segundo paso pendiente del inicio de sesión (AUTH-07): token como hash, 5 min, 5 intentos.';

/** ¿La persona tiene la verificación en dos pasos activa (confirmada)? */
CREATE OR REPLACE FUNCTION fn_2fa_activa(p_usuario uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM credenciales_2fa WHERE usuario_id = p_usuario AND confirmado_en IS NOT NULL);
$$ LANGUAGE sql STABLE;

/** Crea el desafío del segundo paso (los vencidos de la persona se borran). */
CREATE OR REPLACE FUNCTION fn_2fa_crear_desafio(p_usuario uuid, p_token_hash bytea, p_metodo text) RETURNS void AS $$
BEGIN
  DELETE FROM desafios_2fa WHERE usuario_id = p_usuario AND expira_en <= now();
  INSERT INTO desafios_2fa (usuario_id, token_hash, metodo, expira_en)
  VALUES (p_usuario, p_token_hash, p_metodo, now() + interval '5 minutes');
END $$ LANGUAGE plpgsql;

/**
 * Comprueba y CONSUME un segundo factor: un paso TOTP ya validado por la API (debe ser posterior al
 * último usado, así un código no sirve dos veces) o el hash de un código de respaldo sin usar.
 */
CREATE OR REPLACE FUNCTION fn_2fa_validar(p_usuario uuid, p_paso bigint, p_respaldo_hash text) RETURNS boolean AS $$
DECLARE v_id uuid;
BEGIN
  IF p_paso IS NOT NULL THEN
    UPDATE credenciales_2fa SET ultimo_paso = p_paso
     WHERE usuario_id = p_usuario AND ultimo_paso < p_paso
    RETURNING usuario_id INTO v_id;
    RETURN v_id IS NOT NULL;
  END IF;
  IF p_respaldo_hash IS NOT NULL THEN
    UPDATE codigos_respaldo_2fa SET usado_en = now()
     WHERE id = (SELECT id FROM codigos_respaldo_2fa
                  WHERE usuario_id = p_usuario AND hash_codigo = p_respaldo_hash AND usado_en IS NULL
                  LIMIT 1 FOR UPDATE)
    RETURNING id INTO v_id;
    RETURN v_id IS NOT NULL;
  END IF;
  RETURN false;
END $$ LANGUAGE plpgsql;

/** Estado para Ajustes → Cuenta. */
CREATE OR REPLACE FUNCTION fn_2fa_estado_json(p_usuario uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'activa', c.confirmado_en IS NOT NULL,
    'desde', fn_iso(c.confirmado_en),
    'codigos_restantes', (SELECT count(*)::int FROM codigos_respaldo_2fa r
                           WHERE r.usuario_id = p_usuario AND r.usado_en IS NULL))
    FROM (SELECT p_usuario AS u) x LEFT JOIN credenciales_2fa c ON c.usuario_id = x.u;
$$ LANGUAGE sql STABLE;

/**
 * AUTH-02, paso 2 (redefinido en 0037): con la contraseña correcta y la 2FA activa no hay sesión
 * todavía: el token que traía la sesión se vuelve el del desafío y la API lo devuelve para el
 * segundo paso (docs/13, 1.2). Devuelve `{ estado: ok | 2fa | fallo | bloqueada, usuario? }`.
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
    IF fn_2fa_activa(u.id) THEN
      PERFORM fn_2fa_crear_desafio(u.id, p_token_hash, 'contrasena');
      RETURN jsonb_build_object('estado', '2fa');
    END IF;
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

/** Estado de la cuenta de la persona (PF-02, el aviso de verificar correo y, desde 0037, la 2FA). */
CREATE OR REPLACE FUNCTION proc_auth_cuenta(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'correo', u.correo, 'correo_verificado', u.correo_verificado_en IS NOT NULL,
    'tiene_contrasena', u.hash_contrasena IS NOT NULL,
    'dos_pasos', fn_2fa_activa(u.id),
    'sesiones_activas', (SELECT count(*)::int FROM sesiones s
                          WHERE s.usuario_id = u.id AND s.revocada_en IS NULL AND s.expira_en > now()))
    FROM usuarios u WHERE u.id = p_actor_id AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** AUTH-07: estado de la verificación en dos pasos de la persona. */
CREATE OR REPLACE FUNCTION proc_2fa_estado(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT fn_2fa_estado_json(p_actor_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** AUTH-07, paso 1 de activar: guarda el secreto nuevo (cifrado) sin confirmar. NX007 si ya está activa. */
CREATE OR REPLACE FUNCTION proc_2fa_iniciar(p_actor_id uuid, p_secreto_cifrado text) RETURNS jsonb AS $$
BEGIN
  IF fn_2fa_activa(p_actor_id) THEN
    RAISE EXCEPTION 'La verificación en dos pasos ya está activa.' USING ERRCODE = 'NX007', HINT = 'ya_activa';
  END IF;
  IF coalesce(p_secreto_cifrado, '') = '' THEN
    RAISE EXCEPTION 'Falta el secreto.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO credenciales_2fa (usuario_id, secreto_cifrado, confirmado_en, ultimo_paso)
  VALUES (p_actor_id, p_secreto_cifrado, NULL, 0)
  ON CONFLICT (usuario_id) DO UPDATE SET secreto_cifrado = EXCLUDED.secreto_cifrado, confirmado_en = NULL,
                                         ultimo_paso = 0, creado_en = now();
  RETURN fn_2fa_estado_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Sistema: el secreto cifrado de la persona para que la API calcule el código (o NULL). */
CREATE OR REPLACE FUNCTION proc_2fa_secreto(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object('secreto_cifrado', c.secreto_cifrado, 'confirmado', c.confirmado_en IS NOT NULL,
                            'ultimo_paso', c.ultimo_paso)
    FROM credenciales_2fa c WHERE c.usuario_id = p_actor_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-07, paso 2 de activar: la API ya comprobó el primer código (p_paso). Activa, guarda los
 * hashes de los 10 códigos de respaldo nuevos (los anteriores se borran) y devuelve el estado.
 */
CREATE OR REPLACE FUNCTION proc_2fa_confirmar(p_actor_id uuid, p_paso bigint, p_hashes text[]) RETURNS jsonb AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM credenciales_2fa WHERE usuario_id = p_actor_id AND confirmado_en IS NULL) THEN
    RAISE EXCEPTION 'No hay una activación pendiente. Empieza de nuevo.' USING ERRCODE = 'NX007', HINT = 'sin_activacion';
  END IF;
  IF coalesce(array_length(p_hashes, 1), 0) <> 10 THEN
    RAISE EXCEPTION 'Faltan los códigos de respaldo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE credenciales_2fa SET confirmado_en = now(), ultimo_paso = p_paso WHERE usuario_id = p_actor_id;
  DELETE FROM codigos_respaldo_2fa WHERE usuario_id = p_actor_id;
  INSERT INTO codigos_respaldo_2fa (usuario_id, hash_codigo) SELECT p_actor_id, h FROM unnest(p_hashes) h;
  RETURN fn_2fa_estado_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** AUTH-07: desactivar pide un segundo factor válido (código o respaldo). NX010 si no lo es. */
CREATE OR REPLACE FUNCTION proc_2fa_desactivar(p_actor_id uuid, p_paso bigint, p_respaldo_hash text) RETURNS jsonb AS $$
BEGIN
  IF NOT fn_2fa_activa(p_actor_id) THEN
    RAISE EXCEPTION 'La verificación en dos pasos no está activa.' USING ERRCODE = 'NX007', HINT = 'no_activa';
  END IF;
  IF NOT fn_2fa_validar(p_actor_id, p_paso, p_respaldo_hash) THEN
    RAISE EXCEPTION 'El código no es correcto.' USING ERRCODE = 'NX010', HINT = 'codigo_incorrecto';
  END IF;
  DELETE FROM codigos_respaldo_2fa WHERE usuario_id = p_actor_id;
  DELETE FROM credenciales_2fa WHERE usuario_id = p_actor_id;
  DELETE FROM desafios_2fa WHERE usuario_id = p_actor_id;
  RETURN fn_2fa_estado_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** AUTH-07: códigos de respaldo nuevos (los anteriores dejan de servir); pide un segundo factor. */
CREATE OR REPLACE FUNCTION proc_2fa_respaldo_regenerar(p_actor_id uuid, p_paso bigint, p_respaldo_hash text, p_hashes text[]) RETURNS jsonb AS $$
BEGIN
  IF NOT fn_2fa_activa(p_actor_id) THEN
    RAISE EXCEPTION 'La verificación en dos pasos no está activa.' USING ERRCODE = 'NX007', HINT = 'no_activa';
  END IF;
  IF coalesce(array_length(p_hashes, 1), 0) <> 10 THEN
    RAISE EXCEPTION 'Faltan los códigos de respaldo.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF NOT fn_2fa_validar(p_actor_id, p_paso, p_respaldo_hash) THEN
    RAISE EXCEPTION 'El código no es correcto.' USING ERRCODE = 'NX010', HINT = 'codigo_incorrecto';
  END IF;
  DELETE FROM codigos_respaldo_2fa WHERE usuario_id = p_actor_id;
  INSERT INTO codigos_respaldo_2fa (usuario_id, hash_codigo) SELECT p_actor_id, h FROM unnest(p_hashes) h;
  RETURN fn_2fa_estado_json(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Sistema: datos del desafío vigente para que la API calcule el código. NX011 si venció o no existe. */
CREATE OR REPLACE FUNCTION proc_2fa_desafio(p_token_hash bytea) RETURNS jsonb AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object('usuario_id', d.usuario_id, 'secreto_cifrado', c.secreto_cifrado,
                            'ultimo_paso', c.ultimo_paso, 'metodo', d.metodo)
    INTO r
    FROM desafios_2fa d JOIN credenciales_2fa c ON c.usuario_id = d.usuario_id AND c.confirmado_en IS NOT NULL
   WHERE d.token_hash = p_token_hash AND d.expira_en > now();
  IF r IS NULL THEN
    RAISE EXCEPTION 'El paso de verificación venció. Vuelve a iniciar sesión.' USING ERRCODE = 'NX011', HINT = 'desafio_vencido';
  END IF;
  RETURN r;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * AUTH-07, segundo paso del inicio de sesión. Con un factor válido borra el desafío y crea la sesión;
 * si no, suma un intento y al quinto borra el desafío (hay que volver a empezar).
 * Devuelve `{ estado: ok | fallo | agotado, usuario?, intentos_restantes? }`.
 */
CREATE OR REPLACE FUNCTION proc_2fa_completar(
  p_token_hash bytea, p_paso bigint, p_respaldo_hash text,
  p_sesion_hash bytea, p_ip text, p_dispositivo text, p_expira timestamptz
) RETURNS jsonb AS $$
DECLARE d desafios_2fa;
BEGIN
  SELECT * INTO d FROM desafios_2fa WHERE token_hash = p_token_hash AND expira_en > now() FOR UPDATE;
  IF d.id IS NULL THEN
    RAISE EXCEPTION 'El paso de verificación venció. Vuelve a iniciar sesión.' USING ERRCODE = 'NX011', HINT = 'desafio_vencido';
  END IF;
  IF fn_2fa_validar(d.usuario_id, p_paso, p_respaldo_hash) THEN
    DELETE FROM desafios_2fa WHERE id = d.id;
    PERFORM fn_auth_crear_sesion(d.usuario_id, p_sesion_hash, p_ip, p_dispositivo, p_expira);
    RETURN jsonb_build_object('estado', 'ok', 'usuario', fn_usuario_json(d.usuario_id));
  END IF;
  IF d.intentos + 1 >= 5 THEN
    DELETE FROM desafios_2fa WHERE id = d.id;
    RETURN jsonb_build_object('estado', 'agotado');
  END IF;
  UPDATE desafios_2fa SET intentos = intentos + 1 WHERE id = d.id;
  RETURN jsonb_build_object('estado', 'fallo', 'intentos_restantes', 4 - d.intentos);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration

DROP FUNCTION IF EXISTS proc_2fa_completar(bytea, bigint, text, bytea, text, text, timestamptz);
DROP FUNCTION IF EXISTS proc_2fa_desafio(bytea);
DROP FUNCTION IF EXISTS proc_2fa_respaldo_regenerar(uuid, bigint, text, text[]);
DROP FUNCTION IF EXISTS proc_2fa_desactivar(uuid, bigint, text);
DROP FUNCTION IF EXISTS proc_2fa_confirmar(uuid, bigint, text[]);
DROP FUNCTION IF EXISTS proc_2fa_secreto(uuid);
DROP FUNCTION IF EXISTS proc_2fa_iniciar(uuid, text);
DROP FUNCTION IF EXISTS proc_2fa_estado(uuid);

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

CREATE OR REPLACE FUNCTION proc_auth_cuenta(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'correo', u.correo, 'correo_verificado', u.correo_verificado_en IS NOT NULL,
    'tiene_contrasena', u.hash_contrasena IS NOT NULL,
    'sesiones_activas', (SELECT count(*)::int FROM sesiones s
                          WHERE s.usuario_id = u.id AND s.revocada_en IS NULL AND s.expira_en > now()))
    FROM usuarios u WHERE u.id = p_actor_id AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS fn_2fa_estado_json(uuid);
DROP FUNCTION IF EXISTS fn_2fa_validar(uuid, bigint, text);
DROP FUNCTION IF EXISTS fn_2fa_crear_desafio(uuid, bytea, text);
DROP FUNCTION IF EXISTS fn_2fa_activa(uuid);
DROP TABLE IF EXISTS desafios_2fa;
ALTER TABLE credenciales_2fa DROP COLUMN IF EXISTS creado_en, DROP COLUMN IF EXISTS ultimo_paso;
