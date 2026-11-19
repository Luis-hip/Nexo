import type { EquipoDetalle, Liderazgo, Miembro } from '@nexo/shared';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

const ID = {
  valeria: '00000000-0000-4000-8000-000000000001',
  carlos: '00000000-0000-4000-8000-000000000002',
  daniela: '00000000-0000-4000-8000-000000000003',
};

/**
 * Liderazgo y administración del equipo (Fase 3.5: AD-04 a AD-12). En un equipo propio:
 * Valeria (líder), Carlos y Daniela (integrantes), Mariana (invitada) y Paola (no pertenece).
 * Recorre configurar, invitados, transferencia, una elección completa (también por plazo
 * vencido), expulsar, salir y archivar, con un caso permitido y uno prohibido por ruta.
 */
describe.skipIf(!DATABASE_URL)('liderazgo y equipo', () => {
  let e: Entorno;
  let valeria: Cookies;
  let carlos: Cookies;
  let daniela: Cookies;
  let mariana: Cookies;
  let paola: Cookies;
  let equipoId: string;
  let base: string;

  const post = (quien: Cookies | null, ruta: string, cuerpo?: object) =>
    e.pedir(quien, 'POST', `${base}${ruta}`, cuerpo);
  const get = (quien: Cookies | null, ruta: string) => e.pedir(quien, 'GET', `${base}${ruta}`);
  const miembros = async (): Promise<Miembro[]> => (await get(valeria, '/miembros')).cuerpo;
  const membresiaDe = async (usuarioId: string) =>
    (await miembros()).find((m) => m.usuario_id === usuarioId)?.membresia_id ?? '';
  const miRol = async (quien: Cookies) => ((await get(quien, '')).cuerpo as EquipoDetalle).mi_rol;

  async function unir(quien: Cookies, datos: object) {
    const inv = await e.pedir(valeria, 'POST', `${base}/invitaciones`, datos);
    const r = await e.pedir(quien, 'POST', `/invitaciones/${inv.cuerpo.codigo}/aceptar`);
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
  }

  beforeAll(async () => {
    e = await crearEntorno();
    valeria = await e.entrar(SEMILLA.valeria);
    carlos = await e.entrar(SEMILLA.carlos);
    daniela = await e.entrar(SEMILLA.daniela);
    mariana = await e.entrar(SEMILLA.mariana);
    paola = await e.entrar(SEMILLA.paola);
    equipoId = (await e.pedir(valeria, 'POST', '/equipos', { nombre: 'Pruebas de liderazgo' }))
      .cuerpo.id;
    base = `/equipos/${equipoId}`;
    await unir(carlos, { rol_destino: 'integrante' });
    await unir(daniela, { rol_destino: 'integrante' });
    await unir(mariana, { rol_destino: 'invitado', duracion_invitado_dias: 7 });
  });

  afterAll(async () => {
    await e.db.deleteFrom('equipos').where('id', '=', equipoId).execute();
    await e.cerrar();
  });

  describe('configuración (AD-06)', () => {
    it('la ve el equipo, pero no la invitada (403) ni quien no pertenece (404)', async () => {
      const r = await get(carlos, '/configuracion');
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({ nombre: 'Pruebas de liderazgo', votacion_plazo_horas: 72 });
      expect((await get(mariana, '/configuracion')).estado).toBe(403);
      expect((await get(paola, '/configuracion')).estado).toBe(404);
    });

    it('solo la líder la cambia y los valores se validan', async () => {
      const patch = (quien: Cookies, cuerpo: object) =>
        e.pedir(quien, 'PATCH', `${base}/configuracion`, cuerpo);
      expect((await patch(carlos, { nombre: 'Otro' })).estado).toBe(403);
      expect((await patch(valeria, { max_miembros: 9 })).estado).toBe(400);
      const bajo = await patch(valeria, { max_miembros: 2 });
      expect(bajo.estado).toBe(400);
      expect(bajo.cuerpo.mensaje).toBe(
        'El equipo ya tiene 3 miembros: el tope no puede ser menor.',
      );
      const r = await patch(valeria, {
        descripcion: 'Probamos el liderazgo',
        votacion_plazo_horas: 48,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toMatchObject({
        descripcion: 'Probamos el liderazgo',
        votacion_plazo_horas: 48,
      });
    });
  });

  describe('invitados (AD-05)', () => {
    it('la líder amplía el acceso; un integrante no', async () => {
      const m = await membresiaDe('00000000-0000-4000-8000-000000000009');
      expect(
        (await post(carlos, `/miembros/${m}/invitado`, { accion: 'ampliar', dias: 7 })).estado,
      ).toBe(403);
      const r = await post(valeria, `/miembros/${m}/invitado`, { accion: 'ampliar', dias: 14 });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      const caduca = (r.cuerpo as Miembro[]).find((x) => x.membresia_id === m)?.caduca_en ?? '';
      expect(new Date(caduca).getTime() - Date.now()).toBeGreaterThan(20 * 86_400_000);
      expect((await post(valeria, `/miembros/${m}/invitado`, { accion: 'ampliar' })).estado).toBe(
        400,
      );
    });
  });

  describe('transferencia (AD-07, AD-08)', () => {
    let lid: Liderazgo;

    it('la invitada no ve el liderazgo; el equipo empieza sin nada pendiente', async () => {
      expect((await get(mariana, '/liderazgo')).estado).toBe(403);
      const r = await get(carlos, '/liderazgo');
      expect(r.cuerpo).toEqual({ transferencia: null, eleccion: null, historial: [] });
    });

    it('solo la líder propone; solo la persona propuesta responde', async () => {
      expect((await post(carlos, '/liderazgo/transferencias', { a_id: ID.daniela })).estado).toBe(
        403,
      );
      const r = await post(valeria, '/liderazgo/transferencias', { a_id: ID.carlos });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      lid = r.cuerpo;
      expect(lid.transferencia).toMatchObject({
        estado: 'pendiente',
        a: { usuario_id: ID.carlos },
      });
      const t = lid.transferencia?.id;
      expect(
        (await post(daniela, `/liderazgo/transferencias/${t}/respuesta`, { acepta: true })).estado,
      ).toBe(403);
      const no = await post(carlos, `/liderazgo/transferencias/${t}/respuesta`, { acepta: false });
      expect(no.cuerpo.historial[0]).toMatchObject({ tipo: 'transferencia', estado: 'rechazada' });
      expect(await miRol(valeria)).toBe('lider');
    });

    it('la líder cancela una transferencia pendiente', async () => {
      const r = await post(valeria, '/liderazgo/transferencias', { a_id: ID.daniela });
      const c = await post(
        valeria,
        `/liderazgo/transferencias/${r.cuerpo.transferencia.id}/cancelar`,
      );
      expect(c.estado).toBe(200);
      expect(c.cuerpo.transferencia).toBeNull();
    });
  });

  describe('elección de líder (AD-09)', () => {
    it('la líder convoca; ella no vota (403) y los votos ajenos no se ven', async () => {
      expect((await post(carlos, '/liderazgo/eleccion')).estado).toBe(403);
      const r = await post(valeria, '/liderazgo/eleccion');
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      const el = r.cuerpo.eleccion;
      expect(el).toMatchObject({ fase: 'votacion', ronda: 1, votantes_total: 2 });
      expect((await post(valeria, '/liderazgo/eleccion')).estado).toBe(409);
      const v = await post(valeria, `/liderazgo/eleccion/${el.id}/voto`, {
        candidato_id: ID.carlos,
      });
      expect(v.estado).toBe(403);
      expect(v.cuerpo.mensaje).toBe('El líder saliente no vota en la elección.');
      const c = await post(carlos, `/liderazgo/eleccion/${el.id}/voto`, {
        candidato_id: ID.daniela,
      });
      expect(c.estado, JSON.stringify(c.cuerpo)).toBe(200);
      expect(c.cuerpo.eleccion).toMatchObject({ votaron: ['Carlos Ramírez'], mi_voto: ID.daniela });
      expect(c.cuerpo.eleccion.candidatos.every((x: { votos: null }) => x.votos === null)).toBe(
        true,
      );
      expect(
        (await post(carlos, `/liderazgo/eleccion/${el.id}/voto`, { candidato_id: ID.carlos }))
          .estado,
      ).toBe(409);
    });

    it('cuando votan todos hay nueva líder y la anterior queda como integrante', async () => {
      const el = (await get(daniela, '/liderazgo')).cuerpo.eleccion;
      const r = await post(daniela, `/liderazgo/eleccion/${el.id}/voto`, {
        candidato_id: ID.daniela,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo.eleccion).toBeNull();
      expect(r.cuerpo.historial[0]).toMatchObject({
        tipo: 'eleccion',
        fase: 'resultado',
        ganador: { usuario_id: ID.daniela },
      });
      expect(await miRol(daniela)).toBe('lider');
      expect(await miRol(valeria)).toBe('integrante');
    });

    it('con el plazo vencido (acortado) la elección se resuelve al consultarla', async () => {
      const r = await post(daniela, '/liderazgo/eleccion');
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      await sql`update elecciones set plazo_en = now() - interval '1 minute' where id = ${r.cuerpo.eleccion.id}`.execute(
        e.db,
      );
      const despues: Liderazgo = (await get(carlos, '/liderazgo')).cuerpo;
      expect(despues.eleccion).toBeNull();
      expect(despues.historial[0]).toMatchObject({ tipo: 'eleccion', fase: 'sin_votos' });
      expect(await miRol(daniela)).toBe('lider');
    });
  });

  describe('expulsar, salir y archivar (AD-10 a AD-12)', () => {
    it('solo la líder expulsa', async () => {
      const m = await membresiaDe('00000000-0000-4000-8000-000000000009');
      expect((await post(carlos, `/miembros/${m}/expulsar`)).estado).toBe(403);
      const r = await e.pedir(daniela, 'POST', `${base}/miembros/${m}/expulsar`);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect((r.cuerpo as Miembro[]).some((x) => x.membresia_id === m)).toBe(false);
      expect((await e.pedir(mariana, 'GET', base)).estado).toBe(404);
    });

    it('la líder no sale sin transferir (422); un integrante sí', async () => {
      const r = await post(daniela, '/salir');
      expect(r.estado).toBe(422);
      expect(r.cuerpo.codigo).toBe('lider_no_sale');
      expect((await post(carlos, '/salir')).estado).toBe(200);
      expect((await get(carlos, '')).estado).toBe(404);
    });

    it('archivado, el equipo es de solo lectura; la líder lo reactiva', async () => {
      expect((await post(valeria, '/archivar', { archivar: true })).estado).toBe(403);
      const r = await post(daniela, '/archivar', { archivar: true });
      expect(r.cuerpo.estado).toBe('archivado');
      const escribir = await post(daniela, '/tareas', { titulo: 'No debería' });
      expect(escribir.estado).toBe(403);
      expect(escribir.cuerpo.codigo).toBe('equipo_archivado');
      expect((await post(daniela, '/archivar', { archivar: false })).cuerpo.estado).toBe('activo');
    });
  });
});
