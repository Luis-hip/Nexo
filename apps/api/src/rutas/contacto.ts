import { esquemaContacto } from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { BaseDatos } from '../db/conexion';
import { validar } from '../validacion';

const ASUNTO = { duda: 'Duda', error: 'Error', sugerencia: 'Sugerencia' } as const;

/** Formulario público de contacto (PUB-08): guarda el mensaje en `contacto_mensajes`. */
export const rutasContacto: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  app.post(
    '/contacto',
    // Ruta sin sesión: se limita para que no sirva de buzón de spam.
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, res) => {
      const datos = validar(esquemaContacto, req.body);
      await db
        .insertInto('contacto_mensajes')
        .values({
          nombre: datos.nombre,
          correo: datos.correo,
          asunto: ASUNTO[datos.tipo],
          mensaje: datos.mensaje,
        })
        .execute();
      return res.status(201).send({ recibido: true });
    },
  );
};
