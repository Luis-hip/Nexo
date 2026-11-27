-- Plan del sprint congelado al iniciarlo (retroalimentación de la profesora, bloque 6b; DEC-042).
-- La «Expectativa» del burndown deja de ser una recta: baja 1 cuando llega el término planificado
-- de cada tarea. El término es el `vence_en` que la tarea tenía AL INICIAR el sprint; si después se
-- edita la fecha, o se agregan tareas, el plan no cambia. Las tareas sin fecha de entrega se planean
-- para el último día del sprint, y las que vencían después del fin también (y se avisa).
-- Las tareas no tienen inicio ni duración propios: se asume que empiezan al inicio del sprint.
-- Aditiva: tabla nueva; `proc_sprint_iniciar` y `fn_sprint_detalle` se reemplazan. Pruebas: P264–P266.

-- Up Migration

CREATE TABLE sprint_plan_tareas (
  sprint_id           uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  tarea_id            uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  termino_planificado timestamptz,                         -- `vence_en` al iniciar; NULL = sin fecha
  congelado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sprint_id, tarea_id)
);

/** Congela el plan: cada tarea del sprint con su fecha de entrega de ese momento. Idempotente. */
CREATE OR REPLACE FUNCTION fn_sprint_plan_congelar(p_sprint uuid) RETURNS void AS $$
  INSERT INTO sprint_plan_tareas (sprint_id, tarea_id, termino_planificado)
  SELECT p_sprint, t.id, t.vence_en
    FROM tareas t
   WHERE t.sprint_id = p_sprint AND NOT t.archivada
  ON CONFLICT (sprint_id, tarea_id) DO NOTHING;
$$ LANGUAGE sql;

/**
 * Expectativa del burndown a partir del plan congelado, o `null` si el sprint no tiene plan.
 * Cada tarea baja al terminar su día de término (zona horaria del equipo); las que terminan el
 * mismo día bajan juntas. Sin fecha, o con término después del fin, bajan al terminar el último
 * día; con término antes del inicio, desde el inicio. Así la línea llega a 0 al final del sprint.
 * `{ inicial, sin_fecha, despues_del_fin, pasos: [{ momento, tareas }] }`.
 */
CREATE OR REPLACE FUNCTION fn_sprint_expectativa(s sprints) RETURNS jsonb AS $$
  WITH lim AS (
    SELECT e.zona_horaria AS z,
           (s.inicio::timestamp AT TIME ZONE e.zona_horaria) AS t0,
           ((s.fin + 1)::timestamp AT TIME ZONE e.zona_horaria) AS tfin
      FROM equipos e WHERE e.id = s.equipo_id
  ), plan AS (
    SELECT p.termino_planificado AS tp,
           CASE WHEN p.termino_planificado IS NULL OR p.termino_planificado >= l.tfin THEN l.tfin
                ELSE greatest(l.t0, (((p.termino_planificado AT TIME ZONE l.z)::date + 1)::timestamp AT TIME ZONE l.z))
           END AS momento,
           l.tfin
      FROM sprint_plan_tareas p CROSS JOIN lim l
     WHERE p.sprint_id = s.id
  ), pasos AS (
    SELECT momento, count(*) AS tareas FROM plan GROUP BY momento
  )
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
           'inicial', count(*),
           'sin_fecha', count(*) FILTER (WHERE tp IS NULL),
           'despues_del_fin', count(*) FILTER (WHERE tp >= tfin),
           'pasos', (SELECT jsonb_agg(jsonb_build_object('momento', fn_iso(momento), 'tareas', tareas)
                                      ORDER BY momento) FROM pasos))
         END
    FROM plan;
$$ LANGUAGE sql STABLE;

/** Detalle del sprint (`SprintDetalle`): resumen, capacidad, burndown (con su expectativa) y tareas. */
CREATE OR REPLACE FUNCTION fn_sprint_detalle(p_sprint uuid) RETURNS jsonb AS $$
  SELECT fn_sprint_json(s)
         || jsonb_build_object(
              'capacidad', fn_sprint_capacidad_json(s),
              'serie', fn_sprint_serie(s),
              'expectativa', fn_sprint_expectativa(s),
              'tareas', (SELECT coalesce(jsonb_agg(fn_tarea_equipo_json(t.id) ORDER BY t.orden COLLATE "C", t.codigo),
                                         '[]'::jsonb)
                           FROM tareas t WHERE t.sprint_id = s.id AND NOT t.archivada))
    FROM sprints s WHERE s.id = p_sprint;
$$ LANGUAGE sql STABLE;

/**
 * Inicia un sprint planificado. Solo puede haber uno activo por equipo (EQ-09). Si se inicia
 * antes de su fecha, se recorre a hoy y conserva su duración; si su plazo ya pasó, hay que
 * cambiar las fechas primero. Congela el plan de sus tareas para la Expectativa del burndown.
 */
CREATE OR REPLACE FUNCTION proc_sprint_iniciar(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid) RETURNS jsonb AS $$
DECLARE s sprints; v_activo integer; v_hoy date := fn_hoy_equipo(p_equipo_id);
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
  IF s.fin < v_hoy THEN
    RAISE EXCEPTION 'El plazo de este sprint ya pasó: cambia sus fechas antes de iniciarlo.'
      USING ERRCODE = 'NX010', HINT = 'fechas_vencidas';
  END IF;
  UPDATE sprints SET estado = 'activo',
         inicio = least(inicio, v_hoy),
         fin    = CASE WHEN inicio > v_hoy THEN fin - (inicio - v_hoy) ELSE fin END
   WHERE id = s.id;
  PERFORM fn_sprint_instantanea(s.id);
  PERFORM fn_sprint_plan_congelar(s.id);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'sprint.iniciado', 'sprint', s.id,
    jsonb_build_object('numero', s.numero) || fn_sprint_conteo(s.id, 'activo'),
    fn_primer_nombre(p_actor_id) || ' inició el Sprint ' || s.numero);
  RETURN fn_sprint_detalle(s.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Sprints que ya estaban activos: no hay foto del inicio, así que se congela lo que tienen hoy
-- (sus tareas y fechas actuales). Es la mejor aproximación posible; los cerrados quedan sin plan.
SELECT fn_sprint_plan_congelar(id) FROM sprints WHERE estado = 'activo';

SELECT fn_conceder_procesos();

-- Down Migration

CREATE OR REPLACE FUNCTION proc_sprint_iniciar(p_actor_id uuid, p_equipo_id uuid, p_sprint_id uuid) RETURNS jsonb AS $$
DECLARE s sprints; v_activo integer; v_hoy date := fn_hoy_equipo(p_equipo_id);
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
  IF s.fin < v_hoy THEN
    RAISE EXCEPTION 'El plazo de este sprint ya pasó: cambia sus fechas antes de iniciarlo.'
      USING ERRCODE = 'NX010', HINT = 'fechas_vencidas';
  END IF;
  UPDATE sprints SET estado = 'activo',
         inicio = least(inicio, v_hoy),
         fin    = CASE WHEN inicio > v_hoy THEN fin - (inicio - v_hoy) ELSE fin END
   WHERE id = s.id;
  PERFORM fn_sprint_instantanea(s.id);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'sprint.iniciado', 'sprint', s.id,
    jsonb_build_object('numero', s.numero) || fn_sprint_conteo(s.id, 'activo'),
    fn_primer_nombre(p_actor_id) || ' inició el Sprint ' || s.numero);
  RETURN fn_sprint_detalle(s.id);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

DROP FUNCTION IF EXISTS fn_sprint_expectativa(sprints);
DROP FUNCTION IF EXISTS fn_sprint_plan_congelar(uuid);
DROP TABLE IF EXISTS sprint_plan_tareas;
