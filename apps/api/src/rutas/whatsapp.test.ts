import type { ColaWa, HistorialWa, PanelWa } from '@nexo/shared';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cargarConfig } from '../config';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';
import { firmaValida } from './whatsapp';

const SECRETO = 'secreto-de-prueba-del-webhook';
const VERIFICAR = 'token-de-verificacion-de-prueba';
const wamid = `wamid.PRUEBA-${Date.now()}`;

describe('configuración de WhatsApp en producción', () => {
  const produccion = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://nexo_app:pw@bd.interna/nexo',
    SESSION_SECRET: 'a'.repeat(40),
    ENCRYPTION_KEY: 'ab12'.repeat(16),
    APP_URL: 'https://app.ejemplo.test',
    API_URL: 'https://api.ejemplo.test',
  };
  it('el modo simulado es el de siempre y el real exige las cuatro variables de Meta', () => {
    expect(cargarConfig(produccion).WHATSAPP_PROVIDER).toBe('simulado');
    expect(() => cargarConfig({ ...produccion, WHATSAPP_PROVIDER: 'real' })).toThrow(
      /WHATSAPP_TOKEN/,
    );
    expect(cargarConfig({ ...produccion, WHATSAPP_TOKEN: '' }).WHATSAPP_TOKEN).toBeUndefined();
  });
  it('la firma del webhook es el HMAC-SHA256 del cuerpo crudo', () => {
    const cuerpo = Buffer.from('{"a":1}');
    const firma = `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}`;
    expect(firmaValida(SECRETO, cuerpo, firma)).toBe(true);
    expect(firmaValida(SECRETO, Buffer.from('{"a":2}'), firma)).toBe(false);
    expect(firmaValida(SECRETO, cuerpo, undefined)).toBe(false);
  });
});

/** WhatsApp (Fase 4.2 y 4.3) con la semilla: el Equipo Nexo ya tiene WhatsApp simulado conectado. */
describe.skipIf(!DATABASE_URL)('whatsapp', () => {
  let e: Entorno;
  let valeria: Cookies;
  let carlos: Cookies;
  let mariana: Cookies;
  const antes = new Date();
  const E = `/equipos/${SEMILLA.equipo}`;
  const ciclo = () => e.pedir(valeria, 'POST', '/dev/whatsapp/ciclo');

  beforeAll(async () => {
    e = await crearEntorno({ WHATSAPP_APP_SECRET: SECRETO, WHATSAPP_VERIFY_TOKEN: VERIFICAR });
    [valeria, carlos, mariana] = await Promise.all([
      e.entrar(SEMILLA.valeria),
      e.entrar(SEMILLA.carlos),
      e.entrar(SEMILLA.mariana),
    ]);
    // Lo que dejaron otras pruebas no cuenta aquí.
    await e.db
      .updateTable('eventos_dominio')
      .set({ procesado_en: new Date() })
      .where('procesado_en', 'is', null)
      .execute();
  });
  afterAll(async () => {
    await e.db.deleteFrom('whatsapp_mensajes').where('creado_en', '>', antes).execute();
    await e.db.deleteFrom('reuniones').where('creada_en', '>', antes).execute();
    await e.db.deleteFrom('whatsapp_webhook_eventos').where('recibido_en', '>', antes).execute();
    await e.db.deleteFrom('notificaciones').where('creada_en', '>', antes).execute();
    await e.db
      .updateTable('whatsapp_configuracion')
      .set({
        estado: 'conectado',
        reporte_hora: '18:00',
        reporte_frecuencia: 'diario',
        ultimo_reporte_en: null,
        envio_automatico: false,
      })
      .where('equipo_id', '=', SEMILLA.equipo)
      .execute();
    await e.cerrar();
  });

  it('permisos: el panel y la cola son del líder; el historial también del integrante; el invitado no ve nada', async () => {
    expect((await e.pedir(valeria, 'GET', `${E}/whatsapp`)).estado).toBe(200);
    expect((await e.pedir(carlos, 'GET', `${E}/whatsapp`)).estado).toBe(403);
    expect((await e.pedir(carlos, 'GET', `${E}/whatsapp/cola`)).estado).toBe(403);
    expect((await e.pedir(carlos, 'GET', `${E}/whatsapp/historial`)).estado).toBe(200);
    expect((await e.pedir(mariana, 'GET', `${E}/whatsapp/historial`)).estado).toBe(403);
    expect((await e.pedir(null, 'GET', `${E}/whatsapp/historial`)).estado).toBe(401);
  });

  it('un evento genera el aviso con su plantilla; la líder lo envía y queda en el historial como enviado', async () => {
    const r = await e.pedir(valeria, 'POST', `${E}/reuniones`, {
      titulo: 'Revisión de WhatsApp',
      inicio: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect((await ciclo()).estado).toBe(200);

    const cola: ColaWa = (await e.pedir(valeria, 'GET', `${E}/whatsapp/cola`)).cuerpo;
    const aviso = cola.instantaneos.find((m) => m.texto.includes('«Revisión de WhatsApp»'));
    expect(aviso?.texto).toMatch(
      /^📅 Reunión «Revisión de WhatsApp» el .+\. Confirma tu asistencia en Nexo\.$/,
    );

    const envio = await e.pedir(valeria, 'POST', `${E}/whatsapp/cola/enviar`, { ids: [aviso!.id] });
    expect(envio.cuerpo).toEqual({ enviados: 1, fallidos: 0 });
    const h: HistorialWa = (await e.pedir(carlos, 'GET', `${E}/whatsapp/historial?estado=enviado`))
      .cuerpo;
    const enviado = h.items.find((m) => m.id === aviso!.id);
    expect(enviado).toMatchObject({
      estado: 'enviado',
      enviado_por: { nombre: expect.stringContaining('Valeria') },
    });
  });

  it('el integrante no envía la cola (403) y el texto se edita antes de enviar', async () => {
    expect((await e.pedir(carlos, 'POST', `${E}/whatsapp/cola/enviar`, {})).estado).toBe(403);
    // Un aviso propio de la prueba (la semilla no se toca).
    const m = await e.db
      .insertInto('whatsapp_mensajes')
      .values({
        equipo_id: SEMILLA.equipo,
        tipo_evento: 'reunion',
        texto: 'Por corregir',
        tipo_envio: 'instantaneo',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const r = await e.pedir(valeria, 'PATCH', `/whatsapp/mensajes/${m.id}`, {
      texto: 'Texto corregido',
    });
    expect(r.cuerpo.texto).toBe('Texto corregido');
    expect(
      (await e.pedir(carlos, 'PATCH', `/whatsapp/mensajes/${m.id}`, { texto: 'x' })).estado,
    ).toBe(403);
    await e.pedir(valeria, 'POST', `${E}/whatsapp/cola/descartar`, { ids: [m.id] });
  });

  it('un reporte programado se genera y se envía a la hora', async () => {
    // Pone «aceptada» al reporte y genera una propuesta aceptada… más simple: un aviso de reporte a mano.
    await e.db
      .insertInto('whatsapp_mensajes')
      .values({
        equipo_id: SEMILLA.equipo,
        tipo_evento: 'aceptada',
        texto: '✅ Se aceptó «Prueba de reporte».',
        tipo_envio: 'reporte',
      })
      .execute();
    const hora = new Date(Date.now() - 60_000);
    const hhmm = hora.toLocaleTimeString('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const conf = await e.pedir(valeria, 'PATCH', `${E}/whatsapp/configuracion`, {
      reporte_frecuencia: 'diario',
      reporte_hora: hhmm,
    });
    expect(conf.estado, JSON.stringify(conf.cuerpo)).toBe(200);
    await e.db
      .updateTable('whatsapp_configuracion')
      .set({ ultimo_reporte_en: new Date(Date.now() - 2 * 86_400_000) })
      .where('equipo_id', '=', SEMILLA.equipo)
      .execute();
    const r = await ciclo();
    expect(r.cuerpo.reportes).toBe(1);
    expect(r.cuerpo.enviados).toBeGreaterThanOrEqual(1);
    const h: HistorialWa = (await e.pedir(valeria, 'GET', `${E}/whatsapp/historial?estado=enviado`))
      .cuerpo;
    const reporte = h.items.find((m) => m.tipo_evento === 'reporte');
    expect(reporte?.texto).toContain('📋 Resumen de Equipo Nexo');
    expect(reporte?.texto).toContain('«Prueba de reporte»');
  });

  it('pausa: no se envía (422) hasta reanudar', async () => {
    await e.pedir(valeria, 'PATCH', `${E}/whatsapp/configuracion`, { estado: 'pausado' });
    expect((await e.pedir(valeria, 'POST', `${E}/whatsapp/cola/enviar`, {})).estado).toBe(422);
    await e.pedir(valeria, 'PATCH', `${E}/whatsapp/configuracion`, { estado: 'conectado' });
    const panel: PanelWa = (await e.pedir(valeria, 'GET', `${E}/whatsapp`)).cuerpo;
    expect(panel.configuracion.estado).toBe('conectado');
    expect(panel.reglas).toHaveLength(6);
  });

  it('sin cuenta de Meta solo se conecta el modo simulado (409)', async () => {
    const r = await e.pedir(valeria, 'POST', `${E}/whatsapp/conectar`, {
      proveedor: 'cloud_api_grupos',
      grupo_nombre: 'Grupo real',
      grupo_externo_id: '123',
    });
    expect(r.estado).toBe(409);
  });

  it('PF-05: número, consentimiento y consentimiento por equipo', async () => {
    expect((await e.pedir(carlos, 'PATCH', '/yo/whatsapp', { numero: '2221234567' })).estado).toBe(
      400,
    );
    const r = await e.pedir(carlos, 'PATCH', '/yo/whatsapp', {
      numero: '+5212229998877',
      consentimiento: true,
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    const c = await e.pedir(carlos, 'PUT', `${E}/whatsapp/consentimiento`, { acepta: false });
    expect(
      c.cuerpo.equipos.find((x: { equipo_id: string }) => x.equipo_id === SEMILLA.equipo)
        .consentimiento,
    ).toBe(false);
    expect(
      (await e.pedir(mariana, 'PUT', `${E}/whatsapp/consentimiento`, { acepta: true })).estado,
    ).toBe(403);
    // Deja a Carlos como en la semilla (sin número, con consentimiento en el equipo).
    await e.pedir(carlos, 'PATCH', '/yo/whatsapp', { numero: '' });
    await e.db
      .updateTable('membresias')
      .set({ consentimiento_wa: true })
      .where('equipo_id', '=', SEMILLA.equipo)
      .where('usuario_id', '=', '00000000-0000-4000-8000-000000000002')
      .execute();
  });

  it('webhook: verifica la suscripción, rechaza firmas malas y aplica los estados de entrega', async () => {
    const v = await e.app.inject({
      method: 'GET',
      url: `/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFICAR}&hub.challenge=12345`,
    });
    expect(v.statusCode).toBe(200);
    expect(v.body).toBe('12345');
    expect(
      (
        await e.app.inject({
          method: 'GET',
          url: '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1',
        })
      ).statusCode,
    ).toBe(403);

    await e.db
      .insertInto('whatsapp_mensajes')
      .values({
        equipo_id: SEMILLA.equipo,
        tipo_evento: 'reunion',
        texto: 'Webhook',
        tipo_envio: 'instantaneo',
        estado: 'enviado',
        enviado_en: new Date(),
        proveedor_mensaje_id: wamid,
      })
      .execute();
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba',
          changes: [{ field: 'messages', value: { statuses: [{ id: wamid, status: 'read' }] } }],
        },
      ],
    });
    const firma = `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}`;
    const mala = await e.app.inject({
      method: 'POST',
      url: '/whatsapp/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=00' },
      payload: cuerpo,
    });
    expect(mala.statusCode).toBe(401);
    const buena = await e.app.inject({
      method: 'POST',
      url: '/whatsapp/webhook',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
      payload: cuerpo,
    });
    expect(buena.statusCode).toBe(200);
    const m = await e.db
      .selectFrom('whatsapp_mensajes')
      .select(['leido_en', 'entregado_en'])
      .where('proveedor_mensaje_id', '=', wamid)
      .executeTakeFirstOrThrow();
    expect(m.leido_en).not.toBeNull();
    expect(m.entregado_en).not.toBeNull();
  });
});
