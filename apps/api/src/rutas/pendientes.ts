import {
  EVENTOS_CHAT,
  esquemaCrearSolicitud,
  esquemaEditarMensajeChat,
  esquemaEliminarCuenta,
  esquemaEnviarInvitacion,
  esquemaFotoPerfil,
  esquemaResolverSolicitud,
} from '@nexo/shared';
import { verify } from '@node-rs/argon2';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { exigirSesion } from '../autenticacion';
import type { Config } from '../config';
import type { Correo } from '../correo';
import type { BaseDatos } from '../db/conexion';
import { contextoEquipo, requiereEquipoActivo, requierePermiso } from '../equipos/contexto';
import { ErrorNexo } from '../errores';
import { descifrar } from '../cifrado';
import { hashActual, secreto2fa, verificar2fa } from '../repositorios/autenticacion';
import { hashRespaldo, pasoValido } from '../totp';
import * as repo from '../repositorios/pendientes';
import * as equipos from '../servicios/equipos';
import { COOKIE_SESION } from '../sesiones';
import { validar } from '../validacion';

const id = z.string().uuid('Identificador inválido.');
const rango = z.object({ desde: z.string().datetime(), hasta: z.string().datetime() });

/**
 * Pendientes tras la Fase 5 (DEC-037): agenda personal (PER-04), exportar y eliminar mis datos
 * (FALT-09), solicitudes del invitado (DEC-023) y editar mensajes del chat. Los permisos los
 * deciden los procesos de la 0032 (líder, invitado, autor del mensaje).
 */
export const rutasPendientes: FastifyPluginAsync<{
  db: BaseDatos;
  config: Config;
  correo: Correo;
}> = async (app, { db, config, correo }) => {
  const param = (req: FastifyRequest, nombre: string) =>
    validar(id, (req.params as Record<string, string>)[nombre]);

  // --- PER-04 ---------------------------------------------------------------------------------
  app.get('/personal/agenda', async (req) => {
    const { usuario } = exigirSesion(req);
    const { desde, hasta } = validar(rango, req.query);
    return repo.agenda(db, usuario.id, desde, hasta);
  });

  // --- FALT-09 --------------------------------------------------------------------------------
  app.get('/yo/datos/exportar', async (req, res) => {
    const { usuario } = exigirSesion(req);
    const r = await repo.exportar(db, usuario.id);
    const fecha = r.generada_en.slice(0, 10);
    return res
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="nexo-mis-datos-${fecha}.json"`)
      .header('cache-control', 'no-store')
      .send(JSON.stringify(r, null, 2));
  });

  app.post(
    '/yo/cuenta/eliminar',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, res) => {
      const { usuario } = exigirSesion(req);
      const d = validar(esquemaEliminarCuenta, req.body);
      const { hash } = await hashActual(db, usuario.id);
      if (hash) {
        if (!d.contrasena || !(await verify(hash, d.contrasena).catch(() => false))) {
          throw new ErrorNexo(400, 'contrasena_incorrecta', 'La contraseña no es correcta.');
        }
      } else {
        // Cuenta solo con Google (docs/13 1.2): código de la 2FA si la tiene; si no, su correo.
        const s2 = await secreto2fa(db, usuario.id);
        if (s2?.confirmado) {
          const codigo = d.codigo ?? '';
          const paso = /^\d{6}$/.test(codigo)
            ? (pasoValido(descifrar(config, s2.secreto_cifrado), codigo) ?? -1)
            : null;
          const ok = await verificar2fa(
            db,
            usuario.id,
            paso,
            paso === null ? hashRespaldo(codigo) : null,
          );
          if (!ok.valido)
            throw new ErrorNexo(400, 'codigo_incorrecto', 'El código no es correcto.');
        } else if ((d.correo ?? '').toLowerCase() !== usuario.correo.toLowerCase()) {
          throw new ErrorNexo(
            400,
            'correo_incorrecto',
            'Escribe el correo de tu cuenta para confirmar.',
          );
        }
      }
      const r = await repo.eliminarCuenta(db, usuario.id);
      res.clearCookie(COOKIE_SESION, { path: '/' });
      return r;
    },
  );

  // --- ONB-02 y PF-01: foto de perfil ---------------------------------------------------------
  app.put('/yo/foto', { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const { usuario } = exigirSesion(req);
    const f = validar(esquemaFotoPerfil, req.body ?? null);
    return repo.guardarFoto(
      db,
      usuario.id,
      f?.mime ?? null,
      f ? Buffer.from(f.contenido_base64, 'base64') : null,
    );
  });

  app.get('/usuarios/:usuarioId/foto', async (req, res) => {
    exigirSesion(req);
    const f = await repo.foto(db, param(req, 'usuarioId'));
    return res
      .header('content-type', f.mime)
      .header('cache-control', 'private, max-age=86400')
      .header('x-content-type-options', 'nosniff')
      .send(Buffer.from(f.contenido, 'base64'));
  });

  // --- Solicitudes del invitado ---------------------------------------------------------------
  app.get('/equipos/:equipoId/solicitudes', async (req) =>
    repo.solicitudes(db, exigirSesion(req).usuario.id, param(req, 'equipoId')),
  );

  app.post('/equipos/:equipoId/solicitudes', async (req, res) => {
    const { tipo } = validar(esquemaCrearSolicitud, req.body);
    const r = await repo.crearSolicitud(
      db,
      exigirSesion(req).usuario.id,
      param(req, 'equipoId'),
      tipo,
    );
    return res.status(201).send(r);
  });

  app.post('/equipos/:equipoId/solicitudes/:solicitudId', async (req) => {
    const { aprobar, dias } = validar(esquemaResolverSolicitud, req.body);
    return repo.resolverSolicitud(
      db,
      exigirSesion(req).usuario.id,
      param(req, 'equipoId'),
      param(req, 'solicitudId'),
      aprobar,
      dias ?? null,
    );
  });

  // --- AD-02: invitar por correo --------------------------------------------------------------
  app.post(
    '/equipos/:equipoId/invitaciones/:invitacionId/enviar',
    {
      config: { rateLimit: { max: config.NODE_ENV === 'test' ? 500 : 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { usuario } = exigirSesion(req);
      const ctx = await contextoEquipo(db, usuario.id, param(req, 'equipoId'));
      requierePermiso(ctx, 'invitar_personas');
      requiereEquipoActivo(ctx);
      const { correo: para } = validar(esquemaEnviarInvitacion, req.body);
      const invitacionId = param(req, 'invitacionId');
      const inv = (await equipos.listarInvitaciones(db, ctx)).find((i) => i.id === invitacionId);
      if (!inv)
        throw new ErrorNexo(404, 'invitacion_no_encontrada', 'No encontramos esa invitación.');
      if (inv.estado !== 'pendiente') {
        throw new ErrorNexo(422, 'invitacion_no_vigente', 'Esa invitación ya no está vigente.');
      }
      const { nombre: equipo } = await equipos.obtenerEquipo(db, ctx);
      const enlace = `${config.APP_URL.replace(/\/$/, '')}/invitacion/${inv.codigo}`;
      await correo.enviar({
        para,
        asunto: `${usuario.nombre} te invita a ${equipo} en Nexo`,
        texto: [
          `${usuario.nombre} te invita a unirte a «${equipo}» en Nexo como ${inv.rol_destino}.`,
          '',
          `Abre este enlace para aceptar: ${enlace}`,
          `O entra en Nexo y escribe el código: ${inv.codigo}`,
          '',
          'Si no esperabas esta invitación, puedes ignorar este correo.',
        ].join('\n'),
      });
      return { enviada: true, correo: para, proveedor: correo.proveedor };
    },
  );

  // --- Chat: editar el propio mensaje ---------------------------------------------------------
  app.patch('/chat/mensajes/:id', async (req) => {
    const actor = exigirSesion(req).usuario.id;
    const { texto } = validar(esquemaEditarMensajeChat, req.body);
    const m = await repo.editarMensaje(db, actor, param(req, 'id'), texto);
    await app.tiempoReal.emitir(actor, m.conversacion_id, EVENTOS_CHAT.mensajeEditado, m);
    return m;
  });
};
