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
