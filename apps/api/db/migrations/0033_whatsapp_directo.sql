-- Spike WhatsApp 1 a 1 (docs/11_Plan_Spike_WhatsApp_1a1.md, DEC-039): canal directo por persona.
-- Aditiva: `modo_entrega` por equipo (individual | grupo | ambos), tres formatos (resumen con enlace,
-- PDF, bajo demanda), una entrega por destinatario con su estado, ventana de 24 h, verificación del
-- número por mensaje entrante, reporte personal por WhatsApp y caducidad de lo pendiente.
-- Los valores por defecto no cambian el comportamiento actual. Documentación: docs/08.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Esquema (plan §4)
-- ---------------------------------------------------------------------------------------------

CREATE TYPE modo_entrega_wa   AS ENUM ('individual', 'grupo', 'ambos');
CREATE TYPE formato_wa        AS ENUM ('resumen_enlace', 'pdf', 'bajo_demanda');
CREATE TYPE destino_wa        AS ENUM ('grupo', 'persona');
CREATE TYPE estado_entrega_wa AS ENUM
  ('pendiente', 'pendiente_ventana', 'enviando', 'enviado', 'entregado', 'leido', 'fallido', 'caducado', 'cancelado');

ALTER TABLE whatsapp_configuracion
  ADD COLUMN modo_entrega    modo_entrega_wa NOT NULL DEFAULT 'grupo',
  ADD COLUMN formato_defecto formato_wa      NOT NULL DEFAULT 'resumen_enlace';
-- P-5: el envío directo de hoy es «individual»; así nadie cambia de comportamiento.
UPDATE whatsapp_configuracion SET modo_entrega = 'individual' WHERE proveedor = 'cloud_api_directo';

ALTER TABLE preferencias_usuario ADD COLUMN wa_formato formato_wa;

ALTER TABLE whatsapp_usuario
  ADD COLUMN ultimo_entrante_en timestamptz,
  ADD COLUMN ultimo_teaser_en   timestamptz,
  ADD COLUMN codigo_hash        text,
  ADD COLUMN codigo_expira_en   timestamptz;

ALTER TABLE whatsapp_mensajes
  ALTER COLUMN equipo_id DROP NOT NULL,
  ADD COLUMN usuario_id uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_wa_msj_ambito CHECK (equipo_id IS NOT NULL OR usuario_id IS NOT NULL);
CREATE INDEX ix_wa_msj_usuario ON whatsapp_mensajes(usuario_id, creado_en) WHERE usuario_id IS NOT NULL;

CREATE TABLE whatsapp_entregas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id           uuid NOT NULL REFERENCES whatsapp_mensajes(id) ON DELETE CASCADE,
  destino              destino_wa NOT NULL,
  usuario_id           uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  formato              formato_wa NOT NULL,
  plantilla            text,
  variables            jsonb NOT NULL DEFAULT '{}',
  contenido            text CHECK (contenido IS NULL OR char_length(contenido) <= 4000),
  estado               estado_entrega_wa NOT NULL DEFAULT 'pendiente',
  caduca_en            timestamptz,
  intentos             smallint NOT NULL DEFAULT 0,
  ultimo_error         text,
  proveedor_mensaje_id text,
  enviado_en           timestamptz,
  entregado_en         timestamptz,
  leido_en             timestamptz,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  CHECK ((destino = 'persona') = (usuario_id IS NOT NULL))
);
CREATE UNIQUE INDEX ux_wa_entrega_destinatario ON whatsapp_entregas(mensaje_id, usuario_id) WHERE usuario_id IS NOT NULL;
CREATE UNIQUE INDEX ux_wa_entrega_grupo ON whatsapp_entregas(mensaje_id) WHERE destino = 'grupo';
-- No es único: lo pendiente de ventana se entrega junto en un solo texto (plan §7.2), con un id de Meta.
CREATE INDEX ix_wa_entrega_proveedor ON whatsapp_entregas(proveedor_mensaje_id) WHERE proveedor_mensaje_id IS NOT NULL;
CREATE INDEX ix_wa_entregas_mensaje ON whatsapp_entregas(mensaje_id);
CREATE INDEX ix_wa_entregas_pend_ventana ON whatsapp_entregas(usuario_id, creado_en) WHERE estado = 'pendiente_ventana';

-- ---------------------------------------------------------------------------------------------
-- 2. Auxiliares
-- ---------------------------------------------------------------------------------------------

/** P-13: número normalizado para comparar (solo dígitos; México `521` + 10 dígitos ≡ `52` + 10). */
CREATE OR REPLACE FUNCTION fn_wa_numero_normal(p text) RETURNS text AS $$
  SELECT CASE WHEN d ~ '^521[0-9]{10}$' THEN '52' || substr(d, 4) ELSE d END
    FROM (SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') AS d) x;
$$ LANGUAGE sql IMMUTABLE;

/** Últimos 4 dígitos (R4: el líder nunca ve el número completo). */
CREATE OR REPLACE FUNCTION fn_wa_numero_fin(p text) RETURNS text AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE '•••• ' || right(regexp_replace(p, '[^0-9]', '', 'g'), 4) END;
$$ LANGUAGE sql IMMUTABLE;

/** ¿La persona puede recibir por WhatsApp directo? Número y consentimiento general (P-12: sin exigir verificación). */
CREATE OR REPLACE FUNCTION fn_wa_puede_directo(p_usuario uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM whatsapp_usuario w WHERE w.usuario_id = p_usuario
                    AND w.consentimiento_en IS NOT NULL AND w.consentimiento_revocado_en IS NULL);
$$ LANGUAGE sql STABLE;

/** Formato de una persona: el suyo o el del equipo (P-3). */
CREATE OR REPLACE FUNCTION fn_wa_formato_de(p_usuario uuid, p_equipo uuid) RETURNS formato_wa AS $$
  SELECT coalesce((SELECT wa_formato FROM preferencias_usuario WHERE usuario_id = p_usuario),
                  (SELECT formato_defecto FROM whatsapp_configuracion WHERE equipo_id = p_equipo),
                  'resumen_enlace');
$$ LANGUAGE sql STABLE;

/** Una entrega, para la cola y el historial (sin números completos). */
CREATE OR REPLACE FUNCTION fn_wa_entrega_json(x whatsapp_entregas, p_equipo uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', x.id, 'destino', x.destino, 'formato', x.formato, 'estado', x.estado,
    'persona', CASE WHEN x.usuario_id IS NULL THEN NULL
                    WHEN p_equipo IS NULL THEN jsonb_build_object('usuario_id', x.usuario_id,
                          'nombre', (SELECT nombre FROM usuarios WHERE id = x.usuario_id), 'color_idx', NULL)
                    ELSE fn_persona_json(p_equipo, x.usuario_id) END,
    'numero_fin', (SELECT fn_wa_numero_fin(numero_e164) FROM whatsapp_usuario WHERE usuario_id = x.usuario_id),
    'enviado_en', fn_iso(x.enviado_en), 'entregado_en', fn_iso(x.entregado_en), 'leido_en', fn_iso(x.leido_en),
    'caduca_en', fn_iso(x.caduca_en), 'ultimo_error', x.ultimo_error);
$$ LANGUAGE sql STABLE;

/** `fn_wa_mensaje_json` de la 0031 más el reparto por persona (WA-02, plan §9). */
CREATE OR REPLACE FUNCTION fn_wa_mensaje_json(m whatsapp_mensajes) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'tipo_evento', m.tipo_evento, 'motivo', m.motivo, 'texto', m.texto,
    'tipo_envio', m.tipo_envio, 'estado', m.estado, 'seleccionado', m.seleccionado,
    'programado_para', fn_iso(m.programado_para), 'enviado_en', fn_iso(m.enviado_en),
    'entregado_en', fn_iso(m.entregado_en), 'leido_en', fn_iso(m.leido_en),
    'enviado_por', CASE WHEN m.enviado_por IS NULL OR m.equipo_id IS NULL THEN NULL ELSE fn_persona_json(m.equipo_id, m.enviado_por) END,
    'intentos', m.intentos, 'ultimo_error', m.ultimo_error, 'reporte_id', m.reporte_id,
    'creado_en', fn_iso(m.creado_en),
    'entregas', (SELECT coalesce(jsonb_agg(fn_wa_entrega_json(x, m.equipo_id) ORDER BY x.destino, x.creado_en), '[]'::jsonb)
                   FROM whatsapp_entregas x WHERE x.mensaje_id = m.id));
$$ LANGUAGE sql STABLE;

/** Configuración del equipo con `modo_entrega` y `formato_defecto`. */
CREATE OR REPLACE FUNCTION fn_wa_config_json(p_equipo uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'proveedor', coalesce(c.proveedor, 'simulado'), 'estado', coalesce(c.estado, 'sin_configurar'),
    'grupo_nombre', c.grupo_nombre, 'grupo_externo_id', c.grupo_externo_id,
    'enlace_invitacion', c.enlace_invitacion, 'causa_error', c.causa_error,
    'ultimo_envio_en', fn_iso(c.ultimo_envio_en),
    'reporte_frecuencia', coalesce(c.reporte_frecuencia, 'diario'),
    'reporte_hora', to_char(coalesce(c.reporte_hora, '18:00'), 'HH24:MI'),
    'reporte_dia', coalesce(c.reporte_dia, 5), 'agrupar', coalesce(c.agrupar, true),
    'silencio_desde', to_char(c.silencio_desde, 'HH24:MI'), 'silencio_hasta', to_char(c.silencio_hasta, 'HH24:MI'),
    'envio_automatico', coalesce(c.envio_automatico, false),
    'ultimo_reporte_en', fn_iso(c.ultimo_reporte_en),
    'modo_entrega', coalesce(c.modo_entrega, 'grupo'), 'formato_defecto', coalesce(c.formato_defecto, 'resumen_enlace'),
    'proximo_reporte', CASE WHEN c.equipo_id IS NULL THEN NULL
                            ELSE fn_iso(fn_wa_proximo_reporte(c, greatest(now(), coalesce(c.ultimo_reporte_en, now())))) END)
    FROM (SELECT 1) uno LEFT JOIN whatsapp_configuracion c ON c.equipo_id = p_equipo;
$$ LANGUAGE sql STABLE;

/**
 * Crea las entregas de un aviso (plan §8): reporte personal → a su dueño; del equipo, según
 * `modo_entrega`: `grupo` → una al grupo; `individual` → una por persona activa con consentimiento
 * general y del equipo; `ambos` → grupo para quien consta en él (`en_grupo_wa`) y directo para el
 * resto (R2: un solo canal por persona). Los invitados nunca (R3). Reintentar reabre las fallidas.
 */
CREATE OR REPLACE FUNCTION fn_wa_expandir_entregas(m whatsapp_mensajes) RETURNS int AS $$
DECLARE c whatsapp_configuracion; v_n int := 0;
BEGIN
  IF m.usuario_id IS NOT NULL THEN
    INSERT INTO whatsapp_entregas (mensaje_id, destino, usuario_id, formato, contenido)
    SELECT m.id, 'persona', m.usuario_id, fn_wa_formato_de(m.usuario_id, NULL), m.texto
     WHERE fn_wa_puede_directo(m.usuario_id)
    ON CONFLICT (mensaje_id, usuario_id) WHERE usuario_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
  END IF;
  SELECT * INTO c FROM whatsapp_configuracion WHERE equipo_id = m.equipo_id;
  IF c.modo_entrega IN ('grupo', 'ambos') AND NOT EXISTS (SELECT 1 FROM whatsapp_entregas WHERE mensaje_id = m.id AND destino = 'grupo') THEN
    INSERT INTO whatsapp_entregas (mensaje_id, destino, formato, contenido) VALUES (m.id, 'grupo', c.formato_defecto, m.texto);
    v_n := v_n + 1;
  END IF;
  IF c.modo_entrega IN ('individual', 'ambos') THEN
    INSERT INTO whatsapp_entregas (mensaje_id, destino, usuario_id, formato, contenido)
    SELECT m.id, 'persona', mb.usuario_id, fn_wa_formato_de(mb.usuario_id, m.equipo_id), m.texto
      FROM membresias mb
     WHERE mb.equipo_id = m.equipo_id AND mb.estado = 'activa' AND mb.rol <> 'invitado'
       AND mb.consentimiento_wa IS TRUE AND fn_wa_puede_directo(mb.usuario_id)
       AND (c.modo_entrega = 'individual' OR mb.en_grupo_wa IS NOT TRUE)
    ON CONFLICT (mensaje_id, usuario_id) WHERE usuario_id IS NOT NULL DO NOTHING;
  END IF;
  -- Reintento: lo que falló vuelve a intentarse.
  UPDATE whatsapp_entregas SET estado = 'pendiente', ultimo_error = NULL
   WHERE mensaje_id = m.id AND estado = 'fallido';
  RETURN (SELECT count(*) FROM whatsapp_entregas WHERE mensaje_id = m.id AND estado = 'pendiente');
END $$ LANGUAGE plpgsql;

/** Lo que el servidor necesita para cada entrega pendiente de un aviso (ventana, aviso corto, formato). */
CREATE OR REPLACE FUNCTION fn_wa_entregas_para_enviar(p_mensaje uuid, p_ahora timestamptz DEFAULT now()) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'destino', x.destino, 'formato', x.formato, 'contenido', x.contenido,
    'numero', w.numero_e164,
    'nombre', (SELECT split_part(nombre, ' ', 1) FROM usuarios WHERE id = x.usuario_id),
    'ventana_abierta', coalesce(w.ultimo_entrante_en > p_ahora - interval '24 hours', false),
    'aviso_corto_reciente', coalesce(w.ultimo_teaser_en > p_ahora - interval '12 hours', false)) ORDER BY x.creado_en), '[]'::jsonb)
    FROM whatsapp_entregas x LEFT JOIN whatsapp_usuario w ON w.usuario_id = x.usuario_id
   WHERE x.mensaje_id = p_mensaje AND x.estado = 'enviando';
$$ LANGUAGE sql STABLE;

/** Deja `enviando` las entregas pendientes de un aviso y devuelve el aviso con ellas. */
CREATE OR REPLACE FUNCTION fn_wa_preparar_envio(m whatsapp_mensajes) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_wa_expandir_entregas(m);
  UPDATE whatsapp_entregas SET estado = 'enviando', intentos = intentos + 1
   WHERE mensaje_id = m.id AND estado = 'pendiente';
  RETURN coalesce(fn_wa_para_enviar(m), jsonb_build_object('id', m.id, 'equipo_id', m.equipo_id, 'texto', m.texto,
           'proveedor', 'simulado', 'grupo_externo_id', NULL, 'destinatarios', '[]'::jsonb))
         || jsonb_build_object('usuario_id', m.usuario_id, 'entregas', fn_wa_entregas_para_enviar(m.id));
END $$ LANGUAGE plpgsql;

/**
 * Estado del aviso a partir de sus entregas (plan §4): mientras alguna se envía, `enviando`; si al
 * menos una salió (o dejó su aviso corto), `enviado` con el primer id del proveedor; si todas
 * fallaron o caducaron, `fallido`. Sin entregas no hace nada (camino de la 0031).
 */
CREATE OR REPLACE FUNCTION fn_wa_derivar_estado(p_mensaje uuid) RETURNS void AS $$
DECLARE r record;
BEGIN
  SELECT count(*) AS total,
         count(*) FILTER (WHERE estado IN ('pendiente', 'enviando')) AS abiertas,
         count(*) FILTER (WHERE estado IN ('enviado', 'entregado', 'leido', 'pendiente_ventana')) AS salieron,
         min(enviado_en) AS primero,
         (array_agg(proveedor_mensaje_id ORDER BY enviado_en) FILTER (WHERE proveedor_mensaje_id IS NOT NULL))[1] AS proveedor_id,
         (array_agg(ultimo_error ORDER BY creado_en) FILTER (WHERE ultimo_error IS NOT NULL))[1] AS error
    INTO r FROM whatsapp_entregas WHERE mensaje_id = p_mensaje;
  IF r.total = 0 OR r.abiertas > 0 THEN RETURN; END IF;
  UPDATE whatsapp_mensajes SET
    estado = CASE WHEN r.salieron > 0 THEN 'enviado' ELSE 'fallido' END::estado_mensaje_wa,
    enviado_en = CASE WHEN r.salieron > 0 THEN coalesce(r.primero, now()) END,
    proveedor_mensaje_id = CASE WHEN r.salieron > 0 THEN r.proveedor_id END,
    ultimo_error = CASE WHEN r.salieron > 0 THEN NULL ELSE left(coalesce(r.error, 'Ninguna entrega salió'), 300) END
   WHERE id = p_mensaje AND estado = 'enviando';
  IF r.salieron > 0 THEN
    UPDATE whatsapp_configuracion SET ultimo_envio_en = now(), causa_error = NULL
     WHERE equipo_id = (SELECT equipo_id FROM whatsapp_mensajes WHERE id = p_mensaje);
  END IF;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 3. Envío: los procesos de la 0031 ahora reparten por entregas
-- ---------------------------------------------------------------------------------------------

/** WA-02: el líder envía la cola (0031), con el reparto por entregas (plan §8). */
CREATE OR REPLACE FUNCTION proc_wa_enviar(p_actor_id uuid, p_equipo_id uuid, p_ids uuid[] DEFAULT NULL) RETURNS jsonb AS $$
DECLARE c whatsapp_configuracion; m whatsapp_mensajes; v jsonb := '[]'::jsonb;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder envía la cola de WhatsApp.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  c := fn_wa_exigir_config(p_equipo_id);
  IF c.estado = 'pausado' THEN
    RAISE EXCEPTION 'WhatsApp está en pausa. Reanúdalo para enviar.' USING ERRCODE = 'NX007', HINT = 'whatsapp_pausado';
  END IF;
  IF c.estado = 'error' THEN
    RAISE EXCEPTION 'La conexión con WhatsApp tiene un error: %', coalesce(c.causa_error, 'revísala en el panel.')
      USING ERRCODE = 'NX007', HINT = 'whatsapp_error';
  END IF;
  FOR m IN SELECT * FROM whatsapp_mensajes
            WHERE equipo_id = p_equipo_id AND estado = 'pendiente' AND tipo_envio = 'instantaneo'
              AND (CASE WHEN p_ids IS NULL THEN seleccionado ELSE id = ANY (p_ids) END)
            ORDER BY creado_en FOR UPDATE SKIP LOCKED LOOP
    UPDATE whatsapp_mensajes SET estado = 'enviando', enviado_por = p_actor_id, intentos = intentos + 1
     WHERE id = m.id RETURNING * INTO m;
    v := v || fn_wa_preparar_envio(m);
  END LOOP;
  RETURN v;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Sistema: lo programado que ya toca y, con envío automático, los instantáneos (0031), por entregas. */
CREATE OR REPLACE FUNCTION proc_wa_por_enviar(p_limite int DEFAULT 50) RETURNS jsonb AS $$
DECLARE m whatsapp_mensajes; v jsonb := '[]'::jsonb;
BEGIN
  FOR m IN SELECT wm.* FROM whatsapp_mensajes wm
             JOIN whatsapp_configuracion c ON c.equipo_id = wm.equipo_id
            WHERE c.estado = 'conectado' AND NOT fn_wa_en_silencio(c)
              AND ((wm.estado = 'programado' AND wm.programado_para <= now())
                OR (wm.estado = 'pendiente' AND wm.tipo_envio = 'instantaneo' AND wm.seleccionado AND c.envio_automatico))
            ORDER BY wm.creado_en
            LIMIT least(greatest(coalesce(p_limite, 50), 1), 200)
            FOR UPDATE OF wm SKIP LOCKED LOOP
    UPDATE whatsapp_mensajes SET estado = 'enviando', intentos = intentos + 1 WHERE id = m.id RETURNING * INTO m;
    v := v || fn_wa_preparar_envio(m);
  END LOOP;
  RETURN v;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Sistema: resultado de UNA entrega. `p_resultado`: `{ ok, proveedor_id?, error?, plantilla?,
 * variables?, pendiente_ventana?, aviso_corto? }`. `pendiente_ventana` deja la entrega esperando
 * a que la persona escriba (caduca en 7 días, P-7) y `aviso_corto` anota la hora del aviso (P-8).
 * Después deriva el estado del aviso.
 */
CREATE OR REPLACE FUNCTION proc_wa_marcar_entrega(p_entrega_id uuid, p_resultado jsonb) RETURNS jsonb AS $$
DECLARE x whatsapp_entregas; v_ok boolean := coalesce((p_resultado->>'ok')::boolean, false);
        v_espera boolean := coalesce((p_resultado->>'pendiente_ventana')::boolean, false);
BEGIN
  UPDATE whatsapp_entregas SET
    estado = CASE WHEN NOT v_ok THEN 'fallido' WHEN v_espera THEN 'pendiente_ventana' ELSE 'enviado' END::estado_entrega_wa,
    enviado_en = CASE WHEN v_ok THEN now() END,
    caduca_en = CASE WHEN v_ok AND v_espera THEN now() + interval '7 days' END,
    proveedor_mensaje_id = CASE WHEN v_ok THEN nullif(p_resultado->>'proveedor_id', '') END,
    plantilla = coalesce(p_resultado->>'plantilla', plantilla),
    variables = coalesce(p_resultado->'variables', variables),
    ultimo_error = CASE WHEN v_ok THEN NULL ELSE left(coalesce(p_resultado->>'error', 'Error desconocido'), 300) END
   WHERE id = p_entrega_id AND estado = 'enviando'
  RETURNING * INTO x;
  IF x.id IS NULL THEN
    RAISE EXCEPTION 'Esa entrega no se estaba enviando.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  IF v_ok AND coalesce((p_resultado->>'aviso_corto')::boolean, false) THEN
    UPDATE whatsapp_usuario SET ultimo_teaser_en = now() WHERE usuario_id = x.usuario_id;
  END IF;
  PERFORM fn_wa_derivar_estado(x.mensaje_id);
  RETURN fn_wa_entrega_json(x, (SELECT equipo_id FROM whatsapp_mensajes WHERE id = x.mensaje_id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Webhook (0031) que además aplica los estados a la entrega con ese id de Meta (plan: marcar entrega). */
CREATE OR REPLACE FUNCTION proc_wa_webhook_registrar(p_evento_id text, p_tipo text, p_carga jsonb) RETURNS jsonb AS $$
DECLARE v_nuevo boolean; v_n int := 0; v_k int; st jsonb; v_msj uuid;
BEGIN
  INSERT INTO whatsapp_webhook_eventos (proveedor_evento_id, tipo, carga)
  VALUES (p_evento_id, left(coalesce(p_tipo, 'desconocido'), 60), coalesce(p_carga, '{}'::jsonb))
  ON CONFLICT (proveedor_evento_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_nuevo := v_n > 0;
  v_n := 0;
  IF v_nuevo THEN
    FOR st IN SELECT x FROM jsonb_array_elements(coalesce(p_carga->'statuses', '[]'::jsonb)) x LOOP
      UPDATE whatsapp_mensajes SET
        estado = CASE WHEN st->>'status' = 'failed' THEN 'fallido'::estado_mensaje_wa
                      WHEN estado IN ('enviando', 'fallido') AND st->>'status' IN ('sent', 'delivered', 'read') THEN 'enviado'
                      ELSE estado END,
        enviado_en = coalesce(enviado_en, CASE WHEN st->>'status' IN ('sent', 'delivered', 'read') THEN now() END),
        entregado_en = coalesce(entregado_en, CASE WHEN st->>'status' IN ('delivered', 'read') THEN now() END),
        leido_en = coalesce(leido_en, CASE WHEN st->>'status' = 'read' THEN now() END),
        ultimo_error = CASE WHEN st->>'status' = 'failed' THEN left(coalesce(st#>>'{errors,0,title}', 'Falló la entrega'), 300) ELSE ultimo_error END
       WHERE proveedor_mensaje_id = st->>'id';
      GET DIAGNOSTICS v_k = ROW_COUNT;
      UPDATE whatsapp_entregas SET
        estado = CASE WHEN st->>'status' = 'failed' THEN 'fallido'
                      WHEN st->>'status' = 'read' THEN 'leido'
                      WHEN st->>'status' = 'delivered' AND estado IN ('enviando', 'enviado') THEN 'entregado'
                      ELSE estado END::estado_entrega_wa,
        entregado_en = coalesce(entregado_en, CASE WHEN st->>'status' IN ('delivered', 'read') THEN now() END),
        leido_en = coalesce(leido_en, CASE WHEN st->>'status' = 'read' THEN now() END),
        ultimo_error = CASE WHEN st->>'status' = 'failed' THEN left(coalesce(st#>>'{errors,0,title}', 'Falló la entrega'), 300) ELSE ultimo_error END
       WHERE proveedor_mensaje_id = st->>'id' AND estado <> 'pendiente_ventana'
      RETURNING mensaje_id INTO v_msj;
      IF FOUND THEN v_k := v_k + 1; END IF;
      v_n := v_n + (CASE WHEN v_k > 0 THEN 1 ELSE 0 END);
    END LOOP;
    UPDATE whatsapp_webhook_eventos SET procesado_en = now() WHERE proveedor_evento_id = p_evento_id;
  END IF;
  RETURN jsonb_build_object('nuevo', v_nuevo, 'actualizados', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Verificación del número y mensajes entrantes (plan §7)
-- ---------------------------------------------------------------------------------------------

/**
 * La persona pide verificar su número: guarda número y consentimiento (como PF-05) y un código de 6
 * dígitos (solo su hash, 30 min). Devuelve el código para armar el enlace `wa.me` con «VERIFICAR».
 */
CREATE OR REPLACE FUNCTION proc_wa_solicitar_verificacion(p_actor_id uuid, p_numero text) RETURNS jsonb AS $$
DECLARE v_codigo text := lpad((floor(random() * 1000000))::int::text, 6, '0'); v_exp timestamptz := now() + interval '30 minutes';
BEGIN
  PERFORM proc_wa_usuario_guardar(p_actor_id, jsonb_build_object('numero', p_numero, 'consentimiento', true));
  UPDATE whatsapp_usuario SET codigo_hash = encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex'), codigo_expira_en = v_exp
   WHERE usuario_id = p_actor_id;
  RETURN jsonb_build_object('codigo', v_codigo, 'expira_en', fn_iso(v_exp));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Sistema: un mensaje que la persona mandó al número de Nexo (webhook, plan §7.2). Desconocido →
 * se ignora. Abre la ventana de 24 h; «VERIFICAR <código>» verifica; «BAJA»/«STOP» retira el
 * consentimiento; «REPORTE» pide su reporte; cualquier otro texto (o el botón) entrega lo pendiente.
 * Devuelve la respuesta a mandar y las entregas pendientes (ya en `enviando`) para entregarlas.
 */
CREATE OR REPLACE FUNCTION proc_wa_registrar_entrante(p_numero text, p_texto text, p_ahora timestamptz DEFAULT now()) RETURNS jsonb AS $$
DECLARE w whatsapp_usuario; v_txt text := upper(btrim(coalesce(p_texto, ''))); v_codigo text; v_verif boolean := false;
        v_pend jsonb; v_msjs uuid[];
BEGIN
  SELECT * INTO w FROM whatsapp_usuario
   WHERE fn_wa_numero_normal(numero_e164) = fn_wa_numero_normal(p_numero) FOR UPDATE;
  IF w.usuario_id IS NULL THEN
    RETURN jsonb_build_object('conocido', false);
  END IF;
  UPDATE whatsapp_usuario SET ultimo_entrante_en = p_ahora WHERE usuario_id = w.usuario_id;

  v_codigo := substring(v_txt FROM '^VERIFICAR\s+([0-9]{6})$');
  IF v_codigo IS NOT NULL THEN
    IF w.codigo_hash = encode(sha256(convert_to(v_codigo, 'UTF8')), 'hex') AND w.codigo_expira_en > p_ahora THEN
      UPDATE whatsapp_usuario SET verificado_en = p_ahora, codigo_hash = NULL, codigo_expira_en = NULL WHERE usuario_id = w.usuario_id;
      v_verif := true;
    ELSE
      RETURN jsonb_build_object('conocido', true, 'usuario_id', w.usuario_id, 'verificado', false,
        'respuesta', 'Ese código no es válido o ya caducó. Pide uno nuevo en Ajustes → WhatsApp.', 'entregas', '[]'::jsonb);
    END IF;
  END IF;

  IF v_txt IN ('BAJA', 'STOP') THEN
    UPDATE whatsapp_usuario SET consentimiento_revocado_en = p_ahora WHERE usuario_id = w.usuario_id;
    UPDATE membresias SET consentimiento_wa = false WHERE usuario_id = w.usuario_id AND estado = 'activa' AND consentimiento_wa;
    UPDATE whatsapp_entregas SET estado = 'cancelado', contenido = NULL WHERE usuario_id = w.usuario_id AND estado = 'pendiente_ventana';
    RETURN jsonb_build_object('conocido', true, 'usuario_id', w.usuario_id, 'baja', true,
      'respuesta', 'Listo: ya no recibirás avisos de Nexo por WhatsApp. Puedes volver a activarlos en Ajustes → WhatsApp.',
      'entregas', '[]'::jsonb);
  END IF;

  -- Lo que esperaba la ventana se entrega ahora (todo junto, plan §7.2 regla 5).
  WITH x AS (
    UPDATE whatsapp_entregas SET estado = 'enviando', intentos = intentos + 1
     WHERE usuario_id = w.usuario_id AND estado = 'pendiente_ventana' AND (caduca_en IS NULL OR caduca_en > p_ahora)
    RETURNING id, mensaje_id, contenido, creado_en)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'contenido', contenido) ORDER BY creado_en), '[]'::jsonb),
         array_agg(DISTINCT mensaje_id)
    INTO v_pend, v_msjs FROM x;
  IF v_msjs IS NOT NULL THEN
    UPDATE whatsapp_mensajes SET estado = 'enviando' WHERE id = ANY (v_msjs) AND estado = 'enviado';
  END IF;

  RETURN jsonb_build_object('conocido', true, 'usuario_id', w.usuario_id, 'verificado', v_verif,
    'reporte', v_txt = 'REPORTE' AND jsonb_array_length(v_pend) = 0,
    'numero', w.numero_e164,
    'respuesta', CASE WHEN v_verif THEN '✅ Tu número quedó verificado en Nexo.'
                      WHEN jsonb_array_length(v_pend) > 0 OR v_txt = 'REPORTE' THEN NULL
                      ELSE 'No tienes avisos pendientes. Escribe REPORTE para recibir tu reporte actual.' END,
    'entregas', v_pend);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Sistema: resultado de entregar lo pendiente tras un mensaje entrante (texto dentro de la ventana). */
CREATE OR REPLACE FUNCTION proc_wa_entrega_tras_ventana(p_entrega_id uuid, p_ok boolean, p_proveedor_id text, p_error text) RETURNS jsonb AS $$
DECLARE x whatsapp_entregas;
BEGIN
  UPDATE whatsapp_entregas SET
    estado = CASE WHEN p_ok THEN 'enviado' ELSE 'pendiente_ventana' END::estado_entrega_wa,
    proveedor_mensaje_id = CASE WHEN p_ok THEN coalesce(nullif(p_proveedor_id, ''), proveedor_mensaje_id) ELSE proveedor_mensaje_id END,
    enviado_en = CASE WHEN p_ok THEN now() ELSE enviado_en END,
    caduca_en = CASE WHEN p_ok THEN NULL ELSE caduca_en END,
    ultimo_error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'Error desconocido'), 300) END
   WHERE id = p_entrega_id AND estado = 'enviando'
  RETURNING * INTO x;
  IF x.id IS NULL THEN
    RAISE EXCEPTION 'Esa entrega no se estaba enviando.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  UPDATE whatsapp_mensajes SET estado = 'enviado' WHERE id = x.mensaje_id AND estado = 'enviando'
     AND NOT EXISTS (SELECT 1 FROM whatsapp_entregas WHERE mensaje_id = x.mensaje_id AND estado IN ('pendiente', 'enviando'));
  RETURN fn_wa_entrega_json(x, (SELECT equipo_id FROM whatsapp_mensajes WHERE id = x.mensaje_id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 5. Reporte personal por WhatsApp y caducidad
-- ---------------------------------------------------------------------------------------------

/** Texto del reporte personal (tareas a cargo de la persona en todos sus espacios), ≤ 4000. */
CREATE OR REPLACE FUNCTION fn_wa_reporte_personal_texto(p_usuario uuid) RETURNS text AS $$
  SELECT left(concat_ws(E'\n',
    '📋 Tu reporte de Nexo · ' || to_char(now() AT TIME ZONE coalesce(u.zona_horaria, 'America/Mexico_City'), 'DD/MM/YYYY'),
    '• Por hacer: ' || count(*) FILTER (WHERE t.estado IN ('backlog', 'aceptada', 'habilitada')),
    '• En curso: ' || count(*) FILTER (WHERE t.estado = 'en_curso'),
    '• Atascadas: ' || count(*) FILTER (WHERE t.estado = 'atascada'),
    '• Completadas esta semana: ' || count(*) FILTER (WHERE t.estado = 'completada' AND t.completada_en > now() - interval '7 days'),
    CASE WHEN count(*) FILTER (WHERE t.vence_en IS NOT NULL AND t.estado NOT IN ('completada', 'rechazada')) > 0 THEN
      'Próximas entregas:' || E'\n' || string_agg(
        CASE WHEN t.vence_en IS NOT NULL AND t.estado NOT IN ('completada', 'rechazada')
             THEN '  – ' || t.titulo || ' (' || to_char(t.vence_en AT TIME ZONE coalesce(u.zona_horaria, 'America/Mexico_City'), 'DD/MM') || ')' END,
        E'\n' ORDER BY t.vence_en) END), 4000)
    FROM usuarios u
    LEFT JOIN tareas t ON NOT t.archivada AND (t.dueno_id = u.id OR t.responsable_id = u.id)
   WHERE u.id = p_usuario
   GROUP BY u.id, u.zona_horaria;
$$ LANGUAGE sql STABLE;

/**
 * «Enviarme mi reporte por WhatsApp» (plan §9): crea el aviso personal (sin equipo, A9) y su entrega
 * y lo deja listo para enviar ahora (ignora el silencio: lo pide la persona). Hasta 5 por hora.
 */
CREATE OR REPLACE FUNCTION proc_wa_crear_reporte_personal(p_actor_id uuid) RETURNS jsonb AS $$
DECLARE m whatsapp_mensajes; v_texto text;
BEGIN
  IF NOT fn_wa_puede_directo(p_actor_id) THEN
    RAISE EXCEPTION 'Primero guarda tu número y acepta recibir avisos por WhatsApp.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF (SELECT count(*) FROM whatsapp_mensajes WHERE usuario_id = p_actor_id AND tipo_evento = 'reporte_personal'
        AND creado_en > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Ya pediste 5 reportes en la última hora. Intenta más tarde.' USING ERRCODE = 'NX007', HINT = 'limite_reportes';
  END IF;
  v_texto := fn_wa_reporte_personal_texto(p_actor_id);
  INSERT INTO whatsapp_mensajes (usuario_id, tipo_evento, motivo, texto, tipo_envio, estado, intentos, enviado_por)
  VALUES (p_actor_id, 'reporte_personal', 'Pedido por la persona', left(v_texto, 400), 'instantaneo', 'enviando', 1, p_actor_id)
  RETURNING * INTO m;
  INSERT INTO whatsapp_entregas (mensaje_id, destino, usuario_id, formato, contenido, estado, intentos)
  VALUES (m.id, 'persona', p_actor_id, fn_wa_formato_de(p_actor_id, NULL), v_texto, 'enviando', 1);
  RETURN jsonb_build_object('id', m.id, 'equipo_id', NULL, 'usuario_id', p_actor_id, 'texto', m.texto,
    'proveedor', 'cloud_api_directo', 'grupo_externo_id', NULL, 'destinatarios', '[]'::jsonb,
    'entregas', fn_wa_entregas_para_enviar(m.id));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Sistema: lo que esperaba la ventana y ya caducó pasa a `caducado` y se borra su contenido (privacidad). */
CREATE OR REPLACE FUNCTION proc_wa_caducar_pendientes(p_ahora timestamptz DEFAULT now()) RETURNS jsonb AS $$
DECLARE v_n int;
BEGIN
  UPDATE whatsapp_entregas SET estado = 'caducado', contenido = NULL
   WHERE estado = 'pendiente_ventana' AND caduca_en <= p_ahora;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('caducadas', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 6. Configuración: modo de entrega, formatos y datos de la persona
-- ---------------------------------------------------------------------------------------------

/** WA-05: el líder ajusta WhatsApp (0031) más `modo_entrega` y `formato_defecto`. */
CREATE OR REPLACE FUNCTION proc_wa_configurar(p_actor_id uuid, p_equipo_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
DECLARE c whatsapp_configuracion;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder configura WhatsApp.');
  c := fn_wa_exigir_config(p_equipo_id);
  IF p_cambios ? 'estado' AND p_cambios->>'estado' NOT IN ('conectado', 'pausado') THEN
    RAISE EXCEPTION 'Solo se puede pausar o reanudar.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF (p_cambios ? 'silencio_desde') <> (p_cambios ? 'silencio_hasta')
     OR ((p_cambios->>'silencio_desde') IS NULL) <> ((p_cambios->>'silencio_hasta') IS NULL) THEN
    RAISE EXCEPTION 'Indica el inicio y el fin de las horas de silencio.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    UPDATE whatsapp_configuracion SET
      estado = coalesce((p_cambios->>'estado')::estado_whatsapp, estado),
      causa_error = CASE WHEN p_cambios->>'estado' = 'conectado' THEN NULL ELSE causa_error END,
      reporte_frecuencia = coalesce((p_cambios->>'reporte_frecuencia')::frecuencia_reporte, reporte_frecuencia),
      reporte_hora = coalesce((p_cambios->>'reporte_hora')::time, reporte_hora),
      reporte_dia = coalesce((p_cambios->>'reporte_dia')::smallint, reporte_dia),
      agrupar = coalesce((p_cambios->>'agrupar')::boolean, agrupar),
      envio_automatico = coalesce((p_cambios->>'envio_automatico')::boolean, envio_automatico),
      modo_entrega = coalesce((p_cambios->>'modo_entrega')::modo_entrega_wa, modo_entrega),
      formato_defecto = coalesce((p_cambios->>'formato_defecto')::formato_wa, formato_defecto),
      silencio_desde = CASE WHEN p_cambios ? 'silencio_desde' THEN (p_cambios->>'silencio_desde')::time ELSE silencio_desde END,
      silencio_hasta = CASE WHEN p_cambios ? 'silencio_hasta' THEN (p_cambios->>'silencio_hasta')::time ELSE silencio_hasta END,
      enlace_invitacion = CASE WHEN p_cambios ? 'enlace_invitacion' THEN nullif(btrim(p_cambios->>'enlace_invitacion'), '') ELSE enlace_invitacion END
     WHERE equipo_id = p_equipo_id;
  EXCEPTION WHEN invalid_text_representation OR check_violation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Algún ajuste de WhatsApp no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  RETURN fn_wa_config_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-01 (0031) con los últimos 4 dígitos y la verificación de cada persona (WA-07, R4). */
CREATE OR REPLACE FUNCTION proc_wa_panel(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder configura WhatsApp.');
  RETURN jsonb_build_object(
    'configuracion', fn_wa_config_json(p_equipo_id),
    'reglas', (SELECT jsonb_agg(jsonb_build_object('tipo_evento', t, 'modo', coalesce(r.modo, 'apagado')) ORDER BY o)
                 FROM unnest(ARRAY['reunion', 'urgente', 'asignacion', 'aceptada', 'triaje', 'actualizacion']) WITH ORDINALITY AS x(t, o)
                 LEFT JOIN whatsapp_reglas r ON r.equipo_id = p_equipo_id AND r.tipo_evento = x.t),
    'resumen', (SELECT jsonb_build_object(
                  'en_cola', count(*) FILTER (WHERE estado = 'pendiente' AND tipo_envio = 'instantaneo'),
                  'para_reporte', count(*) FILTER (WHERE estado = 'pendiente' AND tipo_envio = 'reporte'),
                  'enviados_hoy', count(*) FILTER (WHERE estado = 'enviado' AND enviado_en >= date_trunc('day', now())),
                  'fallidos', count(*) FILTER (WHERE estado = 'fallido'))
                  FROM whatsapp_mensajes WHERE equipo_id = p_equipo_id),
    'personas', (SELECT coalesce(jsonb_agg(fn_persona_json(p_equipo_id, m.usuario_id) || jsonb_build_object(
                    'rol', m.rol, 'consentimiento', m.consentimiento_wa, 'en_grupo', m.en_grupo_wa,
                    'tiene_numero', w.usuario_id IS NOT NULL, 'numero_fin', fn_wa_numero_fin(w.numero_e164),
                    'verificado', w.verificado_en IS NOT NULL,
                    'formato', fn_wa_formato_de(m.usuario_id, p_equipo_id)) ORDER BY m.color_idx), '[]'::jsonb)
                   FROM membresias m LEFT JOIN whatsapp_usuario w ON w.usuario_id = m.usuario_id
                  WHERE m.equipo_id = p_equipo_id AND m.estado = 'activa' AND m.rol <> 'invitado'));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** PF-05 (0031) con verificación, formato preferido y ventana. */
CREATE OR REPLACE FUNCTION proc_wa_usuario(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'numero', w.numero_e164,
    'consentimiento', w.consentimiento_en IS NOT NULL AND w.consentimiento_revocado_en IS NULL,
    'consentimiento_en', fn_iso(w.consentimiento_en),
    'verificado', w.verificado_en IS NOT NULL,
    'verificado_en', fn_iso(w.verificado_en),
    'ventana_abierta', coalesce(w.ultimo_entrante_en > now() - interval '24 hours', false),
    'formato', (SELECT wa_formato FROM preferencias_usuario WHERE usuario_id = p_actor_id),
    'equipos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'equipo_id', e.id, 'nombre', e.nombre, 'rol', m.rol, 'consentimiento', m.consentimiento_wa,
                  'en_grupo', m.en_grupo_wa,
                  'whatsapp_conectado', coalesce(c.estado IN ('conectado', 'pausado'), false),
                  'enlace_invitacion', CASE WHEN m.consentimiento_wa IS TRUE THEN c.enlace_invitacion END) ORDER BY e.nombre)
                  FROM membresias m JOIN equipos e ON e.id = m.equipo_id
                  LEFT JOIN whatsapp_configuracion c ON c.equipo_id = e.id
                 WHERE m.usuario_id = p_actor_id AND m.estado = 'activa' AND m.rol <> 'invitado'), '[]'::jsonb))
    FROM (SELECT 1) uno LEFT JOIN whatsapp_usuario w ON w.usuario_id = p_actor_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** La persona elige su formato de WhatsApp (P-3); `NULL` = el del equipo. */
CREATE OR REPLACE FUNCTION proc_wa_formato_guardar(p_actor_id uuid, p_formato text) RETURNS jsonb AS $$
BEGIN
  BEGIN
    INSERT INTO preferencias_usuario (usuario_id, wa_formato) VALUES (p_actor_id, nullif(p_formato, '')::formato_wa)
    ON CONFLICT (usuario_id) DO UPDATE SET wa_formato = EXCLUDED.wa_formato;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Ese formato no existe.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  RETURN proc_wa_usuario(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-06 (0031): conectar; además fija `modo_entrega` según el proveedor elegido. */
CREATE OR REPLACE FUNCTION proc_wa_conectar(p_actor_id uuid, p_equipo_id uuid, p_datos jsonb) RETURNS jsonb AS $$
DECLARE v_prov proveedor_whatsapp; v_nombre text := btrim(coalesce(p_datos->>'grupo_nombre', ''));
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder configura WhatsApp.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  BEGIN
    v_prov := coalesce(p_datos->>'proveedor', 'simulado')::proveedor_whatsapp;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Proveedor de WhatsApp no válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  IF char_length(v_nombre) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'Escribe el nombre del grupo (2 a 100 caracteres).' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_prov = 'cloud_api_grupos' AND nullif(btrim(p_datos->>'grupo_externo_id'), '') IS NULL THEN
    RAISE EXCEPTION 'Para enviar al grupo real hace falta su id en WhatsApp.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO whatsapp_configuracion (equipo_id, proveedor, estado, grupo_nombre, grupo_externo_id, enlace_invitacion, causa_error)
  VALUES (p_equipo_id, v_prov, 'conectado', v_nombre, nullif(btrim(p_datos->>'grupo_externo_id'), ''),
          nullif(btrim(p_datos->>'enlace_invitacion'), ''), NULL)
  ON CONFLICT (equipo_id) DO UPDATE SET
    proveedor = EXCLUDED.proveedor, estado = 'conectado', grupo_nombre = EXCLUDED.grupo_nombre,
    grupo_externo_id = EXCLUDED.grupo_externo_id, enlace_invitacion = EXCLUDED.enlace_invitacion, causa_error = NULL;
  -- Spike 1 a 1 (P-5): el canal lo decide `modo_entrega`; el proveedor elegido lo fija al conectar.
  UPDATE whatsapp_configuracion SET modo_entrega = CASE v_prov WHEN 'cloud_api_directo' THEN 'individual'::modo_entrega_wa
                                                                WHEN 'cloud_api_grupos' THEN 'grupo'::modo_entrega_wa
                                                                ELSE modo_entrega END
   WHERE equipo_id = p_equipo_id;
  INSERT INTO whatsapp_reglas (equipo_id, tipo_evento, modo)
  SELECT p_equipo_id, t, m::modo_regla_wa FROM (VALUES ('reunion', 'instantaneo'), ('urgente', 'instantaneo'),
    ('asignacion', 'reporte'), ('aceptada', 'reporte'), ('triaje', 'reporte'), ('actualizacion', 'reporte')) v(t, m)
  ON CONFLICT DO NOTHING;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.whatsapp_conectado', 'equipo', p_equipo_id,
    jsonb_build_object('proveedor', v_prov), fn_primer_nombre(p_actor_id) || ' conectó WhatsApp («' || v_nombre || '»)');
  RETURN fn_wa_config_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_wa_formato_guardar(uuid, text);
-- proc_wa_conectar, proc_wa_configurar, proc_wa_panel, proc_wa_usuario, proc_wa_enviar, proc_wa_por_enviar,
-- proc_wa_webhook_registrar, fn_wa_mensaje_json y fn_wa_config_json vuelven a su versión de la 0031 al
-- revertir también la 0031 y aplicarla de nuevo (no se duplican aquí).
DROP FUNCTION IF EXISTS proc_wa_caducar_pendientes(timestamptz);
DROP FUNCTION IF EXISTS proc_wa_crear_reporte_personal(uuid);
DROP FUNCTION IF EXISTS fn_wa_reporte_personal_texto(uuid);
DROP FUNCTION IF EXISTS proc_wa_entrega_tras_ventana(uuid, boolean, text, text);
DROP FUNCTION IF EXISTS proc_wa_registrar_entrante(text, text, timestamptz);
DROP FUNCTION IF EXISTS proc_wa_solicitar_verificacion(uuid, text);
DROP FUNCTION IF EXISTS proc_wa_marcar_entrega(uuid, jsonb);
DROP FUNCTION IF EXISTS fn_wa_derivar_estado(uuid);
DROP FUNCTION IF EXISTS fn_wa_preparar_envio(whatsapp_mensajes);
DROP FUNCTION IF EXISTS fn_wa_entregas_para_enviar(uuid, timestamptz);
DROP FUNCTION IF EXISTS fn_wa_expandir_entregas(whatsapp_mensajes);
DROP FUNCTION IF EXISTS fn_wa_entrega_json(whatsapp_entregas, uuid);
DROP FUNCTION IF EXISTS fn_wa_formato_de(uuid, uuid);
DROP FUNCTION IF EXISTS fn_wa_puede_directo(uuid);
DROP FUNCTION IF EXISTS fn_wa_numero_fin(text);
DROP FUNCTION IF EXISTS fn_wa_numero_normal(text);
DROP TABLE IF EXISTS whatsapp_entregas;
DROP INDEX IF EXISTS ix_wa_msj_usuario;
ALTER TABLE whatsapp_mensajes DROP CONSTRAINT IF EXISTS ck_wa_msj_ambito, DROP COLUMN IF EXISTS usuario_id;
ALTER TABLE whatsapp_usuario DROP COLUMN IF EXISTS codigo_expira_en, DROP COLUMN IF EXISTS codigo_hash,
  DROP COLUMN IF EXISTS ultimo_teaser_en, DROP COLUMN IF EXISTS ultimo_entrante_en;
ALTER TABLE preferencias_usuario DROP COLUMN IF EXISTS wa_formato;
ALTER TABLE whatsapp_configuracion DROP COLUMN IF EXISTS formato_defecto, DROP COLUMN IF EXISTS modo_entrega;
DROP TYPE IF EXISTS estado_entrega_wa;
DROP TYPE IF EXISTS destino_wa;
DROP TYPE IF EXISTS formato_wa;
DROP TYPE IF EXISTS modo_entrega_wa;
