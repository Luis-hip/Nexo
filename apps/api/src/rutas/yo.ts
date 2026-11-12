import type { Yo } from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { COOKIE_SESION } from '../sesiones';

export const rutasYo: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  /** Usuario de la sesión, sus equipos y su perfil en cada uno. */
  app.get('/yo', async (req): Promise<Yo> => {
    const { usuario } = exigirSesion(req);
    const equipos = await db
      .selectFrom('membresias as m')
      .innerJoin('equipos as e', 'e.id', 'm.equipo_id')
      .select(['e.id', 'e.nombre', 'm.rol', 'm.color_idx', 'm.caduca_en'])
      .where('m.usuario_id', '=', usuario.id)
      .where('m.estado', '=', 'activa')
      .where('e.estado', '=', 'activo')
      .orderBy('e.nombre')
      .execute();
    return {
      usuario,
      equipos: equipos.map((e) => ({ ...e, caduca_en: e.caduca_en?.toISOString() ?? null })),
    };
  });

  /** Cierra la sesión: la revoca en la BD y borra la cookie. */
  app.post('/salir', async (req, res) => {
    const { sesionId } = exigirSesion(req);
    await db
      .updateTable('sesiones')
      .set({ revocada_en: new Date() })
      .where('id', '=', sesionId)
      .execute();
    res.clearCookie(COOKIE_SESION, { path: '/' });
    return res.status(204).send();
  });
};
