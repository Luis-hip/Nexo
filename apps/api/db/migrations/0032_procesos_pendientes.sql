-- Pendientes tras la Fase 5 (auditoría del 2026-11-20, docs/progreso.md): PER-04 reuniones en el
-- calendario personal (P-02), FALT-09 exportar y eliminar mis datos (P-01), solicitudes del
-- invitado (P-05, DEC-023), foto diaria del burndown (P-06), editar mensajes del chat (P-07) y
-- foto de perfil (P-09).
-- No cambia tablas. Documentación: docs/08, sección «Pendientes tras la Fase 5». DEC-037.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. PER-04: agenda personal (reuniones de todos mis equipos)
-- ---------------------------------------------------------------------------------------------

/**
 * PER-04: las reuniones (cada ocurrencia) de los equipos activos donde la persona es líder o
 * integrante, entre dos fechas (máx. 62 días). Los invitados no ven reuniones (como en EQ-14).
 */
CREATE OR REPLACE FUNCTION proc_personal_agenda(p_actor_id uuid, p_desde timestamptz, p_hasta timestamptz)
RETURNS jsonb AS $$
BEGIN
  IF p_hasta <= p_desde OR p_hasta - p_desde > interval '62 days' THEN
    RAISE EXCEPTION 'El rango del calendario va de 1 a 62 días.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(
             fn_reunion_json(r, p_actor_id, o.x)
               || jsonb_build_object('equipo_id', e.id, 'equipo_nombre', e.nombre)
             ORDER BY o.x), '[]'::jsonb)
      FROM membresias m
      JOIN equipos e ON e.id = m.equipo_id AND e.estado = 'activo'
      JOIN reuniones r ON r.equipo_id = e.id AND r.cancelada_en IS NULL
      CROSS JOIN LATERAL fn_reunion_ocurrencias(r, p_desde, p_hasta, e.zona_horaria) AS o(x)
     WHERE m.usuario_id = p_actor_id AND m.estado = 'activa' AND m.rol IN ('lider', 'integrante'));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 2. FALT-09: exportar y eliminar mis datos
-- ---------------------------------------------------------------------------------------------

/**
 * FALT-09: todo lo que Nexo guarda de la persona, en un JSON (perfil, preferencias, equipos,
 * tareas personales y de equipo a su cargo o creadas por ella, comentarios, mensajes que escribió,
 * reuniones, notificaciones y WhatsApp). Nunca incluye el hash de la contraseña ni secretos de 2FA.
 * Deja constancia en `exportaciones_datos` (lista al momento; caduca en 7 días).
 */
CREATE OR REPLACE FUNCTION proc_datos_exportar(p_actor_id uuid) RETURNS jsonb AS $$
DECLARE v_exp exportaciones_datos; v_datos jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_actor_id AND eliminado_en IS NULL) THEN
    RAISE EXCEPTION 'No encontramos tu cuenta.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  v_datos := jsonb_build_object(
    'perfil', (SELECT to_jsonb(u) - 'hash_contrasena' - 'google_sub' - 'intentos_fallidos' - 'bloqueado_hasta'
                 FROM usuarios u WHERE u.id = p_actor_id),
    'preferencias', (SELECT to_jsonb(p) FROM preferencias_usuario p WHERE p.usuario_id = p_actor_id),
    'preferencias_notificacion', (SELECT coalesce(jsonb_agg(to_jsonb(p) - 'usuario_id'), '[]'::jsonb)
                                    FROM preferencias_notificacion p WHERE p.usuario_id = p_actor_id),
    'whatsapp', (SELECT to_jsonb(w) - 'usuario_id' FROM whatsapp_usuario w WHERE w.usuario_id = p_actor_id),
    'equipos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'equipo', e.nombre, 'rol', m.rol, 'estado', m.estado, 'desde', fn_iso(m.desde),
                   'hasta', fn_iso(m.hasta), 'consentimiento_wa', m.consentimiento_wa) ORDER BY m.desde), '[]'::jsonb)
                  FROM membresias m JOIN equipos e ON e.id = m.equipo_id WHERE m.usuario_id = p_actor_id),
    'tareas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'equipo', e.nombre, 'codigo', t.codigo, 'titulo', t.titulo, 'descripcion', t.descripcion,
                  'estado', t.estado, 'prioridad', t.prioridad, 'progreso', t.progreso,
                  'vence_en', fn_iso(t.vence_en), 'creado_en', fn_iso(t.creado_en),
                  'completada_en', fn_iso(t.completada_en),
                  'subtareas', (SELECT coalesce(jsonb_agg(jsonb_build_object('titulo', s.titulo, 'hecha', s.hecha)
                                  ORDER BY s.orden), '[]'::jsonb) FROM subtareas s WHERE s.tarea_id = t.id))
                  ORDER BY t.creado_en), '[]'::jsonb)
                 FROM tareas t LEFT JOIN equipos e ON e.id = t.equipo_id
                WHERE t.dueno_id = p_actor_id OR t.responsable_id = p_actor_id OR t.creada_por = p_actor_id),
    'comentarios', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'tarea', t.titulo, 'texto', c.texto, 'creado_en', fn_iso(c.creado_en)) ORDER BY c.creado_en), '[]'::jsonb)
                      FROM comentarios_tarea c JOIN tareas t ON t.id = c.tarea_id WHERE c.autor_id = p_actor_id),
    'mensajes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'conversacion', coalesce(c.nombre, c.tipo::text), 'texto', m.texto,
                    'creado_en', fn_iso(m.creado_en), 'editado_en', fn_iso(m.editado_en)) ORDER BY m.creado_en), '[]'::jsonb)
                   FROM mensajes m JOIN conversaciones c ON c.id = m.conversacion_id
                  WHERE m.autor_id = p_actor_id AND m.eliminado_en IS NULL),
    'reuniones', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'titulo', r.titulo, 'inicio', fn_iso(r.inicio), 'respuesta', a.respuesta) ORDER BY r.inicio), '[]'::jsonb)
                    FROM reunion_asistencia a JOIN reuniones r ON r.id = a.reunion_id WHERE a.usuario_id = p_actor_id),
    'notificaciones', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'titulo', n.titulo, 'texto', n.texto, 'creada_en', fn_iso(n.creada_en)) ORDER BY n.creada_en), '[]'::jsonb)
                         FROM notificaciones n WHERE n.usuario_id = p_actor_id));
  INSERT INTO exportaciones_datos (usuario_id, estado, lista_en, expira_en)
  VALUES (p_actor_id, 'lista', now(), now() + interval '7 days') RETURNING * INTO v_exp;
  RETURN jsonb_build_object('exportacion_id', v_exp.id, 'generada_en', fn_iso(v_exp.lista_en), 'datos', v_datos);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * FALT-09: eliminar la cuenta. La API verifica antes la contraseña. Quien es líder de un equipo
 * activo con más personas primero transfiere el liderazgo (NX007). Se sale de todos los equipos, se
 * borran sus tareas personales, su número de WhatsApp y sus sesiones, y la cuenta queda anónima
 * («Cuenta eliminada», correo inservible): lo que aportó a los equipos se conserva sin su nombre.
 * Un equipo donde era la única persona se archiva.
 */
CREATE OR REPLACE FUNCTION proc_cuenta_eliminar(p_actor_id uuid) RETURNS jsonb AS $$
DECLARE v_equipo record; v_lider text;
BEGIN
  PERFORM 1 FROM usuarios WHERE id = p_actor_id AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu cuenta.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  SELECT e.nombre INTO v_lider
    FROM membresias m JOIN equipos e ON e.id = m.equipo_id AND e.estado = 'activo'
   WHERE m.usuario_id = p_actor_id AND m.estado = 'activa' AND m.rol = 'lider'
     AND EXISTS (SELECT 1 FROM membresias o WHERE o.equipo_id = m.equipo_id AND o.estado = 'activa'
                    AND o.usuario_id <> p_actor_id AND o.rol <> 'invitado')
   LIMIT 1;
  IF v_lider IS NOT NULL THEN
    RAISE EXCEPTION 'Eres líder de «%»: transfiere el liderazgo antes de eliminar tu cuenta.', v_lider
      USING ERRCODE = 'NX007', HINT = 'lider_no_sale';
  END IF;
  FOR v_equipo IN
    SELECT m.id AS membresia_id, m.equipo_id, m.rol FROM membresias m
     WHERE m.usuario_id = p_actor_id AND m.estado = 'activa'
  LOOP
    UPDATE membresias SET estado = 'salio', hasta = now() WHERE id = v_equipo.membresia_id;
    IF v_equipo.rol = 'lider' THEN
      UPDATE equipos SET estado = 'archivado' WHERE id = v_equipo.equipo_id;
    ELSE
      PERFORM fn_miembro_retirado(v_equipo.equipo_id, p_actor_id, p_actor_id);
      PERFORM fn_registrar_evento(v_equipo.equipo_id, p_actor_id, 'equipo.miembro_salio', 'membresia',
        v_equipo.membresia_id, jsonb_build_object('rol', v_equipo.rol, 'cuenta_eliminada', true),
        fn_primer_nombre(p_actor_id) || ' eliminó su cuenta y salió del equipo');
    END IF;
  END LOOP;
  DELETE FROM tareas WHERE dueno_id = p_actor_id;
  DELETE FROM whatsapp_usuario WHERE usuario_id = p_actor_id;
  DELETE FROM sesiones WHERE usuario_id = p_actor_id;
  DELETE FROM tokens_verificacion WHERE usuario_id = p_actor_id;
  DELETE FROM notificaciones WHERE usuario_id = p_actor_id;
  UPDATE solicitudes_invitado SET estado = 'rechazada', resuelta_en = now()
   WHERE usuario_id = p_actor_id AND estado = 'pendiente';
  UPDATE usuarios SET
    correo = 'eliminada-' || id || '@cuentas.nexo.invalid', correo_verificado_en = NULL,
    hash_contrasena = NULL, google_sub = NULL, nombre = 'Cuenta eliminada', cargo = '', descripcion = '',
    avatar_url = NULL, eliminado_en = now()
   WHERE id = p_actor_id;
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 3. Solicitudes del invitado (DEC-023)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_solicitud_json(s solicitudes_invitado) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'tipo', s.tipo, 'estado', s.estado, 'creada_en', fn_iso(s.creada_en),
    'resuelta_en', fn_iso(s.resuelta_en),
    'persona', fn_persona_json(s.equipo_id, s.usuario_id),
    'membresia_id', (SELECT m.id FROM membresias m WHERE m.equipo_id = s.equipo_id AND m.usuario_id = s.usuario_id
                        AND m.estado = 'activa'),
    'caduca_en', (SELECT fn_iso(m.caduca_en) FROM membresias m WHERE m.equipo_id = s.equipo_id
                     AND m.usuario_id = s.usuario_id AND m.estado = 'activa'));
$$ LANGUAGE sql STABLE;

/**
 * El invitado pide más días de acceso (`ampliacion`) o ser integrante (`conversion`). Una sola
 * solicitud pendiente de cada tipo; el líder recibe un aviso.
 */
CREATE OR REPLACE FUNCTION proc_solicitud_invitado_crear(p_actor_id uuid, p_equipo_id uuid, p_tipo text)
RETURNS jsonb AS $$
DECLARE v_rol rol_membresia; s solicitudes_invitado; v_tipo tipo_solicitud_invitado;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol <> 'invitado' THEN
    RAISE EXCEPTION 'Solo las personas invitadas hacen solicitudes.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  BEGIN
    v_tipo := p_tipo::tipo_solicitud_invitado;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'La solicitud no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END;
  SELECT * INTO s FROM solicitudes_invitado
   WHERE equipo_id = p_equipo_id AND usuario_id = p_actor_id AND tipo = v_tipo AND estado = 'pendiente';
  IF s.id IS NOT NULL THEN RETURN fn_solicitud_json(s); END IF;
  INSERT INTO solicitudes_invitado (equipo_id, usuario_id, tipo) VALUES (p_equipo_id, p_actor_id, v_tipo)
  RETURNING * INTO s;
  PERFORM fn_notificar(m.usuario_id, p_equipo_id,
      fn_primer_nombre(p_actor_id) || CASE v_tipo WHEN 'ampliacion' THEN ' pide más días de acceso'
                                                ELSE ' pide ser integrante' END,
      'Responde en Equipo → Miembros.', '/app/e/' || p_equipo_id || '/equipo')
    FROM membresias m WHERE m.equipo_id = p_equipo_id AND m.estado = 'activa' AND m.rol = 'lider';
  RETURN fn_solicitud_json(s);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder ve las solicitudes pendientes del equipo; el invitado, las suyas (todas). */
CREATE OR REPLACE FUNCTION proc_solicitud_invitado_listar(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
DECLARE v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol = 'integrante' THEN
    RAISE EXCEPTION 'Solo el líder ve las solicitudes de los invitados.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(fn_solicitud_json(s) ORDER BY s.creada_en DESC), '[]'::jsonb)
            FROM solicitudes_invitado s
           WHERE s.equipo_id = p_equipo_id
             AND CASE WHEN v_rol = 'lider' THEN s.estado = 'pendiente' ELSE s.usuario_id = p_actor_id END);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * El líder aprueba o rechaza una solicitud. Aprobar aplica la acción de AD-05
 * (`proc_invitado_gestionar`: ampliar `p_dias` = 7, 14 o 30, o convertir en integrante; el tope de
 * miembros lo cuida NX001). La persona recibe un aviso.
 */
CREATE OR REPLACE FUNCTION proc_solicitud_invitado_resolver(
  p_actor_id uuid, p_equipo_id uuid, p_solicitud_id uuid, p_aprobar boolean, p_dias int DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE s solicitudes_invitado; v_membresia uuid;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder responde las solicitudes.');
  SELECT * INTO s FROM solicitudes_invitado WHERE id = p_solicitud_id AND equipo_id = p_equipo_id FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa solicitud.' USING ERRCODE = 'NX006', HINT = 'solicitud_no_encontrada';
  END IF;
  IF s.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Esa solicitud ya se respondió.' USING ERRCODE = 'NX007', HINT = 'solicitud_resuelta';
  END IF;
  IF p_aprobar THEN
    SELECT id INTO v_membresia FROM membresias
     WHERE equipo_id = p_equipo_id AND usuario_id = s.usuario_id AND estado = 'activa' AND rol = 'invitado';
    IF v_membresia IS NULL THEN
      RAISE EXCEPTION 'Esa persona ya no es invitada del equipo.' USING ERRCODE = 'NX007', HINT = 'no_es_invitado';
    END IF;
    PERFORM proc_invitado_gestionar(p_actor_id, p_equipo_id, v_membresia,
      CASE s.tipo WHEN 'ampliacion' THEN 'ampliar' ELSE 'convertir' END,
      CASE s.tipo WHEN 'ampliacion' THEN coalesce(p_dias, 7) END);
  END IF;
  UPDATE solicitudes_invitado
     SET estado = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END::estado_solicitud,
         resuelta_por = p_actor_id, resuelta_en = now()
   WHERE id = s.id RETURNING * INTO s;
  IF NOT p_aprobar THEN
    PERFORM fn_notificar(s.usuario_id, p_equipo_id,
      'El líder no aprobó tu solicitud en ' || (SELECT nombre FROM equipos WHERE id = p_equipo_id),
      'Puedes hablarlo en el canal de Invitados.', '/app/e/' || p_equipo_id);
  ELSIF s.tipo = 'ampliacion' THEN
    PERFORM fn_notificar(s.usuario_id, p_equipo_id,
      'Tu acceso a ' || (SELECT nombre FROM equipos WHERE id = p_equipo_id) || ' se amplió',
      'El líder aprobó tu solicitud.', '/app/e/' || p_equipo_id);
  END IF;
  RETURN fn_solicitud_json(s);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Foto diaria del burndown
-- ---------------------------------------------------------------------------------------------

/**
 * Sistema (sin actor): guarda la instantánea de hoy (zona del equipo) de cada sprint activo, para
 * que el burndown tenga un punto por día aunque nadie mueva tareas. La corre el temporizador de la
 * API; repetirla el mismo día solo actualiza la foto.
 */
CREATE OR REPLACE FUNCTION proc_sprint_fotos_diarias() RETURNS jsonb AS $$
DECLARE s record; n int := 0;
BEGIN
  FOR s IN SELECT sp.id FROM sprints sp JOIN equipos e ON e.id = sp.equipo_id AND e.estado = 'activo'
            WHERE sp.estado = 'activo'
  LOOP
    PERFORM fn_sprint_instantanea(s.id);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('sprints', n);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 5. Chat: editar el propio mensaje
-- ---------------------------------------------------------------------------------------------

/** CH-02: quien escribió un mensaje lo corrige (1 a 4000 caracteres); queda marcado «editado». */
CREATE OR REPLACE FUNCTION proc_chat_editar(p_actor_id uuid, p_mensaje_id uuid, p_texto text) RETURNS jsonb AS $$
DECLARE m mensajes; c conversaciones; v_texto text := btrim(coalesce(p_texto, ''));
BEGIN
  SELECT * INTO m FROM mensajes WHERE id = p_mensaje_id FOR UPDATE;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese mensaje.' USING ERRCODE = 'NX006', HINT = 'mensaje_no_encontrado';
  END IF;
  c := fn_chat_exigir(p_actor_id, m.conversacion_id);
  PERFORM fn_exigir_equipo_activo(c.equipo_id);
  IF m.autor_id IS DISTINCT FROM p_actor_id OR m.es_sistema THEN
    RAISE EXCEPTION 'Solo puedes editar tus mensajes.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF m.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Ese mensaje se eliminó.' USING ERRCODE = 'NX007', HINT = 'mensaje_eliminado';
  END IF;
  IF char_length(v_texto) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'El mensaje va de 1 a 4000 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_texto <> m.texto THEN
    UPDATE mensajes SET texto = v_texto, editado_en = now() WHERE id = m.id;
  END IF;
  RETURN fn_chat_mensaje_json(m.id, p_actor_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 6. Foto de perfil (ONB-02 y PF-01)
-- ---------------------------------------------------------------------------------------------

/**
 * Guarda la foto de perfil (PNG, JPEG o WebP, hasta 1 MB) como archivo personal (sin equipo) y
 * apunta `usuarios.avatar_url` a `/usuarios/<id>/foto?v=<archivo>`. La foto anterior se borra.
 * `p_datos` NULL quita la foto.
 */
CREATE OR REPLACE FUNCTION proc_usuario_foto_guardar(p_actor_id uuid, p_mime text, p_datos bytea) RETURNS jsonb AS $$
DECLARE a archivos; v_url text;
BEGIN
  PERFORM 1 FROM usuarios WHERE id = p_actor_id AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No encontramos tu cuenta.' USING ERRCODE = 'NX006', HINT = 'usuario_no_encontrado';
  END IF;
  DELETE FROM archivos WHERE equipo_id IS NULL AND subido_por = p_actor_id AND storage_key LIKE 'foto:%';
  IF p_datos IS NOT NULL THEN
    IF p_mime NOT IN ('image/png', 'image/jpeg', 'image/webp') THEN
      RAISE EXCEPTION 'La foto debe ser PNG, JPEG o WebP.' USING ERRCODE = 'NX010', HINT = 'tipo_no_permitido';
    END IF;
    IF octet_length(p_datos) = 0 OR octet_length(p_datos) > 1048576 THEN
      RAISE EXCEPTION 'La foto debe pesar hasta 1 MB.' USING ERRCODE = 'NX010', HINT = 'archivo_muy_grande';
    END IF;
    INSERT INTO archivos (equipo_id, subido_por, nombre, mime, tamano_bytes, storage_key, sha256, tipo)
    VALUES (NULL, p_actor_id, 'foto-de-perfil', p_mime, octet_length(p_datos), 'foto:' || gen_random_uuid(),
            encode(sha256(p_datos), 'hex'), 'imagen')
    RETURNING * INTO a;
    INSERT INTO archivo_contenidos (archivo_id, datos) VALUES (a.id, p_datos);
    v_url := '/usuarios/' || p_actor_id || '/foto?v=' || a.id;
  END IF;
  UPDATE usuarios SET avatar_url = v_url WHERE id = p_actor_id;
  RETURN jsonb_build_object('avatar_url', v_url);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** La foto de perfil de una persona (para la etiqueta `<img>`; la API pide sesión). */
CREATE OR REPLACE FUNCTION proc_usuario_foto(p_usuario_id uuid) RETURNS jsonb AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object('mime', a.mime, 'contenido', encode(c.datos, 'base64'))
    INTO v
    FROM archivos a JOIN archivo_contenidos c ON c.archivo_id = a.id
   WHERE a.equipo_id IS NULL AND a.subido_por = p_usuario_id AND a.storage_key LIKE 'foto:%'
   ORDER BY a.creado_en DESC LIMIT 1;
  IF v IS NULL THEN
    RAISE EXCEPTION 'Esa persona no tiene foto.' USING ERRCODE = 'NX006', HINT = 'foto_no_encontrada';
  END IF;
  RETURN v;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_usuario_foto(uuid);
DROP FUNCTION IF EXISTS proc_usuario_foto_guardar(uuid, text, bytea);
DROP FUNCTION IF EXISTS proc_chat_editar(uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_sprint_fotos_diarias();
DROP FUNCTION IF EXISTS proc_solicitud_invitado_resolver(uuid, uuid, uuid, boolean, int);
DROP FUNCTION IF EXISTS proc_solicitud_invitado_listar(uuid, uuid);
DROP FUNCTION IF EXISTS proc_solicitud_invitado_crear(uuid, uuid, text);
DROP FUNCTION IF EXISTS fn_solicitud_json(solicitudes_invitado);
DROP FUNCTION IF EXISTS proc_cuenta_eliminar(uuid);
DROP FUNCTION IF EXISTS proc_datos_exportar(uuid);
DROP FUNCTION IF EXISTS proc_personal_agenda(uuid, timestamptz, timestamptz);
