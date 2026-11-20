# Nexo · Rendimiento de las consultas clave (Fase 5.4)

> Generado por `pnpm db:volumen && pnpm db:explain` el 2026-11-20. No se edita a mano: se vuelve a generar.

**Criterio (`03`, 5.4):** ninguna de las 7 consultas de `02`, sección 13, hace un barrido secuencial sobre una tabla grande (aquí, de 5000 filas o más). Si alguna lo hace, se agrega un índice con una migración nueva.

**Base de datos:** PostgreSQL 18.6 (PGlite 0.5.16) on wasm32-unknown-emscripten, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.13 (e13ee988ce3d87a738dd8f3661d02223308c412a), 32-bit

| Tabla | Filas (estimadas) | ¿Grande? |
|---|---|---|
| `conversacion_lecturas` | 408 | no |
| `membresias` | 510 | no |
| `mensajes` | 200,003 | sí |
| `sprints` | 54 | no |
| `tarea_compartida` | 504 | no |
| `tareas` | 20,011 | sí |
| `usuarios` | 511 | no |
| `whatsapp_mensajes` | 10,001 | sí |

| Consulta | Resultado |
|---|---|
| Q1 · Datos del Hill Chart (tareas del sprint activo con el color del responsable) | ✓ sin barridos sobre tablas grandes |
| Q2 · Conteo del tablero por estado | ✓ sin barridos sobre tablas grandes |
| Q3 · Mensajes no leídos de una persona | ✓ sin barridos sobre tablas grandes |
| Q4 · Siguiente lote para el worker de WhatsApp | ✓ sin barridos sobre tablas grandes. Pendiente de la rama de WhatsApp: agregar `CREATE INDEX ix_wa_msj_pendientes ON whatsapp_mensajes (creado_en) WHERE estado = 'pendiente' AND seleccionado AND tipo_envio = 'instantaneo'` en su migración (0031+). |
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
Sort  (cost=521.73..522.68 rows=378 width=32) (actual time=1.231..1.275 rows=200.00 loops=1)
  Sort Key: t.codigo
  Sort Method: quicksort  Memory: 27kB
  Buffers: shared hit=222
  ->  Hash Left Join  (cost=116.33..505.55 rows=378 width=32) (actual time=0.611..1.128 rows=200.00 loops=1)
        Hash Cond: (t.responsable_id = m.usuario_id)
        Buffers: shared hit=222
        ->  Hash Join  (cost=104.37..492.10 rows=378 width=62) (actual time=0.570..0.944 rows=200.00 loops=1)
              Hash Cond: (t.sprint_id = s.id)
              Buffers: shared hit=213
              ->  Bitmap Heap Scan on tareas t  (cost=102.06..488.70 rows=400 width=78) (actual time=0.487..0.710 rows=200.00 loops=1)
                    Recheck Cond: ((equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid) AND (NOT archivada) AND (sprint_id IS NOT NULL))
                    Heap Blocks: exact=200
                    Buffers: shared hit=212
                    ->  BitmapAnd  (cost=102.06..102.06 rows=200 width=0) (actual time=0.442..0.444 rows=0.00 loops=1)
                          Buffers: shared hit=12
                          ->  Bitmap Index Scan on ix_tareas_equipo_estado  (cost=0.00..7.29 rows=400 width=0) (actual time=0.035..0.035 rows=400.00 loops=1)
                                Index Cond: (equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid)
                                Index Searches: 1
                                Buffers: shared hit=2
                          ->  Bitmap Index Scan on ix_tareas_sprint  (cost=0.00..94.32 rows=10007 width=0) (actual time=0.383..0.383 rows=10007.00 loops=1)
                                Index Searches: 1
                                Buffers: shared hit=10
              ->  Hash  (cost=1.68..1.68 rows=51 width=16) (actual time=0.077..0.078 rows=51.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 6kB
                    Buffers: shared hit=1
                    ->  Seq Scan on sprints s  (cost=0.00..1.68 rows=51 width=16) (actual time=0.033..0.054 rows=51.00 loops=1)
                          Filter: (estado = 'activo'::estado_sprint)
                          Rows Removed by Filter: 3
                          Buffers: shared hit=1
        ->  Hash  (cost=11.84..11.84 rows=10 width=34) (actual time=0.036..0.038 rows=10.00 loops=1)
              Buckets: 1024  Batches: 1  Memory Usage: 5kB
              Buffers: shared hit=9
              ->  Bitmap Heap Scan on membresias m  (cost=4.35..11.84 rows=10 width=34) (actual time=0.020..0.031 rows=10.00 loops=1)
                    Recheck Cond: ((equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid) AND (estado = 'activa'::estado_membresia))
                    Heap Blocks: exact=7
                    Buffers: shared hit=9
                    ->  Bitmap Index Scan on ux_membresia_activa_usuario  (cost=0.00..4.35 rows=10 width=0) (actual time=0.006..0.006 rows=10.00 loops=1)
                          Index Cond: (equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=2
Planning:
  Buffers: shared hit=154
Planning Time: 10.008 ms
Execution Time: 1.396 ms
```

## Q2 · Conteo del tablero por estado

```sql
SELECT estado, count(*) FROM tareas WHERE equipo_id = $1 GROUP BY estado
```

```text
HashAggregate  (cost=532.91..532.98 rows=7 width=12) (actual time=1.243..1.248 rows=7.00 loops=1)
  Group Key: estado
  Batches: 1  Memory Usage: 32kB
  Buffers: shared hit=405
  ->  Bitmap Heap Scan on tareas  (cost=19.39..530.91 rows=400 width=4) (actual time=0.160..0.570 rows=400.00 loops=1)
        Recheck Cond: (equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid)
        Heap Blocks: exact=400
        Buffers: shared hit=405
        ->  Bitmap Index Scan on ux_tarea_codigo_equipo  (cost=0.00..19.29 rows=400 width=0) (actual time=0.059..0.060 rows=400.00 loops=1)
              Index Cond: (equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid)
              Index Searches: 1
              Buffers: shared hit=5
Planning Time: 0.725 ms
Execution Time: 2.107 ms
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
Aggregate  (cost=2713.94..2713.95 rows=1 width=8) (actual time=10.409..10.412 rows=1.00 loops=1)
  Buffers: shared hit=3552
  ->  Nested Loop  (cost=62.08..2710.68 rows=1304 width=0) (actual time=1.009..9.536 rows=3445.00 loops=1)
        Buffers: shared hit=3552
        ->  Seq Scan on conversacion_lecturas l  (cost=0.00..9.10 rows=1 width=40) (actual time=0.037..0.071 rows=1.00 loops=1)
              Filter: (usuario_id = 'a3341804-df5e-4739-8b0f-95685cd4fd09'::uuid)
              Rows Removed by Filter: 407
              Buffers: shared hit=4
        ->  Bitmap Heap Scan on mensajes m  (cost=62.08..2688.28 rows=1330 width=40) (actual time=0.968..5.515 rows=3445.00 loops=1)
              Recheck Cond: ((l.conversacion_id = conversacion_id) AND (seq > l.ultimo_leido_seq))
              Filter: (autor_id IS DISTINCT FROM l.usuario_id)
              Rows Removed by Filter: 492
              Heap Blocks: exact=3511
              Buffers: shared hit=3548
              ->  Bitmap Index Scan on ix_mensajes_conv_seq  (cost=0.00..61.75 rows=1333 width=0) (actual time=0.393..0.393 rows=3937.00 loops=1)
                    Index Cond: ((conversacion_id = l.conversacion_id) AND (seq > l.ultimo_leido_seq))
                    Index Searches: 1
                    Buffers: shared hit=37
Planning:
  Buffers: shared hit=73
Planning Time: 4.533 ms
Execution Time: 10.457 ms
```

## Q4 · Siguiente lote para el worker de WhatsApp

```sql
SELECT id, tipo_evento, texto FROM whatsapp_mensajes
 WHERE estado = 'pendiente' AND seleccionado AND tipo_envio = 'instantaneo'
 ORDER BY creado_en
 FOR UPDATE SKIP LOCKED LIMIT 10
```

```text
Limit  (cost=285.73..285.86 rows=10 width=58) (actual time=0.643..0.665 rows=10.00 loops=1)
  Buffers: shared hit=103
  ->  LockRows  (cost=285.73..288.24 rows=201 width=58) (actual time=0.642..0.658 rows=10.00 loops=1)
        Buffers: shared hit=103
        ->  Sort  (cost=285.73..286.23 rows=201 width=58) (actual time=0.630..0.634 rows=10.00 loops=1)
              Sort Key: creado_en
              Sort Method: quicksort  Memory: 32kB
              Buffers: shared hit=93
              ->  Bitmap Heap Scan on whatsapp_mensajes  (cost=96.68..281.39 rows=201 width=58) (actual time=0.393..0.509 rows=201.00 loops=1)
                    Recheck Cond: (estado = 'pendiente'::estado_mensaje_wa)
                    Filter: (seleccionado AND (tipo_envio = 'instantaneo'::tipo_envio_wa))
                    Heap Blocks: exact=9
                    Buffers: shared hit=93
                    ->  Bitmap Index Scan on ix_wa_msj_equipo_estado  (cost=0.00..96.62 rows=201 width=0) (actual time=0.356..0.356 rows=201.00 loops=1)
                          Index Cond: (estado = 'pendiente'::estado_mensaje_wa)
                          Index Searches: 11
                          Buffers: shared hit=84
Planning:
  Buffers: shared hit=53 read=1
Planning Time: 3.387 ms
Execution Time: 0.701 ms
```

## Q5 · Semáforo de entregas del equipo

```sql
SELECT semaforo, count(*) FROM v_tareas_semaforo WHERE equipo_id = $1 GROUP BY semaforo
```

```text
HashAggregate  (cost=540.91..549.49 rows=286 width=40) (actual time=1.618..1.625 rows=3.00 loops=1)
  Group Key: CASE WHEN ((t.estado = 'completada'::estado_tarea) AND (t.resultado = 'con_retraso'::resultado_tarea)) THEN 'ambar'::text WHEN (t.estado = 'completada'::estado_tarea) THEN 'verde'::text WHEN (t.vence_en IS NULL) THEN NULL::text WHEN (t.vence_en < now()) THEN 'rojo'::text WHEN (t.vence_en < (now() + '48:00:00'::interval)) THEN 'ambar'::text ELSE 'verde'::text END
  Batches: 1  Memory Usage: 48kB
  Buffers: shared hit=405
  ->  Bitmap Heap Scan on tareas t  (cost=19.39..538.91 rows=400 width=32) (actual time=0.180..1.236 rows=400.00 loops=1)
        Recheck Cond: (equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid)
        Heap Blocks: exact=400
        Buffers: shared hit=405
        ->  Bitmap Index Scan on ux_tarea_codigo_equipo  (cost=0.00..19.29 rows=400 width=0) (actual time=0.062..0.062 rows=400.00 loops=1)
              Index Cond: (equipo_id = 'ac85f718-74ba-4317-9218-a5451b1c0026'::uuid)
              Index Searches: 1
              Buffers: shared hit=5
Planning:
  Buffers: shared hit=9
Planning Time: 0.408 ms
Execution Time: 1.688 ms
```

## Q6 · Tareas visibles para un invitado

```sql
SELECT t.codigo, t.titulo FROM tareas t
  JOIN tarea_compartida tc ON tc.tarea_id = t.id
  JOIN membresias m ON m.id = tc.membresia_id AND m.estado = 'activa'
 WHERE m.usuario_id = $1 ORDER BY t.codigo
```

```text
Sort  (cost=22.43..22.43 rows=1 width=24) (actual time=0.613..0.624 rows=5.00 loops=1)
  Sort Key: t.codigo
  Sort Method: quicksort  Memory: 17kB
  Buffers: shared hit=22
  ->  Nested Loop  (cost=8.59..22.42 rows=1 width=24) (actual time=0.099..0.606 rows=5.00 loops=1)
        Buffers: shared hit=22
        ->  Hash Join  (cost=8.30..18.68 rows=1 width=16) (actual time=0.085..0.561 rows=5.00 loops=1)
              Hash Cond: (tc.membresia_id = m.id)
              Buffers: shared hit=7
              ->  Seq Scan on tarea_compartida tc  (cost=0.00..9.04 rows=504 width=32) (actual time=0.051..0.286 rows=504.00 loops=1)
                    Buffers: shared hit=4
              ->  Hash  (cost=8.29..8.29 rows=1 width=16) (actual time=0.022..0.023 rows=1.00 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 5kB
                    Buffers: shared hit=3
                    ->  Index Scan using ix_membresias_usuario on membresias m  (cost=0.27..8.29 rows=1 width=16) (actual time=0.014..0.016 rows=1.00 loops=1)
                          Index Cond: (usuario_id = '90b69d8e-499b-4c0c-87e9-8d0332b01036'::uuid)
                          Index Searches: 1
                          Buffers: shared hit=3
        ->  Index Scan using tareas_pkey on tareas t  (cost=0.29..3.74 rows=1 width=40) (actual time=0.006..0.006 rows=1.00 loops=5)
              Index Cond: (id = tc.tarea_id)
              Index Searches: 5
              Buffers: shared hit=15
Planning:
  Buffers: shared hit=47
Planning Time: 4.503 ms
Execution Time: 0.692 ms
```

## Q7 · Búsqueda de texto en el chat (CH-08)

```sql
SELECT m.id, m.texto FROM mensajes m
 WHERE to_tsvector('spanish', m.texto) @@ plainto_tsquery('spanish', $1)
 ORDER BY m.seq DESC LIMIT 30
```

```text
Limit  (cost=7895.67..7895.75 rows=30 width=62) (actual time=94.407..94.458 rows=30.00 loops=1)
  Buffers: shared hit=1976
  ->  Sort  (cost=7895.67..7915.43 rows=7902 width=62) (actual time=94.404..94.423 rows=30.00 loops=1)
        Sort Key: seq DESC
        Sort Method: top-N heapsort  Memory: 25kB
        Buffers: shared hit=1976
        ->  Bitmap Heap Scan on mensajes m  (cost=2022.01..7662.29 rows=7902 width=62) (actual time=15.433..50.449 rows=40000.00 loops=1)
              Recheck Cond: (to_tsvector('spanish'::regconfig, texto) @@ '''bloque'' & ''permis'''::tsquery)
              Heap Blocks: exact=1498
              Buffers: shared hit=1976
              ->  Bitmap Index Scan on ix_mensajes_busqueda  (cost=0.00..2020.04 rows=7902 width=0) (actual time=15.139..15.140 rows=40000.00 loops=1)
                    Index Cond: (to_tsvector('spanish'::regconfig, texto) @@ '''bloque'' & ''permis'''::tsquery)
                    Index Searches: 1
                    Buffers: shared hit=478
Planning:
  Buffers: shared hit=25
Planning Time: 0.514 ms
Execution Time: 94.522 ms
```
