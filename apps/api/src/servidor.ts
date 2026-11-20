import { crearApp } from './app';
import { cargarConfig } from './config';
import { crearBaseDatos } from './db/conexion';
import { iniciarPlazos } from './trabajos/plazos';
import { iniciarWhatsApp } from './trabajos/whatsapp';

const config = cargarConfig();
const db = crearBaseDatos(config.DATABASE_URL);
const app = await crearApp(config, db);
// Plazos de las elecciones de líder (en las pruebas no corre: no se usa servidor.ts).
const detenerPlazos = iniciarPlazos(db, app.log);
// Despachador de eventos y WhatsApp (Fase 4.2): cada minuto.
const detenerWhatsApp = iniciarWhatsApp(db, config, app.log);

const cerrar = async () => {
  detenerPlazos();
  detenerWhatsApp();
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
