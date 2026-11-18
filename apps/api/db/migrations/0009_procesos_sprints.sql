-- Fase 3.3 · Sprints y retrospectiva (EQ-09 a EQ-13), DEC-031.
-- Todo el acceso a datos de los sprints es un proceso `proc_*` (DEC-025). Las tablas ya existen
-- en 0001 (`sprints`, `sprint_capacidad`, `sprint_instantaneas`, `retrospectivas`, `retro_notas`,
-- `retro_votos`); esta migración no las cambia. Documentación: docs/08_Procesos_BD.md.
--
-- Ciclo de un sprint: planificado → activo → cerrado (un solo activo por equipo, índice
-- `ux_un_sprint_activo`). Al cerrar se guarda la instantánea del día y se crea la retrospectiva.

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. El historial distingue los eventos de sprint (`actividad.tipo = 'sprint'`)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_registrar_evento(
  p_equipo uuid, p_actor uuid, p_tipo text, p_objeto_tipo text, p_objeto_id uuid,
  p_carga jsonb, p_resumen text
) RETURNS void AS $$
DECLARE
  v_categoria text := split_part(p_tipo, '.', 1);
  v_accion    text := coalesce(nullif(split_part(p_tipo, '.', 2), ''), 'cambio');
  v_ahora     timestamptz := clock_timestamp();
BEGIN
  INSERT INTO eventos_dominio (equipo_id, tipo, objeto_tipo, objeto_id, actor_id, carga, creado_en)
  VALUES (p_equipo, p_tipo, p_objeto_tipo, p_objeto_id, p_actor, coalesce(p_carga, '{}'::jsonb), v_ahora);
  INSERT INTO actividad (equipo_id, autor_id, tipo, accion, objeto_tipo, objeto_id, resumen, detalle, creado_en)
  VALUES (p_equipo, p_actor, CASE WHEN v_categoria IN ('tarea', 'sprint') THEN v_categoria ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb), v_ahora);
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------------------------
-- 2. Auxiliares (fn_*)
-- ---------------------------------------------------------------------------------------------

/** Los invitados no ven los sprints ni la retrospectiva (matriz: `ver_sprints`). Devuelve el rol. */
CREATE OR REPLACE FUNCTION fn_exigir_ve_sprints(p_actor uuid, p_equipo uuid) RETURNS rol_membresia AS $$
DECLARE v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor, p_equipo);
  IF v_rol = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN v_rol;
END $$ LANGUAGE plpgsql STABLE;

/**
 * Planear, iniciar, cerrar o borrar un sprint: solo el líder, en un equipo activo. Bloquea la
 * fila del equipo para que dos acciones a la vez (dos «iniciar», dos «planear») se ordenen.
 */
CREATE OR REPLACE FUNCTION fn_exigir_gestion_sprints(p_actor uuid, p_equipo uuid) RETURNS void AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor, p_equipo, 'Solo el líder puede planear, iniciar y cerrar sprints.');
  PERFORM fn_exigir_equipo_activo(p_equipo);
  PERFORM 1 FROM equipos WHERE id = p_equipo FOR UPDATE;
END $$ LANGUAGE plpgsql;

/** Hoy según la zona horaria del equipo (las fechas de sprint son `date`). */
CREATE OR REPLACE FUNCTION fn_hoy_equipo(p_equipo uuid) RETURNS date AS $$
  SELECT (now() AT TIME ZONE zona_horaria)::date FROM equipos WHERE id = p_equipo;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_sprint_bloquear(p_equipo uuid, p_sprint uuid) RETURNS sprints AS $$
DECLARE s sprints;
BEGIN
  SELECT * INTO s FROM sprints WHERE id = p_sprint AND equipo_id = p_equipo FOR UPDATE;
  IF s.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese sprint.' USING ERRCODE = 'NX006', HINT = 'sprint_no_encontrado';
  END IF;
  RETURN s;
END $$ LANGUAGE plpgsql;

/**
 * Tareas del sprint: en vivo mientras está planificado o activo; el sprint cerrado conserva lo
 * que decía su última instantánea (las pendientes salen del sprint al cerrarlo).
 */
CREATE OR REPLACE FUNCTION fn_sprint_conteo(p_sprint uuid, p_estado estado_sprint) RETURNS jsonb AS $$
  SELECT CASE WHEN p_estado = 'cerrado' THEN
    coalesce((SELECT jsonb_build_object('total', i.total, 'completadas', i.completadas)
                FROM sprint_instantaneas i WHERE i.sprint_id = p_sprint ORDER BY i.dia DESC LIMIT 1),
             '{"total": 0, "completadas": 0}'::jsonb)
  ELSE
    (SELECT jsonb_build_object('total', count(*), 'completadas', count(*) FILTER (WHERE t.estado = 'completada'))
       FROM tareas t WHERE t.sprint_id = p_sprint AND NOT t.archivada)
  END;
$$ LANGUAGE sql STABLE;

/** Guarda (o actualiza) la instantánea de hoy: total y completadas del sprint, para el burndown. */
CREATE OR REPLACE FUNCTION fn_sprint_instantanea(p_sprint uuid) RETURNS void AS $$
DECLARE s sprints; v_c jsonb;
BEGIN
  SELECT * INTO s FROM sprints WHERE id = p_sprint;
  v_c := fn_sprint_conteo(s.id, 'activo');   -- siempre en vivo
  INSERT INTO sprint_instantaneas (sprint_id, dia, total, completadas)
  VALUES (s.id, fn_hoy_equipo(s.equipo_id), (v_c->>'total')::int, (v_c->>'completadas')::int)
  ON CONFLICT (sprint_id, dia) DO UPDATE SET total = EXCLUDED.total, completadas = EXCLUDED.completadas;
END $$ LANGUAGE plpgsql;

/** Resumen del sprint (`SprintResumen` de packages/shared): fechas, estado, avance y retrospectiva. */
CREATE OR REPLACE FUNCTION fn_sprint_json(s sprints) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
           'id', s.id, 'equipo_id', s.equipo_id, 'numero', s.numero, 'objetivo', s.objetivo,
           'inicio', to_char(s.inicio, 'YYYY-MM-DD'), 'fin', to_char(s.fin, 'YYYY-MM-DD'),
           'estado', s.estado, 'cerrado_en', fn_iso(s.cerrado_en))
         || fn_sprint_conteo(s.id, s.estado)
         || jsonb_build_object('retro',
              (SELECT jsonb_build_object('id', r.id, 'votacion_cerrada', r.votacion_cerrada, 'cerrada', r.cerrada)
                 FROM retrospectivas r WHERE r.sprint_id = s.id));
$$ LANGUAGE sql STABLE;

/**
 * Serie del burndown: las instantáneas guardadas y, mientras el sprint está activo, el punto de
 * hoy en vivo (así la gráfica no espera a la tarea nocturna).
 */
CREATE OR REPLACE FUNCTION fn_sprint_serie(s sprints) RETURNS jsonb AS $$
DECLARE v_hoy date := fn_hoy_equipo(s.equipo_id); v_serie jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('dia', to_char(i.dia, 'YYYY-MM-DD'),
                                               'total', i.total, 'completadas', i.completadas) ORDER BY i.dia),
                  '[]'::jsonb)
    INTO v_serie
    FROM sprint_instantaneas i
   WHERE i.sprint_id = s.id AND (s.estado <> 'activo' OR i.dia <> v_hoy);
  IF s.estado = 'activo' THEN
    v_serie := v_serie || jsonb_build_array(
      jsonb_build_object('dia', to_char(v_hoy, 'YYYY-MM-DD')) || fn_sprint_conteo(s.id, s.estado));
  END IF;
  RETURN v_serie;
END $$ LANGUAGE plpgsql STABLE;

/** Capacidad en horas de cada miembro activo del equipo (0 si no se definió) y sus tareas en el sprint. */
CREATE OR REPLACE FUNCTION fn_sprint_capacidad_json(s sprints) RETURNS jsonb AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id', u.id, 'nombre', u.nombre, 'color_idx', m.color_idx,
           'horas', coalesce(c.horas, 0),
           'tareas', (SELECT count(*) FROM tareas t
                       WHERE t.sprint_id = s.id AND t.responsable_id = u.id AND NOT t.archivada))
           ORDER BY m.color_idx, u.nombre), '[]'::jsonb)
    FROM membresias m
    JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN sprint_capacidad c ON c.sprint_id = s.id AND c.usuario_id = u.id
   WHERE m.equipo_id = s.equipo_id AND m.estado = 'activa' AND m.rol <> 'invitado';
$$ LANGUAGE sql STABLE;

/** Detalle del sprint (`SprintDetalle`): resumen, capacidad, burndown y tareas. */
CREATE OR REPLACE FUNCTION fn_sprint_detalle(p_sprint uuid) RETURNS jsonb AS $$
  SELECT fn_sprint_json(s)
         || jsonb_build_object(
              'capacidad', fn_sprint_capacidad_json(s),
              'serie', fn_sprint_serie(s),
              'tareas', (SELECT coalesce(jsonb_agg(fn_tarea_equipo_json(t.id) ORDER BY t.orden COLLATE "C", t.codigo),
                                         '[]'::jsonb)
                           FROM tareas t WHERE t.sprint_id = s.id AND NOT t.archivada))
    FROM sprints s WHERE s.id = p_sprint;
$$ LANGUAGE sql STABLE;

/** Estados de una tarea que pueden entrar a un sprint: las que aún no están en uno ni terminadas. */
CREATE OR REPLACE FUNCTION fn_estado_planeable(p_estado estado_tarea) RETURNS boolean AS $$
  SELECT p_estado IN ('backlog', 'aceptada', 'habilitada', 'en_curso', 'atascada');
$$ LANGUAGE sql IMMUTABLE;

/** Crea la retrospectiva del sprint si no existe y devuelve su id. */
CREATE OR REPLACE FUNCTION fn_retro_asegurar(p_equipo uuid, p_sprint uuid) RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO retrospectivas (equipo_id, sprint_id) VALUES (p_equipo, p_sprint)
  ON CONFLICT (sprint_id) DO NOTHING;
  SELECT id INTO v_id FROM retrospectivas WHERE sprint_id = p_sprint;
  RETURN v_id;
END $$ LANGUAGE plpgsql;

/**
 * Retrospectiva con sus notas para quien consulta. Las notas anónimas no traen autor; los votos
 * se cuentan por nota y cada persona solo sabe cuáles son suyos y cuántos le quedan.
 */
CREATE OR REPLACE FUNCTION fn_retro_detalle(p_actor uuid, p_retro uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
           'id', r.id, 'sprint_id', r.sprint_id, 'sprint_numero', s.numero,
           'votacion_cerrada', r.votacion_cerrada, 'cerrada', r.cerrada,
           'votos_por_persona', 3,
           'mis_votos_usados', (SELECT count(*) FROM retro_votos v JOIN retro_notas n ON n.id = v.nota_id
                                 WHERE n.retro_id = r.id AND v.usuario_id = p_actor),
           'notas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'id', n.id, 'columna', n.columna, 'texto', n.texto,
                        'anonima', n.autor_id IS NULL, 'mia', coalesce(n.autor_id = p_actor, false),
                        'autor', CASE WHEN n.autor_id IS NOT NULL THEN fn_persona_json(r.equipo_id, n.autor_id) END,
                        'grupo', n.grupo, 'tarea_id', n.tarea_id,
                        'votos', (SELECT count(*) FROM retro_votos v WHERE v.nota_id = n.id),
                        'voto_mio', EXISTS (SELECT 1 FROM retro_votos v WHERE v.nota_id = n.id AND v.usuario_id = p_actor),
                        'creada_en', fn_iso(n.creada_en)) ORDER BY n.creada_en, n.id), '[]'::jsonb)
                       FROM retro_notas n WHERE n.retro_id = r.id))
    FROM retrospectivas r JOIN sprints s ON s.id = r.sprint_id
   WHERE r.id = p_retro;
$$ LANGUAGE sql STABLE;

/** Bloquea una nota y comprueba que su retrospectiva es del equipo; si no, NX006. */
CREATE OR REPLACE FUNCTION fn_retro_nota_bloquear(p_equipo uuid, p_nota uuid) RETURNS retro_notas AS $$
DECLARE n retro_notas;
BEGIN
  SELECT rn.* INTO n FROM retro_notas rn JOIN retrospectivas r ON r.id = rn.retro_id
   WHERE rn.id = p_nota AND r.equipo_id = p_equipo FOR UPDATE OF rn;
  IF n.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa nota.' USING ERRCODE = 'NX006', HINT = 'nota_no_encontrada';
  END IF;
  RETURN n;
END $$ LANGUAGE plpgsql;

/** El líder modera la retrospectiva (matriz: `moderar_retro`), en un equipo activo. */
CREATE OR REPLACE FUNCTION fn_exigir_moderar_retro(p_actor uuid, p_equipo uuid) RETURNS void AS $$
BEGIN
  PERFORM fn_exigir_lider(p_actor, p_equipo, 'Solo el líder modera la retrospectiva.');
  PERFORM fn_exigir_equipo_activo(p_equipo);
END $$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 3. Procesos de lectura
-- ---------------------------------------------------------------------------------------------

/** Todos los sprints del equipo, el más reciente primero: plan, activo e historial (EQ-13). */
CREATE OR REPLACE FUNCTION proc_sprint_listar(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  RETURN (SELECT coalesce(jsonb_agg(fn_sprint_json(s) ORDER BY s.numero DESC), '[]'::jsonb)
            FROM sprints s WHERE s.equipo_id = p_equipo_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Detalle de un sprint; sin `p_sprint_id`, el sprint activo (o `null` si no hay) (EQ-09). */
CREATE OR REPLACE FUNCTION proc_sprint_obtener(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  IF p_sprint_id IS NULL THEN
    SELECT id INTO v_id FROM sprints WHERE equipo_id = p_equipo_id AND estado = 'activo';
    IF v_id IS NULL THEN RETURN NULL; END IF;
  ELSE
    SELECT id INTO v_id FROM sprints WHERE id = p_sprint_id AND equipo_id = p_equipo_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'No encontramos ese sprint.' USING ERRCODE = 'NX006', HINT = 'sprint_no_encontrado';
    END IF;
  END IF;
  RETURN fn_sprint_detalle(v_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Tareas que aún no están en ningún sprint y pueden entrar a uno al planear (EQ-10). */
CREATE OR REPLACE FUNCTION proc_sprint_disponibles(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  PERFORM fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  RETURN (SELECT coalesce(jsonb_agg(fn_tarea_equipo_json(t.id) ORDER BY t.codigo), '[]'::jsonb)
            FROM tareas t
           WHERE t.equipo_id = p_equipo_id AND t.sprint_id IS NULL AND NOT t.archivada
             AND fn_estado_planeable(t.estado));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 4. Planear, iniciar, cerrar y borrar un sprint (solo el líder)
-- ---------------------------------------------------------------------------------------------

/**
 * Crea un sprint planificado (`p_sprint_id` nulo) o cambia el plan de uno planificado: objetivo,
 * fechas, capacidad por persona y tareas. `p_datos` lleva solo lo que cambia; `capacidad` y
 * `tarea_ids` reemplazan la lista completa. Las tareas que salen del plan quedan sin sprint; las
 * del backlog que entran pasan a `aceptada`.
 */
CREATE OR REPLACE FUNCTION proc_sprint_planear(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid, p_datos jsonb)
RETURNS jsonb AS $$
DECLARE
  s          sprints;
  v_semanas  smallint;
  v_hoy      date := fn_hoy_equipo(p_equipo_id);
  v_inicio   date;
  v_fin      date;
  v_objetivo text;
  v_choque   integer;
  v_ids      uuid[];
  v_validas  integer;
  v_nuevo    boolean := p_sprint_id IS NULL;
  v_cap      jsonb;
  c          jsonb;
  r          record;
  v_quien    text := fn_primer_nombre(p_actor_id);
BEGIN
  PERFORM fn_exigir_gestion_sprints(p_actor_id, p_equipo_id);
  SELECT duracion_sprint_semanas INTO v_semanas FROM equipos WHERE id = p_equipo_id;

  IF v_nuevo THEN
    v_inicio := coalesce(nullif(p_datos->>'inicio', '')::date,
                         greatest(v_hoy, (SELECT max(fin) + 1 FROM sprints WHERE equipo_id = p_equipo_id)));
    v_objetivo := coalesce(p_datos->>'objetivo', '');
  ELSE
    s := fn_sprint_bloquear(p_equipo_id, p_sprint_id);
    IF s.estado <> 'planificado' THEN
      RAISE EXCEPTION 'Solo se puede cambiar el plan de un sprint planificado.'
        USING ERRCODE = 'NX007', HINT = 'sprint_no_planificado';
    END IF;
    v_inicio := coalesce(nullif(p_datos->>'inicio', '')::date, s.inicio);
    v_objetivo := coalesce(p_datos->>'objetivo', s.objetivo);
  END IF;
  v_fin := coalesce(nullif(p_datos->>'fin', '')::date,
                    CASE WHEN v_nuevo OR p_datos ? 'inicio' THEN v_inicio + 7 * v_semanas - 1 ELSE s.fin END);

  IF char_length(v_objetivo) > 300 THEN
    RAISE EXCEPTION 'El objetivo admite hasta 300 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_fin <= v_inicio THEN
    RAISE EXCEPTION 'El sprint debe terminar después de empezar.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT numero INTO v_choque FROM sprints
   WHERE equipo_id = p_equipo_id AND estado <> 'cerrado' AND id IS DISTINCT FROM p_sprint_id
     AND daterange(inicio, fin, '[]') && daterange(v_inicio, v_fin, '[]')
   LIMIT 1;
  IF v_choque IS NOT NULL THEN
    RAISE EXCEPTION 'Las fechas se cruzan con las del Sprint %.', v_choque
      USING ERRCODE = 'NX010', HINT = 'fechas_cruzadas';
  END IF;

  IF v_nuevo THEN
    INSERT INTO sprints (equipo_id, numero, objetivo, inicio, fin)
    VALUES (p_equipo_id, coalesce((SELECT max(numero) FROM sprints WHERE equipo_id = p_equipo_id), 0) + 1,
            v_objetivo, v_inicio, v_fin)
    RETURNING * INTO s;
  ELSE
    UPDATE sprints SET objetivo = v_objetivo, inicio = v_inicio, fin = v_fin WHERE id = s.id;
  END IF;

  -- Capacidad: horas por integrante activo.
  IF p_datos ? 'capacidad' THEN
    v_cap := p_datos->'capacidad';
    FOR c IN SELECT * FROM jsonb_array_elements(v_cap) LOOP
      IF NOT EXISTS (SELECT 1 FROM membresias m
                      WHERE m.equipo_id = p_equipo_id AND m.usuario_id = (c->>'usuario_id')::uuid
                        AND m.estado = 'activa' AND m.rol <> 'invitado') THEN
        RAISE EXCEPTION 'La capacidad solo se define para miembros del equipo.'
          USING ERRCODE = 'NX010', HINT = 'responsable_invalido';
      END IF;
      IF coalesce((c->>'horas')::int, -1) NOT BETWEEN 0 AND 300 THEN
        RAISE EXCEPTION 'Las horas de capacidad van de 0 a 300.' USING ERRCODE = 'NX010', HINT = 'validacion';
      END IF;
    END LOOP;
    DELETE FROM sprint_capacidad WHERE sprint_id = s.id;
    INSERT INTO sprint_capacidad (sprint_id, usuario_id, horas)
    SELECT DISTINCT ON ((x->>'usuario_id')::uuid) s.id, (x->>'usuario_id')::uuid, (x->>'horas')::smallint
      FROM jsonb_array_elements(v_cap) x;
  END IF;

  -- Tareas del plan.
  IF p_datos ? 'tarea_ids' THEN
    SELECT coalesce(array_agg(DISTINCT x::uuid), '{}') INTO v_ids FROM jsonb_array_elements_text(p_datos->'tarea_ids') x;
    PERFORM 1 FROM tareas WHERE id = ANY (v_ids) FOR UPDATE;
    SELECT count(*) INTO v_validas FROM tareas t
     WHERE t.id = ANY (v_ids) AND t.equipo_id = p_equipo_id AND NOT t.archivada
       AND (t.sprint_id IS NULL OR t.sprint_id = s.id) AND fn_estado_planeable(t.estado);
    IF v_validas <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Alguna tarea ya no está disponible para el sprint. Recarga el plan.'
        USING ERRCODE = 'NX012', HINT = 'tarea_no_disponible';
    END IF;
    UPDATE tareas SET sprint_id = NULL WHERE sprint_id = s.id AND NOT (id = ANY (v_ids));
    FOR r IN SELECT t.id, t.codigo, t.titulo, t.estado, t.sprint_id FROM tareas t
              WHERE t.id = ANY (v_ids) ORDER BY t.codigo LOOP
      CONTINUE WHEN r.sprint_id = s.id;
      IF r.estado = 'backlog' THEN
        UPDATE tareas SET sprint_id = s.id, estado = 'aceptada',
               orden = fn_orden_al_final(p_equipo_id, 'aceptada', r.id)
         WHERE id = r.id;
      ELSE
        UPDATE tareas SET sprint_id = s.id WHERE id = r.id;
      END IF;
      PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.sprint_asignado', 'tarea', r.id,
        jsonb_build_object('sprint_id', s.id, 'sprint_numero', s.numero),
        v_quien || ' puso ' || fn_codigo_tarea(r.codigo) || ' «' || r.titulo || '» en el Sprint ' || s.numero);
    END LOOP;
  END IF;

  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN v_nuevo THEN 'sprint.planeado' ELSE 'sprint.plan_actualizado' END, 'sprint', s.id,
    jsonb_build_object('numero', s.numero, 'inicio', v_inicio, 'fin', v_fin,
                       'tareas', (SELECT count(*) FROM tareas WHERE sprint_id = s.id),
                       'horas', coalesce((SELECT sum(horas) FROM sprint_capacidad WHERE sprint_id = s.id), 0)),
    v_quien || CASE WHEN v_nuevo THEN ' planeó el Sprint ' ELSE ' cambió el plan del Sprint ' END || s.numero
      || ' (' || (SELECT count(*) FROM tareas WHERE sprint_id = s.id) || ' tareas)');
  RETURN fn_sprint_detalle(s.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Inicia un sprint planificado. Solo puede haber uno activo por equipo (EQ-09). */
CREATE OR REPLACE FUNCTION proc_sprint_iniciar(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid) RETURNS jsonb AS $$
DECLARE s sprints; v_activo integer;
BEGIN
  PERFORM fn_exigir_gestion_sprints(p_actor_id, p_equipo_id);
  s := fn_sprint_bloquear(p_equipo_id, p_sprint_id);
  IF s.estado <> 'planificado' THEN
    RAISE EXCEPTION 'Este sprint ya no está planificado.' USING ERRCODE = 'NX007', HINT = 'sprint_no_planificado';
  END IF;
  SELECT numero INTO v_activo FROM sprints WHERE equipo_id = p_equipo_id AND estado = 'activo';
  IF v_activo IS NOT NULL THEN
    RAISE EXCEPTION 'El Sprint % sigue activo. Ciérralo antes de iniciar otro.', v_activo
      USING ERRCODE = 'NX012', HINT = 'sprint_activo_existente';
  END IF;
  UPDATE sprints SET estado = 'activo' WHERE id = s.id;
  PERFORM fn_sprint_instantanea(s.id);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'sprint.iniciado', 'sprint', s.id,
    jsonb_build_object('numero', s.numero) || fn_sprint_conteo(s.id, 'activo'),
    fn_primer_nombre(p_actor_id) || ' inició el Sprint ' || s.numero);
  RETURN fn_sprint_detalle(s.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Cierra el sprint activo (EQ-11): guarda la instantánea final, crea la retrospectiva y decide el
 * destino de las tareas sin terminar: `siguiente` (pasan al sprint planificado más próximo) o
 * `liberar` (quedan sin sprint y pueden planearse después). Las completadas se quedan en el sprint.
 */
CREATE OR REPLACE FUNCTION proc_sprint_cerrar(
  p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid, p_pendientes text DEFAULT 'liberar'
) RETURNS jsonb AS $$
DECLARE s sprints; v_pend integer; v_sig uuid; v_c jsonb;
BEGIN
  PERFORM fn_exigir_gestion_sprints(p_actor_id, p_equipo_id);
  s := fn_sprint_bloquear(p_equipo_id, p_sprint_id);
  IF s.estado <> 'activo' THEN
    RAISE EXCEPTION 'Solo se puede cerrar el sprint activo.' USING ERRCODE = 'NX007', HINT = 'sprint_no_activo';
  END IF;
  IF p_pendientes NOT IN ('siguiente', 'liberar') THEN
    RAISE EXCEPTION 'El destino de las tareas pendientes no es válido.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT count(*) INTO v_pend FROM tareas WHERE sprint_id = s.id AND estado <> 'completada';
  IF p_pendientes = 'siguiente' AND v_pend > 0 THEN
    SELECT id INTO v_sig FROM sprints WHERE equipo_id = p_equipo_id AND estado = 'planificado' ORDER BY numero LIMIT 1;
    IF v_sig IS NULL THEN
      RAISE EXCEPTION 'No hay un sprint planificado para recibir las tareas pendientes.'
        USING ERRCODE = 'NX007', HINT = 'sin_sprint_siguiente';
    END IF;
  END IF;

  PERFORM fn_sprint_instantanea(s.id);   -- la foto final, antes de mover las pendientes
  UPDATE tareas SET sprint_id = v_sig WHERE sprint_id = s.id AND estado <> 'completada';
  UPDATE sprints SET estado = 'cerrado', cerrado_en = now() WHERE id = s.id;
  PERFORM fn_retro_asegurar(p_equipo_id, s.id);
  v_c := fn_sprint_conteo(s.id, 'cerrado');
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'sprint.cerrado', 'sprint', s.id,
    jsonb_build_object('numero', s.numero, 'pendientes', v_pend, 'destino', p_pendientes) || v_c,
    fn_primer_nombre(p_actor_id) || ' cerró el Sprint ' || s.numero || ': '
      || (v_c->>'completadas') || ' de ' || (v_c->>'total') || ' tareas completadas');
  RETURN fn_sprint_detalle(s.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Borra un sprint planificado; sus tareas quedan sin sprint. */
CREATE OR REPLACE FUNCTION proc_sprint_eliminar(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid) RETURNS jsonb AS $$
DECLARE s sprints;
BEGIN
  PERFORM fn_exigir_gestion_sprints(p_actor_id, p_equipo_id);
  s := fn_sprint_bloquear(p_equipo_id, p_sprint_id);
  IF s.estado <> 'planificado' THEN
    RAISE EXCEPTION 'Solo se puede borrar un sprint planificado.' USING ERRCODE = 'NX007', HINT = 'sprint_no_planificado';
  END IF;
  UPDATE tareas SET sprint_id = NULL WHERE sprint_id = s.id;
  DELETE FROM sprints WHERE id = s.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'sprint.eliminado', 'sprint', s.id,
    jsonb_build_object('numero', s.numero), fn_primer_nombre(p_actor_id) || ' borró el plan del Sprint ' || s.numero);
  RETURN jsonb_build_object('eliminado', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 5. Retrospectiva (EQ-12)
-- ---------------------------------------------------------------------------------------------

/** El líder abre la retrospectiva de un sprint cerrado que aún no tiene (al cerrar se crea sola). */
CREATE OR REPLACE FUNCTION proc_retro_iniciar(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid) RETURNS jsonb AS $$
DECLARE s sprints; v_existia boolean; v_id uuid;
BEGIN
  PERFORM fn_exigir_moderar_retro(p_actor_id, p_equipo_id);
  s := fn_sprint_bloquear(p_equipo_id, p_sprint_id);
  IF s.estado <> 'cerrado' THEN
    RAISE EXCEPTION 'La retrospectiva se hace con el sprint cerrado.' USING ERRCODE = 'NX007', HINT = 'sprint_no_cerrado';
  END IF;
  v_existia := EXISTS (SELECT 1 FROM retrospectivas WHERE sprint_id = s.id);
  v_id := fn_retro_asegurar(p_equipo_id, s.id);
  IF NOT v_existia THEN
    PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'sprint.retro_iniciada', 'retro', v_id,
      jsonb_build_object('sprint_id', s.id, 'numero', s.numero),
      fn_primer_nombre(p_actor_id) || ' abrió la retrospectiva del Sprint ' || s.numero);
  END IF;
  RETURN fn_retro_detalle(p_actor_id, v_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Retrospectiva del sprint con sus notas, o `null` si todavía no existe. */
CREATE OR REPLACE FUNCTION proc_retro_obtener(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid) RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  IF NOT EXISTS (SELECT 1 FROM sprints WHERE id = p_sprint_id AND equipo_id = p_equipo_id) THEN
    RAISE EXCEPTION 'No encontramos ese sprint.' USING ERRCODE = 'NX006', HINT = 'sprint_no_encontrado';
  END IF;
  SELECT id INTO v_id FROM retrospectivas WHERE sprint_id = p_sprint_id;
  RETURN CASE WHEN v_id IS NULL THEN NULL ELSE fn_retro_detalle(p_actor_id, v_id) END;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Agrega una nota (Bien, Mejorar o Acciones). Una nota anónima no guarda quién la escribió, ni en
 * la tabla ni en la actividad. Solo mientras la votación sigue abierta.
 */
CREATE OR REPLACE FUNCTION proc_retro_nota_agregar(
  p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid, p_columna text, p_texto text, p_anonima boolean DEFAULT false
) RETURNS jsonb AS $$
DECLARE r retrospectivas; v_texto text := btrim(coalesce(p_texto, '')); v_id uuid;
BEGIN
  PERFORM fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  SELECT * INTO r FROM retrospectivas WHERE sprint_id = p_sprint_id AND equipo_id = p_equipo_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa retrospectiva.' USING ERRCODE = 'NX006', HINT = 'retro_no_encontrada';
  END IF;
  IF r.votacion_cerrada OR r.cerrada THEN
    RAISE EXCEPTION 'La retrospectiva ya no admite notas.' USING ERRCODE = 'NX007', HINT = 'retro_cerrada';
  END IF;
  IF p_columna NOT IN ('bien', 'mejorar', 'acciones') OR char_length(v_texto) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Escribe la nota (hasta 500 caracteres) y elige su columna.'
      USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  INSERT INTO retro_notas (retro_id, columna, texto, autor_id)
  VALUES (r.id, p_columna::columna_retro, v_texto, CASE WHEN p_anonima THEN NULL ELSE p_actor_id END)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Elimina una nota: su autora (antes de cerrar la votación) o el líder (hasta cerrar la retrospectiva). */
CREATE OR REPLACE FUNCTION proc_retro_nota_eliminar(p_actor_id uuid, p_equipo_id uuid, p_nota_id uuid) RETURNS jsonb AS $$
DECLARE v_rol rol_membresia; n retro_notas; r retrospectivas;
BEGIN
  v_rol := fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  n := fn_retro_nota_bloquear(p_equipo_id, p_nota_id);
  SELECT * INTO r FROM retrospectivas WHERE id = n.retro_id FOR UPDATE;
  IF r.cerrada THEN
    RAISE EXCEPTION 'La retrospectiva ya está cerrada.' USING ERRCODE = 'NX007', HINT = 'retro_cerrada';
  END IF;
  IF NOT (v_rol = 'lider' OR coalesce(n.autor_id = p_actor_id AND NOT r.votacion_cerrada, false)) THEN
    RAISE EXCEPTION 'Solo quien escribió la nota o el líder pueden eliminarla.'
      USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  DELETE FROM retro_notas WHERE id = n.id;
  RETURN jsonb_build_object('eliminada', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Pone (`p_dar` verdadero) o quita un punto de voto en una nota. Cada persona tiene 3 por
 * retrospectiva: el cuarto lo rechaza la BD con NX003 (disparador `trg_retro_limite_votos`).
 */
CREATE OR REPLACE FUNCTION proc_retro_votar(p_actor_id uuid, p_equipo_id uuid, p_nota_id uuid, p_dar boolean DEFAULT true)
RETURNS jsonb AS $$
DECLARE n retro_notas; r retrospectivas; v_usados integer;
BEGIN
  PERFORM fn_exigir_ve_sprints(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  n := fn_retro_nota_bloquear(p_equipo_id, p_nota_id);
  SELECT * INTO r FROM retrospectivas WHERE id = n.retro_id FOR UPDATE;
  IF r.votacion_cerrada OR r.cerrada THEN
    RAISE EXCEPTION 'La votación ya se cerró.' USING ERRCODE = 'NX007', HINT = 'retro_cerrada';
  END IF;
  SELECT count(*) INTO v_usados FROM retro_votos v JOIN retro_notas rn ON rn.id = v.nota_id
   WHERE rn.retro_id = r.id AND v.usuario_id = p_actor_id;
  IF p_dar THEN
    IF EXISTS (SELECT 1 FROM retro_votos WHERE nota_id = n.id AND usuario_id = p_actor_id) THEN
      RAISE EXCEPTION 'Ya votaste esta nota.' USING ERRCODE = 'NX012', HINT = 'voto_repetido';
    END IF;
    IF v_usados >= 3 THEN
      RAISE EXCEPTION 'Ya usaste tus 3 votos en esta retrospectiva.' USING ERRCODE = 'NX003', HINT = 'limite_votos';
    END IF;
    INSERT INTO retro_votos (nota_id, usuario_id) VALUES (n.id, p_actor_id);
    v_usados := v_usados + 1;
  ELSE
    DELETE FROM retro_votos WHERE nota_id = n.id AND usuario_id = p_actor_id;
    IF FOUND THEN v_usados := v_usados - 1; END IF;
  END IF;
  RETURN jsonb_build_object(
    'nota_id', n.id,
    'votos', (SELECT count(*) FROM retro_votos WHERE nota_id = n.id),
    'voto_mio', EXISTS (SELECT 1 FROM retro_votos WHERE nota_id = n.id AND usuario_id = p_actor_id),
    'mis_votos_usados', v_usados);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder cierra la votación (`votacion`) o toda la retrospectiva (`cerrada`). */
CREATE OR REPLACE FUNCTION proc_retro_avanzar(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid, p_fase text)
RETURNS jsonb AS $$
DECLARE r retrospectivas; v_numero integer;
BEGIN
  PERFORM fn_exigir_moderar_retro(p_actor_id, p_equipo_id);
  IF p_fase NOT IN ('votacion', 'cerrada') THEN
    RAISE EXCEPTION 'La fase de la retrospectiva no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  SELECT * INTO r FROM retrospectivas WHERE sprint_id = p_sprint_id AND equipo_id = p_equipo_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa retrospectiva.' USING ERRCODE = 'NX006', HINT = 'retro_no_encontrada';
  END IF;
  IF r.cerrada OR (p_fase = 'votacion' AND r.votacion_cerrada) THEN
    RAISE EXCEPTION 'Esa fase de la retrospectiva ya se cerró.' USING ERRCODE = 'NX007', HINT = 'retro_cerrada';
  END IF;
  UPDATE retrospectivas SET votacion_cerrada = true, cerrada = (p_fase = 'cerrada') WHERE id = r.id;
  SELECT numero INTO v_numero FROM sprints WHERE id = r.sprint_id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN p_fase = 'cerrada' THEN 'sprint.retro_cerrada' ELSE 'sprint.retro_votacion_cerrada' END,
    'retro', r.id, jsonb_build_object('sprint_id', r.sprint_id, 'numero', v_numero),
    fn_primer_nombre(p_actor_id) || CASE WHEN p_fase = 'cerrada'
      THEN ' cerró la retrospectiva del Sprint ' ELSE ' cerró la votación de la retrospectiva del Sprint ' END || v_numero);
  RETURN fn_retro_detalle(p_actor_id, r.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder convierte una nota en una propuesta de tarea (va a votación, DEC-024). */
CREATE OR REPLACE FUNCTION proc_retro_nota_a_tarea(p_actor_id uuid, p_equipo_id uuid, p_nota_id uuid) RETURNS jsonb AS $$
DECLARE n retro_notas; r retrospectivas; t tareas; v_numero integer; v_titulo text;
BEGIN
  PERFORM fn_exigir_moderar_retro(p_actor_id, p_equipo_id);
  n := fn_retro_nota_bloquear(p_equipo_id, p_nota_id);
  SELECT * INTO r FROM retrospectivas WHERE id = n.retro_id FOR UPDATE;
  IF n.tarea_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta nota ya se convirtió en tarea.' USING ERRCODE = 'NX012', HINT = 'nota_ya_convertida';
  END IF;
  SELECT numero INTO v_numero FROM sprints WHERE id = r.sprint_id;
  v_titulo := CASE WHEN char_length(n.texto) > 140 THEN left(n.texto, 139) || '…' ELSE n.texto END;
  t := fn_tarea_insertar_propuesta(p_actor_id, p_equipo_id, jsonb_build_object(
         'titulo', v_titulo,
         'descripcion', 'Nace de la retrospectiva del Sprint ' || v_numero || ': ' || n.texto));
  UPDATE retro_notas SET tarea_id = t.id WHERE id = n.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN t.estado = 'propuesta' THEN 'tarea.propuesta' ELSE 'tarea.creada' END, 'tarea', t.id,
    jsonb_build_object('estado', t.estado, 'retro_id', r.id, 'sprint_numero', v_numero),
    fn_primer_nombre(p_actor_id) || ' propuso ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo
      || '» desde la retrospectiva del Sprint ' || v_numero);
  RETURN jsonb_build_object('id', t.id, 'codigo', t.codigo, 'estado', t.estado);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 6. El tablero ya no muestra las tareas de sprints cerrados (siguen en el historial del sprint)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_tarea_de_sprint_cerrado(p_sprint uuid) RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM sprints WHERE id = p_sprint AND estado = 'cerrado');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION proc_tarea_listar(p_actor_id uuid, p_equipo_id uuid, p_vista text DEFAULT 'tablero')
RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia; v_con_votacion boolean;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF p_vista NOT IN ('tablero', 'backlog', 'votacion', 'mias', 'todas') THEN
    RAISE EXCEPTION 'La vista no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_rol = 'invitado' AND p_vista IN ('backlog', 'votacion', 'mias') THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  v_con_votacion := p_vista IN ('votacion', 'mias') AND v_rol <> 'invitado';
  RETURN (
    SELECT coalesce(jsonb_agg(
             fn_tarea_equipo_json(t.id)
               || CASE WHEN v_con_votacion THEN jsonb_build_object('votacion',
                    CASE WHEN t.origen = 'propuesta' THEN fn_votacion_resumen(t.id, p_actor_id) END)
                  ELSE '{}'::jsonb END
             ORDER BY t.orden COLLATE "C", t.codigo), '[]'::jsonb)
      FROM tareas t
     WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
       AND (v_rol <> 'invitado' OR EXISTS (
              SELECT 1 FROM tarea_compartida tc WHERE tc.tarea_id = t.id AND tc.membresia_id = v_membresia))
       AND CASE p_vista
             WHEN 'tablero'  THEN t.estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada', 'completada')
                               AND NOT fn_tarea_de_sprint_cerrado(t.sprint_id)
             WHEN 'backlog'  THEN t.estado = 'backlog'
             WHEN 'votacion' THEN t.estado IN ('propuesta', 'rechazada', 'cancelada')
             WHEN 'mias'     THEN t.estado = 'propuesta' OR EXISTS (
                                    SELECT 1 FROM tarea_votos v WHERE v.tarea_id = t.id AND v.usuario_id = p_actor_id)
             ELSE true
           END);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Conteos para las pestañas de tareas: tablero, backlog y propuestas abiertas en votación. */
CREATE OR REPLACE FUNCTION proc_tarea_conteos(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'tablero',  count(*) FILTER (WHERE estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada', 'completada')
                                     AND NOT fn_tarea_de_sprint_cerrado(sprint_id)),
      'backlog',  count(*) FILTER (WHERE estado = 'backlog'),
      'votacion', count(*) FILTER (WHERE estado = 'propuesta'))
      FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
-- proc_tarea_listar y proc_tarea_conteos vuelven a la versión de la 0006.
CREATE OR REPLACE FUNCTION proc_tarea_listar(p_actor_id uuid, p_equipo_id uuid, p_vista text DEFAULT 'tablero')
RETURNS jsonb AS $$
DECLARE v_membresia uuid; v_rol rol_membresia; v_con_votacion boolean;
BEGIN
  SELECT membresia_id, rol INTO v_membresia, v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF p_vista NOT IN ('tablero', 'backlog', 'votacion', 'mias', 'todas') THEN
    RAISE EXCEPTION 'La vista no es válida.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF v_rol = 'invitado' AND p_vista IN ('backlog', 'votacion', 'mias') THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  v_con_votacion := p_vista IN ('votacion', 'mias') AND v_rol <> 'invitado';
  RETURN (
    SELECT coalesce(jsonb_agg(
             fn_tarea_equipo_json(t.id)
               || CASE WHEN v_con_votacion THEN jsonb_build_object('votacion',
                    CASE WHEN t.origen = 'propuesta' THEN fn_votacion_resumen(t.id, p_actor_id) END)
                  ELSE '{}'::jsonb END
             ORDER BY t.orden COLLATE "C", t.codigo), '[]'::jsonb)
      FROM tareas t
     WHERE t.equipo_id = p_equipo_id AND NOT t.archivada
       AND (v_rol <> 'invitado' OR EXISTS (
              SELECT 1 FROM tarea_compartida tc WHERE tc.tarea_id = t.id AND tc.membresia_id = v_membresia))
       AND CASE p_vista
             WHEN 'tablero'  THEN t.estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada', 'completada')
             WHEN 'backlog'  THEN t.estado = 'backlog'
             WHEN 'votacion' THEN t.estado IN ('propuesta', 'rechazada', 'cancelada')
             WHEN 'mias'     THEN t.estado = 'propuesta' OR EXISTS (
                                    SELECT 1 FROM tarea_votos v WHERE v.tarea_id = t.id AND v.usuario_id = p_actor_id)
             ELSE true
           END);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Conteos para las pestañas de tareas: tablero, backlog y propuestas abiertas en votación. */
CREATE OR REPLACE FUNCTION proc_tarea_conteos(p_actor_id uuid, p_equipo_id uuid) RETURNS jsonb AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor_id, p_equipo_id)) = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven los sprints.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'tablero',  count(*) FILTER (WHERE estado IN ('aceptada', 'habilitada', 'en_curso', 'atascada', 'completada')),
      'backlog',  count(*) FILTER (WHERE estado = 'backlog'),
      'votacion', count(*) FILTER (WHERE estado = 'propuesta'))
      FROM tareas WHERE equipo_id = p_equipo_id AND NOT archivada);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
DROP FUNCTION IF EXISTS fn_tarea_de_sprint_cerrado(uuid);
DROP FUNCTION IF EXISTS proc_retro_nota_a_tarea(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_retro_avanzar(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_retro_votar(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS proc_retro_nota_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_retro_nota_agregar(uuid, uuid, uuid, text, text, boolean);
DROP FUNCTION IF EXISTS proc_retro_obtener(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_retro_iniciar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_sprint_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_sprint_cerrar(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS proc_sprint_iniciar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_sprint_planear(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_sprint_disponibles(uuid, uuid);
DROP FUNCTION IF EXISTS proc_sprint_obtener(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_sprint_listar(uuid, uuid);
DROP FUNCTION IF EXISTS fn_exigir_moderar_retro(uuid, uuid);
DROP FUNCTION IF EXISTS fn_retro_nota_bloquear(uuid, uuid);
DROP FUNCTION IF EXISTS fn_retro_detalle(uuid, uuid);
DROP FUNCTION IF EXISTS fn_retro_asegurar(uuid, uuid);
DROP FUNCTION IF EXISTS fn_estado_planeable(estado_tarea);
DROP FUNCTION IF EXISTS fn_sprint_detalle(uuid);
DROP FUNCTION IF EXISTS fn_sprint_capacidad_json(sprints);
DROP FUNCTION IF EXISTS fn_sprint_serie(sprints);
DROP FUNCTION IF EXISTS fn_sprint_json(sprints);
DROP FUNCTION IF EXISTS fn_sprint_instantanea(uuid);
DROP FUNCTION IF EXISTS fn_sprint_conteo(uuid, estado_sprint);
DROP FUNCTION IF EXISTS fn_sprint_bloquear(uuid, uuid);
DROP FUNCTION IF EXISTS fn_hoy_equipo(uuid);
DROP FUNCTION IF EXISTS fn_exigir_gestion_sprints(uuid, uuid);
DROP FUNCTION IF EXISTS fn_exigir_ve_sprints(uuid, uuid);
-- fn_registrar_evento vuelve a la versión de la 0006 (todo lo que no es tarea es de tipo «equipo»).
CREATE OR REPLACE FUNCTION fn_registrar_evento(
  p_equipo uuid, p_actor uuid, p_tipo text, p_objeto_tipo text, p_objeto_id uuid,
  p_carga jsonb, p_resumen text
) RETURNS void AS $$
DECLARE
  v_categoria text := split_part(p_tipo, '.', 1);
  v_accion    text := coalesce(nullif(split_part(p_tipo, '.', 2), ''), 'cambio');
  v_ahora     timestamptz := clock_timestamp();
BEGIN
  INSERT INTO eventos_dominio (equipo_id, tipo, objeto_tipo, objeto_id, actor_id, carga, creado_en)
  VALUES (p_equipo, p_tipo, p_objeto_tipo, p_objeto_id, p_actor, coalesce(p_carga, '{}'::jsonb), v_ahora);
  INSERT INTO actividad (equipo_id, autor_id, tipo, accion, objeto_tipo, objeto_id, resumen, detalle, creado_en)
  VALUES (p_equipo, p_actor, CASE WHEN v_categoria = 'tarea' THEN 'tarea' ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb), v_ahora);
END $$ LANGUAGE plpgsql;
