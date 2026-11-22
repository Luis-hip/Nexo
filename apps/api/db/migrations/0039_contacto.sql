-- Módulo de contacto y soporte completo (docs/12_Plan_Contacto.md; ajustes al repo en
-- docs/13_Plan_Integrado_Pendientes.md, sección 2). Amplía `contacto_mensajes` (existe desde 0001, PUB-08)
-- sin perder lo guardado y agrega el hilo (`contacto_eventos`), el outbox de notificaciones, los
-- límites anti-abuso y los permisos de sistema del panel. Sustituye a `proc_contacto_enviar` (0004).
-- Pruebas: P242–P249. Documentación: docs/08, sección «Contacto».

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------------------------

CREATE SEQUENCE contacto_folio_seq START 1;

ALTER TABLE contacto_mensajes
  ADD COLUMN folio                  text,
  ADD COLUMN tipo                   text,
  ADD COLUMN estado                 text NOT NULL DEFAULT 'nuevo',
  ADD COLUMN prioridad              text NOT NULL DEFAULT 'normal',
  ADD COLUMN usuario_id             uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN contexto               jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN token_seguimiento_hash text,
  ADD COLUMN ip_hash                text,
  ADD COLUMN user_agent             text,
  ADD COLUMN asignado_a             uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN anonimizado            boolean NOT NULL DEFAULT false,
  ADD COLUMN actualizado_en         timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN resuelto_en            timestamptz;

-- Los mensajes de PUB-08 (antes de este módulo) reciben folio, tipo y un token que nadie conoce
-- (no tenían seguimiento); los ya atendidos quedan «en revisión».
UPDATE contacto_mensajes m SET
  folio = 'NX-' || to_char(m.creado_en, 'YYYY') || '-' || lpad(nextval('contacto_folio_seq')::text, 6, '0'),
  tipo = CASE m.asunto WHEN 'Error' THEN 'error' WHEN 'Sugerencia' THEN 'sugerencia' ELSE 'duda' END,
  estado = CASE WHEN m.atendido_en IS NOT NULL THEN 'en_revision' ELSE 'nuevo' END,
  token_seguimiento_hash = encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex')
 FROM (SELECT id FROM contacto_mensajes ORDER BY creado_en) o
 WHERE o.id = m.id;

ALTER TABLE contacto_mensajes
  ALTER COLUMN folio SET NOT NULL,
  ALTER COLUMN tipo SET NOT NULL,
  ALTER COLUMN token_seguimiento_hash SET NOT NULL,
  ADD CONSTRAINT uq_contacto_folio UNIQUE (folio),
  ADD CONSTRAINT ck_contacto_tipo CHECK (tipo IN ('duda', 'error', 'sugerencia')),
  ADD CONSTRAINT ck_contacto_estado CHECK (estado IN ('nuevo', 'en_revision', 'esperando_usuario', 'resuelto', 'descartado')),
  ADD CONSTRAINT ck_contacto_prioridad CHECK (prioridad IN ('baja', 'normal', 'alta')),
  ADD CONSTRAINT ck_contacto_asunto CHECK (char_length(asunto) BETWEEN 3 AND 150),
  ADD CONSTRAINT ck_contacto_user_agent CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  DROP CONSTRAINT contacto_mensajes_mensaje_check,
  ADD CONSTRAINT ck_contacto_mensaje CHECK (char_length(mensaje) BETWEEN 10 AND 5000 OR anonimizado);

CREATE TRIGGER trg_contacto_tocar BEFORE UPDATE ON contacto_mensajes
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado();

CREATE INDEX ix_contacto_estado_creado ON contacto_mensajes (estado, creado_en DESC);
CREATE INDEX ix_contacto_tipo          ON contacto_mensajes (tipo);
CREATE INDEX ix_contacto_asignado      ON contacto_mensajes (asignado_a) WHERE asignado_a IS NOT NULL;
CREATE INDEX ix_contacto_usuario       ON contacto_mensajes (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX ix_contacto_correo        ON contacto_mensajes (lower(correo::text));
CREATE INDEX ix_contacto_busqueda ON contacto_mensajes
  USING GIN (to_tsvector('spanish', coalesce(asunto, '') || ' ' || coalesce(mensaje, '') || ' ' || coalesce(nombre, '')));

CREATE TABLE contacto_eventos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id  uuid NOT NULL REFERENCES contacto_mensajes(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL CHECK (tipo_evento IN
              ('creado', 'nota_interna', 'respuesta', 'cambio_estado', 'cambio_prioridad', 'asignacion', 'sistema')),
  autor_id    uuid REFERENCES usuarios(id) ON DELETE SET NULL,   -- NULL = sistema o remitente
  contenido   text CHECK (contenido IS NULL OR char_length(contenido) <= 5000),
  metadatos   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- clock_timestamp(): varios eventos de una misma transacción (responder + cambiar estado) quedan en orden.
  creado_en   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ix_contacto_eventos_mensaje ON contacto_eventos (mensaje_id, creado_en);

CREATE TABLE contacto_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id      uuid NOT NULL REFERENCES contacto_mensajes(id) ON DELETE CASCADE,
  evento_id       uuid REFERENCES contacto_eventos(id) ON DELETE SET NULL,
  canal           text NOT NULL DEFAULT 'correo' CHECK (canal IN ('correo', 'whatsapp')),
  plantilla       text NOT NULL CHECK (plantilla IN ('aviso_equipo', 'confirmacion_remitente', 'respuesta_remitente')),
  destinatario    text NOT NULL,
  -- Datos que solo necesita el envío (el token de seguimiento, cifrado). Se borran al enviarse.
  datos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'procesando', 'enviado', 'fallido')),
  intentos        int NOT NULL DEFAULT 0,
  proximo_intento timestamptz NOT NULL DEFAULT now(),
  ultimo_error    text,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  enviado_en      timestamptz
);
CREATE INDEX ix_contacto_outbox_pendientes ON contacto_outbox (proximo_intento) WHERE estado IN ('pendiente', 'procesando');
CREATE INDEX ix_contacto_outbox_mensaje ON contacto_outbox (mensaje_id);

-- Límites en la BD (no en memoria): la API puede tener más de una instancia.
CREATE TABLE contacto_intentos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_clave text NOT NULL CHECK (tipo_clave IN ('ip', 'correo', 'global')),
  clave_hash text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_contacto_intentos_clave ON contacto_intentos (tipo_clave, clave_hash, creado_en DESC);

-- Permisos de sistema (Nexo no tiene roles de sistema: los roles son por equipo). Se otorgan con el
-- script `db:permiso`, nunca desde la web (docs/13, 1.4).
CREATE TABLE permisos_sistema (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  permiso     text NOT NULL CHECK (permiso IN ('contacto.ver', 'contacto.gestionar')),
  otorgado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, permiso)
);

COMMENT ON TABLE contacto_eventos IS 'Hilo y bitácora de cada mensaje de contacto (notas internas, respuestas, cambios).';
COMMENT ON TABLE contacto_outbox IS 'Notificaciones de contacto por enviar (correo; WhatsApp reservado). Lo procesa el ciclo de trabajos.';
COMMENT ON TABLE contacto_intentos IS 'Envíos del formulario de contacto por IP, correo y global (HMAC), para los límites.';
COMMENT ON TABLE permisos_sistema IS 'Permisos que no son de equipo (panel de contacto). Se otorgan con db:permiso.';

-- ---------------------------------------------------------------------------------------------
-- 2. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/** ¿Tiene el permiso de sistema? `contacto.gestionar` incluye `contacto.ver`. */
CREATE OR REPLACE FUNCTION fn_permiso_sistema(p_usuario uuid, p_permiso text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM permisos_sistema ps JOIN usuarios u ON u.id = ps.usuario_id AND u.eliminado_en IS NULL
     WHERE ps.usuario_id = p_usuario
       AND (ps.permiso = p_permiso OR (p_permiso = 'contacto.ver' AND ps.permiso = 'contacto.gestionar')));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_contacto_exigir(p_actor uuid, p_permiso text) RETURNS void AS $$
BEGIN
  IF p_actor IS NULL OR NOT fn_permiso_sistema(p_actor, p_permiso) THEN
    RAISE EXCEPTION 'No tienes permiso para el panel de contacto.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

/** Matriz de transiciones (plan 4.1). */
CREATE OR REPLACE FUNCTION fn_contacto_transicion_valida(p_de text, p_a text) RETURNS boolean AS $$
  SELECT CASE p_de
    WHEN 'nuevo'             THEN p_a IN ('en_revision', 'resuelto', 'descartado')
    WHEN 'en_revision'       THEN p_a IN ('esperando_usuario', 'resuelto', 'descartado')
    WHEN 'esperando_usuario' THEN p_a IN ('en_revision', 'resuelto', 'descartado')
    WHEN 'resuelto'          THEN p_a = 'en_revision'
    WHEN 'descartado'        THEN p_a = 'en_revision'
    ELSE false END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_contacto_persona_json(p_usuario uuid) RETURNS jsonb AS $$
  SELECT CASE WHEN p_usuario IS NULL THEN NULL
         ELSE (SELECT jsonb_build_object('id', u.id, 'nombre', u.nombre) FROM usuarios u WHERE u.id = p_usuario) END;
$$ LANGUAGE sql STABLE;

/** Un mensaje para el panel (sin hashes de token ni de IP). */
CREATE OR REPLACE FUNCTION fn_contacto_json(m contacto_mensajes, p_completo boolean) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'folio', m.folio, 'tipo', m.tipo, 'estado', m.estado, 'prioridad', m.prioridad,
    'nombre', m.nombre, 'correo', m.correo::text, 'asunto', m.asunto,
    'registrado', m.usuario_id IS NOT NULL,
    'asignado', fn_contacto_persona_json(m.asignado_a),
    'anonimizado', m.anonimizado,
    'creado_en', fn_iso(m.creado_en), 'actualizado_en', fn_iso(m.actualizado_en),
    'atendido_en', fn_iso(m.atendido_en), 'resuelto_en', fn_iso(m.resuelto_en))
  || CASE WHEN p_completo
          THEN jsonb_build_object('mensaje', m.mensaje, 'contexto', m.contexto, 'user_agent', m.user_agent)
          ELSE jsonb_build_object('extracto', left(m.mensaje, 160)) END;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_contacto_evento_json(e contacto_eventos) RETURNS jsonb AS $$
  SELECT jsonb_build_object('id', e.id, 'tipo', e.tipo_evento, 'autor', fn_contacto_persona_json(e.autor_id),
                            'contenido', e.contenido, 'metadatos', e.metadatos, 'creado_en', fn_iso(e.creado_en));
$$ LANGUAGE sql STABLE;

/** El mensaje bloqueado para escribir; NX006 si no existe. */
CREATE OR REPLACE FUNCTION fn_contacto_bloquear(p_id uuid) RETURNS contacto_mensajes AS $$
DECLARE m contacto_mensajes;
BEGIN
  SELECT * INTO m FROM contacto_mensajes WHERE id = p_id FOR UPDATE;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  RETURN m;
END $$ LANGUAGE plpgsql;

/** Cambia el estado validando la transición, con su evento y las fechas de atención y resolución. */
CREATE OR REPLACE FUNCTION fn_contacto_estado(p_id uuid, p_estado text, p_autor uuid) RETURNS contacto_mensajes AS $$
DECLARE m contacto_mensajes; v_de text;
BEGIN
  m := fn_contacto_bloquear(p_id);
  v_de := m.estado;
  IF m.estado = p_estado THEN RETURN m; END IF;
  IF NOT fn_contacto_transicion_valida(m.estado, p_estado) THEN
    RAISE EXCEPTION 'No se puede pasar de «%» a «%».', m.estado, p_estado USING ERRCODE = 'NX007', HINT = 'transicion_invalida';
  END IF;
  UPDATE contacto_mensajes SET estado = p_estado,
         atendido_en = coalesce(atendido_en, now()),
         resuelto_en = CASE WHEN p_estado = 'resuelto' THEN now() WHEN p_estado = 'en_revision' THEN NULL ELSE resuelto_en END
   WHERE id = p_id RETURNING * INTO m;
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento, autor_id, metadatos)
  VALUES (p_id, 'cambio_estado', p_autor, jsonb_build_object('de', v_de, 'a', p_estado));
  RETURN m;
END $$ LANGUAGE plpgsql;

/** Filtros del panel (listar y exportar) sobre un mensaje. */
CREATE OR REPLACE FUNCTION fn_contacto_filtra(m contacto_mensajes, f jsonb, p_actor uuid) RETURNS boolean AS $$
  SELECT (NOT (f ? 'estado') OR jsonb_array_length(f->'estado') = 0 OR f->'estado' ? m.estado)
     AND (NOT (f ? 'tipo') OR jsonb_array_length(f->'tipo') = 0 OR f->'tipo' ? m.tipo)
     AND (NOT (f ? 'prioridad') OR jsonb_array_length(f->'prioridad') = 0 OR f->'prioridad' ? m.prioridad)
     AND (coalesce(f->>'asignado', '') = '' OR (f->>'asignado' = 'yo' AND m.asignado_a = p_actor)
          OR (f->>'asignado' = 'sin_asignar' AND m.asignado_a IS NULL)
          OR (f->>'asignado' NOT IN ('yo', 'sin_asignar') AND m.asignado_a::text = f->>'asignado'))
     AND (coalesce(f->>'desde', '') = '' OR m.creado_en >= (f->>'desde')::timestamptz)
     AND (coalesce(f->>'hasta', '') = '' OR m.creado_en < (f->>'hasta')::timestamptz)
     AND (coalesce(btrim(f->>'q'), '') = ''
          OR upper(m.folio) = upper(btrim(f->>'q'))
          OR lower(m.correo::text) = lower(btrim(f->>'q'))
          OR to_tsvector('spanish', coalesce(m.asunto, '') || ' ' || coalesce(m.mensaje, '') || ' ' || coalesce(m.nombre, ''))
             @@ plainto_tsquery('spanish', f->>'q'));
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 3. Público
-- ---------------------------------------------------------------------------------------------

/**
 * Límites del formulario (plan §4): por IP 3/hora y 10/día; por correo 3/día; global 200/hora.
 * Si se excede: NX013 (429) con `retry_after` en segundos en el DETAIL. Si no, registra el intento.
 */
CREATE OR REPLACE FUNCTION proc_contacto_verificar_limite(p_ip_hash text, p_correo_hash text) RETURNS jsonb AS $$
DECLARE v_espera int := 0;
BEGIN
  SELECT greatest(v_espera,
    coalesce((SELECT CASE WHEN count(*) >= 3 THEN ceil(extract(epoch FROM (min(creado_en) + interval '1 hour' - now())))::int END
                FROM contacto_intentos WHERE tipo_clave = 'ip' AND clave_hash = p_ip_hash AND creado_en > now() - interval '1 hour'), 0),
    coalesce((SELECT CASE WHEN count(*) >= 10 THEN ceil(extract(epoch FROM (min(creado_en) + interval '1 day' - now())))::int END
                FROM contacto_intentos WHERE tipo_clave = 'ip' AND clave_hash = p_ip_hash AND creado_en > now() - interval '1 day'), 0),
    coalesce((SELECT CASE WHEN count(*) >= 3 THEN ceil(extract(epoch FROM (min(creado_en) + interval '1 day' - now())))::int END
                FROM contacto_intentos WHERE tipo_clave = 'correo' AND clave_hash = p_correo_hash AND creado_en > now() - interval '1 day'), 0),
    coalesce((SELECT CASE WHEN count(*) >= 200 THEN ceil(extract(epoch FROM (min(creado_en) + interval '1 hour' - now())))::int END
                FROM contacto_intentos WHERE tipo_clave = 'global' AND creado_en > now() - interval '1 hour'), 0))
    INTO v_espera;
  IF v_espera > 0 THEN
    RAISE EXCEPTION 'Has enviado muchos mensajes. Intenta de nuevo en % minutos.', ceil(v_espera / 60.0)::int
      USING ERRCODE = 'NX013', HINT = 'limite_contacto', DETAIL = jsonb_build_object('retry_after', v_espera)::text;
  END IF;
  INSERT INTO contacto_intentos (tipo_clave, clave_hash)
  VALUES ('ip', coalesce(p_ip_hash, '')), ('correo', coalesce(p_correo_hash, '')), ('global', 'global');
  RETURN jsonb_build_object('permitido', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Crea el mensaje con su folio, el evento «creado» y el outbox: aviso al equipo (si hay destino) y
 * confirmación al remitente (con el token de seguimiento cifrado; el plano no se guarda).
 * `p_datos`: { tipo, nombre, correo, asunto, mensaje, contexto }. Con sesión, `p_usuario_id`.
 */
CREATE OR REPLACE FUNCTION proc_contacto_crear(
  p_datos jsonb, p_usuario_id uuid, p_token_hash text, p_token_cifrado text,
  p_ip_hash text, p_user_agent text, p_destino_equipo text
) RETURNS jsonb AS $$
DECLARE m contacto_mensajes; v_correo text; v_nombre text; v_ev uuid;
BEGIN
  IF p_usuario_id IS NOT NULL THEN
    SELECT nombre, correo::text INTO v_nombre, v_correo FROM usuarios WHERE id = p_usuario_id AND eliminado_en IS NULL;
  END IF;
  v_nombre := coalesce(v_nombre, btrim(p_datos->>'nombre'));
  v_correo := lower(btrim(coalesce(v_correo, p_datos->>'correo')));
  IF coalesce(p_datos->>'tipo', '') NOT IN ('duda', 'error', 'sugerencia')
     OR char_length(coalesce(v_nombre, '')) NOT BETWEEN 2 AND 100
     OR v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(v_correo) > 254
     OR char_length(btrim(coalesce(p_datos->>'asunto', ''))) NOT BETWEEN 3 AND 150
     OR char_length(btrim(coalesce(p_datos->>'mensaje', ''))) NOT BETWEEN 10 AND 5000
     OR coalesce(p_token_hash, '') = '' THEN
    RAISE EXCEPTION 'Revisa los datos del mensaje.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO contacto_mensajes (folio, tipo, usuario_id, nombre, correo, asunto, mensaje, contexto,
                                 token_seguimiento_hash, ip_hash, user_agent)
  VALUES ('NX-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('contacto_folio_seq')::text, 6, '0'),
          p_datos->>'tipo', p_usuario_id, v_nombre, v_correo, btrim(p_datos->>'asunto'), btrim(p_datos->>'mensaje'),
          coalesce(p_datos->'contexto', '{}'::jsonb), p_token_hash, p_ip_hash, left(p_user_agent, 300))
  RETURNING * INTO m;
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento) VALUES (m.id, 'creado') RETURNING id INTO v_ev;
  IF coalesce(btrim(p_destino_equipo), '') <> '' THEN
    INSERT INTO contacto_outbox (mensaje_id, evento_id, plantilla, destinatario)
    VALUES (m.id, v_ev, 'aviso_equipo', btrim(p_destino_equipo));
  END IF;
  INSERT INTO contacto_outbox (mensaje_id, evento_id, plantilla, destinatario, datos)
  VALUES (m.id, v_ev, 'confirmacion_remitente', v_correo, jsonb_build_object('token_cifrado', p_token_cifrado));
  RETURN jsonb_build_object('id', m.id, 'folio', m.folio);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Consulta pública con folio y token (como hash). Solo estado, fechas y las respuestas del equipo,
 * nunca notas internas. Folio inexistente y token incorrecto dan el MISMO error.
 */
CREATE OR REPLACE FUNCTION proc_contacto_seguimiento(p_folio text, p_token_hash text) RETURNS jsonb AS $$
DECLARE m contacto_mensajes;
BEGIN
  SELECT * INTO m FROM contacto_mensajes
   WHERE upper(folio) = upper(btrim(coalesce(p_folio, ''))) AND token_seguimiento_hash = coalesce(p_token_hash, '')
     AND NOT anonimizado;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos un mensaje con esos datos.' USING ERRCODE = 'NX006', HINT = 'seguimiento_no_encontrado';
  END IF;
  RETURN jsonb_build_object(
    'folio', m.folio, 'tipo', m.tipo, 'asunto', m.asunto, 'estado', m.estado,
    'creado_en', fn_iso(m.creado_en), 'actualizado_en', fn_iso(m.actualizado_en),
    'respuestas', coalesce((SELECT jsonb_agg(jsonb_build_object('contenido', e.contenido, 'creado_en', fn_iso(e.creado_en)) ORDER BY e.creado_en)
                              FROM contacto_eventos e WHERE e.mensaje_id = m.id AND e.tipo_evento = 'respuesta'), '[]'::jsonb));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Panel (contacto.ver / contacto.gestionar)
-- ---------------------------------------------------------------------------------------------

/** Qué puede hacer la persona en el panel (para la web; la API y los procesos lo vuelven a exigir). */
CREATE OR REPLACE FUNCTION proc_contacto_permisos(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object('ver', fn_permiso_sistema(p_actor_id, 'contacto.ver'),
                            'gestionar', fn_permiso_sistema(p_actor_id, 'contacto.gestionar'));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Bandeja con filtros y paginación del lado del servidor. */
CREATE OR REPLACE FUNCTION proc_contacto_listar(p_actor_id uuid, p_filtros jsonb) RETURNS jsonb AS $$
DECLARE
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_por int := least(greatest(coalesce((f->>'por_pagina')::int, 25), 1), 100);
  v_pag int := greatest(coalesce((f->>'pagina')::int, 1), 1);
  v_orden text := coalesce(f->>'orden', 'reciente');
  r jsonb;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.ver');
  WITH base AS (
    SELECT m.* FROM contacto_mensajes m WHERE fn_contacto_filtra(m, f, p_actor_id)
  ), pagina AS (
    SELECT b.* FROM base b
     ORDER BY CASE WHEN v_orden = 'prioridad' THEN CASE b.prioridad WHEN 'alta' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END END,
              CASE WHEN v_orden = 'antiguo' THEN b.creado_en END ASC,
              b.creado_en DESC
     LIMIT v_por OFFSET (v_pag - 1) * v_por
  )
  SELECT jsonb_build_object(
    'datos', coalesce((SELECT jsonb_agg(fn_contacto_json(p::contacto_mensajes, false)) FROM pagina p), '[]'::jsonb),
    'total', (SELECT count(*)::int FROM base), 'pagina', v_pag, 'por_pagina', v_por)
    INTO r;
  RETURN r;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Detalle: mensaje completo, hilo cronológico y envíos fallidos (para «Reintentar»). */
CREATE OR REPLACE FUNCTION proc_contacto_obtener(p_actor_id uuid, p_id uuid) RETURNS jsonb AS $$
DECLARE m contacto_mensajes;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.ver');
  SELECT * INTO m FROM contacto_mensajes WHERE id = p_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  RETURN fn_contacto_json(m, true) || jsonb_build_object(
    'eventos', coalesce((SELECT jsonb_agg(fn_contacto_evento_json(e) ORDER BY e.creado_en) FROM contacto_eventos e WHERE e.mensaje_id = m.id), '[]'::jsonb),
    'envios_fallidos', (SELECT count(*)::int FROM contacto_outbox o WHERE o.mensaje_id = m.id AND o.estado = 'fallido'));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_contacto_cambiar_estado(p_actor_id uuid, p_id uuid, p_estado text) RETURNS jsonb AS $$
DECLARE m contacto_mensajes;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  IF coalesce(p_estado, '') NOT IN ('nuevo', 'en_revision', 'esperando_usuario', 'resuelto', 'descartado') THEN
    RAISE EXCEPTION 'Estado inválido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  m := fn_contacto_estado(p_id, p_estado, p_actor_id);
  RETURN fn_contacto_json(m, true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_contacto_cambiar_prioridad(p_actor_id uuid, p_id uuid, p_prioridad text) RETURNS jsonb AS $$
DECLARE m contacto_mensajes; v_de text;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  IF coalesce(p_prioridad, '') NOT IN ('baja', 'normal', 'alta') THEN
    RAISE EXCEPTION 'Prioridad inválida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  m := fn_contacto_bloquear(p_id);
  v_de := m.prioridad;
  IF v_de = p_prioridad THEN RETURN fn_contacto_json(m, true); END IF;
  UPDATE contacto_mensajes SET prioridad = p_prioridad, atendido_en = coalesce(atendido_en, now()) WHERE id = p_id RETURNING * INTO m;
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento, autor_id, metadatos)
  VALUES (p_id, 'cambio_prioridad', p_actor_id, jsonb_build_object('de', v_de, 'a', p_prioridad));
  RETURN fn_contacto_json(m, true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Asignar (o NULL para desasignar). Solo a quien tiene `contacto.gestionar`. Si era «nuevo», pasa a «en revisión». */
CREATE OR REPLACE FUNCTION proc_contacto_asignar(p_actor_id uuid, p_id uuid, p_asignado uuid) RETURNS jsonb AS $$
DECLARE m contacto_mensajes;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  IF p_asignado IS NOT NULL AND NOT fn_permiso_sistema(p_asignado, 'contacto.gestionar') THEN
    RAISE EXCEPTION 'Esa persona no puede atender mensajes de contacto.' USING ERRCODE = 'NX010', HINT = 'asignado_invalido';
  END IF;
  m := fn_contacto_bloquear(p_id);
  UPDATE contacto_mensajes SET asignado_a = p_asignado, atendido_en = coalesce(atendido_en, now()) WHERE id = p_id;
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento, autor_id, metadatos)
  VALUES (p_id, 'asignacion', p_actor_id, jsonb_build_object('de', m.asignado_a, 'a', p_asignado,
          'nombre', (SELECT nombre FROM usuarios WHERE id = p_asignado)));
  IF m.estado = 'nuevo' AND p_asignado IS NOT NULL THEN
    PERFORM fn_contacto_estado(p_id, 'en_revision', p_actor_id);
  END IF;
  SELECT * INTO m FROM contacto_mensajes WHERE id = p_id;
  RETURN fn_contacto_json(m, true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION proc_contacto_agregar_nota(p_actor_id uuid, p_id uuid, p_contenido text) RETURNS jsonb AS $$
DECLARE e contacto_eventos;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  PERFORM fn_contacto_bloquear(p_id);
  IF char_length(btrim(coalesce(p_contenido, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'La nota debe tener entre 1 y 5000 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE contacto_mensajes SET atendido_en = coalesce(atendido_en, now()) WHERE id = p_id;
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento, autor_id, contenido)
  VALUES (p_id, 'nota_interna', p_actor_id, btrim(p_contenido)) RETURNING * INTO e;
  RETURN fn_contacto_evento_json(e);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Respuesta al remitente: evento «respuesta» (visible en el seguimiento), outbox con el correo y,
 * si se pide, el estado resultante (`esperando_usuario` o `resuelto`). Un mensaje «nuevo» pasa
 * antes a «en revisión». Una sola transacción.
 */
CREATE OR REPLACE FUNCTION proc_contacto_responder(p_actor_id uuid, p_id uuid, p_contenido text, p_estado text) RETURNS jsonb AS $$
DECLARE m contacto_mensajes; e contacto_eventos;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  m := fn_contacto_bloquear(p_id);
  IF m.anonimizado THEN
    RAISE EXCEPTION 'Este mensaje ya no tiene datos de contacto.' USING ERRCODE = 'NX007', HINT = 'anonimizado';
  END IF;
  IF char_length(btrim(coalesce(p_contenido, ''))) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'La respuesta debe tener entre 1 y 5000 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('esperando_usuario', 'resuelto') THEN
    RAISE EXCEPTION 'Estado resultante inválido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento, autor_id, contenido)
  VALUES (p_id, 'respuesta', p_actor_id, btrim(p_contenido)) RETURNING * INTO e;
  INSERT INTO contacto_outbox (mensaje_id, evento_id, plantilla, destinatario)
  VALUES (p_id, e.id, 'respuesta_remitente', m.correo::text);
  UPDATE contacto_mensajes SET atendido_en = coalesce(atendido_en, now()) WHERE id = p_id;
  IF m.estado = 'nuevo' THEN
    PERFORM fn_contacto_estado(p_id, 'en_revision', p_actor_id);
    m.estado := 'en_revision';
  END IF;
  IF p_estado IS NOT NULL AND p_estado <> m.estado THEN
    PERFORM fn_contacto_estado(p_id, p_estado, p_actor_id);
  END IF;
  RETURN fn_contacto_evento_json(e);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Métricas del panel entre dos fechas. */
CREATE OR REPLACE FUNCTION proc_contacto_metricas(p_actor_id uuid, p_desde timestamptz, p_hasta timestamptz) RETURNS jsonb AS $$
DECLARE r jsonb; v_desde timestamptz := coalesce(p_desde, now() - interval '30 days'); v_hasta timestamptz := coalesce(p_hasta, now() + interval '1 second');
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.ver');
  WITH m AS (SELECT * FROM contacto_mensajes WHERE creado_en >= v_desde AND creado_en < v_hasta)
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM m),
    'abiertos', (SELECT count(*)::int FROM m WHERE estado IN ('nuevo', 'en_revision', 'esperando_usuario')),
    'resueltos', (SELECT count(*)::int FROM m WHERE estado = 'resuelto'),
    'por_tipo', (SELECT jsonb_object_agg(t, (SELECT count(*)::int FROM m WHERE tipo = t)) FROM unnest(ARRAY['duda', 'error', 'sugerencia']) t),
    'por_estado', (SELECT jsonb_object_agg(s, (SELECT count(*)::int FROM m WHERE estado = s))
                     FROM unnest(ARRAY['nuevo', 'en_revision', 'esperando_usuario', 'resuelto', 'descartado']) s),
    'primera_respuesta_horas', (SELECT round((avg(extract(epoch FROM atendido_en - creado_en)) / 3600)::numeric, 1)
                                  FROM m WHERE atendido_en IS NOT NULL),
    'resolucion_horas', (SELECT round((avg(extract(epoch FROM resuelto_en - creado_en)) / 3600)::numeric, 1)
                           FROM m WHERE resuelto_en IS NOT NULL),
    'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object('dia', d, 'total', n) ORDER BY d)
                           FROM (SELECT to_char(creado_en AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') d, count(*)::int n
                                   FROM m GROUP BY 1) x), '[]'::jsonb),
    'por_persona', coalesce((SELECT jsonb_agg(jsonb_build_object('persona', fn_contacto_persona_json(asignado_a), 'abiertos', a, 'total', n) ORDER BY n DESC)
                               FROM (SELECT asignado_a, count(*)::int n,
                                            count(*) FILTER (WHERE estado IN ('nuevo', 'en_revision', 'esperando_usuario'))::int a
                                       FROM m WHERE asignado_a IS NOT NULL GROUP BY asignado_a) x), '[]'::jsonb),
    'desde', fn_iso(v_desde), 'hasta', fn_iso(v_hasta))
    INTO r;
  RETURN r;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Filas para el CSV (mismos filtros que la bandeja, sin paginar, tope de 10 000). */
CREATE OR REPLACE FUNCTION proc_contacto_exportar(p_actor_id uuid, p_filtros jsonb) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  RETURN coalesce((
    SELECT jsonb_agg(fila ORDER BY creado)
      FROM (SELECT m.creado_en AS creado,
                   jsonb_build_object('folio', m.folio, 'tipo', m.tipo, 'estado', m.estado, 'prioridad', m.prioridad,
                                      'nombre', m.nombre, 'correo', m.correo::text, 'asunto', m.asunto, 'mensaje', m.mensaje,
                                      'asignado', (SELECT nombre FROM usuarios WHERE id = m.asignado_a),
                                      'creado_en', fn_iso(m.creado_en), 'resuelto_en', fn_iso(m.resuelto_en)) AS fila
              FROM contacto_mensajes m WHERE fn_contacto_filtra(m, coalesce(p_filtros, '{}'::jsonb), p_actor_id)
             ORDER BY m.creado_en LIMIT 10000) x), '[]'::jsonb);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Indicador del menú: cuántos «nuevo» hay. */
CREATE OR REPLACE FUNCTION proc_contacto_pendientes(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.ver');
  RETURN jsonb_build_object('nuevos', (SELECT count(*)::int FROM contacto_mensajes WHERE estado = 'nuevo'));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** A quién se puede asignar (quienes tienen `contacto.gestionar`). */
CREATE OR REPLACE FUNCTION proc_contacto_equipo(p_actor_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.ver');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) ORDER BY u.nombre)
                     FROM usuarios u JOIN permisos_sistema ps ON ps.usuario_id = u.id AND ps.permiso = 'contacto.gestionar'
                    WHERE u.eliminado_en IS NULL), '[]'::jsonb);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Vuelve a intentar los envíos fallidos de un mensaje (banner «Reintentar» del detalle). */
CREATE OR REPLACE FUNCTION proc_contacto_outbox_reintentar(p_actor_id uuid, p_id uuid) RETURNS jsonb AS $$
DECLARE n int;
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  UPDATE contacto_outbox SET estado = 'pendiente', intentos = 0, proximo_intento = now(), ultimo_error = NULL
   WHERE mensaje_id = p_id AND estado = 'fallido';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('reintentados', n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Anonimiza un mensaje (solicitud de eliminación de datos o purga): nombre, correo, IP, navegador,
 * mensaje, contexto y contenido de los eventos se reemplazan; los envíos pendientes se cancelan.
 */
CREATE OR REPLACE FUNCTION fn_contacto_anonimizar(p_id uuid) RETURNS void AS $$
BEGIN
  UPDATE contacto_mensajes SET nombre = 'Anónimo', correo = 'anonimo@nexo.invalid', ip_hash = NULL, user_agent = NULL,
         mensaje = '[eliminado]', contexto = '{}'::jsonb, usuario_id = NULL, anonimizado = true,
         token_seguimiento_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex')
   WHERE id = p_id AND NOT anonimizado;
  UPDATE contacto_eventos SET contenido = CASE WHEN contenido IS NULL THEN NULL ELSE '[eliminado]' END
   WHERE mensaje_id = p_id;
  DELETE FROM contacto_outbox WHERE mensaje_id = p_id AND estado IN ('pendiente', 'procesando', 'fallido');
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION proc_contacto_anonimizar(p_actor_id uuid, p_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_contacto_exigir(p_actor_id, 'contacto.gestionar');
  PERFORM fn_contacto_bloquear(p_id);
  PERFORM fn_contacto_anonimizar(p_id);
  INSERT INTO contacto_eventos (mensaje_id, tipo_evento, autor_id, contenido)
  VALUES (p_id, 'sistema', p_actor_id, 'Se eliminaron los datos personales del remitente.');
  RETURN jsonb_build_object('anonimizado', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 5. Sistema (ciclo de trabajos y script de permisos)
-- ---------------------------------------------------------------------------------------------

/**
 * Toma hasta `p_limite` envíos pendientes con `FOR UPDATE SKIP LOCKED` (dos instancias no duplican),
 * los marca `procesando` y suma el intento. Antes recupera los que llevan más de 10 min procesando
 * (la API se cayó a la mitad). Devuelve lo necesario para armar cada correo.
 */
CREATE OR REPLACE FUNCTION proc_contacto_outbox_tomar(p_limite int) RETURNS jsonb AS $$
DECLARE r jsonb;
BEGIN
  UPDATE contacto_outbox SET estado = 'pendiente'
   WHERE estado = 'procesando' AND proximo_intento < now() - interval '10 minutes';
  WITH tomados AS (
    SELECT id FROM contacto_outbox
     WHERE estado = 'pendiente' AND proximo_intento <= now()
     ORDER BY proximo_intento LIMIT greatest(coalesce(p_limite, 10), 1)
     FOR UPDATE SKIP LOCKED
  ), marcados AS (
    UPDATE contacto_outbox o SET estado = 'procesando', intentos = o.intentos + 1, proximo_intento = now()
      FROM tomados t WHERE o.id = t.id
    RETURNING o.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'canal', x.canal, 'plantilla', x.plantilla, 'destinatario', x.destinatario, 'datos', x.datos,
    'intentos', x.intentos, 'mensaje_id', m.id, 'folio', m.folio, 'tipo', m.tipo, 'prioridad', m.prioridad,
    'nombre', m.nombre, 'asunto', m.asunto, 'extracto', left(m.mensaje, 300), 'registrado', m.usuario_id IS NOT NULL,
    'respuesta', (SELECT e.contenido FROM contacto_eventos e WHERE e.id = x.evento_id AND e.tipo_evento = 'respuesta'))), '[]'::jsonb)
    INTO r
    FROM marcados x JOIN contacto_mensajes m ON m.id = x.mensaje_id;
  RETURN r;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Resultado de un envío: ok → enviado (y se borran sus datos); si falla, espera 1, 5, 15, 60 y 180 min; al quinto, fallido. */
CREATE OR REPLACE FUNCTION proc_contacto_outbox_resultado(p_id uuid, p_ok boolean, p_error text) RETURNS jsonb AS $$
DECLARE o contacto_outbox;
BEGIN
  SELECT * INTO o FROM contacto_outbox WHERE id = p_id FOR UPDATE;
  IF o.id IS NULL THEN RETURN jsonb_build_object('estado', NULL); END IF;
  IF p_ok THEN
    UPDATE contacto_outbox SET estado = 'enviado', enviado_en = now(), ultimo_error = NULL, datos = '{}'::jsonb
     WHERE id = p_id RETURNING * INTO o;
  ELSIF o.intentos >= 5 THEN
    UPDATE contacto_outbox SET estado = 'fallido', ultimo_error = left(coalesce(p_error, 'Error desconocido'), 500)
     WHERE id = p_id RETURNING * INTO o;
  ELSE
    UPDATE contacto_outbox SET estado = 'pendiente', ultimo_error = left(coalesce(p_error, 'Error desconocido'), 500),
           proximo_intento = now() + make_interval(mins => (ARRAY[1, 5, 15, 60, 180])[greatest(o.intentos, 1)])
     WHERE id = p_id RETURNING * INTO o;
  END IF;
  RETURN jsonb_build_object('estado', o.estado, 'intentos', o.intentos);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Retención (diaria): anonimiza los mensajes resueltos o descartados con más de `p_meses` (12 por
 * defecto), borra los intentos de más de 7 días y los envíos hechos de más de 90 días.
 */
CREATE OR REPLACE FUNCTION proc_contacto_purgar(p_meses int) RETURNS jsonb AS $$
DECLARE v_anon int := 0; v_int int; v_out int; r record;
BEGIN
  FOR r IN SELECT id FROM contacto_mensajes
            WHERE estado IN ('resuelto', 'descartado') AND NOT anonimizado
              AND coalesce(resuelto_en, actualizado_en) < now() - make_interval(months => greatest(coalesce(p_meses, 12), 1))
  LOOP
    PERFORM fn_contacto_anonimizar(r.id);
    v_anon := v_anon + 1;
  END LOOP;
  DELETE FROM contacto_intentos WHERE creado_en < now() - interval '7 days';
  GET DIAGNOSTICS v_int = ROW_COUNT;
  DELETE FROM contacto_outbox WHERE estado = 'enviado' AND enviado_en < now() - interval '90 days';
  GET DIAGNOSTICS v_out = ROW_COUNT;
  RETURN jsonb_build_object('anonimizados', v_anon, 'intentos_borrados', v_int, 'envios_borrados', v_out);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Script `db:permiso`: otorga o retira un permiso de sistema a la cuenta con ese correo. */
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

-- El proceso de PUB-08 queda sustituido por proc_contacto_crear.
DROP FUNCTION IF EXISTS proc_contacto_enviar(text, text, text, text);

SELECT fn_conceder_procesos();

-- Down Migration

DROP FUNCTION IF EXISTS fn_permiso_sistema_asignar(text, text, boolean);
DROP FUNCTION IF EXISTS proc_contacto_purgar(int);
DROP FUNCTION IF EXISTS proc_contacto_outbox_resultado(uuid, boolean, text);
DROP FUNCTION IF EXISTS proc_contacto_outbox_tomar(int);
DROP FUNCTION IF EXISTS proc_contacto_anonimizar(uuid, uuid);
DROP FUNCTION IF EXISTS fn_contacto_anonimizar(uuid);
DROP FUNCTION IF EXISTS proc_contacto_outbox_reintentar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_contacto_equipo(uuid);
DROP FUNCTION IF EXISTS proc_contacto_pendientes(uuid);
DROP FUNCTION IF EXISTS proc_contacto_exportar(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_contacto_metricas(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS proc_contacto_responder(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS proc_contacto_agregar_nota(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_contacto_asignar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_contacto_cambiar_prioridad(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_contacto_cambiar_estado(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_contacto_obtener(uuid, uuid);
DROP FUNCTION IF EXISTS proc_contacto_listar(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_contacto_permisos(uuid);
DROP FUNCTION IF EXISTS proc_contacto_seguimiento(text, text);
DROP FUNCTION IF EXISTS proc_contacto_crear(jsonb, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS proc_contacto_verificar_limite(text, text);
DROP FUNCTION IF EXISTS fn_contacto_filtra(contacto_mensajes, jsonb, uuid);
DROP FUNCTION IF EXISTS fn_contacto_estado(uuid, text, uuid);
DROP FUNCTION IF EXISTS fn_contacto_bloquear(uuid);
DROP FUNCTION IF EXISTS fn_contacto_evento_json(contacto_eventos);
DROP FUNCTION IF EXISTS fn_contacto_json(contacto_mensajes, boolean);
DROP FUNCTION IF EXISTS fn_contacto_persona_json(uuid);
DROP FUNCTION IF EXISTS fn_contacto_transicion_valida(text, text);
DROP FUNCTION IF EXISTS fn_contacto_exigir(uuid, text);
DROP FUNCTION IF EXISTS fn_permiso_sistema(uuid, text);
DROP TABLE IF EXISTS permisos_sistema;
DROP TABLE IF EXISTS contacto_intentos;
DROP TABLE IF EXISTS contacto_outbox;
DROP TABLE IF EXISTS contacto_eventos;
DROP TRIGGER IF EXISTS trg_contacto_tocar ON contacto_mensajes;
DROP INDEX IF EXISTS ix_contacto_busqueda;
DROP INDEX IF EXISTS ix_contacto_correo;
DROP INDEX IF EXISTS ix_contacto_usuario;
DROP INDEX IF EXISTS ix_contacto_asignado;
DROP INDEX IF EXISTS ix_contacto_tipo;
DROP INDEX IF EXISTS ix_contacto_estado_creado;
DELETE FROM contacto_mensajes WHERE char_length(mensaje) > 4000;
ALTER TABLE contacto_mensajes
  DROP CONSTRAINT IF EXISTS ck_contacto_mensaje,
  ADD CONSTRAINT contacto_mensajes_mensaje_check CHECK (char_length(mensaje) BETWEEN 10 AND 4000),
  DROP CONSTRAINT IF EXISTS ck_contacto_user_agent,
  DROP CONSTRAINT IF EXISTS ck_contacto_asunto,
  DROP CONSTRAINT IF EXISTS ck_contacto_prioridad,
  DROP CONSTRAINT IF EXISTS ck_contacto_estado,
  DROP CONSTRAINT IF EXISTS ck_contacto_tipo,
  DROP CONSTRAINT IF EXISTS uq_contacto_folio,
  DROP COLUMN resuelto_en, DROP COLUMN actualizado_en, DROP COLUMN anonimizado, DROP COLUMN asignado_a,
  DROP COLUMN user_agent, DROP COLUMN ip_hash, DROP COLUMN token_seguimiento_hash, DROP COLUMN contexto,
  DROP COLUMN usuario_id, DROP COLUMN prioridad, DROP COLUMN estado, DROP COLUMN tipo, DROP COLUMN folio;
DROP SEQUENCE IF EXISTS contacto_folio_seq;

/** Guarda un mensaje del formulario público de contacto. No hay actor: es una ruta sin sesión. */
CREATE OR REPLACE FUNCTION proc_contacto_enviar(p_nombre text, p_correo text, p_asunto text, p_mensaje text)
RETURNS jsonb AS $$
BEGIN
  INSERT INTO contacto_mensajes (nombre, correo, asunto, mensaje)
  VALUES (p_nombre, p_correo, p_asunto, p_mensaje);
  RETURN jsonb_build_object('recibido', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
