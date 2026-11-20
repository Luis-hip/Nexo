import { ejecutarPruebasSql } from './comun';

/**
 * Pruebas de los procesos de la BD (docs/08, Fase 2.5): db/tests/pruebas_procesos.sql.
 * Exige exactamente las líneas «OK Pn» esperadas, en una transacción que se revierte.
 * Al agregar un caso al archivo, agrégalo también aquí.
 */
// Cada parte del proyecto declara su rango en su propia línea (así no chocan al fusionar ramas).
const rango = (desde: number, hasta: number) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => `P${desde + i}`);
const ESPERADAS = [
  ...rango(1, 103), // Fases 2.5 a 3
  ...rango(104, 129), // Fase 4 · Chat (reservado P104–P149)
  ...rango(200, 208), // Fase 5 · Autenticación (desde P200; P150–P199 siguen reservadas a WhatsApp)
];

await ejecutarPruebasSql('tests/pruebas_procesos.sql', ESPERADAS);
