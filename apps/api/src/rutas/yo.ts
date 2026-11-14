import {
  esquemaPerfil,
  esquemaPreferencias,
  type Preferencias,
  type UsuarioSesion,
  type Yo,
} from '@nexo/shared';
import type { FastifyPluginAsync } from 'fastify';
import { exigirSesion } from '../autenticacion';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import { COOKIE_SESION } from '../sesiones';
import { validar } from '../validacion';

const COLUMNAS_PREFERENCIAS = [
  'tema',
  'densidad',
  'tamano_texto',
  'reducir_movimiento',
  'formato_hora',
  'formato_fecha',
  'tour_visto',
  'idioma',
  'resumen_diario',
] as const;

export const rutasYo: FastifyPluginAsync<{ db: BaseDatos }> = async (app, { db }) => {
  /** Preferencias de la persona; crea la fila con los valores por defecto si aún no existe. */
  async function preferenciasDe(usuarioId: string): Promise<Preferencias> {
    await db
      .insertInto('preferencias_usuario')
      .values({ usuario_id: usuarioId })
      .onConflict((oc) => oc.column('usuario_id').doNothing())
      .execute();
    const fila = await db
      .selectFrom('preferencias_usuario')
      .select(COLUMNAS_PREFERENCIAS)
      .where('usuario_id', '=', usuarioId)
      .executeTakeFirstOrThrow();
    return fila as Preferencias;
  }

  /** Usuario de la sesión, sus equipos, su perfil en cada uno y sus preferencias. */
  app.get('/yo', async (req): Promise<Yo> => {
    const { usuario } = exigirSesion(req);
    const [equipos, preferencias] = await Promise.all([
      db
        .selectFrom('membresias as m')
        .innerJoin('equipos as e', 'e.id', 'm.equipo_id')
        .select(['e.id', 'e.nombre', 'm.rol', 'm.color_idx', 'm.caduca_en'])
        .where('m.usuario_id', '=', usuario.id)
        .where('m.estado', '=', 'activa')
        .where('e.estado', '=', 'activo')
        .orderBy('e.nombre')
        .execute(),
      preferenciasDe(usuario.id),
    ]);
    return {
      usuario,
      equipos: equipos.map((e) => ({ ...e, caduca_en: e.caduca_en?.toISOString() ?? null })),
      preferencias,
    };
  });

  /** Guarda cualquier subconjunto de las preferencias (apariencia, formatos, recorrido visto). */
  app.patch('/yo/preferencias', async (req): Promise<Preferencias> => {
    const { usuario } = exigirSesion(req);
    const cambios = validar(esquemaPreferencias, req.body);
    await preferenciasDe(usuario.id);
    if (Object.keys(cambios).length > 0) {
      await db
        .updateTable('preferencias_usuario')
        .set(cambios)
        .where('usuario_id', '=', usuario.id)
        .execute();
    }
    return preferenciasDe(usuario.id);
  });

  /** Actualiza el perfil propio (nombre, cargo, descripción). */
  app.patch('/yo/perfil', async (req): Promise<UsuarioSesion> => {
    const { usuario } = exigirSesion(req);
    const cambios = validar(esquemaPerfil, req.body);
    if (Object.keys(cambios).length === 0) {
      throw new ErrorNexo(400, 'validacion', 'No hay nada que cambiar.');
    }
    return db
      .updateTable('usuarios')
      .set(cambios)
      .where('id', '=', usuario.id)
      .returning(['id', 'correo', 'nombre', 'cargo', 'descripcion', 'zona_horaria', 'avatar_url'])
      .executeTakeFirstOrThrow();
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
