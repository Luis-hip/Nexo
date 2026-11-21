import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cifrar } from '../cifrado';
import { correoEnMemoria } from '../correo';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';
import { armarCorreo, canalCorreo, cicloContacto } from '../trabajos/contacto';
import { celdaCsv } from './contacto';

/** Módulo de contacto (docs/12_Plan_Contacto.md; migración 0039). */
describe('contacto: piezas sin BD', () => {
  it('CSV: escapa comillas y neutraliza fórmulas', () => {
    expect(celdaCsv('=1+1')).toBe(`"'=1+1"`);
    expect(celdaCsv('@SUMA(A1)')).toBe(`"'@SUMA(A1)"`);
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celdaCsv(null)).toBe('""');
  });

  it('correos: el contenido va escapado y ningún salto de línea llega al asunto', () => {
    const config = {
      APP_URL: 'https://app.nexo.test',
      ENCRYPTION_KEY: 'ab12'.repeat(16),
      NODE_ENV: 'test' as const,
      CONTACTO_EQUIPO_DESTINO: 'equipo@nexo.test',
    };
    const base = {
      id: 'o',
      canal: 'correo' as const,
      destinatario: 'ana@x.test',
      datos: {},
      intentos: 1,
      mensaje_id: 'm-1',
      folio: 'NX-2026-000001',
      tipo: 'error' as const,
      prioridad: 'alta' as const,
      nombre: 'Ana <script>',
      asunto: 'Hola\r\nBcc: todos@x.test',
      extracto: '<b>no carga</b>',
      registrado: false,
      respuesta: null,
    };
    const aviso = armarCorreo({ ...base, plantilla: 'aviso_equipo' }, config);
    expect(aviso.asunto).not.toMatch(/[\r\n]/);
    expect(aviso.asunto).toContain('[ALTA]');
    expect(aviso.html).toContain('&lt;b&gt;no carga&lt;/b&gt;');
    expect(aviso.html).not.toContain('<script>');
    expect(aviso.texto).toContain('https://app.nexo.test/admin/contacto/m-1');
    const conf = armarCorreo(
      {
        ...base,
        plantilla: 'confirmacion_remitente',
        datos: { token_cifrado: cifrar(config, 'TOK') },
      },
      config,
    );
    expect(conf.texto).toContain('folio=NX-2026-000001&token=TOK');
    expect(conf.texto).not.toContain('no carga');
    const resp = armarCorreo(
      { ...base, plantilla: 'respuesta_remitente', respuesta: 'Ya quedó <i>listo</i>' },
      config,
    );
    expect(resp.responderA).toBe('equipo@nexo.test');
    expect(resp.html).toContain('Ya quedó &lt;i&gt;listo&lt;/i&gt;');
  });
});

describe.skipIf(!DATABASE_URL)('contacto por la API', () => {
  let e: Entorno;
  let gestor: Cookies;
  let sinPermiso: Cookies;
  const marca = Date.now();
  const correo = `contacto-${marca}@nexo.test`;
  let n = 0;
  /** Cada petición sale de una IP distinta (los límites por IP viven en la BD). */
  const ip = () => `10.${(marca >> 8) & 255}.${marca & 255}.${++n}`;
  const valido = {
    tipo: 'error',
    nombre: 'Ana Pérez',
    correo,
    asunto: 'No carga mi tablero',
    mensaje: 'Al abrir el tablero aparece en blanco desde ayer.',
    contexto: { url: '/app/e/1', navegador: 'Firefox 140', clave_rara: 'se descarta' },
    acepta_privacidad: true,
  };
  const enviar = (payload: object, cookies?: Cookies | null, remoteAddress = ip()) =>
    e.app.inject({
      method: 'POST',
      url: '/contacto',
      payload,
      cookies: cookies ?? undefined,
      remoteAddress,
    });

  beforeAll(async () => {
    e = await crearEntorno({ CONTACTO_EQUIPO_DESTINO: 'soporte@nexo.test' });
    gestor = await e.entrar(SEMILLA.carlos);
    sinPermiso = await e.entrar(SEMILLA.daniela);
    const carlos = await e.db
      .selectFrom('usuarios')
      .select('id')
      .where('correo', '=', SEMILLA.carlos)
      .executeTakeFirstOrThrow();
    await e.db
      .insertInto('permisos_sistema')
      .values({ usuario_id: carlos.id, permiso: 'contacto.gestionar' })
      .onConflict((oc) => oc.doNothing())
      .execute();
  });
  afterAll(async () => {
    await e.db
      .deleteFrom('contacto_mensajes')
      .where('correo', 'like', 'contacto-%@nexo.test')
      .execute();
    await e.db.deleteFrom('permisos_sistema').execute();
    await e.cerrar();
  });

  it('visitante: guarda con folio, descarta claves de contexto desconocidas y no devuelve el token', async () => {
    const r = await enviar(valido);
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().folio).toMatch(/^NX-\d{4}-\d{6}$/);
    expect(r.body).not.toMatch(/token/);
    const fila = await e.db
      .selectFrom('contacto_mensajes')
      .select(['contexto', 'ip_hash', 'token_seguimiento_hash'])
      .where('folio', '=', r.json().folio)
      .executeTakeFirstOrThrow();
    expect(fila.contexto).toEqual({ url: '/app/e/1', navegador: 'Firefox 140' });
    expect(fila.ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('la trampa para bots responde 201 y no guarda nada', async () => {
    const antes = await e.db
      .selectFrom('contacto_mensajes')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow();
    const r = await enviar({ ...valido, web: 'http://spam.test' });
    expect(r.statusCode).toBe(201);
    const despues = await e.db
      .selectFrom('contacto_mensajes')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow();
    expect(despues.n).toEqual(antes.n);
  });

  it('valida cada campo con mensajes en español y exige aceptar la privacidad', async () => {
    const r = await enviar({ ...valido, mensaje: 'Hola', acepta_privacidad: false });
    expect(r.statusCode).toBe(400);
    const sin = await enviar({ ...valido, correo: 'no-es-correo' });
    expect(sin.json().mensaje).toMatch(/correo válido/);
  });

  it('límite: la 4.ª desde la misma IP en una hora es 429 con Retry-After', async () => {
    const misma = ip();
    const estados: number[] = [];
    for (let i = 0; i < 4; i++) {
      estados.push(
        (await enviar({ ...valido, correo: `contacto-${marca}-l${i}@nexo.test` }, null, misma))
          .statusCode,
      );
    }
    expect(estados).toEqual([201, 201, 201, 429]);
    const r = await enviar({ ...valido, correo: `contacto-${marca}-l9@nexo.test` }, null, misma);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.json().codigo).toBe('limite_contacto');
  });

  it('con sesión: nombre y correo salen de la cuenta aunque el cuerpo diga otra cosa', async () => {
    const r = await enviar(
      { ...valido, tipo: 'duda', nombre: 'Otro', correo: 'otro@x.test' },
      sinPermiso,
    );
    expect(r.statusCode).toBe(201);
    const fila = await e.db
      .selectFrom('contacto_mensajes')
      .select(['correo', 'usuario_id'])
      .where('folio', '=', r.json().folio)
      .executeTakeFirstOrThrow();
    expect(fila.correo).toBe(SEMILLA.daniela);
    expect(fila.usuario_id).not.toBeNull();
    await e.db.deleteFrom('contacto_mensajes').where('folio', '=', r.json().folio).execute();
  });

  it('panel: sin sesión 401, sin permiso 403; con permiso filtra, responde y exporta CSV', async () => {
    expect((await e.pedir(null, 'GET', '/admin/contacto')).estado).toBe(401);
    expect((await e.pedir(sinPermiso, 'GET', '/admin/contacto')).estado).toBe(403);
    expect((await e.pedir(gestor, 'GET', '/admin/contacto/permisos')).cuerpo).toEqual({
      ver: true,
      gestionar: true,
    });
    const r = await enviar({
      ...valido,
      asunto: '=HIPERVINCULO("x")',
      correo: `contacto-${marca}-p@nexo.test`,
    });
    const folio = r.json().folio as string;
    const lista = await e.pedir(gestor, 'GET', `/admin/contacto?q=${folio}&estado=nuevo`);
    expect(lista.cuerpo.total).toBe(1);
    const id = lista.cuerpo.datos[0].id as string;
    expect(lista.cuerpo.datos[0]).not.toHaveProperty('mensaje');
    const nota = await e.pedir(gestor, 'POST', `/admin/contacto/${id}/notas`, {
      contenido: 'Revisar caché',
    });
    expect(nota.estado).toBe(201);
    const resp = await e.pedir(gestor, 'POST', `/admin/contacto/${id}/respuestas`, {
      contenido: 'Borra la caché del navegador.',
      estado_resultante: 'esperando_usuario',
    });
    expect(resp.estado).toBe(201);
    const det = await e.pedir(gestor, 'GET', `/admin/contacto/${id}`);
    expect(det.cuerpo.estado).toBe('esperando_usuario');
    expect(det.cuerpo.eventos.map((x: { tipo: string }) => x.tipo)).toEqual([
      'creado',
      'nota_interna',
      'respuesta',
      'cambio_estado',
      'cambio_estado',
    ]);
    expect(JSON.stringify(det.cuerpo)).not.toMatch(/token_seguimiento_hash|ip_hash/);
    const mal = await e.pedir(gestor, 'PATCH', `/admin/contacto/${id}/estado`, { estado: 'nuevo' });
    expect(mal.estado).toBe(422);
    const csv = await e.app.inject({
      method: 'GET',
      url: `/admin/contacto/exportar.csv?q=${folio}`,
      cookies: gestor,
    });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.body.charCodeAt(0)).toBe(0xfeff);
    expect(csv.body).toContain(`"'=HIPERVINCULO(""x"")"`);
    expect((await e.pedir(gestor, 'GET', '/admin/contacto/metricas')).cuerpo.total).toBeGreaterThan(
      0,
    );
    expect(
      (await e.pedir(gestor, 'GET', '/admin/contacto/pendientes/conteo')).cuerpo,
    ).toHaveProperty('nuevos');
  });

  it('seguimiento: con el token del correo ve solo las respuestas; con otro token, 404', async () => {
    const r = await enviar({ ...valido, correo: `contacto-${marca}-s@nexo.test` });
    const folio = r.json().folio as string;
    // El ciclo manda la confirmación (con el enlace de seguimiento) por el correo de pruebas.
    const bandeja = correoEnMemoria();
    await e.db
      .updateTable('contacto_outbox')
      .set({ proximo_intento: new Date(Date.now() + 86_400_000) })
      .where('estado', '=', 'pendiente')
      .execute();
    await e.db
      .updateTable('contacto_outbox')
      .set({ proximo_intento: new Date(0) })
      .where('destinatario', '=', `contacto-${marca}-s@nexo.test`)
      .execute();
    const c = await cicloContacto(e.db, [canalCorreo(bandeja, e.config)]);
    expect(c.enviados).toBeGreaterThanOrEqual(1);
    const enlace = bandeja.enviados
      .find((m) => m.para === `contacto-${marca}-s@nexo.test`)!
      .texto.match(/token=([A-Za-z0-9_-]+)/)![1]!;
    const lista = await e.pedir(gestor, 'GET', `/admin/contacto?q=${folio}`);
    const id = lista.cuerpo.datos[0].id as string;
    await e.pedir(gestor, 'POST', `/admin/contacto/${id}/notas`, { contenido: 'Nota secreta' });
    await e.pedir(gestor, 'POST', `/admin/contacto/${id}/respuestas`, {
      contenido: 'Respuesta pública',
    });
    const s = await e.pedir(null, 'GET', `/contacto/seguimiento?folio=${folio}&token=${enlace}`);
    expect(s.estado).toBe(200);
    expect(s.cuerpo.respuestas).toEqual([
      expect.objectContaining({ contenido: 'Respuesta pública' }),
    ]);
    expect(JSON.stringify(s.cuerpo)).not.toContain('Nota secreta');
    const malo = await e.pedir(
      null,
      'GET',
      `/contacto/seguimiento?folio=${folio}&token=${'x'.repeat(43)}`,
    );
    const nadie = await e.pedir(
      null,
      'GET',
      `/contacto/seguimiento?folio=NX-1999-000001&token=${'x'.repeat(43)}`,
    );
    expect(malo.estado).toBe(404);
    expect(malo.cuerpo).toEqual(nadie.cuerpo);
  });

  it('anonimizar borra los datos personales (doble confirmación en la web)', async () => {
    const r = await enviar({ ...valido, correo: `contacto-${marca}-a@nexo.test` });
    const lista = await e.pedir(gestor, 'GET', `/admin/contacto?q=${r.json().folio}`);
    const id = lista.cuerpo.datos[0].id as string;
    expect((await e.pedir(sinPermiso, 'DELETE', `/admin/contacto/${id}/datos`)).estado).toBe(403);
    expect((await e.pedir(gestor, 'DELETE', `/admin/contacto/${id}/datos`)).cuerpo).toEqual({
      anonimizado: true,
    });
    const det = await e.pedir(gestor, 'GET', `/admin/contacto/${id}`);
    expect(det.cuerpo).toMatchObject({
      anonimizado: true,
      nombre: 'Anónimo',
      mensaje: '[eliminado]',
    });
  });
});
