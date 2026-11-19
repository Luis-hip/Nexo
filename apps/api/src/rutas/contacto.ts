import { esquemaContacto } from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { BaseDatos } from '../db/conexion';
import * as repo from '../repositorios/cuenta';
import { validar } from '../validacion';

const ASUNTO = { duda: 'Duda', error: 'Error', sugerencia: 'Sugerencia' } as const;

/** Formulario público de contacto (PUB-08): lo guarda el proceso `proc_contacto_enviar`. */
export const rutasContacto: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  app.post(
    '/contacto',
    // Ruta sin sesión: se limita para que no sirva de buzón de spam.
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, res) => {
      const datos = validar(esquemaContacto, req.body);
      await repo.enviarContacto(db, {
        nombre: datos.nombre,
        correo: datos.correo,
        asunto: ASUNTO[datos.tipo],
        mensaje: datos.mensaje,
      });
      return res.status(201).send({ recibido: true });
    },
  );
};
