-- Fase 3.4 · Archivos del equipo (EQ-19), DEC-033.
-- El contenido se guarda en PostgreSQL (`archivo_contenidos`, bytea) con un tope de 5 MB por
-- archivo y una lista de tipos permitidos: así no hace falta otro servicio de almacenamiento en
-- el MVP y el respaldo de la BD incluye los archivos. `archivos` (0001) guarda los metadatos;
-- `storage_key` queda como `bd:<id>` para poder mover el contenido a un almacén de objetos.
-- Documentación: docs/08_Procesos_BD.md.

-- Up Migration

CREATE TABLE archivo_contenidos (
  archivo_id uuid PRIMARY KEY REFERENCES archivos(id) ON DELETE CASCADE,
  datos      bytea NOT NULL
);
COMMENT ON TABLE archivo_contenidos IS
  'Contenido de los archivos subidos (EQ-19), máximo 5 MB cada uno. Se borra al eliminar el archivo.';

/** Tipos MIME permitidos y su categoría (`tipo_archivo`). Nada ejecutable ni SVG. */
CREATE OR REPLACE FUNCTION fn_archivo_tipo(p_mime text) RETURNS tipo_archivo AS $$
  SELECT CASE
    WHEN p_mime = 'application/pdf' THEN 'pdf'
    WHEN p_mime IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp') THEN 'imagen'
    WHEN p_mime IN ('text/plain', 'text/markdown', 'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.oasis.opendocument.text',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation') THEN 'doc'
    WHEN p_mime IN ('text/csv', 'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.oasis.opendocument.spreadsheet') THEN 'hoja'
    WHEN p_mime = 'application/zip' THEN 'otro'
  END::tipo_archivo;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_archivo_json(a archivos, p_actor uuid, p_lider boolean) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'nombre', a.nombre, 'mime', a.mime, 'tipo', a.tipo, 'tamano_bytes', a.tamano_bytes,
    'creado_en', fn_iso(a.creado_en),
    'subido_por', CASE WHEN a.subido_por IS NOT NULL THEN fn_persona_json(a.equipo_id, a.subido_por) END,
    'tarea', (SELECT jsonb_build_object('id', t.id, 'codigo', t.codigo, 'titulo', t.titulo)
                FROM tareas t WHERE t.id = a.tarea_id),
    'puedo_eliminar', p_lider OR a.subido_por = p_actor);
$$ LANGUAGE sql STABLE;

/** EQ-19: archivos del equipo (o de una tarea), los más recientes primero. */
CREATE OR REPLACE FUNCTION proc_archivo_listar(p_actor_id uuid, p_equipo_id uuid, p_tarea_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE v_rol rol_membresia;
BEGIN
  v_rol := fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no ven los archivos del equipo.');
  RETURN (SELECT coalesce(jsonb_agg(fn_archivo_json(a, p_actor_id, v_rol = 'lider') ORDER BY a.creado_en DESC), '[]'::jsonb)
            FROM archivos a
           WHERE a.equipo_id = p_equipo_id AND a.eliminado_en IS NULL
             AND (p_tarea_id IS NULL OR a.tarea_id = p_tarea_id));
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/**
 * EQ-19: subir un archivo (líder o integrante), opcionalmente adjunto a una tarea del equipo.
 * Máximo 5 MB y solo los tipos de `fn_archivo_tipo`.
 */
CREATE OR REPLACE FUNCTION proc_archivo_subir(
  p_actor_id uuid, p_equipo_id uuid, p_nombre text, p_mime text, p_datos bytea, p_tarea_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE a archivos; v_tipo tipo_archivo := fn_archivo_tipo(p_mime); v_nombre text := btrim(coalesce(p_nombre, ''));
        v_tarea tareas;
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no pueden adjuntar archivos.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Ese tipo de archivo no está permitido.' USING ERRCODE = 'NX010', HINT = 'tipo_no_permitido';
  END IF;
  IF p_datos IS NULL OR octet_length(p_datos) = 0 OR octet_length(p_datos) > 5242880 THEN
    RAISE EXCEPTION 'El archivo debe pesar entre 1 byte y 5 MB.' USING ERRCODE = 'NX010', HINT = 'archivo_muy_grande';
  END IF;
  IF char_length(v_nombre) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'El nombre del archivo lleva de 1 a 200 caracteres.' USING ERRCODE = 'NX010', HINT = 'validacion';
  END IF;
  IF p_tarea_id IS NOT NULL THEN
    SELECT * INTO v_tarea FROM tareas WHERE id = p_tarea_id AND equipo_id = p_equipo_id;
    IF v_tarea.id IS NULL THEN
      RAISE EXCEPTION 'No encontramos esa tarea.' USING ERRCODE = 'NX006', HINT = 'tarea_no_encontrada';
    END IF;
  END IF;
  INSERT INTO archivos (equipo_id, subido_por, nombre, mime, tamano_bytes, storage_key, sha256, tipo, tarea_id)
  VALUES (p_equipo_id, p_actor_id, v_nombre, p_mime, octet_length(p_datos), 'bd:' || gen_random_uuid(),
          encode(sha256(p_datos), 'hex'), v_tipo, p_tarea_id)
  RETURNING * INTO a;
  INSERT INTO archivo_contenidos (archivo_id, datos) VALUES (a.id, p_datos);
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id,
    CASE WHEN p_tarea_id IS NULL THEN 'equipo.archivo_subido' ELSE 'tarea.archivo_adjuntado' END,
    CASE WHEN p_tarea_id IS NULL THEN 'archivo' ELSE 'tarea' END, coalesce(p_tarea_id, a.id),
    jsonb_build_object('archivo_id', a.id, 'tamano_bytes', a.tamano_bytes),
    fn_primer_nombre(p_actor_id) || ' subió «' || a.nombre || '»'
      || CASE WHEN p_tarea_id IS NULL THEN '' ELSE ' a ' || fn_codigo_tarea(v_tarea.codigo) END);
  RETURN fn_archivo_json(a, p_actor_id, false);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

/** Descargar un archivo: nombre, tipo y contenido en base64 (la API lo entrega como binario). */
CREATE OR REPLACE FUNCTION proc_archivo_descargar(p_actor_id uuid, p_equipo_id uuid, p_archivo_id uuid) RETURNS jsonb AS $$
DECLARE v jsonb;
BEGIN
  PERFORM fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no ven los archivos del equipo.');
  SELECT jsonb_build_object('nombre', a.nombre, 'mime', a.mime, 'contenido', encode(c.datos, 'base64'))
    INTO v
    FROM archivos a JOIN archivo_contenidos c ON c.archivo_id = a.id
   WHERE a.id = p_archivo_id AND a.equipo_id = p_equipo_id AND a.eliminado_en IS NULL;
  IF v IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese archivo.' USING ERRCODE = 'NX006', HINT = 'archivo_no_encontrado';
  END IF;
  RETURN v;
END $$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

/** Eliminar un archivo: quien lo subió o el líder. Se borra el contenido; queda el registro. */
CREATE OR REPLACE FUNCTION proc_archivo_eliminar(p_actor_id uuid, p_equipo_id uuid, p_archivo_id uuid) RETURNS jsonb AS $$
DECLARE a archivos; v_rol rol_membresia;
BEGIN
  v_rol := fn_exigir_no_invitado(p_actor_id, p_equipo_id, 'Los invitados no ven los archivos del equipo.');
  PERFORM fn_exigir_equipo_activo(p_equipo_id);
  SELECT * INTO a FROM archivos WHERE id = p_archivo_id AND equipo_id = p_equipo_id AND eliminado_en IS NULL FOR UPDATE;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'No encontramos ese archivo.' USING ERRCODE = 'NX006', HINT = 'archivo_no_encontrado';
  END IF;
  IF v_rol <> 'lider' AND a.subido_por IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Solo quien subió el archivo o el líder pueden eliminarlo.' USING ERRCODE = 'NX005', HINT = 'sin_permiso';
  END IF;
  UPDATE archivos SET eliminado_en = now() WHERE id = a.id;
  DELETE FROM archivo_contenidos WHERE archivo_id = a.id;
  PERFORM fn_registrar_evento(p_equipo_id, p_actor_id, 'equipo.archivo_eliminado', 'archivo', a.id, '{}'::jsonb,
    fn_primer_nombre(p_actor_id) || ' eliminó «' || a.nombre || '»');
  RETURN jsonb_build_object('eliminado', true);
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

SELECT fn_conceder_procesos();

-- Down Migration
DROP FUNCTION IF EXISTS proc_archivo_eliminar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_archivo_descargar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS proc_archivo_subir(uuid, uuid, text, text, bytea, uuid);
DROP FUNCTION IF EXISTS proc_archivo_listar(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS fn_archivo_json(archivos, uuid, boolean);
DROP FUNCTION IF EXISTS fn_archivo_tipo(text);
DROP TABLE IF EXISTS archivo_contenidos;
