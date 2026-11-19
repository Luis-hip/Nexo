# Nexo · Rendimiento de las consultas clave (Fase 5.4)

> Generado por `pnpm db:volumen && pnpm db:explain` el 2026-11-19. No se edita a mano: se vuelve a generar.

**Criterio (`03`, 5.4):** ninguna de las 7 consultas de `02`, sección 13, hace un barrido secuencial sobre una tabla grande (aquí, de 5000 filas o más). Si alguna lo hace, se agrega un índice con una migración nueva.

**Base de datos:** PostgreSQL 18.6 (PGlite 0.5.16) on wasm32-unknown-emscripten, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.13 (e13ee988ce3d87a738dd8f3661d02223308c412a), 32-bit

| Tabla | Filas (estimadas) | ¿Grande? |
|---|---|---|
| `conversacion_lecturas` | 411 | no |
| `membresias` | 512 | no |
| `mensajes` | 200,005 | sí |
| `sprints` | 54 | no |
| `tarea_compartida` | 504 | no |
| `tareas` | 20,012 | sí |
| `usuarios` | 513 | no |
| `whatsapp_mensajes` | 10,001 | sí |

| Consulta | Resultado |
|---|---|
| Q1 · Datos del Hill Chart (tareas del sprint activo con el color del responsable) | ✓ sin barridos sobre tablas grandes |
| Q2 · Conteo del tablero por estado | ✓ sin barridos sobre tablas grandes |
| Q3 · Mensajes no leídos de una persona | ✓ sin barridos sobre tablas grandes |
| Q4 · Siguiente lote para el worker de WhatsApp | ✓ sin barridos sobre tablas grandes |
| Q5 · Semáforo de entregas del equipo | ✓ sin barridos sobre tablas grandes |
| Q6 · Tareas visibles para un invitado | ✓ sin barridos sobre tablas grandes |
| Q7 · Búsqueda de texto en el chat (CH-08) | ✓ sin barridos sobre tablas grandes |

## Q1 · Datos del Hill Chart (tareas del sprint activo con el color del responsable)

```sql
SELECT t.codigo, t.titulo, t.estado, t.progreso, m.color_idx
  FROM tareas t
  JOIN sprints s ON s.id = t.sprint_id AND s.estado = 'activo'
  LEFT JOIN membresias m ON m.equipo_id = t.equipo_id
                        AND m.usuario_id = t.responsable_id AND m.estado = 'activa'
 WHERE t.equipo_id = $1 AND NOT t.archivada
 ORDER BY t.codigo
```

```text
Sort  (cost=523.03..523.98 rows=378 width=32) (actual time=1.747..1.807 rows=200.00 loops=1)
  Sort Key: t.codigo
  Sort Method: quicksort  Memory: 27kB
  Buffers: shared hit=222
  ->  Hash Left Join  (cost=117.35..506.85 rows=378 width=32) (actual time=0.865..1.618 rows=200.00 loops=1)
        Hash Cond: (t.responsable_id = m.usuario_id)
        Buffers: shared hit=222
        ->  Hash Join  (cost=104.37..492.38 rows=378 width=62) (actual time=0.802..1.347 rows=200.00 loops=1)
              Hash Cond: (t.sprint_id = s.id)
              Buffers: shared hit=213
              ->  Bitmap Heap Scan on tareas t  (cost=102.06..488.98 rows=400 width=78) (actual time=0.666..0.994 rows=200.00 loops=1)
                    Recheck Cond: ((equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid) AND (NOT archivada) AND (sprint_id IS NOT NULL))
                    Heap Blocks: exact=200
                    Buffers: shared hit=212
                    ->  BitmapAnd  (cost=102.06..102.06 rows=200 width=0) (actual time=0.595..0.596 rows=0.00 loops=1)
                          Buffers: shared hit=12
                          ->  Bitmap Index Scan on ix_tareas_equipo_estado  (cost=0.00..7.29 rows=400 width=0) (actual time=0.046..0.046 rows=400.00 loops=1)
                                Index Cond: (equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid)
                                Index Searches: 1
                                Buffers: shared hit=2
                          ->  Bitmap Index Scan on ix_tareas_sprint  (cost=0.00..94.32 rows=10007 width=0) (actual time=0.510..0.510 rows=10007.00 loops=1)
                                Index Searches: 1
                                Buffers: shared hit=10
              ->  Hash  (cost=1.68..1.68 rows=51 width=16) (actual time=0.124..0.126 rows=51.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 6kB
                    Buffers: shared hit=1
                    ->  Seq Scan on sprints s  (cost=0.00..1.68 rows=51 width=16) (actual time=0.051..0.081 rows=51.00 loops=1)
                          Filter: (estado = 'activo'::estado_sprint)
                          Rows Removed by Filter: 3
                          Buffers: shared hit=1
        ->  Hash  (cost=12.86..12.86 rows=10 width=34) (actual time=0.056..0.057 rows=10.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5kB
              Buffers: shared hit=9
              ->  Bitmap Heap Scan on membresias m  (cost=4.35..12.86 rows=10 width=34) (actual time=0.029..0.045 rows=10.00 loops=1)
                    Recheck Cond: ((equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid) AND (estado = 'activa'::estado_membresia))
                    Heap Blocks: exact=7
                    Buffers: shared hit=9
                    ->  Bitmap Index Scan on ux_membresia_activa_usuario  (cost=0.00..4.35 rows=10 width=0) (actual time=0.009..0.009 rows=10.00 loops=1)
                          Index Cond: (equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=2
Planning:
  Buffers: shared hit=145
Planning Time: 13.085 ms
Execution Time: 1.969 ms
```

## Q2 · Conteo del tablero por estado

```sql
SELECT estado, count(*) FROM tareas WHERE equipo_id = $1 GROUP BY estado
```

```text
HashAggregate  (cost=533.54..533.61 rows=7 width=12) (actual time=1.102..1.110 rows=7.00 loops=1)
  Group Key: estado
  Batches: 1  Memory Usage: 32kB
  Buffers: shared hit=404
  ->  Bitmap Heap Scan on tareas  (cost=19.39..531.54 rows=400 width=4) (actual time=0.169..0.769 rows=400.00 loops=1)
        Recheck Cond: (equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid)
        Heap Blocks: exact=400
        Buffers: shared hit=404
        ->  Bitmap Index Scan on ux_tarea_codigo_equipo  (cost=0.00..19.29 rows=400 width=0) (actual time=0.075..0.076 rows=400.00 loops=1)
              Index Cond: (equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid)
              Index Searches: 1
              Buffers: shared hit=4
Planning Time: 0.335 ms
Execution Time: 1.181 ms
```

## Q3 · Mensajes no leídos de una persona

```sql
SELECT count(*) AS no_leidos
  FROM mensajes m
  JOIN conversacion_lecturas l ON l.conversacion_id = m.conversacion_id
 WHERE l.usuario_id = $1 AND m.seq > l.ultimo_leido_seq
   AND m.autor_id IS DISTINCT FROM l.usuario_id
```

```text
Aggregate  (cost=2684.77..2684.78 rows=1 width=8) (actual time=16.740..16.744 rows=1.00 loops=1)
  Buffers: shared hit=3551
  ->  Nested Loop  (cost=61.82..2681.54 rows=1294 width=0) (actual time=1.346..14.663 rows=3445.00 loops=1)
        Buffers: shared hit=3551
        ->  Seq Scan on conversacion_lecturas l  (cost=0.00..9.14 rows=1 width=40) (actual time=0.057..0.092 rows=1.00 loops=1)
              Filter: (usuario_id = 'c1eb2284-4627-4a6d-835b-6fa9cced11e2'::uuid)
              Rows Removed by Filter: 410
              Buffers: shared hit=4
        ->  Bitmap Heap Scan on mensajes m  (cost=61.82..2659.36 rows=1304 width=40) (actual time=1.274..9.952 rows=3445.00 loops=1)
              Recheck Cond: ((l.conversacion_id = conversacion_id) AND (seq > l.ultimo_leido_seq))
              Filter: (autor_id IS DISTINCT FROM l.usuario_id)
              Rows Removed by Filter: 492
              Heap Blocks: exact=3510
              Buffers: shared hit=3547
              ->  Bitmap Index Scan on ix_mensajes_conv_seq  (cost=0.00..61.49 rows=1307 width=0) (actual time=0.532..0.532 rows=3937.00 loops=1)
                    Index Cond: ((conversacion_id = l.conversacion_id) AND (seq > l.ultimo_leido_seq))
                    Index Searches: 1
                    Buffers: shared hit=37
Planning:
  Buffers: shared hit=88
Planning Time: 12.432 ms
Execution Time: 16.803 ms
```

## Q4 · Siguiente lote para el worker de WhatsApp

```sql
SELECT id, tipo_evento, texto FROM whatsapp_mensajes
 WHERE estado = 'pendiente' AND seleccionado AND tipo_envio = 'instantaneo'
 ORDER BY creado_en
 FOR UPDATE SKIP LOCKED LIMIT 10
```

```text
Limit  (cost=285.73..285.86 rows=10 width=58) (actual time=0.823..0.857 rows=10.00 loops=1)
  Buffers: shared hit=112
  ->  LockRows  (cost=285.73..288.24 rows=201 width=58) (actual time=0.819..0.844 rows=10.00 loops=1)
        Buffers: shared hit=112
        ->  Sort  (cost=285.73..286.23 rows=201 width=58) (actual time=0.803..0.810 rows=10.00 loops=1)
              Sort Key: creado_en
              Sort Method: quicksort  Memory: 32kB
              Buffers: shared hit=102
              ->  Bitmap Heap Scan on whatsapp_mensajes  (cost=96.68..281.39 rows=201 width=58) (actual time=0.460..0.628 rows=201.00 loops=1)
                    Recheck Cond: (estado = 'pendiente'::estado_mensaje_wa)
                    Filter: (seleccionado AND (tipo_envio = 'instantaneo'::tipo_envio_wa))
                    Heap Blocks: exact=9
                    Buffers: shared hit=102
                    ->  Bitmap Index Scan on ix_wa_msj_equipo_estado  (cost=0.00..96.62 rows=201 width=0) (actual time=0.408..0.409 rows=201.00 loops=1)
                          Index Cond: (estado = 'pendiente'::estado_mensaje_wa)
                          Index Searches: 21
                          Buffers: shared hit=93
Planning:
  Buffers: shared hit=44
Planning Time: 3.736 ms
Execution Time: 0.940 ms
```

## Q5 · Semáforo de entregas del equipo

```sql
SELECT semaforo, count(*) FROM v_tareas_semaforo WHERE equipo_id = $1 GROUP BY semaforo
```

```text
HashAggregate  (cost=541.54..550.12 rows=286 width=40) (actual time=1.270..1.275 rows=3.00 loops=1)
  Group Key: CASE WHEN ((t.estado = 'completada'::estado_tarea) AND (t.resultado = 'con_retraso'::resultado_tarea)) THEN 'ambar'::text WHEN (t.estado = 'completada'::estado_tarea) THEN 'verde'::text WHEN (t.vence_en IS NULL) THEN NULL::text WHEN (t.vence_en < now()) THEN 'rojo'::text WHEN (t.vence_en < (now() + '48:00:00'::interval)) THEN 'ambar'::text ELSE 'verde'::text END
  Batches: 1  Memory Usage: 48kB
  Buffers: shared hit=404
  ->  Bitmap Heap Scan on tareas t  (cost=19.39..539.54 rows=400 width=32) (actual time=0.204..0.960 rows=400.00 loops=1)
        Recheck Cond: (equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid)
        Heap Blocks: exact=400
        Buffers: shared hit=404
        ->  Bitmap Index Scan on ux_tarea_codigo_equipo  (cost=0.00..19.29 rows=400 width=0) (actual time=0.072..0.072 rows=400.00 loops=1)
              Index Cond: (equipo_id = '12d144a9-714d-4c2e-ba9b-248334ad985b'::uuid)
              Index Searches: 1
              Buffers: shared hit=4
Planning:
  Buffers: shared hit=6
Planning Time: 0.576 ms
Execution Time: 1.357 ms
```

## Q6 · Tareas visibles para un invitado

```sql
SELECT t.codigo, t.titulo FROM tareas t
  JOIN tarea_compartida tc ON tc.tarea_id = t.id
  JOIN membresias m ON m.id = tc.membresia_id AND m.estado = 'activa'
 WHERE m.usuario_id = $1 ORDER BY t.codigo
```

```text
Sort  (cost=22.47..22.47 rows=1 width=24) (actual time=0.554..0.565 rows=5.00 loops=1)
  Sort Key: t.codigo
  Sort Method: quicksort  Memory: 17kB
  Buffers: shared hit=22
  ->  Nested Loop  (cost=8.59..22.46 rows=1 width=24) (actual time=0.088..0.547 rows=5.00 loops=1)
        Buffers: shared hit=22
        ->  Hash Join  (cost=8.30..18.68 rows=1 width=16) (actual time=0.077..0.512 rows=5.00 loops=1)
              Hash Cond: (tc.membresia_id = m.id)
              Buffers: shared hit=7
              ->  Seq Scan on tarea_compartida tc  (cost=0.00..9.04 rows=504 width=32) (actual time=0.041..0.256 rows=504.00 loops=1)
                    Buffers: shared hit=4
              ->  Hash  (cost=8.29..8.29 rows=1 width=16) (actual time=0.022..0.024 rows=1.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 5kB
                    Buffers: shared hit=3
                    ->  Index Scan using ix_membresias_usuario on membresias m  (cost=0.27..8.29 rows=1 width=16) (actual time=0.014..0.016 rows=1.00 loops=1)
                          Index Cond: (usuario_id = '46a6d9e2-627f-4605-9604-ccd44148705d'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=3
        ->  Index Scan using tareas_pkey on tareas t  (cost=0.29..3.78 rows=1 width=40) (actual time=0.004..0.004 rows=1.00 loops=5)
              Index Cond: (id = tc.tarea_id)
              Index Searches: 5
              Buffers: shared hit=15
Planning:
  Buffers: shared hit=47
Planning Time: 3.760 ms
Execution Time: 0.629 ms
```

## Q7 · Búsqueda de texto en el chat (CH-08)

```sql
SELECT m.id, m.texto FROM mensajes m
 WHERE to_tsvector('spanish', m.texto) @@ plainto_tsquery('spanish', $1)
 ORDER BY m.seq DESC LIMIT 30
```

```text
Limit  (cost=7972.67..7972.74 rows=30 width=62) (actual time=85.158..85.221 rows=30.00 loops=1)
  Buffers: shared hit=1973
  ->  Sort  (cost=7972.67..7993.07 rows=8161 width=62) (actual time=85.155..85.172 rows=30.00 loops=1)
        Sort Key: seq DESC
        Sort Method: top-N heapsort  Memory: 25kB
        Buffers: shared hit=1973
        ->  Bitmap Heap Scan on mensajes m  (cost=2023.38..7731.64 rows=8161 width=62) (actual time=21.670..50.832 rows=40000.00 loops=1)
              Recheck Cond: (to_tsvector('spanish'::regconfig, texto) @@ '''bloque'' & ''permis'''::tsquery)
              Heap Blocks: exact=1496
              Buffers: shared hit=1973
              ->  Bitmap Index Scan on ix_mensajes_busqueda  (cost=0.00..2021.34 rows=8161 width=0) (actual time=21.245..21.246 rows=40000.00 loops=1)
                    Index Cond: (to_tsvector('spanish'::regconfig, texto) @@ '''bloque'' & ''permis'''::tsquery)
                    Index Searches: 1
                    Buffers: shared hit=477
Planning:
  Buffers: shared hit=12
Planning Time: 0.637 ms
Execution Time: 85.340 ms
```
