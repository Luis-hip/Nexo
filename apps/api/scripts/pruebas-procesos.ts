import { ejecutarPruebasSql } from './comun';

/**
 * Pruebas de los procesos de la BD (docs/08, Fase 2.5): db/tests/pruebas_procesos.sql.
 * Exige exactamente las líneas «OK Pn» esperadas, en una transacción que se revierte.
 * Al agregar un caso al archivo, agrégalo también aquí.
 */
const ESPERADAS = Array.from({ length: 52 }, (_, i) => `P${i + 1}`);

await ejecutarPruebasSql('tests/pruebas_procesos.sql', ESPERADAS);
