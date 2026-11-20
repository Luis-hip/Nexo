-- Fase 4.2 y 4.3 · WhatsApp (DEC-WA-1): despachador de eventos, cola y historial, reglas y reportes
-- programados, conexión del grupo, consentimiento y webhook de Meta.
-- Numeración: el chat (0014–0016) y la autenticación (0030) ya están en producción, así que
-- WhatsApp empieza en 0031 (DEC-AUTH-2). Documentación: docs/08, sección «Fase 4 · WhatsApp».
--
-- Ciclo de un aviso (`whatsapp_mensajes`, un solo ciclo de vida; cola e historial son filtros):
--   evento de dominio → proc_wa_procesar_eventos → pendiente (instantáneo o para el reporte)
--   → el líder lo envía (o el envío automático) → enviando → enviado | fallido
--   reporte: los pendientes de tipo «reporte» se juntan en un resumen «programado» a la hora fijada.
-- Los procesos de sistema (sin actor) los corre el temporizador de la API (`trabajos/whatsapp.ts`).

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 0. Esquema: solo columnas e índices nuevos (nada se borra ni se cambia)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE whatsapp_configuracion
  ADD COLUMN IF NOT EXISTS envio_automatico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_reporte_en timestamptz;

ALTER TABLE whatsapp_mensajes
  ADD COLUMN IF NOT EXISTS entregado_en timestamptz,
  ADD COLUMN IF NOT EXISTS leido_en timestamptz,
  ADD COLUMN IF NOT EXISTS reporte_id uuid REFERENCES whatsapp_mensajes(id) ON DELETE SET NULL;

-- Q4 de docs/02 §13 (siguiente lote del envío): sin este índice, PostgreSQL 16 hace Seq Scan.
CREATE INDEX IF NOT EXISTS ix_wa_msj_pendientes ON whatsapp_mensajes (creado_en)
  WHERE estado = 'pendiente' AND seleccionado AND tipo_envio = 'instantaneo';
-- Los estados que llegan por webhook buscan el mensaje por el id de Meta (idea de la rama de Isac).
CREATE INDEX IF NOT EXISTS ix_wa_msj_proveedor_id ON whatsapp_mensajes (proveedor_mensaje_id)
  WHERE proveedor_mensaje_id IS NOT NULL;

-- Lo ocurrido antes de esta migración no se avisa: el despachador empieza desde aquí.
UPDATE eventos_dominio SET procesado_en = now() WHERE procesado_en IS NULL;

-- ---------------------------------------------------------------------------------------------
-- 1. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/** Tipo de regla (`whatsapp_reglas.tipo_evento`) que le toca a un evento de dominio, o NULL. */
CREATE OR REPLACE FUNCTION fn_wa_regla_de(p_tipo text) RETURNS text AS $$
  SELECT CASE
    WHEN p_tipo IN ('reunion.creada', 'reunion.editada', 'reunion.cancelada') THEN 'reunion'
    WHEN p_tipo = 'tarea.por_vencer' THEN 'urgente'
    WHEN p_tipo IN ('tarea.asignada', 'tarea.asignacion_rechazada') THEN 'asignacion'
    WHEN p_tipo IN ('tarea.aceptada_por_votacion', 'tarea.creada') THEN 'aceptada'
    -- `triaje` es la votación de propuestas desde la Fase 2.5 (07, punto 74).
    WHEN p_tipo IN ('tarea.propuesta', 'tarea.rechazada_por_votacion') THEN 'triaje'
    WHEN p_tipo IN ('tarea.completada', 'tarea.estado_cambiado', 'sprint.iniciado', 'sprint.cerrado') THEN 'actualizacion'
  END;
$$ LANGUAGE sql IMMUTABLE;

/**
 * Cómo se nombra a una persona en un aviso (WA-07): «@Nombre» solo si dio su consentimiento en
 * ese equipo; sin consentimiento, NULL, y el texto no la nombra.
 */
CREATE OR REPLACE FUNCTION fn_wa_mencion(p_equipo uuid, p_usuario uuid) RETURNS text AS $$
  SELECT '@' || fn_primer_nombre(m.usuario_id)
    FROM membresias m
   WHERE m.equipo_id = p_equipo AND m.usuario_id = p_usuario AND m.estado = 'activa'
     AND m.consentimiento_wa IS TRUE;
$$ LANGUAGE sql STABLE;

/** Fecha y hora de un instante en la zona horaria del equipo («jue 20 nov, 09:30»). */
CREATE OR REPLACE FUNCTION fn_wa_cuando(p_equipo uuid, p_instante timestamptz) RETURNS text AS $$
  SELECT (ARRAY['lun','mar','mié','jue','vie','sáb','dom'])[extract(isodow FROM l)::int] || ' '
         || extract(day FROM l)::int || ' '
         || (ARRAY['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month FROM l)::int]
         || ', ' || to_char(l, 'HH24:MI')
    FROM (SELECT p_instante AT TIME ZONE coalesce((SELECT zona_horaria FROM equipos WHERE id = p_equipo), 'America/Mexico_City') AS l) x;
$$ LANGUAGE sql STABLE;

/**
 * Texto del aviso de un evento (docs/01 §7.4), hecho con los datos actuales. NULL si el evento no
 * genera aviso o su objeto ya no existe. Nunca pasa de 400 caracteres.
 */
CREATE OR REPLACE FUNCTION fn_wa_texto(e eventos_dominio) RETURNS text AS $$
DECLARE
  t tareas; r reuniones; s sprints;
  v_resp text; v_txt text;
BEGIN
  IF e.objeto_tipo = 'tarea' THEN
    SELECT * INTO t FROM tareas WHERE id = e.objeto_id;
    IF t.id IS NULL THEN RETURN NULL; END IF;
    v_resp := fn_wa_mencion(t.equipo_id, t.responsable_id);
    v_txt := CASE e.tipo
      WHEN 'tarea.asignada' THEN '👤 «' || t.titulo || '» (' || fn_codigo_tarea(t.codigo) || ') '
        || coalesce('ahora es de ' || v_resp || '.', 'ya tiene responsable.')
      WHEN 'tarea.asignacion_rechazada' THEN '↩️ «' || t.titulo || '» volvió sin responsable: hay que reasignarla.'
      WHEN 'tarea.aceptada_por_votacion' THEN '✅ Se aceptó «' || t.titulo || '» (' || fn_codigo_tarea(t.codigo) || ').'
      WHEN 'tarea.creada' THEN '✅ Nueva tarea: «' || t.titulo || '» (' || fn_codigo_tarea(t.codigo) || ').'
      WHEN 'tarea.propuesta' THEN '🗳️ Nueva propuesta en votación: «' || t.titulo || '». Vota en Nexo.'
      WHEN 'tarea.rechazada_por_votacion' THEN '❌ La votación rechazó «' || t.titulo || '».'
      WHEN 'tarea.completada' THEN '🏁 «' || t.titulo || '» se completó' || coalesce(' — gracias, ' || v_resp, '') || '.'
      WHEN 'tarea.estado_cambiado' THEN '🔄 «' || t.titulo || '» pasó a ' || lower(fn_nombre_estado(t.estado)) || '.'
      WHEN 'tarea.por_vencer' THEN '⏰ «' || t.titulo || '» vence ' || fn_wa_cuando(t.equipo_id, t.vence_en) || '.'
        || coalesce(' Responsable: ' || v_resp || '.', '')
    END;
  ELSIF e.objeto_tipo = 'reunion' THEN
    SELECT * INTO r FROM reuniones WHERE id = e.objeto_id;
    IF r.id IS NULL THEN RETURN NULL; END IF;
    v_txt := CASE e.tipo
      WHEN 'reunion.creada' THEN '📅 Reunión «' || r.titulo || '» el ' || fn_wa_cuando(r.equipo_id, r.inicio) || '. Confirma tu asistencia en Nexo.'
      WHEN 'reunion.editada' THEN '📅 Cambió la reunión «' || r.titulo || '»: ' || fn_wa_cuando(r.equipo_id, r.inicio) || '.'
      WHEN 'reunion.cancelada' THEN '🚫 Se canceló la reunión «' || r.titulo || '».'
    END;
  ELSIF e.objeto_tipo = 'sprint' THEN
    SELECT * INTO s FROM sprints WHERE id = e.objeto_id;
    IF s.id IS NULL THEN RETURN NULL; END IF;
    v_txt := CASE e.tipo
      WHEN 'sprint.iniciado' THEN '🚀 Empezó el Sprint ' || s.numero || ' (hasta el ' || to_char(s.fin, 'DD/MM') || ').'
      WHEN 'sprint.cerrado' THEN '🏁 Se cerró el Sprint ' || s.numero || '.'
    END;
  END IF;
  RETURN left(v_txt, 400);
END $$ LANGUAGE plpgsql STABLE;

/** Avisos dentro de la app que antes no existían (Fase 3, «con el despachador de eventos»). */
CREATE OR REPLACE FUNCTION fn_wa_notificar_evento(e eventos_dominio) RETURNS int AS $$
DECLARE t tareas; v_n int := 0; v_u uuid;
  quiere CONSTANT text := 'SELECT coalesce((SELECT por_app FROM preferencias_notificacion WHERE usuario_id = $1 AND evento = $2), true)';
  v_ok boolean;
BEGIN
  IF e.objeto_tipo <> 'tarea' OR e.tipo NOT IN ('tarea.asignada', 'tarea.propuesta', 'tarea.por_vencer') THEN RETURN 0; END IF;
  SELECT * INTO t FROM tareas WHERE id = e.objeto_id;
  IF t.id IS NULL THEN RETURN 0; END IF;
  IF e.tipo IN ('tarea.asignada', 'tarea.por_vencer') AND t.responsable_id IS NOT NULL
     AND t.responsable_id IS DISTINCT FROM e.actor_id THEN
    EXECUTE quiere INTO v_ok USING t.responsable_id,
      CASE WHEN e.tipo = 'tarea.asignada' THEN 'tarea_asignada' ELSE 'tarea_asignada' END;
    IF v_ok THEN
      PERFORM fn_notificar(t.responsable_id, t.equipo_id,
        CASE WHEN e.tipo = 'tarea.asignada' THEN 'Te asignaron ' || fn_codigo_tarea(t.codigo) ELSE fn_codigo_tarea(t.codigo) || ' vence pronto' END,
        t.titulo, '/app/e/' || t.equipo_id || '/tareas/' || t.id,
        CASE WHEN e.tipo = 'tarea.asignada' THEN 'aceptar_tarea' END, t.id::text, 'tareas');
      v_n := v_n + 1;
    END IF;
  ELSIF e.tipo = 'tarea.propuesta' THEN
    FOR v_u IN SELECT usuario_id FROM membresias
                WHERE equipo_id = t.equipo_id AND estado = 'activa' AND rol = 'integrante'
                  AND usuario_id IS DISTINCT FROM e.actor_id LOOP
      EXECUTE quiere INTO v_ok USING v_u, 'propuesta_nueva';
      IF v_ok THEN
        PERFORM fn_notificar(v_u, t.equipo_id, 'Nueva propuesta: ' || fn_codigo_tarea(t.codigo), t.titulo,
          '/app/e/' || t.equipo_id || '/tareas/votacion', NULL, t.id::text, 'tareas');
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END IF;
  RETURN v_n;
END $$ LANGUAGE plpgsql;

/** ¿Está ahora el equipo dentro de sus horas de silencio (en su zona horaria)? */
CREATE OR REPLACE FUNCTION fn_wa_en_silencio(c whatsapp_configuracion) RETURNS boolean AS $$
  SELECT CASE
    WHEN c.silencio_desde IS NULL OR c.silencio_hasta IS NULL THEN false
    WHEN c.silencio_desde <= c.silencio_hasta THEN ahora BETWEEN c.silencio_desde AND c.silencio_hasta
    ELSE ahora >= c.silencio_desde OR ahora <= c.silencio_hasta
  END
  FROM (SELECT (now() AT TIME ZONE coalesce(e.zona_horaria, 'America/Mexico_City'))::time AS ahora
          FROM equipos e WHERE e.id = c.equipo_id) x;
$$ LANGUAGE sql STABLE;

/**
 * Próximo instante del reporte programado del equipo, después de `p_desde` (en su zona horaria):
 * diario a la hora fijada, o semanal el día fijado (1 = lunes … 7 = domingo).
 */
CREATE OR REPLACE FUNCTION fn_wa_proximo_reporte(c whatsapp_configuracion, p_desde timestamptz) RETURNS timestamptz AS $$
DECLARE v_zona text; v_local timestamp; v_cand timestamp; i int;
BEGIN
  SELECT coalesce(zona_horaria, 'America/Mexico_City') INTO v_zona FROM equipos WHERE id = c.equipo_id;
  v_local := p_desde AT TIME ZONE v_zona;
  FOR i IN 0..7 LOOP
    v_cand := (v_local::date + i) + c.reporte_hora;
    IF v_cand > v_local AND (c.reporte_frecuencia = 'diario' OR extract(isodow FROM v_cand) = c.reporte_dia) THEN
      RETURN v_cand AT TIME ZONE v_zona;
    END IF;
  END LOOP;
  RETURN NULL;
END $$ LANGUAGE plpgsql STABLE;

/** Mensaje de WhatsApp con la forma de la API (`MensajeWhatsApp`). */
CREATE OR REPLACE FUNCTION fn_wa_mensaje_json(m whatsapp_mensajes) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'tipo_evento', m.tipo_evento, 'motivo', m.motivo, 'texto', m.texto,
    'tipo_envio', m.tipo_envio, 'estado', m.estado, 'seleccionado', m.seleccionado,
    'programado_para', fn_iso(m.programado_para), 'enviado_en', fn_iso(m.enviado_en),
    'entregado_en', fn_iso(m.entregado_en), 'leido_en', fn_iso(m.leido_en),
    'enviado_por', CASE WHEN m.enviado_por IS NULL THEN NULL ELSE fn_persona_json(m.equipo_id, m.enviado_por) END,
    'intentos', m.intentos, 'ultimo_error', m.ultimo_error, 'reporte_id', m.reporte_id,
    'creado_en', fn_iso(m.creado_en));
$$ LANGUAGE sql STABLE;

/** Lo que el servidor necesita para entregar un mensaje con el proveedor del equipo. */
CREATE OR REPLACE FUNCTION fn_wa_para_enviar(m whatsapp_mensajes) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'equipo_id', m.equipo_id, 'texto', m.texto,
    'proveedor', c.proveedor, 'grupo_externo_id', c.grupo_externo_id,
    -- Solo para el envío directo (`cloud_api_directo`): personas con número y consentimiento.
    'destinatarios', coalesce((
      SELECT jsonb_agg(w.numero_e164 ORDER BY w.numero_e164)
        FROM membresias mb JOIN whatsapp_usuario w ON w.usuario_id = mb.usuario_id
       WHERE mb.equipo_id = m.equipo_id AND mb.estado = 'activa' AND mb.rol <> 'invitado'
         AND mb.consentimiento_wa IS TRUE AND w.consentimiento_en IS NOT NULL AND w.consentimiento_revocado_en IS NULL),
      '[]'::jsonb))
    FROM whatsapp_configuracion c WHERE c.equipo_id = m.equipo_id;
$$ LANGUAGE sql STABLE;

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
    'proximo_reporte', CASE WHEN c.equipo_id IS NULL THEN NULL
                            ELSE fn_iso(fn_wa_proximo_reporte(c, greatest(now(), coalesce(c.ultimo_reporte_en, now())))) END)
    FROM (SELECT 1) uno LEFT JOIN whatsapp_configuracion c ON c.equipo_id = p_equipo;
$$ LANGUAGE sql STABLE;

/** Exige que el equipo tenga WhatsApp conectado o en pausa (no sin configurar). */
CREATE OR REPLACE FUNCTION fn_wa_exigir_config(p_equipo uuid) RETURNS whatsapp_configuracion AS $$
DECLARE c whatsapp_configuracion;
BEGIN
  SELECT * INTO c FROM whatsapp_configuracion WHERE equipo_id = p_equipo;
  IF c.equipo_id IS NULL OR c.estado = 'sin_configurar' THEN
    RAISE EXCEPTION 'Primero conecta WhatsApp para este equipo.' USING ERRCODE = 'NX007', HINT = 'whatsapp_sin_configurar';
  END IF;
  RETURN c;
END $$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 2. Procesos de sistema (los corre el temporizador de la API; sin actor)
-- ---------------------------------------------------------------------------------------------

/**
 * Despachador de eventos (patrón outbox, DEC-022): lee los eventos sin procesar, crea los avisos
 * dentro de la app que faltaban (asignación, propuesta, vencimiento) y, según las reglas del
 * equipo, deja el aviso de WhatsApp en la cola (instantáneo) o para el próximo reporte.
 */
CREATE OR REPLACE FUNCTION proc_wa_procesar_eventos(p_limite int DEFAULT 200) RETURNS jsonb AS $$
DECLARE
  e eventos_dominio; c whatsapp_configuracion;
  v_regla text; v_modo modo_regla_wa; v_texto text;
  v_proc int := 0; v_cola int := 0; v_notif int := 0;
BEGIN
  FOR e IN SELECT * FROM eventos_dominio WHERE procesado_en IS NULL
            ORDER BY id LIMIT least(greatest(coalesce(p_limite, 200), 1), 1000)
            FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      v_notif := v_notif + fn_wa_notificar_evento(e);
      v_regla := fn_wa_regla_de(e.tipo);
      SELECT * INTO c FROM whatsapp_configuracion WHERE equipo_id = e.equipo_id;
      IF v_regla IS NOT NULL AND c.equipo_id IS NOT NULL AND c.estado <> 'sin_configurar' THEN
        SELECT modo INTO v_modo FROM whatsapp_reglas WHERE equipo_id = e.equipo_id AND tipo_evento = v_regla;
        IF v_modo IN ('instantaneo', 'reporte') THEN
          v_texto := fn_wa_texto(e);
          IF v_texto IS NOT NULL THEN
            INSERT INTO whatsapp_mensajes (equipo_id, evento_id, tipo_evento, motivo, texto, tipo_envio)
            VALUES (e.equipo_id, e.id, v_regla, e.tipo, v_texto, v_modo::text::tipo_envio_wa);
            v_cola := v_cola + 1;
          END IF;
        END IF;
      END IF;
      UPDATE eventos_dominio SET procesado_en = now(), intentos = intentos + 1, ultimo_error = NULL WHERE id = e.id;
    EXCEPTION WHEN OTHERS THEN
      -- Un evento con problema no frena a los demás; se reintenta hasta 5 veces.
      UPDATE eventos_dominio SET intentos = intentos + 1, ultimo_error = left(SQLERRM, 300),
             procesado_en = CASE WHEN intentos + 1 >= 5 THEN now() END
       WHERE id = e.id;
    END;
    v_proc := v_proc + 1;
  END LOOP;
  RETURN jsonb_build_object('procesados', v_proc, 'encolados', v_cola, 'notificados', v_notif);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Vencimientos (regla «urgente»): registra `tarea.por_vencer` para las tareas abiertas que vencen
 * en menos de 24 h, una sola vez por tarea y fecha de entrega.
 */
CREATE OR REPLACE FUNCTION proc_wa_vencimientos() RETURNS jsonb AS $$
DECLARE t tareas; v_n int := 0;
BEGIN
  FOR t IN SELECT * FROM tareas
            WHERE equipo_id IS NOT NULL AND NOT archivada AND vence_en IS NOT NULL
              AND vence_en > now() AND vence_en <= now() + interval '24 hours'
              AND estado NOT IN ('completada', 'rechazada', 'cancelada', 'propuesta')
              AND NOT EXISTS (SELECT 1 FROM eventos_dominio ev
                               WHERE ev.objeto_id = tareas.id AND ev.tipo = 'tarea.por_vencer'
                                 AND ev.carga->>'vence_en' = fn_iso(tareas.vence_en))
            FOR UPDATE SKIP LOCKED LOOP
    PERFORM fn_registrar_evento(t.equipo_id, NULL, 'tarea.por_vencer', 'tarea', t.id,
      jsonb_build_object('vence_en', fn_iso(t.vence_en), 'responsable_id', t.responsable_id),
      fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» vence en menos de 24 h');
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('registrados', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Reportes programados (modo «reporte»): a la hora fijada de cada equipo junta sus avisos
 * pendientes de reporte en un resumen «programado» para enviarse ya. Sin pendientes no hay reporte.
 */
CREATE OR REPLACE FUNCTION proc_wa_reportes(p_ahora timestamptz DEFAULT now()) RETURNS jsonb AS $$
DECLARE c whatsapp_configuracion; v_toca timestamptz; v_lineas text; v_total int; v_id uuid; v_n int := 0;
BEGIN
  FOR c IN SELECT * FROM whatsapp_configuracion WHERE estado IN ('conectado', 'pausado') FOR UPDATE SKIP LOCKED LOOP
    v_toca := fn_wa_proximo_reporte(c, coalesce(c.ultimo_reporte_en, p_ahora - interval '8 days'));
    CONTINUE WHEN v_toca IS NULL OR v_toca > p_ahora;
    SELECT count(*) INTO v_total FROM whatsapp_mensajes
     WHERE equipo_id = c.equipo_id AND estado = 'pendiente' AND tipo_envio = 'reporte';
    UPDATE whatsapp_configuracion SET ultimo_reporte_en = p_ahora WHERE equipo_id = c.equipo_id;
    CONTINUE WHEN v_total = 0;
    SELECT string_agg('• ' || texto, E'\n' ORDER BY creado_en, evento_id) INTO v_lineas
      FROM (SELECT texto, creado_en, evento_id FROM whatsapp_mensajes
             WHERE equipo_id = c.equipo_id AND estado = 'pendiente' AND tipo_envio = 'reporte'
             ORDER BY creado_en, evento_id LIMIT 8) x;
    INSERT INTO whatsapp_mensajes (equipo_id, tipo_evento, motivo, texto, tipo_envio, estado, programado_para)
    VALUES (c.equipo_id, 'reporte', 'Reporte ' || CASE c.reporte_frecuencia WHEN 'diario' THEN 'diario' ELSE 'semanal' END,
            left('📋 Resumen de ' || (SELECT nombre FROM equipos WHERE id = c.equipo_id) || E'\n' || v_lineas
                 || CASE WHEN v_total > 8 THEN E'\n…y ' || (v_total - 8) || ' más en Nexo.' ELSE '' END, 400),
            'reporte', 'programado', p_ahora)
    RETURNING id INTO v_id;
    UPDATE whatsapp_mensajes SET estado = 'cancelado', reporte_id = v_id, ultimo_error = 'Incluido en el reporte'
     WHERE equipo_id = c.equipo_id AND estado = 'pendiente' AND tipo_envio = 'reporte' AND id <> v_id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('generados', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Lo que el sistema envía solo: los reportes programados que ya tocan y, si el equipo activó el
 * envío automático, los instantáneos seleccionados. Nada en pausa, con error ni en horas de silencio.
 * Los deja «enviando» (nadie más los toma) y devuelve con qué entregarlos.
 */
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
    v := v || fn_wa_para_enviar(m);
  END LOOP;
  RETURN v;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Resultado de la entrega de un mensaje «enviando»: enviado (con el id del proveedor) o fallido. */
CREATE OR REPLACE FUNCTION proc_wa_envio_resultado(p_mensaje_id uuid, p_ok boolean, p_proveedor_id text, p_error text)
RETURNS jsonb AS $$
DECLARE m whatsapp_mensajes;
BEGIN
  UPDATE whatsapp_mensajes
     SET estado = CASE WHEN p_ok THEN 'enviado' ELSE 'fallido' END::estado_mensaje_wa,
         enviado_en = CASE WHEN p_ok THEN now() END,
         proveedor_mensaje_id = CASE WHEN p_ok THEN p_proveedor_id END,
         ultimo_error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'Error desconocido'), 300) END
   WHERE id = p_mensaje_id AND estado = 'enviando'
  RETURNING * INTO m;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'Ese aviso no se estaba enviando.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  IF p_ok THEN
    UPDATE whatsapp_configuracion SET ultimo_envio_en = now(), causa_error = NULL WHERE equipo_id = m.equipo_id;
  END IF;
  RETURN fn_wa_mensaje_json(m);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Webhook de Meta (4.3): guarda el evento una sola vez (por su id) y aplica los estados de entrega
 * (`sent`, `delivered`, `read`, `failed`) al mensaje con ese id de proveedor. La API ya verificó la
 * firma HMAC antes de llamar aquí.
 */
CREATE OR REPLACE FUNCTION proc_wa_webhook_registrar(p_evento_id text, p_tipo text, p_carga jsonb) RETURNS jsonb AS $$
DECLARE v_nuevo boolean; v_n int := 0; st jsonb;
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
      v_n := v_n + (CASE WHEN FOUND THEN 1 ELSE 0 END);
    END LOOP;
    UPDATE whatsapp_webhook_eventos SET procesado_en = now() WHERE proveedor_evento_id = p_evento_id;
  END IF;
  RETURN jsonb_build_object('nuevo', v_nuevo, 'actualizados', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 3. Procesos del líder (WA-01 a WA-08)
-- ---------------------------------------------------------------------------------------------

/**
 * WA-01: panel del líder. Configuración, reglas, conteos de la cola y el historial, próximo
 * reporte y, por persona, su consentimiento (WA-07).
 */
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
                    'tiene_numero', w.usuario_id IS NOT NULL) ORDER BY m.color_idx), '[]'::jsonb)
                   FROM membresias m LEFT JOIN whatsapp_usuario w ON w.usuario_id = m.usuario_id
                  WHERE m.equipo_id = p_equipo_id AND m.estado = 'activa' AND m.rol <> 'invitado'));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-02: la cola (instantáneos por revisar) y lo que espera al próximo reporte. */
CREATE OR REPLACE FUNCTION proc_wa_cola(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder revisa la cola de WhatsApp.');
  RETURN jsonb_build_object(
    'instantaneos', coalesce((SELECT jsonb_agg(fn_wa_mensaje_json(m) ORDER BY m.creado_en, m.evento_id)
                                FROM whatsapp_mensajes m
                               WHERE m.equipo_id = p_equipo_id AND m.estado IN ('pendiente', 'enviando') AND m.tipo_envio = 'instantaneo'), '[]'::jsonb),
    'para_reporte', coalesce((SELECT jsonb_agg(fn_wa_mensaje_json(m) ORDER BY m.creado_en, m.evento_id)
                                FROM whatsapp_mensajes m
                               WHERE m.equipo_id = p_equipo_id AND m.estado = 'pendiente' AND m.tipo_envio = 'reporte'), '[]'::jsonb),
    'proximo_reporte', fn_wa_config_json(p_equipo_id)->'proximo_reporte');
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-04: historial (enviados, fallidos y cancelados), del más reciente al más antiguo, por páginas. */
CREATE OR REPLACE FUNCTION proc_wa_historial(
  p_actor_id uuid, p_equipo_id uuid, p_estado text DEFAULT NULL, p_antes timestamptz DEFAULT NULL, p_limite int DEFAULT 30
) RETURNS jsonb AS $$
DECLARE v_rol rol_membresia; v_lim int := least(greatest(coalesce(p_limite, 30), 1), 100); v jsonb;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven el historial de WhatsApp.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF p_estado IS NOT NULL AND p_estado NOT IN ('enviado', 'fallido', 'cancelado') THEN
    RAISE EXCEPTION 'Filtro de estado no válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT coalesce(jsonb_agg(fn_wa_mensaje_json(m) ORDER BY coalesce(m.enviado_en, m.creado_en) DESC), '[]'::jsonb) INTO v
    FROM (SELECT * FROM whatsapp_mensajes
           WHERE equipo_id = p_equipo_id AND estado IN ('enviado', 'fallido', 'cancelado')
             AND (p_estado IS NULL OR estado = p_estado::estado_mensaje_wa)
             AND (p_antes IS NULL OR coalesce(enviado_en, creado_en) < p_antes)
             -- Los incluidos en un reporte se ven dentro del reporte, no sueltos.
             AND reporte_id IS NULL
           ORDER BY coalesce(enviado_en, creado_en) DESC LIMIT v_lim + 1) m;
  RETURN jsonb_build_object('items', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(v) x LIMIT v_lim) y),
                            'hay_mas', jsonb_array_length(v) > v_lim);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-02: el líder corrige el texto o (de)selecciona un aviso pendiente antes de enviarlo. */
CREATE OR REPLACE FUNCTION proc_wa_mensaje_editar(p_actor_id uuid, p_mensaje_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
DECLARE m whatsapp_mensajes;
BEGIN
  SELECT * INTO m FROM whatsapp_mensajes WHERE id = p_mensaje_id FOR UPDATE;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese aviso.' USING ERRCODE = 'NX006', HINT = 'aviso_no_encontrado';
  END IF;
  PERFORM fn_exigir_lider(p_actor_id, m.equipo_id, 'Solo el líder edita la cola de WhatsApp.');
  IF m.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se editan los avisos que aún no se envían.' USING ERRCODE = 'NX007', HINT = 'estado_invalido';
  END IF;
  IF p_cambios ? 'texto' AND char_length(btrim(coalesce(p_cambios->>'texto', ''))) NOT BETWEEN 1 AND 400 THEN
    RAISE EXCEPTION 'El aviso debe tener entre 1 y 400 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE whatsapp_mensajes SET
    texto = CASE WHEN p_cambios ? 'texto' THEN btrim(p_cambios->>'texto') ELSE texto END,
    seleccionado = coalesce((p_cambios->>'seleccionado')::boolean, seleccionado)
   WHERE id = m.id RETURNING * INTO m;
  RETURN fn_wa_mensaje_json(m);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-02: descartar avisos pendientes (quedan «cancelado» en el historial). */
CREATE OR REPLACE FUNCTION proc_wa_descartar(p_actor_id uuid, p_equipo_id uuid, p_ids uuid[]) RETURNS jsonb AS $$
DECLARE v_n int;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder edita la cola de WhatsApp.');
  UPDATE whatsapp_mensajes SET estado = 'cancelado', ultimo_error = 'Descartado por el líder'
   WHERE equipo_id = p_equipo_id AND id = ANY (coalesce(p_ids, ARRAY[]::uuid[])) AND estado = 'pendiente';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('descartados', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-08: volver a la cola los avisos que fallaron. */
CREATE OR REPLACE FUNCTION proc_wa_reintentar(p_actor_id uuid, p_equipo_id uuid, p_ids uuid[]) RETURNS jsonb AS $$
DECLARE v_n int;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder envía la cola de WhatsApp.');
  UPDATE whatsapp_mensajes SET estado = 'pendiente', tipo_envio = 'instantaneo', seleccionado = true
   WHERE equipo_id = p_equipo_id AND estado = 'fallido'
     AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('reintentados', v_n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * WA-02: el líder envía la cola (los seleccionados, o solo `p_ids`). Los deja «enviando» y devuelve
 * con qué entregarlos; la API llama al proveedor y registra el resultado de cada uno.
 */
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
    v := v || fn_wa_para_enviar(m);
  END LOOP;
  RETURN v;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * WA-06: conectar WhatsApp. En modo `simulado` basta el nombre del grupo; los proveedores reales
 * piden el id del grupo (o el envío directo). Si el equipo aún no tiene reglas, crea las de
 * siempre: reuniones y vencimientos al instante; lo demás, al reporte diario.
 */
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
  INSERT INTO whatsapp_reglas (equipo_id, tipo_evento, modo)
  SELECT p_equipo_id, t, m::modo_regla_wa FROM (VALUES ('reunion', 'instantaneo'), ('urgente', 'instantaneo'),
    ('asignacion', 'reporte'), ('aceptada', 'reporte'), ('triaje', 'reporte'), ('actualizacion', 'reporte')) v(t, m)
  ON CONFLICT DO NOTHING;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.whatsapp_conectado', 'equipo', p_equipo_id,
    jsonb_build_object('proveedor', v_prov), fn_primer_nombre(p_actor_id) || ' conectó WhatsApp («' || v_nombre || '»)');
  RETURN fn_wa_config_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-08: desconectar. La cola pendiente se cancela; el historial se conserva. */
CREATE OR REPLACE FUNCTION proc_wa_desconectar(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder configura WhatsApp.');
  PERFORM fn_wa_exigir_config(p_equipo_id);
  UPDATE whatsapp_configuracion SET estado = 'sin_configurar', causa_error = NULL WHERE equipo_id = p_equipo_id;
  UPDATE whatsapp_mensajes SET estado = 'cancelado', ultimo_error = 'WhatsApp se desconectó'
   WHERE equipo_id = p_equipo_id AND estado IN ('pendiente', 'programado');
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.whatsapp_desconectado', 'equipo', p_equipo_id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' desconectó WhatsApp');
  RETURN fn_wa_config_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * WA-05 y WA-08: ajustes de la conexión: pausar o reanudar (`estado`), reporte (frecuencia, hora,
 * día), agrupar, horas de silencio y envío automático. Solo lo que viene en `p_cambios`.
 */
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
      silencio_desde = CASE WHEN p_cambios ? 'silencio_desde' THEN (p_cambios->>'silencio_desde')::time ELSE silencio_desde END,
      silencio_hasta = CASE WHEN p_cambios ? 'silencio_hasta' THEN (p_cambios->>'silencio_hasta')::time ELSE silencio_hasta END,
      enlace_invitacion = CASE WHEN p_cambios ? 'enlace_invitacion' THEN nullif(btrim(p_cambios->>'enlace_invitacion'), '') ELSE enlace_invitacion END
     WHERE equipo_id = p_equipo_id;
  EXCEPTION WHEN invalid_text_representation OR check_violation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Algún ajuste de WhatsApp no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  RETURN fn_wa_config_json(p_equipo_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** WA-05: modo de una regla (instantáneo, reporte o apagado). */
CREATE OR REPLACE FUNCTION proc_wa_regla_guardar(p_actor_id uuid, p_equipo_id uuid, p_tipo text, p_modo text) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder configura WhatsApp.');
  IF p_tipo NOT IN ('reunion', 'urgente', 'aceptada', 'asignacion', 'actualizacion', 'triaje') THEN
    RAISE EXCEPTION 'Esa regla no existe.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  BEGIN
    INSERT INTO whatsapp_reglas (equipo_id, tipo_evento, modo) VALUES (p_equipo_id, p_tipo, p_modo::modo_regla_wa)
    ON CONFLICT (equipo_id, tipo_evento) DO UPDATE SET modo = EXCLUDED.modo;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Modo no válido: instantáneo, reporte o apagado.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  RETURN jsonb_build_object('tipo_evento', p_tipo, 'modo', p_modo);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Procesos de la persona (PF-05 y WA-07)
-- ---------------------------------------------------------------------------------------------

/** PF-05: número, consentimiento general y, por equipo, si acepta avisos y menciones. */
CREATE OR REPLACE FUNCTION proc_wa_usuario(p_actor_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'numero', w.numero_e164,
    'consentimiento', w.consentimiento_en IS NOT NULL AND w.consentimiento_revocado_en IS NULL,
    'consentimiento_en', fn_iso(w.consentimiento_en),
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

/**
 * PF-05: guarda el número (E.164) y el consentimiento general. Retirar el consentimiento general
 * lo retira también en todos los equipos (nadie la vuelve a mencionar).
 */
CREATE OR REPLACE FUNCTION proc_wa_usuario_guardar(p_actor_id uuid, p_cambios jsonb) RETURNS jsonb AS $$
DECLARE v_num text := nullif(btrim(p_cambios->>'numero'), '');
BEGIN
  IF p_cambios ? 'numero' THEN
    IF v_num IS NULL THEN
      DELETE FROM whatsapp_usuario WHERE usuario_id = p_actor_id;
      UPDATE membresias SET consentimiento_wa = false WHERE usuario_id = p_actor_id AND estado = 'activa' AND consentimiento_wa;
    ELSIF v_num !~ '^\+[1-9][0-9]{7,14}$' THEN
      RAISE EXCEPTION 'Escribe el número con lada internacional, por ejemplo +5212221234567.' USING ERRCODE = 'NX010', HINT = 'validacion';
    ELSE
      BEGIN
        INSERT INTO whatsapp_usuario (usuario_id, numero_e164) VALUES (p_actor_id, v_num)
        ON CONFLICT (usuario_id) DO UPDATE SET numero_e164 = EXCLUDED.numero_e164,
          verificado_en = CASE WHEN whatsapp_usuario.numero_e164 = EXCLUDED.numero_e164 THEN whatsapp_usuario.verificado_en END;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Ese número ya está registrado en otra cuenta.' USING ERRCODE = 'NX012', HINT = 'numero_registrado';
      END;
    END IF;
  END IF;
  IF p_cambios ? 'consentimiento' THEN
    IF NOT EXISTS (SELECT 1 FROM whatsapp_usuario WHERE usuario_id = p_actor_id) THEN
      RAISE EXCEPTION 'Primero guarda tu número de WhatsApp.' USING ERRCODE = 'NX010', HINT = 'validacion';
    END IF;
    IF (p_cambios->>'consentimiento')::boolean THEN
      UPDATE whatsapp_usuario SET consentimiento_en = now(), consentimiento_revocado_en = NULL WHERE usuario_id = p_actor_id;
    ELSE
      UPDATE whatsapp_usuario SET consentimiento_revocado_en = now() WHERE usuario_id = p_actor_id;
      UPDATE membresias SET consentimiento_wa = false WHERE usuario_id = p_actor_id AND estado = 'activa' AND consentimiento_wa;
    END IF;
  END IF;
  RETURN proc_wa_usuario(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * WA-07 y PF-05: la persona acepta o rechaza los avisos y menciones de WhatsApp de un equipo.
 * Aceptar exige número y consentimiento general vigentes.
 */
CREATE OR REPLACE FUNCTION proc_wa_consentimiento(p_actor_id uuid, p_equipo_id uuid, p_acepta boolean) RETURNS jsonb AS $$
DECLARE v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no reciben avisos de WhatsApp del equipo.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF p_acepta AND NOT EXISTS (SELECT 1 FROM whatsapp_usuario WHERE usuario_id = p_actor_id
                                AND consentimiento_en IS NOT NULL AND consentimiento_revocado_en IS NULL) THEN
    RAISE EXCEPTION 'Primero guarda tu número y acepta recibir avisos por WhatsApp.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  UPDATE membresias SET consentimiento_wa = coalesce(p_acepta, false)
   WHERE equipo_id = p_equipo_id AND usuario_id = p_actor_id AND estado = 'activa';
  RETURN proc_wa_usuario(p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_wa_consentimiento(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_wa_usuario_guardar(uuid, jsonb);
DROP FUNCTION IF EXISTS proc_wa_usuario(uuid);
DROP FUNCTION IF EXISTS proc_wa_regla_guardar(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS proc_wa_configurar(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_wa_desconectar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_wa_conectar(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_wa_enviar(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS proc_wa_reintentar(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS proc_wa_descartar(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS proc_wa_mensaje_editar(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_wa_historial(uuid, uuid, text, timestamptz, int);
DROP FUNCTION IF EXISTS proc_wa_cola(uuid, uuid);
DROP FUNCTION IF EXISTS proc_wa_panel(uuid, uuid);
DROP FUNCTION IF EXISTS proc_wa_webhook_registrar(text, text, jsonb);
DROP FUNCTION IF EXISTS proc_wa_envio_resultado(uuid, boolean, text, text);
DROP FUNCTION IF EXISTS proc_wa_por_enviar(int);
DROP FUNCTION IF EXISTS proc_wa_reportes(timestamptz);
DROP FUNCTION IF EXISTS proc_wa_vencimientos();
DROP FUNCTION IF EXISTS proc_wa_procesar_eventos(int);
DROP FUNCTION IF EXISTS fn_wa_exigir_config(uuid);
DROP FUNCTION IF EXISTS fn_wa_config_json(uuid);
DROP FUNCTION IF EXISTS fn_wa_para_enviar(whatsapp_mensajes);
DROP FUNCTION IF EXISTS fn_wa_mensaje_json(whatsapp_mensajes);
DROP FUNCTION IF EXISTS fn_wa_proximo_reporte(whatsapp_configuracion, timestamptz);
DROP FUNCTION IF EXISTS fn_wa_en_silencio(whatsapp_configuracion);
DROP FUNCTION IF EXISTS fn_wa_notificar_evento(eventos_dominio);
DROP FUNCTION IF EXISTS fn_wa_texto(eventos_dominio);
DROP FUNCTION IF EXISTS fn_wa_cuando(uuid, timestamptz);
DROP FUNCTION IF EXISTS fn_wa_mencion(uuid, uuid);
DROP FUNCTION IF EXISTS fn_wa_regla_de(text);
DROP INDEX IF EXISTS ix_wa_msj_proveedor_id;
DROP INDEX IF EXISTS ix_wa_msj_pendientes;
ALTER TABLE whatsapp_mensajes DROP COLUMN IF EXISTS reporte_id, DROP COLUMN IF EXISTS leido_en, DROP COLUMN IF EXISTS entregado_en;
ALTER TABLE whatsapp_configuracion DROP COLUMN IF EXISTS ultimo_reporte_en, DROP COLUMN IF EXISTS envio_automatico;
