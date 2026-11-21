-- Corrección de la pista B del spike WhatsApp 1 a 1 (DEC-039), 2026-11-21.
-- En producción la persona mandó solo el código («789941») y Nexo contestó «No tienes avisos
-- pendientes»: el enlace wa.me no siempre llena el texto y la pantalla decía «manda el código». Si
-- la persona tiene un código pendiente, ahora también vale el código solo. Solo cambia
-- `proc_wa_registrar_entrante` (misma firma). Pruebas: P233. Documentación: docs/08.

-- Up Migration

CREATE OR REPLACE FUNCTION proc_wa_registrar_entrante(p_numero text, p_texto text, p_ahora timestamptz DEFAULT now()) RETURNS jsonb AS $$
DECLARE w whatsapp_usuario; v_txt text := fn_wa_texto_comando(p_texto); v_codigo text; v_verif boolean := false;
        v_pend jsonb; v_msjs uuid[];
BEGIN
  SELECT * INTO w FROM whatsapp_usuario
   WHERE fn_wa_numero_normal(numero_e164) = fn_wa_numero_normal(p_numero) FOR UPDATE;
  IF w.usuario_id IS NULL THEN
    RETURN jsonb_build_object('conocido', false);
  END IF;
  UPDATE whatsapp_usuario SET ultimo_entrante_en = p_ahora WHERE usuario_id = w.usuario_id;

  -- «VERIFICAR 123456» o, si tiene un código pendiente, solo «123456» (así lo escriben las personas).
  v_codigo := coalesce(substring(v_txt FROM '(?:^| )VERIFICAR ([0-9]{6})(?: |$)'),
                       CASE WHEN w.codigo_hash IS NOT NULL THEN substring(v_txt FROM '^([0-9]{6})$') END);
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

SELECT fn_conceder_procesos();

-- Down Migration

CREATE OR REPLACE FUNCTION proc_wa_registrar_entrante(p_numero text, p_texto text, p_ahora timestamptz DEFAULT now()) RETURNS jsonb AS $$
DECLARE w whatsapp_usuario; v_txt text := fn_wa_texto_comando(p_texto); v_codigo text; v_verif boolean := false;
        v_pend jsonb; v_msjs uuid[];
BEGIN
  SELECT * INTO w FROM whatsapp_usuario
   WHERE fn_wa_numero_normal(numero_e164) = fn_wa_numero_normal(p_numero) FOR UPDATE;
  IF w.usuario_id IS NULL THEN
    RETURN jsonb_build_object('conocido', false);
  END IF;
  UPDATE whatsapp_usuario SET ultimo_entrante_en = p_ahora WHERE usuario_id = w.usuario_id;

  v_codigo := substring(v_txt FROM '(?:^| )VERIFICAR ([0-9]{6})(?: |$)');
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
