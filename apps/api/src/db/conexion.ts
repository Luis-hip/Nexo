import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './tipos';

export type BaseDatos = Kysely<DB>;

export function crearBaseDatos(databaseUrl: string): BaseDatos {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl }) }),
  });
}
