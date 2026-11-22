-- WhatsApp al empezar (docs/13_Plan_Integrado_Pendientes.md, 1.1), 2026-11-21.
-- Al aceptar una invitación, quien ya tiene número verificado y consentimiento general queda con los
-- avisos del equipo aceptados (`consentimiento_wa = true`) y el líder lo ve activo sin pedirle nada.
-- La respuesta suma `whatsapp_activo` para que la web ofrezca activarlo si falta.
-- Solo cambia `proc_invitacion_aceptar` (misma firma). Pruebas: P234.

-- Up Migration

CREATE OR REPLACE FUNCTION proc_invitacion_aceptar(p_actor_id uuid, p_codigo text) RETURNS jsonb AS $$
DECLARE
  i           invitaciones;
  v_rol       rol_membresia;
  v_membresia uuid;
  v_equipo    text;
  v_max       int;
  v_wa        boolean;
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
  -- WhatsApp al empezar (docs/13, 1.1): con número verificado y consentimiento general, los avisos
  -- de este equipo quedan aceptados sin preguntar; si no, la web le ofrece activarlo.
  SELECT w.verificado_en IS NOT NULL AND w.consentimiento_en IS NOT NULL AND w.consentimiento_revocado_en IS NULL
    INTO v_wa FROM whatsapp_usuario w WHERE w.usuario_id = p_actor_id;
  IF coalesce(v_wa, false) THEN
    UPDATE membresias SET consentimiento_wa = true WHERE id = v_membresia;
  END IF;
  RETURN jsonb_build_object('equipo_id', i.equipo_id, 'rol', v_rol, 'whatsapp_activo', coalesce(v_wa, false));
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration

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
