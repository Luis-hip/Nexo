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
