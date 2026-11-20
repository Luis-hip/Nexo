import { conCliente, impedirEnProduccion, leerSql } from './comun';

/**
 * Fase 5.4 · Carga la semilla ampliada (db/seed/volumen.sql: 50 equipos, 500 usuarios, 20 000 tareas,
 * 200 000 mensajes) para medir las consultas clave con `pnpm db:explain`. Solo en local o en la CI.
 */
impedirEnProduccion('db:volumen');
const inicio = Date.now();
const sql = await leerSql('seed/volumen.sql');
await conCliente((c) => c.query(sql));
console.log(`Semilla de volumen cargada en ${Math.round((Date.now() - inicio) / 1000)} s.`);
