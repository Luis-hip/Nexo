-- Fase 5.4 · Semilla ampliada para rendimiento (docs/02, sección 14.3): 50 equipos, 500 usuarios,
-- 20 000 tareas y 200 000 mensajes, más 10 000 avisos de WhatsApp para la consulta Q4.
-- Solo para medir con EXPLAIN (`pnpm db:volumen` y `pnpm db:explain`); nunca en producción.
-- Todo lo que crea lleva el sufijo «@volumen.test» o el prefijo «Volumen »; se puede volver a
-- cargar: primero borra lo de una carga anterior.
BEGIN;

DELETE FROM equipos WHERE nombre LIKE 'Volumen %';
DELETE FROM usuarios WHERE correo LIKE '%@volumen.test';

-- 500 personas: 10 por equipo (líder, 7 integrantes y 2 invitados).
INSERT INTO usuarios (correo, nombre)
SELECT 'vol-' || i || '@volumen.test', 'Persona ' || i FROM generate_series(1, 500) i;

INSERT INTO equipos (nombre, creado_por)
SELECT 'Volumen ' || e, u.id
  FROM generate_series(1, 50) e
  JOIN usuarios u ON u.correo = 'vol-' || ((e - 1) * 10 + 1) || '@volumen.test';

INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx, caduca_en)
SELECT eq.id, u.id,
       (CASE WHEN k = 0 THEN 'lider' WHEN k <= 7 THEN 'integrante' ELSE 'invitado' END)::rol_membresia,
       CASE WHEN k <= 7 THEN k END,
       CASE WHEN k > 7 THEN now() + interval '30 days' END
  FROM generate_series(1, 50) e
 CROSS JOIN generate_series(0, 9) k
  JOIN equipos eq ON eq.nombre = 'Volumen ' || e
  JOIN usuarios u ON u.correo = 'vol-' || ((e - 1) * 10 + k + 1) || '@volumen.test';

INSERT INTO sprints (equipo_id, numero, inicio, fin, estado)
SELECT id, 1, current_date - 3, current_date + 11, 'activo' FROM equipos WHERE nombre LIKE 'Volumen %';

-- 400 tareas por equipo en todos los estados; la mitad en el sprint activo.
INSERT INTO tareas (equipo_id, codigo, titulo, estado, progreso, responsable_id, sprint_id, vence_en,
                    motivo, completada_en, resultado, origen, orden, creada_por)
SELECT eq.id, n, 'Tarea de volumen ' || n, x.est,
       CASE WHEN x.est = 'completada' THEN 100 ELSE (n * 7) % 100 END,
       resp.usuario_id,
       CASE WHEN n % 2 = 0 THEN sp.id END,
       now() + ((n % 30) - 10) * interval '1 day',
       CASE WHEN x.est = 'atascada' THEN 'Bloqueo de prueba' END,
       CASE WHEN x.est = 'completada' THEN now() END,
       CASE WHEN x.est = 'completada' THEN 'a_tiempo'::resultado_tarea END,
       'directa', 'a' || lpad(n::text, 5, '0'), eq.creado_por
  FROM equipos eq
  JOIN sprints sp ON sp.equipo_id = eq.id AND sp.estado = 'activo'
 CROSS JOIN generate_series(1, 400) n
 CROSS JOIN LATERAL (SELECT ((ARRAY['backlog','aceptada','habilitada','en_curso','atascada','completada','propuesta'])[1 + n % 7])::estado_tarea AS est) x
  JOIN membresias resp ON resp.equipo_id = eq.id AND resp.rol = 'integrante' AND resp.color_idx = 1 + n % 7
 WHERE eq.nombre LIKE 'Volumen %';

-- Cada invitado ve 5 tareas.
INSERT INTO tarea_compartida (tarea_id, membresia_id)
SELECT t.id, m.id
  FROM membresias m
  JOIN tareas t ON t.equipo_id = m.equipo_id AND t.codigo BETWEEN 1 AND 5
 WHERE m.rol = 'invitado' AND m.equipo_id IN (SELECT id FROM equipos WHERE nombre LIKE 'Volumen %');

-- Canal del equipo con 4000 mensajes por equipo (200 000 en total).
INSERT INTO conversaciones (equipo_id, tipo, nombre)
SELECT id, 'equipo', nombre FROM equipos WHERE nombre LIKE 'Volumen %';
INSERT INTO conversaciones (equipo_id, tipo, nombre)
SELECT id, 'invitados', 'Invitados' FROM equipos WHERE nombre LIKE 'Volumen %';

INSERT INTO mensajes (conversacion_id, autor_id, texto, creado_en)
SELECT c.id, m.usuario_id,
       (ARRAY['Revisamos la reunión del sprint', 'Ya subí el avance de la API', '¿Quién toma la tarea del tablero?',
              'Listo el despliegue de prueba', 'Hay un bloqueo con los permisos'])[1 + n % 5] || ' (' || n || ')',
       now() - (4000 - n) * interval '1 minute'
  FROM conversaciones c
 CROSS JOIN generate_series(1, 4000) n
  JOIN membresias m ON m.equipo_id = c.equipo_id AND m.rol <> 'invitado' AND m.color_idx = n % 8
 WHERE c.tipo = 'equipo' AND c.equipo_id IN (SELECT id FROM equipos WHERE nombre LIKE 'Volumen %');

-- Punteros de lectura: cada persona leyó hasta algún punto.
INSERT INTO conversacion_lecturas (conversacion_id, usuario_id, ultimo_leido_seq)
SELECT c.id, m.usuario_id,
       (SELECT min(seq) FROM mensajes WHERE conversacion_id = c.id) + 3000 + coalesce(m.color_idx, 0) * 100
  FROM conversaciones c
  JOIN membresias m ON m.equipo_id = c.equipo_id AND m.rol <> 'invitado'
 WHERE c.tipo = 'equipo' AND c.equipo_id IN (SELECT id FROM equipos WHERE nombre LIKE 'Volumen %');

-- 200 avisos de WhatsApp por equipo; casi todos ya enviados (historial) y unos pocos pendientes.
INSERT INTO whatsapp_mensajes (equipo_id, tipo_evento, texto, tipo_envio, estado, enviado_en, creado_en)
SELECT eq.id, 'aceptada', 'Aviso de volumen ' || n, 'instantaneo',
       (CASE WHEN n % 50 = 0 THEN 'pendiente' ELSE 'enviado' END)::estado_mensaje_wa,
       CASE WHEN n % 50 = 0 THEN NULL ELSE now() - n * interval '1 hour' END,
       now() - n * interval '1 hour'
  FROM equipos eq CROSS JOIN generate_series(1, 200) n
 WHERE eq.nombre LIKE 'Volumen %';

COMMIT;

ANALYZE;
