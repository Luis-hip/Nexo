import type { Archivo, CalendarioEquipo, Notificaciones, Reunion } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

const ID = { carlos: '00000000-0000-4000-8000-000000000002' };

/**
 * Vistas secundarias (Fase 3.4: EQ-14 a EQ-20 y NT-01) en un equipo propio: Valeria (líder),
 * Carlos y Daniela (integrantes), Mariana (invitada) y Paola (no pertenece). Por ruta, un caso
 * permitido y uno prohibido; las reglas finas las prueban P83–P100.
 */
describe.skipIf(!DATABASE_URL)('vistas secundarias del equipo', () => {
  let e: Entorno;
  let valeria: Cookies;
  let carlos: Cookies;
  let daniela: Cookies;
  let mariana: Cookies;
  let paola: Cookies;
  let base: string;
  let equipoId: string;

  const post = (q: Cookies | null, ruta: string, cuerpo?: object) =>
    e.pedir(q, 'POST', `${base}${ruta}`, cuerpo);
  const get = (q: Cookies | null, ruta: string) => e.pedir(q, 'GET', `${base}${ruta}`);

  async function unir(quien: Cookies, datos: object) {
    const inv = await e.pedir(valeria, 'POST', `${base}/invitaciones`, datos);
    await e.pedir(quien, 'POST', `/invitaciones/${inv.cuerpo.codigo}/aceptar`);
  }

  beforeAll(async () => {
    e = await crearEntorno();
    valeria = await e.entrar(SEMILLA.valeria);
    carlos = await e.entrar(SEMILLA.carlos);
    daniela = await e.entrar(SEMILLA.daniela);
    mariana = await e.entrar(SEMILLA.mariana);
    paola = await e.entrar(SEMILLA.paola);
    equipoId = (await e.pedir(valeria, 'POST', '/equipos', { nombre: 'Pruebas de vistas' })).cuerpo
      .id;
    base = `/equipos/${equipoId}`;
    await unir(carlos, { rol_destino: 'integrante' });
    await unir(daniela, { rol_destino: 'integrante' });
    await unir(mariana, { rol_destino: 'invitado', duracion_invitado_dias: 7 });
  });

  afterAll(async () => {
    await e.db.deleteFrom('equipos').where('id', '=', equipoId).execute();
    await e.cerrar();
  });

  describe('calendario y reuniones (EQ-14, EQ-15)', () => {
    let reunion: Reunion;
    const manana = new Date(Date.now() + 86_400_000);
    const rango = () => {
      const desde = new Date(Date.now() - 86_400_000).toISOString();
      const hasta = new Date(Date.now() + 15 * 86_400_000).toISOString();
      return `/calendario?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
    };

    it('un integrante agenda una reunión semanal; la invitada no puede (403)', async () => {
      const r = await post(carlos, '/reuniones', {
        titulo: 'Revisión semanal',
        inicio: manana.toISOString(),
        repeticion: 'semanal',
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      reunion = r.cuerpo;
      expect(reunion).toMatchObject({ mi_respuesta: 'si', asistencia: { si: 1, pendiente: 2 } });
      expect(
        (await post(mariana, '/reuniones', { titulo: 'X', inicio: manana.toISOString() })).estado,
      ).toBe(403);
      expect(
        (await post(carlos, '/reuniones', { titulo: '', inicio: manana.toISOString() })).estado,
      ).toBe(400);
    });

    it('el calendario muestra cada ocurrencia; la invitada no lo ve', async () => {
      const r = await get(daniela, rango());
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      const cal: CalendarioEquipo = r.cuerpo;
      expect(cal.reuniones.filter((x) => x.id === reunion.id)).toHaveLength(3);
      expect((await get(mariana, rango())).estado).toBe(403);
    });

    it('responde la asistencia; solo quien la creó o la líder la cambian o cancelan', async () => {
      const r = await post(daniela, `/reuniones/${reunion.id}/asistencia`, { respuesta: 'quiza' });
      expect(r.cuerpo).toMatchObject({ mi_respuesta: 'quiza' });
      const ajena = await e.pedir(daniela, 'PATCH', `${base}/reuniones/${reunion.id}`, {
        lugar: 'X',
      });
      expect(ajena.estado).toBe(403);
      const lider = await e.pedir(valeria, 'PATCH', `${base}/reuniones/${reunion.id}`, {
        lugar: 'Sala 2',
      });
      expect(lider.cuerpo.lugar).toBe('Sala 2');
      expect((await post(carlos, `/reuniones/${reunion.id}/cancelar`)).estado).toBe(200);
      const cal: CalendarioEquipo = (await get(daniela, rango())).cuerpo;
      expect(cal.reuniones.some((x) => x.id === reunion.id)).toBe(false);
    });
  });

  describe('notificaciones (NT-01)', () => {
    it('cada quien ve las suyas y las marca como leídas', async () => {
      const r = await e.pedir(daniela, 'GET', '/notificaciones');
      expect(r.estado).toBe(200);
      const n: Notificaciones = r.cuerpo;
      expect(n.no_leidas).toBeGreaterThan(0);
      expect(n.items[0]).toMatchObject({ equipo: 'Pruebas de vistas' });
      const una = await e.pedir(daniela, 'POST', `/notificaciones/${n.items[0]?.id}/leida`);
      expect(una.cuerpo.no_leidas).toBe(n.no_leidas - 1);
      expect((await e.pedir(paola, 'POST', `/notificaciones/${n.items[0]?.id}/leida`)).estado).toBe(
        404,
      );
      expect((await e.pedir(daniela, 'POST', '/notificaciones/leidas')).cuerpo).toEqual({
        no_leidas: 0,
      });
      expect((await e.pedir(null, 'GET', '/notificaciones')).estado).toBe(401);
    });
  });

  describe('actividad (EQ-18)', () => {
    it('el equipo la ve por tipo; la invitada no', async () => {
      const r = await get(carlos, '/actividad?tipo=reunion&limite=10');
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo.items.length).toBeGreaterThan(0);
      expect(r.cuerpo.items.every((x: { tipo: string }) => x.tipo === 'reunion')).toBe(true);
      expect((await get(mariana, '/actividad')).estado).toBe(403);
      expect((await get(carlos, '/actividad?tipo=otro')).estado).toBe(400);
    });
  });

  describe('reportes (EQ-16, EQ-17)', () => {
    it('el equipo ve el reporte; la invitada no', async () => {
      await post(valeria, '/tareas', { titulo: 'Para el reporte', responsable_id: ID.carlos });
      const r = await get(daniela, '/reportes');
      expect(r.estado).toBe(200);
      expect(r.cuerpo.por_estado).toMatchObject({ propuesta: 1 });
      expect((await get(mariana, '/reportes')).estado).toBe(403);
    });

    it('la líder exporta todo en CSV; un integrante solo lo suyo', async () => {
      const r = await e.app.inject({
        method: 'GET',
        url: `${base}/reportes/exportar`,
        cookies: valeria,
      });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('text/csv');
      expect(r.headers['content-disposition']).toContain('attachment');
      expect(r.body).toContain('Código,Título,Estado');
      expect(r.body).toContain('Para el reporte');
      expect((await get(carlos, '/reportes/exportar')).estado).toBe(403);
      const mias = await e.app.inject({
        method: 'GET',
        url: `${base}/reportes/exportar?solo_mias=true`,
        cookies: carlos,
      });
      expect(mias.statusCode).toBe(200);
    });
  });

  describe('plantillas (EQ-20)', () => {
    it('la líder crea y usa una de proyecto; un integrante solo las ve', async () => {
      const cuerpo = { nombre: 'Arranque', tipo: 'proyecto', elementos: ['Repositorio', 'CI'] };
      expect((await post(carlos, '/plantillas', cuerpo)).estado).toBe(403);
      const r = await post(valeria, '/plantillas', cuerpo);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      expect((await get(carlos, '/plantillas')).cuerpo).toHaveLength(1);
      expect((await get(mariana, '/plantillas')).estado).toBe(403);
      expect((await post(carlos, `/plantillas/${r.cuerpo.id}/usar`)).estado).toBe(403);
      expect((await post(valeria, `/plantillas/${r.cuerpo.id}/usar`)).cuerpo).toEqual({
        creadas: 2,
      });
      expect((await e.pedir(valeria, 'DELETE', `${base}/plantillas/${r.cuerpo.id}`)).estado).toBe(
        204,
      );
    });
  });

  describe('archivos (EQ-19)', () => {
    let archivo: Archivo;
    const txt = Buffer.from('Notas de la reunión').toString('base64');

    it('un integrante sube un archivo; la invitada no; tipos y tamaño se validan', async () => {
      const r = await post(carlos, '/archivos', {
        nombre: 'notas.txt',
        mime: 'text/plain',
        contenido_base64: txt,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      archivo = r.cuerpo;
      expect(archivo).toMatchObject({ tipo: 'doc', tamano_bytes: 20, puedo_eliminar: true });
      expect(
        (
          await post(mariana, '/archivos', {
            nombre: 'a.txt',
            mime: 'text/plain',
            contenido_base64: txt,
          })
        ).estado,
      ).toBe(403);
      expect(
        (
          await post(carlos, '/archivos', {
            nombre: 'a.svg',
            mime: 'image/svg+xml',
            contenido_base64: txt,
          })
        ).estado,
      ).toBe(400);
      const grande = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
      expect(
        (
          await post(carlos, '/archivos', {
            nombre: 'g.pdf',
            mime: 'application/pdf',
            contenido_base64: grande,
          })
        ).estado,
      ).toBe(400);
    });

    it('se descarga como adjunto con el mismo contenido', async () => {
      const r = await e.app.inject({
        method: 'GET',
        url: `${base}/archivos/${archivo.id}/descarga`,
        cookies: daniela,
      });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-disposition']).toContain('notas.txt');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.body).toBe('Notas de la reunión');
      expect((await get(mariana, `/archivos/${archivo.id}/descarga`)).estado).toBe(403);
    });

    it('solo quien lo subió o la líder lo eliminan', async () => {
      expect((await e.pedir(daniela, 'DELETE', `${base}/archivos/${archivo.id}`)).estado).toBe(403);
      expect((await e.pedir(carlos, 'DELETE', `${base}/archivos/${archivo.id}`)).estado).toBe(204);
      expect((await get(carlos, '/archivos')).cuerpo).toEqual([]);
    });
  });
});
