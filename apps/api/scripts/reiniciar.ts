import { conCliente, impedirEnProduccion, migrar, sembrar } from './comun';

// Borra TODO el esquema public y lo vuelve a crear: solo para bases locales y de CI.
impedirEnProduccion('db:reset');

await conCliente(async (c) => {
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
});
console.log('Esquema public vaciado.');
await migrar();
await sembrar();
