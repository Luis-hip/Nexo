import { conCliente, leerSql } from './comun';

/**
 * Ejecuta db/tests/pruebas.sql y exige exactamente las 11 líneas «OK» esperadas
 * (1, 2, 3, 4, 5, 6, 7, 7b, 8, 9, 10). Las líneas de metacomandos de psql (\set …) se omiten:
 * el cliente ya se detiene en el primer error, igual que ON_ERROR_STOP.
 * Todo corre dentro de una transacción que se revierte, así se puede repetir sin `db:reset`.
 */
const ESPERADAS = ['1', '2', '3', '4', '5', '6', '7', '7b', '8', '9', '10'];

const sql = (await leerSql('tests/pruebas.sql'))
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
  console.error('Las pruebas SQL fallaron:', fallo instanceof Error ? fallo.message : fallo);
  process.exit(1);
}

const ids = oks.map((m) => /^OK (\w+):/.exec(m)?.[1]);
const faltan = ESPERADAS.filter((id) => !ids.includes(id));
if (oks.length !== ESPERADAS.length || faltan.length > 0) {
  console.error(
    `Se esperaban ${ESPERADAS.length} líneas OK y hubo ${oks.length}. Faltan: ${faltan.join(', ') || 'ninguna'}`,
  );
  process.exit(1);
}
console.log(`\n${oks.length} pruebas SQL OK.`);
