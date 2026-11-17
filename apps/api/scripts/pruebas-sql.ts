import { ejecutarPruebasSql } from './comun';

/**
 * Ejecuta db/tests/pruebas.sql y exige exactamente las 11 líneas «OK» esperadas
 * (1, 2, 3, 4, 5, 6, 7, 7b, 8, 9, 10). Las líneas de metacomandos de psql (\set …) se omiten:
 * el cliente ya se detiene en el primer error, igual que ON_ERROR_STOP.
 * Todo corre dentro de una transacción que se revierte, así se puede repetir sin `db:reset`.
 */
await ejecutarPruebasSql('tests/pruebas.sql', [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '7b',
  '8',
  '9',
  '10',
]);
