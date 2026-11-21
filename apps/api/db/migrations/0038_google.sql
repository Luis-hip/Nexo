-- AUTH-07 · Entrar con Google y validación del correo (docs/13_Plan_Integrado_Pendientes.md, 1.2).
-- `usuarios.google_sub` existe desde 0001. La API hace el flujo OAuth (código + PKCE) y pasa aquí lo
-- que Google confirmó (sub, correo, correo verificado, nombre). Reglas:
--  - Cuenta creada o vinculada con Google: el correo queda verificado si Google lo marca verificado.
--    Con otro correo, el registro de siempre manda el correo de verificación (Luis, 2026-11-21).
--  - Vincular a una cuenta que ya existe solo con sesión iniciada (Ajustes → Cuenta) o si ese correo
--    ya estaba verificado en Nexo: así nadie se apodera de una cuenta con un Google del mismo correo.
--  - Con la verificación en dos pasos activa, Google también pide el segundo paso (desafío de 0037).
-- Pruebas: P239–P241. Documentación: docs/08.

-- Up Migration

/**
 * Entrar o vincular con Google. `p_actor_id` NULL = entrar (crea la cuenta si no existe); con valor =
 * vincular a la cuenta con sesión. Devuelve `{ estado: ok | 2fa | vinculada, nuevo, usuario? }`.
 */
CREATE OR REPLACE FUNCTION proc_auth_google(
  p_sub text, p_correo text, p_correo_verificado boolean, p_nombre text, p_actor_id uuid,
  p_token_hash bytea, p_ip text, p_dispositivo text, p_expira timestamptz
) RETURNS jsonb AS $$
DECLARE
  u        usuarios;
  v_correo text := lower(btrim(coalesce(p_correo, '')));
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
  v_nuevo  boolean := false;
BEGIN
  IF coalesce(p_sub, '') = '' OR v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Google no devolvió los datos de la cuenta.' USING ERRCODE = 'NX010', HINT = 'google_invalido';
  END IF;

  -- Vincular (con sesión).
  IF p_actor_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM usuarios WHERE google_sub = p_sub AND id <> p_actor_id) THEN
      RAISE EXCEPTION 'Esa cuenta de Google ya está vinculada a otra cuenta de Nexo.'
        USING ERRCODE = 'NX012', HINT = 'google_en_uso';
    END IF;
    UPDATE usuarios SET google_sub = p_sub,
           correo_verificado_en = CASE WHEN correo_verificado_en IS NULL AND p_correo_verificado AND correo = v_correo
                                       THEN now() ELSE correo_verificado_en END
     WHERE id = p_actor_id AND eliminado_en IS NULL
    RETURNING * INTO u;
    IF u.id IS NULL THEN
      RAISE EXCEPTION 'No se encontró tu cuenta.' USING ERRCODE = 'NX006', HINT = 'no_encontrado';
    END IF;
    RETURN jsonb_build_object('estado', 'vinculada', 'nuevo', false);
  END IF;

  -- Entrar: primero por la cuenta de Google ya vinculada.
  SELECT * INTO u FROM usuarios WHERE google_sub = p_sub AND eliminado_en IS NULL;
  IF u.id IS NULL THEN
    SELECT * INTO u FROM usuarios WHERE correo = v_correo AND eliminado_en IS NULL FOR UPDATE;
    IF u.id IS NOT NULL THEN
      -- Ya hay una cuenta con ese correo: solo se vincula sola si ambos lados lo tienen verificado.
      IF u.correo_verificado_en IS NULL OR NOT p_correo_verificado THEN
        RAISE EXCEPTION 'Ya existe una cuenta con ese correo. Entra con tu contraseña y vincula Google en Ajustes → Cuenta.'
          USING ERRCODE = 'NX012', HINT = 'cuenta_existente';
      END IF;
      UPDATE usuarios SET google_sub = p_sub WHERE id = u.id;
    ELSE
      IF char_length(v_nombre) < 2 THEN v_nombre := left(split_part(v_correo, '@', 1), 80); END IF;
      IF char_length(v_nombre) < 2 THEN v_nombre := 'Persona'; END IF;
      INSERT INTO usuarios (correo, nombre, google_sub, correo_verificado_en)
      VALUES (v_correo, v_nombre, p_sub, CASE WHEN p_correo_verificado THEN now() END)
      RETURNING * INTO u;
      INSERT INTO preferencias_usuario (usuario_id) VALUES (u.id) ON CONFLICT (usuario_id) DO NOTHING;
      v_nuevo := true;
    END IF;
  END IF;

  IF u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now() THEN
    RAISE EXCEPTION 'La cuenta está bloqueada por intentos fallidos. Espera 15 minutos.'
      USING ERRCODE = 'NX007', HINT = 'cuenta_bloqueada';
  END IF;
  -- Google verificó el correo: si la cuenta no lo tenía verificado y es el mismo, queda verificado.
  IF u.correo_verificado_en IS NULL AND p_correo_verificado AND u.correo = v_correo THEN
    UPDATE usuarios SET correo_verificado_en = now() WHERE id = u.id;
  END IF;
  IF fn_2fa_activa(u.id) THEN
    PERFORM fn_2fa_crear_desafio(u.id, p_token_hash, 'google');
    RETURN jsonb_build_object('estado', '2fa', 'nuevo', v_nuevo);
  END IF;
  PERFORM fn_auth_crear_sesion(u.id, p_token_hash, p_ip, p_dispositivo, p_expira);
  RETURN jsonb_build_object('estado', 'ok', 'nuevo', v_nuevo, 'usuario', fn_usuario_json(u.id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Desvincular Google: solo si la cuenta tiene contraseña (si no, la persona se quedaría sin acceso). */
CREATE OR REPLACE FUNCTION proc_auth_google_desvincular(p_actor_id uuid) RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_actor_id AND eliminado_en IS NULL FOR UPDATE;
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró tu cuenta.' USING ERRCODE = 'NX006', HINT = 'no_encontrado';
  END IF;
  IF u.hash_contrasena IS NULL THEN
    RAISE EXCEPTION 'Crea una contraseña antes de desvincular Google; si no, no podrías entrar.'
      USING ERRCODE = 'NX007', HINT = 'sin_contrasena';
  END IF;
  UPDATE usuarios SET google_sub = NULL WHERE id = u.id;
  RETURN jsonb_build_object('google', false);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Comprueba (y consume) un segundo factor para una acción sensible, p. ej. eliminar la cuenta sin contraseña. */
CREATE OR REPLACE FUNCTION proc_2fa_verificar(p_actor_id uuid, p_paso bigint, p_respaldo_hash text) RETURNS jsonb AS $$
  SELECT jsonb_build_object('valido', fn_2fa_activa(p_actor_id) AND fn_2fa_validar(p_actor_id, p_paso, p_respaldo_hash));
$$ LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp;

/** Estado de la cuenta (PF-02; 0037 suma la 2FA y 0038 si Google está vinculado). */
CREATE OR REPLACE FUNCTION proc_auth_cuenta(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'correo', u.correo, 'correo_verificado', u.correo_verificado_en IS NOT NULL,
    'tiene_contrasena', u.hash_contrasena IS NOT NULL,
    'dos_pasos', fn_2fa_activa(u.id),
    'google', u.google_sub IS NOT NULL,
    'sesiones_activas', (SELECT count(*)::int FROM sesiones s
                          WHERE s.usuario_id = u.id AND s.revocada_en IS NULL AND s.expira_en > now()))
    FROM usuarios u WHERE u.id = p_actor_id AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration

DROP FUNCTION IF EXISTS proc_2fa_verificar(uuid, bigint, text);
DROP FUNCTION IF EXISTS proc_auth_google_desvincular(uuid);
DROP FUNCTION IF EXISTS proc_auth_google(text, text, boolean, text, uuid, bytea, text, text, timestamptz);

CREATE OR REPLACE FUNCTION proc_auth_cuenta(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'correo', u.correo, 'correo_verificado', u.correo_verificado_en IS NOT NULL,
    'tiene_contrasena', u.hash_contrasena IS NOT NULL,
    'dos_pasos', fn_2fa_activa(u.id),
    'sesiones_activas', (SELECT count(*)::int FROM sesiones s
                          WHERE s.usuario_id = u.id AND s.revocada_en IS NULL AND s.expira_en > now()))
    FROM usuarios u WHERE u.id = p_actor_id AND u.eliminado_en IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
