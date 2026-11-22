import { crearApp } from './app';
import { cargarConfig } from './config';
import { crearCorreo } from './correo';
import { crearBaseDatos } from './db/conexion';
import { iniciarContacto } from './trabajos/contacto';
import { iniciarPlazos } from './trabajos/plazos';
import { iniciarWhatsApp } from './trabajos/whatsapp';

const config = cargarConfig();
const db = crearBaseDatos(config.DATABASE_URL);
const app = await crearApp(config, db);
// Plazos de las elecciones de líder (en las pruebas no corre: no se usa servidor.ts).
const detenerPlazos = iniciarPlazos(db, app.log);
// Despachador de eventos y WhatsApp (Fase 4.2): cada minuto.
const detenerWhatsApp = iniciarWhatsApp(db, config, app.log);
// Outbox de contacto (cada 30 s) y su retención diaria (docs/12 §7).
const detenerContacto = iniciarContacto(db, config, crearCorreo(config, app.log), app.log);

const cerrar = async () => {
  detenerPlazos();
  detenerWhatsApp();
  detenerContacto();
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
