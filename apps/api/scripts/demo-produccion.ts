/**
 * Carga las cuentas y los datos de la semilla (db/seed/semilla.sql) en producción como si fueran
 * personas reales (DEC-038). No es `db:seed`: la semilla tiene sentencias que tocarían a TODAS las
 * cuentas (p. ej. pone la misma contraseña a todos), así que aquí:
 *  - cada sentencia global se limita al equipo y a las cuentas de la semilla (si una no se encuentra
 *    tal cual, el script se detiene sin tocar nada);
 *  - cada cuenta recibe una contraseña aleatoria propia (la de la semilla, «Nexo-2026», es pública);
 *  - los correos pasan a @nexo.lol (los de la semilla son dominios de terceros);
 *  - los eventos de la semilla quedan como procesados (el despachador no manda avisos viejos).
 * La tabla de accesos se escribe en `.credenciales-demo.md` (raíz del repositorio, ignorado por git).
 *
 *   Producción:  DATABASE_URL_PRODUCCION=<External Database URL de nexo-bd> en apps/api/.env
 *                pnpm --filter @nexo/api db:demo -- --confirmar
 *   Ensayo local (todo dentro de una transacción que se revierte, con una cuenta «real» de control):
 *                pnpm --filter @nexo/api db:demo -- --ensayo
 */
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { leerSql } from './comun';

const EQUIPO = '10000000-0000-4000-8000-000000000001';
const DE_LA_SEMILLA = `'00000000-0000-4000-8000-0000000000%'`;
const ensayo = process.argv.includes('--ensayo');
const confirmar = process.argv.includes('--confirmar');

const url = ensayo ? process.env.DATABASE_URL : process.env.DATABASE_URL_PRODUCCION;
if (!url || (!ensayo && !confirmar)) {
  console.error(
    ensayo
      ? 'Falta DATABASE_URL.'
      : 'Uso: DATABASE_URL_PRODUCCION en apps/api/.env y `pnpm --filter @nexo/api db:demo -- --confirmar`.',
  );
  process.exit(2);
}

/** Reemplaza `antes` por `despues` exactamente una vez; si no está, se detiene. */
function cambiar(sql: string, antes: string, despues: string): string {
  const i = sql.indexOf(antes);
  if (i < 0 || sql.indexOf(antes, i + 1) >= 0) {
    throw new Error(`La semilla cambió: no se encontró una sola vez «${antes.slice(0, 60)}…».`);
  }
  return sql.replace(antes, despues);
}

/** La semilla adaptada a una base con datos reales. */
export async function semillaSegura(): Promise<string> {
  let sql = await leerSql('seed/semilla.sql');
  sql = cambiar(sql, 'BEGIN;', '');
  sql = cambiar(sql, 'COMMIT;', '');
  sql = cambiar(
    sql,
    'INSERT INTO preferencias_usuario (usuario_id) SELECT id FROM usuarios;',
    `INSERT INTO preferencias_usuario (usuario_id) SELECT id FROM usuarios WHERE id::text LIKE ${DE_LA_SEMILLA};`,
  );
  sql = cambiar(
    sql,
    'SELECT t.id, e.id FROM tareas t JOIN etiquetas e ON e.equipo_id = t.equipo_id\n WHERE (',
    `SELECT t.id, e.id FROM tareas t JOIN etiquetas e ON e.equipo_id = t.equipo_id\n WHERE t.equipo_id = '${EQUIPO}' AND (`,
  );
  sql = cambiar(
    sql,
    "WHERE t.equipo_id = m.equipo_id AND m.rol = 'invitado' AND t.codigo IN (1, 5);",
    `WHERE t.equipo_id = m.equipo_id AND m.equipo_id = '${EQUIPO}' AND m.rol = 'invitado' AND t.codigo IN (1, 5);`,
  );
  sql = cambiar(
    sql,
    "FROM membresias WHERE estado = 'activa' AND rol <> 'invitado';",
    `FROM membresias WHERE equipo_id = '${EQUIPO}' AND estado = 'activa' AND rol <> 'invitado';`,
  );
  // La contraseña común de la semilla no se usa: cada cuenta recibe la suya después.
  sql = sql.replace(
    /UPDATE usuarios\s+SET hash_contrasena = '[^']+',\s+correo_verificado_en = now\(\);/,
    '',
  );
  if (/UPDATE usuarios\s+SET hash_contrasena/.test(sql)) {
    throw new Error('La semilla cambió: no se pudo quitar la contraseña común.');
  }
  // Correos de terceros → nuestro dominio (mismo nombre antes de la @).
  sql = sql.replace(
    /'([a-z.]+)@(nexo\.mx|universidad\.mx|salas-consultores\.mx)'/g,
    "'$1@nexo.lol'",
  );
  return sql;
}

const contrasena = () => `Nexo-${randomBytes(9).toString('base64url')}`;

const aqui = dirname(fileURLToPath(import.meta.url));
const cliente = new pg.Client({
  connectionString: url,
  ssl: ensayo ? undefined : { rejectUnauthorized: false },
});
await cliente.connect();
try {
  const migraciones = await cliente.query<{ name: string }>(
    "SELECT name FROM pgmigrations WHERE name LIKE '0031%'",
  );
  if (migraciones.rowCount === 0) throw new Error('La base no tiene la migración 0031.');
  await cliente.query('BEGIN');

  let control: { usuario: string; hash: string } | null = null;
  if (ensayo) {
    // La semilla local ya está cargada: se quita (dentro de la transacción) y se agrega una
    // persona «real» con su equipo, una tarea T-01 con etiqueta «diseño» y una invitada.
    await cliente.query(`DELETE FROM equipos WHERE id = '${EQUIPO}'`);
    await cliente.query(`DELETE FROM usuarios WHERE id::text LIKE ${DE_LA_SEMILLA}`);
    const u = await cliente.query<{ id: string }>(
      "INSERT INTO usuarios (correo, nombre, hash_contrasena) VALUES ('real@ejemplo.test', 'Persona Real', '$argon2id$real') RETURNING id",
    );
    const inv = await cliente.query<{ id: string }>(
      "INSERT INTO usuarios (correo, nombre) VALUES ('invitada@ejemplo.test', 'Invitada Real') RETURNING id",
    );
    const e = await cliente.query<{ id: string }>(
      `INSERT INTO equipos (nombre, creado_por) VALUES ('Equipo real', '${u.rows[0]!.id}') RETURNING id`,
    );
    const eq = e.rows[0]!.id;
    await cliente.query(
      `INSERT INTO membresias (equipo_id, usuario_id, rol, color_idx) VALUES ('${eq}', '${u.rows[0]!.id}', 'lider', 0)`,
    );
    await cliente.query(
      `INSERT INTO membresias (equipo_id, usuario_id, rol, caduca_en) VALUES ('${eq}', '${inv.rows[0]!.id}', 'invitado', now() + interval '7 days')`,
    );
    await cliente.query(
      `INSERT INTO tareas (equipo_id, codigo, titulo, estado) VALUES ('${eq}', 1, 'Tarea real', 'aceptada')`,
    );
    await cliente.query(`INSERT INTO etiquetas (equipo_id, nombre) VALUES ('${eq}', 'diseño')`);
    control = { usuario: u.rows[0]!.id, hash: '$argon2id$real' };
  } else {
    const ya = await cliente.query(`SELECT 1 FROM equipos WHERE id = '${EQUIPO}'`);
    if (ya.rowCount)
      throw new Error('El equipo de la semilla ya está en esta base: no se carga dos veces.');
  }

  await cliente.query(await semillaSegura());

  const cuentas = await cliente.query<{
    id: string;
    correo: string;
    nombre: string;
    rol: string | null;
  }>(
    `SELECT u.id, u.correo::text, u.nombre,
            (SELECT m.rol::text FROM membresias m WHERE m.usuario_id = u.id AND m.equipo_id = '${EQUIPO}') AS rol
       FROM usuarios u WHERE u.id::text LIKE ${DE_LA_SEMILLA} ORDER BY u.id`,
  );
  const filas: { nombre: string; correo: string; rol: string; contrasena: string }[] = [];
  for (const c of cuentas.rows) {
    const clave = contrasena();
    await cliente.query(
      'UPDATE usuarios SET hash_contrasena = $1, correo_verificado_en = now() WHERE id = $2',
      [await hash(clave), c.id],
    );
    filas.push({
      nombre: c.nombre,
      correo: c.correo,
      rol: c.rol ?? 'sin equipo',
      contrasena: clave,
    });
  }
  await cliente.query(
    `UPDATE eventos_dominio SET procesado_en = now() WHERE equipo_id = '${EQUIPO}' AND procesado_en IS NULL`,
  );

  if (ensayo && control) {
    const r = await cliente.query<{
      hash: string;
      etiquetas: string;
      compartidas: string;
      lecturas: string;
      prefs: string;
    }>(
      `SELECT u.hash_contrasena AS hash,
              (SELECT count(*) FROM tarea_etiquetas te JOIN tareas t ON t.id = te.tarea_id WHERE t.equipo_id <> '${EQUIPO}') AS etiquetas,
              (SELECT count(*) FROM tarea_compartida tc JOIN membresias m ON m.id = tc.membresia_id WHERE m.equipo_id <> '${EQUIPO}') AS compartidas,
              (SELECT count(*) FROM conversacion_lecturas WHERE usuario_id = u.id) AS lecturas,
              (SELECT count(*) FROM preferencias_usuario WHERE usuario_id = u.id) AS prefs
         FROM usuarios u WHERE u.id = $1`,
      [control.usuario],
    );
    const x = r.rows[0]!;
    const fallos = [
      x.hash !== control.hash && 'la contraseña de la cuenta real cambió',
      x.etiquetas !== '0' && 'se etiquetaron tareas de otro equipo',
      x.compartidas !== '0' && 'se compartieron tareas de otro equipo',
      x.lecturas !== '0' && 'la cuenta real recibió lecturas del chat de la semilla',
      x.prefs !== '0' && 'la cuenta real recibió preferencias de la semilla',
    ].filter(Boolean);
    const p = filas[0]!;
    const h = await cliente.query<{ hash_contrasena: string }>(
      'SELECT hash_contrasena FROM usuarios WHERE correo = $1',
      [p.correo],
    );
    if (!(await verify(h.rows[0]!.hash_contrasena, p.contrasena)))
      fallos.push('la contraseña nueva no verifica');
    await cliente.query('ROLLBACK');
    if (fallos.length) throw new Error(`Ensayo fallido: ${fallos.join('; ')}`);
    console.log(
      `Ensayo correcto: ${filas.length} cuentas, correos @nexo.lol, contraseñas propias y la cuenta real intacta. Nada se guardó.`,
    );
  } else {
    await cliente.query('COMMIT');
    const tabla = [
      '# Cuentas de demostración en producción (https://app.nexo.lol)',
      '',
      `Cargadas el ${new Date().toISOString().slice(0, 10)} con \`pnpm --filter @nexo/api db:demo\` (DEC-038). **No subir a git.**`,
      '',
      '| Persona | Correo | Rol en «Equipo Nexo» | Contraseña |',
      '|---|---|---|---|',
      ...filas.map((f) => `| ${f.nombre} | ${f.correo} | ${f.rol} | \`${f.contrasena}\` |`),
      '',
    ].join('\n');
    const destino = resolve(aqui, '..', '..', '..', '.credenciales-demo.md');
    await writeFile(destino, tabla, 'utf8');
    console.log(`Listo: ${filas.length} cuentas cargadas. Accesos en ${destino}`);
  }
} catch (e) {
  await cliente.query('ROLLBACK').catch(() => undefined);
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
