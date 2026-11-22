-- Rol «Soporte de Nexo» (docs/15_Rol_Soporte.md, decidido por Luis el 2026-11-21).
-- Las cuentas de soporte son un TIPO de cuenta: sin espacio personal ni equipos, con verificación en
-- dos pasos obligatoria y sin Google. La BD impide que pertenezcan a equipos o tengan tareas, y los
-- procesos del panel y de cuentas exigen cuenta de soporte, permiso y 2FA. Herramientas de ayuda
-- (buscar por correo exacto, reenviar la verificación, desbloquear) con bitácora, y cifras de la
-- plataforma sin datos personales. Alta de cuentas de soporte solo por otra cuenta de soporte con
-- `soporte.alta` o por un desarrollador (db:soporte). Pruebas: P250–P255. Documentación: docs/08, «Rol de soporte».

-- Up Migration

ALTER TABLE usuarios ADD COLUMN tipo_cuenta text NOT NULL DEFAULT 'persona'
  CONSTRAINT ck_usuarios_tipo_cuenta CHECK (tipo_cuenta IN ('persona', 'soporte'));
COMMENT ON COLUMN usuarios.tipo_cuenta IS 'persona (usa Nexo) o soporte (atiende Nexo; docs/15). Lo fija db:soporte.';

ALTER TABLE permisos_sistema DROP CONSTRAINT permisos_sistema_permiso_check,
  ADD CONSTRAINT ck_permisos_sistema_permiso CHECK (permiso IN ('contacto.ver', 'contacto.gestionar', 'cuentas.ayudar', 'soporte.alta'));

CREATE TABLE soporte_bitacora (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  accion     text NOT NULL CHECK (accion IN ('buscar_cuenta', 'desbloquear', 'reenviar_verificacion', 'crear_soporte')),
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  detalles   jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ix_soporte_bitacora_creado ON soporte_bitacora (creado_en DESC);
COMMENT ON TABLE soporte_bitacora IS 'Lo que hace una cuenta de soporte sobre otra cuenta (docs/15 §4).';

-- ---------------------------------------------------------------------------------------------
-- 1. Las cuentas de soporte no pertenecen a equipos ni tienen tareas (lo impide la BD)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_es_soporte(p_usuario uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario AND tipo_cuenta = 'soporte');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_bloquear_soporte() RETURNS trigger AS $$
DECLARE v uuid;
BEGIN
  -- Ramas separadas: PL/pgSQL solo evalúa la de la tabla que disparó (cada una tiene otra columna).
  IF TG_TABLE_NAME = 'membresias' THEN v := NEW.usuario_id;
  ELSIF TG_TABLE_NAME = 'equipos' THEN v := NEW.creado_por;
  ELSE v := NEW.dueno_id;
  END IF;
  IF v IS NOT NULL AND fn_es_soporte(v) THEN
    RAISE EXCEPTION 'Las cuentas de soporte no tienen equipos ni tareas.' USING ERRCODE = 'NX005', HINT = 'cuenta_soporte';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_membresias_sin_soporte BEFORE INSERT ON membresias FOR EACH ROW EXECUTE FUNCTION fn_bloquear_soporte();
CREATE TRIGGER trg_equipos_sin_soporte BEFORE INSERT ON equipos FOR EACH ROW EXECUTE FUNCTION fn_bloquear_soporte();
CREATE TRIGGER trg_tareas_sin_soporte BEFORE INSERT ON tareas FOR EACH ROW EXECUTE FUNCTION fn_bloquear_soporte();

CREATE OR REPLACE FUNCTION fn_usuario_json(p_usuario uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
           'id', u.id, 'correo', u.correo, 'nombre', u.nombre, 'cargo', u.cargo,
           'descripcion', u.descripcion, 'zona_horaria', u.zona_horaria, 'avatar_url', u.avatar_url,
           'tipo_cuenta', u.tipo_cuenta)
    FROM usuarios u WHERE u.id = p_usuario;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 2. Panel de contacto: solo cuentas de soporte con 2FA
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_contacto_exigir(p_actor uuid, p_permiso text) RETURNS void AS $$
BEGIN
  IF p_actor IS NULL OR NOT fn_es_soporte(p_actor) OR NOT fn_permiso_sistema(p_actor, p_permiso) THEN
    RAISE EXCEPTION 'Esta sección es solo para el equipo de soporte de Nexo.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF NOT fn_2fa_activa(p_actor) THEN
    RAISE EXCEPTION 'Activa la verificación en dos pasos para usar las herramientas de soporte.'
      USING ERRCODE = 'NX005', HINT = 'dos_pasos_requerido';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

/** Qué puede hacer la cuenta en el tablero de soporte (para la web; los procesos lo vuelven a exigir). */
CREATE OR REPLACE FUNCTION proc_contacto_permisos(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'soporte', fn_es_soporte(p_actor_id),
    'ver', fn_es_soporte(p_actor_id) AND fn_permiso_sistema(p_actor_id, 'contacto.ver'),
    'gestionar', fn_es_soporte(p_actor_id) AND fn_permiso_sistema(p_actor_id, 'contacto.gestionar'),
    'cuentas', fn_es_soporte(p_actor_id) AND fn_permiso_sistema(p_actor_id, 'cuentas.ayudar'),
    'dos_pasos', fn_2fa_activa(p_actor_id));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION fn_permiso_sistema_asignar(p_correo text, p_permiso text, p_otorgar boolean) RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM usuarios WHERE correo = lower(btrim(p_correo)) AND eliminado_en IS NULL;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No hay una cuenta con ese correo.' USING ERRCODE = 'NX006', HINT = 'no_encontrado';
  END IF;
  IF p_permiso NOT IN ('contacto.ver', 'contacto.gestionar', 'cuentas.ayudar', 'soporte.alta') THEN
    RAISE EXCEPTION 'Permiso desconocido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF p_otorgar THEN
    INSERT INTO permisos_sistema (usuario_id, permiso) VALUES (v_id, p_permiso) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM permisos_sistema WHERE usuario_id = v_id AND permiso = p_permiso;
  END IF;
  RETURN jsonb_build_object('usuario_id', v_id,
    'permisos', coalesce((SELECT jsonb_agg(permiso ORDER BY permiso) FROM permisos_sistema WHERE usuario_id = v_id), '[]'::jsonb));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 3. Google: no para cuentas de soporte
-- ---------------------------------------------------------------------------------------------

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

  -- Vincular (con sesión). Las cuentas de soporte no usan Google (docs/15 §3).
  IF p_actor_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM usuarios WHERE id = p_actor_id AND tipo_cuenta = 'soporte') THEN
      RAISE EXCEPTION 'Las cuentas de soporte entran con contraseña y verificación en dos pasos.'
        USING ERRCODE = 'NX005', HINT = 'soporte_sin_google';
    END IF;
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
      IF u.tipo_cuenta = 'soporte' THEN
        RAISE EXCEPTION 'Las cuentas de soporte entran con contraseña y verificación en dos pasos.'
          USING ERRCODE = 'NX005', HINT = 'soporte_sin_google';
      END IF;
      IF u.correo_verificado_en IS NULL OR NOT p_correo_verificado THEN
        RAISE EXCEPTION 'Ya existe una cuenta con ese correo. Entra con tu contraseña.'
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

  IF u.tipo_cuenta = 'soporte' THEN
    RAISE EXCEPTION 'Las cuentas de soporte entran con contraseña y verificación en dos pasos.'
      USING ERRCODE = 'NX005', HINT = 'soporte_sin_google';
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

-- ---------------------------------------------------------------------------------------------
-- 4. Ayuda con cuentas (cuentas.ayudar) y cifras de la plataforma
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_soporte_exigir(p_actor uuid, p_permiso text) RETURNS void AS $$
BEGIN
  PERFORM fn_contacto_exigir(p_actor, p_permiso);
END $$ LANGUAGE plpgsql STABLE;

/** Estado de una cuenta para soporte: nada del contenido de sus equipos. */
CREATE OR REPLACE FUNCTION fn_soporte_cuenta_json(u usuarios) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', u.id, 'nombre', u.nombre, 'correo', u.correo::text,
    'creada_en', fn_iso(u.creado_en),
    'correo_verificado', u.correo_verificado_en IS NOT NULL,
    'bloqueada_hasta', CASE WHEN u.bloqueado_hasta > now() THEN fn_iso(u.bloqueado_hasta) END,
    'intentos_fallidos', u.intentos_fallidos,
    'dos_pasos', fn_2fa_activa(u.id),
    'google', u.google_sub IS NOT NULL,
    'tiene_contrasena', u.hash_contrasena IS NOT NULL,
    'equipos_activos', (SELECT count(*)::int FROM membresias m WHERE m.usuario_id = u.id AND m.estado = 'activa'),
    'ultima_actividad_en', fn_iso(u.ultima_actividad_en));
$$ LANGUAGE sql STABLE;

/** Busca UNA cuenta por correo exacto (sin listados). Queda en la bitácora, también si no la encuentra. No muestra cuentas de soporte. */
CREATE OR REPLACE FUNCTION proc_soporte_buscar_cuenta(p_actor_id uuid, p_correo text) RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'cuentas.ayudar');
  SELECT * INTO u FROM usuarios
   WHERE correo = lower(btrim(coalesce(p_correo, ''))) AND eliminado_en IS NULL AND tipo_cuenta = 'persona';
  INSERT INTO soporte_bitacora (actor_id, accion, usuario_id, detalles)
  VALUES (p_actor_id, 'buscar_cuenta', u.id, jsonb_build_object('encontrada', u.id IS NOT NULL));
  -- Sin excepción: así la búsqueda fallida también queda en la bitácora (una excepción la desharía).
  IF u.id IS NULL THEN RETURN jsonb_build_object('encontrada', false); END IF;
  RETURN jsonb_build_object('encontrada', true, 'cuenta', fn_soporte_cuenta_json(u));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Quita el bloqueo por intentos fallidos (la persona pidió ayuda). */
CREATE OR REPLACE FUNCTION proc_soporte_desbloquear(p_actor_id uuid, p_usuario_id uuid) RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'cuentas.ayudar');
  UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL
   WHERE id = p_usuario_id AND eliminado_en IS NULL AND tipo_cuenta = 'persona'
  RETURNING * INTO u;
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta.' USING ERRCODE = 'NX006', HINT = 'cuenta_no_encontrada';
  END IF;
  INSERT INTO soporte_bitacora (actor_id, accion, usuario_id) VALUES (p_actor_id, 'desbloquear', u.id);
  RETURN fn_soporte_cuenta_json(u);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Nuevo enlace de verificación de correo para otra persona (el de siempre, 24 h; los anteriores dejan
 * de servir). La API lo manda por correo. NX007 si el correo ya está verificado.
 */
CREATE OR REPLACE FUNCTION proc_soporte_reenviar_verificacion(p_actor_id uuid, p_usuario_id uuid, p_token_hash bytea, p_expira timestamptz)
RETURNS jsonb AS $$
DECLARE u usuarios;
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'cuentas.ayudar');
  SELECT * INTO u FROM usuarios WHERE id = p_usuario_id AND eliminado_en IS NULL AND tipo_cuenta = 'persona';
  IF u.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta.' USING ERRCODE = 'NX006', HINT = 'cuenta_no_encontrada';
  END IF;
  IF u.correo_verificado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Ese correo ya está verificado.' USING ERRCODE = 'NX007', HINT = 'ya_verificado';
  END IF;
  UPDATE tokens_verificacion SET usado_en = now()
   WHERE usuario_id = u.id AND tipo = 'verificar_correo' AND usado_en IS NULL;
  INSERT INTO tokens_verificacion (usuario_id, tipo, token_hash, expira_en)
  VALUES (u.id, 'verificar_correo', p_token_hash, p_expira);
  INSERT INTO soporte_bitacora (actor_id, accion, usuario_id) VALUES (p_actor_id, 'reenviar_verificacion', u.id);
  RETURN jsonb_build_object('correo', u.correo::text, 'nombre', u.nombre);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Últimas acciones de soporte sobre cuentas. */
CREATE OR REPLACE FUNCTION proc_soporte_bitacora(p_actor_id uuid, p_limite int) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'cuentas.ayudar');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', b.id, 'accion', b.accion, 'actor', fn_contacto_persona_json(b.actor_id),
             'cuenta', (SELECT correo::text FROM usuarios WHERE id = b.usuario_id),
             'detalles', b.detalles, 'creado_en', fn_iso(b.creado_en)) ORDER BY b.creado_en DESC)
      FROM (SELECT * FROM soporte_bitacora ORDER BY creado_en DESC LIMIT least(greatest(coalesce(p_limite, 50), 1), 200)) b),
    '[]'::jsonb);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Cifras de la plataforma, sin datos personales (no cuenta las cuentas de soporte). */
CREATE OR REPLACE FUNCTION proc_soporte_plataforma(p_actor_id uuid) RETURNS jsonb AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'contacto.ver');
  WITH p AS (SELECT * FROM usuarios WHERE eliminado_en IS NULL AND tipo_cuenta = 'persona')
  SELECT jsonb_build_object(
    'cuentas', (SELECT count(*)::int FROM p),
    'nuevas_7_dias', (SELECT count(*)::int FROM p WHERE creado_en > now() - interval '7 days'),
    'verificadas', (SELECT count(*)::int FROM p WHERE correo_verificado_en IS NOT NULL),
    'con_dos_pasos', (SELECT count(*)::int FROM p WHERE fn_2fa_activa(p.id)),
    'con_google', (SELECT count(*)::int FROM p WHERE google_sub IS NOT NULL),
    'activas_30_dias', (SELECT count(*)::int FROM p WHERE ultima_actividad_en > now() - interval '30 days'),
    'equipos_activos', (SELECT count(*)::int FROM equipos e WHERE e.archivado_en IS NULL),
    'altas_por_semana', coalesce((
      SELECT jsonb_agg(jsonb_build_object('semana', to_char(s, 'YYYY-MM-DD'),
                                          'altas', (SELECT count(*)::int FROM p WHERE date_trunc('week', p.creado_en) = s)) ORDER BY s)
        FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') s), '[]'::jsonb))
    INTO r;
  RETURN r;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;


-- ---------------------------------------------------------------------------------------------
-- 5. Alta de cuentas de soporte: solo otra cuenta de soporte con `soporte.alta` o un desarrollador
--    con el script db:soporte. Nadie elige ser soporte al registrarse (docs/15 §1).
-- ---------------------------------------------------------------------------------------------

/** El equipo de soporte (cuentas de soporte activas). */
CREATE OR REPLACE FUNCTION proc_soporte_equipo_listar(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'contacto.ver');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', u.id, 'nombre', u.nombre, 'correo', u.correo::text,
             'dos_pasos', fn_2fa_activa(u.id), 'activa', u.hash_contrasena IS NOT NULL,
             'permisos', coalesce((SELECT jsonb_agg(ps.permiso ORDER BY ps.permiso) FROM permisos_sistema ps WHERE ps.usuario_id = u.id), '[]'::jsonb),
             'creada_en', fn_iso(u.creado_en), 'ultima_actividad_en', fn_iso(u.ultima_actividad_en)) ORDER BY u.nombre)
      FROM usuarios u WHERE u.tipo_cuenta = 'soporte' AND u.eliminado_en IS NULL), '[]'::jsonb);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Otra cuenta de soporte (requiere `soporte.alta`). Se crea sin contraseña: la persona la elige con
 * el enlace de un solo uso (el de restablecer, 72 h) y al entrar debe activar la 2FA. Recibe los
 * permisos del panel y de ayuda; `p_puede_dar_alta` le da también `soporte.alta`.
 * Un correo que ya tiene cuenta no se convierte: NX012.
 */
CREATE OR REPLACE FUNCTION proc_soporte_crear_cuenta(
  p_actor_id uuid, p_correo text, p_nombre text, p_puede_dar_alta boolean, p_token_hash bytea, p_expira timestamptz
) RETURNS jsonb AS $$
DECLARE v_id uuid; v_correo text := lower(btrim(coalesce(p_correo, ''))); v_nombre text := btrim(coalesce(p_nombre, ''));
BEGIN
  PERFORM fn_soporte_exigir(p_actor_id, 'soporte.alta');
  IF v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_nombre) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Revisa el correo y el nombre.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE correo = v_correo) THEN
    RAISE EXCEPTION 'Ese correo ya tiene una cuenta. Las cuentas de soporte usan un correo propio.'
      USING ERRCODE = 'NX012', HINT = 'correo_registrado';
  END IF;
  INSERT INTO usuarios (correo, nombre, tipo_cuenta) VALUES (v_correo, v_nombre, 'soporte') RETURNING id INTO v_id;
  INSERT INTO preferencias_usuario (usuario_id, tour_visto) VALUES (v_id, true) ON CONFLICT (usuario_id) DO NOTHING;
  INSERT INTO permisos_sistema (usuario_id, permiso)
  SELECT v_id, x FROM unnest(ARRAY['contacto.ver', 'contacto.gestionar', 'cuentas.ayudar']
                             || CASE WHEN p_puede_dar_alta THEN ARRAY['soporte.alta'] ELSE ARRAY[]::text[] END) x;
  INSERT INTO tokens_verificacion (usuario_id, tipo, token_hash, expira_en)
  VALUES (v_id, 'restablecer_contrasena', p_token_hash, p_expira);
  INSERT INTO soporte_bitacora (actor_id, accion, usuario_id, detalles)
  VALUES (p_actor_id, 'crear_soporte', v_id, jsonb_build_object('puede_dar_alta', coalesce(p_puede_dar_alta, false)));
  RETURN jsonb_build_object('id', v_id, 'correo', v_correo, 'nombre', v_nombre);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration

DROP FUNCTION IF EXISTS proc_soporte_crear_cuenta(uuid, text, text, boolean, bytea, timestamptz);
DROP FUNCTION IF EXISTS proc_soporte_equipo_listar(uuid);
DROP FUNCTION IF EXISTS proc_soporte_plataforma(uuid);
DROP FUNCTION IF EXISTS proc_soporte_bitacora(uuid, int);
DROP FUNCTION IF EXISTS proc_soporte_reenviar_verificacion(uuid, uuid, bytea, timestamptz);
DROP FUNCTION IF EXISTS proc_soporte_desbloquear(uuid, uuid);
DROP FUNCTION IF EXISTS proc_soporte_buscar_cuenta(uuid, text);
DROP FUNCTION IF EXISTS fn_soporte_cuenta_json(usuarios);
DROP FUNCTION IF EXISTS fn_soporte_exigir(uuid, text);

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
        RAISE EXCEPTION 'Ya existe una cuenta con ese correo. Entra con tu contraseña.'
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

CREATE OR REPLACE FUNCTION fn_permiso_sistema_asignar(p_correo text, p_permiso text, p_otorgar boolean) RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM usuarios WHERE correo = lower(btrim(p_correo)) AND eliminado_en IS NULL;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No hay una cuenta con ese correo.' USING ERRCODE = 'NX006', HINT = 'no_encontrado';
  END IF;
  IF p_permiso NOT IN ('contacto.ver', 'contacto.gestionar') THEN
    RAISE EXCEPTION 'Permiso desconocido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF p_otorgar THEN
    INSERT INTO permisos_sistema (usuario_id, permiso) VALUES (v_id, p_permiso) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM permisos_sistema WHERE usuario_id = v_id AND permiso = p_permiso;
  END IF;
  RETURN jsonb_build_object('usuario_id', v_id,
    'permisos', coalesce((SELECT jsonb_agg(permiso ORDER BY permiso) FROM permisos_sistema WHERE usuario_id = v_id), '[]'::jsonb));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP FUNCTION IF EXISTS proc_contacto_permisos(uuid);
CREATE OR REPLACE FUNCTION proc_contacto_permisos(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object('ver', fn_permiso_sistema(p_actor_id, 'contacto.ver'),
                            'gestionar', fn_permiso_sistema(p_actor_id, 'contacto.gestionar'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION fn_contacto_exigir(p_actor uuid, p_permiso text) RETURNS void AS $$
BEGIN
  IF p_actor IS NULL OR NOT fn_permiso_sistema(p_actor, p_permiso) THEN
    RAISE EXCEPTION 'No tienes permiso para el panel de contacto.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_usuario_json(p_usuario uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
           'id', u.id, 'correo', u.correo, 'nombre', u.nombre, 'cargo', u.cargo,
           'descripcion', u.descripcion, 'zona_horaria', u.zona_horaria, 'avatar_url', u.avatar_url)
    FROM usuarios u WHERE u.id = p_usuario;
$$ LANGUAGE sql STABLE;

DROP TRIGGER IF EXISTS trg_tareas_sin_soporte ON tareas;
DROP TRIGGER IF EXISTS trg_equipos_sin_soporte ON equipos;
DROP TRIGGER IF EXISTS trg_membresias_sin_soporte ON membresias;
DROP FUNCTION IF EXISTS fn_bloquear_soporte();
DROP FUNCTION IF EXISTS fn_es_soporte(uuid);
DROP TABLE IF EXISTS soporte_bitacora;
DELETE FROM permisos_sistema WHERE permiso IN ('cuentas.ayudar', 'soporte.alta');
ALTER TABLE permisos_sistema DROP CONSTRAINT ck_permisos_sistema_permiso,
  ADD CONSTRAINT permisos_sistema_permiso_check CHECK (permiso IN ('contacto.ver', 'contacto.gestionar'));
ALTER TABLE usuarios DROP COLUMN tipo_cuenta;
