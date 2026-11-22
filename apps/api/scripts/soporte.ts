import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Alta de una cuenta de soporte por un desarrollador (docs/15_Rol_Soporte.md §1; la otra vía es otra
 * cuenta de soporte con `soporte.alta`, desde su tablero). Tipo de cuenta `soporte`: sin equipos ni
 * espacio personal, con el correo verificado y los permisos `contacto.ver`, `contacto.gestionar`,
 * `cuentas.ayudar` y `soporte.alta`. Al entrar deberá activar la verificación en dos pasos.
 * La contraseña es aleatoria y se escribe en `.credenciales-demo.md` (raíz, ignorado por git).
 *
 *   Local:       pnpm --filter @nexo/api db:soporte [-- --correo otra@nexo.lol --nombre "Otra Persona"]
 *   Producción:  DATABASE_URL_PRODUCCION=<External Database URL> en apps/api/.env y
 *                pnpm --filter @nexo/api db:soporte -- --produccion   (después se borra esa línea)
 *
 * Si la cuenta ya existe no cambia su contraseña (salvo `--nueva-clave`); asegura tipo y permisos.
 * Una cuenta de persona que ya tiene equipos no se convierte.
 */
const args = process.argv.slice(2).filter((a) => a !== '--');
const opcion = (nombre: string) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
const produccion = args.includes('--produccion');
const nuevaClave = args.includes('--nueva-clave');
const CORREO = (opcion('--correo') ?? 'soporte@nexo.lol').trim().toLowerCase();
const NOMBRE = opcion('--nombre') ?? 'Soporte Nexo';
const PERMISOS = ['contacto.ver', 'contacto.gestionar', 'cuentas.ayudar', 'soporte.alta'];

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
  const hay = await c.query("select to_regproc('proc_soporte_crear_cuenta') is not null as ok");
  if (!hay.rows[0]?.ok) throw new Error('Esa BD aún no tiene la migración 0040 (rol de soporte).');
  await c.query('begin');
  const existe = await c.query<{ id: string; tipo_cuenta: string; equipos: number }>(
    `select u.id, u.tipo_cuenta,
            (select count(*)::int from membresias m where m.usuario_id = u.id and m.estado = 'activa') as equipos
       from usuarios u where u.correo = $1 and u.eliminado_en is null`,
    [CORREO],
  );
  const previa = existe.rows[0];
  if (previa && previa.tipo_cuenta !== 'soporte' && previa.equipos > 0) {
    throw new Error(
      `${CORREO} es una cuenta de persona con equipos: usa otro correo para soporte.`,
    );
  }
  if (!previa || nuevaClave) {
    clave = randomBytes(18).toString('base64url');
    const h = await hash(clave);
    if (!previa) {
      const u = await c.query<{ id: string }>(
        `insert into usuarios (correo, nombre, hash_contrasena, correo_verificado_en, tipo_cuenta)
         values ($1, $2, $3, now(), 'soporte') returning id`,
        [CORREO, NOMBRE, h],
      );
      await c.query(
        'insert into preferencias_usuario (usuario_id, tour_visto) values ($1, true) on conflict (usuario_id) do nothing',
        [u.rows[0]!.id],
      );
    } else {
      await c.query('update usuarios set hash_contrasena = $1 where id = $2', [h, previa.id]);
    }
  }
  await c.query("update usuarios set tipo_cuenta = 'soporte' where correo = $1", [CORREO]);
  let permisos: string[] = [];
  for (const permiso of PERMISOS) {
    const r = await c.query<{ r: { permisos: string[] } }>(
      'select fn_permiso_sistema_asignar($1, $2, true) as r',
      [CORREO, permiso],
    );
    permisos = r.rows[0]?.r.permisos ?? [];
  }
  await c.query('commit');
  console.log(`${CORREO}: cuenta de soporte · ${permisos.join(', ')}`);
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
  const titulo = `## Cuenta de soporte ${CORREO} (${produccion ? 'producción' : 'local'})`;
  const bloque = `${titulo}\n\n| Correo | Contraseña | Rol |\n|---|---|---|\n| ${CORREO} | ${clave} | Soporte (tablero /soporte, sin equipos). Al entrar: activar la 2FA |\n`;
  const sinAnterior = previo
    .replace(new RegExp(`${titulo.replace(/[.()]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n## |$)`), '')
    .trimEnd();
  await writeFile(destino, `${sinAnterior}\n\n${bloque}`, 'utf8');
  console.log('Contraseña guardada en .credenciales-demo.md (no está en git).');
}
