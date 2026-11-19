-- Pruebas de los procesos de la BD (Fase 2.5, docs/08). Cada bloque termina con NOTICE 'OK Pn: …'.
-- Las ejecuta `pnpm db:test:procesos` dentro de una transacción que se revierte (no deja datos).
-- El archivo de las 11 pruebas de integridad (pruebas.sql) no se toca.
SET client_min_messages = notice;

-- Equipo de prueba con una líder, `n` integrantes y un invitado. Devuelve el id del equipo.
CREATE FUNCTION pg_temp.equipo_con(n int) RETURNS uuid AS $$
DECLARE v_equipo uuid; v_lider uuid; v_u uuid; i int;
BEGIN
  INSERT INTO usuarios (correo, nombre) VALUES ('lider-' || gen_random_uuid() || '@prueba.mx', 'Líder Prueba')
  RETURNING id INTO v_lider;
  INSERT INTO equipos (nombre, creado_por) VALUES ('Equipo de prueba', v_lider) RETURNING id INTO v_equipo;
  INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx) VALUES (v_equipo, v_lider, 'lider', 0);
  FOR i IN 1..n LOOP
    INSERT INTO usuarios (correo, nombre) VALUES ('int-' || gen_random_uuid() || '@prueba.mx', 'Integrante ' || i)
    RETURNING id INTO v_u;
    INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx) VALUES (v_equipo, v_u, 'integrante', i);
  END LOOP;
  INSERT INTO usuarios (correo, nombre) VALUES ('inv-' || gen_random_uuid() || '@prueba.mx', 'Invitado Prueba')
  RETURNING id INTO v_u;
  INSERT INTO membresias (equipo_id, usuario_id, rol, caduca_en) VALUES (v_equipo, v_u, 'invitado', now() + interval '7 days');
  RETURN v_equipo;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.lider(p_equipo uuid) RETURNS uuid AS $$
  SELECT usuario_id FROM membresias WHERE equipo_id = p_equipo AND rol = 'lider' AND estado = 'activa';
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.invitado(p_equipo uuid) RETURNS uuid AS $$
  SELECT usuario_id FROM membresias WHERE equipo_id = p_equipo AND rol = 'invitado' AND estado = 'activa';
$$ LANGUAGE sql;

-- Integrante número `i` (1..n) en el orden de su color.
CREATE FUNCTION pg_temp.integrante(p_equipo uuid, i int) RETURNS uuid AS $$
  SELECT usuario_id FROM membresias WHERE equipo_id = p_equipo AND rol = 'integrante' AND estado = 'activa'
   ORDER BY color_idx OFFSET i - 1 LIMIT 1;
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.proponer(p_equipo uuid, p_titulo text DEFAULT 'Propuesta de prueba') RETURNS uuid AS $$
  SELECT (proc_tarea_proponer(pg_temp.lider(p_equipo), p_equipo,
            jsonb_build_object('titulo', p_titulo, 'subtareas', jsonb_build_array('Paso 1', 'Paso 2')))->>'id')::uuid;
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.votar(p_equipo uuid, p_tarea uuid, i int, p_voto text) RETURNS text AS $$
  SELECT proc_tarea_votar(pg_temp.integrante(p_equipo, i), p_equipo, p_tarea, p_voto)->>'estado';
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.estado(p_tarea uuid) RETURNS text AS $$
  SELECT estado::text FROM tareas WHERE id = p_tarea;
$$ LANGUAGE sql;

-- P1. El líder no vota (NX004), ni por el proceso ni insertando a mano.
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); t uuid := pg_temp.proponer(e); ok int := 0; BEGIN
  BEGIN PERFORM proc_tarea_votar(pg_temp.lider(e), e, t, 'aceptar');
  EXCEPTION WHEN SQLSTATE 'NX004' THEN ok := ok + 1; END;
  BEGIN INSERT INTO tarea_votos (tarea_id, usuario_id, voto) VALUES (t, pg_temp.lider(e), 'aceptar');
  EXCEPTION WHEN SQLSTATE 'NX004' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P1: el líder pudo votar'; END IF;
  RAISE NOTICE 'OK P1: el líder no vota (NX004)';
END $$;

-- P2. Un invitado no vota (NX004).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); t uuid := pg_temp.proponer(e); ok int := 0; BEGIN
  BEGIN PERFORM proc_tarea_votar(pg_temp.invitado(e), e, t, 'aceptar');
  EXCEPTION WHEN SQLSTATE 'NX004' THEN ok := ok + 1; END;
  BEGIN INSERT INTO tarea_votos (tarea_id, usuario_id, voto) VALUES (t, pg_temp.invitado(e), 'aceptar');
  EXCEPTION WHEN SQLSTATE 'NX004' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P2: un invitado pudo votar'; END IF;
  RAISE NOTICE 'OK P2: el invitado no vota (NX004)';
END $$;

-- P3. Votar dos veces actualiza el voto, no lo duplica.
DO $$ DECLARE e uuid := pg_temp.equipo_con(4); t uuid := pg_temp.proponer(e); n int; v text; BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'aceptar');
  PERFORM pg_temp.votar(e, t, 1, 'rechazar');
  SELECT count(*), max(voto::text) INTO n, v FROM tarea_votos WHERE tarea_id = t;
  IF n <> 1 OR v <> 'rechazar' THEN RAISE EXCEPTION 'FALLO P3: % votos, último %', n, v; END IF;
  RAISE NOTICE 'OK P3: el voto doble actualiza y no duplica';
END $$;

-- P4. Fuera de `propuesta` no se vota (NX004 en la tabla, NX007 en el proceso).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); t uuid := pg_temp.proponer(e); ok int := 0; BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'aceptar');
  PERFORM pg_temp.votar(e, t, 2, 'aceptar');           -- 2 de 3: aceptada
  BEGIN PERFORM pg_temp.votar(e, t, 3, 'rechazar');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  BEGIN INSERT INTO tarea_votos (tarea_id, usuario_id, voto) VALUES (t, pg_temp.integrante(e, 3), 'rechazar');
  EXCEPTION WHEN SQLSTATE 'NX004' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P4: se votó fuera de propuesta'; END IF;
  RAISE NOTICE 'OK P4: no se vota fuera de propuesta';
END $$;

-- P5. Con 3 integrantes se acepta con 2 votos a favor (1 no basta).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); t uuid := pg_temp.proponer(e); BEGIN
  IF pg_temp.votar(e, t, 1, 'aceptar') <> 'propuesta' THEN RAISE EXCEPTION 'FALLO P5: 1 de 3 aceptó'; END IF;
  IF pg_temp.votar(e, t, 2, 'aceptar') <> 'aceptada' THEN RAISE EXCEPTION 'FALLO P5: 2 de 3 no aceptó'; END IF;
  IF pg_temp.estado(t) <> 'aceptada' THEN RAISE EXCEPTION 'FALLO P5: estado %', pg_temp.estado(t); END IF;
  RAISE NOTICE 'OK P5: mayoría con 3 integrantes = 2';
END $$;

-- P6. Con 4 integrantes hacen falta 3 (2 no bastan).
DO $$ DECLARE e uuid := pg_temp.equipo_con(4); t uuid := pg_temp.proponer(e); BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'aceptar');
  IF pg_temp.votar(e, t, 2, 'aceptar') <> 'propuesta' THEN RAISE EXCEPTION 'FALLO P6: 2 de 4 aceptó'; END IF;
  IF pg_temp.votar(e, t, 3, 'aceptar') <> 'aceptada' THEN RAISE EXCEPTION 'FALLO P6: 3 de 4 no aceptó'; END IF;
  RAISE NOTICE 'OK P6: mayoría con 4 integrantes = 3';
END $$;

-- P7. Con el máximo de integrantes (7, más la líder) hacen falta 4; con 8 serían 5.
DO $$ DECLARE e uuid := pg_temp.equipo_con(7); t uuid := pg_temp.proponer(e); i int; BEGIN
  FOR i IN 1..3 LOOP PERFORM pg_temp.votar(e, t, i, 'aceptar'); END LOOP;
  IF pg_temp.estado(t) <> 'propuesta' THEN RAISE EXCEPTION 'FALLO P7: 3 de 7 aceptó'; END IF;
  IF pg_temp.votar(e, t, 4, 'aceptar') <> 'aceptada' THEN RAISE EXCEPTION 'FALLO P7: 4 de 7 no aceptó'; END IF;
  IF fn_votacion_resultado(4, 0, 8) <> 'abierta' OR fn_votacion_resultado(5, 0, 8) <> 'aceptada' THEN
    RAISE EXCEPTION 'FALLO P7: la mayoría con 8 no es 5';
  END IF;
  RAISE NOTICE 'OK P7: mayoría con 7 integrantes = 4 (con 8 = 5)';
END $$;

-- P8. Empate con 4 integrantes (2 y 2): sigue en propuesta (V-4).
DO $$ DECLARE e uuid := pg_temp.equipo_con(4); t uuid := pg_temp.proponer(e); BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'aceptar');
  PERFORM pg_temp.votar(e, t, 2, 'aceptar');
  PERFORM pg_temp.votar(e, t, 3, 'rechazar');
  IF pg_temp.votar(e, t, 4, 'rechazar') <> 'propuesta' THEN RAISE EXCEPTION 'FALLO P8: el empate cerró la votación'; END IF;
  RAISE NOTICE 'OK P8: el empate deja la propuesta abierta';
END $$;

-- P9. Rechazo por mayoría: queda `rechazada` por votación, con motivo y sin responsable.
DO $$ DECLARE e uuid := pg_temp.equipo_con(4); t uuid := pg_temp.proponer(e); r tareas; BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'rechazar');
  PERFORM pg_temp.votar(e, t, 2, 'rechazar');
  PERFORM pg_temp.votar(e, t, 3, 'rechazar');
  SELECT * INTO r FROM tareas WHERE id = t;
  IF r.estado <> 'rechazada' OR r.rechazo_por <> 'votacion' OR r.motivo IS NULL THEN
    RAISE EXCEPTION 'FALLO P9: estado %, rechazo_por %', r.estado, r.rechazo_por;
  END IF;
  RAISE NOTICE 'OK P9: 3 de 4 en contra rechazan por votación';
END $$;

-- P10. Sin integrantes la líder acepta directamente (V-5).
DO $$ DECLARE e uuid := pg_temp.equipo_con(0); t uuid := pg_temp.proponer(e); BEGIN
  IF pg_temp.estado(t) <> 'aceptada' THEN RAISE EXCEPTION 'FALLO P10: estado %', pg_temp.estado(t); END IF;
  RAISE NOTICE 'OK P10: sin integrantes la propuesta queda aceptada';
END $$;

-- P11. Solo la líder propone (NX005), con sus subtareas en la misma operación.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.proponer(e); n int; ok boolean := false; BEGIN
  SELECT count(*) INTO n FROM subtareas WHERE tarea_id = t;
  IF n <> 2 THEN RAISE EXCEPTION 'FALLO P11: % subtareas', n; END IF;
  BEGIN PERFORM proc_tarea_proponer(pg_temp.integrante(e, 1), e, '{"titulo":"No debería"}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P11: un integrante propuso'; END IF;
  RAISE NOTICE 'OK P11: solo la líder propone, con subtareas';
END $$;

-- P12. Retirar: solo la líder, con la versión al día; queda `cancelada` y se puede reformular.
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); t uuid := pg_temp.proponer(e); v int; ok int := 0; nueva uuid; BEGIN
  SELECT version INTO v FROM tareas WHERE id = t;
  BEGIN PERFORM proc_tarea_retirar(pg_temp.integrante(e, 1), e, t, v);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_retirar(pg_temp.lider(e), e, t, v + 5);
  EXCEPTION WHEN SQLSTATE 'NX008' THEN ok := ok + 1; END;
  PERFORM proc_tarea_retirar(pg_temp.lider(e), e, t, v);
  IF ok <> 2 OR pg_temp.estado(t) <> 'cancelada' THEN RAISE EXCEPTION 'FALLO P12: retirar'; END IF;
  nueva := (proc_tarea_reformular(pg_temp.lider(e), e, t, '{"titulo":"Versión 2"}')->>'id')::uuid;
  IF pg_temp.estado(nueva) <> 'propuesta' OR pg_temp.estado(t) <> 'cancelada' THEN
    RAISE EXCEPTION 'FALLO P12: reformular';
  END IF;
  RAISE NOTICE 'OK P12: retirar y reformular';
END $$;

-- P13. Quien deja el equipo pierde sus votos de propuestas abiertas (no los de las cerradas).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); a uuid := pg_temp.proponer(e, 'Abierta'); c uuid := pg_temp.proponer(e, 'Cerrada');
  u uuid := pg_temp.integrante(e, 1); n_abierta int; n_cerrada int; BEGIN
  PERFORM pg_temp.votar(e, a, 1, 'aceptar');
  PERFORM pg_temp.votar(e, c, 1, 'aceptar');
  PERFORM pg_temp.votar(e, c, 2, 'aceptar');              -- c queda aceptada
  UPDATE membresias SET estado = 'salio', hasta = now() WHERE equipo_id = e AND usuario_id = u;
  SELECT count(*) INTO n_abierta FROM tarea_votos WHERE tarea_id = a AND usuario_id = u;
  SELECT count(*) INTO n_cerrada FROM tarea_votos WHERE tarea_id = c AND usuario_id = u;
  IF n_abierta <> 0 OR n_cerrada <> 1 THEN RAISE EXCEPTION 'FALLO P13: abierta %, cerrada %', n_abierta, n_cerrada; END IF;
  RAISE NOTICE 'OK P13: al salir se descartan los votos abiertos';
END $$;

-- P14. El resumen no revela el voto ajeno mientras está abierta; cerrada, solo el conteo.
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); t uuid := pg_temp.proponer(e); r jsonb; BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'rechazar');
  r := proc_tarea_votacion(pg_temp.integrante(e, 2), e, t);
  IF r->'mi_voto' <> 'null'::jsonb OR jsonb_array_length(r->'votaron') <> 1
     OR (r->'votaron'->0) ? 'voto' OR (r->>'necesarios')::int <> 2 THEN
    RAISE EXCEPTION 'FALLO P14: resumen abierto %', r;
  END IF;
  r := proc_tarea_votacion(pg_temp.integrante(e, 1), e, t);
  IF r->'mi_voto'->>'voto' <> 'rechazar' THEN RAISE EXCEPTION 'FALLO P14: no ve su voto'; END IF;
  PERFORM pg_temp.votar(e, t, 2, 'aceptar');
  PERFORM pg_temp.votar(e, t, 3, 'aceptar');
  r := proc_tarea_votacion(pg_temp.lider(e), e, t);
  IF (r->>'abierta')::boolean OR jsonb_array_length(r->'votaron') <> 0 OR (r->>'aceptar')::int <> 2 THEN
    RAISE EXCEPTION 'FALLO P14: resumen cerrado %', r;
  END IF;
  RAISE NOTICE 'OK P14: el resumen respeta la visibilidad de los votos (V-8)';
END $$;

-- P15. Índice fraccionario en PL/pgSQL: casos de la librería fractional-indexing.
DO $$ BEGIN
  IF fn_orden_entre(NULL, NULL) <> 'a0' OR fn_orden_entre('a0', NULL) <> 'a1'
     OR fn_orden_entre(NULL, 'a0') <> 'Zz' OR fn_orden_entre('a0', 'a1') <> 'a0V'
     OR fn_orden_entre('az', NULL) <> 'b00' OR fn_orden_entre('Zz', 'a0') <> 'ZzV'
     OR fn_orden_entre('a0V', 'a1') <> 'a0l' THEN
    RAISE EXCEPTION 'FALLO P15: índice fraccionario';
  END IF;
  RAISE NOTICE 'OK P15: índice fraccionario igual al de la librería';
END $$;

-- =============================================================================================
-- Procesos de las migraciones 0004 a 0008: por cada proceso, al menos un caso permitido y uno
-- prohibido (docs/07, 2.6).
-- =============================================================================================

CREATE FUNCTION pg_temp.membresia(p_equipo uuid, p_usuario uuid) RETURNS uuid AS $$
  SELECT id FROM membresias WHERE equipo_id = p_equipo AND usuario_id = p_usuario AND estado = 'activa';
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.usuario(p_nombre text DEFAULT 'Persona Suelta') RETURNS uuid AS $$
  INSERT INTO usuarios (correo, nombre) VALUES ('u-' || gen_random_uuid() || '@prueba.mx', p_nombre) RETURNING id;
$$ LANGUAGE sql;

-- Tarea aceptada por votación (todos los integrantes a favor), con el integrante `i` de responsable
-- (0 = sin responsable) y la asignación ya aceptada.
CREATE FUNCTION pg_temp.aceptada(p_equipo uuid, i int DEFAULT 0, p_titulo text DEFAULT 'Tarea aceptada') RETURNS uuid AS $$
DECLARE t uuid; n int; k int;
BEGIN
  t := (proc_tarea_proponer(pg_temp.lider(p_equipo), p_equipo,
          jsonb_build_object('titulo', p_titulo,
                             'responsable_id', CASE WHEN i > 0 THEN pg_temp.integrante(p_equipo, i) END))->>'id')::uuid;
  SELECT count(*) INTO n FROM membresias WHERE equipo_id = p_equipo AND rol = 'integrante' AND estado = 'activa';
  FOR k IN 1..n LOOP
    EXIT WHEN pg_temp.estado(t) <> 'propuesta';
    PERFORM pg_temp.votar(p_equipo, t, k, 'aceptar');
  END LOOP;
  IF i > 0 THEN
    PERFORM proc_tarea_responder_asignacion(pg_temp.integrante(p_equipo, i), p_equipo, t, true);
  END IF;
  RETURN t;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.version(p_tarea uuid) RETURNS int AS $$
  SELECT version FROM tareas WHERE id = p_tarea;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------------------------------
-- Cuenta, sesiones y contacto (0004)
-- ---------------------------------------------------------------------------------------------

-- P16. proc_sesion_resolver: sesión vigente sí; revocada o vencida, no.
DO $$ DECLARE u uuid := pg_temp.usuario('Ana Sesión'); r jsonb; BEGIN
  INSERT INTO sesiones (usuario_id, token_hash, expira_en) VALUES
    (u, '\x01'::bytea || uuid_send(gen_random_uuid()), now() + interval '1 day'),
    (u, '\x02'::bytea || uuid_send(gen_random_uuid()), now() - interval '1 minute');
  SELECT proc_sesion_resolver(token_hash) INTO r FROM sesiones WHERE usuario_id = u AND expira_en > now();
  IF r->'usuario'->>'nombre' <> 'Ana Sesión' OR r ? 'hash_contrasena' THEN RAISE EXCEPTION 'FALLO P16: %', r; END IF;
  IF (SELECT proc_sesion_resolver(token_hash) FROM sesiones WHERE usuario_id = u AND expira_en < now()) IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO P16: resolvió una sesión vencida';
  END IF;
  UPDATE sesiones SET revocada_en = now() WHERE usuario_id = u;
  IF EXISTS (SELECT 1 FROM sesiones WHERE usuario_id = u AND proc_sesion_resolver(token_hash) IS NOT NULL) THEN
    RAISE EXCEPTION 'FALLO P16: resolvió una sesión revocada';
  END IF;
  RAISE NOTICE 'OK P16: proc_sesion_resolver solo resuelve sesiones vigentes';
END $$;

-- P17. proc_sesion_revocar: cada quien revoca la suya; la de otra persona no.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); s uuid; BEGIN
  INSERT INTO sesiones (usuario_id, token_hash, expira_en)
  VALUES (u, uuid_send(gen_random_uuid()), now() + interval '1 day') RETURNING id INTO s;
  IF (proc_sesion_revocar(otro, s)->>'revocada')::boolean THEN RAISE EXCEPTION 'FALLO P17: revocó una sesión ajena'; END IF;
  IF NOT (proc_sesion_revocar(u, s)->>'revocada')::boolean THEN RAISE EXCEPTION 'FALLO P17: no revocó su sesión'; END IF;
  IF (SELECT revocada_en IS NULL FROM sesiones WHERE id = s) THEN RAISE EXCEPTION 'FALLO P17: la sesión sigue vigente'; END IF;
  RAISE NOTICE 'OK P17: proc_sesion_revocar solo revoca sesiones propias';
END $$;

-- P18. Acceso de desarrollo: proc_dev_usuarios y proc_dev_sesion_crear.
DO $$ DECLARE u uuid := pg_temp.usuario('Devi Login'); c text; ok boolean := false; BEGIN
  SELECT correo::text INTO c FROM usuarios WHERE id = u;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(proc_dev_usuarios()) x WHERE x->>'id' = u::text) THEN
    RAISE EXCEPTION 'FALLO P18: proc_dev_usuarios no lista al usuario';
  END IF;
  PERFORM proc_dev_sesion_crear(c, uuid_send(gen_random_uuid()), '127.0.0.1', now() + interval '1 day');
  IF NOT EXISTS (SELECT 1 FROM sesiones WHERE usuario_id = u AND dispositivo = 'dev-login') THEN
    RAISE EXCEPTION 'FALLO P18: no creó la sesión';
  END IF;
  BEGIN PERFORM proc_dev_sesion_crear('nadie@prueba.mx', uuid_send(gen_random_uuid()), '', now() + interval '1 day');
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P18: creó sesión para un correo inexistente'; END IF;
  RAISE NOTICE 'OK P18: acceso de desarrollo (proc_dev_usuarios, proc_dev_sesion_crear)';
END $$;

-- P19. proc_usuario_yo: equipos activos con su perfil y preferencias por defecto; no los ajenos.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); otro uuid := pg_temp.equipo_con(0); r jsonb; BEGIN
  r := proc_usuario_yo(pg_temp.integrante(e, 1));
  IF jsonb_array_length(r->'equipos') <> 1 OR r->'equipos'->0->>'rol' <> 'integrante'
     OR r->'preferencias'->>'tema' <> 'sistema' THEN
    RAISE EXCEPTION 'FALLO P19: %', r;
  END IF;
  UPDATE equipos SET estado = 'archivado', archivado_en = now() WHERE id = e;
  IF jsonb_array_length(proc_usuario_yo(pg_temp.integrante(e, 1))->'equipos') <> 0 THEN
    RAISE EXCEPTION 'FALLO P19: lista un equipo archivado';
  END IF;
  RAISE NOTICE 'OK P19: proc_usuario_yo';
END $$;

-- P20. proc_usuario_preferencias_guardar: guarda un subconjunto; un valor fuera del catálogo falla.
DO $$ DECLARE u uuid := pg_temp.usuario(); r jsonb; ok boolean := false; BEGIN
  r := proc_usuario_preferencias_guardar(u, '{"tema":"oscuro","tour_visto":true}');
  IF r->>'tema' <> 'oscuro' OR NOT (r->>'tour_visto')::boolean OR r->>'densidad' <> 'comoda' THEN
    RAISE EXCEPTION 'FALLO P20: %', r;
  END IF;
  BEGIN PERFORM proc_usuario_preferencias_guardar(u, '{"tema":"neon"}');
  EXCEPTION WHEN invalid_text_representation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P20: aceptó un tema inválido'; END IF;
  RAISE NOTICE 'OK P20: proc_usuario_preferencias_guardar';
END $$;

-- P21. proc_usuario_perfil_guardar: actualiza el perfil propio; sin cambios, NX010.
DO $$ DECLARE u uuid := pg_temp.usuario('Nombre Viejo'); r jsonb; ok boolean := false; BEGIN
  r := proc_usuario_perfil_guardar(u, '{"nombre":"Nombre Nuevo","cargo":"QA"}');
  IF r->>'nombre' <> 'Nombre Nuevo' OR r->>'cargo' <> 'QA' THEN RAISE EXCEPTION 'FALLO P21: %', r; END IF;
  BEGIN PERFORM proc_usuario_perfil_guardar(u, '{}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P21: aceptó un perfil sin cambios'; END IF;
  RAISE NOTICE 'OK P21: proc_usuario_perfil_guardar';
END $$;

-- P22. proc_contacto_enviar: guarda el mensaje; uno demasiado corto lo rechaza la tabla.
DO $$ DECLARE ok boolean := false; BEGIN
  IF NOT (proc_contacto_enviar('Ana', 'ana@prueba.mx', 'Duda', 'Un mensaje de prueba válido')->>'recibido')::boolean THEN
    RAISE EXCEPTION 'FALLO P22';
  END IF;
  BEGIN PERFORM proc_contacto_enviar('Ana', 'ana@prueba.mx', 'Duda', 'corto');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P22: aceptó un mensaje corto'; END IF;
  RAISE NOTICE 'OK P22: proc_contacto_enviar';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Equipos e invitaciones (0005)
-- ---------------------------------------------------------------------------------------------

-- P23. proc_equipo_contexto: miembro sí; ajeno NX006; invitado caducado NX005.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); ok int := 0; BEGIN
  IF proc_equipo_contexto(pg_temp.integrante(e, 1), e)->>'rol' <> 'integrante' THEN RAISE EXCEPTION 'FALLO P23'; END IF;
  BEGIN PERFORM proc_equipo_contexto(pg_temp.usuario(), e);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  UPDATE membresias SET caduca_en = now() - interval '1 day' WHERE equipo_id = e AND rol = 'invitado';
  BEGIN PERFORM proc_equipo_contexto(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P23: % de 2', ok; END IF;
  RAISE NOTICE 'OK P23: proc_equipo_contexto';
END $$;

-- P24. proc_equipo_crear: quien crea es líder con color 0 y hay dos canales; nombre inválido falla.
DO $$ DECLARE u uuid := pg_temp.usuario('Paula Líder'); e uuid; ok boolean := false; BEGIN
  e := (proc_equipo_crear(u, '{"nombre":"Equipo nuevo","max_miembros":5}')->>'id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM membresias WHERE equipo_id = e AND usuario_id = u AND rol = 'lider' AND color_idx = 0)
     OR (SELECT count(*) FROM conversaciones WHERE equipo_id = e) <> 2
     OR (SELECT max_miembros FROM equipos WHERE id = e) <> 5
     OR NOT EXISTS (SELECT 1 FROM eventos_dominio WHERE equipo_id = e AND tipo = 'equipo.creado') THEN
    RAISE EXCEPTION 'FALLO P24';
  END IF;
  BEGIN PERFORM proc_equipo_crear(u, '{"nombre":"X"}');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P24: aceptó un nombre de una letra'; END IF;
  RAISE NOTICE 'OK P24: proc_equipo_crear';
END $$;

-- P25. proc_equipo_obtener: el líder ve miembros; el invitado, no; un ajeno, NX006.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); r jsonb; ok boolean := false; BEGIN
  r := proc_equipo_obtener(pg_temp.lider(e), e);
  IF jsonb_array_length(r->'miembros') <> 4 OR (r->>'miembros_activos')::int <> 3
     OR (r->>'invitados_activos')::int <> 1 OR r->>'mi_rol' <> 'lider' THEN
    RAISE EXCEPTION 'FALLO P25: %', r;
  END IF;
  r := proc_equipo_obtener(pg_temp.invitado(e), e);
  IF jsonb_array_length(r->'miembros') <> 0 OR r->>'mi_rol' <> 'invitado' THEN RAISE EXCEPTION 'FALLO P25: invitado %', r; END IF;
  BEGIN PERFORM proc_equipo_obtener(pg_temp.usuario(), e);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P25: un ajeno vio el equipo'; END IF;
  RAISE NOTICE 'OK P25: proc_equipo_obtener';
END $$;

-- P26. proc_equipo_miembros: integrante sí (líder primero); invitado NX005.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); r jsonb; ok boolean := false; BEGIN
  r := proc_equipo_miembros(pg_temp.integrante(e, 1), e);
  IF jsonb_array_length(r) <> 4 OR r->0->>'rol' <> 'lider' OR r->3->>'rol' <> 'invitado' THEN RAISE EXCEPTION 'FALLO P26: %', r; END IF;
  BEGIN PERFORM proc_equipo_miembros(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P26: el invitado vio los miembros'; END IF;
  RAISE NOTICE 'OK P26: proc_equipo_miembros';
END $$;

-- P27. proc_invitacion_crear: solo el líder; el código tiene el formato NX4-821Q.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); r jsonb; ok boolean := false; BEGIN
  r := proc_invitacion_crear(pg_temp.lider(e), e, '{"rol_destino":"invitado","dias_validez":7,"duracion_invitado_dias":14}');
  IF r->>'codigo' !~ '^NX[A-Z2-9]-[A-Z2-9]{4}$' OR r->>'estado' <> 'pendiente'
     OR (r->>'duracion_invitado_dias')::int <> 14 THEN
    RAISE EXCEPTION 'FALLO P27: %', r;
  END IF;
  BEGIN PERFORM proc_invitacion_crear(pg_temp.integrante(e, 1), e, '{"rol_destino":"integrante"}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P27: un integrante invitó'; END IF;
  RAISE NOTICE 'OK P27: proc_invitacion_crear';
END $$;

-- P28. proc_invitacion_listar: el líder las ve; un integrante, NX005.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); ok boolean := false; BEGIN
  PERFORM proc_invitacion_crear(pg_temp.lider(e), e, '{"rol_destino":"integrante"}');
  IF jsonb_array_length(proc_invitacion_listar(pg_temp.lider(e), e)) <> 1 THEN RAISE EXCEPTION 'FALLO P28'; END IF;
  BEGIN PERFORM proc_invitacion_listar(pg_temp.integrante(e, 1), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P28: un integrante listó invitaciones'; END IF;
  RAISE NOTICE 'OK P28: proc_invitacion_listar';
END $$;

-- P29. proc_invitacion_revocar: revoca una pendiente; revocarla otra vez, NX006.
DO $$ DECLARE e uuid := pg_temp.equipo_con(0); i uuid; ok boolean := false; BEGIN
  i := (proc_invitacion_crear(pg_temp.lider(e), e, '{"rol_destino":"integrante"}')->>'id')::uuid;
  IF proc_invitacion_revocar(pg_temp.lider(e), e, i)->>'estado' <> 'revocada' THEN RAISE EXCEPTION 'FALLO P29'; END IF;
  BEGIN PERFORM proc_invitacion_revocar(pg_temp.lider(e), e, i);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P29: revocó dos veces'; END IF;
  RAISE NOTICE 'OK P29: proc_invitacion_revocar';
END $$;

-- P30. proc_invitacion_ver: vista previa; inexistente NX006; revocada NX011.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); inv jsonb; r jsonb; ok int := 0; BEGIN
  inv := proc_invitacion_crear(pg_temp.lider(e), e, '{"rol_destino":"integrante"}');
  r := proc_invitacion_ver(pg_temp.usuario(), inv->>'codigo');
  IF r->'equipo'->>'nombre' <> 'Equipo de prueba' OR (r->>'ya_miembro')::boolean OR (r->>'miembros_activos')::int <> 2 THEN
    RAISE EXCEPTION 'FALLO P30: %', r;
  END IF;
  BEGIN PERFORM proc_invitacion_ver(pg_temp.usuario(), 'NXZ-ZZZZ');
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  PERFORM proc_invitacion_revocar(pg_temp.lider(e), e, (inv->>'id')::uuid);
  BEGIN PERFORM proc_invitacion_ver(pg_temp.usuario(), inv->>'codigo');
  EXCEPTION WHEN SQLSTATE 'NX011' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P30: % de 2', ok; END IF;
  RAISE NOTICE 'OK P30: proc_invitacion_ver';
END $$;

-- P31. proc_invitacion_aceptar: un solo uso, color siguiente; ya miembro NX012; equipo lleno NX001.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); u uuid := pg_temp.usuario('Nueva Integrante'); c text; r jsonb; ok int := 0; BEGIN
  c := proc_invitacion_crear(pg_temp.lider(e), e, '{"rol_destino":"integrante"}')->>'codigo';
  r := proc_invitacion_aceptar(u, c);
  IF r->>'rol' <> 'integrante' OR (SELECT color_idx FROM membresias WHERE id = pg_temp.membresia(e, u)) <> 2 THEN
    RAISE EXCEPTION 'FALLO P31: %', r;
  END IF;
  BEGIN PERFORM proc_invitacion_aceptar(pg_temp.usuario(), c);                    -- ya se usó
  EXCEPTION WHEN SQLSTATE 'NX011' THEN ok := ok + 1; END;
  c := proc_invitacion_crear(pg_temp.lider(e), e, '{"rol_destino":"integrante"}')->>'codigo';
  BEGIN PERFORM proc_invitacion_aceptar(u, c);                                     -- ya es miembro
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  UPDATE equipos SET max_miembros = 3 WHERE id = e;                                -- líder + 2: lleno
  BEGIN PERFORM proc_invitacion_aceptar(pg_temp.usuario(), c);
  EXCEPTION WHEN SQLSTATE 'NX001' THEN ok := ok + 1; END;
  IF ok <> 3 OR (SELECT estado FROM invitaciones WHERE codigo = c) <> 'pendiente' THEN
    RAISE EXCEPTION 'FALLO P31: % de 3', ok;
  END IF;
  RAISE NOTICE 'OK P31: proc_invitacion_aceptar';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Tareas de equipo (0006)
-- ---------------------------------------------------------------------------------------------

-- P32. proc_tarea_listar: el líder ve el tablero; el invitado solo lo compartido y sin backlog.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 1, 'Compartida'); b uuid := pg_temp.aceptada(e, 0, 'Privada');
  r jsonb; ok boolean := false; BEGIN
  PERFORM proc_tarea_compartir(pg_temp.lider(e), e, a, ARRAY[pg_temp.membresia(e, pg_temp.invitado(e))]);
  IF jsonb_array_length(proc_tarea_listar(pg_temp.lider(e), e, 'tablero')) <> 2 THEN RAISE EXCEPTION 'FALLO P32: líder'; END IF;
  r := proc_tarea_listar(pg_temp.invitado(e), e, 'todas');
  IF jsonb_array_length(r) <> 1 OR r->0->>'titulo' <> 'Compartida' OR r->0 ? 'votacion' THEN RAISE EXCEPTION 'FALLO P32: invitado %', r; END IF;
  BEGIN PERFORM proc_tarea_listar(pg_temp.invitado(e), e, 'backlog');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P32: el invitado vio el backlog'; END IF;
  RAISE NOTICE 'OK P32: proc_tarea_listar';
END $$;

-- P33. proc_tarea_conteos: cuenta tablero, backlog y votación; el invitado, NX005.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e); p uuid := pg_temp.proponer(e); r jsonb; ok boolean := false; BEGIN
  r := proc_tarea_conteos(pg_temp.integrante(e, 1), e);
  IF (r->>'tablero')::int <> 1 OR (r->>'votacion')::int <> 1 OR (r->>'backlog')::int <> 0 THEN RAISE EXCEPTION 'FALLO P33: %', r; END IF;
  BEGIN PERFORM proc_tarea_conteos(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P33: el invitado vio los conteos'; END IF;
  RAISE NOTICE 'OK P33: proc_tarea_conteos';
END $$;

-- P34. proc_tarea_obtener: detalle con subtareas e historial; al invitado sin compartir, NX006.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.proponer(e); r jsonb; ok boolean := false; BEGIN
  r := proc_tarea_obtener(pg_temp.integrante(e, 1), e, t);
  IF jsonb_array_length(r->'subtareas') <> 2 OR jsonb_array_length(r->'historial') <> 1
     OR r->'votacion'->>'abierta' <> 'true' OR r->'proponente'->>'nombre' <> 'Líder Prueba' THEN
    RAISE EXCEPTION 'FALLO P34: %', r;
  END IF;
  BEGIN PERFORM proc_tarea_obtener(pg_temp.invitado(e), e, t);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P34: el invitado vio una tarea no compartida'; END IF;
  RAISE NOTICE 'OK P34: proc_tarea_obtener';
END $$;

-- P35. proc_tarea_editar: el líder edita; el integrante solo el avance de su tarea; versión vieja NX008.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e, 1); r jsonb; ok int := 0; BEGIN
  r := proc_tarea_editar(pg_temp.lider(e), e, t, pg_temp.version(t), '{"titulo":"Editada","etiquetas":["qa"],"vence_en":null}');
  IF r->>'titulo' <> 'Editada' OR r->'etiquetas'->>0 <> 'qa' THEN RAISE EXCEPTION 'FALLO P35: %', r; END IF;
  BEGIN PERFORM proc_tarea_editar(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), '{"titulo":"No puedo"}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_editar(pg_temp.integrante(e, 2), e, t, pg_temp.version(t), '{"progreso":50}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_editar(pg_temp.lider(e), e, t, pg_temp.version(t) + 3, '{"titulo":"Vieja"}');
  EXCEPTION WHEN SQLSTATE 'NX008' THEN ok := ok + 1; END;
  r := proc_tarea_editar(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), '{"progreso":40}');
  IF ok <> 3 OR (r->>'progreso')::int <> 40 THEN RAISE EXCEPTION 'FALLO P35: % de 3', ok; END IF;
  RAISE NOTICE 'OK P35: proc_tarea_editar';
END $$;

-- P36. proc_tarea_eliminar: solo el líder.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e, 1); ok boolean := false; BEGIN
  BEGIN PERFORM proc_tarea_eliminar(pg_temp.integrante(e, 1), e, t);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  PERFORM proc_tarea_eliminar(pg_temp.lider(e), e, t);
  IF NOT ok OR EXISTS (SELECT 1 FROM tareas WHERE id = t) THEN RAISE EXCEPTION 'FALLO P36'; END IF;
  RAISE NOTICE 'OK P36: proc_tarea_eliminar';
END $$;

-- P37. proc_tarea_cambiar_estado: la máquina de estados en la BD.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e, 1); r jsonb; ok int := 0; BEGIN
  PERFORM proc_subtarea_crear(pg_temp.lider(e), e, t, 'Paso');
  BEGIN PERFORM proc_tarea_cambiar_estado(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), 'habilitada');   -- solo el líder habilita
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_cambiar_estado(pg_temp.integrante(e, 2), e, t, pg_temp.version(t), 'habilitada');   -- no es su tarea
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(e), e, t, pg_temp.version(t), 'habilitada');
  BEGIN PERFORM proc_tarea_cambiar_estado(pg_temp.lider(e), e, t, pg_temp.version(t), 'completada');          -- se salta en_curso
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  r := proc_tarea_cambiar_estado(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), 'en_curso');
  IF (r->>'progreso')::int <> 5 THEN RAISE EXCEPTION 'FALLO P37: avance %', r->>'progreso'; END IF;
  BEGIN PERFORM proc_tarea_cambiar_estado(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), 'atascada');    -- sin motivo
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_cambiar_estado(pg_temp.integrante(e, 1), e, t, pg_temp.version(t) - 1, 'completada');
  EXCEPTION WHEN SQLSTATE 'NX008' THEN ok := ok + 1; END;
  r := proc_tarea_cambiar_estado(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), 'completada');
  IF ok <> 5 OR (r->>'progreso')::int <> 100 OR r->>'resultado' <> 'a_tiempo' OR (r->>'subtareas_hechas')::int <> 1 THEN
    RAISE EXCEPTION 'FALLO P37: % de 5, %', ok, r;
  END IF;
  RAISE NOTICE 'OK P37: proc_tarea_cambiar_estado';
END $$;

-- P38. proc_tarea_mover: el líder reordena; un integrante no; vecina de otra columna, NX012.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 0, 'A'); b uuid := pg_temp.aceptada(e, 0, 'B'); c uuid := pg_temp.aceptada(e, 1, 'C');
  p uuid := pg_temp.proponer(e); v_orden text; ok int := 0; BEGIN
  PERFORM proc_tarea_mover(pg_temp.lider(e), e, c, pg_temp.version(c), a, b);          -- C entre A y B
  SELECT string_agg(titulo, '' ORDER BY orden COLLATE "C") INTO v_orden FROM tareas WHERE id IN (a, b, c);
  IF v_orden <> 'ACB' THEN RAISE EXCEPTION 'FALLO P38: orden %', v_orden; END IF;
  BEGIN PERFORM proc_tarea_mover(pg_temp.integrante(e, 1), e, c, pg_temp.version(c), NULL, a);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_mover(pg_temp.lider(e), e, c, pg_temp.version(c), p, NULL);  -- `p` está en otra columna
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P38: % de 2', ok; END IF;
  RAISE NOTICE 'OK P38: proc_tarea_mover';
END $$;

-- P39. proc_tarea_asignar: solo el líder, a un miembro, y no mientras se vota.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e); p uuid := pg_temp.proponer(e); r jsonb; ok int := 0; BEGIN
  r := proc_tarea_asignar(pg_temp.lider(e), e, t, pg_temp.version(t), pg_temp.integrante(e, 1));
  IF NOT (r->>'asignacion_pendiente')::boolean OR r->'responsable'->>'nombre' <> 'Integrante 1' THEN RAISE EXCEPTION 'FALLO P39: %', r; END IF;
  BEGIN PERFORM proc_tarea_asignar(pg_temp.integrante(e, 1), e, t, pg_temp.version(t), pg_temp.integrante(e, 2));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_asignar(pg_temp.lider(e), e, t, pg_temp.version(t), pg_temp.invitado(e));
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_asignar(pg_temp.lider(e), e, p, pg_temp.version(p), pg_temp.integrante(e, 1));
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P39: % de 3', ok; END IF;
  RAISE NOTICE 'OK P39: proc_tarea_asignar';
END $$;

-- P40. proc_tarea_responder_asignacion: responde el asignado; al rechazar queda sin responsable (V-11).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e); r jsonb; ok boolean := false; BEGIN
  PERFORM proc_tarea_asignar(pg_temp.lider(e), e, t, pg_temp.version(t), pg_temp.integrante(e, 1));
  BEGIN PERFORM proc_tarea_responder_asignacion(pg_temp.integrante(e, 2), e, t, true);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := true; END;
  r := proc_tarea_responder_asignacion(pg_temp.integrante(e, 1), e, t, false, 'Estoy saturado');
  IF NOT ok OR r->'responsable' <> 'null'::jsonb OR r->>'estado' <> 'aceptada' OR (r->>'asignacion_pendiente')::boolean THEN
    RAISE EXCEPTION 'FALLO P40: %', r;
  END IF;
  RAISE NOTICE 'OK P40: proc_tarea_responder_asignacion';
END $$;

-- P41. proc_tarea_compartir: el líder comparte con invitados; con un integrante, NX010.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e); r jsonb; ok int := 0; BEGIN
  r := proc_tarea_compartir(pg_temp.lider(e), e, t, ARRAY[pg_temp.membresia(e, pg_temp.invitado(e))]);
  IF jsonb_array_length(r->'compartida_con') <> 1 THEN RAISE EXCEPTION 'FALLO P41: %', r; END IF;
  BEGIN PERFORM proc_tarea_compartir(pg_temp.lider(e), e, t, ARRAY[pg_temp.membresia(e, pg_temp.integrante(e, 1))]);
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_tarea_compartir(pg_temp.integrante(e, 1), e, t, ARRAY[]::uuid[]);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P41: % de 2', ok; END IF;
  RAISE NOTICE 'OK P41: proc_tarea_compartir';
END $$;

-- P42. Subtareas de equipo: las gestiona el líder o el responsable.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e, 1); s uuid; ok int := 0; BEGIN
  s := (proc_subtarea_crear(pg_temp.integrante(e, 1), e, t, 'Del responsable')->>'id')::uuid;
  IF NOT (proc_subtarea_actualizar(pg_temp.lider(e), e, t, s, '{"hecha":true}')->>'hecha')::boolean THEN RAISE EXCEPTION 'FALLO P42'; END IF;
  BEGIN PERFORM proc_subtarea_crear(pg_temp.integrante(e, 2), e, t, 'Ajena');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_subtarea_actualizar(pg_temp.integrante(e, 2), e, t, s, '{"hecha":false}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_subtarea_eliminar(pg_temp.integrante(e, 2), e, t, s);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_subtarea_eliminar(pg_temp.integrante(e, 1), e, t, s);
  BEGIN PERFORM proc_subtarea_eliminar(pg_temp.integrante(e, 1), e, t, s);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P42: % de 4', ok; END IF;
  RAISE NOTICE 'OK P42: proc_subtarea_crear, proc_subtarea_actualizar y proc_subtarea_eliminar';
END $$;

-- P43. Comentarios de equipo: comenta quien alcanza la tarea; cada quien borra los suyos.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid := pg_temp.aceptada(e); c uuid; ok int := 0; BEGIN
  c := (proc_comentario_crear(pg_temp.integrante(e, 1), e, t, 'Un comentario')->>'id')::uuid;
  BEGIN PERFORM proc_comentario_crear(pg_temp.invitado(e), e, t, 'Sin compartir');
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_comentario_eliminar(pg_temp.integrante(e, 2), e, t, c);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  PERFORM proc_comentario_eliminar(pg_temp.lider(e), e, t, c);
  IF ok <> 2 OR EXISTS (SELECT 1 FROM comentarios_tarea WHERE id = c) THEN RAISE EXCEPTION 'FALLO P43: % de 2', ok; END IF;
  RAISE NOTICE 'OK P43: proc_comentario_crear y proc_comentario_eliminar';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Espacio personal (0007): todo es privado; una tarea ajena responde NX006.
-- ---------------------------------------------------------------------------------------------

-- P44. proc_personal_tarea_crear y proc_personal_tarea_obtener.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); r jsonb; ok boolean := false; BEGIN
  r := proc_personal_tarea_crear(u, '{"titulo":"Mi tarea","etiquetas":["Casa","casa"]}');
  IF r->>'estado' <> 'habilitada' OR jsonb_array_length(r->'etiquetas') <> 1 OR (r->>'codigo')::int <> 1 THEN
    RAISE EXCEPTION 'FALLO P44: %', r;
  END IF;
  IF proc_personal_tarea_obtener(u, (r->>'id')::uuid)->>'titulo' <> 'Mi tarea' THEN RAISE EXCEPTION 'FALLO P44: obtener'; END IF;
  BEGIN PERFORM proc_personal_tarea_obtener(otro, (r->>'id')::uuid);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P44: otra persona vio la tarea'; END IF;
  RAISE NOTICE 'OK P44: proc_personal_tarea_crear y proc_personal_tarea_obtener';
END $$;

-- P45. proc_personal_tarea_listar: solo las propias, con filtros; los comodines se buscan tal cual.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); BEGIN
  PERFORM proc_personal_tarea_crear(u, '{"titulo":"Comprar 100% algodón","prioridad":"alta"}');
  PERFORM proc_personal_tarea_crear(u, '{"titulo":"Leer el capítulo 3"}');
  PERFORM proc_personal_tarea_crear(otro, '{"titulo":"Ajena"}');
  IF jsonb_array_length(proc_personal_tarea_listar(u, '{}')) <> 2
     OR jsonb_array_length(proc_personal_tarea_listar(u, '{"prioridad":["alta"]}')) <> 1
     OR jsonb_array_length(proc_personal_tarea_listar(u, '{"q":"100%"}')) <> 1
     OR jsonb_array_length(proc_personal_tarea_listar(u, '{"q":"%"}')) <> 1
     OR jsonb_array_length(proc_personal_tarea_listar(u, '{"estado":["completada"]}')) <> 0
     OR jsonb_array_length(proc_personal_tarea_listar(u, '{"archivadas":true}')) <> 0 THEN
    RAISE EXCEPTION 'FALLO P45';
  END IF;
  RAISE NOTICE 'OK P45: proc_personal_tarea_listar';
END $$;

-- P46. proc_personal_tarea_actualizar: completar, reabrir, versión y privacidad.
DO $$ DECLARE u uuid := pg_temp.usuario(); t uuid; r jsonb; ok int := 0; BEGIN
  t := (proc_personal_tarea_crear(u, '{"titulo":"Para completar"}')->>'id')::uuid;
  BEGIN PERFORM proc_personal_tarea_actualizar(u, t, '{"version":99,"titulo":"Vieja"}');
  EXCEPTION WHEN SQLSTATE 'NX008' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_personal_tarea_actualizar(pg_temp.usuario(), t, jsonb_build_object('version', pg_temp.version(t), 'titulo', 'Ajena'));
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_personal_tarea_actualizar(u, t, jsonb_build_object('version', pg_temp.version(t), 'estado', 'atascada'));
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  r := proc_personal_tarea_actualizar(u, t, jsonb_build_object('version', pg_temp.version(t), 'estado', 'completada'));
  IF (r->>'progreso')::int <> 100 OR r->>'resultado' <> 'a_tiempo' OR r->>'completada_en' IS NULL THEN RAISE EXCEPTION 'FALLO P46: %', r; END IF;
  r := proc_personal_tarea_actualizar(u, t, jsonb_build_object('version', pg_temp.version(t), 'estado', 'en_curso'));
  IF ok <> 3 OR r->>'resultado' IS NOT NULL OR r->>'completada_en' IS NOT NULL THEN RAISE EXCEPTION 'FALLO P46: % de 3, %', ok, r; END IF;
  RAISE NOTICE 'OK P46: proc_personal_tarea_actualizar';
END $$;

-- P47. proc_personal_tarea_eliminar.
DO $$ DECLARE u uuid := pg_temp.usuario(); t uuid; ok boolean := false; BEGIN
  t := (proc_personal_tarea_crear(u, '{"titulo":"Para borrar"}')->>'id')::uuid;
  BEGIN PERFORM proc_personal_tarea_eliminar(pg_temp.usuario(), t);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  PERFORM proc_personal_tarea_eliminar(u, t);
  IF NOT ok OR EXISTS (SELECT 1 FROM tareas WHERE id = t) THEN RAISE EXCEPTION 'FALLO P47'; END IF;
  RAISE NOTICE 'OK P47: proc_personal_tarea_eliminar';
END $$;

-- P48. Subtareas personales.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); t uuid; s uuid; ok int := 0; BEGIN
  t := (proc_personal_tarea_crear(u, '{"titulo":"Con pasos"}')->>'id')::uuid;
  s := (proc_personal_subtarea_crear(u, t, 'Paso 1')->>'id')::uuid;
  IF NOT (proc_personal_subtarea_actualizar(u, t, s, '{"hecha":true}')->>'hecha')::boolean THEN RAISE EXCEPTION 'FALLO P48'; END IF;
  BEGIN PERFORM proc_personal_subtarea_crear(otro, t, 'Ajena');
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_personal_subtarea_actualizar(otro, t, s, '{"hecha":false}');
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_personal_subtarea_eliminar(otro, t, s);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  PERFORM proc_personal_subtarea_eliminar(u, t, s);
  IF ok <> 3 OR EXISTS (SELECT 1 FROM subtareas WHERE id = s) THEN RAISE EXCEPTION 'FALLO P48: % de 3', ok; END IF;
  RAISE NOTICE 'OK P48: proc_personal_subtarea_crear, _actualizar y _eliminar';
END $$;

-- P49. Comentarios personales.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); t uuid; c uuid; ok int := 0; BEGIN
  t := (proc_personal_tarea_crear(u, '{"titulo":"Con notas"}')->>'id')::uuid;
  c := (proc_personal_comentario_crear(u, t, 'Una nota')->>'id')::uuid;
  BEGIN PERFORM proc_personal_comentario_crear(otro, t, 'Ajena');
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_personal_comentario_eliminar(otro, t, c);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  PERFORM proc_personal_comentario_eliminar(u, t, c);
  IF ok <> 2 OR EXISTS (SELECT 1 FROM comentarios_tarea WHERE id = c) THEN RAISE EXCEPTION 'FALLO P49: % de 2', ok; END IF;
  RAISE NOTICE 'OK P49: proc_personal_comentario_crear y proc_personal_comentario_eliminar';
END $$;

-- P50. proc_personal_etiquetas: solo las propias.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); BEGIN
  PERFORM proc_personal_tarea_crear(u, '{"titulo":"Etiquetada","etiquetas":["zeta","alfa"]}');
  PERFORM proc_personal_tarea_crear(otro, '{"titulo":"Ajena","etiquetas":["secreta"]}');
  IF proc_personal_etiquetas(u) <> '["alfa","zeta"]'::jsonb THEN RAISE EXCEPTION 'FALLO P50: %', proc_personal_etiquetas(u); END IF;
  RAISE NOTICE 'OK P50: proc_personal_etiquetas';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Reglas transversales: forma de los procesos y roles de la BD (0008)
-- ---------------------------------------------------------------------------------------------

-- P51. Todo `proc_*` es SECURITY DEFINER con `search_path` fijo (docs/08, convenciones).
DO $$ DECLARE malos text; BEGIN
  SELECT string_agg(p.proname, ', ') INTO malos
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'proc\_%'
     AND (NOT p.prosecdef OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF malos IS NOT NULL THEN RAISE EXCEPTION 'FALLO P51: sin SECURITY DEFINER o sin search_path: %', malos; END IF;
  RAISE NOTICE 'OK P51: todos los procesos son SECURITY DEFINER con search_path fijo';
END $$;

-- P52. Rol `nexo_app`: ejecuta procesos y nada más (ni tablas, ni vistas, ni auxiliares, ni dev).
DO $$ DECLARE malos text; ok int := 0; BEGIN
  SELECT string_agg(p.proname, ', ') INTO malos
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND ((p.proname LIKE 'proc\_%' AND p.proname NOT LIKE 'proc\_dev\_%') <> has_function_privilege('nexo_app', p.oid, 'EXECUTE'))
     AND (p.proname LIKE 'proc\_%' OR p.proname LIKE 'fn\_%');
  IF malos IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO P52: permisos de ejecución mal puestos (¿falta SELECT fn_conceder_procesos() en la migración?): %', malos;
  END IF;
  SELECT string_agg(c.relname, ', ') INTO malos
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'p')
     AND has_table_privilege('nexo_app', c.oid, 'SELECT, INSERT, UPDATE, DELETE');
  IF malos IS NOT NULL THEN RAISE EXCEPTION 'FALLO P52: nexo_app alcanza tablas: %', malos; END IF;

  -- Y en la práctica, con el rol puesto:
  SET LOCAL ROLE nexo_app;
  BEGIN PERFORM 1 FROM tareas LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1; END;
  BEGIN PERFORM 1 FROM v_tareas_semaforo LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1; END;
  BEGIN UPDATE usuarios SET nombre = 'Intruso';
  EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1; END;
  BEGIN PERFORM fn_integrantes_activos(gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1; END;
  BEGIN PERFORM proc_dev_usuarios();
  EXCEPTION WHEN insufficient_privilege THEN ok := ok + 1; END;
  IF NOT (proc_contacto_enviar('Ana', 'ana@prueba.mx', 'Duda', 'Mensaje enviado con el rol nexo_app')->>'recibido')::boolean THEN
    RAISE EXCEPTION 'FALLO P52: nexo_app no pudo ejecutar un proceso';
  END IF;
  RESET ROLE;
  IF ok <> 5 THEN RAISE EXCEPTION 'FALLO P52: % de 5 accesos directos rechazados', ok; END IF;
  RAISE NOTICE 'OK P52: nexo_app solo ejecuta procesos; no lee ni escribe tablas';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Sprints y retrospectiva (0009, Fase 3.3)
-- ---------------------------------------------------------------------------------------------

-- Sprint planificado nuevo (fechas por defecto si `p_datos` no las trae).
CREATE FUNCTION pg_temp.planear(p_equipo uuid, p_datos jsonb DEFAULT '{}') RETURNS uuid AS $$
  SELECT (proc_sprint_planear(pg_temp.lider(p_equipo), p_equipo, NULL, p_datos)->>'id')::uuid;
$$ LANGUAGE sql;

-- La líder lleva la tarea de `aceptada` a `completada`.
CREATE FUNCTION pg_temp.completar(p_equipo uuid, p_tarea uuid) RETURNS void AS $$
BEGIN
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(p_equipo), p_equipo, p_tarea, NULL, 'habilitada');
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(p_equipo), p_equipo, p_tarea, NULL, 'en_curso');
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(p_equipo), p_equipo, p_tarea, NULL, 'completada');
END $$ LANGUAGE plpgsql;

-- Sprint vacío que se planeó, se inició y se cerró: ya tiene retrospectiva.
CREATE FUNCTION pg_temp.sprint_con_retro(p_equipo uuid) RETURNS uuid AS $$
DECLARE s uuid := pg_temp.planear(p_equipo);
BEGIN
  PERFORM proc_sprint_iniciar(pg_temp.lider(p_equipo), p_equipo, s);
  PERFORM proc_sprint_cerrar(pg_temp.lider(p_equipo), p_equipo, s, 'liberar');
  RETURN s;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.nota(
  p_equipo uuid, p_sprint uuid, p_autor uuid, p_texto text DEFAULT 'Nota',
  p_anonima boolean DEFAULT false, p_columna text DEFAULT 'bien'
) RETURNS uuid AS $$
  SELECT (proc_retro_nota_agregar(p_autor, p_equipo, p_sprint, p_columna, p_texto, p_anonima)->>'id')::uuid;
$$ LANGUAGE sql;

-- P53. proc_sprint_planear crea el plan: fechas por defecto, capacidad y tareas (la del backlog
--      pasa a aceptada). No planean el integrante ni el invitado; no se cruzan las fechas.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 0, 'A'); b uuid := pg_temp.aceptada(e, 0, 'B');
  d jsonb; s uuid; ok int := 0; BEGIN
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(e), e, b, NULL, 'backlog');
  d := proc_sprint_planear(pg_temp.lider(e), e, NULL, jsonb_build_object(
         'objetivo', 'Primer sprint', 'tarea_ids', jsonb_build_array(a, b),
         'capacidad', jsonb_build_array(jsonb_build_object('usuario_id', pg_temp.integrante(e, 1), 'horas', 20))));
  s := (d->>'id')::uuid;
  IF d->>'estado' <> 'planificado' OR (d->>'numero')::int <> 1 OR (d->>'total')::int <> 2
     OR (d->>'fin')::date - (d->>'inicio')::date <> 13 THEN RAISE EXCEPTION 'FALLO P53: %', d; END IF;
  IF pg_temp.estado(b) <> 'aceptada' OR (SELECT sprint_id FROM tareas WHERE id = b) <> s THEN
    RAISE EXCEPTION 'FALLO P53: la tarea del backlog no entró al sprint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d->'capacidad') c
                  WHERE (c->>'usuario_id')::uuid = pg_temp.integrante(e, 1) AND (c->>'horas')::int = 20) THEN
    RAISE EXCEPTION 'FALLO P53: capacidad %', d->'capacidad';
  END IF;
  BEGIN PERFORM proc_sprint_planear(pg_temp.integrante(e, 1), e, NULL, '{}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_sprint_planear(pg_temp.invitado(e), e, NULL, '{}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_sprint_planear(pg_temp.lider(e), e, NULL, jsonb_build_object('inicio', d->>'inicio'));
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_sprint_planear(pg_temp.lider(e), e, NULL, jsonb_build_object(
          'capacidad', jsonb_build_array(jsonb_build_object('usuario_id', pg_temp.invitado(e), 'horas', 5))));
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P53: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P53: proc_sprint_planear crea el plan (fechas, capacidad y tareas)';
END $$;

-- P54. proc_sprint_planear cambia el plan de un sprint planificado; no toma tareas de otro sprint
--      (NX012) ni cambia un sprint que ya empezó (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 0, 'A'); b uuid := pg_temp.aceptada(e, 0, 'B');
  s uuid; d jsonb; ok int := 0; BEGIN
  s := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a, b)));
  d := proc_sprint_planear(pg_temp.lider(e), e, s, jsonb_build_object('objetivo', 'Nuevo objetivo', 'tarea_ids', jsonb_build_array(a)));
  IF d->>'objetivo' <> 'Nuevo objetivo' OR (d->>'total')::int <> 1 OR (SELECT sprint_id FROM tareas WHERE id = b) IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO P54: %', d;
  END IF;
  PERFORM pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(b)));
  BEGIN PERFORM proc_sprint_planear(pg_temp.lider(e), e, s, jsonb_build_object('tarea_ids', jsonb_build_array(a, b)));
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s);
  BEGIN PERFORM proc_sprint_planear(pg_temp.lider(e), e, s, '{"objetivo": "Tarde"}');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P54: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P54: proc_sprint_planear cambia el plan solo mientras está planificado';
END $$;

-- P55. proc_sprint_iniciar: la líder inicia (con la instantánea del día); no hay dos activos, ni
--      con el proceso (NX012) ni a mano (ux_un_sprint_activo); el integrante no inicia.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e); s1 uuid; s2 uuid; d jsonb; ok int := 0; BEGIN
  s1 := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a)));
  s2 := pg_temp.planear(e);
  BEGIN PERFORM proc_sprint_iniciar(pg_temp.integrante(e, 1), e, s1);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  d := proc_sprint_iniciar(pg_temp.lider(e), e, s1);
  IF d->>'estado' <> 'activo' OR NOT EXISTS (SELECT 1 FROM sprint_instantaneas WHERE sprint_id = s1 AND total = 1) THEN
    RAISE EXCEPTION 'FALLO P55: %', d;
  END IF;
  BEGIN PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s2);
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s1);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  BEGIN UPDATE sprints SET estado = 'activo' WHERE id = s2;
  EXCEPTION WHEN unique_violation THEN ok := ok + 1; END;
  -- Iniciado antes de su fecha se recorre a hoy con la misma duración; con el plazo vencido, no.
  e := pg_temp.equipo_con(1);
  s1 := pg_temp.planear(e, jsonb_build_object('inicio', fn_hoy_equipo(e) + 5, 'fin', fn_hoy_equipo(e) + 18));
  d := proc_sprint_iniciar(pg_temp.lider(e), e, s1);
  IF (d->>'inicio')::date <> fn_hoy_equipo(e) OR (d->>'fin')::date <> fn_hoy_equipo(e) + 13 THEN
    RAISE EXCEPTION 'FALLO P55: no se recorrió a hoy: %', d;
  END IF;
  e := pg_temp.equipo_con(1);
  s1 := pg_temp.planear(e, jsonb_build_object('inicio', fn_hoy_equipo(e) - 10, 'fin', fn_hoy_equipo(e) - 1));
  BEGIN PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s1);
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  IF ok <> 5 THEN RAISE EXCEPTION 'FALLO P55: % de 5 rechazos', ok; END IF;
  RAISE NOTICE 'OK P55: proc_sprint_iniciar (un solo sprint activo; se recorre a hoy si empieza antes)';
END $$;

-- P56. proc_sprint_obtener: sin id, el sprint activo (o null); con tareas, capacidad y burndown.
--      El invitado no lo ve (NX005) y otro equipo no lo encuentra (NX006).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); otro uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e);
  s uuid; d jsonb; ok int := 0; BEGIN
  IF proc_sprint_obtener(pg_temp.lider(e), e) IS NOT NULL THEN RAISE EXCEPTION 'FALLO P56: sin sprint activo debía ser null'; END IF;
  s := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a)));
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s);
  d := proc_sprint_obtener(pg_temp.integrante(e, 1), e);
  IF (d->>'id')::uuid <> s OR jsonb_array_length(d->'tareas') <> 1 OR jsonb_array_length(d->'serie') <> 1
     OR jsonb_array_length(d->'capacidad') <> 3 THEN RAISE EXCEPTION 'FALLO P56: %', d; END IF;
  BEGIN PERFORM proc_sprint_obtener(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_sprint_obtener(pg_temp.lider(otro), otro, s);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P56: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P56: proc_sprint_obtener';
END $$;

-- P57. proc_sprint_listar: todos los sprints, el más reciente primero; el invitado no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); l jsonb; ok boolean := false; BEGIN
  PERFORM pg_temp.planear(e);
  PERFORM pg_temp.planear(e);
  l := proc_sprint_listar(pg_temp.integrante(e, 1), e);
  IF jsonb_array_length(l) <> 2 OR (l->0->>'numero')::int <> 2 THEN RAISE EXCEPTION 'FALLO P57: %', l; END IF;
  BEGIN PERFORM proc_sprint_listar(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P57: el invitado vio los sprints'; END IF;
  RAISE NOTICE 'OK P57: proc_sprint_listar';
END $$;

-- P58. proc_sprint_disponibles: solo las tareas aceptadas sin sprint (ni propuestas ni planeadas).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 0, 'A'); b uuid := pg_temp.aceptada(e, 0, 'B');
  l jsonb; ok boolean := false; BEGIN
  PERFORM pg_temp.proponer(e, 'Sigue en votación');
  PERFORM pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a)));
  l := proc_sprint_disponibles(pg_temp.lider(e), e);
  IF jsonb_array_length(l) <> 1 OR (l->0->>'id')::uuid <> b THEN RAISE EXCEPTION 'FALLO P58: %', l; END IF;
  BEGIN PERFORM proc_sprint_disponibles(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P58: el invitado vio las tareas disponibles'; END IF;
  RAISE NOTICE 'OK P58: proc_sprint_disponibles';
END $$;

-- P59. proc_sprint_cerrar con `liberar`: instantánea final, retrospectiva creada, las completadas
--      se quedan y las pendientes quedan sin sprint. No cierra el integrante (NX005), ni un sprint
--      que no está activo (NX007), ni manda pendientes a un sprint siguiente que no existe (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 0, 'Hecha'); b uuid := pg_temp.aceptada(e, 0, 'Pendiente');
  s uuid; d jsonb; ok int := 0; BEGIN
  s := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a, b)));
  BEGIN PERFORM proc_sprint_cerrar(pg_temp.lider(e), e, s, 'liberar');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s);
  PERFORM pg_temp.completar(e, a);
  BEGIN PERFORM proc_sprint_cerrar(pg_temp.integrante(e, 1), e, s, 'liberar');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_sprint_cerrar(pg_temp.lider(e), e, s, 'siguiente');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  d := proc_sprint_cerrar(pg_temp.lider(e), e, s, 'liberar');
  IF d->>'estado' <> 'cerrado' OR (d->>'total')::int <> 2 OR (d->>'completadas')::int <> 1 OR d->'retro'->>'id' IS NULL THEN
    RAISE EXCEPTION 'FALLO P59: %', d;
  END IF;
  IF (SELECT sprint_id FROM tareas WHERE id = b) IS NOT NULL OR (SELECT sprint_id FROM tareas WHERE id = a) <> s THEN
    RAISE EXCEPTION 'FALLO P59: las tareas no quedaron donde debían';
  END IF;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P59: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P59: proc_sprint_cerrar (instantánea, retrospectiva y pendientes liberadas)';
END $$;

-- P60. proc_sprint_cerrar con `siguiente`: las pendientes pasan al sprint planificado; la
--      instantánea final las contó.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); b uuid := pg_temp.aceptada(e); s1 uuid; s2 uuid; BEGIN
  s1 := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(b)));
  s2 := pg_temp.planear(e);
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s1);
  PERFORM proc_sprint_cerrar(pg_temp.lider(e), e, s1, 'siguiente');
  IF (SELECT sprint_id FROM tareas WHERE id = b) <> s2 THEN RAISE EXCEPTION 'FALLO P60: la pendiente no pasó al siguiente sprint'; END IF;
  IF (SELECT total FROM sprint_instantaneas WHERE sprint_id = s1 ORDER BY dia DESC LIMIT 1) <> 1 THEN
    RAISE EXCEPTION 'FALLO P60: la instantánea final no contó la pendiente';
  END IF;
  RAISE NOTICE 'OK P60: proc_sprint_cerrar pasa las pendientes al siguiente sprint';
END $$;

-- P61. proc_tarea_listar y proc_tarea_conteos (0009): el tablero ya no muestra las tareas de un
--      sprint cerrado; la vista `todas` sí.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e, 0, 'Hecha'); s uuid; BEGIN
  s := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a)));
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s);
  PERFORM pg_temp.completar(e, a);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(proc_tarea_listar(pg_temp.lider(e), e, 'tablero')) x WHERE (x->>'id')::uuid = a) THEN
    RAISE EXCEPTION 'FALLO P61: antes de cerrar debía verse en el tablero';
  END IF;
  PERFORM proc_sprint_cerrar(pg_temp.lider(e), e, s, 'liberar');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(proc_tarea_listar(pg_temp.lider(e), e, 'tablero')) x WHERE (x->>'id')::uuid = a)
     OR (proc_tarea_conteos(pg_temp.lider(e), e)->>'tablero')::int <> 0 THEN
    RAISE EXCEPTION 'FALLO P61: la tarea del sprint cerrado sigue en el tablero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(proc_tarea_listar(pg_temp.lider(e), e, 'todas')) x WHERE (x->>'id')::uuid = a) THEN
    RAISE EXCEPTION 'FALLO P61: la vista «todas» perdió la tarea';
  END IF;
  RAISE NOTICE 'OK P61: proc_tarea_listar y proc_tarea_conteos ocultan las tareas de sprints cerrados';
END $$;

-- P62. proc_sprint_eliminar: la líder borra un sprint planificado (sus tareas quedan libres); no
--      el integrante (NX005) ni un sprint activo (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid := pg_temp.aceptada(e); s uuid; ok int := 0; BEGIN
  s := pg_temp.planear(e, jsonb_build_object('tarea_ids', jsonb_build_array(a)));
  BEGIN PERFORM proc_sprint_eliminar(pg_temp.integrante(e, 1), e, s);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_sprint_eliminar(pg_temp.lider(e), e, s);
  IF EXISTS (SELECT 1 FROM sprints WHERE id = s) OR (SELECT sprint_id FROM tareas WHERE id = a) IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO P62: el sprint o su tarea siguen ahí';
  END IF;
  s := pg_temp.planear(e);
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s);
  BEGIN PERFORM proc_sprint_eliminar(pg_temp.lider(e), e, s);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P62: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P62: proc_sprint_eliminar';
END $$;

-- P63. proc_retro_iniciar: la líder abre la retrospectiva de un sprint cerrado (una sola); no el
--      integrante (NX005) ni con el sprint sin cerrar (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); viejo uuid; s uuid; d jsonb; ok int := 0; BEGIN
  INSERT INTO sprints (equipo_id, numero, inicio, fin, estado, cerrado_en)
  VALUES (e, 1, current_date - 20, current_date - 7, 'cerrado', now()) RETURNING id INTO viejo;
  BEGIN PERFORM proc_retro_iniciar(pg_temp.integrante(e, 1), e, viejo);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  d := proc_retro_iniciar(pg_temp.lider(e), e, viejo);
  IF d->>'id' IS NULL OR (d->>'cerrada')::boolean OR jsonb_array_length(d->'notas') <> 0 THEN RAISE EXCEPTION 'FALLO P63: %', d; END IF;
  IF proc_retro_iniciar(pg_temp.lider(e), e, viejo)->>'id' <> d->>'id' THEN RAISE EXCEPTION 'FALLO P63: creó otra retrospectiva'; END IF;
  s := pg_temp.planear(e);
  BEGIN PERFORM proc_retro_iniciar(pg_temp.lider(e), e, s);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P63: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P63: proc_retro_iniciar';
END $$;

-- P64. proc_retro_obtener: null mientras no hay retrospectiva; el invitado no la ve (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); s uuid := pg_temp.planear(e); d jsonb; ok boolean := false; BEGIN
  IF proc_retro_obtener(pg_temp.lider(e), e, s) IS NOT NULL THEN RAISE EXCEPTION 'FALLO P64: debía ser null'; END IF;
  PERFORM proc_sprint_iniciar(pg_temp.lider(e), e, s);
  PERFORM proc_sprint_cerrar(pg_temp.lider(e), e, s, 'liberar');
  d := proc_retro_obtener(pg_temp.integrante(e, 1), e, s);
  IF d IS NULL OR (d->>'votos_por_persona')::int <> 3 OR (d->>'sprint_numero')::int <> 1 THEN RAISE EXCEPTION 'FALLO P64: %', d; END IF;
  BEGIN PERFORM proc_retro_obtener(pg_temp.invitado(e), e, s);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P64: el invitado vio la retrospectiva'; END IF;
  RAISE NOTICE 'OK P64: proc_retro_obtener';
END $$;

-- P65. proc_retro_nota_agregar: la nota anónima no guarda a su autora (ni en la actividad); el
--      invitado no escribe (NX005), la nota vacía no entra (NX010) ni tras cerrar la votación (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); s uuid := pg_temp.sprint_con_retro(e); n uuid; an uuid; ok int := 0; BEGIN
  n := pg_temp.nota(e, s, pg_temp.integrante(e, 1), 'Buen ritmo');
  an := pg_temp.nota(e, s, pg_temp.integrante(e, 2), 'Nota sin firma', true, 'mejorar');
  IF (SELECT autor_id FROM retro_notas WHERE id = n) <> pg_temp.integrante(e, 1)
     OR (SELECT autor_id FROM retro_notas WHERE id = an) IS NOT NULL THEN RAISE EXCEPTION 'FALLO P65: autoría'; END IF;
  IF EXISTS (SELECT 1 FROM actividad WHERE equipo_id = e AND autor_id = pg_temp.integrante(e, 2))
     OR EXISTS (SELECT 1 FROM eventos_dominio WHERE equipo_id = e AND actor_id = pg_temp.integrante(e, 2)) THEN
    RAISE EXCEPTION 'FALLO P65: la nota anónima dejó rastro de su autora';
  END IF;
  BEGIN PERFORM pg_temp.nota(e, s, pg_temp.invitado(e));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.nota(e, s, pg_temp.lider(e), '   ');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  PERFORM proc_retro_avanzar(pg_temp.lider(e), e, s, 'votacion');
  BEGIN PERFORM pg_temp.nota(e, s, pg_temp.lider(e), 'Tarde');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P65: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P65: proc_retro_nota_agregar (con notas anónimas)';
END $$;

-- P66. proc_retro_votar: 3 puntos por persona; el cuarto lo impide la BD con NX003, por el proceso
--      y también insertando a mano (trg_retro_limite_votos). Votar dos veces la misma nota (NX012),
--      el invitado (NX005) y votar con la votación cerrada (NX007) tampoco. Quitar un voto lo libera.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); s uuid := pg_temp.sprint_con_retro(e); yo uuid := pg_temp.integrante(e, 1);
  n uuid[]; r jsonb; ok int := 0; i int; BEGIN
  FOR i IN 1..4 LOOP n := n || pg_temp.nota(e, s, pg_temp.lider(e), 'Nota ' || i); END LOOP;
  FOR i IN 1..3 LOOP r := proc_retro_votar(yo, e, n[i], true); END LOOP;
  IF (r->>'mis_votos_usados')::int <> 3 OR NOT (r->>'voto_mio')::boolean OR (r->>'votos')::int <> 1 THEN
    RAISE EXCEPTION 'FALLO P66: %', r;
  END IF;
  BEGIN PERFORM proc_retro_votar(yo, e, n[4], true);
  EXCEPTION WHEN SQLSTATE 'NX003' THEN ok := ok + 1; END;
  BEGIN INSERT INTO retro_votos (nota_id, usuario_id) VALUES (n[4], yo);
  EXCEPTION WHEN SQLSTATE 'NX003' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_retro_votar(yo, e, n[1], true);
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_retro_votar(pg_temp.invitado(e), e, n[1], true);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  r := proc_retro_votar(yo, e, n[1], false);
  IF (r->>'mis_votos_usados')::int <> 2 OR (r->>'votos')::int <> 0 THEN RAISE EXCEPTION 'FALLO P66: al quitar %', r; END IF;
  PERFORM proc_retro_votar(yo, e, n[4], true);
  PERFORM proc_retro_avanzar(pg_temp.lider(e), e, s, 'votacion');
  BEGIN PERFORM proc_retro_votar(yo, e, n[1], true);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 5 THEN RAISE EXCEPTION 'FALLO P66: % de 5 rechazos', ok; END IF;
  RAISE NOTICE 'OK P66: proc_retro_votar (3 votos por persona; el cuarto da NX003)';
END $$;

-- P67. proc_retro_nota_eliminar: cada quien borra sus notas y la líder cualquiera; nadie más borra
--      una nota ajena ni una anónima (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); s uuid := pg_temp.sprint_con_retro(e); mia uuid; ajena uuid; anon uuid; ok int := 0; BEGIN
  mia := pg_temp.nota(e, s, pg_temp.integrante(e, 1), 'Mía');
  ajena := pg_temp.nota(e, s, pg_temp.integrante(e, 2), 'De otra persona');
  anon := pg_temp.nota(e, s, pg_temp.integrante(e, 1), 'Sin firma', true);
  BEGIN PERFORM proc_retro_nota_eliminar(pg_temp.integrante(e, 1), e, ajena);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_retro_nota_eliminar(pg_temp.integrante(e, 1), e, anon);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_retro_nota_eliminar(pg_temp.integrante(e, 1), e, mia);
  PERFORM proc_retro_nota_eliminar(pg_temp.lider(e), e, ajena);
  IF EXISTS (SELECT 1 FROM retro_notas WHERE id IN (mia, ajena)) OR NOT EXISTS (SELECT 1 FROM retro_notas WHERE id = anon) THEN
    RAISE EXCEPTION 'FALLO P67: no se borró lo que debía';
  END IF;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P67: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P67: proc_retro_nota_eliminar';
END $$;

-- P68. proc_retro_avanzar: la líder cierra la votación y después la retrospectiva; el integrante no
--      (NX005), una fase inválida (NX010) ni cerrar dos veces (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); s uuid := pg_temp.sprint_con_retro(e); d jsonb; ok int := 0; BEGIN
  BEGIN PERFORM proc_retro_avanzar(pg_temp.integrante(e, 1), e, s, 'votacion');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_retro_avanzar(pg_temp.lider(e), e, s, 'otra');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  d := proc_retro_avanzar(pg_temp.lider(e), e, s, 'votacion');
  IF NOT (d->>'votacion_cerrada')::boolean OR (d->>'cerrada')::boolean THEN RAISE EXCEPTION 'FALLO P68: %', d; END IF;
  BEGIN PERFORM proc_retro_avanzar(pg_temp.lider(e), e, s, 'votacion');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  d := proc_retro_avanzar(pg_temp.lider(e), e, s, 'cerrada');
  IF NOT (d->>'cerrada')::boolean THEN RAISE EXCEPTION 'FALLO P68: no cerró %', d; END IF;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P68: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P68: proc_retro_avanzar';
END $$;

-- P69. proc_retro_nota_a_tarea: la líder convierte una acción en propuesta (va a votación); no el
--      integrante (NX005) ni dos veces la misma nota (NX012).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); s uuid := pg_temp.sprint_con_retro(e); n uuid; r jsonb; ok int := 0; BEGIN
  n := pg_temp.nota(e, s, pg_temp.integrante(e, 1), 'Escribir pruebas antes de cerrar', false, 'acciones');
  BEGIN PERFORM proc_retro_nota_a_tarea(pg_temp.integrante(e, 1), e, n);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  r := proc_retro_nota_a_tarea(pg_temp.lider(e), e, n);
  IF r->>'estado' <> 'propuesta' OR (SELECT tarea_id FROM retro_notas WHERE id = n) <> (r->>'id')::uuid
     OR (SELECT titulo FROM tareas WHERE id = (r->>'id')::uuid) <> 'Escribir pruebas antes de cerrar' THEN
    RAISE EXCEPTION 'FALLO P69: %', r;
  END IF;
  BEGIN PERFORM proc_retro_nota_a_tarea(pg_temp.lider(e), e, n);
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P69: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P69: proc_retro_nota_a_tarea';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Liderazgo y administración del equipo (0010, Fase 3.5)
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION pg_temp.rol(p_equipo uuid, p_usuario uuid) RETURNS text AS $$
  SELECT rol::text FROM membresias WHERE equipo_id = p_equipo AND usuario_id = p_usuario AND estado = 'activa';
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.eleccion(p_equipo uuid) RETURNS uuid AS $$
  SELECT id FROM elecciones WHERE equipo_id = p_equipo ORDER BY creada_en DESC LIMIT 1;
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.votar_lider(p_equipo uuid, i int, j int) RETURNS jsonb AS $$
  SELECT proc_eleccion_votar(pg_temp.integrante(p_equipo, i), p_equipo, pg_temp.eleccion(p_equipo), pg_temp.integrante(p_equipo, j));
$$ LANGUAGE sql;

-- P70. proc_liderazgo_transferir + aceptar: los roles se intercambian y el nuevo líder ya no tiene
--      votos de propuestas abiertas. No transfiere un integrante (NX005), ni a un invitado (NX010),
--      ni hay dos transferencias pendientes (NX012); responde solo la persona propuesta (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); l uuid := pg_temp.lider(e); a uuid := pg_temp.integrante(e, 1);
  t uuid := pg_temp.proponer(e); tr uuid; ok int := 0; BEGIN
  PERFORM pg_temp.votar(e, t, 1, 'aceptar');
  BEGIN PERFORM proc_liderazgo_transferir(a, e, pg_temp.integrante(e, 2));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_liderazgo_transferir(l, e, pg_temp.invitado(e));
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  tr := (proc_liderazgo_transferir(l, e, a)->'transferencia'->>'id')::uuid;
  BEGIN PERFORM proc_liderazgo_transferir(l, e, pg_temp.integrante(e, 2));
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_liderazgo_responder(pg_temp.integrante(e, 2), e, tr, true);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_liderazgo_responder(a, e, tr, true);
  IF pg_temp.rol(e, a) <> 'lider' OR pg_temp.rol(e, l) <> 'integrante' THEN RAISE EXCEPTION 'FALLO P70: roles'; END IF;
  IF EXISTS (SELECT 1 FROM tarea_votos WHERE tarea_id = t AND usuario_id = a) THEN RAISE EXCEPTION 'FALLO P70: el nuevo líder conserva su voto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM notificaciones WHERE usuario_id = a AND accion_tipo = 'liderazgo') THEN RAISE EXCEPTION 'FALLO P70: sin aviso'; END IF;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P70: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P70: proc_liderazgo_transferir (y aceptar con proc_liderazgo_responder)';
END $$;

-- P71. proc_liderazgo_responder: rechazar no cambia nada; aceptar una transferencia «y salgo» deja
--      al líder anterior fuera del equipo; una transferencia resuelta no se responde dos veces (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); l uuid := pg_temp.lider(e); a uuid := pg_temp.integrante(e, 1);
  tr uuid; ok int := 0; BEGIN
  tr := (proc_liderazgo_transferir(l, e, a)->'transferencia'->>'id')::uuid;
  PERFORM proc_liderazgo_responder(a, e, tr, false);
  IF pg_temp.rol(e, l) <> 'lider' OR (SELECT estado::text FROM transferencias_liderazgo WHERE id = tr) <> 'rechazada' THEN
    RAISE EXCEPTION 'FALLO P71: el rechazo cambió algo';
  END IF;
  BEGIN PERFORM proc_liderazgo_responder(a, e, tr, true);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  tr := (proc_liderazgo_transferir(l, e, a, true)->'transferencia'->>'id')::uuid;
  PERFORM proc_liderazgo_responder(a, e, tr, true);
  IF pg_temp.rol(e, a) <> 'lider' OR pg_temp.rol(e, l) IS NOT NULL
     OR (SELECT estado::text FROM membresias WHERE equipo_id = e AND usuario_id = l ORDER BY desde DESC LIMIT 1) <> 'salio' THEN
    RAISE EXCEPTION 'FALLO P71: el líder anterior no salió';
  END IF;
  IF ok <> 1 THEN RAISE EXCEPTION 'FALLO P71: % de 1 rechazos', ok; END IF;
  RAISE NOTICE 'OK P71: proc_liderazgo_responder (rechazar y aceptar saliendo del equipo)';
END $$;

-- P72. proc_liderazgo_cancelar: solo el líder (NX005) y solo una pendiente (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); l uuid := pg_temp.lider(e); tr uuid; ok int := 0; BEGIN
  tr := (proc_liderazgo_transferir(l, e, pg_temp.integrante(e, 1))->'transferencia'->>'id')::uuid;
  BEGIN PERFORM proc_liderazgo_cancelar(pg_temp.integrante(e, 1), e, tr);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF proc_liderazgo_cancelar(l, e, tr)->'transferencia' <> 'null'::jsonb THEN RAISE EXCEPTION 'FALLO P72: sigue pendiente'; END IF;
  BEGIN PERFORM proc_liderazgo_cancelar(l, e, tr);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P72: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P72: proc_liderazgo_cancelar';
END $$;

-- P73. proc_liderazgo_obtener: pendiente, elección e historial (FALT-07); el invitado no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); l uuid := pg_temp.lider(e); tr uuid; d jsonb; ok boolean := false; BEGIN
  tr := (proc_liderazgo_transferir(l, e, pg_temp.integrante(e, 1))->'transferencia'->>'id')::uuid;
  PERFORM proc_liderazgo_cancelar(l, e, tr);
  PERFORM proc_eleccion_convocar(l, e);
  d := proc_liderazgo_obtener(pg_temp.integrante(e, 2), e);
  IF d->'eleccion'->>'fase' <> 'votacion' OR jsonb_array_length(d->'historial') <> 1
     OR d->'historial'->0->>'tipo' <> 'transferencia' THEN RAISE EXCEPTION 'FALLO P73: %', d; END IF;
  BEGIN PERFORM proc_liderazgo_obtener(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P73: el invitado vio el liderazgo'; END IF;
  RAISE NOTICE 'OK P73: proc_liderazgo_obtener';
END $$;

-- P74. proc_eleccion_convocar: todos los integrantes son candidatos y el plazo es de 72 h; no
--      convoca un integrante (NX005) ni hay dos elecciones abiertas (NX012) ni sin integrantes (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); solo uuid := pg_temp.equipo_con(0); d jsonb; ok int := 0; BEGIN
  BEGIN PERFORM proc_eleccion_convocar(pg_temp.integrante(e, 1), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  d := proc_eleccion_convocar(pg_temp.lider(e), e)->'eleccion';
  IF jsonb_array_length(d->'candidatos') <> 3 OR (d->>'votantes_total')::int <> 3
     OR abs(extract(epoch FROM (d->>'plazo_en')::timestamptz - now()) - 72 * 3600) > 60 THEN
    RAISE EXCEPTION 'FALLO P74: %', d;
  END IF;
  BEGIN PERFORM proc_eleccion_convocar(pg_temp.lider(e), e);
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_eleccion_convocar(pg_temp.lider(solo), solo);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P74: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P74: proc_eleccion_convocar';
END $$;

-- P75. proc_eleccion_votar: el líder saliente no vota (NX002, por el proceso y a mano), el invitado
--      tampoco (NX005), nadie vota dos veces (NX012); los votos ajenos no se ven mientras está
--      abierta, y cuando votaron todos se resuelve en el acto: hay nuevo líder y el saliente es integrante.
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); l uuid := pg_temp.lider(e); g uuid := pg_temp.integrante(e, 2);
  el uuid; d jsonb; ok int := 0; BEGIN
  PERFORM proc_eleccion_convocar(l, e);
  el := pg_temp.eleccion(e);
  BEGIN PERFORM proc_eleccion_votar(l, e, el, pg_temp.integrante(e, 1));
  EXCEPTION WHEN SQLSTATE 'NX002' THEN ok := ok + 1; END;
  BEGIN INSERT INTO eleccion_votos (eleccion_id, ronda, votante_id, candidato_id) VALUES (el, 1, l, pg_temp.integrante(e, 1));
  EXCEPTION WHEN SQLSTATE 'NX002' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_eleccion_votar(pg_temp.invitado(e), e, el, pg_temp.integrante(e, 1));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  d := pg_temp.votar_lider(e, 1, 2)->'eleccion';
  IF d->'candidatos'->0->'votos' <> 'null'::jsonb OR (d->>'mi_voto')::uuid <> pg_temp.integrante(e, 2) THEN
    RAISE EXCEPTION 'FALLO P75: se ven votos ajenos %', d;
  END IF;
  BEGIN PERFORM pg_temp.votar_lider(e, 1, 3);
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  PERFORM pg_temp.votar_lider(e, 2, 2);
  d := pg_temp.votar_lider(e, 3, 1);
  IF d->'eleccion' <> 'null'::jsonb OR d->'historial'->0->>'fase' <> 'resultado'
     OR pg_temp.rol(e, g) <> 'lider' OR pg_temp.rol(e, l) <> 'integrante' THEN
    RAISE EXCEPTION 'FALLO P75: no se resolvió %', d;
  END IF;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P75: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P75: proc_eleccion_votar (el saliente no vota, NX002; resultado al votar todos)';
END $$;

-- P76. Elección de punta a punta con plazos acortados: empate → ronda de desempate solo entre los
--      empatados (votar a otro, NX010) → vence el plazo y proc_eleccion_vencidas da el resultado.
DO $$ DECLARE e uuid := pg_temp.equipo_con(4); g uuid := pg_temp.integrante(e, 1); el uuid; d jsonb; ok int := 0; BEGIN
  PERFORM proc_eleccion_convocar(pg_temp.lider(e), e);
  el := pg_temp.eleccion(e);
  PERFORM pg_temp.votar_lider(e, 1, 1); PERFORM pg_temp.votar_lider(e, 2, 2);
  PERFORM pg_temp.votar_lider(e, 3, 1);
  d := pg_temp.votar_lider(e, 4, 2)->'eleccion';
  IF d->>'fase' <> 'empate' OR (d->>'ronda')::int <> 2
     OR (SELECT count(*) FROM jsonb_array_elements(d->'candidatos') c WHERE (c->>'finalista')::boolean) <> 2 THEN
    RAISE EXCEPTION 'FALLO P76: no hubo desempate %', d;
  END IF;
  BEGIN PERFORM pg_temp.votar_lider(e, 3, 3);
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  PERFORM pg_temp.votar_lider(e, 3, 1); PERFORM pg_temp.votar_lider(e, 4, 1);
  IF (proc_eleccion_vencidas()->>'resueltas')::int <> 0 THEN RAISE EXCEPTION 'FALLO P76: resolvió antes del plazo'; END IF;
  UPDATE elecciones SET plazo_en = now() - interval '1 minute' WHERE id = el;   -- plazo acortado
  IF (proc_eleccion_vencidas()->>'resueltas')::int <> 1 THEN RAISE EXCEPTION 'FALLO P76: no resolvió la vencida'; END IF;
  IF (SELECT fase::text FROM elecciones WHERE id = el) <> 'resultado' OR pg_temp.rol(e, g) <> 'lider' THEN
    RAISE EXCEPTION 'FALLO P76: resultado incorrecto';
  END IF;
  IF ok <> 1 THEN RAISE EXCEPTION 'FALLO P76: % de 1 rechazos', ok; END IF;
  RAISE NOTICE 'OK P76: proc_eleccion_vencidas (elección completa con desempate y plazo acortado)';
END $$;

-- P77. proc_eleccion_vencidas: sin votos el líder sigue siéndolo; un empate en el desempate lo
--      gana quien lleva más tiempo en el equipo.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); f uuid := pg_temp.equipo_con(2); g uuid := pg_temp.integrante(f, 2); BEGIN
  PERFORM proc_eleccion_convocar(pg_temp.lider(e), e);
  UPDATE elecciones SET plazo_en = now() - interval '1 minute' WHERE id = pg_temp.eleccion(e);
  PERFORM proc_eleccion_vencidas();
  IF (SELECT fase::text FROM elecciones WHERE id = pg_temp.eleccion(e)) <> 'sin_votos' OR pg_temp.rol(e, pg_temp.lider(e)) <> 'lider' THEN
    RAISE EXCEPTION 'FALLO P77: sin votos';
  END IF;
  UPDATE membresias SET desde = now() - interval '10 days' WHERE equipo_id = f AND usuario_id = pg_temp.integrante(f, 2);
  PERFORM proc_eleccion_convocar(pg_temp.lider(f), f);
  PERFORM pg_temp.votar_lider(f, 1, 1); PERFORM pg_temp.votar_lider(f, 2, 2);   -- empate → ronda 2
  PERFORM pg_temp.votar_lider(f, 1, 2); PERFORM pg_temp.votar_lider(f, 2, 1);   -- empate otra vez
  IF (SELECT ganador_id FROM elecciones WHERE id = pg_temp.eleccion(f)) <> g THEN
    RAISE EXCEPTION 'FALLO P77: el desempate por antigüedad falló';
  END IF;
  RAISE NOTICE 'OK P77: elección sin votos y empate en el desempate';
END $$;

-- P78. proc_equipo_salir: quien sale deja sus tareas sin responsable y las votaciones se recuentan
--      (con menos integrantes una propuesta alcanza la mayoría); el líder no sale (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(4); t uuid := pg_temp.proponer(e); mia uuid; ok boolean := false; BEGIN
  mia := pg_temp.aceptada(e, 4, 'De quien se va');
  PERFORM pg_temp.votar(e, t, 1, 'aceptar'); PERFORM pg_temp.votar(e, t, 2, 'aceptar');   -- 2 de 4: sigue abierta
  PERFORM proc_equipo_salir(pg_temp.integrante(e, 4), e);
  IF pg_temp.estado(t) <> 'aceptada' THEN RAISE EXCEPTION 'FALLO P78: no se recontó (quedó %)', pg_temp.estado(t); END IF;
  IF (SELECT responsable_id FROM tareas WHERE id = mia) IS NOT NULL THEN RAISE EXCEPTION 'FALLO P78: la tarea sigue asignada'; END IF;
  BEGIN PERFORM proc_equipo_salir(pg_temp.lider(e), e);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P78: el líder salió'; END IF;
  RAISE NOTICE 'OK P78: proc_equipo_salir';
END $$;

-- P79. proc_equipo_expulsar: la líder expulsa (y la persona recibe aviso); no se expulsa a sí misma
--      (NX010) y un integrante no expulsa (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); x uuid := pg_temp.integrante(e, 2); ok int := 0; BEGIN
  BEGIN PERFORM proc_equipo_expulsar(pg_temp.integrante(e, 1), e, pg_temp.membresia(e, x));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_equipo_expulsar(pg_temp.lider(e), e, pg_temp.membresia(e, pg_temp.lider(e)));
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  PERFORM proc_equipo_expulsar(pg_temp.lider(e), e, pg_temp.membresia(e, x));
  IF pg_temp.rol(e, x) IS NOT NULL OR NOT EXISTS (SELECT 1 FROM notificaciones WHERE usuario_id = x) THEN
    RAISE EXCEPTION 'FALLO P79: sigue en el equipo o sin aviso';
  END IF;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P79: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P79: proc_equipo_expulsar';
END $$;

-- P80. proc_invitado_gestionar: ampliar el acceso y convertir en integrante (con color); no lo hace
--      un integrante (NX005), no se «convierte» a quien no es invitado (NX007) y los días son 7/14/30 (NX010).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); inv uuid := pg_temp.invitado(e); m uuid; antes timestamptz; ok int := 0; BEGIN
  m := pg_temp.membresia(e, inv);
  antes := (SELECT caduca_en FROM membresias WHERE id = m);
  BEGIN PERFORM proc_invitado_gestionar(pg_temp.integrante(e, 1), e, m, 'convertir');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_invitado_gestionar(pg_temp.lider(e), e, m, 'ampliar', 9);
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  PERFORM proc_invitado_gestionar(pg_temp.lider(e), e, m, 'ampliar', 7);
  IF (SELECT caduca_en FROM membresias WHERE id = m) - antes <> interval '7 days' THEN RAISE EXCEPTION 'FALLO P80: no amplió'; END IF;
  PERFORM proc_invitado_gestionar(pg_temp.lider(e), e, m, 'convertir');
  IF (SELECT rol::text || coalesce(color_idx::text, '-') || coalesce(caduca_en::text, 'sin') FROM membresias WHERE id = m) <> 'integrante3sin' THEN
    RAISE EXCEPTION 'FALLO P80: conversión incompleta';
  END IF;
  BEGIN PERFORM proc_invitado_gestionar(pg_temp.lider(e), e, m, 'convertir');
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P80: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P80: proc_invitado_gestionar';
END $$;

-- P81. proc_equipo_configurar y proc_equipo_configuracion: la líder cambia nombre y plazos; el tope
--      no baja de los miembros actuales y la zona horaria debe existir (NX010); el integrante no
--      configura (NX005) y el invitado no ve la configuración (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(3); d jsonb; ok int := 0; BEGIN
  d := proc_equipo_configurar(pg_temp.lider(e), e, '{"nombre": "Equipo renombrado", "votacion_plazo_horas": 48}');
  IF d->>'nombre' <> 'Equipo renombrado' OR (d->>'votacion_plazo_horas')::int <> 48 THEN RAISE EXCEPTION 'FALLO P81: %', d; END IF;
  BEGIN PERFORM proc_equipo_configurar(pg_temp.lider(e), e, '{"max_miembros": 3}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_equipo_configurar(pg_temp.lider(e), e, '{"zona_horaria": "Marte/Olimpo"}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_equipo_configurar(pg_temp.lider(e), e, '{"duracion_sprint_semanas": 5}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_equipo_configurar(pg_temp.integrante(e, 1), e, '{"nombre": "Otro"}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_equipo_configuracion(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 5 THEN RAISE EXCEPTION 'FALLO P81: % de 5 rechazos', ok; END IF;
  RAISE NOTICE 'OK P81: proc_equipo_configurar y proc_equipo_configuracion';
END $$;

-- P82. proc_equipo_archivar: archivado, el equipo es de solo lectura (NX009); se reactiva; el
--      integrante no archiva (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); ok int := 0; BEGIN
  BEGIN PERFORM proc_equipo_archivar(pg_temp.integrante(e, 1), e, true);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF proc_equipo_archivar(pg_temp.lider(e), e, true)->>'estado' <> 'archivado' THEN RAISE EXCEPTION 'FALLO P82: no archivó'; END IF;
  BEGIN PERFORM pg_temp.proponer(e, 'En un equipo archivado');
  EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  IF proc_equipo_archivar(pg_temp.lider(e), e, false)->>'estado' <> 'activo' THEN RAISE EXCEPTION 'FALLO P82: no reactivó'; END IF;
  PERFORM pg_temp.proponer(e, 'Ya se puede');
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P82: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P82: proc_equipo_archivar';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Vistas secundarias (0011, Fase 3.4)
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION pg_temp.reunion(p_equipo uuid, p_autor uuid, p_datos jsonb DEFAULT '{}') RETURNS uuid AS $$
  SELECT (proc_reunion_crear(p_autor, p_equipo,
            jsonb_build_object('titulo', 'Reunión de prueba', 'inicio', date_trunc('day', now()) + interval '1 day 10 hours') || p_datos)->>'id')::uuid;
$$ LANGUAGE sql;

-- P83. proc_reunion_crear: líder o integrante; invita al equipo (quien crea dice «sí») y avisa a los
--      demás. El invitado no crea (NX005) y un título vacío no entra (NX010).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); r uuid; ok int := 0; BEGIN
  r := pg_temp.reunion(e, pg_temp.integrante(e, 1));
  IF (SELECT count(*) FROM reunion_asistencia WHERE reunion_id = r) <> 3
     OR (SELECT respuesta::text FROM reunion_asistencia WHERE reunion_id = r AND usuario_id = pg_temp.integrante(e, 1)) <> 'si'
     OR NOT EXISTS (SELECT 1 FROM notificaciones WHERE usuario_id = pg_temp.lider(e) AND accion_tipo = 'ver_reunion') THEN
    RAISE EXCEPTION 'FALLO P83: asistencia o aviso';
  END IF;
  BEGIN PERFORM pg_temp.reunion(e, pg_temp.invitado(e));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.reunion(e, pg_temp.lider(e), '{"titulo": "  "}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P83: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P83: proc_reunion_crear';
END $$;

-- P84. proc_calendario_equipo: una reunión semanal aparece cada semana del rango y la diaria solo de
--      lunes a viernes; también las entregas. El invitado no ve el calendario (NX005) y el rango es
--      de 62 días como máximo (NX010).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid; d jsonb; v_lunes timestamptz; ok int := 0; BEGIN
  v_lunes := (date_trunc('week', now() AT TIME ZONE 'America/Mexico_City') + interval '7 days 9 hours') AT TIME ZONE 'America/Mexico_City';
  PERFORM pg_temp.reunion(e, pg_temp.lider(e), jsonb_build_object('titulo', 'Semanal', 'inicio', v_lunes, 'repeticion', 'semanal'));
  PERFORM pg_temp.reunion(e, pg_temp.lider(e), jsonb_build_object('titulo', 'Diaria', 'inicio', v_lunes, 'repeticion', 'diaria_lv'));
  t := pg_temp.aceptada(e, 0, 'Con entrega');
  UPDATE tareas SET vence_en = v_lunes + interval '2 days' WHERE id = t;
  d := proc_calendario_equipo(pg_temp.integrante(e, 1), e, v_lunes, v_lunes + interval '14 days');
  IF (SELECT count(*) FROM jsonb_array_elements(d->'reuniones') x WHERE x->>'titulo' = 'Semanal') <> 2
     OR (SELECT count(*) FROM jsonb_array_elements(d->'reuniones') x WHERE x->>'titulo' = 'Diaria') <> 10
     OR jsonb_array_length(d->'entregas') <> 1 THEN
    RAISE EXCEPTION 'FALLO P84: %', jsonb_build_object('n', jsonb_array_length(d->'reuniones'), 'e', jsonb_array_length(d->'entregas'));
  END IF;
  BEGIN PERFORM proc_calendario_equipo(pg_temp.invitado(e), e, v_lunes, v_lunes + interval '7 days');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_calendario_equipo(pg_temp.lider(e), e, v_lunes, v_lunes + interval '90 days');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P84: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P84: proc_calendario_equipo (reuniones repetidas y entregas)';
END $$;

-- P85. proc_reunion_editar: quien la creó o el líder; otro integrante no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); r uuid; ok boolean := false; BEGIN
  r := pg_temp.reunion(e, pg_temp.integrante(e, 1));
  BEGIN PERFORM proc_reunion_editar(pg_temp.integrante(e, 2), e, r, '{"titulo": "Ajena"}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF proc_reunion_editar(pg_temp.lider(e), e, r, '{"lugar": "Sala 2"}')->>'lugar' <> 'Sala 2' THEN RAISE EXCEPTION 'FALLO P85: el líder no editó'; END IF;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P85: otro integrante editó'; END IF;
  RAISE NOTICE 'OK P85: proc_reunion_editar';
END $$;

-- P86. proc_reunion_cancelar: deja de verse en el calendario y no se cancela dos veces (NX006).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); r uuid; ok boolean := false; BEGIN
  r := pg_temp.reunion(e, pg_temp.lider(e));
  PERFORM proc_reunion_cancelar(pg_temp.lider(e), e, r);
  IF jsonb_array_length(proc_calendario_equipo(pg_temp.lider(e), e, now(), now() + interval '7 days')->'reuniones') <> 0 THEN
    RAISE EXCEPTION 'FALLO P86: sigue en el calendario';
  END IF;
  BEGIN PERFORM proc_reunion_cancelar(pg_temp.lider(e), e, r);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P86: se canceló dos veces'; END IF;
  RAISE NOTICE 'OK P86: proc_reunion_cancelar';
END $$;

-- P87. proc_reunion_responder: sí/no/quizá; otra respuesta no (NX010) ni el invitado (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); r uuid; d jsonb; ok int := 0; BEGIN
  r := pg_temp.reunion(e, pg_temp.lider(e));
  d := proc_reunion_responder(pg_temp.integrante(e, 1), e, r, 'quiza');
  IF d->>'mi_respuesta' <> 'quiza' OR (d->'asistencia'->>'quiza')::int <> 1 THEN RAISE EXCEPTION 'FALLO P87: %', d; END IF;
  BEGIN PERFORM proc_reunion_responder(pg_temp.integrante(e, 1), e, r, 'tal_vez');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_reunion_responder(pg_temp.invitado(e), e, r, 'si');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P87: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P87: proc_reunion_responder';
END $$;

-- P88. proc_actividad_listar: por tipo y por páginas; el invitado no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); d jsonb; ok boolean := false; BEGIN
  PERFORM pg_temp.proponer(e, 'Una'); PERFORM pg_temp.proponer(e, 'Dos'); PERFORM pg_temp.reunion(e, pg_temp.lider(e));
  d := proc_actividad_listar(pg_temp.integrante(e, 1), e, 'tarea', NULL, 1);
  IF jsonb_array_length(d->'items') <> 1 OR NOT (d->>'hay_mas')::boolean OR d->'items'->0->>'tipo' <> 'tarea' THEN
    RAISE EXCEPTION 'FALLO P88: %', d;
  END IF;
  IF jsonb_array_length(proc_actividad_listar(pg_temp.lider(e), e, 'reunion')->'items') <> 1 THEN RAISE EXCEPTION 'FALLO P88: reuniones'; END IF;
  BEGIN PERFORM proc_actividad_listar(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P88: el invitado vio la actividad'; END IF;
  RAISE NOTICE 'OK P88: proc_actividad_listar';
END $$;

-- P89. proc_notificacion_listar: solo las propias, con el total de no leídas.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); d jsonb; BEGIN
  PERFORM pg_temp.reunion(e, pg_temp.lider(e));
  d := proc_notificacion_listar(pg_temp.integrante(e, 1));
  IF (d->>'no_leidas')::int <> 1 OR jsonb_array_length(d->'items') <> 1 OR d->'items'->0->>'equipo' <> 'Equipo de prueba' THEN
    RAISE EXCEPTION 'FALLO P89: %', d;
  END IF;
  IF jsonb_array_length(proc_notificacion_listar(pg_temp.lider(e))->'items') <> 0 THEN RAISE EXCEPTION 'FALLO P89: avisó a quien la creó'; END IF;
  RAISE NOTICE 'OK P89: proc_notificacion_listar';
END $$;

-- P90. proc_notificacion_marcar: una o todas; la de otra persona no (NX006).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); n uuid; ok boolean := false; BEGIN
  PERFORM pg_temp.reunion(e, pg_temp.lider(e)); PERFORM pg_temp.reunion(e, pg_temp.lider(e));
  n := (proc_notificacion_listar(pg_temp.integrante(e, 1))->'items'->0->>'id')::uuid;
  BEGIN PERFORM proc_notificacion_marcar(pg_temp.integrante(e, 2), n);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF (proc_notificacion_marcar(pg_temp.integrante(e, 1), n)->>'no_leidas')::int <> 1 THEN RAISE EXCEPTION 'FALLO P90: una'; END IF;
  IF (proc_notificacion_marcar(pg_temp.integrante(e, 1))->>'no_leidas')::int <> 0 THEN RAISE EXCEPTION 'FALLO P90: todas'; END IF;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P90: marcó una ajena'; END IF;
  RAISE NOTICE 'OK P90: proc_notificacion_marcar';
END $$;

-- P91. proc_reporte_equipo: estados, cumplimiento y personas; el invitado no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); t uuid; d jsonb; ok boolean := false; BEGIN
  t := pg_temp.aceptada(e, 1, 'Hecha');
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(e), e, t, NULL, 'habilitada');
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(e), e, t, NULL, 'en_curso');
  PERFORM proc_tarea_cambiar_estado(pg_temp.lider(e), e, t, NULL, 'completada');
  PERFORM pg_temp.proponer(e, 'Abierta');
  d := proc_reporte_equipo(pg_temp.integrante(e, 2), e);
  IF (d->'por_estado'->>'completada')::int <> 1 OR (d->'por_estado'->>'propuesta')::int <> 1 OR (d->>'a_tiempo')::int <> 1
     OR (SELECT (x->>'completadas')::int FROM jsonb_array_elements(d->'por_persona') x WHERE (x->>'usuario_id')::uuid = pg_temp.integrante(e, 1)) <> 1 THEN
    RAISE EXCEPTION 'FALLO P91: %', d;
  END IF;
  BEGIN PERFORM proc_reporte_equipo(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P91: el invitado vio el reporte'; END IF;
  RAISE NOTICE 'OK P91: proc_reporte_equipo';
END $$;

-- P92. proc_reporte_exportar: el líder exporta todo; un integrante solo lo suyo (NX005 si pide todo).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); ok boolean := false; BEGIN
  PERFORM pg_temp.aceptada(e, 1, 'De uno'); PERFORM pg_temp.aceptada(e, 2, 'De otro');
  IF jsonb_array_length(proc_reporte_exportar(pg_temp.lider(e), e, false)) <> 2 THEN RAISE EXCEPTION 'FALLO P92: líder'; END IF;
  IF jsonb_array_length(proc_reporte_exportar(pg_temp.integrante(e, 1), e, true)) <> 1 THEN RAISE EXCEPTION 'FALLO P92: propias'; END IF;
  BEGIN PERFORM proc_reporte_exportar(pg_temp.integrante(e, 1), e, false);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P92: el integrante exportó todo'; END IF;
  RAISE NOTICE 'OK P92: proc_reporte_exportar';
END $$;

-- P93. proc_plantilla_crear: la líder, con 1 a 30 elementos (NX010); el integrante no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); d jsonb; ok int := 0; BEGIN
  d := proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Arranque", "tipo": "proyecto", "elementos": ["Repositorio", "CI"]}');
  IF d->'elementos' <> '["Repositorio", "CI"]'::jsonb THEN RAISE EXCEPTION 'FALLO P93: %', d; END IF;
  BEGIN PERFORM proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Vacía", "tipo": "sprint", "elementos": []}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Rara", "tipo": "otra", "elementos": ["x"]}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_plantilla_crear(pg_temp.integrante(e, 1), e, '{"nombre": "Mía", "tipo": "retro", "elementos": ["x"]}');
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P93: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P93: proc_plantilla_crear';
END $$;

-- P94. proc_plantilla_listar: el equipo las ve; el invitado no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); ok boolean := false; BEGIN
  PERFORM proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Retro rápida", "tipo": "retro", "elementos": ["¿Qué repetimos?"]}');
  IF jsonb_array_length(proc_plantilla_listar(pg_temp.integrante(e, 1), e)) <> 1 THEN RAISE EXCEPTION 'FALLO P94'; END IF;
  BEGIN PERFORM proc_plantilla_listar(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P94: el invitado vio las plantillas'; END IF;
  RAISE NOTICE 'OK P94: proc_plantilla_listar';
END $$;

-- P95. proc_plantilla_usar: una de proyecto propone sus elementos como tareas en votación; una
--      guía no crea tareas (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); p uuid; g uuid; ok boolean := false; BEGIN
  p := (proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Arranque", "tipo": "proyecto", "elementos": ["Repositorio", "CI"]}')->>'id')::uuid;
  g := (proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Guía", "tipo": "sprint", "elementos": ["Revisar capacidad"]}')->>'id')::uuid;
  IF (proc_plantilla_usar(pg_temp.lider(e), e, p)->>'creadas')::int <> 2 THEN RAISE EXCEPTION 'FALLO P95: no propuso'; END IF;
  IF (SELECT count(*) FROM tareas WHERE equipo_id = e AND estado = 'propuesta') <> 2 THEN RAISE EXCEPTION 'FALLO P95: no están en votación'; END IF;
  BEGIN PERFORM proc_plantilla_usar(pg_temp.lider(e), e, g);
  EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P95: una guía creó tareas'; END IF;
  RAISE NOTICE 'OK P95: proc_plantilla_usar';
END $$;

-- P96. proc_plantilla_eliminar: la líder; dos veces no (NX006) y el integrante tampoco (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); p uuid; ok int := 0; BEGIN
  p := (proc_plantilla_crear(pg_temp.lider(e), e, '{"nombre": "Borrar", "tipo": "retro", "elementos": ["x"]}')->>'id')::uuid;
  BEGIN PERFORM proc_plantilla_eliminar(pg_temp.integrante(e, 1), e, p);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_plantilla_eliminar(pg_temp.lider(e), e, p);
  BEGIN PERFORM proc_plantilla_eliminar(pg_temp.lider(e), e, p);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P96: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P96: proc_plantilla_eliminar';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Archivos (0012, Fase 3.4)
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION pg_temp.archivo(p_equipo uuid, p_autor uuid, p_tarea uuid DEFAULT NULL) RETURNS uuid AS $$
  SELECT (proc_archivo_subir(p_autor, p_equipo, 'notas.txt', 'text/plain', convert_to('Hola, equipo', 'UTF8'), p_tarea)->>'id')::uuid;
$$ LANGUAGE sql;

-- P97. proc_archivo_subir: guarda metadatos, contenido y huella; adjunto a una tarea queda en su
--      historial. Tipo no permitido (NX010), más de 5 MB (NX010), tarea ajena (NX006) e invitado (NX005), no.
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); otro uuid := pg_temp.equipo_con(1); t uuid; a uuid; ok int := 0; BEGIN
  t := pg_temp.aceptada(e, 1, 'Con adjunto');
  a := pg_temp.archivo(e, pg_temp.integrante(e, 1), t);
  IF (SELECT tamano_bytes FROM archivos WHERE id = a) <> 12 OR (SELECT tipo::text FROM archivos WHERE id = a) <> 'doc'
     OR NOT EXISTS (SELECT 1 FROM archivo_contenidos WHERE archivo_id = a)
     OR NOT EXISTS (SELECT 1 FROM actividad WHERE objeto_id = t AND accion = 'archivo_adjuntado') THEN
    RAISE EXCEPTION 'FALLO P97: no se guardó bien';
  END IF;
  BEGIN PERFORM proc_archivo_subir(pg_temp.lider(e), e, 'x.svg', 'image/svg+xml', '\x3c73', NULL);
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_archivo_subir(pg_temp.lider(e), e, 'grande.pdf', 'application/pdf', decode(repeat('00', 5242881), 'hex'), NULL);
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.archivo(e, pg_temp.lider(e), pg_temp.aceptada(otro, 1, 'Ajena'));
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.archivo(e, pg_temp.invitado(e));
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P97: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P97: proc_archivo_subir (tipo y tamaño permitidos)';
END $$;

-- P98. proc_archivo_listar: del equipo o de una tarea; el invitado no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); t uuid; ok boolean := false; BEGIN
  t := pg_temp.aceptada(e, 1, 'Con adjunto');
  PERFORM pg_temp.archivo(e, pg_temp.lider(e)); PERFORM pg_temp.archivo(e, pg_temp.lider(e), t);
  IF jsonb_array_length(proc_archivo_listar(pg_temp.integrante(e, 1), e)) <> 2
     OR jsonb_array_length(proc_archivo_listar(pg_temp.integrante(e, 1), e, t)) <> 1 THEN RAISE EXCEPTION 'FALLO P98'; END IF;
  BEGIN PERFORM proc_archivo_listar(pg_temp.invitado(e), e);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P98: el invitado vio los archivos'; END IF;
  RAISE NOTICE 'OK P98: proc_archivo_listar';
END $$;

-- P99. proc_archivo_descargar: devuelve el mismo contenido; el de otro equipo no (NX006).
DO $$ DECLARE e uuid := pg_temp.equipo_con(1); otro uuid := pg_temp.equipo_con(1); a uuid; d jsonb; ok boolean := false; BEGIN
  a := pg_temp.archivo(e, pg_temp.lider(e));
  d := proc_archivo_descargar(pg_temp.integrante(e, 1), e, a);
  IF convert_from(decode(d->>'contenido', 'base64'), 'UTF8') <> 'Hola, equipo' OR d->>'mime' <> 'text/plain' THEN RAISE EXCEPTION 'FALLO P99: %', d; END IF;
  BEGIN PERFORM proc_archivo_descargar(pg_temp.lider(otro), otro, a);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'FALLO P99: otro equipo lo descargó'; END IF;
  RAISE NOTICE 'OK P99: proc_archivo_descargar';
END $$;

-- P100. proc_archivo_eliminar: quien lo subió o la líder (se borra el contenido); otro integrante no (NX005).
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); a uuid; ok int := 0; BEGIN
  a := pg_temp.archivo(e, pg_temp.integrante(e, 1));
  BEGIN PERFORM proc_archivo_eliminar(pg_temp.integrante(e, 2), e, a);
  EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_archivo_eliminar(pg_temp.integrante(e, 1), e, a);
  IF EXISTS (SELECT 1 FROM archivo_contenidos WHERE archivo_id = a) OR jsonb_array_length(proc_archivo_listar(pg_temp.lider(e), e)) <> 0 THEN
    RAISE EXCEPTION 'FALLO P100: sigue ahí';
  END IF;
  BEGIN PERFORM proc_archivo_descargar(pg_temp.lider(e), e, a);
  EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P100: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P100: proc_archivo_eliminar';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Ajustes de la persona (0013, Fase 3.6)
-- ---------------------------------------------------------------------------------------------

-- P101. proc_usuario_ajustes: valores por defecto (avisos en la app, sin silencio) para cada persona.
DO $$ DECLARE u uuid := pg_temp.usuario(); d jsonb; BEGIN
  d := proc_usuario_ajustes(u);
  IF jsonb_array_length(d->'notificaciones') <> 7 OR NOT (d->'notificaciones'->0->>'por_app')::boolean
     OR (d->'notificaciones'->0->>'por_whatsapp')::boolean OR d->'silencio_desde' <> 'null'::jsonb
     OR NOT (d->>'estado_visible')::boolean OR d->>'primer_dia' <> 'lunes' THEN
    RAISE EXCEPTION 'FALLO P101: %', d;
  END IF;
  RAISE NOTICE 'OK P101: proc_usuario_ajustes';
END $$;

-- P102. proc_usuario_ajustes_guardar: horas de silencio, privacidad y canales por aviso; el silencio
--       va completo (NX010), con horas válidas (NX010) y solo con avisos conocidos (NX010). Cada
--       quien cambia solo los suyos.
DO $$ DECLARE u uuid := pg_temp.usuario(); otro uuid := pg_temp.usuario(); d jsonb; ok int := 0; BEGIN
  d := proc_usuario_ajustes_guardar(u, '{"silencio_desde": "22:00", "silencio_hasta": "07:30", "estado_visible": false,
    "notificaciones": [{"evento": "reunion", "por_app": false, "por_whatsapp": true, "por_correo": false}]}');
  IF d->>'silencio_desde' <> '22:00' OR d->>'silencio_hasta' <> '07:30' OR (d->>'estado_visible')::boolean
     OR (SELECT (x->>'por_app')::boolean FROM jsonb_array_elements(d->'notificaciones') x WHERE x->>'evento' = 'reunion') THEN
    RAISE EXCEPTION 'FALLO P102: %', d;
  END IF;
  IF (SELECT count(*) FROM preferencias_notificacion WHERE usuario_id = otro) <> 0 THEN RAISE EXCEPTION 'FALLO P102: tocó a otra persona'; END IF;
  BEGIN PERFORM proc_usuario_ajustes_guardar(u, '{"silencio_desde": "22:00"}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_usuario_ajustes_guardar(u, '{"silencio_desde": "25:00", "silencio_hasta": "07:00"}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_usuario_ajustes_guardar(u, '{"notificaciones": [{"evento": "otro"}]}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_usuario_ajustes_guardar(u, '{"primer_dia": "martes"}');
  EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P102: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P102: proc_usuario_ajustes_guardar';
END $$;

-- P103. proc_reporte_personal (FALT-01): tareas personales y las de equipo a tu cargo, por espacio;
--       las de un equipo del que ya saliste no cuentan.
DO $$ DECLARE e uuid := pg_temp.equipo_con(2); yo uuid := pg_temp.integrante(e, 1); d jsonb; BEGIN
  PERFORM proc_personal_tarea_crear(yo, '{"titulo": "Personal"}');
  PERFORM pg_temp.aceptada(e, 1, 'Del equipo');
  d := proc_reporte_personal(yo);
  IF jsonb_array_length(d->'por_espacio') <> 2 OR d->'por_espacio'->0->>'nombre' <> 'Espacio personal' THEN
    RAISE EXCEPTION 'FALLO P103: %', d;
  END IF;
  PERFORM proc_equipo_salir(yo, e);
  IF jsonb_array_length(proc_reporte_personal(yo)->'por_espacio') <> 1 THEN RAISE EXCEPTION 'FALLO P103: contó un equipo ajeno'; END IF;
  RAISE NOTICE 'OK P103: proc_reporte_personal';
END $$;

-- =============================================================================================
-- Fase 4 · Chat (0014 a 0016, DEC-CHAT-1). Pruebas P104 a P149 (reservadas para el chat).
-- =============================================================================================

-- Equipo de prueba con sus dos canales fijos (equipo_con inserta a mano y no los crea).
CREATE FUNCTION pg_temp.equipo_chat(n int DEFAULT 2) RETURNS uuid AS $$
DECLARE e uuid := pg_temp.equipo_con(n);
BEGIN
  INSERT INTO conversaciones (equipo_id, tipo, nombre) VALUES (e, 'equipo', 'Equipo de prueba'), (e, 'invitados', 'Invitados');
  RETURN e;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.canal(p_equipo uuid, p_tipo text) RETURNS uuid AS $$
  SELECT id FROM conversaciones WHERE equipo_id = p_equipo AND tipo = p_tipo::tipo_conversacion;
$$ LANGUAGE sql;

-- Envía un mensaje (con campos extra opcionales como `hilo_de_id`, `menciones` o `id_cliente`).
CREATE FUNCTION pg_temp.decir(p_actor uuid, p_conv uuid, p_texto text, p_extra jsonb DEFAULT '{}') RETURNS jsonb AS $$
  SELECT proc_chat_enviar(p_actor, p_conv, jsonb_build_object('texto', p_texto) || p_extra);
$$ LANGUAGE sql;

-- P104. Quién entra a cada canal: líder e integrantes a los dos; el invitado solo a «Invitados»;
--       quien no es del equipo y una conversación inexistente dan NX006 (404).
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  ajeno uuid := pg_temp.usuario(); ok int := 0; BEGIN
  PERFORM proc_chat_mensajes(pg_temp.lider(e), eq);
  PERFORM proc_chat_mensajes(pg_temp.integrante(e, 1), eq);
  PERFORM proc_chat_mensajes(pg_temp.lider(e), inv);
  PERFORM proc_chat_mensajes(pg_temp.integrante(e, 1), inv);
  PERFORM proc_chat_mensajes(pg_temp.invitado(e), inv);
  BEGIN PERFORM proc_chat_mensajes(pg_temp.invitado(e), eq); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_mensajes(ajeno, eq); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_mensajes(ajeno, inv); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_mensajes(pg_temp.lider(e), gen_random_uuid()); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P104: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P104: acceso a los canales';
END $$;

-- P105. proc_chat_enviar: guarda el mensaje recortado con su autor y deja el puntero del autor en él;
--       vacío o de más de 4000 caracteres da NX010; el invitado no escribe en «Equipo» pero sí en «Invitados».
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  l uuid := pg_temp.lider(e); m jsonb; ok int := 0; BEGIN
  m := pg_temp.decir(l, eq, '  Hola equipo  ');
  IF m->>'texto' <> 'Hola equipo' OR (m->'autor'->>'usuario_id')::uuid <> l OR (m->>'seq')::bigint < 1
     OR (m->>'eliminado')::boolean OR (m->>'respuestas')::int <> 0 THEN
    RAISE EXCEPTION 'FALLO P105: %', m;
  END IF;
  IF (SELECT ultimo_leido_seq FROM conversacion_lecturas WHERE conversacion_id = eq AND usuario_id = l) <> (m->>'seq')::bigint THEN
    RAISE EXCEPTION 'FALLO P105: el autor no quedó al día';
  END IF;
  BEGIN PERFORM pg_temp.decir(l, eq, '   '); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.decir(l, eq, repeat('a', 4001)); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.decir(pg_temp.invitado(e), eq, 'hola'); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  PERFORM pg_temp.decir(pg_temp.invitado(e), inv, 'Hola desde afuera');
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P105: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P105: proc_chat_enviar';
END $$;

-- P106. Reenviar con el mismo id_cliente devuelve el mismo mensaje (una sola fila); otra persona
--       que reutiliza ese id_cliente recibe NX012 y no ve el mensaje ajeno.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  cid uuid := gen_random_uuid(); a jsonb; b jsonb; ok int := 0; BEGIN
  a := pg_temp.decir(l, eq, 'Uno', jsonb_build_object('id_cliente', cid));
  b := pg_temp.decir(l, eq, 'Otro texto', jsonb_build_object('id_cliente', cid));
  IF a->>'id' <> b->>'id' OR b->>'texto' <> 'Uno' OR (SELECT count(*) FROM mensajes WHERE conversacion_id = eq) <> 1 THEN
    RAISE EXCEPTION 'FALLO P106: se duplicó %', b;
  END IF;
  BEGIN PERFORM pg_temp.decir(pg_temp.integrante(e, 1), eq, 'Intruso', jsonb_build_object('id_cliente', cid));
  EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  IF ok <> 1 THEN RAISE EXCEPTION 'FALLO P106: reutilizó el id de otra persona'; END IF;
  RAISE NOTICE 'OK P106: id_cliente idempotente';
END $$;

-- P107. Hilos: una respuesta a una respuesta se une a la raíz; las respuestas no salen en la página
--       principal pero cuentan en la raíz; proc_chat_hilo da raíz y respuestas en orden; responder a un
--       mensaje de otra conversación o eliminado da NX010; el invitado no ve el hilo del equipo.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  l uuid := pg_temp.lider(e); i1 uuid := pg_temp.integrante(e, 1); raiz jsonb; r1 jsonb; r2 jsonb; fuera jsonb; h jsonb; ok int := 0; BEGIN
  raiz := pg_temp.decir(l, eq, 'Raíz');
  r1 := pg_temp.decir(i1, eq, 'Primera', jsonb_build_object('hilo_de_id', raiz->>'id'));
  r2 := pg_temp.decir(l, eq, 'Segunda', jsonb_build_object('hilo_de_id', r1->>'id'));
  IF r1->>'hilo_de_id' <> raiz->>'id' OR r2->>'hilo_de_id' <> raiz->>'id' THEN RAISE EXCEPTION 'FALLO P107: no usó la raíz'; END IF;
  h := proc_chat_hilo(i1, (r2->>'id')::uuid);
  IF h->'raiz'->>'id' <> raiz->>'id' OR (h->'raiz'->>'respuestas')::int <> 2 OR jsonb_array_length(h->'respuestas') <> 2
     OR h->'respuestas'->0->>'texto' <> 'Primera' THEN
    RAISE EXCEPTION 'FALLO P107: hilo %', h;
  END IF;
  IF jsonb_array_length(proc_chat_mensajes(l, eq)->'items') <> 1 THEN RAISE EXCEPTION 'FALLO P107: las respuestas salieron en la página'; END IF;
  fuera := pg_temp.decir(l, inv, 'En otro canal');
  BEGIN PERFORM pg_temp.decir(l, eq, 'x', jsonb_build_object('hilo_de_id', fuera->>'id')); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  PERFORM proc_chat_eliminar(l, (r1->>'id')::uuid);
  BEGIN PERFORM pg_temp.decir(l, eq, 'x', jsonb_build_object('hilo_de_id', r1->>'id')); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_hilo(pg_temp.invitado(e), (raiz->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P107: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P107: hilos';
END $$;

-- P108. Menciones: solo cuentan las personas con acceso al canal y no uno mismo; cada una recibe una
--       notificación de «menciones» que abre el chat; con «mencion» apagada en la app no se notifica;
--       en el canal de Invitados sí se puede mencionar al invitado.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  l uuid := pg_temp.lider(e); i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2); g uuid := pg_temp.invitado(e);
  ajeno uuid := pg_temp.usuario(); m jsonb; n record; BEGIN
  m := pg_temp.decir(i1, eq, '@Integrante 2 y @Líder, mírenlo',
         jsonb_build_object('menciones', jsonb_build_array(i2, l, i1, g, ajeno)));
  IF jsonb_array_length(m->'menciones') <> 2 OR NOT (m->'menciones' @> to_jsonb(i2::text)) OR NOT (m->'menciones' @> to_jsonb(l::text)) THEN
    RAISE EXCEPTION 'FALLO P108: menciones %', m->'menciones';
  END IF;
  SELECT * INTO n FROM notificaciones WHERE usuario_id = i2;
  IF n.categoria <> 'menciones' OR n.accion_tipo <> 'abrir_chat' OR n.accion_ref <> eq::text OR n.titulo <> 'Integrante te mencionó'
     OR n.enlace <> '/app/e/' || e || '/chat/' || eq THEN
    RAISE EXCEPTION 'FALLO P108: notificación %', to_jsonb(n);
  END IF;
  IF (SELECT count(*) FROM notificaciones WHERE usuario_id IN (i1, g, ajeno)) <> 0 THEN RAISE EXCEPTION 'FALLO P108: notificó de más'; END IF;
  INSERT INTO preferencias_notificacion (usuario_id, evento, por_app) VALUES (i2, 'mencion', false);
  PERFORM pg_temp.decir(i1, eq, 'Otra vez', jsonb_build_object('menciones', jsonb_build_array(i2)));
  IF (SELECT count(*) FROM notificaciones WHERE usuario_id = i2) <> 1 THEN RAISE EXCEPTION 'FALLO P108: ignoró la preferencia'; END IF;
  m := pg_temp.decir(l, inv, 'Bienvenido', jsonb_build_object('menciones', jsonb_build_array(g)));
  IF (SELECT count(*) FROM notificaciones WHERE usuario_id = g AND categoria = 'menciones') <> 1 THEN RAISE EXCEPTION 'FALLO P108: no mencionó al invitado'; END IF;
  RAISE NOTICE 'OK P108: menciones y notificaciones';
END $$;

-- P109. Paginación por cursor: páginas de 2 de más nuevas a más antiguas, cada una en orden ascendente.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(1); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  p1 jsonb; p2 jsonb; p3 jsonb; i int; BEGIN
  FOR i IN 1..5 LOOP PERFORM pg_temp.decir(l, eq, 'Mensaje ' || i); END LOOP;
  p1 := proc_chat_mensajes(l, eq, NULL, 2);
  IF jsonb_array_length(p1->'items') <> 2 OR NOT (p1->>'hay_mas')::boolean OR p1->'items'->0->>'texto' <> 'Mensaje 4'
     OR p1->'items'->1->>'texto' <> 'Mensaje 5' THEN RAISE EXCEPTION 'FALLO P109: página 1 %', p1->'items'; END IF;
  p2 := proc_chat_mensajes(l, eq, (p1->'items'->0->>'seq')::bigint, 2);
  IF p2->'items'->0->>'texto' <> 'Mensaje 2' OR p2->'items'->1->>'texto' <> 'Mensaje 3' OR NOT (p2->>'hay_mas')::boolean THEN
    RAISE EXCEPTION 'FALLO P109: página 2 %', p2->'items';
  END IF;
  p3 := proc_chat_mensajes(l, eq, (p2->'items'->0->>'seq')::bigint, 2);
  IF jsonb_array_length(p3->'items') <> 1 OR (p3->>'hay_mas')::boolean OR p3->'items'->0->>'texto' <> 'Mensaje 1' THEN
    RAISE EXCEPTION 'FALLO P109: página 3 %', p3->'items';
  END IF;
  RAISE NOTICE 'OK P109: paginación por cursor';
END $$;

-- P110. No leídos y puntero: lo propio no cuenta; las menciones se cuentan aparte; leer avanza pero
--       nunca retrocede ni pasa del último mensaje.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2); m1 jsonb; m2 jsonb; r jsonb; BEGIN
  m1 := pg_temp.decir(l, eq, 'Uno');
  m2 := pg_temp.decir(l, eq, 'Dos', jsonb_build_object('menciones', jsonb_build_array(i1)));
  PERFORM pg_temp.decir(l, eq, 'Tres');
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(i1, e)) x WHERE x->>'id' = eq::text);
  IF (r->>'no_leidos')::int <> 3 OR (r->>'menciones_sin_leer')::int <> 1 THEN RAISE EXCEPTION 'FALLO P110: %', r; END IF;
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(l, e)) x WHERE x->>'id' = eq::text);
  IF (r->>'no_leidos')::int <> 0 THEN RAISE EXCEPTION 'FALLO P110: contó lo propio %', r; END IF;
  r := proc_chat_leer(i1, eq, (m2->>'seq')::bigint);
  IF (r->>'no_leidos')::int <> 1 THEN RAISE EXCEPTION 'FALLO P110: leer %', r; END IF;
  r := proc_chat_leer(i1, eq, (m1->>'seq')::bigint);
  IF (r->>'ultimo_leido_seq')::bigint <> (m2->>'seq')::bigint THEN RAISE EXCEPTION 'FALLO P110: retrocedió %', r; END IF;
  r := proc_chat_leer(i1, eq, 1000000000);
  IF (r->>'no_leidos')::int <> 0 OR (r->>'ultimo_leido_seq')::bigint <> (SELECT max(seq) FROM mensajes WHERE conversacion_id = eq) THEN
    RAISE EXCEPTION 'FALLO P110: pasó del último %', r;
  END IF;
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(i2, e)) x WHERE x->>'id' = eq::text);
  IF (r->>'no_leidos')::int <> 3 THEN RAISE EXCEPTION 'FALLO P110: leyó por otra persona %', r; END IF;
  RAISE NOTICE 'OK P110: no leídos y puntero de lectura';
END $$;

-- P111. proc_chat_conversaciones: el líder ve los dos canales y su mensaje directo; el invitado solo
--       «Invitados»; el chat de una tarea sin mensajes no aparece hasta que alguien escribe.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); l uuid := pg_temp.lider(e); i1 uuid := pg_temp.integrante(e, 1);
  g uuid := pg_temp.invitado(e); t uuid := pg_temp.aceptada(e, 0, 'Tarea con chat'); c jsonb; d jsonb; BEGIN
  IF jsonb_array_length(proc_chat_conversaciones(l, e)) <> 2 OR jsonb_array_length(proc_chat_conversaciones(g, e)) <> 1
     OR proc_chat_conversaciones(g, e)->0->>'tipo' <> 'invitados' THEN
    RAISE EXCEPTION 'FALLO P111: canales';
  END IF;
  c := proc_chat_conversacion_tarea(l, e, t);
  IF jsonb_array_length(proc_chat_conversaciones(l, e)) <> 2 THEN RAISE EXCEPTION 'FALLO P111: listó una tarea sin mensajes'; END IF;
  PERFORM pg_temp.decir(l, (c->>'id')::uuid, 'Arrancamos');
  d := proc_chat_dm_abrir(l, e, i1);
  IF jsonb_array_length(proc_chat_conversaciones(l, e)) <> 4 OR jsonb_array_length(proc_chat_conversaciones(i1, e)) <> 4 THEN
    RAISE EXCEPTION 'FALLO P111: tarea y directo %', proc_chat_conversaciones(l, e);
  END IF;
  IF d->>'nombre' <> 'Integrante 1' OR d->'con'->>'usuario_id' <> i1::text
     OR NOT (proc_chat_conversaciones(i1, e)::text LIKE '%"nombre": "Líder Prueba"%') THEN
    RAISE EXCEPTION 'FALLO P111: nombre del directo %', d;
  END IF;
  RAISE NOTICE 'OK P111: proc_chat_conversaciones';
END $$;

-- P112. proc_chat_conversacion_tarea: la primera vez crea el chat y después devuelve el mismo; un
--       invitado solo abre tareas compartidas; una tarea de otro equipo es NX006.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); otro uuid := pg_temp.equipo_chat(1); l uuid := pg_temp.lider(e); g uuid := pg_temp.invitado(e);
  t uuid := pg_temp.aceptada(e, 0, 'Diseñar'); t_otro uuid := pg_temp.aceptada(otro, 0, 'Ajena'); a jsonb; b jsonb; ok int := 0; BEGIN
  a := proc_chat_conversacion_tarea(pg_temp.integrante(e, 1), e, t);
  b := proc_chat_conversacion_tarea(l, e, t);
  IF a->>'id' <> b->>'id' OR a->>'tipo' <> 'tarea' OR a->>'nombre' NOT LIKE 'T-%Diseñar' OR (a->'tarea'->>'id')::uuid <> t
     OR (SELECT count(*) FROM conversaciones WHERE tarea_id = t) <> 1 THEN
    RAISE EXCEPTION 'FALLO P112: %', a;
  END IF;
  BEGIN PERFORM proc_chat_conversacion_tarea(g, e, t); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_conversacion_tarea(l, e, t_otro); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  INSERT INTO tarea_compartida (tarea_id, membresia_id) VALUES (t, pg_temp.membresia(e, g));
  IF (proc_chat_conversacion_tarea(g, e, t)->>'id') <> a->>'id' THEN RAISE EXCEPTION 'FALLO P112: el invitado no entró'; END IF;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P112: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P112: proc_chat_conversacion_tarea';
END $$;

-- P113. El invitado escribe en el chat de una tarea compartida y, en cuanto se deja de compartir,
--       pierde el acceso (también a sus salas y a la lista de miembros); el líder conserva el historial.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(1); l uuid := pg_temp.lider(e); g uuid := pg_temp.invitado(e);
  t uuid := pg_temp.aceptada(e, 0, 'Compartida'); c uuid; ok int := 0; BEGIN
  INSERT INTO tarea_compartida (tarea_id, membresia_id) VALUES (t, pg_temp.membresia(e, g));
  c := (proc_chat_conversacion_tarea(l, e, t)->>'id')::uuid;
  PERFORM pg_temp.decir(g, c, 'Yo también opino');
  IF NOT (proc_chat_miembros(l, c)::text LIKE '%"rol": "invitado"%') THEN RAISE EXCEPTION 'FALLO P113: no lista al invitado'; END IF;
  DELETE FROM tarea_compartida WHERE tarea_id = t;
  BEGIN PERFORM proc_chat_mensajes(g, c); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.decir(g, c, 'Sigo aquí'); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF proc_chat_salas(g)::text LIKE '%' || c::text || '%' THEN RAISE EXCEPTION 'FALLO P113: sigue en la sala'; END IF;
  IF proc_chat_miembros(l, c)::text LIKE '%"rol": "invitado"%' THEN RAISE EXCEPTION 'FALLO P113: sigue en miembros'; END IF;
  IF jsonb_array_length(proc_chat_mensajes(l, c)->'items') <> 1 THEN RAISE EXCEPTION 'FALLO P113: el líder perdió el historial'; END IF;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P113: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P113: invitado y tarea compartida';
END $$;

-- P114. proc_chat_dm_abrir: una sola conversación por pareja (da igual quién abre); el invitado no
--       escribe a nadie (NX005), no se escribe a un invitado ni a uno mismo ni a quien no es del equipo
--       (NX010); un tercero, ni siquiera el líder, ve esa conversación (NX006).
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); l uuid := pg_temp.lider(e); i1 uuid := pg_temp.integrante(e, 1);
  i2 uuid := pg_temp.integrante(e, 2); g uuid := pg_temp.invitado(e); a jsonb; b jsonb; ok int := 0; BEGIN
  a := proc_chat_dm_abrir(i1, e, i2);
  b := proc_chat_dm_abrir(i2, e, i1);
  IF a->>'id' <> b->>'id' OR a->>'tipo' <> 'dm' OR (SELECT count(*) FROM conversaciones WHERE equipo_id = e AND tipo = 'dm') <> 1
     OR a->>'nombre' <> 'Integrante 2' OR b->>'nombre' <> 'Integrante 1' THEN
    RAISE EXCEPTION 'FALLO P114: %', a;
  END IF;
  PERFORM pg_temp.decir(i1, (a->>'id')::uuid, 'Pssst');
  BEGIN PERFORM proc_chat_dm_abrir(g, e, l); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_dm_abrir(l, e, g); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_dm_abrir(l, e, l); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_dm_abrir(l, e, pg_temp.usuario()); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_mensajes(l, (a->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.decir(l, (a->>'id')::uuid, 'Metiche'); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 6 THEN RAISE EXCEPTION 'FALLO P114: % de 6 rechazos', ok; END IF;
  RAISE NOTICE 'OK P114: proc_chat_dm_abrir';
END $$;

-- P115. Si una de las dos personas sale del equipo, el mensaje directo deja de verse para quien se queda.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2);
  d uuid := (proc_chat_dm_abrir(pg_temp.integrante(e, 1), e, pg_temp.integrante(e, 2))->>'id')::uuid; ok int := 0; BEGIN
  PERFORM pg_temp.decir(i1, d, 'Antes de irte');
  PERFORM proc_equipo_salir(i2, e);
  BEGIN PERFORM proc_chat_mensajes(i1, d); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_mensajes(i2, d); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P115: % de 2 rechazos', ok; END IF;
  IF jsonb_array_length(proc_chat_conversaciones(i1, e)) <> 2 THEN RAISE EXCEPTION 'FALLO P115: lista con el directo'; END IF;
  RAISE NOTICE 'OK P115: directo tras salir del equipo';
END $$;

-- P116. proc_chat_eliminar: cada quien borra lo suyo (el texto deja de salir y se desfija); un
--       integrante no borra lo ajeno (NX005); el líder sí en canales, pero no en un directo ajeno
--       (NX006); borrar dos veces no falla; los mensajes de sistema solo los borra el líder.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2); propio jsonb; ajeno jsonb; sis uuid; d uuid; dm jsonb; ok int := 0; BEGIN
  propio := pg_temp.decir(i1, eq, 'Me equivoqué');
  PERFORM proc_chat_fijar(l, (propio->>'id')::uuid, true);
  propio := proc_chat_eliminar(i1, (propio->>'id')::uuid);
  IF NOT (propio->>'eliminado')::boolean OR propio->>'texto' <> '' OR (propio->>'fijado')::boolean THEN RAISE EXCEPTION 'FALLO P116: %', propio; END IF;
  PERFORM proc_chat_eliminar(i1, (propio->>'id')::uuid);
  ajeno := pg_temp.decir(i1, eq, 'Mío');
  BEGIN PERFORM proc_chat_eliminar(i2, (ajeno->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  ajeno := proc_chat_eliminar(l, (ajeno->>'id')::uuid);
  IF NOT (ajeno->>'eliminado')::boolean OR (SELECT eliminado_por FROM mensajes WHERE id = (ajeno->>'id')::uuid) <> l THEN RAISE EXCEPTION 'FALLO P116: moderación'; END IF;
  INSERT INTO mensajes (conversacion_id, es_sistema, texto) VALUES (eq, true, 'Aviso') RETURNING id INTO sis;
  BEGIN PERFORM proc_chat_eliminar(i1, sis); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  PERFORM proc_chat_eliminar(l, sis);
  dm := proc_chat_dm_abrir(i1, e, i2);
  d := (pg_temp.decir(i1, (dm->>'id')::uuid, 'Privado')->>'id')::uuid;
  BEGIN PERFORM proc_chat_eliminar(l, d); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_eliminar(i1, gen_random_uuid()); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P116: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P116: proc_chat_eliminar';
END $$;

-- P117. proc_chat_fijar: solo el líder fija y desfija (NX005 al integrante); salen en proc_chat_fijados;
--       no se fijan mensajes directos, respuestas de hilo ni mensajes eliminados (NX007); eliminar un
--       fijado lo quita de la lista; quien no ve la conversación no ve sus fijados.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2); a jsonb; b jsonb; r jsonb; dm uuid; dmm jsonb; ok int := 0; BEGIN
  a := pg_temp.decir(i1, eq, 'Importante');
  b := pg_temp.decir(i2, eq, 'En un hilo', jsonb_build_object('hilo_de_id', a->>'id'));
  BEGIN PERFORM proc_chat_fijar(i1, (a->>'id')::uuid, true); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF NOT (proc_chat_fijar(l, (a->>'id')::uuid, true)->>'fijado')::boolean THEN RAISE EXCEPTION 'FALLO P117: no fijó'; END IF;
  IF jsonb_array_length(proc_chat_fijados(i2, eq)) <> 1 OR proc_chat_fijados(i2, eq)->0->>'id' <> a->>'id' THEN RAISE EXCEPTION 'FALLO P117: fijados'; END IF;
  BEGIN PERFORM proc_chat_fijar(l, (b->>'id')::uuid, true); EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  dm := (proc_chat_dm_abrir(l, e, i1)->>'id')::uuid;
  dmm := pg_temp.decir(l, dm, 'Hola');
  BEGIN PERFORM proc_chat_fijar(l, (dmm->>'id')::uuid, true); EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_fijados(i2, dm); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  r := proc_chat_fijar(l, (a->>'id')::uuid, false);
  IF (r->>'fijado')::boolean OR jsonb_array_length(proc_chat_fijados(l, eq)) <> 0 THEN RAISE EXCEPTION 'FALLO P117: no desfijó'; END IF;
  PERFORM proc_chat_fijar(l, (a->>'id')::uuid, true);
  PERFORM proc_chat_eliminar(l, (a->>'id')::uuid);
  IF jsonb_array_length(proc_chat_fijados(l, eq)) <> 0 THEN RAISE EXCEPTION 'FALLO P117: sigue fijado tras borrar'; END IF;
  BEGIN PERFORM proc_chat_fijar(l, (a->>'id')::uuid, true); EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 5 THEN RAISE EXCEPTION 'FALLO P117: % de 5 rechazos', ok; END IF;
  RAISE NOTICE 'OK P117: proc_chat_fijar';
END $$;

-- P118. proc_chat_reaccionar: suma, repetir el tipo lo quita, cada persona cuenta una vez por tipo y
--       «yo» es de quien consulta; un tipo desconocido es NX010 y reaccionar a un mensaje eliminado, NX007.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2); m jsonb; r jsonb; ok int := 0; BEGIN
  m := pg_temp.decir(l, eq, 'Entregamos hoy');
  r := proc_chat_reaccionar(i1, (m->>'id')::uuid, 'hecho');
  IF r->'reacciones'->0->>'tipo' <> 'hecho' OR (r->'reacciones'->0->>'total')::int <> 1 OR NOT (r->'reacciones'->0->>'yo')::boolean THEN RAISE EXCEPTION 'FALLO P118: %', r; END IF;
  r := proc_chat_reaccionar(i2, (m->>'id')::uuid, 'hecho');
  PERFORM proc_chat_reaccionar(i2, (m->>'id')::uuid, 'corazon');
  r := proc_chat_reaccionar(l, (m->>'id')::uuid, 'hecho');
  IF (SELECT (x->>'total')::int FROM jsonb_array_elements(r->'reacciones') x WHERE x->>'tipo' = 'hecho') <> 3 OR jsonb_array_length(r->'reacciones') <> 2 THEN RAISE EXCEPTION 'FALLO P118: suma %', r; END IF;
  r := proc_chat_reaccionar(i1, (m->>'id')::uuid, 'hecho');
  IF (SELECT (x->>'total')::int FROM jsonb_array_elements(r->'reacciones') x WHERE x->>'tipo' = 'hecho') <> 2
     OR (SELECT (x->>'yo')::boolean FROM jsonb_array_elements(r->'reacciones') x WHERE x->>'tipo' = 'hecho') THEN RAISE EXCEPTION 'FALLO P118: quitar %', r; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(proc_chat_mensajes(i2, eq)->'items'->0->'reacciones') x WHERE (x->>'yo')::boolean) <> 2 THEN RAISE EXCEPTION 'FALLO P118: yo'; END IF;
  BEGIN PERFORM proc_chat_reaccionar(i1, (m->>'id')::uuid, 'enojo'); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_reaccionar(pg_temp.invitado(e), (m->>'id')::uuid, 'ok'); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  PERFORM proc_chat_eliminar(l, (m->>'id')::uuid);
  BEGIN PERFORM proc_chat_reaccionar(i1, (m->>'id')::uuid, 'ok'); EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P118: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P118: proc_chat_reaccionar';
END $$;

-- P119. proc_chat_preferencias: fijar y silenciar una conversación vale solo para quien lo hace;
--       un cambio parcial conserva los demás valores.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(1); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); r jsonb; BEGIN
  r := proc_chat_preferencias(i1, eq, '{"fijada": true}');
  IF NOT (r->>'fijada')::boolean OR (r->>'silenciada')::boolean THEN RAISE EXCEPTION 'FALLO P119: %', r; END IF;
  r := proc_chat_preferencias(i1, eq, '{"silenciada": true}');
  IF NOT (r->>'fijada')::boolean OR NOT (r->>'silenciada')::boolean THEN RAISE EXCEPTION 'FALLO P119: perdió lo anterior %', r; END IF;
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(l, e)) x WHERE x->>'id' = eq::text);
  IF (r->>'fijada')::boolean OR (r->>'silenciada')::boolean THEN RAISE EXCEPTION 'FALLO P119: afectó a otra persona %', r; END IF;
  RAISE NOTICE 'OK P119: proc_chat_preferencias';
END $$;

-- P120. proc_chat_miembros: en «Equipo» solo líder e integrantes; en «Invitados» también el invitado;
--       quien no puede ver la conversación no puede pedir la lista (NX006).
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  l uuid := pg_temp.lider(e); ok int := 0; BEGIN
  IF jsonb_array_length(proc_chat_miembros(l, eq)) <> 3 OR proc_chat_miembros(l, eq)::text LIKE '%"rol": "invitado"%'
     OR proc_chat_miembros(l, eq)->0->>'rol' <> 'lider' THEN
    RAISE EXCEPTION 'FALLO P120: equipo %', proc_chat_miembros(l, eq);
  END IF;
  IF jsonb_array_length(proc_chat_miembros(pg_temp.invitado(e), inv)) <> 4 THEN RAISE EXCEPTION 'FALLO P120: invitados'; END IF;
  BEGIN PERFORM proc_chat_miembros(pg_temp.invitado(e), eq); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 1 THEN RAISE EXCEPTION 'FALLO P120: el invitado vio miembros del equipo'; END IF;
  RAISE NOTICE 'OK P120: proc_chat_miembros';
END $$;

-- P121. proc_chat_salas: las conversaciones que la persona ve en todos sus equipos y nada más
--       (el invitado, solo «Invitados»; no hay salas de equipos ajenos).
DO $$ DECLARE e uuid := pg_temp.equipo_chat(1); otro uuid := pg_temp.equipo_chat(1); l uuid := pg_temp.lider(e); s jsonb; BEGIN
  s := proc_chat_salas(l);
  IF jsonb_array_length(s) <> 2 OR s::text LIKE '%' || otro::text || '%' THEN RAISE EXCEPTION 'FALLO P121: líder %', s; END IF;
  s := proc_chat_salas(pg_temp.invitado(e));
  IF jsonb_array_length(s) <> 1 OR s->0->>'conversacion_id' <> pg_temp.canal(e, 'invitados')::text THEN RAISE EXCEPTION 'FALLO P121: invitado %', s; END IF;
  IF proc_chat_salas(pg_temp.usuario()) <> '[]'::jsonb THEN RAISE EXCEPTION 'FALLO P121: ajeno'; END IF;
  RAISE NOTICE 'OK P121: proc_chat_salas';
END $$;

-- P122. proc_chat_buscar: encuentra por palabra (con variantes del español) y marca lo hallado con «…»;
--       respeta la visibilidad (el invitado no encuentra lo del equipo; un directo ajeno nunca sale);
--       no devuelve eliminados ni mensajes de sistema; menos de 2 caracteres es NX010.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  l uuid := pg_temp.lider(e); i1 uuid := pg_temp.integrante(e, 1); i2 uuid := pg_temp.integrante(e, 2); g uuid := pg_temp.invitado(e);
  borrado jsonb; r jsonb; ok int := 0; BEGIN
  PERFORM pg_temp.decir(l, eq, 'Agendamos la reunión semanal del jueves');
  PERFORM pg_temp.decir(l, inv, 'La reunión con el cliente es el lunes');
  PERFORM pg_temp.decir(i1, (proc_chat_dm_abrir(i1, e, i2)->>'id')::uuid, 'Hablemos de la reunión en privado');
  borrado := pg_temp.decir(l, eq, 'Otra reunión que mejor borro');
  PERFORM proc_chat_eliminar(l, (borrado->>'id')::uuid);
  INSERT INTO mensajes (conversacion_id, es_sistema, texto) VALUES (eq, true, 'Aviso de reunión');
  r := proc_chat_buscar(l, e, 'reuniones');
  IF jsonb_array_length(r) <> 2 OR NOT (r::text LIKE '%«reunión»%') THEN RAISE EXCEPTION 'FALLO P122: líder %', r; END IF;
  r := proc_chat_buscar(g, e, 'reunión');
  IF jsonb_array_length(r) <> 1 OR r->0->>'tipo' <> 'invitados' THEN RAISE EXCEPTION 'FALLO P122: invitado %', r; END IF;
  r := proc_chat_buscar(i1, e, 'reunión');
  IF jsonb_array_length(r) <> 3 THEN RAISE EXCEPTION 'FALLO P122: el integrante no ve su directo %', r; END IF;
  IF jsonb_array_length(proc_chat_buscar(l, e, 'privado')) <> 0 THEN RAISE EXCEPTION 'FALLO P122: el líder vio un directo ajeno'; END IF;
  IF proc_chat_buscar(l, e, 'xyzinexistente') <> '[]'::jsonb THEN RAISE EXCEPTION 'FALLO P122: inventó resultados'; END IF;
  BEGIN PERFORM proc_chat_buscar(l, e, 'a'); EXCEPTION WHEN SQLSTATE 'NX010' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_buscar(pg_temp.usuario(), e, 'reunión'); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 2 THEN RAISE EXCEPTION 'FALLO P122: % de 2 rechazos', ok; END IF;
  RAISE NOTICE 'OK P122: proc_chat_buscar';
END $$;

-- P123. proc_chat_buscar limitado a una conversación y con límite de resultados.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(1); eq uuid := pg_temp.canal(e, 'equipo'); inv uuid := pg_temp.canal(e, 'invitados');
  l uuid := pg_temp.lider(e); i int; BEGIN
  FOR i IN 1..4 LOOP PERFORM pg_temp.decir(l, eq, 'Sprint número ' || i); END LOOP;
  PERFORM pg_temp.decir(l, inv, 'Sprint de invitados');
  IF jsonb_array_length(proc_chat_buscar(l, e, 'sprint')) <> 5 THEN RAISE EXCEPTION 'FALLO P123: total'; END IF;
  IF jsonb_array_length(proc_chat_buscar(l, e, 'sprint', inv)) <> 1 THEN RAISE EXCEPTION 'FALLO P123: una conversación'; END IF;
  IF jsonb_array_length(proc_chat_buscar(l, e, 'sprint', NULL, 2)) <> 2 THEN RAISE EXCEPTION 'FALLO P123: límite'; END IF;
  RAISE NOTICE 'OK P123: búsqueda por conversación y límite';
END $$;

-- P124. proc_chat_mensaje_a_tarea: el líder convierte un mensaje en una propuesta (en votación) que
--       recuerda su mensaje; el mensaje queda ligado, el chat recibe un aviso de sistema y se registra el
--       evento; el título sale de la primera línea. Convertirlo otra vez es NX012.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  m jsonb; r jsonb; t tareas; ok int := 0; BEGIN
  m := pg_temp.decir(pg_temp.integrante(e, 1), eq, E'Preparar la demo del jueves\nCon datos reales de la semilla');
  r := proc_chat_mensaje_a_tarea(l, (m->>'id')::uuid);
  SELECT * INTO t FROM tareas WHERE id = (r->'tarea'->>'id')::uuid;
  IF t.titulo <> 'Preparar la demo del jueves' OR t.estado <> 'propuesta' OR t.mensaje_origen_id <> (m->>'id')::uuid
     OR t.descripcion NOT LIKE '%datos reales%' OR t.equipo_id <> e THEN
    RAISE EXCEPTION 'FALLO P124: tarea %', to_jsonb(t);
  END IF;
  IF r->'mensaje'->'tarea'->>'id' <> t.id::text OR NOT (r->'sistema'->>'es_sistema')::boolean
     OR r->'sistema'->>'texto' NOT LIKE '%convirtió un mensaje en la tarea T-%' THEN
    RAISE EXCEPTION 'FALLO P124: mensajes %', r;
  END IF;
  IF (SELECT count(*) FROM eventos_dominio WHERE objeto_id = t.id AND tipo = 'tarea.propuesta') <> 1 THEN RAISE EXCEPTION 'FALLO P124: sin evento'; END IF;
  BEGIN PERFORM proc_chat_mensaje_a_tarea(l, (m->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX012' THEN ok := ok + 1; END;
  IF ok <> 1 THEN RAISE EXCEPTION 'FALLO P124: convirtió dos veces'; END IF;
  RAISE NOTICE 'OK P124: proc_chat_mensaje_a_tarea';
END $$;

-- P125. proc_chat_mensaje_a_tarea con título y datos propios; solo el líder (NX005); no se convierten
--       mensajes directos (NX005), eliminados ni de sistema (NX007).
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); m jsonb; r jsonb; t tareas; sis uuid; dm jsonb; ok int := 0; BEGIN
  m := pg_temp.decir(i1, eq, 'Alguien podría revisar el contrato');
  BEGIN PERFORM proc_chat_mensaje_a_tarea(i1, (m->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  r := proc_chat_mensaje_a_tarea(l, (m->>'id')::uuid,
         jsonb_build_object('titulo', 'Revisar contrato', 'descripcion', 'Con legal', 'prioridad', 'alta', 'responsable_id', i1));
  SELECT * INTO t FROM tareas WHERE id = (r->'tarea'->>'id')::uuid;
  IF t.titulo <> 'Revisar contrato' OR t.descripcion <> 'Con legal' OR t.prioridad <> 'alta' OR t.responsable_id <> i1 THEN
    RAISE EXCEPTION 'FALLO P125: %', to_jsonb(t);
  END IF;
  INSERT INTO mensajes (conversacion_id, es_sistema, texto) VALUES (eq, true, 'Aviso') RETURNING id INTO sis;
  BEGIN PERFORM proc_chat_mensaje_a_tarea(l, sis); EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  m := pg_temp.decir(i1, eq, 'Borrado');
  PERFORM proc_chat_eliminar(l, (m->>'id')::uuid);
  BEGIN PERFORM proc_chat_mensaje_a_tarea(l, (m->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX007' THEN ok := ok + 1; END;
  dm := proc_chat_dm_abrir(l, e, i1);
  m := pg_temp.decir(l, (dm->>'id')::uuid, 'Nota privada');
  BEGIN PERFORM proc_chat_mensaje_a_tarea(l, (m->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'FALLO P125: % de 4 rechazos', ok; END IF;
  RAISE NOTICE 'OK P125: mensaje a tarea con datos propios y rechazos';
END $$;

-- P126. Un equipo archivado es de solo lectura: se lee y se busca, pero enviar, reaccionar, fijar,
--       eliminar, abrir un directo nuevo o crear un chat de tarea dan NX009.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  i1 uuid := pg_temp.integrante(e, 1); t uuid := pg_temp.aceptada(e, 0, 'Sin chat'); m jsonb; ok int := 0; BEGIN
  m := pg_temp.decir(l, eq, 'Último mensaje');
  PERFORM proc_equipo_archivar(l, e, true);
  PERFORM proc_chat_mensajes(i1, eq);
  PERFORM proc_chat_buscar(i1, e, 'mensaje');
  PERFORM proc_chat_leer(i1, eq, (m->>'seq')::bigint);
  BEGIN PERFORM pg_temp.decir(l, eq, 'Ya no'); EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_reaccionar(i1, (m->>'id')::uuid, 'ok'); EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_fijar(l, (m->>'id')::uuid, true); EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_eliminar(l, (m->>'id')::uuid); EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_dm_abrir(l, e, i1); EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  BEGIN PERFORM proc_chat_conversacion_tarea(l, e, t); EXCEPTION WHEN SQLSTATE 'NX009' THEN ok := ok + 1; END;
  IF ok <> 6 THEN RAISE EXCEPTION 'FALLO P126: % de 6 rechazos', ok; END IF;
  RAISE NOTICE 'OK P126: equipo archivado en solo lectura';
END $$;

-- P127. Un invitado con el acceso caducado no entra a nada (NX005 acceso_caducado) y no figura en sus
--       salas; un integrante que salió del equipo recibe NX006.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); inv uuid := pg_temp.canal(e, 'invitados'); g uuid := pg_temp.invitado(e);
  i2 uuid := pg_temp.integrante(e, 2); ok int := 0; BEGIN
  PERFORM pg_temp.decir(g, inv, 'Todavía puedo');
  UPDATE membresias SET caduca_en = now() - interval '1 day' WHERE equipo_id = e AND usuario_id = g;
  BEGIN PERFORM proc_chat_mensajes(g, inv); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  BEGIN PERFORM pg_temp.decir(g, inv, 'Ya no'); EXCEPTION WHEN SQLSTATE 'NX005' THEN ok := ok + 1; END;
  IF proc_chat_salas(g) <> '[]'::jsonb OR proc_chat_miembros(pg_temp.lider(e), inv)::text LIKE '%"rol": "invitado"%' THEN
    RAISE EXCEPTION 'FALLO P127: sigue con acceso';
  END IF;
  PERFORM proc_equipo_salir(i2, e);
  BEGIN PERFORM proc_chat_mensajes(i2, pg_temp.canal(e, 'equipo')); EXCEPTION WHEN SQLSTATE 'NX006' THEN ok := ok + 1; END;
  IF ok <> 3 THEN RAISE EXCEPTION 'FALLO P127: % de 3 rechazos', ok; END IF;
  RAISE NOTICE 'OK P127: acceso caducado y salida del equipo';
END $$;

-- P128. «Leído por»: cuenta a quienes avanzaron su puntero hasta el mensaje, sin el autor.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(2); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e); m jsonb; BEGIN
  m := pg_temp.decir(l, eq, 'Enterados');
  IF (proc_chat_mensajes(l, eq)->'items'->0->>'leido_por')::int <> 0 THEN RAISE EXCEPTION 'FALLO P128: contó al autor'; END IF;
  PERFORM proc_chat_leer(pg_temp.integrante(e, 1), eq, (m->>'seq')::bigint);
  PERFORM proc_chat_leer(pg_temp.integrante(e, 2), eq, (m->>'seq')::bigint);
  IF (proc_chat_mensajes(l, eq)->'items'->0->>'leido_por')::int <> 2 THEN RAISE EXCEPTION 'FALLO P128: %', proc_chat_mensajes(l, eq)->'items'->0; END IF;
  RAISE NOTICE 'OK P128: leído por';
END $$;

-- P129. «Último mensaje» de la lista: ignora lo eliminado; quien se une después no ve como no leído
--       lo anterior a su ingreso.
DO $$ DECLARE e uuid := pg_temp.equipo_chat(1); eq uuid := pg_temp.canal(e, 'equipo'); l uuid := pg_temp.lider(e);
  a jsonb; b jsonb; nuevo uuid := pg_temp.usuario('Recién llegada'); r jsonb; BEGIN
  a := pg_temp.decir(l, eq, 'Primero');
  b := pg_temp.decir(l, eq, 'Segundo');
  PERFORM proc_chat_eliminar(l, (b->>'id')::uuid);
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(l, e)) x WHERE x->>'id' = eq::text);
  IF r->'ultimo'->>'texto' <> 'Primero' THEN RAISE EXCEPTION 'FALLO P129: último %', r->'ultimo'; END IF;
  UPDATE mensajes SET creado_en = now() - interval '2 days' WHERE conversacion_id = eq;
  INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx) VALUES (e, nuevo, 'integrante', 5);
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(nuevo, e)) x WHERE x->>'id' = eq::text);
  IF (r->>'no_leidos')::int <> 0 THEN RAISE EXCEPTION 'FALLO P129: historial anterior sin leer %', r; END IF;
  PERFORM pg_temp.decir(l, eq, 'Bienvenida');
  r := (SELECT x FROM jsonb_array_elements(proc_chat_conversaciones(nuevo, e)) x WHERE x->>'id' = eq::text);
  IF (r->>'no_leidos')::int <> 1 THEN RAISE EXCEPTION 'FALLO P129: no contó lo nuevo %', r; END IF;
  RAISE NOTICE 'OK P129: último mensaje y no leídos de quien llega';
END $$;
