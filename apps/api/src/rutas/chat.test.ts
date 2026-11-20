import { EVENTOS_CHAT, type ConversacionChat, type MensajeChat } from '@nexo/shared';
import type { AddressInfo } from 'node:net';
import { io as conectar, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

const cabeceraCookie = (c: Cookies) =>
  Object.entries(c)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

/** Espera el siguiente evento `nombre` del socket (o `null` si no llega en `ms`). */
const esperar = <T>(socket: Socket, nombre: string, ms = 1500) =>
  new Promise<T | null>((resolver) => {
    const t = setTimeout(() => {
      socket.off(nombre, alLlegar);
      resolver(null);
    }, ms);
    const alLlegar = (carga: T) => {
      clearTimeout(t);
      resolver(carga);
    };
    socket.once(nombre, alLlegar);
  });

const conectado = (socket: Socket) =>
  new Promise<void>((resolver, rechazar) => {
    socket.once('connect', () => resolver());
    socket.once('connect_error', (e) => rechazar(e));
  });

/** Chat del equipo (Fase 4.1): HTTP y tiempo real con la semilla (docs/03, criterio de la Fase 4). */
describe.skipIf(!DATABASE_URL)('chat', () => {
  let e: Entorno;
  let valeria: Cookies;
  let carlos: Cookies;
  let daniela: Cookies;
  let mariana: Cookies;
  let url: string;
  let canalEquipo: string;
  let canalInvitados: string;
  const antes = new Date();
  const sockets: Socket[] = [];
  const base = `/equipos/${SEMILLA.equipo}/chat`;

  const abrir = async (cookies: Cookies) => {
    const s = conectar(url, {
      extraHeaders: { cookie: cabeceraCookie(cookies) },
      transports: ['websocket'],
    });
    sockets.push(s);
    await conectado(s);
    // Las salas se calculan al conectar: se espera a que el servidor termine.
    await new Promise<void>((r) => s.emit('chat:sincronizar', () => r()));
    return s;
  };
  const decir = (cookies: Cookies, conv: string, texto: string, extra: object = {}) =>
    e.pedir(cookies, 'POST', `/chat/conversaciones/${conv}/mensajes`, { texto, ...extra });

  beforeAll(async () => {
    e = await crearEntorno();
    await e.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(e.app.server.address() as AddressInfo).port}`;
    [valeria, carlos, daniela, mariana] = await Promise.all([
      e.entrar(SEMILLA.valeria),
      e.entrar(SEMILLA.carlos),
      e.entrar(SEMILLA.daniela),
      e.entrar(SEMILLA.mariana),
    ]);
    const lista: ConversacionChat[] = (await e.pedir(valeria, 'GET', `${base}/conversaciones`))
      .cuerpo;
    canalEquipo = lista.find((c) => c.tipo === 'equipo')!.id;
    canalInvitados = lista.find((c) => c.tipo === 'invitados')!.id;
  });
  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    // Deja la semilla como estaba: fuera lo que crearon las pruebas.
    await e.db.deleteFrom('mensajes').where('creado_en', '>', antes).execute();
    await e.db.deleteFrom('conversaciones').where('creada_en', '>', antes).execute();
    await e.db.deleteFrom('tareas').where('creado_en', '>', antes).execute();
    await e.db.deleteFrom('notificaciones').where('creada_en', '>', antes).execute();
    await e.db.deleteFrom('eventos_dominio').where('creado_en', '>', antes).execute();
    await e.db.deleteFrom('actividad').where('creado_en', '>', antes).execute();
    await e.cerrar();
  });

  it('sin sesión no hay chat (401) ni conexión de socket', async () => {
    expect((await e.pedir(null, 'GET', `${base}/conversaciones`)).estado).toBe(401);
    expect(
      (await e.pedir(null, 'POST', `/chat/conversaciones/${canalEquipo}/mensajes`, { texto: 'x' }))
        .estado,
    ).toBe(401);
    const s = conectar(url, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await expect(conectado(s)).rejects.toThrow('no_autenticado');
  });

  it('«escribiendo…»: llega a quien está en la conversación, no a la invitada ni a uno mismo', async () => {
    const [sC, sD, sM] = await Promise.all([abrir(carlos), abrir(daniela), abrir(mariana)]);
    const enDaniela = esperar<{ conversacion_id: string; nombre: string }>(sD, 'chat:escribiendo');
    const enMariana = esperar(sM, 'chat:escribiendo', 600);
    const enCarlos = esperar(sC, 'chat:escribiendo', 600);
    sC.emit('chat:escribiendo', { conversacion_id: canalEquipo });
    expect(await enDaniela).toMatchObject({
      conversacion_id: canalEquipo,
      nombre: expect.stringContaining('Carlos'),
    });
    expect(await enMariana).toBeNull();
    expect(await enCarlos).toBeNull();
    // Mariana no está en la sala del equipo: su aviso no llega a nadie.
    const otraVez = esperar(sD, 'chat:escribiendo', 600);
    sM.emit('chat:escribiendo', { conversacion_id: canalEquipo });
    expect(await otraVez).toBeNull();
  });

  it('el invitado solo ve el canal de Invitados y recibe 404 en el del equipo', async () => {
    const lista: ConversacionChat[] = (await e.pedir(mariana, 'GET', `${base}/conversaciones`))
      .cuerpo;
    expect(lista.map((c) => c.tipo)).toEqual(['invitados']);
    expect(
      (await e.pedir(mariana, 'GET', `/chat/conversaciones/${canalEquipo}/mensajes`)).estado,
    ).toBe(404);
    expect((await decir(mariana, canalEquipo, 'Me cuelo')).estado).toBe(404);
    expect(
      (await e.pedir(mariana, 'GET', `${base}/buscar?q=sprint&conversacion_id=${canalEquipo}`))
        .cuerpo.length,
    ).toBe(0);
  });

  it('dos usuarios intercambian mensajes en tiempo real y el invitado no recibe los del equipo', async () => {
    const [sCarlos, sDaniela, sMariana] = await Promise.all([
      abrir(carlos),
      abrir(daniela),
      abrir(mariana),
    ]);

    // Valeria escribe en el chat del equipo: lo reciben Carlos y Daniela, no Mariana.
    const aCarlos = esperar<MensajeChat>(sCarlos, EVENTOS_CHAT.mensaje);
    const aDaniela = esperar<MensajeChat>(sDaniela, EVENTOS_CHAT.mensaje);
    const aMariana = esperar<MensajeChat>(sMariana, EVENTOS_CHAT.mensaje, 800);
    expect((await decir(valeria, canalEquipo, 'Reunión de equipo a las 5')).estado).toBe(201);
    expect((await aCarlos)?.texto).toBe('Reunión de equipo a las 5');
    expect((await aDaniela)?.texto).toBe('Reunión de equipo a las 5');
    expect(await aMariana).toBeNull();

    // Carlos responde y Valeria (sin socket) lo ve al pedir el chat.
    const aDaniela2 = esperar<MensajeChat>(sDaniela, EVENTOS_CHAT.mensaje);
    expect((await decir(carlos, canalEquipo, 'Ahí estaré')).estado).toBe(201);
    expect((await aDaniela2)?.autor?.nombre).toContain('Carlos');

    // En el canal de Invitados sí le llega a Mariana, y Carlos también lo recibe.
    const aMariana2 = esperar<MensajeChat>(sMariana, EVENTOS_CHAT.mensaje);
    const aCarlos2 = esperar<MensajeChat>(sCarlos, EVENTOS_CHAT.mensaje);
    expect((await decir(valeria, canalInvitados, 'Bienvenida, Mariana')).estado).toBe(201);
    expect((await aMariana2)?.texto).toBe('Bienvenida, Mariana');
    expect((await aCarlos2)?.texto).toBe('Bienvenida, Mariana');
    // Y ni Mariana ni nadie recibió nada del equipo mientras tanto.
    expect(await esperar(sMariana, EVENTOS_CHAT.mensaje, 300)).toBeNull();
  });

  it('un mensaje reenviado con el mismo id_cliente no se duplica y valida la entrada', async () => {
    const id = crypto.randomUUID();
    const a = await decir(carlos, canalEquipo, 'Una sola vez', { id_cliente: id });
    const b = await decir(carlos, canalEquipo, 'Una sola vez', { id_cliente: id });
    expect(b.cuerpo.id).toBe(a.cuerpo.id);
    expect((await decir(carlos, canalEquipo, '   ')).estado).toBe(400);
    expect((await decir(carlos, canalEquipo, 'x'.repeat(4001))).estado).toBe(400);
    expect(
      (await e.pedir(carlos, 'POST', `/chat/conversaciones/no-es-uuid/mensajes`, { texto: 'x' }))
        .estado,
    ).toBe(400);
  });

  it('hilos, reacciones, menciones y no leídos', async () => {
    const raiz = (await decir(valeria, canalEquipo, 'Revisen la propuesta del cliente'))
      .cuerpo as MensajeChat;
    const id = (
      await e.pedir(daniela, 'GET', `/chat/conversaciones/${canalEquipo}/miembros`)
    ).cuerpo.find((m: { nombre: string }) => m.nombre.startsWith('Carlos')).usuario_id as string;
    const r = await decir(daniela, canalEquipo, '@Carlos ya la revisé', {
      hilo_de_id: raiz.id,
      menciones: [id],
    });
    expect(r.cuerpo.hilo_de_id).toBe(raiz.id);
    const hilo = (await e.pedir(carlos, 'GET', `/chat/mensajes/${raiz.id}/hilo`)).cuerpo;
    expect(hilo.respuestas).toHaveLength(1);
    expect(hilo.raiz.respuestas).toBe(1);

    const rx = await e.pedir(carlos, 'POST', `/chat/mensajes/${raiz.id}/reaccion`, {
      tipo: 'hecho',
    });
    expect(rx.cuerpo.reacciones).toEqual([{ tipo: 'hecho', total: 1, yo: true }]);
    expect(
      (await e.pedir(carlos, 'POST', `/chat/mensajes/${raiz.id}/reaccion`, { tipo: 'enojo' }))
        .estado,
    ).toBe(400);

    const notifs = (await e.pedir(carlos, 'GET', '/notificaciones')).cuerpo;
    expect(
      notifs.items.some(
        (n: { categoria: string; titulo: string }) =>
          n.categoria === 'menciones' && n.titulo.includes('te mencionó'),
      ),
    ).toBe(true);

    const lista: ConversacionChat[] = (await e.pedir(carlos, 'GET', `${base}/conversaciones`))
      .cuerpo;
    const ch = lista.find((c) => c.id === canalEquipo)!;
    expect(ch.menciones_sin_leer).toBeGreaterThanOrEqual(1);
    const ultimo = (
      await e.pedir(carlos, 'GET', `/chat/conversaciones/${canalEquipo}/mensajes`)
    ).cuerpo.items.at(-1) as MensajeChat;
    const leido = await e.pedir(carlos, 'POST', `/chat/conversaciones/${canalEquipo}/lectura`, {
      hasta_seq: ultimo.seq + 100,
    });
    expect(leido.cuerpo.no_leidos).toBe(0);
  });

  it('moderación: fijar y eliminar ajenos es del líder', async () => {
    const m = (await decir(carlos, canalEquipo, 'Mensaje de Carlos')).cuerpo as MensajeChat;
    expect(
      (await e.pedir(carlos, 'POST', `/chat/mensajes/${m.id}/fijar`, { fijado: true })).estado,
    ).toBe(403);
    const fijado = await e.pedir(valeria, 'POST', `/chat/mensajes/${m.id}/fijar`, { fijado: true });
    expect(fijado.cuerpo.fijado).toBe(true);
    const lista = (await e.pedir(daniela, 'GET', `/chat/conversaciones/${canalEquipo}/fijados`))
      .cuerpo;
    expect(lista.map((x: MensajeChat) => x.id)).toContain(m.id);
    expect((await e.pedir(daniela, 'DELETE', `/chat/mensajes/${m.id}`)).estado).toBe(403);
    const borrado = await e.pedir(valeria, 'DELETE', `/chat/mensajes/${m.id}`);
    expect(borrado.cuerpo).toMatchObject({ eliminado: true, texto: '', fijado: false });
  });

  it('mensajes directos: privados, uno por pareja y no para invitados', async () => {
    const carlosId = (
      await e.pedir(valeria, 'GET', `/chat/conversaciones/${canalEquipo}/miembros`)
    ).cuerpo.find((m: { nombre: string }) => m.nombre.startsWith('Carlos')).usuario_id as string;
    const dm = (await e.pedir(daniela, 'POST', `${base}/dm`, { usuario_id: carlosId }))
      .cuerpo as ConversacionChat;
    expect(dm.tipo).toBe('dm');
    expect(dm.nombre).toContain('Carlos');
    expect((await e.pedir(daniela, 'POST', `${base}/dm`, { usuario_id: carlosId })).cuerpo.id).toBe(
      dm.id,
    );
    expect((await decir(daniela, dm.id, 'Hablemos del presupuesto')).estado).toBe(201);
    // Ni la líder ni la invitada ven ese directo; la invitada tampoco puede abrir uno.
    expect((await e.pedir(valeria, 'GET', `/chat/conversaciones/${dm.id}/mensajes`)).estado).toBe(
      404,
    );
    expect((await e.pedir(mariana, 'GET', `/chat/conversaciones/${dm.id}/mensajes`)).estado).toBe(
      404,
    );
    expect((await e.pedir(mariana, 'POST', `${base}/dm`, { usuario_id: carlosId })).estado).toBe(
      403,
    );
    expect((await e.pedir(valeria, 'GET', `${base}/buscar?q=presupuesto`)).cuerpo).toHaveLength(0);
    expect((await e.pedir(carlos, 'GET', `${base}/buscar?q=presupuesto`)).cuerpo).toHaveLength(1);
  });

  it('chat por tarea: el invitado solo entra a las compartidas; la líder convierte mensajes en tareas', async () => {
    const tareas = (await e.pedir(valeria, 'GET', `/equipos/${SEMILLA.equipo}/tareas`)).cuerpo as {
      id: string;
      codigo: number;
    }[];
    const t1 = tareas.find((t) => t.codigo === 1)!; // compartida con Mariana
    const t2 = tareas.find((t) => t.codigo === 2)!; // no compartida
    const ruta = (t: string) => `${base}/tareas/${t}/conversacion`;
    const conv = (await e.pedir(valeria, 'POST', ruta(t1.id))).cuerpo as ConversacionChat;
    expect(conv.tipo).toBe('tarea');
    expect((await e.pedir(mariana, 'POST', ruta(t1.id))).cuerpo.id).toBe(conv.id);
    expect((await e.pedir(mariana, 'POST', ruta(t2.id))).estado).toBe(404);
    expect((await decir(mariana, conv.id, 'Yo reviso el diseño')).estado).toBe(201);

    const m = (await decir(carlos, canalEquipo, 'Falta documentar la API de chat'))
      .cuerpo as MensajeChat;
    expect((await e.pedir(carlos, 'POST', `/chat/mensajes/${m.id}/tarea`, {})).estado).toBe(403);
    const r = await e.pedir(valeria, 'POST', `/chat/mensajes/${m.id}/tarea`, {});
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.tarea.estado).toBe('propuesta');
    expect(r.cuerpo.mensaje.tarea.id).toBe(r.cuerpo.tarea.id);
    expect((await e.pedir(valeria, 'POST', `/chat/mensajes/${m.id}/tarea`, {})).estado).toBe(409);
  });

  it('búsqueda: en español y solo en lo visible', async () => {
    const r = (await e.pedir(carlos, 'GET', `${base}/buscar?q=reuniones`)).cuerpo as {
      fragmento: string;
    }[];
    expect(r.some((x) => x.fragmento.includes('«Reunión»'))).toBe(true);
    expect((await e.pedir(carlos, 'GET', `${base}/buscar?q=a`)).estado).toBe(400);
    const deMariana = (await e.pedir(mariana, 'GET', `${base}/buscar?q=reuniones`))
      .cuerpo as unknown[];
    expect(deMariana).toHaveLength(0);
  });
});
