import type { Retrospectiva, Sprint, SprintDetalle, TareaEquipo } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

const ID = { carlos: '00000000-0000-4000-8000-000000000002' };

/**
 * Sprints y retrospectiva (Fase 3.3: EQ-09 a EQ-13). Un recorrido completo en un equipo propio
 * —planear, iniciar, cerrar con instantánea y hacer la retrospectiva— con un caso permitido y
 * uno prohibido por ruta: Valeria (líder), Carlos y Daniela (integrantes), Mariana (invitada) y
 * Paola (no pertenece). Las reglas finas ya las prueban P53–P69 en la BD.
 */
describe.skipIf(!DATABASE_URL)('sprints y retrospectiva', () => {
  let e: Entorno;
  let lider: Cookies;
  let carlos: Cookies;
  let daniela: Cookies;
  let invitada: Cookies;
  let ajena: Cookies;
  let equipoId: string;
  let base: string;
  let hecha: TareaEquipo;
  let pendiente: TareaEquipo;
  let sprint: SprintDetalle;
  let siguiente: SprintDetalle;

  const post = (quien: Cookies | null, ruta: string, cuerpo?: object) =>
    e.pedir(quien, 'POST', `${base}${ruta}`, cuerpo);
  const get = (quien: Cookies | null, ruta: string) => e.pedir(quien, 'GET', `${base}${ruta}`);

  async function unir(quien: Cookies, datos: object) {
    const inv = await e.pedir(lider, 'POST', `${base}/invitaciones`, datos);
    const r = await e.pedir(quien, 'POST', `/invitaciones/${inv.cuerpo.codigo}/aceptar`);
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
  }
  /** Propuesta de la líder aceptada por los dos integrantes. */
  async function aceptada(titulo: string, extra: object = {}): Promise<TareaEquipo> {
    const t = (await post(lider, '/tareas', { titulo, ...extra })).cuerpo;
    await post(carlos, `/tareas/${t.id}/voto`, { voto: 'aceptar' });
    const r = await post(daniela, `/tareas/${t.id}/voto`, { voto: 'aceptar' });
    expect(r.cuerpo.estado).toBe('aceptada');
    return (await get(lider, `/tareas/${t.id}`)).cuerpo;
  }

  beforeAll(async () => {
    e = await crearEntorno();
    lider = await e.entrar(SEMILLA.valeria);
    carlos = await e.entrar(SEMILLA.carlos);
    daniela = await e.entrar(SEMILLA.daniela);
    invitada = await e.entrar(SEMILLA.mariana);
    ajena = await e.entrar(SEMILLA.paola);
    equipoId = (await e.pedir(lider, 'POST', '/equipos', { nombre: 'Pruebas de sprints' })).cuerpo
      .id;
    base = `/equipos/${equipoId}`;
    await unir(carlos, { rol_destino: 'integrante' });
    await unir(daniela, { rol_destino: 'integrante' });
    await unir(invitada, { rol_destino: 'invitado', duracion_invitado_dias: 7 });
    hecha = await aceptada('Se completa en el sprint');
    pendiente = await aceptada('Queda pendiente', { responsable_id: ID.carlos });
  });

  afterAll(async () => {
    await e.db.deleteFrom('equipos').where('id', '=', equipoId).execute();
    await e.cerrar();
  });

  describe('ver sprints', () => {
    it('sin sprint activo, el equipo recibe `sprint: null`', async () => {
      const r = await get(carlos, '/sprints/activo');
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toEqual({ sprint: null });
    });

    it('la invitada no ve los sprints (403) y quien no pertenece no encuentra el equipo (404)', async () => {
      const r = await get(invitada, '/sprints');
      expect(r.estado).toBe(403);
      expect(r.cuerpo.mensaje).toBe('Los invitados no ven los sprints.');
      expect((await get(ajena, '/sprints/activo')).estado).toBe(404);
      expect((await get(null, '/sprints')).estado).toBe(401);
    });
  });

  describe('planear (EQ-10)', () => {
    it('un integrante no planea', async () => {
      const r = await post(carlos, '/sprints', { objetivo: 'No' });
      expect(r.estado).toBe(403);
      expect(r.cuerpo.mensaje).toBe('Solo el líder puede planear, iniciar y cerrar sprints.');
    });

    it('la líder planea con capacidad y tareas disponibles', async () => {
      const disp = await get(lider, '/sprints/disponibles');
      expect(disp.cuerpo.map((t: TareaEquipo) => t.id).sort()).toEqual(
        [hecha.id, pendiente.id].sort(),
      );
      const r = await post(lider, '/sprints', {
        objetivo: 'Cerrar el primer ciclo',
        tarea_ids: [hecha.id, pendiente.id],
        capacidad: [{ usuario_id: ID.carlos, horas: 24 }],
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      sprint = r.cuerpo;
      expect(sprint).toMatchObject({ numero: 1, estado: 'planificado', total: 2, completadas: 0 });
      expect(sprint.capacidad.find((c) => c.usuario_id === ID.carlos)).toMatchObject({
        horas: 24,
        tareas: 1,
      });
      expect((await get(lider, '/sprints/disponibles')).cuerpo).toEqual([]);
    });

    it('valida las fechas en la API (400) y en la BD las que se cruzan (400)', async () => {
      const mal = await e.pedir(lider, 'PATCH', `${base}/sprints/${sprint.id}`, {
        inicio: '2026-12-10',
        fin: '2026-12-01',
      });
      expect(mal.estado).toBe(400);
      const cruzado = await post(lider, '/sprints', { inicio: sprint.inicio });
      expect(cruzado.estado).toBe(400);
      expect(cruzado.cuerpo.codigo).toBe('fechas_cruzadas');
    });

    it('la líder planea el siguiente sprint y cambia el objetivo del primero', async () => {
      siguiente = (await post(lider, '/sprints', { objetivo: 'Siguiente' })).cuerpo;
      expect(siguiente.numero).toBe(2);
      expect(siguiente.inicio > sprint.fin).toBe(true);
      const r = await e.pedir(lider, 'PATCH', `${base}/sprints/${sprint.id}`, {
        objetivo: 'Primer ciclo completo',
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toMatchObject({ objetivo: 'Primer ciclo completo', total: 2 });
    });
  });

  describe('sprint activo (EQ-09)', () => {
    it('un integrante no inicia; la líder sí, y no hay dos activos (409)', async () => {
      expect((await post(carlos, `/sprints/${sprint.id}/iniciar`)).estado).toBe(403);
      const r = await post(lider, `/sprints/${sprint.id}/iniciar`);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo.estado).toBe('activo');
      const otro = await post(lider, `/sprints/${siguiente.id}/iniciar`);
      expect(otro.estado).toBe(409);
      expect(otro.cuerpo.codigo).toBe('sprint_activo_existente');
    });

    it('el equipo ve el sprint activo con su burndown en vivo', async () => {
      // La líder completa una de las dos tareas (entrar al sprint le subió la versión).
      let t: TareaEquipo = (await get(lider, `/tareas/${hecha.id}`)).cuerpo;
      for (const estado of ['habilitada', 'en_curso', 'completada']) {
        const paso = await post(lider, `/tareas/${t.id}/estado`, { version: t.version, estado });
        expect(paso.estado, JSON.stringify(paso.cuerpo)).toBe(200);
        t = paso.cuerpo;
      }
      const r = await get(daniela, '/sprints/activo');
      expect(r.estado).toBe(200);
      const activo: SprintDetalle = r.cuerpo.sprint;
      expect(activo).toMatchObject({ id: sprint.id, total: 2, completadas: 1 });
      expect(activo.serie.at(-1)).toMatchObject({ total: 2, completadas: 1 });
      expect(activo.tareas).toHaveLength(2);
    });
  });

  describe('cerrar (EQ-11) e historial (EQ-13)', () => {
    it('un integrante no cierra', async () => {
      expect((await post(carlos, `/sprints/${sprint.id}/cerrar`, {})).estado).toBe(403);
    });

    it('la líder cierra: instantánea final, retrospectiva y pendientes al siguiente sprint', async () => {
      const r = await post(lider, `/sprints/${sprint.id}/cerrar`, { pendientes: 'siguiente' });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      const cerrado: SprintDetalle = r.cuerpo;
      expect(cerrado).toMatchObject({ estado: 'cerrado', total: 2, completadas: 1 });
      expect(cerrado.retro).toMatchObject({ votacion_cerrada: false, cerrada: false });
      expect(cerrado.tareas.map((t) => t.id)).toEqual([hecha.id]);
      const sig: SprintDetalle = (await get(lider, `/sprints/${siguiente.id}`)).cuerpo;
      expect(sig.tareas.map((t) => t.id)).toEqual([pendiente.id]);
      // La completada sale del tablero.
      const tablero: TareaEquipo[] = (await get(lider, '/tareas?vista=tablero')).cuerpo;
      expect(tablero.map((t) => t.id)).toEqual([pendiente.id]);
    });

    it('cerrar otra vez no se puede (422)', async () => {
      const r = await post(lider, `/sprints/${sprint.id}/cerrar`, {});
      expect(r.estado).toBe(422);
      expect(r.cuerpo.codigo).toBe('sprint_no_activo');
    });

    it('el historial lista los sprints con su resultado', async () => {
      const r = await get(carlos, '/sprints');
      expect(r.estado).toBe(200);
      const lista: Sprint[] = r.cuerpo;
      expect(lista.map((s) => [s.numero, s.estado, s.total, s.completadas])).toEqual([
        [2, 'planificado', 1, 0],
        [1, 'cerrado', 2, 1],
      ]);
    });

    it('un sprint planificado se puede borrar; uno cerrado no', async () => {
      const extra: SprintDetalle = (await post(lider, '/sprints', {})).cuerpo;
      expect((await e.pedir(carlos, 'DELETE', `${base}/sprints/${extra.id}`)).estado).toBe(403);
      expect((await e.pedir(lider, 'DELETE', `${base}/sprints/${extra.id}`)).estado).toBe(204);
      expect((await e.pedir(lider, 'DELETE', `${base}/sprints/${sprint.id}`)).estado).toBe(422);
    });
  });

  describe('retrospectiva (EQ-12)', () => {
    let notas: string[] = [];
    const retro = async (quien: Cookies): Promise<Retrospectiva> =>
      (await get(quien, `/sprints/${sprint.id}/retro`)).cuerpo.retro;

    it('la invitada no participa (403)', async () => {
      expect((await get(invitada, `/sprints/${sprint.id}/retro`)).estado).toBe(403);
      const r = await post(invitada, `/sprints/${sprint.id}/retro/notas`, {
        columna: 'bien',
        texto: 'Hola',
      });
      expect(r.estado).toBe(403);
    });

    it('las notas anónimas no dicen quién las escribió', async () => {
      const r = await post(carlos, `/sprints/${sprint.id}/retro/notas`, {
        columna: 'mejorar',
        texto: 'Revisar antes de cerrar',
        anonima: true,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      for (const texto of ['Buen ritmo', 'Pares de revisión', 'Demo semanal']) {
        const n = await post(daniela, `/sprints/${sprint.id}/retro/notas`, {
          columna: 'bien',
          texto,
        });
        expect(n.estado).toBe(201);
      }
      const vista = await retro(carlos);
      const anonima = vista.notas.find((n) => n.texto === 'Revisar antes de cerrar');
      expect(anonima).toMatchObject({ anonima: true, autor: null, mia: false });
      expect(vista.notas.find((n) => n.texto === 'Buen ritmo')?.autor?.nombre).toBe(
        'Daniela Torres',
      );
      notas = vista.notas.map((n) => n.id);
    });

    it('cada persona tiene 3 votos: el cuarto lo rechaza la BD (409, NX003)', async () => {
      for (const id of notas.slice(0, 3)) {
        const r = await post(daniela, `/retro/notas/${id}/voto`, { dar: true });
        expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      }
      const cuarto = await post(daniela, `/retro/notas/${notas[3]}/voto`, { dar: true });
      expect(cuarto.estado).toBe(409);
      expect(cuarto.cuerpo).toMatchObject({
        codigo: 'limite_votos',
        mensaje: 'Ya usaste tus 3 votos en esta retrospectiva.',
      });
      const quitar = await post(daniela, `/retro/notas/${notas[0]}/voto`, { dar: false });
      expect(quitar.cuerpo).toMatchObject({ voto_mio: false, mis_votos_usados: 2 });
      expect((await retro(daniela)).mis_votos_usados).toBe(2);
    });

    it('nadie más que su autora o la líder borra una nota', async () => {
      const deDaniela = (await retro(carlos)).notas.find((n) => n.texto === 'Demo semanal');
      const r = await e.pedir(carlos, 'DELETE', `${base}/retro/notas/${deDaniela?.id}`);
      expect(r.estado).toBe(403);
    });

    it('solo la líder cierra la votación; después ya no se vota (422)', async () => {
      const avanzar = (quien: Cookies, fase: string) =>
        post(quien, `/sprints/${sprint.id}/retro/avanzar`, { fase });
      expect((await avanzar(carlos, 'votacion')).estado).toBe(403);
      const r = await avanzar(lider, 'votacion');
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toMatchObject({ votacion_cerrada: true, cerrada: false });
      expect((await post(carlos, `/retro/notas/${notas[0]}/voto`, { dar: true })).estado).toBe(422);
    });

    it('la líder convierte una acción en propuesta de tarea', async () => {
      const accion = (await post(lider, `/sprints/${sprint.id}/retro/notas`, {})).estado;
      expect(accion).toBe(400); // la nota sin texto ni columna no pasa la validación
      expect((await post(carlos, `/retro/notas/${notas[1]}/tarea`)).estado).toBe(403);
      const r = await post(lider, `/retro/notas/${notas[1]}/tarea`);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      expect(r.cuerpo.estado).toBe('propuesta');
      expect((await retro(lider)).notas.find((n) => n.id === notas[1])?.tarea_id).toBe(r.cuerpo.id);
    });

    it('la líder cierra la retrospectiva', async () => {
      const r = await post(lider, `/sprints/${sprint.id}/retro/avanzar`, { fase: 'cerrada' });
      expect(r.cuerpo).toMatchObject({ cerrada: true });
      const lista: Sprint[] = (await get(lider, '/sprints')).cuerpo;
      expect(lista.find((s) => s.id === sprint.id)?.retro).toMatchObject({ cerrada: true });
    });
  });
});
