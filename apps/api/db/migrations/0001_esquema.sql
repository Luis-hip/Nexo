-- =====================================================================
-- NEXO · Esquema de base de datos · PostgreSQL 16
-- Fuente de verdad del modelo de datos. Ver docs/02_Base_de_Datos.md
-- Convenciones: tablas y columnas en español, snake_case, sin acentos ni ñ.
-- Tiempos: timestamptz (UTC). Claves primarias: uuid (gen_random_uuid()).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- 0. TIPOS ENUMERADOS (conjuntos cerrados y estables)
-- ---------------------------------------------------------------------
CREATE TYPE rol_membresia          AS ENUM ('lider', 'integrante', 'invitado');
CREATE TYPE estado_membresia       AS ENUM ('activa', 'salio', 'expulsada', 'caducada');
CREATE TYPE estado_equipo          AS ENUM ('activo', 'archivado');
CREATE TYPE politica_propuestas    AS ENUM ('triaje', 'libre');
CREATE TYPE estado_tarea           AS ENUM ('propuesta', 'backlog', 'aceptada', 'habilitada', 'en_curso', 'atascada', 'completada', 'rechazada');
CREATE TYPE prioridad_tarea        AS ENUM ('alta', 'media', 'baja');
CREATE TYPE resultado_tarea        AS ENUM ('a_tiempo', 'con_retraso');
CREATE TYPE origen_tarea           AS ENUM ('propuesta', 'directa');
CREATE TYPE rechazo_por            AS ENUM ('lider', 'responsable');
CREATE TYPE estado_sprint          AS ENUM ('planificado', 'activo', 'cerrado');
CREATE TYPE tipo_conversacion      AS ENUM ('equipo', 'tarea', 'dm', 'invitados');
CREATE TYPE tipo_reaccion          AS ENUM ('ok', 'corazon', 'risa', 'fiesta', 'visto', 'hecho');
CREATE TYPE repeticion_reunion     AS ENUM ('ninguna', 'diaria_lv', 'semanal');
CREATE TYPE respuesta_asistencia   AS ENUM ('pendiente', 'si', 'no', 'quiza');
CREATE TYPE categoria_notificacion AS ENUM ('menciones', 'tareas', 'equipo');
CREATE TYPE estado_invitacion      AS ENUM ('pendiente', 'aceptada', 'revocada', 'caducada');
CREATE TYPE tipo_solicitud_invitado AS ENUM ('ampliacion', 'conversion');
CREATE TYPE estado_solicitud       AS ENUM ('pendiente', 'aprobada', 'rechazada');
CREATE TYPE fase_eleccion          AS ENUM ('postulacion', 'votacion', 'resultado', 'empate', 'sin_votos');
CREATE TYPE estado_transferencia   AS ENUM ('pendiente', 'aceptada', 'rechazada', 'cancelada');
CREATE TYPE columna_retro          AS ENUM ('bien', 'mejorar', 'acciones');
CREATE TYPE tipo_plantilla         AS ENUM ('sprint', 'proyecto', 'retro');
CREATE TYPE tipo_archivo           AS ENUM ('pdf', 'imagen', 'doc', 'hoja', 'otro');
CREATE TYPE tipo_token             AS ENUM ('verificar_correo', 'restablecer_contrasena');
CREATE TYPE tema_ui                AS ENUM ('sistema', 'claro', 'oscuro');
CREATE TYPE densidad_ui            AS ENUM ('comoda', 'compacta');
CREATE TYPE tamano_texto_ui        AS ENUM ('pequeno', 'normal', 'grande');
CREATE TYPE estado_whatsapp        AS ENUM ('sin_configurar', 'conectado', 'error', 'pausado');
CREATE TYPE proveedor_whatsapp     AS ENUM ('simulado', 'cloud_api_grupos', 'cloud_api_directo');
CREATE TYPE tipo_envio_wa          AS ENUM ('instantaneo', 'reporte');
CREATE TYPE estado_mensaje_wa      AS ENUM ('pendiente', 'programado', 'enviando', 'enviado', 'fallido', 'cancelado');
CREATE TYPE modo_regla_wa          AS ENUM ('instantaneo', 'reporte', 'apagado');
CREATE TYPE frecuencia_reporte     AS ENUM ('diario', 'semanal');
CREATE TYPE estado_exportacion     AS ENUM ('preparando', 'lista', 'expirada');

-- ---------------------------------------------------------------------
-- 1. FUNCIONES GENÉRICAS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tocar_actualizado() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. IDENTIDAD Y CUENTA
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correo             citext NOT NULL UNIQUE,
  correo_verificado_en timestamptz,
  hash_contrasena    text,                         -- NULL si solo usa Google
  google_sub         text UNIQUE,
  nombre             text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  cargo              text NOT NULL DEFAULT '',
  descripcion        text NOT NULL DEFAULT '',
  zona_horaria       text NOT NULL DEFAULT 'America/Mexico_City',
  avatar_url         text,
  intentos_fallidos  smallint NOT NULL DEFAULT 0,
  bloqueado_hasta    timestamptz,
  ultima_actividad_en timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  eliminado_en       timestamptz
);
CREATE TRIGGER trg_usuarios_tocar BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado();

CREATE TABLE credenciales_2fa (
  usuario_id      uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  secreto_cifrado text NOT NULL,
  confirmado_en   timestamptz
);

CREATE TABLE codigos_respaldo_2fa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hash_codigo text NOT NULL,
  usado_en    timestamptz
);
CREATE INDEX ix_codigos_respaldo_usuario ON codigos_respaldo_2fa(usuario_id);

CREATE TABLE sesiones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id          uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash          bytea NOT NULL UNIQUE,
  dispositivo         text NOT NULL DEFAULT '',
  ip                  inet,
  lugar               text NOT NULL DEFAULT '',
  creada_en           timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en timestamptz NOT NULL DEFAULT now(),
  expira_en           timestamptz NOT NULL,
  revocada_en         timestamptz
);
CREATE INDEX ix_sesiones_usuario_vigentes ON sesiones(usuario_id) WHERE revocada_en IS NULL;

CREATE TABLE tokens_verificacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        tipo_token NOT NULL,
  token_hash  bytea NOT NULL UNIQUE,
  expira_en   timestamptz NOT NULL,
  usado_en    timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_tokens_usuario_tipo ON tokens_verificacion(usuario_id, tipo);

CREATE TABLE preferencias_usuario (
  usuario_id          uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  tema                tema_ui NOT NULL DEFAULT 'sistema',
  densidad            densidad_ui NOT NULL DEFAULT 'comoda',
  tamano_texto        tamano_texto_ui NOT NULL DEFAULT 'normal',
  reducir_movimiento  boolean NOT NULL DEFAULT false,
  idioma              text NOT NULL DEFAULT 'es-MX',
  formato_hora        text NOT NULL DEFAULT '24h' CHECK (formato_hora IN ('24h', '12h')),
  formato_fecha       text NOT NULL DEFAULT 'dd/mm' CHECK (formato_fecha IN ('dd/mm', 'mm/dd')),
  primer_dia          text NOT NULL DEFAULT 'lunes' CHECK (primer_dia IN ('lunes', 'domingo')),
  silencio_desde      time,
  silencio_hasta      time,
  resumen_diario      boolean NOT NULL DEFAULT false,
  estado_visible      boolean NOT NULL DEFAULT true,
  tour_visto          boolean NOT NULL DEFAULT false
);

CREATE TABLE preferencias_notificacion (
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  evento      text NOT NULL,
  por_app     boolean NOT NULL DEFAULT true,
  por_whatsapp boolean NOT NULL DEFAULT false,
  por_correo  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (usuario_id, evento)
);

CREATE TABLE whatsapp_usuario (
  usuario_id                 uuid PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  numero_e164                text NOT NULL UNIQUE CHECK (numero_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  verificado_en              timestamptz,
  consentimiento_en          timestamptz,
  consentimiento_revocado_en timestamptz
);

-- ---------------------------------------------------------------------
-- 3. EQUIPOS, MEMBRESÍAS E INVITACIONES
-- ---------------------------------------------------------------------
CREATE TABLE equipos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 60),
  descripcion             text NOT NULL DEFAULT '',
  duracion_sprint_semanas smallint NOT NULL DEFAULT 2 CHECK (duracion_sprint_semanas IN (1, 2, 3)),
  zona_horaria            text NOT NULL DEFAULT 'America/Mexico_City',
  politica_propuestas     politica_propuestas NOT NULL DEFAULT 'triaje',
  votacion_plazo_horas    smallint NOT NULL DEFAULT 72 CHECK (votacion_plazo_horas BETWEEN 1 AND 336),
  votacion_desempate_horas smallint NOT NULL DEFAULT 24 CHECK (votacion_desempate_horas BETWEEN 1 AND 168),
  max_miembros            smallint NOT NULL DEFAULT 8 CHECK (max_miembros BETWEEN 1 AND 8),
  estado                  estado_equipo NOT NULL DEFAULT 'activo',
  creado_por              uuid NOT NULL REFERENCES usuarios(id),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  archivado_en            timestamptz
);
CREATE TRIGGER trg_equipos_tocar BEFORE UPDATE ON equipos
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado();

CREATE TABLE membresias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id         uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  usuario_id        uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol               rol_membresia NOT NULL,
  estado            estado_membresia NOT NULL DEFAULT 'activa',
  color_idx         smallint CHECK (color_idx >= 0),
  consentimiento_wa boolean,                        -- NULL = no respondió
  en_grupo_wa       boolean NOT NULL DEFAULT false,
  caduca_en         timestamptz,                    -- solo invitados
  desde             timestamptz NOT NULL DEFAULT now(),
  hasta             timestamptz,
  CHECK (rol = 'invitado' OR color_idx IS NOT NULL),
  CHECK (rol = 'invitado' OR caduca_en IS NULL),
  CHECK ((estado = 'activa') = (hasta IS NULL))
);
-- Un usuario tiene como máximo una membresía ACTIVA por equipo (conserva historial).
CREATE UNIQUE INDEX ux_membresia_activa_usuario ON membresias(equipo_id, usuario_id) WHERE estado = 'activa';
-- Un solo líder activo por equipo.
CREATE UNIQUE INDEX ux_un_lider_activo ON membresias(equipo_id) WHERE rol = 'lider' AND estado = 'activa';
-- Color distinto por integrante activo (no aplica a invitados).
CREATE UNIQUE INDEX ux_color_activo ON membresias(equipo_id, color_idx) WHERE estado = 'activa' AND rol <> 'invitado';
CREATE INDEX ix_membresias_usuario ON membresias(usuario_id) WHERE estado = 'activa';

-- Límite de miembros (líder + integrantes; los invitados no cuentan). Seguro ante concurrencia.
CREATE OR REPLACE FUNCTION fn_limite_miembros() RETURNS trigger AS $$
DECLARE
  v_max      smallint;
  v_actuales integer;
BEGIN
  IF NEW.estado = 'activa' AND NEW.rol IN ('lider', 'integrante') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.equipo_id::text, 0));
    SELECT max_miembros INTO v_max FROM equipos WHERE id = NEW.equipo_id;
    SELECT count(*) INTO v_actuales
      FROM membresias
     WHERE equipo_id = NEW.equipo_id AND estado = 'activa'
       AND rol IN ('lider', 'integrante') AND id <> NEW.id;
    IF v_actuales >= v_max THEN
      RAISE EXCEPTION 'LIMITE_MIEMBROS: el equipo ya tiene % miembros activos', v_max
        USING ERRCODE = 'NX001';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_limite_miembros
  BEFORE INSERT OR UPDATE OF estado, rol ON membresias
  FOR EACH ROW EXECUTE FUNCTION fn_limite_miembros();

-- Primer color libre (0, 1, 2…) para un integrante nuevo del equipo.
CREATE OR REPLACE FUNCTION fn_siguiente_color_idx(p_equipo uuid) RETURNS smallint AS $$
  SELECT g::smallint FROM generate_series(0, 63) AS g
   WHERE NOT EXISTS (SELECT 1 FROM membresias m
                      WHERE m.equipo_id = p_equipo AND m.estado = 'activa'
                        AND m.rol <> 'invitado' AND m.color_idx = g)
   ORDER BY g LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE TABLE invitaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id    uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  codigo       text NOT NULL UNIQUE,
  rol_destino  rol_membresia NOT NULL CHECK (rol_destino IN ('integrante', 'invitado')),
  correo       citext,
  caduca_en    timestamptz NOT NULL,
  duracion_invitado_dias smallint CHECK (duracion_invitado_dias > 0),
  estado       estado_invitacion NOT NULL DEFAULT 'pendiente',
  creada_por   uuid NOT NULL REFERENCES usuarios(id),
  creada_en    timestamptz NOT NULL DEFAULT now(),
  aceptada_por uuid REFERENCES usuarios(id),
  aceptada_en  timestamptz
);
CREATE INDEX ix_invitaciones_equipo ON invitaciones(equipo_id, estado);

CREATE TABLE solicitudes_invitado (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        tipo_solicitud_invitado NOT NULL,
  estado      estado_solicitud NOT NULL DEFAULT 'pendiente',
  creada_en   timestamptz NOT NULL DEFAULT now(),
  resuelta_por uuid REFERENCES usuarios(id),
  resuelta_en timestamptz
);
CREATE UNIQUE INDEX ux_solicitud_pendiente ON solicitudes_invitado(equipo_id, usuario_id, tipo) WHERE estado = 'pendiente';

-- ---------------------------------------------------------------------
-- 4. SPRINTS
-- ---------------------------------------------------------------------
CREATE TABLE sprints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id  uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  numero     integer NOT NULL CHECK (numero > 0),
  objetivo   text NOT NULL DEFAULT '',
  inicio     date NOT NULL,
  fin        date NOT NULL,
  estado     estado_sprint NOT NULL DEFAULT 'planificado',
  cerrado_en timestamptz,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipo_id, numero),
  CHECK (fin > inicio)
);
-- Solo un sprint activo por equipo.
CREATE UNIQUE INDEX ux_un_sprint_activo ON sprints(equipo_id) WHERE estado = 'activo';

CREATE TABLE sprint_capacidad (
  sprint_id  uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  horas      smallint NOT NULL CHECK (horas >= 0),
  PRIMARY KEY (sprint_id, usuario_id)
);

-- Una fila por día del sprint (la llena el job nocturno): alimenta el burndown.
CREATE TABLE sprint_instantaneas (
  sprint_id   uuid NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  dia         date NOT NULL,
  total       integer NOT NULL,
  completadas integer NOT NULL,
  PRIMARY KEY (sprint_id, dia),
  CHECK (completadas <= total)
);

-- ---------------------------------------------------------------------
-- 5. TAREAS
-- ---------------------------------------------------------------------
CREATE TABLE tareas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id            uuid REFERENCES equipos(id) ON DELETE CASCADE,   -- NULL = tarea personal
  dueno_id             uuid REFERENCES usuarios(id) ON DELETE CASCADE,  -- dueño de tarea personal
  codigo               integer NOT NULL,                                 -- T-01, T-02… (por equipo o por dueño)
  titulo               text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 140),
  descripcion          text NOT NULL DEFAULT '',
  responsable_id       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  proponente_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  estado               estado_tarea NOT NULL DEFAULT 'backlog',
  progreso             smallint NOT NULL DEFAULT 0 CHECK (progreso BETWEEN 0 AND 100),
  vence_en             timestamptz,
  prioridad            prioridad_tarea NOT NULL DEFAULT 'media',
  sprint_id            uuid REFERENCES sprints(id) ON DELETE SET NULL,
  motivo               text,                      -- obligatorio al atascar o rechazar
  rechazo_por          rechazo_por,
  cambios_pedidos      text,
  resultado            resultado_tarea,
  asignacion_pendiente boolean NOT NULL DEFAULT false,
  origen               origen_tarea NOT NULL DEFAULT 'directa',
  mensaje_origen_id    uuid,                      -- FK diferida (ver ALTER en la sección 6)
  orden                text NOT NULL DEFAULT 'a0',   -- índice fraccionario (reordenar sin colisiones)
  version              integer NOT NULL DEFAULT 1,   -- concurrencia optimista
  archivada            boolean NOT NULL DEFAULT false,
  creada_por           uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  completada_en        timestamptz,
  CHECK (equipo_id IS NOT NULL OR dueno_id IS NOT NULL),
  CHECK (equipo_id IS NULL OR dueno_id IS NULL),
  CHECK (estado NOT IN ('atascada', 'rechazada') OR motivo IS NOT NULL),
  CHECK ((estado = 'completada') = (completada_en IS NOT NULL)),
  CHECK ((estado = 'completada') = (resultado IS NOT NULL)),
  CHECK (estado <> 'completada' OR progreso = 100)
);
CREATE UNIQUE INDEX ux_tarea_codigo_equipo ON tareas(equipo_id, codigo) WHERE equipo_id IS NOT NULL;
CREATE UNIQUE INDEX ux_tarea_codigo_dueno  ON tareas(dueno_id, codigo)  WHERE dueno_id IS NOT NULL;
CREATE INDEX ix_tareas_equipo_estado ON tareas(equipo_id, estado) WHERE NOT archivada;
CREATE INDEX ix_tareas_sprint        ON tareas(sprint_id) WHERE sprint_id IS NOT NULL;
CREATE INDEX ix_tareas_responsable   ON tareas(responsable_id, estado) WHERE responsable_id IS NOT NULL;
CREATE INDEX ix_tareas_vence         ON tareas(vence_en) WHERE vence_en IS NOT NULL AND estado <> 'completada';
CREATE INDEX ix_tareas_dueno         ON tareas(dueno_id, estado) WHERE dueno_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_tarea_antes_de_actualizar() RETURNS trigger AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_tareas_version BEFORE UPDATE ON tareas
  FOR EACH ROW EXECUTE FUNCTION fn_tarea_antes_de_actualizar();

-- Número consecutivo de tarea por equipo (T-01…) sin huecos por concurrencia.
CREATE OR REPLACE FUNCTION fn_tarea_asignar_codigo() RETURNS trigger AS $$
DECLARE v_clave text;
BEGIN
  v_clave := COALESCE(NEW.equipo_id::text, NEW.dueno_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_clave, 1));
  IF NEW.codigo IS NULL OR NEW.codigo = 0 THEN
    SELECT COALESCE(max(codigo), 0) + 1 INTO NEW.codigo FROM tareas
     WHERE (NEW.equipo_id IS NOT NULL AND equipo_id = NEW.equipo_id)
        OR (NEW.equipo_id IS NULL AND dueno_id = NEW.dueno_id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_tareas_codigo BEFORE INSERT ON tareas
  FOR EACH ROW EXECUTE FUNCTION fn_tarea_asignar_codigo();

CREATE TABLE subtareas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id  uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  titulo    text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 140),
  hecha     boolean NOT NULL DEFAULT false,
  orden     text NOT NULL DEFAULT 'a0'
);
CREATE INDEX ix_subtareas_tarea ON subtareas(tarea_id);

CREATE TABLE etiquetas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id  uuid REFERENCES equipos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre     citext NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 30),
  CHECK ((equipo_id IS NULL) <> (usuario_id IS NULL))
);
CREATE UNIQUE INDEX ux_etiqueta_equipo  ON etiquetas(equipo_id, nombre)  WHERE equipo_id IS NOT NULL;
CREATE UNIQUE INDEX ux_etiqueta_usuario ON etiquetas(usuario_id, nombre) WHERE usuario_id IS NOT NULL;

CREATE TABLE tarea_etiquetas (
  tarea_id    uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  etiqueta_id uuid NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, etiqueta_id)
);

-- Tareas visibles para un invitado concreto (relación N:M con su membresía).
CREATE TABLE tarea_compartida (
  tarea_id     uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  membresia_id uuid NOT NULL REFERENCES membresias(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, membresia_id)
);

CREATE TABLE comentarios_tarea (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id   uuid NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  autor_id   uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  texto      text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 4000),
  creado_en  timestamptz NOT NULL DEFAULT now(),
  editado_en timestamptz
);
CREATE INDEX ix_comentarios_tarea ON comentarios_tarea(tarea_id, creado_en);

-- ---------------------------------------------------------------------
-- 6. CHAT
-- ---------------------------------------------------------------------
CREATE TABLE conversaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  tipo        tipo_conversacion NOT NULL,
  nombre      text NOT NULL DEFAULT '',
  tarea_id    uuid REFERENCES tareas(id) ON DELETE CASCADE,
  dm_usuario_a uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  dm_usuario_b uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'tarea') = (tarea_id IS NOT NULL)),
  CHECK ((tipo = 'dm') = (dm_usuario_a IS NOT NULL AND dm_usuario_b IS NOT NULL)),
  CHECK (dm_usuario_a IS NULL OR dm_usuario_a < dm_usuario_b)
);
CREATE UNIQUE INDEX ux_conv_equipo     ON conversaciones(equipo_id) WHERE tipo = 'equipo';
CREATE UNIQUE INDEX ux_conv_invitados  ON conversaciones(equipo_id) WHERE tipo = 'invitados';
CREATE UNIQUE INDEX ux_conv_tarea      ON conversaciones(tarea_id)  WHERE tipo = 'tarea';
CREATE UNIQUE INDEX ux_conv_dm         ON conversaciones(equipo_id, dm_usuario_a, dm_usuario_b) WHERE tipo = 'dm';

CREATE TABLE mensajes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,          -- orden total y cursor de paginación
  conversacion_id uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor_id        uuid REFERENCES usuarios(id) ON DELETE SET NULL,  -- NULL en mensajes de sistema
  es_sistema      boolean NOT NULL DEFAULT false,
  texto           text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 4000),
  hilo_de_id      uuid REFERENCES mensajes(id) ON DELETE CASCADE,
  tarea_vinculada_id uuid REFERENCES tareas(id) ON DELETE SET NULL,
  fijado          boolean NOT NULL DEFAULT false,
  id_cliente      uuid,                                            -- idempotencia al reenviar
  creado_en       timestamptz NOT NULL DEFAULT now(),
  editado_en      timestamptz,
  eliminado_en    timestamptz,
  eliminado_por   uuid REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX ux_mensaje_id_cliente ON mensajes(conversacion_id, id_cliente) WHERE id_cliente IS NOT NULL;
CREATE INDEX ix_mensajes_conv_seq  ON mensajes(conversacion_id, seq DESC);
CREATE INDEX ix_mensajes_hilo      ON mensajes(hilo_de_id) WHERE hilo_de_id IS NOT NULL;
CREATE INDEX ix_mensajes_fijados   ON mensajes(conversacion_id) WHERE fijado;
CREATE INDEX ix_mensajes_busqueda  ON mensajes USING gin (to_tsvector('spanish', texto));

ALTER TABLE tareas ADD CONSTRAINT fk_tarea_mensaje_origen
  FOREIGN KEY (mensaje_origen_id) REFERENCES mensajes(id) ON DELETE SET NULL;

CREATE TABLE mensaje_reacciones (
  mensaje_id uuid NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo       tipo_reaccion NOT NULL,
  creada_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mensaje_id, usuario_id, tipo)
);

CREATE TABLE mensaje_menciones (
  mensaje_id uuid NOT NULL REFERENCES mensajes(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (mensaje_id, usuario_id)
);

-- Puntero de lectura por persona y conversación ("leído por N" se calcula contra él).
CREATE TABLE conversacion_lecturas (
  conversacion_id  uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  usuario_id       uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ultimo_leido_seq bigint NOT NULL DEFAULT 0,
  fijada           boolean NOT NULL DEFAULT false,
  silenciada       boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversacion_id, usuario_id)
);

-- ---------------------------------------------------------------------
-- 7. ARCHIVOS
-- ---------------------------------------------------------------------
CREATE TABLE archivos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id     uuid REFERENCES equipos(id) ON DELETE CASCADE,
  subido_por    uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre        text NOT NULL,
  mime          text NOT NULL,
  tamano_bytes  bigint NOT NULL CHECK (tamano_bytes >= 0),
  storage_key   text NOT NULL UNIQUE,
  sha256        text,
  tipo          tipo_archivo NOT NULL DEFAULT 'otro',
  tarea_id      uuid REFERENCES tareas(id) ON DELETE CASCADE,
  mensaje_id    uuid REFERENCES mensajes(id) ON DELETE CASCADE,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  eliminado_en  timestamptz,
  CHECK (tarea_id IS NULL OR mensaje_id IS NULL)
);
CREATE INDEX ix_archivos_equipo  ON archivos(equipo_id, creado_en DESC) WHERE eliminado_en IS NULL;
CREATE INDEX ix_archivos_tarea   ON archivos(tarea_id)   WHERE tarea_id IS NOT NULL;
CREATE INDEX ix_archivos_mensaje ON archivos(mensaje_id) WHERE mensaje_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 8. CALENDARIO
-- ---------------------------------------------------------------------
CREATE TABLE reuniones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id      uuid REFERENCES equipos(id) ON DELETE CASCADE,
  dueno_id       uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo         text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 120),
  inicio         timestamptz NOT NULL,
  duracion_min   smallint NOT NULL DEFAULT 30 CHECK (duracion_min BETWEEN 5 AND 720),
  repeticion     repeticion_reunion NOT NULL DEFAULT 'ninguna',
  lugar          text NOT NULL DEFAULT '',
  descripcion    text NOT NULL DEFAULT '',
  recordatorio_min smallint NOT NULL DEFAULT 15,
  avisar_wa      boolean NOT NULL DEFAULT false,
  creada_por     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  cancelada_en   timestamptz,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (equipo_id IS NOT NULL OR dueno_id IS NOT NULL),
  CHECK (equipo_id IS NULL OR dueno_id IS NULL)
);
CREATE TRIGGER trg_reuniones_tocar BEFORE UPDATE ON reuniones
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado();
CREATE INDEX ix_reuniones_equipo_inicio ON reuniones(equipo_id, inicio) WHERE equipo_id IS NOT NULL;
CREATE INDEX ix_reuniones_dueno_inicio  ON reuniones(dueno_id, inicio)  WHERE dueno_id IS NOT NULL;

CREATE TABLE reunion_asistencia (
  reunion_id uuid NOT NULL REFERENCES reuniones(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  respuesta  respuesta_asistencia NOT NULL DEFAULT 'pendiente',
  PRIMARY KEY (reunion_id, usuario_id)
);

-- ---------------------------------------------------------------------
-- 9. EVENTOS DE DOMINIO (outbox), ACTIVIDAD Y NOTIFICACIONES
-- ---------------------------------------------------------------------
CREATE TABLE eventos_dominio (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  equipo_id     uuid REFERENCES equipos(id) ON DELETE CASCADE,
  tipo          text NOT NULL,           -- p. ej. 'tarea.aceptada', 'reunion.creada'
  objeto_tipo   text NOT NULL,
  objeto_id     uuid NOT NULL,
  actor_id      uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  carga         jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  procesado_en  timestamptz,
  intentos      smallint NOT NULL DEFAULT 0,
  ultimo_error  text
);
CREATE INDEX ix_eventos_pendientes ON eventos_dominio(id) WHERE procesado_en IS NULL;
CREATE INDEX ix_eventos_equipo     ON eventos_dominio(equipo_id, creado_en DESC);

CREATE TABLE actividad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   uuid REFERENCES equipos(id) ON DELETE CASCADE,
  usuario_id  uuid REFERENCES usuarios(id) ON DELETE CASCADE,   -- ámbito personal
  autor_id    uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo        text NOT NULL CHECK (tipo IN ('tarea', 'chat', 'reunion', 'equipo', 'sprint', 'whatsapp')),
  accion      text NOT NULL,
  objeto_tipo text NOT NULL,
  objeto_id   uuid,
  resumen     text NOT NULL,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CHECK (equipo_id IS NOT NULL OR usuario_id IS NOT NULL)
);
CREATE INDEX ix_actividad_equipo ON actividad(equipo_id, creado_en DESC);
CREATE INDEX ix_actividad_objeto ON actividad(objeto_tipo, objeto_id, creado_en DESC);

CREATE TABLE notificaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  equipo_id   uuid REFERENCES equipos(id) ON DELETE CASCADE,
  categoria   categoria_notificacion NOT NULL,
  icono       text NOT NULL DEFAULT 'bell',
  titulo      text NOT NULL,
  texto       text NOT NULL DEFAULT '',
  enlace      text,
  accion_tipo text CHECK (accion_tipo IN ('aceptar_tarea', 'ver_reunion', 'abrir_chat', 'ver_eleccion', 'liderazgo')),
  accion_ref  text,
  evento_id   bigint REFERENCES eventos_dominio(id) ON DELETE SET NULL,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  leida_en    timestamptz
);
CREATE INDEX ix_notif_usuario_no_leidas ON notificaciones(usuario_id, creada_en DESC) WHERE leida_en IS NULL;
CREATE INDEX ix_notif_usuario ON notificaciones(usuario_id, creada_en DESC);

-- ---------------------------------------------------------------------
-- 10. WHATSAPP
-- ---------------------------------------------------------------------
CREATE TABLE whatsapp_configuracion (
  equipo_id         uuid PRIMARY KEY REFERENCES equipos(id) ON DELETE CASCADE,
  proveedor         proveedor_whatsapp NOT NULL DEFAULT 'simulado',
  estado            estado_whatsapp NOT NULL DEFAULT 'sin_configurar',
  grupo_externo_id  text,
  grupo_nombre      text,
  enlace_invitacion text,
  causa_error       text,
  ultimo_envio_en   timestamptz,
  reporte_frecuencia frecuencia_reporte NOT NULL DEFAULT 'diario',
  reporte_hora      time NOT NULL DEFAULT '18:00',
  reporte_dia       smallint NOT NULL DEFAULT 5 CHECK (reporte_dia BETWEEN 1 AND 7),
  agrupar           boolean NOT NULL DEFAULT true,
  silencio_desde    time,
  silencio_hasta    time,
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_wa_config_tocar BEFORE UPDATE ON whatsapp_configuracion
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado();

-- Reglas por tipo de evento: ¿se avisa al instante, va al reporte o está apagado?
CREATE TABLE whatsapp_reglas (
  equipo_id   uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL CHECK (tipo_evento IN ('reunion', 'urgente', 'aceptada', 'asignacion', 'actualizacion', 'triaje')),
  modo        modo_regla_wa NOT NULL,
  PRIMARY KEY (equipo_id, tipo_evento)
);

-- Un solo ciclo de vida por aviso: pendiente → (programado) → enviando → enviado | fallido | cancelado.
-- La "cola" y el "historial" de la interfaz son filtros por estado sobre esta tabla.
CREATE TABLE whatsapp_mensajes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id            uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  evento_id            bigint REFERENCES eventos_dominio(id) ON DELETE SET NULL,
  tipo_evento          text NOT NULL,
  motivo               text NOT NULL DEFAULT '',
  texto                text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 400),
  tipo_envio           tipo_envio_wa NOT NULL,
  estado               estado_mensaje_wa NOT NULL DEFAULT 'pendiente',
  seleccionado         boolean NOT NULL DEFAULT true,
  programado_para      timestamptz,
  enviado_por          uuid REFERENCES usuarios(id) ON DELETE SET NULL,   -- NULL = enviado por el sistema
  enviado_en           timestamptz,
  proveedor_mensaje_id text,
  intentos             smallint NOT NULL DEFAULT 0,
  ultimo_error         text,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'enviado' OR enviado_en IS NOT NULL),
  CHECK (estado <> 'programado' OR programado_para IS NOT NULL)
);
CREATE INDEX ix_wa_msj_equipo_estado ON whatsapp_mensajes(equipo_id, estado, creado_en DESC);
CREATE INDEX ix_wa_msj_programados   ON whatsapp_mensajes(programado_para) WHERE estado = 'programado';

-- Bitácora idempotente de webhooks de Meta (solicitudes de unión, estados de entrega, etc.).
CREATE TABLE whatsapp_webhook_eventos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_evento_id  text UNIQUE,
  tipo                 text NOT NULL,
  carga                jsonb NOT NULL,
  recibido_en          timestamptz NOT NULL DEFAULT now(),
  procesado_en         timestamptz,
  error                text
);

-- ---------------------------------------------------------------------
-- 11. LIDERAZGO: TRANSFERENCIA Y ELECCIÓN
-- ---------------------------------------------------------------------
CREATE TABLE transferencias_liderazgo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  de_id       uuid NOT NULL REFERENCES usuarios(id),
  a_id        uuid NOT NULL REFERENCES usuarios(id),
  saldra      boolean NOT NULL DEFAULT false,
  estado      estado_transferencia NOT NULL DEFAULT 'pendiente',
  creada_en   timestamptz NOT NULL DEFAULT now(),
  resuelta_en timestamptz,
  CHECK (de_id <> a_id)
);
CREATE UNIQUE INDEX ux_transferencia_pendiente ON transferencias_liderazgo(equipo_id) WHERE estado = 'pendiente';

CREATE TABLE elecciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  fase        fase_eleccion NOT NULL DEFAULT 'postulacion',
  ronda       smallint NOT NULL DEFAULT 1 CHECK (ronda IN (1, 2)),
  plazo_en    timestamptz NOT NULL,
  saliente_id uuid NOT NULL REFERENCES usuarios(id),
  ganador_id  uuid REFERENCES usuarios(id),
  creada_en   timestamptz NOT NULL DEFAULT now(),
  cerrada_en  timestamptz
);
-- Una sola elección abierta por equipo.
CREATE UNIQUE INDEX ux_eleccion_abierta ON elecciones(equipo_id) WHERE cerrada_en IS NULL;

CREATE TABLE eleccion_candidatos (
  eleccion_id uuid NOT NULL REFERENCES elecciones(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuarios(id),
  PRIMARY KEY (eleccion_id, usuario_id)
);

CREATE TABLE eleccion_votos (
  eleccion_id  uuid NOT NULL,
  ronda        smallint NOT NULL CHECK (ronda IN (1, 2)),
  votante_id   uuid NOT NULL REFERENCES usuarios(id),
  candidato_id uuid NOT NULL,
  emitido_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (eleccion_id, ronda, votante_id),
  FOREIGN KEY (eleccion_id, candidato_id) REFERENCES eleccion_candidatos(eleccion_id, usuario_id) ON DELETE CASCADE
);

-- El líder saliente no vota (regla de negocio RN-LID-05).
CREATE OR REPLACE FUNCTION fn_voto_valido() RETURNS trigger AS $$
DECLARE v_saliente uuid;
BEGIN
  SELECT saliente_id INTO v_saliente FROM elecciones WHERE id = NEW.eleccion_id;
  IF NEW.votante_id = v_saliente THEN
    RAISE EXCEPTION 'VOTO_INVALIDO: el líder saliente no vota' USING ERRCODE = 'NX002';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_voto_valido BEFORE INSERT ON eleccion_votos
  FOR EACH ROW EXECUTE FUNCTION fn_voto_valido();

-- ---------------------------------------------------------------------
-- 12. RETROSPECTIVA
-- ---------------------------------------------------------------------
CREATE TABLE retrospectivas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id        uuid NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  sprint_id        uuid NOT NULL UNIQUE REFERENCES sprints(id) ON DELETE CASCADE,
  votacion_cerrada boolean NOT NULL DEFAULT false,
  cerrada          boolean NOT NULL DEFAULT false,
  creada_en        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE retro_notas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retro_id  uuid NOT NULL REFERENCES retrospectivas(id) ON DELETE CASCADE,
  columna   columna_retro NOT NULL,
  texto     text NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 500),
  autor_id  uuid REFERENCES usuarios(id) ON DELETE SET NULL,   -- NULL = nota anónima (no se guarda quién fue)
  grupo     text,
  tarea_id  uuid REFERENCES tareas(id) ON DELETE SET NULL,
  creada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_retro_notas_retro ON retro_notas(retro_id, columna);

CREATE TABLE retro_votos (
  nota_id    uuid NOT NULL REFERENCES retro_notas(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (nota_id, usuario_id)
);

-- Máximo 3 puntos de voto por persona y retrospectiva (RN-SPR-07).
CREATE OR REPLACE FUNCTION fn_retro_limite_votos() RETURNS trigger AS $$
DECLARE v_retro uuid; v_usados integer;
BEGIN
  SELECT retro_id INTO v_retro FROM retro_notas WHERE id = NEW.nota_id;
  SELECT count(*) INTO v_usados FROM retro_votos rv JOIN retro_notas rn ON rn.id = rv.nota_id
   WHERE rn.retro_id = v_retro AND rv.usuario_id = NEW.usuario_id;
  IF v_usados >= 3 THEN
    RAISE EXCEPTION 'LIMITE_VOTOS: máximo 3 votos por persona' USING ERRCODE = 'NX003';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_retro_limite_votos BEFORE INSERT ON retro_votos
  FOR EACH ROW EXECUTE FUNCTION fn_retro_limite_votos();

-- ---------------------------------------------------------------------
-- 13. PLANTILLAS, EXPORTACIONES Y CONTACTO
-- ---------------------------------------------------------------------
CREATE TABLE plantillas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id   uuid REFERENCES equipos(id) ON DELETE CASCADE,
  usuario_id  uuid REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre      text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  tipo        tipo_plantilla NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  creada_en   timestamptz NOT NULL DEFAULT now(),
  CHECK ((equipo_id IS NULL) <> (usuario_id IS NULL))
);

CREATE TABLE plantilla_elementos (
  plantilla_id uuid NOT NULL REFERENCES plantillas(id) ON DELETE CASCADE,
  orden        smallint NOT NULL,
  texto        text NOT NULL,
  PRIMARY KEY (plantilla_id, orden)
);

CREATE TABLE exportaciones_datos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estado       estado_exportacion NOT NULL DEFAULT 'preparando',
  archivo_id   uuid REFERENCES archivos(id) ON DELETE SET NULL,
  solicitada_en timestamptz NOT NULL DEFAULT now(),
  lista_en     timestamptz,
  expira_en    timestamptz
);

CREATE TABLE contacto_mensajes (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    text NOT NULL,
  correo    citext NOT NULL,
  asunto    text NOT NULL,
  mensaje   text NOT NULL CHECK (char_length(mensaje) BETWEEN 10 AND 4000),
  creado_en timestamptz NOT NULL DEFAULT now(),
  atendido_en timestamptz
);

-- ---------------------------------------------------------------------
-- 14. VISTAS DE APOYO (solo lectura)
-- ---------------------------------------------------------------------
CREATE VIEW v_miembros_activos AS
SELECT m.equipo_id, m.id AS membresia_id, m.usuario_id, u.nombre, m.rol, m.color_idx, m.en_grupo_wa, m.consentimiento_wa
  FROM membresias m JOIN usuarios u ON u.id = m.usuario_id
 WHERE m.estado = 'activa';

CREATE VIEW v_equipo_cupo AS
SELECT e.id AS equipo_id, e.max_miembros,
       count(*) FILTER (WHERE m.estado = 'activa' AND m.rol IN ('lider', 'integrante')) AS miembros_activos,
       count(*) FILTER (WHERE m.estado = 'activa' AND m.rol = 'invitado')               AS invitados_activos
  FROM equipos e LEFT JOIN membresias m ON m.equipo_id = e.id
 GROUP BY e.id;

-- Semáforo de entrega (RN-TAR-08): verde a tiempo, ámbar < 48 h, rojo vencida.
CREATE VIEW v_tareas_semaforo AS
SELECT t.*,
       CASE
         WHEN t.estado = 'completada' AND t.resultado = 'con_retraso' THEN 'ambar'
         WHEN t.estado = 'completada'                                  THEN 'verde'
         WHEN t.vence_en IS NULL                                       THEN NULL
         WHEN t.vence_en < now()                                       THEN 'rojo'
         WHEN t.vence_en < now() + interval '48 hours'                 THEN 'ambar'
         ELSE 'verde'
       END AS semaforo
  FROM tareas t;

-- ---------------------------------------------------------------------
-- 15. COMENTARIOS (alimentan el diccionario de datos de docs/02_Base_de_Datos.md)
-- ---------------------------------------------------------------------
COMMENT ON TABLE usuarios IS 'Cuenta de persona. Borrado lógico con eliminado_en.';
COMMENT ON TABLE credenciales_2fa IS 'Secreto TOTP cifrado de la verificación en dos pasos.';
COMMENT ON TABLE codigos_respaldo_2fa IS 'Códigos de respaldo de un solo uso (solo se guarda su hash).';
COMMENT ON TABLE sesiones IS 'Sesiones de servidor; la cookie lleva un token opaco y aquí vive su hash.';
COMMENT ON TABLE tokens_verificacion IS 'Tokens de un solo uso para verificar correo y restablecer contraseña (hash).';
COMMENT ON TABLE preferencias_usuario IS 'Apariencia, formatos y silencio horario de cada persona (1:1 con usuarios).';
COMMENT ON TABLE preferencias_notificacion IS 'Matriz evento × canal (app, WhatsApp, correo) por persona.';
COMMENT ON TABLE whatsapp_usuario IS 'Número de WhatsApp de la persona, su verificación y su consentimiento.';
COMMENT ON TABLE equipos IS 'Equipo de trabajo. max_miembros (≤ 8) limita líder + integrantes activos.';
COMMENT ON TABLE membresias IS 'Pertenencia de una persona a un equipo con rol, color y estado. Conserva historial.';
COMMENT ON TABLE invitaciones IS 'Códigos o enlaces para unirse como integrante o invitado.';
COMMENT ON TABLE solicitudes_invitado IS 'Solicitudes de un invitado: ampliar su acceso o convertirse en integrante.';
COMMENT ON TABLE sprints IS 'Sprint de un equipo. Solo uno activo por equipo (índice parcial).';
COMMENT ON TABLE sprint_capacidad IS 'Horas disponibles por persona en la planeación de un sprint.';
COMMENT ON TABLE sprint_instantaneas IS 'Foto diaria (total y completadas) para el burndown; la llena un job nocturno.';
COMMENT ON TABLE tareas IS 'Tarea de equipo (equipo_id) o personal (dueno_id). version permite concurrencia optimista.';
COMMENT ON TABLE subtareas IS 'Pasos de una tarea.';
COMMENT ON TABLE etiquetas IS 'Etiquetas de un equipo o de una persona.';
COMMENT ON TABLE tarea_etiquetas IS 'Relación N:M entre tareas y etiquetas.';
COMMENT ON TABLE tarea_compartida IS 'Tareas visibles para una membresía de invitado concreta (N:M).';
COMMENT ON TABLE comentarios_tarea IS 'Comentarios de la pestaña Comentarios del detalle de tarea.';
COMMENT ON TABLE conversaciones IS 'Canal de chat: equipo, tarea, mensaje directo o invitados.';
COMMENT ON TABLE mensajes IS 'Mensajes de chat. seq da orden total y cursor de paginación.';
COMMENT ON TABLE mensaje_reacciones IS 'Reacciones (6 tipos) por persona y mensaje.';
COMMENT ON TABLE mensaje_menciones IS 'Personas mencionadas con @ en un mensaje (genera notificación).';
COMMENT ON TABLE conversacion_lecturas IS 'Puntero de lectura por persona; de él salen no leídos y "leído por N".';
COMMENT ON TABLE archivos IS 'Metadatos de archivos; el binario vive en almacenamiento de objetos (storage_key).';
COMMENT ON TABLE reuniones IS 'Reuniones de equipo o personales, con repetición simple.';
COMMENT ON TABLE reunion_asistencia IS 'Respuesta de cada convocado (Asistiré / No asistiré / Quizá).';
COMMENT ON TABLE eventos_dominio IS 'Bandeja de salida (outbox): hechos de negocio pendientes de procesar a notificaciones, actividad, chat y WhatsApp.';
COMMENT ON TABLE actividad IS 'Registro de actividad del equipo; también el historial de cada tarea.';
COMMENT ON TABLE notificaciones IS 'Notificaciones dentro de la app.';
COMMENT ON TABLE whatsapp_configuracion IS 'Configuración de la integración con WhatsApp por equipo (1:1).';
COMMENT ON TABLE whatsapp_reglas IS 'Para cada tipo de evento: aviso instantáneo, reporte o apagado.';
COMMENT ON TABLE whatsapp_mensajes IS 'Avisos de WhatsApp con ciclo de vida único (cola e historial son filtros por estado).';
COMMENT ON TABLE whatsapp_webhook_eventos IS 'Bitácora idempotente de webhooks de Meta.';
COMMENT ON TABLE transferencias_liderazgo IS 'Ruta A: el líder propone ceder el liderazgo a un integrante.';
COMMENT ON TABLE elecciones IS 'Ruta B: elección de liderazgo por votación (72 h + desempate de 24 h).';
COMMENT ON TABLE eleccion_candidatos IS 'Candidatos de una elección.';
COMMENT ON TABLE eleccion_votos IS 'Un voto por votante y ronda; el líder saliente no vota.';
COMMENT ON TABLE retrospectivas IS 'Retrospectiva de un sprint (una por sprint).';
COMMENT ON TABLE retro_notas IS 'Notas Bien / Mejorar / Acciones; autor NULL = anónima.';
COMMENT ON TABLE retro_votos IS 'Puntos de voto sobre notas (máximo 3 por persona).';
COMMENT ON TABLE plantillas IS 'Plantillas de sprint, proyecto o retro.';
COMMENT ON TABLE plantilla_elementos IS 'Elementos ordenados de una plantilla.';
COMMENT ON TABLE exportaciones_datos IS 'Solicitudes de exportación de datos personales.';
COMMENT ON TABLE contacto_mensajes IS 'Mensajes del formulario público de contacto.';
