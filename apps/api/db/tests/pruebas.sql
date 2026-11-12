-- Pruebas de integridad: cada bloque debe terminar con NOTICE 'OK ...'. Cualquier fallo aborta.
\set ON_ERROR_STOP on
SET client_min_messages = notice;

-- 1. Límite de 8: el noveno miembro activo (líder/integrante) es rechazado.
DO $$ BEGIN
  INSERT INTO usuarios (id, correo, nombre) VALUES ('00000000-0000-4000-8000-000000000099','extra@nexo.mx','Extra Uno');
  BEGIN
    INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx)
    VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099','integrante', 8);
    RAISE EXCEPTION 'FALLO: debió rechazar el noveno miembro';
  EXCEPTION WHEN SQLSTATE 'NX001' THEN RAISE NOTICE 'OK 1: noveno miembro rechazado (NX001)';
  END;
END $$;

-- 2. Los invitados no cuentan para el límite.
DO $$ BEGIN
  INSERT INTO membresias (equipo_id, usuario_id, rol, caduca_en)
  VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099','invitado', now()+interval '5 days');
  RAISE NOTICE 'OK 2: un invitado adicional sí entra con el cupo lleno';
END $$;

-- 3. Un solo líder activo por equipo.
DO $$ BEGIN
  BEGIN
    UPDATE membresias SET rol='lider' WHERE usuario_id='00000000-0000-4000-8000-000000000002' AND equipo_id='10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALLO: aceptó dos líderes';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 3: segundo líder rechazado';
  END;
END $$;

-- 4. Un solo sprint activo por equipo.
DO $$ BEGIN
  BEGIN
    UPDATE sprints SET estado='activo' WHERE numero=4;
    RAISE EXCEPTION 'FALLO: aceptó dos sprints activos';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK 4: segundo sprint activo rechazado';
  END;
END $$;

-- 5. Atascar exige motivo.
DO $$ BEGIN
  BEGIN
    UPDATE tareas SET estado='atascada', motivo=NULL WHERE codigo=1 AND equipo_id IS NOT NULL;
    RAISE EXCEPTION 'FALLO: atascó sin motivo';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 5: atascada sin motivo rechazada';
  END;
END $$;

-- 6. Versionado optimista: cada UPDATE incrementa version.
DO $$ DECLARE v1 int; v2 int; BEGIN
  SELECT version INTO v1 FROM tareas WHERE equipo_id IS NOT NULL AND codigo=2;
  UPDATE tareas SET progreso = 45 WHERE equipo_id IS NOT NULL AND codigo=2;
  SELECT version INTO v2 FROM tareas WHERE equipo_id IS NOT NULL AND codigo=2;
  IF v2 <> v1 + 1 THEN RAISE EXCEPTION 'FALLO: version no incrementó (% -> %)', v1, v2; END IF;
  RAISE NOTICE 'OK 6: version % -> %', v1, v2;
END $$;

-- 7. El líder saliente no vota y solo se vota por candidatos de esa elección.
DO $$ BEGIN
  INSERT INTO elecciones (id, equipo_id, fase, plazo_en, saliente_id)
  VALUES ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','votacion', now()+interval '72 hours','00000000-0000-4000-8000-000000000001');
  INSERT INTO eleccion_candidatos VALUES ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
  BEGIN
    INSERT INTO eleccion_votos (eleccion_id, ronda, votante_id, candidato_id)
    VALUES ('40000000-0000-4000-8000-000000000001',1,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'FALLO: el saliente votó';
  EXCEPTION WHEN SQLSTATE 'NX002' THEN RAISE NOTICE 'OK 7: voto del líder saliente rechazado';
  END;
  INSERT INTO eleccion_votos (eleccion_id, ronda, votante_id, candidato_id)
  VALUES ('40000000-0000-4000-8000-000000000001',1,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002');
  BEGIN
    INSERT INTO eleccion_votos (eleccion_id, ronda, votante_id, candidato_id)
    VALUES ('40000000-0000-4000-8000-000000000001',1,'00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000008');
    RAISE EXCEPTION 'FALLO: votó por un no candidato';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK 7b: voto por no candidato rechazado';
  END;
END $$;

-- 8. Códigos de tarea consecutivos por equipo.
DO $$ DECLARE n int; mx int; BEGIN
  SELECT count(*), max(codigo) INTO n, mx FROM tareas WHERE equipo_id='10000000-0000-4000-8000-000000000001';
  IF n <> mx THEN RAISE EXCEPTION 'FALLO: códigos con huecos (% tareas, máximo %)', n, mx; END IF;
  RAISE NOTICE 'OK 8: códigos T-01..T-% consecutivos', lpad(mx::text, 2, '0');
END $$;

-- 9. Cupo visible en la vista.
DO $$ DECLARE a int; i int; BEGIN
  SELECT miembros_activos, invitados_activos INTO a, i FROM v_equipo_cupo WHERE equipo_id='10000000-0000-4000-8000-000000000001';
  IF a <> 8 THEN RAISE EXCEPTION 'FALLO: miembros_activos=%', a; END IF;
  RAISE NOTICE 'OK 9: cupo = % miembros activos y % invitados', a, i;
END $$;

-- 10. Una tarea personal no puede pertenecer también a un equipo.
DO $$ BEGIN
  BEGIN
    INSERT INTO tareas (equipo_id, dueno_id, titulo) VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','x');
    RAISE EXCEPTION 'FALLO: tarea con equipo y dueño';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK 10: tarea con equipo y dueño rechazada';
  END;
END $$;
