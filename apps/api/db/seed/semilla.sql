-- =====================================================================
-- NEXO · Datos semilla de demostración (Equipo Nexo del prototipo)
-- Solo para desarrollo y demos. Nunca cargar en producción.
-- =====================================================================
BEGIN;

INSERT INTO usuarios (id, correo, correo_verificado_en, nombre, cargo, descripcion) VALUES
 ('00000000-0000-4000-8000-000000000001','valeria@nexo.mx', now(),'Valeria Mendoza','Líder de proyecto','Coordino el equipo y el contacto con la asesora.'),
 ('00000000-0000-4000-8000-000000000002','carlos@nexo.mx',  now(),'Carlos Ramírez','Desarrollo backend','API, notificaciones y base de datos.'),
 ('00000000-0000-4000-8000-000000000003','daniela@nexo.mx', now(),'Daniela Torres','Diseño UX',''),
 ('00000000-0000-4000-8000-000000000004','emilio@nexo.mx',  now(),'Emilio Cruz','Integraciones',''),
 ('00000000-0000-4000-8000-000000000005','fernanda@nexo.mx',now(),'Fernanda Ruiz','Desarrollo frontend',''),
 ('00000000-0000-4000-8000-000000000006','gabriel@nexo.mx', now(),'Gabriel Soto','Desarrollo frontend',''),
 ('00000000-0000-4000-8000-000000000007','hilda@nexo.mx',   now(),'Hilda Vargas','Desarrollo full stack',''),
 ('00000000-0000-4000-8000-000000000008','ivan@nexo.mx',    now(),'Iván Pérez','QA y documentación',''),
 ('00000000-0000-4000-8000-000000000009','mariana.lozano@universidad.mx', now(),'Mariana Lozano','Asesora académica',''),
 ('00000000-0000-4000-8000-000000000010','jorge@salas-consultores.mx',    now(),'Jorge Salas','Cliente',''),
 ('00000000-0000-4000-8000-000000000011','paola.reyes@nexo.mx', now(),'Paola Reyes','Estudiante de Ingeniería','Organizo mis materias y entregas.');

INSERT INTO preferencias_usuario (usuario_id) SELECT id FROM usuarios;

INSERT INTO whatsapp_usuario (usuario_id, numero_e164, verificado_en, consentimiento_en) VALUES
 ('00000000-0000-4000-8000-000000000001','+525512345678', now(), now()),
 ('00000000-0000-4000-8000-000000000002','+525523456789', now(), now());

INSERT INTO equipos (id, nombre, descripcion, creado_por) VALUES
 ('10000000-0000-4000-8000-000000000001','Equipo Nexo','Equipo demo del prototipo','00000000-0000-4000-8000-000000000001');

-- Líder + 7 integrantes = 8 miembros activos (cupo completo). Después, 2 invitados.
INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx, consentimiento_wa, en_grupo_wa) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','lider',     0, true,  true),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','integrante', 1, true,  true),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','integrante', 2, true,  true),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','integrante', 3, true,  true),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005','integrante', 4, false, false),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000006','integrante', 5, NULL,  false),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007','integrante', 6, true,  true),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000008','integrante', 7, NULL,  false);
INSERT INTO membresias (equipo_id, usuario_id, rol, caduca_en) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','invitado', now() + interval '12 days'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','invitado', now() + interval '2 days');

INSERT INTO sprints (id, equipo_id, numero, objetivo, inicio, fin, estado, cerrado_en) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'Cimientos del proyecto', current_date-44, current_date-31,'cerrado', now()-interval '31 days'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',2,'Tablero y roles',       current_date-30, current_date-17,'cerrado', now()-interval '17 days'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',3,'Hill Chart y WhatsApp',  current_date-6,  current_date+7, 'activo',  NULL),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',4,'Chat y reportes',       current_date+8,  current_date+21,'planificado', NULL);

-- Tareas del equipo (el código T-01, T-02… lo asigna el trigger).
INSERT INTO tareas (equipo_id, titulo, descripcion, responsable_id, proponente_id, estado, progreso, vence_en, prioridad, sprint_id, motivo, resultado, completada_en, origen, creada_por) VALUES
 ('10000000-0000-4000-8000-000000000001','Diseñar el Hill Chart','Curva, figuras y anticolisión','00000000-0000-4000-8000-000000000003',NULL,'en_curso',60, now()+interval '3 days','alta','20000000-0000-4000-8000-000000000003',NULL,NULL,NULL,'directa','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','API de tareas','CRUD y transiciones','00000000-0000-4000-8000-000000000002',NULL,'en_curso',40, now()+interval '5 days','alta','20000000-0000-4000-8000-000000000003',NULL,NULL,NULL,'directa','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','Cola de WhatsApp','Eventos instantáneos y reporte','00000000-0000-4000-8000-000000000004',NULL,'atascada',25, now()+interval '20 hours','alta','20000000-0000-4000-8000-000000000003','Esperando verificación de la cuenta de Meta',NULL,NULL,'directa','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','Pantalla de ajustes','Perfil y apariencia','00000000-0000-4000-8000-000000000005',NULL,'habilitada',0, now()+interval '9 days','media','20000000-0000-4000-8000-000000000003',NULL,NULL,NULL,'directa','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','Modelo de datos','Esquema y migraciones','00000000-0000-4000-8000-000000000007',NULL,'completada',100, now()-interval '1 day','alta','20000000-0000-4000-8000-000000000003',NULL,'a_tiempo', now()-interval '2 days','directa','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','Guía de estilos','Tokens y componentes','00000000-0000-4000-8000-000000000003',NULL,'completada',100, now()-interval '5 days','media','20000000-0000-4000-8000-000000000003',NULL,'con_retraso', now()-interval '3 days','directa','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','Modo sin conexión','Cola local de mensajes','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000008','aceptada',0, now()+interval '10 days','media','20000000-0000-4000-8000-000000000003',NULL,NULL,NULL,'propuesta','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000001','Exportar reportes en CSV','',NULL,'00000000-0000-4000-8000-000000000006','propuesta',0, NULL,'baja',NULL,NULL,NULL,NULL,'propuesta','00000000-0000-4000-8000-000000000006'),
 ('10000000-0000-4000-8000-000000000001','Atajos de teclado','',NULL,'00000000-0000-4000-8000-000000000008','backlog',0, NULL,'baja',NULL,NULL,NULL,NULL,'propuesta','00000000-0000-4000-8000-000000000001');

-- Tareas personales de Paola (sin equipo).
INSERT INTO tareas (dueno_id, titulo, estado, vence_en, prioridad, creada_por) VALUES
 ('00000000-0000-4000-8000-000000000011','Entregar práctica de Redes','en_curso', now()+interval '2 days','alta','00000000-0000-4000-8000-000000000011'),
 ('00000000-0000-4000-8000-000000000011','Estudiar para el examen','habilitada', now()+interval '6 days','media','00000000-0000-4000-8000-000000000011');

INSERT INTO etiquetas (equipo_id, nombre) VALUES
 ('10000000-0000-4000-8000-000000000001','diseño'),('10000000-0000-4000-8000-000000000001','backend'),
 ('10000000-0000-4000-8000-000000000001','whatsapp'),('10000000-0000-4000-8000-000000000001','qa');
INSERT INTO tarea_etiquetas (tarea_id, etiqueta_id)
SELECT t.id, e.id FROM tareas t JOIN etiquetas e ON e.equipo_id = t.equipo_id
 WHERE (t.codigo = 1 AND e.nombre = 'diseño') OR (t.codigo = 2 AND e.nombre = 'backend') OR (t.codigo = 3 AND e.nombre = 'whatsapp');
INSERT INTO tarea_compartida (tarea_id, membresia_id)
SELECT t.id, m.id FROM tareas t, membresias m
 WHERE t.equipo_id = m.equipo_id AND m.rol = 'invitado' AND t.codigo IN (1, 5);

INSERT INTO conversaciones (id, equipo_id, tipo, nombre) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','equipo','Equipo Nexo'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','invitados','Invitados');
INSERT INTO mensajes (conversacion_id, autor_id, texto) VALUES
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Buenos días, equipo. Hoy cerramos el Hill Chart.'),
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Yo termino la API de tareas esta tarde.');
INSERT INTO mensajes (conversacion_id, es_sistema, texto) VALUES
 ('30000000-0000-4000-8000-000000000001', true, 'Valeria inició el Sprint 3.');
INSERT INTO conversacion_lecturas (conversacion_id, usuario_id)
SELECT '30000000-0000-4000-8000-000000000001', usuario_id FROM membresias WHERE estado = 'activa' AND rol <> 'invitado';

INSERT INTO whatsapp_configuracion (equipo_id, proveedor, estado, grupo_nombre) VALUES
 ('10000000-0000-4000-8000-000000000001','simulado','conectado','Nexo · Equipo');
INSERT INTO whatsapp_reglas (equipo_id, tipo_evento, modo) VALUES
 ('10000000-0000-4000-8000-000000000001','reunion','instantaneo'),
 ('10000000-0000-4000-8000-000000000001','urgente','instantaneo'),
 ('10000000-0000-4000-8000-000000000001','aceptada','reporte'),
 ('10000000-0000-4000-8000-000000000001','asignacion','reporte'),
 ('10000000-0000-4000-8000-000000000001','actualizacion','reporte'),
 ('10000000-0000-4000-8000-000000000001','triaje','reporte');
INSERT INTO whatsapp_mensajes (equipo_id, tipo_evento, motivo, texto, tipo_envio) VALUES
 ('10000000-0000-4000-8000-000000000001','urgente','Vence en menos de 24 h','⏰ «Cola de WhatsApp» vence mañana. Responsable: Emilio Cruz.','instantaneo');

COMMIT;
