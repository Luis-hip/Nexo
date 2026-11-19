import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import type { BaseDatos } from '../db/conexion';
import * as repoCuenta from '../repositorios/cuenta';
import { COOKIE_SESION, hashToken } from '../sesiones';

function extraerCookie(cookieHeader: string | undefined, nombre: string): string | null {
  if (!cookieHeader) return null;
  for (const parte of cookieHeader.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function registrarSocketIO(app: FastifyInstance, db: BaseDatos, appUrl: string): Server {
  const io = new Server(app.server, {
    cors: {
      origin: appUrl,
      credentials: true,
    },
  });

  // 1. Autenticación en el handshake mediante la cookie `nexo_sesion`
  io.use(async (socket, next) => {
    try {
      const token = extraerCookie(socket.handshake.headers.cookie, COOKIE_SESION);
      if (!token) return next(new Error('no_autenticado'));

      const sesion = await repoCuenta.resolverSesion(db, hashToken(token));
      if (!sesion) return next(new Error('sesion_invalida'));

      socket.data.usuario = sesion.usuario;
      socket.data.sesionId = sesion.sesion_id;
      return next();
    } catch {
      return next(new Error('error_autenticacion'));
    }
  });

  // 2. Conexión: el servidor decide a qué salas entra según membresía y rol
  io.on('connection', async (socket: Socket) => {
    const usuario = socket.data.usuario as { id: string };

    // Sala personal para menciones directas y notificaciones en tiempo real
    socket.join(`usuario:${usuario.id}`);

    // Consultar membresías activas del usuario
const membresias = await db
  .selectFrom('membresias')
  .select(['id', 'equipo_id', 'rol'])
  .where('usuario_id', '=', usuario.id)
  .where('estado', '=', 'activa')
  .execute();

    for (const m of membresias) {
      if (m.rol === 'lider' || m.rol === 'integrante') {
        // Miembros internos entran a la sala del equipo y a todas las conversaciones permitidas
        socket.join(`equipo:${m.equipo_id}`);

        const convs = await db
          .selectFrom('conversaciones')
          .select(['id'])
          .where('equipo_id', '=', m.equipo_id)
          .where((eb) =>
            eb.or([
              eb('tipo', 'in', ['equipo', 'tarea', 'invitados']),
              eb.and([
                eb('tipo', '=', 'dm'),
                eb.or([
                  eb('dm_usuario_a', '=', usuario.id),
                  eb('dm_usuario_b', '=', usuario.id),
                ]),
              ]),
            ]),
          )
          .execute();

        for (const c of convs) {
          socket.join(`conv:${c.id}`);
        }
      } else if (m.rol === 'invitado') {
        // Regla 4.1.4: Invitados SOLO entran al canal 'invitados' y a conversaciones de tareas compartidas
        const convInvitados = await db
          .selectFrom('conversaciones')
          .select(['id'])
          .where('equipo_id', '=', m.equipo_id)
          .where('tipo', '=', 'invitados')
          .execute();

        for (const c of convInvitados) {
          socket.join(`conv:${c.id}`);
        }

        const convTareasCompartidas = await db
  .selectFrom('conversaciones as c')
  .innerJoin('tarea_compartida as tc', 'tc.tarea_id', 'c.tarea_id')
  .select(['c.id'])
  .where('c.equipo_id', '=', m.equipo_id)
  .where('c.tipo', '=', 'tarea')
  .where('tc.membresia_id', '=', m.id)
  .execute();

        for (const c of convTareasCompartidas) {
          socket.join(`conv:${c.id}`);
        }
      }
    }
  });

  // Exponer instancia en Fastify para emitir eventos desde las rutas HTTP
  app.decorate('io', io);
  return io;
}

declare module 'fastify' {
  interface FastifyInstance {
    io?: Server;
  }
}