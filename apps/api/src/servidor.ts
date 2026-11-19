import { crearApp } from './app';
import { cargarConfig } from './config';
import { crearBaseDatos } from './db/conexion';
import { registrarSocketIO } from './realtime/socket';
import { iniciarPlazos } from './trabajos/plazos';

const config = cargarConfig();
const db = crearBaseDatos(config.DATABASE_URL);
const app = await crearApp(config, db);
const io = registrarSocketIO(app, db, config.APP_URL);
// Plazos de las elecciones de líder (en las pruebas no corre: no se usa servidor.ts).
const detenerPlazos = iniciarPlazos(db, app.log);

const cerrar = async () => {
  detenerPlazos();
  io.close();
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.PORT, host: '0.0.0.0' });