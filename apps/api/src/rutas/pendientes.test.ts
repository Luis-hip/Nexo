import type { ConversacionChat, ReunionAgenda, SolicitudInvitado } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';
import { COOKIE_SESION } from '../sesiones';

/**
 * Pendientes tras la Fase 5 (0032, DEC-037) con la semilla: agenda personal, exportar y eliminar
 * datos, solicitudes del invitado y editar mensajes del chat.
 */
describe.skipIf(!DATABASE_URL)('pendientes tras la Fase 5', () => {
  let e: Entorno;
  let valeria: Cookies;
  let carlos: Cookies;
  let mariana: Cookies;
  const antes = new Date();
  const E = `/equipos/${SEMILLA.equipo}`;
  const marca = `pend-${Date.now()}`;

  beforeAll(async () => {
    e = await crearEntorno();
    [valeria, carlos, mariana] = await Promise.all([
      e.entrar(SEMILLA.valeria),
      e.entrar(SEMILLA.carlos),
      e.entrar(SEMILLA.mariana),
    ]);
  });
  afterAll(async () => {
    await e.db.deleteFrom('reuniones').where('creada_en', '>', antes).execute();
    await e.db.deleteFrom('solicitudes_invitado').where('creada_en', '>', antes).execute();
    await e.db.deleteFrom('exportaciones_datos').where('solicitada_en', '>', antes).execute();
    await e.db.deleteFrom('mensajes').where('creado_en', '>', antes).execute();
    await e.db.deleteFrom('usuarios').where('correo', 'like', `%${marca}%`).execute();
    await e.cerrar();
  });

  it('PER-04: la agenda personal trae las reuniones de mis equipos; el invitado no ve reuniones', async () => {
    const inicio = new Date(Date.now() + 2 * 86_400_000).toISOString();
    expect(
      (await e.pedir(valeria, 'POST', `${E}/reuniones`, { titulo: 'Agenda personal', inicio }))
        .estado,
    ).toBe(201);
    const q = `?desde=${new Date().toISOString()}&hasta=${new Date(Date.now() + 7 * 86_400_000).toISOString()}`;
    const r = await e.pedir(carlos, 'GET', `/personal/agenda${q}`);
    expect(r.estado).toBe(200);
    const reunion = (r.cuerpo as ReunionAgenda[]).find((x) => x.titulo === 'Agenda personal');
    expect(reunion).toMatchObject({ equipo_id: SEMILLA.equipo, equipo_nombre: 'Equipo Nexo' });
    const inv = await e.pedir(mariana, 'GET', `/personal/agenda${q}`);
    expect((inv.cuerpo as ReunionAgenda[]).some((x) => x.titulo === 'Agenda personal')).toBe(false);
    expect((await e.pedir(carlos, 'GET', '/personal/agenda?desde=x&hasta=y')).estado).toBe(400);
    expect((await e.pedir(null, 'GET', `/personal/agenda${q}`)).estado).toBe(401);
  });

  it('FALT-09: exportar descarga un JSON con mis datos y sin el hash de la contraseña', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/yo/datos/exportar', cookies: carlos });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="nexo-mis-datos-/);
    const cuerpo = r.json() as { datos: { perfil: Record<string, unknown>; equipos: unknown[] } };
    expect(cuerpo.datos.perfil.correo).toBe(SEMILLA.carlos);
    expect(cuerpo.datos.perfil).not.toHaveProperty('hash_contrasena');
    expect(r.body).not.toContain('$argon2id$');
    expect(cuerpo.datos.equipos.length).toBeGreaterThan(0);
  });

  it('FALT-09: eliminar la cuenta pide la contraseña; después ya no se puede entrar', async () => {
    const correo = `${marca}@nexo.test`;
    const reg = await e.app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: { nombre: 'Cuenta Temporal', correo, contrasena: 'Temporal-2026!' },
    });
    expect(reg.statusCode).toBe(201);
    const yo = { [COOKIE_SESION]: reg.cookies.find((c) => c.name === COOKIE_SESION)!.value };
    expect(
      (
        await e.pedir(yo, 'POST', '/yo/cuenta/eliminar', {
          contrasena: 'x',
          confirmacion: 'ELIMINAR',
        })
      ).estado,
    ).toBe(400);
    expect(
      (await e.pedir(yo, 'POST', '/yo/cuenta/eliminar', { contrasena: 'Temporal-2026!' })).estado,
    ).toBe(400);
    const ok = await e.pedir(yo, 'POST', '/yo/cuenta/eliminar', {
      contrasena: 'Temporal-2026!',
      confirmacion: 'ELIMINAR',
    });
    expect(ok.estado, JSON.stringify(ok.cuerpo)).toBe(200);
    expect((await e.pedir(yo, 'GET', '/yo')).estado).toBe(401);
    const entrar = await e.app.inject({
      method: 'POST',
      url: '/auth/entrar',
      payload: { correo, contrasena: 'Temporal-2026!' },
    });
    expect(entrar.statusCode).toBe(401);
    // La líder de un equipo con más personas primero transfiere.
    const lider = await e.pedir(valeria, 'POST', '/yo/cuenta/eliminar', {
      contrasena: 'Nexo-2026',
      confirmacion: 'ELIMINAR',
    });
    expect(lider.estado).toBe(422);
  });

  it('solicitudes: la invitada pide más días, la líder la ve y la aprueba; el integrante no', async () => {
    const s = await e.pedir(mariana, 'POST', `${E}/solicitudes`, { tipo: 'ampliacion' });
    expect(s.estado, JSON.stringify(s.cuerpo)).toBe(201);
    expect((await e.pedir(carlos, 'POST', `${E}/solicitudes`, { tipo: 'ampliacion' })).estado).toBe(
      403,
    );
    expect((await e.pedir(carlos, 'GET', `${E}/solicitudes`)).estado).toBe(403);
    const lista: SolicitudInvitado[] = (await e.pedir(valeria, 'GET', `${E}/solicitudes`)).cuerpo;
    expect(lista.find((x) => x.id === s.cuerpo.id)?.persona?.nombre).toContain('Mariana');
    const r = await e.pedir(valeria, 'POST', `${E}/solicitudes/${s.cuerpo.id}`, {
      aprobar: true,
      dias: 7,
    });
    expect(r.cuerpo).toMatchObject({ estado: 'aprobada' });
    const mias: SolicitudInvitado[] = (await e.pedir(mariana, 'GET', `${E}/solicitudes`)).cuerpo;
    expect(mias.find((x) => x.id === s.cuerpo.id)?.estado).toBe('aprobada');
  });

  it('AD-02: la líder manda por correo el enlace de una invitación; el integrante no puede', async () => {
    const inv = await e.pedir(valeria, 'POST', `${E}/invitaciones`, { rol_destino: 'integrante' });
    expect(inv.estado).toBe(201);
    const url = `${E}/invitaciones/${inv.cuerpo.id}/enviar`;
    expect((await e.pedir(carlos, 'POST', url, { correo: 'x@nexo.test' })).estado).toBe(403);
    expect((await e.pedir(valeria, 'POST', url, { correo: 'no-es-correo' })).estado).toBe(400);
    const r = await e.pedir(valeria, 'POST', url, { correo: `amiga-${marca}@nexo.test` });
    expect(r.cuerpo).toMatchObject({ enviada: true });
    const m = e.correos.find((c) => c.para === `amiga-${marca}@nexo.test`);
    expect(m?.asunto).toContain('Equipo Nexo');
    expect(m?.texto).toContain(`/invitacion/${inv.cuerpo.codigo}`);
    await e.pedir(valeria, 'POST', `${E}/invitaciones/${inv.cuerpo.id}/revocar`);
    expect((await e.pedir(valeria, 'POST', url, { correo: 'otra@nexo.test' })).estado).toBe(422);
  });

  it('foto de perfil: se sube, se sirve con sesión, se valida el tipo y se quita', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const r = await e.pedir(carlos, 'PUT', '/yo/foto', {
      mime: 'image/png',
      contenido_base64: png.toString('base64'),
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo.avatar_url).toMatch(/^\/usuarios\/.+\/foto\?v=/);
    const ruta = r.cuerpo.avatar_url.split('?')[0];
    const img = await e.app.inject({ method: 'GET', url: ruta, cookies: valeria });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.equals(png)).toBe(true);
    expect((await e.app.inject({ method: 'GET', url: ruta })).statusCode).toBe(401);
    expect(
      (
        await e.pedir(carlos, 'PUT', '/yo/foto', {
          mime: 'application/pdf',
          contenido_base64: 'JQ==',
        })
      ).estado,
    ).toBe(400);
    const sin = await e.pedir(carlos, 'PUT', '/yo/foto', null as unknown as object);
    expect(sin.cuerpo).toEqual({ avatar_url: null });
  });

  it('chat: el autor edita su mensaje; otra persona no puede (403)', async () => {
    const lista: ConversacionChat[] = (await e.pedir(carlos, 'GET', `${E}/chat/conversaciones`))
      .cuerpo;
    const canal = lista.find((c) => c.tipo === 'equipo')!.id;
    const m = await e.pedir(carlos, 'POST', `/chat/conversaciones/${canal}/mensajes`, {
      texto: 'Mensjae con error',
    });
    expect(m.estado).toBe(201);
    const ed = await e.pedir(carlos, 'PATCH', `/chat/mensajes/${m.cuerpo.id}`, {
      texto: 'Mensaje sin error',
    });
    expect(ed.cuerpo).toMatchObject({ texto: 'Mensaje sin error' });
    expect(ed.cuerpo.editado_en).not.toBeNull();
    expect(
      (await e.pedir(valeria, 'PATCH', `/chat/mensajes/${m.cuerpo.id}`, { texto: 'Ajeno' })).estado,
    ).toBe(403);
  });
});
