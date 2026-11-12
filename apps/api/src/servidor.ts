import { crearApp } from './app';
import { cargarConfig } from './config';
import { crearBaseDatos } from './db/conexion';

const config = cargarConfig();
const db = crearBaseDatos(config.DATABASE_URL);
const app = await crearApp(config, db);

const cerrar = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
