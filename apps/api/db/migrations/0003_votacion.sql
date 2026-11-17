-- Fase 2.5 · Votación de propuestas (DEC-024) y primeros procesos de la BD (DEC-025).
-- Documentación de cada proceso: docs/08_Procesos_BD.md. Pruebas: db/tests/pruebas_procesos.sql.
--
-- Convención de errores de los procesos: SQLSTATE NX0xx + MESSAGE (texto para el usuario)
-- + HINT (código de la API, p. ej. `tarea_no_encontrada`) + DETAIL opcional en JSON.
--   NX004 voto no permitido (403)          NX005 sin permiso (403)
--   NX006 no encontrado (404)              NX007 estado no válido para la operación (422)
--   NX008 conflicto de versión (409)       NX009 equipo archivado (403)
--   NX010 datos inválidos (400)

-- Up Migration

-- ---------------------------------------------------------------------------------------------
-- 1. Ajustes de esquema
-- ---------------------------------------------------------------------------------------------
ALTER TABLE equipos ALTER COLUMN politica_propuestas SET DEFAULT 'votacion';
UPDATE equipos SET politica_propuestas = 'votacion' WHERE politica_propuestas = 'triaje';
COMMENT ON COLUMN equipos.politica_propuestas IS
  'votacion (DEC-024): el líder propone y los integrantes votan. triaje: obsoleto desde 0003. libre: sin uso en el MVP.';
COMMENT ON COLUMN tareas.cambios_pedidos IS
  'Obsoleta desde 0003 (DEC-024): el triaje se reemplazó por la votación. No se borra.';

CREATE TYPE voto_propuesta AS ENUM ('aceptar', 'rechazar');

CREATE TABLE tarea_votos (
  tarea_id       uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  usuario_id     uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  voto           voto_propuesta NOT NULL,
  comentario     text CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 500),
  votado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarea_id, usuario_id)
);
CREATE INDEX ix_tarea_votos_usuario ON tarea_votos(usuario_id);
COMMENT ON TABLE tarea_votos IS
  'Voto de un integrante activo sobre una propuesta del líder (DEC-024). Se conserva al cerrar la votación.';

-- RN-TAR-06: solo vota un integrante activo del equipo de la tarea, y solo mientras está en `propuesta`.
CREATE OR REPLACE FUNCTION fn_voto_propuesta_valido() RETURNS trigger AS $$
DECLARE v_equipo uuid; v_estado estado_tarea;
BEGIN
  SELECT equipo_id, estado INTO v_equipo, v_estado FROM tareas WHERE id = NEW.tarea_id;
  IF v_equipo IS NULL OR v_estado <> 'propuesta' THEN
    RAISE EXCEPTION 'VOTO_INVALIDO: la tarea no está en votación'
      USING ERRCODE = 'NX004', HINT = 'votacion_cerrada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM membresias
                  WHERE equipo_id = v_equipo AND usuario_id = NEW.usuario_id
                    AND estado = 'activa' AND rol = 'integrante') THEN
    RAISE EXCEPTION 'VOTO_INVALIDO: solo votan los integrantes activos (ni el líder ni los invitados)'
      USING ERRCODE = 'NX004', HINT = 'sin_permiso';
  END IF;
  IF TG_OP = 'UPDATE' THEN NEW.actualizado_en := now(); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_voto_propuesta_valido BEFORE INSERT OR UPDATE ON tarea_votos
  FOR EACH ROW EXECUTE FUNCTION fn_voto_propuesta_valido();

-- Regla 10 de DEC-024: quien deja de ser miembro activo pierde sus votos de propuestas ABIERTAS.
CREATE OR REPLACE FUNCTION fn_membresia_descarta_votos() RETURNS trigger AS $$
BEGIN
  DELETE FROM tarea_votos v
   USING tareas t
   WHERE v.tarea_id = t.id AND t.equipo_id = NEW.equipo_id
     AND t.estado = 'propuesta' AND v.usuario_id = NEW.usuario_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_membresia_descarta_votos AFTER UPDATE OF estado ON membresias
  FOR EACH ROW WHEN (OLD.estado = 'activa' AND NEW.estado <> 'activa')
  EXECUTE FUNCTION fn_membresia_descarta_votos();

-- ---------------------------------------------------------------------------------------------
-- 2. Auxiliares (fn_*): no las llama la aplicación
-- ---------------------------------------------------------------------------------------------

-- Índice fraccionario: copia en PL/pgSQL de `generateKeyBetween` de la librería
-- `fractional-indexing` (dígitos base 62). Una prueba compara ambas (DEC-025, reglas duplicadas).
-- Las claves se comparan siempre con COLLATE "C" (orden por bytes, como en JavaScript).
CREATE OR REPLACE FUNCTION fn_orden_medio(a text, b text) RETURNS text AS $$
DECLARE
  d  constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  n  int := 0;
  da int;
  db int;
BEGIN
  IF b IS NOT NULL AND (a COLLATE "C") >= (b COLLATE "C") THEN
    RAISE EXCEPTION 'orden: % no es menor que %', a, b;
  END IF;
  IF right(a, 1) = '0' OR (b IS NOT NULL AND right(b, 1) = '0') THEN
    RAISE EXCEPTION 'orden: clave con cero final';
  END IF;
  IF b IS NOT NULL THEN
    WHILE n < length(b) AND coalesce(nullif(substr(a, n + 1, 1), ''), '0') = substr(b, n + 1, 1) LOOP
      n := n + 1;
    END LOOP;
    IF n > 0 THEN
      RETURN left(b, n) || fn_orden_medio(substr(a, n + 1), substr(b, n + 1));
    END IF;
  END IF;
  da := CASE WHEN a = '' THEN 0 ELSE strpos(d, left(a, 1)) - 1 END;
  db := CASE WHEN b IS NULL THEN length(d) ELSE strpos(d, left(b, 1)) - 1 END;
  IF db - da > 1 THEN
    RETURN substr(d, round(0.5 * (da + db))::int + 1, 1);
  ELSIF b IS NOT NULL AND length(b) > 1 THEN
    RETURN left(b, 1);
  ELSE
    RETURN substr(d, da + 1, 1) || fn_orden_medio(substr(a, 2), NULL);
  END IF;
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_orden_parte_entera(k text) RETURNS text AS $$
DECLARE c int := ascii(left(k, 1)); n int;
BEGIN
  IF c BETWEEN 97 AND 122 THEN n := c - 97 + 2;         -- 'a'..'z'
  ELSIF c BETWEEN 65 AND 90 THEN n := 90 - c + 2;        -- 'A'..'Z'
  ELSE RAISE EXCEPTION 'orden: cabecera no válida en %', k;
  END IF;
  IF n > length(k) THEN RAISE EXCEPTION 'orden: clave no válida %', k; END IF;
  RETURN left(k, n);
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_orden_validar(k text) RETURNS void AS $$
DECLARE i text;
BEGIN
  IF k = 'A' || repeat('0', 26) THEN RAISE EXCEPTION 'orden: clave no válida %', k; END IF;
  i := fn_orden_parte_entera(k);
  IF right(substr(k, length(i) + 1), 1) = '0' THEN
    RAISE EXCEPTION 'orden: clave con cero final %', k;
  END IF;
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_orden_incrementar(x text) RETURNS text AS $$
DECLARE
  d     constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  cab   text := left(x, 1);
  digs  text := substr(x, 2);
  i     int := length(substr(x, 2));
  p     int;
  lleva boolean := true;
  h     text;
BEGIN
  WHILE lleva AND i >= 1 LOOP
    p := strpos(d, substr(digs, i, 1));
    IF p = length(d) THEN
      digs := overlay(digs PLACING '0' FROM i FOR 1);
    ELSE
      digs := overlay(digs PLACING substr(d, p + 1, 1) FROM i FOR 1);
      lleva := false;
    END IF;
    i := i - 1;
  END LOOP;
  IF lleva THEN
    IF cab = 'Z' THEN RETURN 'a0'; END IF;
    IF cab = 'z' THEN RETURN NULL; END IF;
    h := chr(ascii(cab) + 1);
    IF ascii(h) > ascii('a') THEN digs := digs || '0'; ELSE digs := left(digs, length(digs) - 1); END IF;
    RETURN h || digs;
  END IF;
  RETURN cab || digs;
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_orden_decrementar(x text) RETURNS text AS $$
DECLARE
  d     constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  cab   text := left(x, 1);
  digs  text := substr(x, 2);
  i     int := length(substr(x, 2));
  p     int;
  pide  boolean := true;
  h     text;
BEGIN
  WHILE pide AND i >= 1 LOOP
    p := strpos(d, substr(digs, i, 1)) - 2;
    IF p = -1 THEN
      digs := overlay(digs PLACING right(d, 1) FROM i FOR 1);
    ELSE
      digs := overlay(digs PLACING substr(d, p + 1, 1) FROM i FOR 1);
      pide := false;
    END IF;
    i := i - 1;
  END LOOP;
  IF pide THEN
    IF cab = 'a' THEN RETURN 'Z' || right(d, 1); END IF;
    IF cab = 'A' THEN RETURN NULL; END IF;
    h := chr(ascii(cab) - 1);
    IF ascii(h) < ascii('Z') THEN digs := digs || right(d, 1); ELSE digs := left(digs, length(digs) - 1); END IF;
    RETURN h || digs;
  END IF;
  RETURN cab || digs;
END $$ LANGUAGE plpgsql IMMUTABLE;

/** Clave estrictamente entre `a` y `b` (cualquiera puede ser NULL = extremo). */
CREATE OR REPLACE FUNCTION fn_orden_entre(a text, b text) RETURNS text AS $$
DECLARE ia text; fa text; ib text; fb text; r text;
BEGIN
  IF a IS NOT NULL THEN PERFORM fn_orden_validar(a); END IF;
  IF b IS NOT NULL THEN PERFORM fn_orden_validar(b); END IF;
  IF a IS NOT NULL AND b IS NOT NULL AND (a COLLATE "C") >= (b COLLATE "C") THEN
    RAISE EXCEPTION 'orden: % no es menor que %', a, b;
  END IF;
  IF a IS NULL THEN
    IF b IS NULL THEN RETURN 'a0'; END IF;
    ib := fn_orden_parte_entera(b);
    fb := substr(b, length(ib) + 1);
    IF ib = 'A' || repeat('0', 26) THEN RETURN ib || fn_orden_medio('', fb); END IF;
    IF (ib COLLATE "C") < (b COLLATE "C") THEN RETURN ib; END IF;
    r := fn_orden_decrementar(ib);
    IF r IS NULL THEN RAISE EXCEPTION 'orden: no se puede decrementar más'; END IF;
    RETURN r;
  END IF;
  ia := fn_orden_parte_entera(a);
  fa := substr(a, length(ia) + 1);
  IF b IS NULL THEN
    r := fn_orden_incrementar(ia);
    RETURN coalesce(r, ia || fn_orden_medio(fa, NULL));
  END IF;
  ib := fn_orden_parte_entera(b);
  fb := substr(b, length(ib) + 1);
  IF ia = ib THEN RETURN ia || fn_orden_medio(fa, fb); END IF;
  r := fn_orden_incrementar(ia);
  IF r IS NULL THEN RAISE EXCEPTION 'orden: no se puede incrementar más'; END IF;
  IF (r COLLATE "C") < (b COLLATE "C") THEN RETURN r; END IF;
  RETURN ia || fn_orden_medio(fa, NULL);
END $$ LANGUAGE plpgsql IMMUTABLE;

/** Clave para dejar una tarea al final de su columna (equipo + estado). */
CREATE OR REPLACE FUNCTION fn_orden_al_final(p_equipo uuid, p_estado estado_tarea, p_excluir uuid DEFAULT NULL)
RETURNS text AS $$
  SELECT fn_orden_entre(max(orden COLLATE "C"), NULL)
    FROM tareas
   WHERE equipo_id = p_equipo AND estado = p_estado AND (p_excluir IS NULL OR id <> p_excluir);
$$ LANGUAGE sql STABLE;

/**
 * Resultado de una votación (V-1, V-4, V-5). Copia de `resultadoVotacion` de packages/shared
 * (una prueba compara ambas). Mayoría simple de TODOS los integrantes activos, no solo de los
 * que votaron; el empate o la falta de mayoría deja la propuesta abierta.
 */
CREATE OR REPLACE FUNCTION fn_votacion_resultado(p_aceptar int, p_rechazar int, p_total int)
RETURNS text AS $$
  SELECT CASE
           WHEN p_total <= 0            THEN 'aceptada'   -- V-5: sin integrantes acepta el líder
           WHEN p_aceptar * 2 > p_total  THEN 'aceptada'
           WHEN p_rechazar * 2 > p_total THEN 'rechazada'
           ELSE 'abierta'
         END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_integrantes_activos(p_equipo uuid) RETURNS int AS $$
  SELECT count(*)::int FROM membresias
   WHERE equipo_id = p_equipo AND estado = 'activa' AND rol = 'integrante';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_codigo_tarea(p_codigo int) RETURNS text AS $$
  SELECT 'T-' || lpad(p_codigo::text, 2, '0');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_primer_nombre(p_usuario uuid) RETURNS text AS $$
  SELECT split_part(nombre, ' ', 1) FROM usuarios WHERE id = p_usuario;
$$ LANGUAGE sql STABLE;

/** Patrón outbox (DEC-022): evento de dominio + fila de actividad, en la transacción del cambio. */
CREATE OR REPLACE FUNCTION fn_registrar_evento(
  p_equipo uuid, p_actor uuid, p_tipo text, p_objeto_tipo text, p_objeto_id uuid,
  p_carga jsonb, p_resumen text
) RETURNS void AS $$
DECLARE
  v_categoria text := split_part(p_tipo, '.', 1);
  v_accion    text := coalesce(nullif(split_part(p_tipo, '.', 2), ''), 'cambio');
BEGIN
  INSERT INTO eventos_dominio (equipo_id, tipo, objeto_tipo, objeto_id, actor_id, carga)
  VALUES (p_equipo, p_tipo, p_objeto_tipo, p_objeto_id, p_actor, coalesce(p_carga, '{}'::jsonb));
  INSERT INTO actividad (equipo_id, autor_id, tipo, accion, objeto_tipo, objeto_id, resumen, detalle)
  VALUES (p_equipo, p_actor, CASE WHEN v_categoria = 'tarea' THEN 'tarea' ELSE 'equipo' END,
          v_accion, p_objeto_tipo, p_objeto_id, p_resumen, coalesce(p_carga, '{}'::jsonb));
END $$ LANGUAGE plpgsql;

/**
 * Membresía activa del actor en el equipo (defensa en profundidad; la API ya lo comprobó).
 * Quien no pertenece recibe NX006 (404), como si el equipo no existiera (DEC-018).
 */
CREATE OR REPLACE FUNCTION fn_membresia_actor(p_actor uuid, p_equipo uuid)
RETURNS TABLE (membresia_id uuid, rol rol_membresia) AS $$
DECLARE v_id uuid; v_rol rol_membresia; v_caduca timestamptz;
BEGIN
  SELECT m.id, m.rol, m.caduca_en INTO v_id, v_rol, v_caduca
    FROM membresias m
   WHERE m.equipo_id = p_equipo AND m.usuario_id = p_actor AND m.estado = 'activa';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese equipo.' USING ERRCODE = 'NX006', HINT = 'equipo_no_encontrado';
  END IF;
  IF v_rol = 'invitado' AND v_caduca IS NOT NULL AND v_caduca < now() THEN
    RAISE EXCEPTION 'Tu acceso como invitado a este equipo terminó.'
      USING ERRCODE = 'NX005', HINT = 'acceso_caducado';
  END IF;
  membresia_id := v_id; rol := v_rol;
  RETURN NEXT;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_exigir_equipo_activo(p_equipo uuid) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM equipos WHERE id = p_equipo AND estado = 'archivado') THEN
    RAISE EXCEPTION 'El equipo está archivado: solo lectura.' USING ERRCODE = 'NX009', HINT = 'equipo_archivado';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_exigir_lider(p_actor uuid, p_equipo uuid, p_mensaje text) RETURNS void AS $$
BEGIN
  IF (SELECT rol FROM fn_membresia_actor(p_actor, p_equipo)) <> 'lider' THEN
    RAISE EXCEPTION '%', p_mensaje USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
END $$ LANGUAGE plpgsql STABLE;

/** Sustituye las etiquetas de la tarea; crea en el equipo las que aún no existan (sin distinguir mayúsculas). */
CREATE OR REPLACE FUNCTION fn_fijar_etiquetas(p_equipo uuid, p_tarea uuid, p_nombres text[]) RETURNS void AS $$
BEGIN
  DELETE FROM tarea_etiquetas WHERE tarea_id = p_tarea;
  IF coalesce(cardinality(p_nombres), 0) = 0 THEN RETURN; END IF;
  INSERT INTO etiquetas (equipo_id, nombre)
  SELECT DISTINCT ON (lower(n)) p_equipo, n FROM unnest(p_nombres) AS n
  ON CONFLICT (equipo_id, nombre) WHERE equipo_id IS NOT NULL DO NOTHING;
  INSERT INTO tarea_etiquetas (tarea_id, etiqueta_id)
  SELECT p_tarea, e.id FROM etiquetas e
   WHERE e.equipo_id = p_equipo AND e.nombre = ANY (p_nombres::citext[])
  ON CONFLICT DO NOTHING;
END $$ LANGUAGE plpgsql;

/** Exige que un responsable sea líder o integrante activo del equipo; devuelve su nombre. */
CREATE OR REPLACE FUNCTION fn_exigir_responsable(p_equipo uuid, p_usuario uuid) RETURNS text AS $$
DECLARE v_nombre text;
BEGIN
  SELECT u.nombre INTO v_nombre FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
   WHERE m.equipo_id = p_equipo AND m.usuario_id = p_usuario AND m.estado = 'activa' AND m.rol <> 'invitado';
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'El responsable debe ser un miembro del equipo.' USING ERRCODE = 'NX010', HINT = 'responsable_invalido';
  END IF;
  RETURN v_nombre;
END $$ LANGUAGE plpgsql STABLE;

/** Bloquea la tarea del equipo para la transacción o responde NX006. */
CREATE OR REPLACE FUNCTION fn_bloquear_tarea(p_equipo uuid, p_tarea uuid) RETURNS tareas AS $$
DECLARE t tareas;
BEGIN
  SELECT * INTO t FROM tareas WHERE id = p_tarea AND equipo_id = p_equipo FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
  END IF;
  RETURN t;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_exigir_version(t tareas, p_version int) RETURNS void AS $$
BEGIN
  IF p_version IS NOT NULL AND t.version <> p_version THEN
    RAISE EXCEPTION 'Alguien cambió esta tarea. Recárgala para ver la versión más reciente.'
      USING ERRCODE = 'NX008', HINT = 'conflicto_version',
            DETAIL = jsonb_build_object('version_actual', t.version)::text;
  END IF;
END $$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Inserta una propuesta del líder con sus subtareas y etiquetas (lo usan proponer y reformular).
 * Sin integrantes activos (V-5) queda aceptada directamente, en el sprint activo si lo hay.
 */
CREATE OR REPLACE FUNCTION fn_tarea_insertar_propuesta(p_actor uuid, p_equipo uuid, p_datos jsonb)
RETURNS tareas AS $$
DECLARE
  v_responsable uuid := nullif(p_datos->>'responsable_id', '')::uuid;
  v_estado      estado_tarea;
  v_sprint      uuid;
  v_orden_sub   text := NULL;
  v_sub         text;
  t             tareas;
BEGIN
  IF v_responsable IS NOT NULL THEN PERFORM fn_exigir_responsable(p_equipo, v_responsable); END IF;
  IF fn_integrantes_activos(p_equipo) = 0 THEN
    v_estado := 'aceptada';
    SELECT id INTO v_sprint FROM sprints WHERE equipo_id = p_equipo AND estado = 'activo';
  ELSE
    v_estado := 'propuesta';
  END IF;

  INSERT INTO tareas (equipo_id, codigo, titulo, descripcion, prioridad, vence_en, estado, origen,
                      proponente_id, responsable_id, asignacion_pendiente, sprint_id, orden, creada_por)
  VALUES (p_equipo, 0, p_datos->>'titulo', coalesce(p_datos->>'descripcion', ''),
          coalesce(p_datos->>'prioridad', 'media')::prioridad_tarea,
          nullif(p_datos->>'vence_en', '')::timestamptz, v_estado, 'propuesta',
          p_actor, v_responsable, v_responsable IS NOT NULL AND v_responsable <> p_actor,
          v_sprint, fn_orden_al_final(p_equipo, v_estado), p_actor)
  RETURNING * INTO t;

  FOR v_sub IN SELECT jsonb_array_elements_text(coalesce(p_datos->'subtareas', '[]'::jsonb)) LOOP
    v_orden_sub := fn_orden_entre(v_orden_sub, NULL);
    INSERT INTO subtareas (tarea_id, titulo, orden) VALUES (t.id, v_sub, v_orden_sub);
  END LOOP;

  PERFORM fn_fijar_etiquetas(p_equipo, t.id,
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_datos->'etiquetas', '[]'::jsonb))));
  RETURN t;
END $$ LANGUAGE plpgsql;

/** Resumen de la votación que ve `p_actor` (V-8): conteo y quién votó, nunca el voto ajeno. */
CREATE OR REPLACE FUNCTION fn_votacion_resumen(p_tarea uuid, p_actor uuid) RETURNS jsonb AS $$
DECLARE
  v_equipo  uuid;
  v_abierta boolean;
  v_total   int;
  v_aceptar int;
  v_rechaza int;
  v_emitido int;
  v_mio     jsonb;
  v_votaron jsonb := '[]'::jsonb;
BEGIN
  SELECT equipo_id, estado = 'propuesta' INTO v_equipo, v_abierta FROM tareas WHERE id = p_tarea;
  SELECT count(*) FILTER (WHERE voto = 'aceptar'), count(*) FILTER (WHERE voto = 'rechazar'), count(*)
    INTO v_aceptar, v_rechaza, v_emitido
    FROM tarea_votos WHERE tarea_id = p_tarea;
  SELECT jsonb_build_object('voto', voto, 'comentario', comentario, 'votado_en', actualizado_en)
    INTO v_mio FROM tarea_votos WHERE tarea_id = p_tarea AND usuario_id = p_actor;
  IF v_abierta THEN
    v_total := fn_integrantes_activos(v_equipo);
    SELECT coalesce(jsonb_agg(jsonb_build_object('usuario_id', u.id, 'nombre', u.nombre) ORDER BY u.nombre), '[]'::jsonb)
      INTO v_votaron
      FROM tarea_votos v JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.tarea_id = p_tarea;
  END IF;
  RETURN jsonb_build_object(
    'abierta', v_abierta,
    'total_integrantes', v_total,
    'necesarios', CASE WHEN v_abierta THEN v_total / 2 + 1 END,
    'emitidos', v_emitido,
    'aceptar', v_aceptar,
    'rechazar', v_rechaza,
    'votaron', v_votaron,
    'mi_voto', v_mio
  );
END $$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------------------------
-- 3. Procesos (proc_*): lo único que llama la API (docs/08)
-- ---------------------------------------------------------------------------------------------

/** El líder propone una tarea con sus subtareas; entra en votación (V-10). */
CREATE OR REPLACE FUNCTION proc_tarea_proponer(p_actor_id uuid, p_equipo_id uuid, p_datos jsonb)
RETURNS jsonb AS $$
DECLARE t tareas;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder propone tareas. Comparte tus ideas en el chat o en los comentarios.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_tarea_insertar_propuesta(p_actor_id, p_equipo_id, p_datos);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN t.estado = 'propuesta' THEN 'tarea.propuesta' ELSE 'tarea.creada' END,
    'tarea', t.id,
    jsonb_build_object('estado', t.estado, 'responsable_id', t.responsable_id, 'sprint_id', t.sprint_id,
                       'subtareas', jsonb_array_length(coalesce(p_datos->'subtareas', '[]'::jsonb))),
    fn_primer_nombre(p_actor_id) || CASE WHEN t.estado = 'propuesta' THEN ' propuso ' ELSE ' creó ' END
      || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»'
      || CASE WHEN t.estado = 'propuesta' THEN ' (en votación)' ELSE ' (aceptada: el equipo no tiene integrantes)' END);
  RETURN jsonb_build_object('id', t.id, 'codigo', t.codigo, 'estado', t.estado);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * Un integrante activo vota (o cambia su voto). Si se alcanza la mayoría, la propuesta pasa a
 * `aceptada` (sprint activo si lo hay) o a `rechazada` (rechazo_por = votacion) en la misma transacción.
 */
CREATE OR REPLACE FUNCTION proc_tarea_votar(
  p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_voto text, p_comentario text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  t          tareas;
  v_rol      rol_membresia;
  v_previo   voto_propuesta;
  v_aceptar  int;
  v_rechaza  int;
  v_total    int;
  v_result   text;
  v_sprint   uuid;
  v_quien    text := fn_primer_nombre(p_actor_id);
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea(p_equipo_id, p_tarea_id);
  IF v_rol = 'invitado' THEN
    -- El invitado no ve propuestas: para él la tarea no existe (salvo que esté compartida).
    RAISE EXCEPTION 'Los invitados no votan propuestas.' USING ERRCODE = 'NX004', HINT = 'sin_permiso';
  END IF;
  IF v_rol <> 'integrante' THEN
    RAISE EXCEPTION 'Solo los integrantes votan las propuestas; el líder propone.'
      USING ERRCODE = 'NX004', HINT = 'sin_permiso';
  END IF;
  IF t.estado <> 'propuesta' THEN
    RAISE EXCEPTION 'La votación de esta tarea ya cerró.' USING ERRCODE = 'NX007', HINT = 'votacion_cerrada';
  END IF;
  IF p_voto IS NULL OR p_voto NOT IN ('aceptar', 'rechazar') THEN
    RAISE EXCEPTION 'El voto debe ser aceptar o rechazar.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;

  SELECT voto INTO v_previo FROM tarea_votos WHERE tarea_id = t.id AND usuario_id = p_actor_id;
  INSERT INTO tarea_votos (tarea_id, usuario_id, voto, comentario)
  VALUES (t.id, p_actor_id, p_voto::voto_propuesta, nullif(btrim(p_comentario), ''))
  ON CONFLICT (tarea_id, usuario_id)
  DO UPDATE SET voto = EXCLUDED.voto, comentario = EXCLUDED.comentario;

  -- El evento y la actividad no llevan el sentido del voto (V-8: nadie ve el voto ajeno).
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.votada', 'tarea', t.id,
    jsonb_build_object('cambio', v_previo IS NOT NULL),
    v_quien || CASE WHEN v_previo IS NULL THEN ' votó la propuesta ' ELSE ' cambió su voto en ' END
      || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»');

  SELECT count(*) FILTER (WHERE voto = 'aceptar'), count(*) FILTER (WHERE voto = 'rechazar')
    INTO v_aceptar, v_rechaza FROM tarea_votos WHERE tarea_id = t.id;
  v_total := fn_integrantes_activos(p_equipo_id);
  v_result := fn_votacion_resultado(v_aceptar, v_rechaza, v_total);

  IF v_result = 'aceptada' THEN
    SELECT id INTO v_sprint FROM sprints WHERE equipo_id = p_equipo_id AND estado = 'activo';
    UPDATE tareas
       SET estado = 'aceptada', sprint_id = v_sprint, motivo = NULL, rechazo_por = NULL,
           orden = fn_orden_al_final(p_equipo_id, 'aceptada', t.id)
     WHERE id = t.id;
    PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.aceptada_por_votacion', 'tarea', t.id,
      jsonb_build_object('aceptar', v_aceptar, 'rechazar', v_rechaza, 'total', v_total, 'sprint_id', v_sprint,
                         'proponente_id', t.proponente_id, 'responsable_id', t.responsable_id),
      'El equipo aceptó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» por mayoría ('
        || v_aceptar || ' de ' || v_total || ')');
  ELSIF v_result = 'rechazada' THEN
    UPDATE tareas
       SET estado = 'rechazada', rechazo_por = 'votacion', sprint_id = NULL,
           responsable_id = NULL, asignacion_pendiente = false,
           motivo = 'Rechazada por mayoría (' || v_rechaza || ' de ' || v_total || ')'
     WHERE id = t.id;
    PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.rechazada_por_votacion', 'tarea', t.id,
      jsonb_build_object('aceptar', v_aceptar, 'rechazar', v_rechaza, 'total', v_total,
                         'proponente_id', t.proponente_id),
      'El equipo rechazó ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '» por mayoría ('
        || v_rechaza || ' de ' || v_total || ')');
  END IF;

  RETURN fn_votacion_resumen(t.id, p_actor_id)
    || jsonb_build_object('estado', CASE v_result WHEN 'abierta' THEN 'propuesta' ELSE v_result END);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** El líder retira una propuesta que sigue en votación (V-3, V-4): pasa a `cancelada`. */
CREATE OR REPLACE FUNCTION proc_tarea_retirar(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_version int)
RETURNS jsonb AS $$
DECLARE t tareas;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede retirar o reformular propuestas.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea(p_equipo_id, p_tarea_id);
  PERFORM fn_exigir_version(t, p_version);
  IF t.estado <> 'propuesta' THEN
    RAISE EXCEPTION 'Solo se retira una propuesta que sigue en votación.'
      USING ERRCODE = 'NX007', HINT = 'transicion_invalida';
  END IF;
  UPDATE tareas SET estado = 'cancelada', sprint_id = NULL,
                    orden = fn_orden_al_final(p_equipo_id, 'cancelada', t.id)
   WHERE id = t.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.retirada', 'tarea', t.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' retiró la propuesta ' || fn_codigo_tarea(t.codigo) || ' «' || t.titulo || '»');
  RETURN jsonb_build_object('id', t.id, 'codigo', t.codigo, 'estado', 'cancelada');
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * El líder reformula una propuesta rechazada por votación o retirada: crea una propuesta NUEVA
 * (vuelve a votarse) y la anterior se conserva como historial.
 */
CREATE OR REPLACE FUNCTION proc_tarea_reformular(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid, p_datos jsonb)
RETURNS jsonb AS $$
DECLARE t tareas; n tareas;
BEGIN
  PERFORM fn_exigir_lider(p_actor_id, p_equipo_id, 'Solo el líder puede retirar o reformular propuestas.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  t := fn_bloquear_tarea(p_equipo_id, p_tarea_id);
  IF NOT (t.estado = 'cancelada' OR (t.estado = 'rechazada' AND t.rechazo_por = 'votacion')) THEN
    RAISE EXCEPTION 'Solo se reformula una propuesta rechazada por votación o retirada.'
      USING ERRCODE = 'NX007', HINT = 'transicion_invalida';
  END IF;
  n := fn_tarea_insertar_propuesta(p_actor_id, p_equipo_id, p_datos);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'tarea.reformulada', 'tarea', t.id,
    jsonb_build_object('nueva_id', n.id),
    fn_primer_nombre(p_actor_id) || ' reformuló ' || fn_codigo_tarea(t.codigo) || ' como ' || fn_codigo_tarea(n.codigo));
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN n.estado = 'propuesta' THEN 'tarea.propuesta' ELSE 'tarea.creada' END, 'tarea', n.id,
    jsonb_build_object('estado', n.estado, 'reformula_id', t.id, 'responsable_id', n.responsable_id),
    fn_primer_nombre(p_actor_id) || ' propuso ' || fn_codigo_tarea(n.codigo) || ' «' || n.titulo
      || '» (reformulación de ' || fn_codigo_tarea(t.codigo) || ')');
  RETURN jsonb_build_object('id', n.id, 'codigo', n.codigo, 'estado', n.estado);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Resumen de la votación de una tarea para quien consulta (líder o integrante; V-8). */
CREATE OR REPLACE FUNCTION proc_tarea_votacion(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid)
RETURNS jsonb AS $$
DECLARE v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol = 'invitado' THEN
    RAISE EXCEPTION 'Los invitados no ven las propuestas.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tareas WHERE id = p_tarea_id AND equipo_id = p_equipo_id) THEN
    RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
  END IF;
  RETURN fn_votacion_resumen(p_tarea_id, p_actor_id);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Resúmenes de votación de varias tareas del equipo, como objeto {tarea_id: resumen}. */
CREATE OR REPLACE FUNCTION proc_tarea_votaciones(p_actor_id uuid, p_equipo_id uuid, p_tareas uuid[])
RETURNS jsonb AS $$
DECLARE v_rol rol_membresia;
BEGIN
  SELECT rol INTO v_rol FROM fn_membresia_actor(p_actor_id, p_equipo_id);
  IF v_rol = 'invitado' THEN RETURN '{}'::jsonb; END IF;
  RETURN coalesce(
    (SELECT jsonb_object_agg(t.id, fn_votacion_resumen(t.id, p_actor_id))
       FROM tareas t
      WHERE t.equipo_id = p_equipo_id AND t.id = ANY (p_tareas) AND t.origen = 'propuesta'),
    '{}'::jsonb);
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Down Migration
DROP FUNCTION IF EXISTS proc_tarea_votaciones(uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS proc_tarea_votacion(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_tarea_reformular(uuid, uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS proc_tarea_retirar(uuid, uuid, uuid, int);
DROP FUNCTION IF EXISTS proc_tarea_votar(uuid, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS proc_tarea_proponer(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS fn_votacion_resumen(uuid, uuid);
DROP FUNCTION IF EXISTS fn_tarea_insertar_propuesta(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS fn_exigir_version(tareas, int);
DROP FUNCTION IF EXISTS fn_bloquear_tarea(uuid, uuid);
DROP FUNCTION IF EXISTS fn_exigir_responsable(uuid, uuid);
DROP FUNCTION IF EXISTS fn_fijar_etiquetas(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS fn_exigir_lider(uuid, uuid, text);
DROP FUNCTION IF EXISTS fn_exigir_equipo_activo(uuid);
DROP FUNCTION IF EXISTS fn_membresia_actor(uuid, uuid);
DROP FUNCTION IF EXISTS fn_registrar_evento(uuid, uuid, text, text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS fn_primer_nombre(uuid);
DROP FUNCTION IF EXISTS fn_codigo_tarea(int);
DROP FUNCTION IF EXISTS fn_integrantes_activos(uuid);
DROP FUNCTION IF EXISTS fn_votacion_resultado(int, int, int);
DROP FUNCTION IF EXISTS fn_orden_al_final(uuid, estado_tarea, uuid);
DROP FUNCTION IF EXISTS fn_orden_entre(text, text);
DROP FUNCTION IF EXISTS fn_orden_decrementar(text);
DROP FUNCTION IF EXISTS fn_orden_incrementar(text);
DROP FUNCTION IF EXISTS fn_orden_validar(text);
DROP FUNCTION IF EXISTS fn_orden_parte_entera(text);
DROP FUNCTION IF EXISTS fn_orden_medio(text, text);
DROP TRIGGER IF EXISTS trg_membresia_descarta_votos ON membresias;
DROP FUNCTION IF EXISTS fn_membresia_descarta_votos();
DROP TABLE IF EXISTS tarea_votos;
DROP FUNCTION IF EXISTS fn_voto_propuesta_valido();
DROP TYPE IF EXISTS voto_propuesta;
UPDATE equipos SET politica_propuestas = 'triaje' WHERE politica_propuestas = 'votacion';
ALTER TABLE equipos ALTER COLUMN politica_propuestas SET DEFAULT 'triaje';
COMMENT ON COLUMN tareas.cambios_pedidos IS NULL;
COMMENT ON COLUMN equipos.politica_propuestas IS NULL;
