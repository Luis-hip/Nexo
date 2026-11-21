import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Cuenta de soporte para el panel de contacto (docs/14 §4): una cuenta SIN equipo, con el correo
 * verificado y solo el permiso de sistema `contacto.gestionar`, para no mezclar el soporte con el
 * espacio personal de nadie. La contraseña es aleatoria y se escribe en `.credenciales-demo.md`
 * (raíz del repositorio, ignorado por git), igual que las cuentas de la semilla en producción.
 *
 *   Local:       pnpm --filter @nexo/api db:soporte
 *   Producción:  DATABASE_URL_PRODUCCION=<External Database URL> en apps/api/.env y
 *                pnpm --filter @nexo/api db:soporte -- --produccion   (después se borra esa línea)
 *
 * Si la cuenta ya existe no cambia su contraseña (salvo `--nueva-clave`); solo asegura el permiso.
 */
const args = process.argv.slice(2);
const produccion = args.includes('--produccion');
const nuevaClave = args.includes('--nueva-clave');
const CORREO = 'soporte@nexo.lol';
const NOMBRE = 'Soporte Nexo';

const url = produccion ? process.env.DATABASE_URL_PRODUCCION : process.env.DATABASE_URL;
if (!url) {
  console.error(
    produccion ? 'Falta DATABASE_URL_PRODUCCION en apps/api/.env.' : 'Falta DATABASE_URL.',
  );
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1/.test(url);
const c = new pg.Client({
  connectionString: url,
  ssl: local ? undefined : { rejectUnauthorized: false },
});
await c.connect();
let clave: string | null = null;
try {
  const hay = await c.query("select to_regproc('fn_permiso_sistema_asignar') is not null as ok");
  if (!hay.rows[0]?.ok)
    throw new Error('Esa BD aún no tiene la migración 0039 (módulo de contacto).');
  await c.query('begin');
  const existe = await c.query<{ id: string }>(
    'select id from usuarios where correo = $1 and eliminado_en is null',
    [CORREO],
  );
  if (existe.rowCount === 0 || nuevaClave) {
    clave = randomBytes(18).toString('base64url');
    const h = await hash(clave);
    if (existe.rowCount === 0) {
      const u = await c.query<{ id: string }>(
        `insert into usuarios (correo, nombre, hash_contrasena, correo_verificado_en)
         values ($1, $2, $3, now()) returning id`,
        [CORREO, NOMBRE, h],
      );
      // Sin bienvenida ni recorrido: es una cuenta de trabajo.
      await c.query(
        'insert into preferencias_usuario (usuario_id, tour_visto) values ($1, true) on conflict (usuario_id) do nothing',
        [u.rows[0]!.id],
      );
    } else {
      await c.query('update usuarios set hash_contrasena = $1 where id = $2', [
        h,
        existe.rows[0]!.id,
      ]);
    }
  }
  const r = await c.query<{ r: { permisos: string[] } }>(
    "select fn_permiso_sistema_asignar($1, 'contacto.gestionar', true) as r",
    [CORREO],
  );
  const equipos = await c.query(
    "select count(*)::int as n from membresias m join usuarios u on u.id = m.usuario_id where u.correo = $1 and m.estado = 'activa'",
    [CORREO],
  );
  await c.query('commit');
  console.log(
    `${CORREO}: ${r.rows[0]?.r.permisos.join(', ')} · equipos activos: ${equipos.rows[0]?.n}`,
  );
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await c.end();
}

if (clave) {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const destino = resolve(aqui, '..', '..', '..', '.credenciales-demo.md');
  const previo = await readFile(destino, 'utf8').catch(() => '');
  const titulo = `## Cuenta de soporte (${produccion ? 'producción' : 'local'})`;
  const bloque = `${titulo}\n\n| Correo | Contraseña | Rol |\n|---|---|---|\n| ${CORREO} | ${clave} | Panel de contacto (\`contacto.gestionar\`), sin equipo |\n`;
  const sinAnterior = previo
    .replace(new RegExp(`${titulo}\\n[\\s\\S]*?(?=\\n## |$)`), '')
    .trimEnd();
  await writeFile(destino, `${sinAnterior}\n\n${bloque}`, 'utf8');
  console.log('Contraseña guardada en .credenciales-demo.md (no está en git).');
}
