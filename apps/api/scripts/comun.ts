import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runner } from 'node-pg-migrate';

const aqui = dirname(fileURLToPath(import.meta.url));
export const RUTA_DB = resolve(aqui, '..', 'db');

export function urlBaseDatos(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL (copia .env.example a apps/api/.env).');
    process.exit(1);
  }
  return url;
}

export async function conCliente<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: urlBaseDatos() });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

export async function leerSql(relativa: string): Promise<string> {
  return readFile(resolve(RUTA_DB, relativa), 'utf8');
}

/** Aplica las migraciones SQL pendientes de db/migrations (node-pg-migrate). */
export async function migrar(): Promise<void> {
  await runner({
    databaseUrl: urlBaseDatos(),
    dir: resolve(RUTA_DB, 'migrations'),
    migrationsTable: 'pgmigrations',
    direction: 'up',
    checkOrder: true,
    log: (m) => console.log(m),
  });
}

export async function sembrar(): Promise<void> {
  const sql = await leerSql('seed/semilla.sql');
  await conCliente((c) => c.query(sql));
  console.log('Semilla cargada.');
}

export function impedirEnProduccion(accion: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(`«${accion}» no se permite con NODE_ENV=production.`);
    process.exit(1);
  }
}

/**
 * Ejecuta un archivo de pruebas SQL de db/tests y exige exactamente las líneas «OK <id>:» esperadas.
 * Omite los metacomandos de psql (\set …), se detiene en el primer error y lo revierte todo.
 */
export async function ejecutarPruebasSql(archivo: string, esperadas: string[]): Promise<void> {
  const sql = (await leerSql(archivo))
    .split(/\r?\n/)
    .filter((linea) => !linea.trimStart().startsWith('\\'))
    .join('\n');

  const oks: string[] = [];
  let fallo: unknown;

  await conCliente(async (c) => {
    c.on('notice', (n) => {
      console.log(`NOTICE: ${n.message}`);
      if (n.message?.startsWith('OK ')) oks.push(n.message);
    });
    await c.query('BEGIN');
    try {
      await c.query(sql);
    } catch (e) {
      fallo = e;
    } finally {
      await c.query('ROLLBACK');
    }
  });

  if (fallo) {
    const mensaje = fallo instanceof Error ? fallo.message : fallo;
    console.error(`Las pruebas de ${archivo} fallaron:`, mensaje);
    process.exit(1);
  }

  const ids = oks.map((m) => /^OK (\w+):/.exec(m)?.[1]);
  const faltan = esperadas.filter((id) => !ids.includes(id));
  if (oks.length !== esperadas.length || faltan.length > 0) {
    console.error(
      `Se esperaban ${esperadas.length} líneas OK y hubo ${oks.length}. Faltan: ${faltan.join(', ') || 'ninguna'}`,
    );
    process.exit(1);
  }
  console.log(`\n${oks.length} pruebas SQL OK (${archivo}).`);
}
