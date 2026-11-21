import { EVENTOS_CHAT } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import type { Config } from './config';
import type { BaseDatos } from './db/conexion';
import * as chat from './repositorios/chat';
import * as cuenta from './repositorios/cuenta';
import { COOKIE_SESION, hashToken } from './sesiones';

/**
 * Tiempo real del chat con Socket.IO (Fase 4.1, DEC-CHAT-1).
 *  - La conexión se autentica con la misma cookie de sesión que la API.
 *  - El servidor decide a qué salas se une cada conexión (`proc_chat_salas`): una sala por
 *    conversación que la persona puede ver; el cliente no pide salas.
 *  - Al emitir se vuelve a calcular quién tiene acceso (`proc_chat_miembros`) y solo reciben el
 *    evento las conexiones de esas personas. Así un invitado al que se le deja de compartir una
 *    tarea, o quien sale del equipo, deja de recibir aunque su conexión siga abierta.
 */
export interface TiempoReal {
  /** Emite `evento` a quienes pueden ver la conversación en este momento. */
  emitir(actorId: string, conversacionId: string, evento: string, carga: unknown): Promise<void>;
  /** Recalcula las salas de quienes ven la conversación y les avisa de que existe. */
  conversacionNueva(actorId: string, conversacionId: string, conversacion: unknown): Promise<void>;
  cerrar(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    tiempoReal: TiempoReal;
  }
}

const sala = (conversacionId: string) => `conv:${conversacionId}`;
const salaPersona = (usuarioId: string) => `usuario:${usuarioId}`;

/** Lee una cookie de la cabecera `Cookie` sin depender de otra librería. */
function leerCookie(cabecera: string | undefined, nombre: string): string | undefined {
  for (const par of (cabecera ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nombre) {
      try {
        return decodeURIComponent(par.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

type Conexion = Pick<Socket, 'data' | 'rooms' | 'join' | 'leave'>;

export function registrarTiempoReal(
  app: FastifyInstance,
  config: Config,
  db: BaseDatos,
): TiempoReal {
  const io = new Server(app.server, {
    cors: { origin: config.APP_URL, credentials: true },
    // Los mensajes viajan por HTTP; el socket solo recibe. Nada de cargas grandes.
    maxHttpBufferSize: 1e5,
  });

  io.use(async (socket, siguiente) => {
    try {
      const token = leerCookie(socket.handshake.headers.cookie, COOKIE_SESION);
      const sesion = token ? await cuenta.resolverSesion(db, hashToken(token)) : null;
      if (!sesion) return siguiente(new Error('no_autenticado'));
      socket.data.usuarioId = sesion.usuario.id;
      socket.data.nombre = sesion.usuario.nombre;
      siguiente();
    } catch (e) {
      app.log.error(e);
      siguiente(new Error('error_interno'));
    }
  });

  /** Une la conexión a las salas que le tocan y la saca de las demás. */
  async function sincronizar(socket: Conexion) {
    const salas = await chat.salas(db, socket.data.usuarioId as string);
    const deseadas = new Set(salas.map((s) => sala(s.conversacion_id)));
    for (const actual of [...socket.rooms]) {
      if (actual.startsWith('conv:') && !deseadas.has(actual)) void socket.leave(actual);
    }
    for (const s of deseadas) void socket.join(s);
  }

  io.on('connection', (socket) => {
    void socket.join(salaPersona(socket.data.usuarioId as string));
    sincronizar(socket).catch((e) => app.log.error(e));
    // El cliente puede pedir que se recalculen sus salas (p. ej. al volver a conectarse).
    socket.on('chat:sincronizar', (ack?: () => void) => {
      sincronizar(socket)
        .catch((e) => app.log.error(e))
        .finally(() => {
          if (typeof ack === 'function') ack();
        });
    });
    // «Escribiendo…»: solo se reenvía a la sala si esta conexión ya está en ella (el servidor decidió
    // que tiene acceso). No se guarda nada; se limita a una vez cada 2 s por conexión.
    let ultimoEscribiendo = 0;
    socket.on(EVENTOS_CHAT.escribiendo, (carga: unknown) => {
      const conversacionId = (carga as { conversacion_id?: unknown } | null)?.conversacion_id;
      if (typeof conversacionId !== 'string' || !socket.rooms.has(sala(conversacionId))) return;
      if (Date.now() - ultimoEscribiendo < 2000) return;
      ultimoEscribiendo = Date.now();
      socket.to(sala(conversacionId)).emit(EVENTOS_CHAT.escribiendo, {
        conversacion_id: conversacionId,
        usuario_id: socket.data.usuarioId as string,
        nombre: socket.data.nombre as string,
      });
    });
  });

  const tiempoReal: TiempoReal = {
    async emitir(actorId, conversacionId, evento, carga) {
      try {
        const audiencia = new Set(
          (await chat.miembros(db, actorId, conversacionId)).map((m) => m.usuario_id),
        );
        for (const s of await io.in(sala(conversacionId)).fetchSockets()) {
          if (audiencia.has(s.data.usuarioId as string)) s.emit(evento, carga);
        }
      } catch (e) {
        // Un fallo de difusión nunca debe romper la petición que ya se guardó.
        app.log.error(e);
      }
    },
    async conversacionNueva(actorId, conversacionId, conversacion) {
      try {
        const audiencia = (await chat.miembros(db, actorId, conversacionId)).map(
          (m) => m.usuario_id,
        );
        for (const id of audiencia) {
          for (const s of await io.in(salaPersona(id)).fetchSockets()) {
            await sincronizar(s as unknown as Conexion);
            s.emit(EVENTOS_CHAT.conversacionNueva, conversacion);
          }
        }
      } catch (e) {
        app.log.error(e);
      }
    },
    async cerrar() {
      await io.close();
    },
  };

  app.decorate('tiempoReal', tiempoReal);
  app.addHook('onClose', async () => {
    await tiempoReal.cerrar();
  });
  return tiempoReal;
}
