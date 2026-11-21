import type { ColaWa, HistorialWa, MensajeWa } from '@nexo/shared';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, type Cookies, type Entorno } from '../pruebas/ayudas';
import { COOKIE_SESION } from '../sesiones';

/**
 * Integración de WhatsApp de punta a punta **con el proveedor real** (`WHATSAPP_PROVIDER=real`), pero
 * contra un servidor local que imita la API Cloud de Meta (`WHATSAPP_API_URL`). Así se prueba todo
 * lo que hace Nexo (cola, envío, peticiones a Meta, ids que devuelve, errores, reintentos y estados
 * del webhook firmado) sin una cuenta de Meta ni mensajes reales (DEC-WA-1). Usa un equipo y cuentas
 * propias que se borran al final: la semilla no se toca.
 */

interface PeticionMeta {
  url: string;
  autorizacion: string | undefined;
  cuerpo: {
    messaging_product: string;
    recipient_type: 'individual' | 'group';
    to: string;
    type: string;
    text?: { body: string };
    template?: { name: string; language: { code: string }; components?: unknown[] };
  };
}

const TOKEN = 'token-de-prueba-de-meta';
const PHONE_ID = '1098765432';
const SECRETO = 'secreto-del-webhook-de-integracion';
const marca = `wa-int-${Date.now()}`;
const antes = new Date();

describe.skipIf(!DATABASE_URL)('integración de WhatsApp con la API de Meta (imitada)', () => {
  let meta: Server;
  let e: Entorno;
  const peticiones: PeticionMeta[] = [];
  /** Lo que responde la Meta de prueba: un id por mensaje o un error como los de la API Graph. */
  let modo: 'ok' | 'error' | 'ventana' = 'ok';
  let siguiente = 0;
  const cookies: Record<'ana' | 'beto' | 'caro', Cookies> = {} as never;
  const numeros = { ana: '+5212221110001', beto: '+5212221110002', caro: '+5212221110003' };
  let E = '';

  const ciclo = () => e.pedir(cookies.ana, 'POST', '/dev/whatsapp/ciclo');
  const reunion = async (titulo: string) => {
    const r = await e.pedir(cookies.ana, 'POST', `${E}/reuniones`, {
      titulo,
      inicio: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect((await ciclo()).estado).toBe(200);
    const cola: ColaWa = (await e.pedir(cookies.ana, 'GET', `${E}/whatsapp/cola`)).cuerpo;
    const aviso = cola.instantaneos.find((m) => m.texto.includes(`«${titulo}»`));
    expect(aviso, `aviso de «${titulo}» en la cola`).toBeDefined();
    return aviso!;
  };
  const historial = async (): Promise<MensajeWa[]> =>
    ((await e.pedir(cookies.beto, 'GET', `${E}/whatsapp/historial`)).cuerpo as HistorialWa).items;
  const idProveedor = async (id: string) =>
    (
      await e.db
        .selectFrom('whatsapp_mensajes')
        .select('proveedor_mensaje_id')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).proveedor_mensaje_id;
  const webhook = (statuses: object[]) => {
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba', changes: [{ field: 'messages', value: { statuses } }] }],
    });
    return e.app.inject({
      method: 'POST',
      url: '/whatsapp/webhook',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${createHmac('sha256', SECRETO).update(cuerpo).digest('hex')}`,
      },
      payload: cuerpo,
    });
  };

  beforeAll(async () => {
    meta = createServer((req, res) => {
      let datos = '';
      req.on('data', (c: Buffer) => (datos += c.toString()));
      req.on('end', () => {
        peticiones.push({
          url: req.url ?? '',
          autorizacion: req.headers.authorization,
          cuerpo: JSON.parse(datos) as PeticionMeta['cuerpo'],
        });
        res.setHeader('content-type', 'application/json');
        if (modo === 'ventana' && JSON.parse(datos).type === 'text') {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: {
                message: '(#131047) Re-engagement message',
                code: 131047,
              },
            }),
          );
          return;
        }
        if (modo === 'error') {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              error: {
                message: '(#131030) Recipient phone number not in allowed list',
                code: 131030,
              },
            }),
          );
          return;
        }
        res.end(
          JSON.stringify({
            messaging_product: 'whatsapp',
            contacts: [{ input: 'x', wa_id: 'x' }],
            messages: [{ id: `wamid.${marca}-${++siguiente}` }],
          }),
        );
      });
    });
    await new Promise<void>((ok) => meta.listen(0, '127.0.0.1', ok));
    const { port } = meta.address() as AddressInfo;

    e = await crearEntorno({
      WHATSAPP_PROVIDER: 'real',
      WHATSAPP_TOKEN: TOKEN,
      WHATSAPP_PHONE_ID: PHONE_ID,
      WHATSAPP_APP_SECRET: SECRETO,
      WHATSAPP_VERIFY_TOKEN: 'verificacion-de-integracion',
      WHATSAPP_API_URL: `http://127.0.0.1:${port}/v21.0`,
    });
    for (const quien of ['ana', 'beto', 'caro'] as const) {
      const r = await e.app.inject({
        method: 'POST',
        url: '/auth/registro',
        payload: {
          nombre: `${quien[0]!.toUpperCase()}${quien.slice(1)} Integración`,
          correo: `${marca}-${quien}@nexo.test`,
          contrasena: 'Integracion-2026!',
        },
      });
      if (r.statusCode !== 201) throw new Error(`registro ${quien}: ${r.body}`);
      cookies[quien] = { [COOKIE_SESION]: r.cookies.find((c) => c.name === COOKIE_SESION)!.value };
    }
    const equipo = await e.pedir(cookies.ana, 'POST', '/equipos', { nombre: 'Equipo WhatsApp' });
    expect(equipo.estado).toBe(201);
    E = `/equipos/${equipo.cuerpo.id}`;
    for (const quien of ['beto', 'caro'] as const) {
      const inv = await e.pedir(cookies.ana, 'POST', `${E}/invitaciones`, {
        rol_destino: 'integrante',
      });
      expect(
        (await e.pedir(cookies[quien], 'POST', `/invitaciones/${inv.cuerpo.codigo}/aceptar`))
          .estado,
      ).toBe(200);
    }
    // Ana y Beto: número, consentimiento general y del equipo. Caro: número, pero no acepta en el equipo.
    for (const quien of ['ana', 'beto', 'caro'] as const) {
      const r = await e.pedir(cookies[quien], 'PATCH', '/yo/whatsapp', {
        numero: numeros[quien],
        consentimiento: true,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      const c = await e.pedir(cookies[quien], 'PUT', `${E}/whatsapp/consentimiento`, {
        acepta: quien !== 'caro',
      });
      expect(c.estado).toBe(200);
    }
    // Lo que dejaron otras pruebas no cuenta aquí.
    await e.db
      .updateTable('eventos_dominio')
      .set({ procesado_en: new Date() })
      .where('procesado_en', 'is', null)
      .execute();
  }, 60_000);

  afterAll(async () => {
    if (E) await e.db.deleteFrom('equipos').where('id', '=', E.split('/')[2]!).execute();
    await e.db.deleteFrom('usuarios').where('correo', 'like', `${marca}-%`).execute();
    await e.db.deleteFrom('whatsapp_webhook_eventos').where('recibido_en', '>', antes).execute();
    await e.cerrar();
    await new Promise((ok) => meta.close(ok));
  });

  it('mensajes directos: cada persona con consentimiento recibe el aviso por la API de Meta', async () => {
    const con = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/conectar`, {
      proveedor: 'cloud_api_directo',
      grupo_nombre: 'Equipo WhatsApp · avisos',
    });
    expect(con.estado, JSON.stringify(con.cuerpo)).toBe(200);
    expect(con.cuerpo).toMatchObject({ proveedor: 'cloud_api_directo', estado: 'conectado' });

    const aviso = await reunion('Prueba de envío directo');
    expect(aviso.texto).toMatch(/^📅 Reunión «Prueba de envío directo» el .+\. Confirma/);
    peticiones.length = 0;
    const envio = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/enviar`, {
      ids: [aviso.id],
    });
    expect(envio.cuerpo).toEqual({ enviados: 1, fallidos: 0 });

    // Dos peticiones a Meta (Ana y Beto); Caro no aceptó los avisos del equipo. Spike 1 a 1
    // (DEC-039): sin formato elegido va el del equipo, «resumen con enlace» (plantilla + botón).
    expect(peticiones.map((p) => p.cuerpo.to).sort()).toEqual(['5212221110001', '5212221110002']);
    for (const p of peticiones) {
      expect(p.url).toBe(`/v21.0/${PHONE_ID}/messages`);
      expect(p.autorizacion).toBe(`Bearer ${TOKEN}`);
      expect(p.cuerpo).toMatchObject({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: p.cuerpo.to,
        type: 'template',
        template: {
          name: 'nx_resumen_enlace',
          language: { code: 'es_MX' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: 'tu equipo' },
                { type: 'text', text: expect.stringContaining('Prueba de envío directo') },
              ],
            },
            { type: 'button', sub_type: 'url', index: '0' },
          ],
        },
      });
    }

    const enviado = (await historial()).find((m) => m.id === aviso.id);
    expect(enviado).toMatchObject({ estado: 'enviado', intentos: 1, ultimo_error: null });
    expect(await idProveedor(aviso.id)).toMatch(new RegExp(`^wamid\\.${marca}-`));
  });

  it('webhook firmado: Meta confirma entregado y leído; repetir el evento no lo duplica', async () => {
    const aviso = (await historial()).find((m) => m.texto.includes('Prueba de envío directo'))!;
    const wamid = (await idProveedor(aviso.id))!;
    const r1 = await webhook([{ id: wamid, status: 'delivered', timestamp: '1795150000' }]);
    expect(r1.statusCode).toBe(200);
    const r2 = await webhook([{ id: wamid, status: 'read', timestamp: '1795150060' }]);
    expect(r2.statusCode).toBe(200);
    expect(
      (await webhook([{ id: wamid, status: 'read', timestamp: '1795150060' }])).statusCode,
    ).toBe(200);
    const visto = (await historial()).find((m) => m.id === aviso.id)!;
    expect(visto.entregado_en).not.toBeNull();
    expect(visto.leido_en).not.toBeNull();
  });

  it('Meta rechaza el envío: queda fallido con su error, se reintenta y sale', async () => {
    modo = 'error';
    const aviso = await reunion('Prueba de error de Meta');
    const envio = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/enviar`, {
      ids: [aviso.id],
    });
    expect(envio.cuerpo).toEqual({ enviados: 0, fallidos: 1 });
    const fallido = (await historial()).find((m) => m.id === aviso.id)!;
    expect(fallido.estado).toBe('fallido');
    expect(fallido.ultimo_error).toContain('Recipient phone number not in allowed list');

    modo = 'ok';
    const re = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/reintentar`, {
      ids: [aviso.id],
    });
    expect(re.cuerpo).toEqual({ reintentados: 1 });
    const otra = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/enviar`, {
      ids: [aviso.id],
    });
    expect(otra.cuerpo).toEqual({ enviados: 1, fallidos: 0 });
    expect((await historial()).find((m) => m.id === aviso.id)).toMatchObject({
      estado: 'enviado',
      intentos: 2,
    });
  });

  it('bajo demanda (spike 1 a 1): aviso corto sin ventana, uno solo cada 12 h, y al responder llega todo', async () => {
    expect(
      (await e.pedir(cookies.beto, 'PUT', '/yo/whatsapp/formato', { formato: 'bajo_demanda' }))
        .estado,
    ).toBe(200);
    const a1 = await reunion('Bajo demanda uno');
    const a2 = await reunion('Bajo demanda dos');
    peticiones.length = 0;
    const envio = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/enviar`, {
      ids: [a1.id, a2.id],
    });
    expect(envio.cuerpo).toEqual({ enviados: 2, fallidos: 0 });
    const aBeto = peticiones.filter((p) => p.cuerpo.to === '5212221110002');
    // Un solo aviso corto para Beto (P-8); Ana recibe su resumen de cada aviso.
    expect(aBeto).toHaveLength(1);
    expect(aBeto[0]!.cuerpo.template).toMatchObject({
      name: 'nx_aviso_ver',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'una actualización de tu equipo' }] },
      ],
    });
    expect(peticiones.filter((p) => p.cuerpo.to === '5212221110001')).toHaveLength(2);

    // Beto responde (como lo haría el botón): se abre la ventana y llegan los dos avisos en un texto.
    peticiones.length = 0;
    const r = await e.pedir(cookies.ana, 'POST', '/dev/whatsapp/entrante', {
      numero: '5212221110002',
      texto: 'Ver actualización',
    });
    expect(r.cuerpo).toMatchObject({ conocido: true, entregadas: 2 });
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]!.cuerpo.type).toBe('text');
    expect(peticiones[0]!.cuerpo.text!.body).toContain('Bajo demanda uno');
    expect(peticiones[0]!.cuerpo.text!.body).toContain('Bajo demanda dos');
    const h = await historial();
    for (const a of [a1, a2]) {
      const m = h.find((x) => x.id === a.id)!;
      expect(m.entregas.find((x) => x.numero_fin === '•••• 0002')?.estado).toBe('enviado');
    }
    await e.pedir(cookies.beto, 'PUT', '/yo/whatsapp/formato', { formato: null });
  });

  it('grupo del equipo: un solo mensaje al id del grupo (API de grupos)', async () => {
    const con = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/conectar`, {
      proveedor: 'cloud_api_grupos',
      grupo_nombre: 'Equipo WhatsApp · grupo',
      grupo_externo_id: '120363000000000001@g.us',
    });
    expect(con.estado, JSON.stringify(con.cuerpo)).toBe(200);
    const aviso = await reunion('Prueba de envío al grupo');
    peticiones.length = 0;
    const envio = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/enviar`, {
      ids: [aviso.id],
    });
    expect(envio.cuerpo).toEqual({ enviados: 1, fallidos: 0 });
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]!.cuerpo).toMatchObject({
      recipient_type: 'group',
      to: '120363000000000001@g.us',
      text: { body: aviso.texto },
    });
  });

  it('webhook: un «failed» de Meta deja el aviso como fallido', async () => {
    const aviso = (await historial()).find((m) => m.texto.includes('Prueba de envío al grupo'))!;
    const wamid = (await idProveedor(aviso.id))!;
    const r = await webhook([
      { id: wamid, status: 'failed', errors: [{ code: 131026, title: 'Message undeliverable' }] },
    ]);
    expect(r.statusCode).toBe(200);
    const visto = (await historial()).find((m) => m.id === aviso.id)!;
    expect(visto.estado).toBe('fallido');
    expect(visto.ultimo_error).toContain('Message undeliverable');
  });

  it('el modo simulado del equipo nunca llama a Meta, aunque el servidor tenga la cuenta', async () => {
    await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/conectar`, {
      proveedor: 'simulado',
      grupo_nombre: 'Equipo WhatsApp · simulado',
    });
    const aviso = await reunion('Prueba simulada');
    peticiones.length = 0;
    const envio = await e.pedir(cookies.ana, 'POST', `${E}/whatsapp/cola/enviar`, {
      ids: [aviso.id],
    });
    expect(envio.cuerpo).toEqual({ enviados: 1, fallidos: 0 });
    expect(peticiones).toHaveLength(0);
    expect(await idProveedor(aviso.id)).toMatch(/^sim-/);
  });

  it('con plantilla propia (DEC-WA-2) el aviso directo va siempre como plantilla, en una línea', async () => {
    const { proveedorCloudApi } = await import('./proveedor');
    const { port } = meta.address() as AddressInfo;
    const p = proveedorCloudApi({
      token: TOKEN,
      phoneId: PHONE_ID,
      graph: `http://127.0.0.1:${port}/v21.0`,
      plantilla: 'nexo_aviso',
      idioma: 'es_MX',
    });
    peticiones.length = 0;
    await p.enviar({
      id: 'x',
      equipo_id: 'x',
      proveedor: 'cloud_api_directo',
      grupo_externo_id: null,
      destinatarios: ['+5215500000000'],
      texto: '📋 Resumen de hoy\n• T-01 completada\n• T-02    en curso',
    });
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]!.cuerpo).toMatchObject({
      type: 'template',
      to: '5215500000000',
      template: {
        name: 'nexo_aviso',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: '📋 Resumen de hoy · • T-01 completada · • T-02 en curso' },
            ],
          },
        ],
      },
    });
  });
});
