import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './tipos';

export type BaseDatos = Kysely<DB>;

export function crearBaseDatos(databaseUrl: string): BaseDatos {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl }) }),
  });
}

/** Conexión o transacción: repositorios y servicios no saben en cuál corren. */
export type Ejecutor = Kysely<DB>;

/** Código SQLSTATE de un error de PostgreSQL (p. ej. `NX001`, `23505`), si lo es. */
export function codigoPg(error: unknown): string | undefined {
  const codigo = (error as { code?: unknown } | null)?.code;
  return typeof codigo === 'string' ? codigo : undefined;
}
