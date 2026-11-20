import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conCliente, impedirEnProduccion } from './comun';

/**
 * Fase 5.4 · Revisión con `EXPLAIN (ANALYZE, BUFFERS)` de las 7 consultas clave de docs/02, sección 13,
 * sobre la semilla de volumen (`pnpm db:volumen`). Escribe la evidencia en docs/rendimiento.md y
 * termina con error si alguna hace un barrido secuencial (Seq Scan) sobre una tabla grande.
 */
impedirEnProduccion('db:explain');

/** Desde cuántas filas una tabla se considera «grande» para la revisión. */
const FILAS_GRANDE = 5000;

const aqui = dirname(fileURLToPath(import.meta.url));
const SALIDA = resolve(aqui, '..', '..', '..', 'docs', 'rendimiento.md');

interface Consulta {
  id: string;
  titulo: string;
  sql: string;
  params: (c: Parametros) => unknown[];
  /**
   * Si la consulta es de una parte que se construye en otra rama, el motivo: se informa su resultado
   * pero no hace fallar la revisión.
   */
  pendiente?: string;
}
interface Parametros {
  equipo: string;
  integrante: string;
  invitado: string;
}

const CONSULTAS: Consulta[] = [
  {
    id: 'Q1',
    titulo: 'Datos del Hill Chart (tareas del sprint activo con el color del responsable)',
    sql: `SELECT t.codigo, t.titulo, t.estado, t.progreso, m.color_idx
  FROM tareas t
  JOIN sprints s ON s.id = t.sprint_id AND s.estado = 'activo'
  LEFT JOIN membresias m ON m.equipo_id = t.equipo_id
                        AND m.usuario_id = t.responsable_id AND m.estado = 'activa'
 WHERE t.equipo_id = $1 AND NOT t.archivada
 ORDER BY t.codigo`,
    params: (p) => [p.equipo],
  },
  {
    id: 'Q2',
    titulo: 'Conteo del tablero por estado',
    sql: `SELECT estado, count(*) FROM tareas WHERE equipo_id = $1 GROUP BY estado`,
    params: (p) => [p.equipo],
  },
  {
    id: 'Q3',
    titulo: 'Mensajes no leídos de una persona',
    sql: `SELECT count(*) AS no_leidos
  FROM mensajes m
  JOIN conversacion_lecturas l ON l.conversacion_id = m.conversacion_id
 WHERE l.usuario_id = $1 AND m.seq > l.ultimo_leido_seq
   AND m.autor_id IS DISTINCT FROM l.usuario_id`,
    params: (p) => [p.integrante],
  },
  {
    id: 'Q4',
    titulo: 'Siguiente lote para el worker de WhatsApp',
    sql: `SELECT id, tipo_evento, texto FROM whatsapp_mensajes
 WHERE estado = 'pendiente' AND seleccionado AND tipo_envio = 'instantaneo'
 ORDER BY creado_en
 FOR UPDATE SKIP LOCKED LIMIT 10`,
    params: () => [],
    // Desde la 0031 la cubre el índice parcial `ix_wa_msj_pendientes` (DEC-WA-1).
  },
  {
    id: 'Q5',
    titulo: 'Semáforo de entregas del equipo',
    sql: `SELECT semaforo, count(*) FROM v_tareas_semaforo WHERE equipo_id = $1 GROUP BY semaforo`,
    params: (p) => [p.equipo],
  },
  {
    id: 'Q6',
    titulo: 'Tareas visibles para un invitado',
    sql: `SELECT t.codigo, t.titulo FROM tareas t
  JOIN tarea_compartida tc ON tc.tarea_id = t.id
  JOIN membresias m ON m.id = tc.membresia_id AND m.estado = 'activa'
 WHERE m.usuario_id = $1 ORDER BY t.codigo`,
    params: (p) => [p.invitado],
  },
  {
    id: 'Q7',
    titulo: 'Búsqueda de texto en el chat (CH-08)',
    sql: `SELECT m.id, m.texto FROM mensajes m
 WHERE to_tsvector('spanish', m.texto) @@ plainto_tsquery('spanish', $1)
 ORDER BY m.seq DESC LIMIT 30`,
    params: () => ['bloqueo permisos'],
  },
];

const resultado = await conCliente(async (c) => {
  const version = (await c.query<{ v: string }>('SELECT version() AS v')).rows[0]!.v;
  const p = (
    await c.query<Parametros>(`
      SELECT e.id AS equipo,
             (SELECT usuario_id FROM membresias WHERE equipo_id = e.id AND rol = 'integrante' AND color_idx = 1) AS integrante,
             (SELECT usuario_id FROM membresias WHERE equipo_id = e.id AND rol = 'invitado' LIMIT 1) AS invitado
        FROM equipos e WHERE e.nombre = 'Volumen 1'`)
  ).rows[0];
  if (!p) {
    console.error('Falta la semilla de volumen: ejecuta antes `pnpm db:volumen`.');
    process.exit(1);
  }
  const tamanos = (
    await c.query<{ tabla: string; filas: string }>(`
      SELECT relname AS tabla, reltuples::bigint AS filas FROM pg_class
       WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
         AND relname IN ('tareas','mensajes','membresias','conversacion_lecturas','tarea_compartida','whatsapp_mensajes','sprints','usuarios')
       ORDER BY relname`)
  ).rows;
  const grandes = new Set(
    tamanos.filter((t) => Number(t.filas) >= FILAS_GRANDE).map((t) => t.tabla),
  );

  const planes: { q: Consulta; plan: string; barridos: string[] }[] = [];
  for (const q of CONSULTAS) {
    await c.query('BEGIN');
    try {
      const r = await c.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN (ANALYZE, BUFFERS) ${q.sql}`,
        q.params(p),
      );
      const plan = r.rows.map((x) => x['QUERY PLAN']).join('\n');
      const barridos = [...plan.matchAll(/Seq Scan on (\w+)/g)]
        .map((m) => m[1]!)
        .filter((t) => grandes.has(t));
      planes.push({ q, plan, barridos });
    } finally {
      await c.query('ROLLBACK'); // Q4 bloquea filas: no se queda nada tomado
    }
  }
  return { version, tamanos, grandes, planes };
});

const fecha = new Date().toISOString().slice(0, 10);
const md = [
  '# Nexo · Rendimiento de las consultas clave (Fase 5.4)',
  '',
  `> Generado por \`pnpm db:volumen && pnpm db:explain\` el ${fecha}. No se edita a mano: se vuelve a generar.`,
  '',
  `**Criterio (\`03\`, 5.4):** ninguna de las 7 consultas de \`02\`, sección 13, hace un barrido secuencial sobre una tabla grande (aquí, de ${FILAS_GRANDE} filas o más). Si alguna lo hace, se agrega un índice con una migración nueva.`,
  '',
  `**Base de datos:** ${resultado.version}`,
  '',
  '| Tabla | Filas (estimadas) | ¿Grande? |',
  '|---|---|---|',
  ...resultado.tamanos.map(
    (t) =>
      `| \`${t.tabla}\` | ${Number(t.filas).toLocaleString('es-MX')} | ${resultado.grandes.has(t.tabla) ? 'sí' : 'no'} |`,
  ),
  '',
  '| Consulta | Resultado |',
  '|---|---|',
  ...resultado.planes.map(({ q, barridos }) => {
    const estado = barridos.length
      ? `${q.pendiente ? '⚠' : '✗'} barrido secuencial en ${barridos.join(', ')}`
      : '✓ sin barridos sobre tablas grandes';
    return `| ${q.id} · ${q.titulo} | ${estado}${q.pendiente ? `. ${q.pendiente}` : ''} |`;
  }),
  '',
  ...resultado.planes.flatMap(({ q, plan }) => [
    `## ${q.id} · ${q.titulo}`,
    '',
    '```sql',
    q.sql,
    '```',
    '',
    '```text',
    plan,
    '```',
    '',
  ]),
].join('\n');

await writeFile(SALIDA, md, 'utf8');
const malas = resultado.planes.filter((x) => x.barridos.length > 0 && !x.q.pendiente);
for (const { q, barridos } of resultado.planes) {
  const marca = barridos.length ? (q.pendiente ? '⚠' : '✗') : '✓';
  console.log(
    `${marca} ${q.id} ${q.titulo}${barridos.length ? ` (Seq Scan en ${barridos.join(', ')})` : ''}${barridos.length && q.pendiente ? ' — pendiente de la rama de WhatsApp' : ''}`,
  );
}
console.log(`\nEvidencia escrita en docs/rendimiento.md.`);
if (malas.length > 0) process.exit(1);
