import { impedirEnProduccion, sembrar } from './comun';

// La semilla es solo para desarrollo y demos (ver db/seed/semilla.sql).
impedirEnProduccion('db:seed');
await sembrar();
