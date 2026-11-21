import pg from 'pg';

/**
 * Otorga o retira un permiso de sistema (panel de contacto, docs/12 y docs/13 1.4).
 * Los permisos nunca se dan desde la web: solo con este script y la cadena del dueño de la BD.
 *
 *   pnpm --filter @nexo/api db:permiso -- <correo> <contacto.ver|contacto.gestionar> [--quitar]
 *
 * Usa DATABASE_URL_MIGRACIONES (producción: la cadena externa del dueño, panel de Render) o, en
 * local, DATABASE_URL.
 */
const [correo, permiso, bandera] = process.argv.slice(2).filter((a) => a !== '--');
if (!correo || !permiso || !['contacto.ver', 'contacto.gestionar'].includes(permiso)) {
  console.error('Uso: db:permiso -- <correo> <contacto.ver|contacto.gestionar> [--quitar]');
  process.exit(1);
}
const url = process.env.DATABASE_URL_MIGRACIONES ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL_MIGRACIONES (o DATABASE_URL en local).');
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1/.test(url);
const c = new pg.Client({
  connectionString: url,
  ssl: local ? undefined : { rejectUnauthorized: false },
});
await c.connect();
try {
  const r = await c.query<{ r: { permisos: string[] } }>(
    'select fn_permiso_sistema_asignar($1, $2, $3) as r',
    [correo, permiso, bandera !== '--quitar'],
  );
  console.log(`${correo}: ${r.rows[0]?.r.permisos.join(', ') || 'sin permisos de sistema'}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await c.end();
}
