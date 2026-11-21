import type { HistorialWa, PanelWa, VerificacionWa, WhatsAppUsuario } from '@nexo/shared';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';
import { canalCloud, canalSimulado, entregarEntregas, generarPdf } from './entregas';

/**
 * Spike WhatsApp 1 a 1 (docs/11_Plan_Spike_WhatsApp_1a1.md, pista A en simulado, §10.1) con la
 * semilla. Lo que vive solo en la base (A1, A3–A8) está en P220–P231; aquí lo que pasa por la API.
 */
describe('spike 1 a 1: el simulado imita a Meta', () => {
  it('A2 · texto libre con la ventana cerrada se rechaza, igual que la API real', async () => {
    const c = canalSimulado();
    await expect(c.texto('+5215500000000', 'hola', false)).rejects.toThrow(/ventana de 24 h/);
    await expect(c.texto('+5215500000000', 'hola', true)).resolves.toMatch(/^sim-/);
  });

  it('el PDF se genera sin navegador (P-9), aun con emojis en el contenido', async () => {
    const pdf = await generarPdf(
      'Tu reporte de Nexo',
      '📋 Resumen\n• T-01 completada\n'.repeat(80),
    );
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(800);
  });
});

describe.skipIf(!DATABASE_URL)('spike 1 a 1 por la API (simulado)', () => {
  let e: Entorno;
  let valeria: Cookies;
  let carlos: Cookies;
  let paola: Cookies;
  const antes = new Date();
  const E = `/equipos/${SEMILLA.equipo}`;

  beforeAll(async () => {
    e = await crearEntorno();
    [valeria, carlos, paola] = await Promise.all([
      e.entrar(SEMILLA.valeria),
      e.entrar(SEMILLA.carlos),
      e.entrar(SEMILLA.paola),
    ]);
  });
  afterAll(async () => {
    await e.db.deleteFrom('whatsapp_mensajes').where('creado_en', '>', antes).execute();
    await e.db
      .deleteFrom('whatsapp_usuario')
      .where('usuario_id', '=', '00000000-0000-4000-8000-000000000011')
      .execute();
    await e.db
      .updateTable('preferencias_usuario')
      .set({ wa_formato: null })
      .where('usuario_id', 'in', [
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000011',
      ])
      .execute();
    await e.db
      .updateTable('whatsapp_configuracion')
      .set({ modo_entrega: 'grupo', formato_defecto: 'resumen_enlace' })
      .where('equipo_id', '=', SEMILLA.equipo)
      .execute();
    // Carlos vuelve a como está en la semilla.
    await e.db
      .updateTable('whatsapp_usuario')
      .set({
        numero_e164: '+525523456789',
        consentimiento_revocado_en: null,
        consentimiento_en: new Date(),
        ultimo_entrante_en: null,
        ultimo_teaser_en: null,
      })
      .where('usuario_id', '=', '00000000-0000-4000-8000-000000000002')
      .execute();
    await e.db
      .updateTable('membresias')
      .set({ consentimiento_wa: true })
      .where('equipo_id', '=', SEMILLA.equipo)
      .where('usuario_id', '=', '00000000-0000-4000-8000-000000000002')
      .execute();
    await e.cerrar();
  });

  it('verificación: el código llega en un enlace wa.me y «VERIFICAR <código>» verifica el número', async () => {
    const v = await e.pedir(paola, 'POST', '/yo/whatsapp/verificacion', {
      numero: '+5215511110011',
    });
    expect(v.estado, JSON.stringify(v.cuerpo)).toBe(200);
    const ver = v.cuerpo as VerificacionWa;
    expect(ver.enlace).toBe(
      `https://wa.me/15551833695?text=${encodeURIComponent(`VERIFICAR ${ver.codigo}`)}`,
    );
    const r = await e.pedir(valeria, 'POST', '/dev/whatsapp/entrante', {
      numero: '5215511110011',
      texto: `VERIFICAR ${ver.codigo}`,
    });
    expect(r.cuerpo).toMatchObject({ conocido: true, verificado: true });
    const yo: WhatsAppUsuario = (await e.pedir(paola, 'GET', '/yo/whatsapp')).cuerpo;
    expect(yo).toMatchObject({ verificado: true, ventana_abierta: true, consentimiento: true });
  });

  it('A9 · reporte personal de una persona sin equipo: sale directo, con su formato', async () => {
    await e.pedir(paola, 'PUT', '/yo/whatsapp/formato', { formato: 'bajo_demanda' });
    // Con la ventana abierta (acaba de escribir), bajo demanda entrega el reporte completo.
    const r = await e.pedir(paola, 'POST', '/yo/whatsapp/reporte');
    expect(r.cuerpo).toEqual({ enviados: 1, fallidos: 0 });
    const m = await e.db
      .selectFrom('whatsapp_mensajes')
      .select(['equipo_id', 'estado', 'texto'])
      .where('usuario_id', '=', '00000000-0000-4000-8000-000000000011')
      .orderBy('creado_en', 'desc')
      .executeTakeFirstOrThrow();
    expect(m).toMatchObject({ equipo_id: null, estado: 'enviado' });
    expect(m.texto).toMatch(/^📋 Tu reporte de Nexo/);
  });

  it('A6 · lo pendiente de ventana caduca al adelantar el reloj (7 días) y se borra el contenido', async () => {
    // Carlos: número y consentimiento de la semilla; bajo demanda y sin haber escrito.
    await e.pedir(carlos, 'PATCH', '/yo/whatsapp', {
      numero: '+5215522220002',
      consentimiento: true,
    });
    await e.pedir(carlos, 'PUT', `${E}/whatsapp/consentimiento`, { acepta: true });
    await e.pedir(carlos, 'PUT', '/yo/whatsapp/formato', { formato: 'bajo_demanda' });
    await e.pedir(valeria, 'PATCH', `${E}/whatsapp/configuracion`, { modo_entrega: 'individual' });
    await e.db
      .insertInto('whatsapp_mensajes')
      .values({
        equipo_id: SEMILLA.equipo,
        tipo_evento: 'reunion',
        texto: 'Aviso para caducar',
        tipo_envio: 'instantaneo',
      })
      .execute();
    const cola = (await e.pedir(valeria, 'GET', `${E}/whatsapp/cola`)).cuerpo;
    const id = cola.instantaneos.find(
      (x: { texto: string }) => x.texto === 'Aviso para caducar',
    ).id;
    expect(
      (await e.pedir(valeria, 'POST', `${E}/whatsapp/cola/enviar`, { ids: [id] })).cuerpo,
    ).toEqual({
      enviados: 1,
      fallidos: 0,
    });
    const entrega = () =>
      e.db
        .selectFrom('whatsapp_entregas')
        .select(['estado', 'contenido'])
        .where('mensaje_id', '=', id)
        .where('usuario_id', '=', '00000000-0000-4000-8000-000000000002')
        .executeTakeFirstOrThrow();
    expect(await entrega()).toMatchObject({
      estado: 'pendiente_ventana',
      contenido: 'Aviso para caducar',
    });
    const ahora = new Date(Date.now() + 8 * 86_400_000).toISOString();
    const c = await e.pedir(
      valeria,
      'POST',
      `/dev/whatsapp/ciclo?ahora=${encodeURIComponent(ahora)}`,
    );
    expect(c.cuerpo.caducadas).toBeGreaterThanOrEqual(1);
    expect(await entrega()).toEqual({ estado: 'caducado', contenido: null });
  });

  it('A7 · «BAJA» retira el consentimiento; R4 · el panel solo muestra los últimos 4 dígitos', async () => {
    const r = await e.pedir(valeria, 'POST', '/dev/whatsapp/entrante', {
      numero: '+5215522220002',
      texto: 'baja',
    });
    expect(r.cuerpo).toMatchObject({ conocido: true, baja: true });
    expect(
      ((await e.pedir(carlos, 'GET', '/yo/whatsapp')).cuerpo as WhatsAppUsuario).consentimiento,
    ).toBe(false);
    const panel: PanelWa = (await e.pedir(valeria, 'GET', `${E}/whatsapp`)).cuerpo;
    const c = panel.personas.find((p) => p.usuario_id === '00000000-0000-4000-8000-000000000002')!;
    expect(c.numero_fin).toBe('•••• 0002');
    expect(JSON.stringify(panel)).not.toContain('5215522220002');
    expect(panel.configuracion.modo_entrega).toBe('individual');
  });

  it('A12 · el historial del integrante no trae números completos', async () => {
    const h: HistorialWa = (await e.pedir(carlos, 'GET', `${E}/whatsapp/historial`)).cuerpo;
    expect(JSON.stringify(h)).not.toMatch(/\+52\d{10}/);
  });
});

describe('spike 1 a 1: formato PDF contra la API de Meta (imitada)', () => {
  let meta: Server;
  const llegadas: { url: string; tipo: string; cuerpo: string }[] = [];
  beforeAll(async () => {
    meta = createServer((req, res) => {
      let d = '';
      req.on('data', (c: Buffer) => (d += c.toString('latin1')));
      req.on('end', () => {
        llegadas.push({ url: req.url ?? '', tipo: req.headers['content-type'] ?? '', cuerpo: d });
        res.setHeader('content-type', 'application/json');
        res.end(
          req.url?.endsWith('/media') ? '{"id":"medio-123"}' : '{"messages":[{"id":"wamid.PDF"}]}',
        );
      });
    });
    await new Promise<void>((ok) => meta.listen(0, '127.0.0.1', ok));
  });
  afterAll(() => new Promise<void>((ok) => meta.close(() => ok())));

  it('B4 en local · sube el PDF con la API de medios y manda nx_reporte_pdf con el documento', async () => {
    const { port } = meta.address() as AddressInfo;
    const canal = canalCloud({
      token: 't',
      phoneId: '99',
      graph: `http://127.0.0.1:${port}/v21.0`,
    });
    const marcadas: unknown[] = [];
    const db = {} as never;
    // Sin BD: se intercepta el registro del resultado.
    const repo = await import('../repositorios/whatsapp');
    const original = repo.marcarEntrega;
    Object.defineProperty(repo, 'marcarEntrega', {
      value: async (_d: unknown, _id: string, r: unknown) => marcadas.push(r),
      configurable: true,
    });
    try {
      await entregarEntregas(
        db,
        { APP_URL: 'https://app.nexo.lol' } as never,
        {
          id: 'a',
          equipo_id: null,
          usuario_id: 'u',
          texto: 'Reporte',
          proveedor: 'cloud_api_directo',
          grupo_externo_id: null,
          destinatarios: [],
          entregas: [
            {
              id: 'x',
              destino: 'persona',
              formato: 'pdf',
              contenido: '📋 Tu reporte de Nexo\n• En curso: 1',
              numero: '+5215500000000',
              nombre: 'Paola',
              ventana_abierta: false,
              aviso_corto_reciente: false,
            },
          ],
        },
        canal,
      );
    } finally {
      Object.defineProperty(repo, 'marcarEntrega', { value: original, configurable: true });
    }
    expect(llegadas[0]!.url).toBe('/v21.0/99/media');
    expect(llegadas[0]!.tipo).toMatch(/^multipart\/form-data/);
    expect(llegadas[0]!.cuerpo).toContain('%PDF-');
    const mensaje = JSON.parse(llegadas[1]!.cuerpo);
    expect(mensaje.template).toMatchObject({
      name: 'nx_reporte_pdf',
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: 'medio-123' } }] },
        { type: 'body', parameters: [{ type: 'text', text: 'Paola' }, { type: 'text' }] },
      ],
    });
    expect(marcadas[0]).toMatchObject({
      ok: true,
      proveedor_id: 'wamid.PDF',
      plantilla: 'nx_reporte_pdf',
    });
  });

  it('con la ventana abierta no usa plantillas: el resumen va como texto con enlace y el PDF como documento', async () => {
    const { port } = meta.address() as AddressInfo;
    const canal = canalCloud({
      token: 't',
      phoneId: '99',
      graph: `http://127.0.0.1:${port}/v21.0`,
    });
    llegadas.length = 0;
    const marcadas: unknown[] = [];
    const repo = await import('../repositorios/whatsapp');
    const original = repo.marcarEntrega;
    Object.defineProperty(repo, 'marcarEntrega', {
      value: async (_d: unknown, _id: string, r: unknown) => marcadas.push(r),
      configurable: true,
    });
    const entrega = (id: string, formato: 'resumen_enlace' | 'pdf') => ({
      id,
      destino: 'persona' as const,
      formato,
      contenido: '📋 Tu reporte de Nexo\n• En curso: 1',
      numero: '+5215500000000',
      nombre: 'Paola',
      ventana_abierta: true,
      aviso_corto_reciente: false,
    });
    try {
      await entregarEntregas(
        {} as never,
        { APP_URL: 'https://app.nexo.lol' } as never,
        {
          id: 'a',
          equipo_id: null,
          usuario_id: 'u',
          texto: 'Reporte',
          proveedor: 'cloud_api_directo',
          grupo_externo_id: null,
          destinatarios: [],
          entregas: [entrega('r', 'resumen_enlace'), entrega('p', 'pdf')],
        },
        canal,
      );
    } finally {
      Object.defineProperty(repo, 'marcarEntrega', { value: original, configurable: true });
    }
    const [texto, medio, documento] = llegadas;
    const t = JSON.parse(texto!.cuerpo);
    expect(t.type).toBe('text');
    expect(t.text.body).toContain('Tu reporte de Nexo');
    expect(t.text.body).toContain('https://app.nexo.lol/app/personal/reportes');
    expect(medio!.url).toBe('/v21.0/99/media');
    const d = JSON.parse(documento!.cuerpo);
    expect(d).toMatchObject({ type: 'document', document: { id: 'medio-123' } });
    expect(llegadas.some((l) => l.cuerpo.includes('"template"'))).toBe(false);
    expect(marcadas).toHaveLength(2);
    expect(marcadas.every((m) => (m as { plantilla?: string }).plantilla === undefined)).toBe(true);
  });
});
