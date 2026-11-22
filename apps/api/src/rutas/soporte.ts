import { esquemaCrearSoporte } from '@nexo/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { Config } from '../config';
import type { Correo } from '../correo';
import type { BaseDatos } from '../db/conexion';
import { ErrorNexo } from '../errores';
import * as repo from '../repositorios/soporte';
import { crearTokenSesion } from '../sesiones';
import { validar } from '../validacion';

/**
 * Tablero de soporte (docs/15_Rol_Soporte.md): cifras de la plataforma, ayuda con cuentas, bitácora
 * y el equipo de soporte. Cada proceso exige cuenta de soporte, su permiso y la 2FA.
 */
const esquemaId = z.object({ id: z.uuid() });
const HORA = 60 * 60 * 1000;

export const rutasSoporte: FastifyPluginAsync<{
  db: BaseDatos;
  config: Config;
  correo: Correo;
}> = async (app, { db, config, correo }) => {
  const actor = (req: FastifyRequest) => exigirSesion(req).usuario.id;
  const enlace = (ruta: string, token: string) =>
    `${config.APP_URL.replace(/\/$/, '')}${ruta}?token=${encodeURIComponent(token)}`;
  /** Un correo que no sale no rompe la acción (Resend puede no estar configurado). */
  const enviar = async (para: string, asunto: string, texto: string) => {
    if (correo.proveedor === 'ninguno') return false;
    try {
      await correo.enviar({ para, asunto, texto });
      return true;
    } catch (e) {
      app.log.error({ err: e, asunto }, 'No se pudo enviar el correo de soporte.');
      return false;
    }
  };

  app.get('/soporte/plataforma', async (req) => repo.plataforma(db, actor(req)));

  app.get('/soporte/cuentas', async (req) => {
    const { correo: dir } = validar(
      z.object({ correo: z.string().trim().min(3).max(254) }),
      req.query,
    );
    const r = await repo.buscarCuenta(db, actor(req), dir);
    if (!r.encontrada || !r.cuenta) {
      throw new ErrorNexo(404, 'cuenta_no_encontrada', 'No hay una cuenta con ese correo.');
    }
    return r.cuenta;
  });

  app.post('/soporte/cuentas/:id/desbloquear', async (req) =>
    repo.desbloquear(db, actor(req), validar(esquemaId, req.params).id),
  );

  app.post('/soporte/cuentas/:id/verificacion', async (req) => {
    const { token, hash } = crearTokenSesion();
    const r = await repo.reenviarVerificacion(
      db,
      actor(req),
      validar(esquemaId, req.params).id,
      hash,
      new Date(Date.now() + 24 * HORA),
    );
    const enviado = await enviar(
      r.correo,
      'Confirma tu correo en Nexo',
      `Hola, ${r.nombre}:\n\nEl equipo de soporte de Nexo te manda un enlace nuevo para confirmar tu correo (vence en 24 horas):\n${enlace('/verificar', token)}\n\nSi no lo pediste, ignora este mensaje.`,
    );
    return { enviado };
  });

  app.get('/soporte/bitacora', async (req) => {
    const { limite } = validar(
      z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }),
      req.query,
    );
    return repo.bitacora(db, actor(req), limite);
  });

  app.get('/soporte/equipo', async (req) => repo.equipo(db, actor(req)));

  // Alta de otra cuenta de soporte: solo con `soporte.alta` (lo exige el proceso). La persona elige
  // su contraseña con el enlace de un solo uso (72 h); se le manda por correo y se muestra una vez
  // a quien la dio de alta, por si el correo no sale.
  app.post('/soporte/equipo', async (req, res) => {
    const datos = validar(esquemaCrearSoporte, req.body);
    const { token, hash } = crearTokenSesion();
    const r = await repo.crearCuenta(db, actor(req), datos, hash, new Date(Date.now() + 72 * HORA));
    const url = enlace('/restablecer', token);
    const enviado = await enviar(
      r.correo,
      'Tu cuenta de soporte de Nexo',
      `Hola, ${r.nombre}:\n\nTe dieron de alta en el equipo de soporte de Nexo. Elige tu contraseña con este enlace (vence en 72 horas):\n${url}\n\nAl entrar tendrás que activar la verificación en dos pasos.`,
    );
    return res.status(201).send({ ...r, enlace: url, correo_enviado: enviado });
  });
};
