import pg from 'pg';

/**
 * Habilita el rol `nexo_app` (la migración 0008 lo crea sin inicio de sesión; docs/09 y
 * docs/operacion.md, sección 2, paso 4) y comprueba que las migraciones se aplicaron.
 *
 * Los secretos se leen SOLO de variables de entorno de quien ejecuta el script; nunca se escriben en
 * el repositorio ni se imprimen:
 *   DATABASE_URL_MIGRACIONES  cadena EXTERNA del dueño de la BD (panel de Render)
 *   NEXO_APP_PASSWORD         contraseña nueva para `nexo_app` (larga y única)
 */
const MIN_LONGITUD = 24;

function falta(mensaje: string): never {
  console.error(mensaje);
  process.exit(1);
}

const url = process.env.DATABASE_URL_MIGRACIONES;
const clave = process.env.NEXO_APP_PASSWORD;

if (!url) falta('Falta DATABASE_URL_MIGRACIONES (cadena externa del dueño de la BD).');
if (!clave) falta('Falta NEXO_APP_PASSWORD (contraseña nueva para nexo_app).');
if (clave.length < MIN_LONGITUD) {
  falta(`NEXO_APP_PASSWORD debe tener al menos ${MIN_LONGITUD} caracteres.`);
}
if (/^postgres(?:ql)?:\/\/nexo:nexo@/.test(url)) {
  falta('DATABASE_URL_MIGRACIONES es la cadena de ejemplo de .env.example.');
}

// Render exige TLS en las conexiones externas. No se valida la cadena del certificado (uso puntual
// desde la máquina de quien despliega, sobre una conexión que ya va cifrada).
const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await cliente.connect();

  const migraciones = await cliente.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM pgmigrations',
  );
  console.log(`Migraciones aplicadas: ${migraciones.rows[0]?.total ?? '0'}.`);

  const rol = await cliente.query<{ rolcanlogin: boolean }>(
    "SELECT rolcanlogin FROM pg_roles WHERE rolname = 'nexo_app'",
  );
  if (rol.rowCount === 0) {
    falta('El rol nexo_app no existe: las migraciones no se aplicaron (falta la 0008).');
  }

  // ALTER ROLE no admite parámetros: el literal se escapa con el propio driver.
  await cliente.query(`ALTER ROLE nexo_app LOGIN PASSWORD ${cliente.escapeLiteral(clave)}`);
  console.log('Rol nexo_app habilitado con la contraseña indicada (no se imprime).');
} catch (error) {
  // Nunca se muestra la cadena de conexión ni la contraseña.
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error(`No se pudo completar: ${mensaje}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => undefined);
}
