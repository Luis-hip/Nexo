import type { EquipoDetalle, TareaEquipo, TareaEquipoDetalle } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

const ID = {
  carlos: '00000000-0000-4000-8000-000000000002',
  daniela: '00000000-0000-4000-8000-000000000003',
  mariana: '00000000-0000-4000-8000-000000000009',
};

/**
 * Pruebas de la Fase 2 (docs/03, 2.3): por cada ruta, un caso permitido y uno prohibido para
 * cada rol. Se usa un equipo propio: Valeria (líder), Carlos y Daniela (integrantes),
 * Mariana (invitada) y Paola (no pertenece).
 */
describe.skipIf(!DATABASE_URL)('tareas de equipo', () => {
  let e: Entorno;
  let lider: Cookies;
  let carlos: Cookies;
  let daniela: Cookies;
  let invitada: Cookies;
  let ajena: Cookies;
  let equipoId: string;
  let base: string;
  let membresiaInvitada: string;

  type Resp<T> = { estado: number; cuerpo: T };
  const post = (quien: Cookies | null, ruta: string, cuerpo?: object) =>
    e.pedir(quien, 'POST', `${base}${ruta}`, cuerpo);
  const get = (quien: Cookies | null, ruta: string) => e.pedir(quien, 'GET', `${base}${ruta}`);

  /** Tarea creada por el líder en el backlog. */
  async function enBacklog(titulo = 'Tarea de prueba'): Promise<TareaEquipoDetalle> {
    const r = await post(lider, '/tareas', { titulo });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo;
  }
  /** Propuesta de Carlos, en triaje. */
  async function propuesta(titulo = 'Propuesta de prueba'): Promise<TareaEquipoDetalle> {
    const r = await post(carlos, '/tareas', { titulo });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo;
  }
  /** Tarea en el tablero, de Carlos y con la asignación ya aceptada, en el estado pedido. */
  async function deCarlos(
    estado: 'aceptada' | 'habilitada' | 'en_curso' = 'habilitada',
    titulo = 'Tarea de Carlos',
  ): Promise<TareaEquipoDetalle> {
    const creada = await post(lider, '/tareas', {
      titulo,
      destino: 'tablero',
      responsable_id: ID.carlos,
    });
    expect(creada.cuerpo).toMatchObject({ estado: 'aceptada', asignacion_pendiente: true });
    let t: TareaEquipoDetalle = (
      await post(carlos, `/tareas/${creada.cuerpo.id}/asignacion`, { acepta: true })
    ).cuerpo;
    for (const destino of ['habilitada', 'en_curso'] as const) {
      if (t.estado === estado) break;
      const r = await post(lider, `/tareas/${t.id}/estado`, {
        version: t.version,
        estado: destino,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      t = r.cuerpo;
    }
    return t;
  }
  const actual = async (id: string): Promise<TareaEquipoDetalle> =>
    (await get(lider, `/tareas/${id}`)).cuerpo;

  beforeAll(async () => {
    e = await crearEntorno();
    lider = await e.entrar(SEMILLA.valeria);
    carlos = await e.entrar(SEMILLA.carlos);
    daniela = await e.entrar(SEMILLA.daniela);
    invitada = await e.entrar(SEMILLA.mariana);
    ajena = await e.entrar(SEMILLA.paola);

    equipoId = (await e.pedir(lider, 'POST', '/equipos', { nombre: 'Pruebas de tareas' })).cuerpo
      .id;
    base = `/equipos/${equipoId}`;
    const invitar = async (quien: Cookies, datos: object) => {
      const inv = await post(lider, '/invitaciones', datos);
      const r = await e.pedir(quien, 'POST', `/invitaciones/${inv.cuerpo.codigo}/aceptar`);
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    };
    await invitar(carlos, { rol_destino: 'integrante' });
    await invitar(daniela, { rol_destino: 'integrante' });
    await invitar(invitada, { rol_destino: 'invitado', duracion_invitado_dias: 7 });
    const equipo: EquipoDetalle = (await get(lider, '')).cuerpo;
    membresiaInvitada = equipo.miembros.find((m) => m.rol === 'invitado')?.membresia_id ?? '';
  });

  afterAll(async () => {
    await e.db.deleteFrom('equipos').where('id', '=', equipoId).execute();
    await e.cerrar();
  });

  describe('crear y proponer (EQ-07)', () => {
    it('el líder crea directamente: al backlog por defecto o al tablero', async () => {
      const backlog = await enBacklog('Directa al backlog');
      expect(backlog).toMatchObject({ estado: 'backlog', origen: 'directa', proponente: null });
      expect(backlog.codigo).toBeGreaterThan(0);

      const r = await post(lider, '/tareas', {
        titulo: 'Directa al tablero',
        destino: 'tablero',
        responsable_id: ID.daniela,
        etiquetas: ['diseño'],
      });
      expect(r.cuerpo).toMatchObject({
        estado: 'aceptada',
        asignacion_pendiente: true,
        responsable: { nombre: 'Daniela Torres' },
        etiquetas: ['diseño'],
      });
    });

    it('el integrante propone: va a triaje y se ignoran responsable y destino', async () => {
      const r = await post(carlos, '/tareas', {
        titulo: 'Propuesta de Carlos',
        destino: 'tablero',
        responsable_id: ID.carlos,
      });
      expect(r.estado).toBe(201);
      expect(r.cuerpo).toMatchObject({
        estado: 'propuesta',
        origen: 'propuesta',
        responsable: null,
        proponente: { nombre: 'Carlos Ramírez' },
      });
    });

    it('el invitado no crea ni propone (403); quien no pertenece, 404', async () => {
      expect(await post(invitada, '/tareas', { titulo: 'x' })).toMatchObject({
        estado: 403,
        cuerpo: { codigo: 'sin_permiso', mensaje: 'Los invitados no pueden proponer tareas.' },
      });
      expect((await post(ajena, '/tareas', { titulo: 'x' })).estado).toBe(404);
      expect((await post(null, '/tareas', { titulo: 'x' })).estado).toBe(401);
    });

    it('valida el título y que el responsable sea miembro (no un invitado)', async () => {
      expect((await post(lider, '/tareas', { titulo: '  ' })).cuerpo.mensaje).toBe(
        'Escribe un título para la tarea.',
      );
      const r = await post(lider, '/tareas', {
        titulo: 'Con invitada',
        responsable_id: ID.mariana,
      });
      expect(r).toMatchObject({ estado: 400, cuerpo: { codigo: 'responsable_invalido' } });
    });
  });

  describe('ver tareas', () => {
    it('líder e integrante ven tablero, backlog y triaje; conteos incluidos', async () => {
      await enBacklog('Para conteos');
      for (const quien of [lider, carlos]) {
        for (const vista of ['tablero', 'backlog', 'triaje', 'todas']) {
          expect((await get(quien, `/tareas?vista=${vista}`)).estado, vista).toBe(200);
        }
        const conteos = (await get(quien, '/tareas/conteos')).cuerpo;
        expect(conteos.backlog).toBeGreaterThan(0);
      }
    });

    it('el invitado solo ve lo compartido con él y no tiene backlog ni triaje', async () => {
      const compartida = await deCarlos('habilitada', 'Compartida con la invitada');
      const privada = await deCarlos('habilitada', 'No compartida');
      const r = await e.pedir(lider, 'PUT', `${base}/tareas/${compartida.id}/compartida`, {
        membresia_ids: [membresiaInvitada],
      });
      expect(r.cuerpo.compartida_con).toEqual([membresiaInvitada]);

      const lista: Resp<TareaEquipo[]> = await get(invitada, '/tareas?vista=tablero');
      expect(lista.cuerpo.map((t) => t.titulo)).toEqual(['Compartida con la invitada']);
      expect((await get(invitada, `/tareas/${compartida.id}`)).estado).toBe(200);
      expect((await get(invitada, `/tareas/${compartida.id}`)).cuerpo.historial).toEqual([]);
      expect(await get(invitada, `/tareas/${privada.id}`)).toMatchObject({
        estado: 404,
        cuerpo: { codigo: 'tarea_no_encontrada' },
      });
      for (const vista of ['backlog', 'triaje', 'mias']) {
        expect((await get(invitada, `/tareas?vista=${vista}`)).estado, vista).toBe(403);
      }
      expect((await get(invitada, '/tareas/conteos')).estado).toBe(403);
    });

    it('solo el líder comparte tareas con invitados', async () => {
      const t = await enBacklog('Para compartir');
      const cuerpo = { membresia_ids: [membresiaInvitada] };
      for (const quien of [carlos, invitada]) {
        expect(
          (await e.pedir(quien, 'PUT', `${base}/tareas/${t.id}/compartida`, cuerpo)).estado,
        ).toBe(403);
      }
    });
  });

  describe('triaje (EQ-05)', () => {
    it('solo el líder decide: integrante e invitado reciben 403', async () => {
      const t = await propuesta();
      const cuerpo = { accion: 'aceptar', version: t.version };
      expect(await post(carlos, `/tareas/${t.id}/triaje`, cuerpo)).toMatchObject({
        estado: 403,
        cuerpo: { mensaje: 'Solo el líder puede aceptar o rechazar propuestas en triaje.' },
      });
      expect((await post(invitada, `/tareas/${t.id}/triaje`, cuerpo)).estado).toBe(403);
      expect((await post(ajena, `/tareas/${t.id}/triaje`, cuerpo)).estado).toBe(404);
    });

    it('aceptar al tablero con responsable: queda «aceptada» y pide aceptar la asignación', async () => {
      const t = await propuesta('Aceptada en triaje');
      const r = await post(lider, `/tareas/${t.id}/triaje`, {
        accion: 'aceptar',
        version: t.version,
        responsable_id: ID.daniela,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo).toMatchObject({
        estado: 'aceptada',
        asignacion_pendiente: true,
        responsable: { nombre: 'Daniela Torres' },
      });
    });

    it('rechazar exige motivo; enviar al backlog y pedir cambios', async () => {
      const a = await propuesta('Para rechazar');
      const sinMotivo = await post(lider, `/tareas/${a.id}/triaje`, {
        accion: 'rechazar',
        version: a.version,
      });
      expect(sinMotivo.estado).toBe(400);
      const rechazada = await post(lider, `/tareas/${a.id}/triaje`, {
        accion: 'rechazar',
        version: a.version,
        motivo: 'Fuera de alcance',
      });
      expect(rechazada.cuerpo).toMatchObject({
        estado: 'rechazada',
        rechazo_por: 'lider',
        motivo: 'Fuera de alcance',
      });

      const b = await propuesta('Para pedir cambios');
      const cambios = await post(lider, `/tareas/${b.id}/triaje`, {
        accion: 'pedir_cambios',
        version: b.version,
        comentario: 'Agrega criterios de aceptación',
      });
      expect(cambios.cuerpo).toMatchObject({
        estado: 'propuesta',
        cambios_pedidos: 'Agrega criterios de aceptación',
      });
      expect(cambios.cuerpo.comentarios[0].texto).toBe(
        'Cambios solicitados: Agrega criterios de aceptación',
      );
      const alBacklog = await post(lider, `/tareas/${b.id}/triaje`, {
        accion: 'backlog',
        version: cambios.cuerpo.version,
      });
      expect(alBacklog.cuerpo).toMatchObject({ estado: 'backlog', cambios_pedidos: null });

      // El integrante ve el estado de sus solicitudes en un solo lugar (FALT-08).
      const mias: Resp<TareaEquipo[]> = await get(carlos, '/tareas?vista=mias');
      expect(mias.cuerpo.map((t) => t.titulo)).toEqual(
        expect.arrayContaining(['Para rechazar', 'Para pedir cambios']),
      );
    });

    it('una tarea que ya no está en triaje no se puede decidir (422)', async () => {
      const t = await deCarlos('habilitada', 'Fuera de triaje');
      const r = await post(lider, `/tareas/${t.id}/triaje`, {
        accion: 'rechazar',
        version: t.version,
        motivo: 'x',
      });
      expect(r).toMatchObject({ estado: 422, cuerpo: { codigo: 'transicion_invalida' } });
    });

    it('del backlog al tablero', async () => {
      const t = await enBacklog('Sale del backlog');
      const r = await post(lider, `/tareas/${t.id}/triaje`, {
        accion: 'aceptar',
        version: t.version,
      });
      expect(r.cuerpo).toMatchObject({ estado: 'aceptada' });
    });
  });

  describe('asignar y responder (EQ-08)', () => {
    it('solo el líder asigna', async () => {
      const t = await enBacklog('Para asignar');
      const cuerpo = { version: t.version, responsable_id: ID.carlos };
      expect(await post(carlos, `/tareas/${t.id}/asignar`, cuerpo)).toMatchObject({
        estado: 403,
        cuerpo: {
          mensaje:
            'Solo el líder puede asignar responsables. Puedes solicitar un cambio en los comentarios.',
        },
      });
      expect((await post(invitada, `/tareas/${t.id}/asignar`, cuerpo)).estado).toBe(403);
      const r = await post(lider, `/tareas/${t.id}/asignar`, cuerpo);
      expect(r.cuerpo).toMatchObject({
        asignacion_pendiente: true,
        responsable: { nombre: 'Carlos Ramírez' },
      });
    });

    it('el responsable acepta; otra persona no puede responder por él', async () => {
      const t = await enBacklog('Para aceptar');
      await post(lider, `/tareas/${t.id}/asignar`, {
        version: t.version,
        responsable_id: ID.carlos,
      });
      expect(await post(daniela, `/tareas/${t.id}/asignacion`, { acepta: true })).toMatchObject({
        estado: 422,
        cuerpo: { codigo: 'sin_asignacion_pendiente' },
      });
      expect((await post(invitada, `/tareas/${t.id}/asignacion`, { acepta: true })).estado).toBe(
        403,
      );
      const r = await post(carlos, `/tareas/${t.id}/asignacion`, { acepta: true });
      expect(r.cuerpo).toMatchObject({ asignacion_pendiente: false });
    });

    it('rechazar exige motivo y devuelve la tarea a triaje para reasignar', async () => {
      const creada = await post(lider, '/tareas', {
        titulo: 'Asignación rechazada',
        destino: 'tablero',
        responsable_id: ID.carlos,
      });
      const id = creada.cuerpo.id;
      expect(
        (await post(carlos, `/tareas/${id}/asignacion`, { acepta: false })).cuerpo.mensaje,
      ).toBe('Explica por qué rechazas la asignación.');
      const r = await post(carlos, `/tareas/${id}/asignacion`, {
        acepta: false,
        motivo: 'Estoy saturado',
      });
      expect(r.cuerpo).toMatchObject({
        estado: 'rechazada',
        rechazo_por: 'responsable',
        motivo: 'Estoy saturado',
      });
      const triaje: Resp<TareaEquipo[]> = await get(lider, '/tareas?vista=triaje');
      expect(triaje.cuerpo.map((t) => t.id)).toContain(id);

      // El líder la reasigna desde triaje.
      const reasignada = await post(lider, `/tareas/${id}/triaje`, {
        accion: 'aceptar',
        version: r.cuerpo.version,
        responsable_id: ID.daniela,
      });
      expect(reasignada.cuerpo).toMatchObject({
        estado: 'aceptada',
        motivo: null,
        rechazo_por: null,
        responsable: { nombre: 'Daniela Torres' },
      });
    });
  });

  describe('máquina de estados en el servidor', () => {
    it('solo el líder habilita; el responsable trabaja su tarea', async () => {
      const t = await deCarlos('aceptada');
      const habilitar = { version: t.version, estado: 'habilitada' };
      expect(await post(carlos, `/tareas/${t.id}/estado`, habilitar)).toMatchObject({
        estado: 422,
        cuerpo: { codigo: 'transicion_invalida', mensaje: 'Solo el líder puede habilitar tareas.' },
      });
      const habilitada = await post(lider, `/tareas/${t.id}/estado`, habilitar);
      expect(habilitada.cuerpo).toMatchObject({ estado: 'habilitada', transiciones: ['en_curso'] });

      const enCurso = await post(carlos, `/tareas/${t.id}/estado`, {
        version: habilitada.cuerpo.version,
        estado: 'en_curso',
      });
      expect(enCurso.cuerpo).toMatchObject({ estado: 'en_curso', progreso: 5 });
      expect(enCurso.cuerpo.transiciones.sort()).toEqual(['atascada', 'completada']);
    });

    it('otro integrante y el invitado no mueven una tarea ajena (403)', async () => {
      const t = await deCarlos('habilitada');
      const cuerpo = { version: t.version, estado: 'en_curso' };
      expect(await post(daniela, `/tareas/${t.id}/estado`, cuerpo)).toMatchObject({
        estado: 403,
        cuerpo: {
          mensaje: 'Solo el responsable o el líder pueden cambiar el estado de esta tarea.',
        },
      });
      expect((await post(invitada, `/tareas/${t.id}/estado`, cuerpo)).estado).toBe(403);
      expect((await post(ajena, `/tareas/${t.id}/estado`, cuerpo)).estado).toBe(404);
      expect((await actual(t.id)).estado).toBe('habilitada');
    });

    it('atascar exige motivo; completar marca 100 %, resultado y subtareas', async () => {
      const t = await deCarlos('en_curso');
      await post(carlos, `/tareas/${t.id}/subtareas`, { titulo: 'Paso 1' });
      expect(
        (await post(carlos, `/tareas/${t.id}/estado`, { version: t.version, estado: 'atascada' }))
          .estado,
      ).toBe(400);
      const atascada = await post(carlos, `/tareas/${t.id}/estado`, {
        version: t.version,
        estado: 'atascada',
        motivo: 'Falta información',
      });
      expect(atascada.cuerpo).toMatchObject({ estado: 'atascada', motivo: 'Falta información' });

      const completada = await post(carlos, `/tareas/${t.id}/estado`, {
        version: atascada.cuerpo.version,
        estado: 'completada',
      });
      expect(completada.cuerpo).toMatchObject({
        estado: 'completada',
        progreso: 100,
        resultado: 'a_tiempo',
        motivo: null,
        subtareas_hechas: 1,
      });

      // Solo el líder reabre.
      const reabrir = { version: completada.cuerpo.version, estado: 'en_curso' };
      expect(await post(carlos, `/tareas/${t.id}/estado`, reabrir)).toMatchObject({
        estado: 422,
        cuerpo: { mensaje: 'Solo el líder puede reabrir una tarea completada.' },
      });
      const reabierta = await post(lider, `/tareas/${t.id}/estado`, reabrir);
      expect(reabierta.cuerpo).toMatchObject({ estado: 'en_curso', resultado: null, progreso: 90 });
    });

    it.each([
      ['habilitada', 'completada', 'No se puede pasar de «Habilitada» a «Completada».'],
      ['habilitada', 'aceptada', 'No se puede pasar de «Habilitada» a «Aceptada».'],
      ['en_curso', 'habilitada', 'No se puede pasar de «En curso» a «Habilitada».'],
      ['en_curso', 'propuesta', 'No se puede pasar de «En curso» a «Propuesta».'],
    ] as const)('transición inválida %s → %s devuelve 422', async (desde, hacia, mensaje) => {
      const t = await deCarlos(desde);
      const r = await post(lider, `/tareas/${t.id}/estado`, { version: t.version, estado: hacia });
      expect(r).toMatchObject({ estado: 422, cuerpo: { codigo: 'transicion_invalida', mensaje } });
    });

    it('con la asignación pendiente el responsable no puede empezar', async () => {
      const creada = await post(lider, '/tareas', {
        titulo: 'Sin aceptar',
        destino: 'tablero',
        responsable_id: ID.carlos,
      });
      const habilitada = await post(lider, `/tareas/${creada.cuerpo.id}/estado`, {
        version: creada.cuerpo.version,
        estado: 'habilitada',
      });
      const r = await post(carlos, `/tareas/${creada.cuerpo.id}/estado`, {
        version: habilitada.cuerpo.version,
        estado: 'en_curso',
      });
      expect(r).toMatchObject({
        estado: 422,
        cuerpo: { mensaje: 'Primero acepta la asignación.' },
      });
    });
  });

  describe('mover tarjetas (EQ-02)', () => {
    const ordenDe = async (estado: string, ids: string[]) =>
      ((await get(lider, '/tareas?vista=todas')).cuerpo as TareaEquipo[])
        .filter((t) => t.estado === estado && ids.includes(t.id))
        .map((t) => t.titulo);

    it('el líder reordena una columna: el servidor calcula el orden entre las vecinas', async () => {
      const a = await enBacklog('Orden A');
      const b = await enBacklog('Orden B');
      const c = await enBacklog('Orden C');
      const ids = [a.id, b.id, c.id];
      expect(await ordenDe('backlog', ids)).toEqual(['Orden A', 'Orden B', 'Orden C']);

      // C entre A y B.
      const r = await post(lider, `/tareas/${c.id}/mover`, {
        version: c.version,
        antes_id: a.id,
        despues_id: b.id,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
      expect(await ordenDe('backlog', ids)).toEqual(['Orden A', 'Orden C', 'Orden B']);

      // B al principio.
      const b2 = await actual(b.id);
      await post(lider, `/tareas/${b.id}/mover`, {
        version: b2.version,
        antes_id: null,
        despues_id: a.id,
      });
      expect(await ordenDe('backlog', ids)).toEqual(['Orden B', 'Orden A', 'Orden C']);

      // Un integrante no reordena.
      const a2 = await actual(a.id);
      expect(
        await post(carlos, `/tareas/${a.id}/mover`, {
          version: a2.version,
          antes_id: c.id,
          despues_id: null,
        }),
      ).toMatchObject({ estado: 403 });
    });

    it('mover a otra columna aplica la transición de estado', async () => {
      const t = await deCarlos('habilitada', 'Cambia de columna');
      const r = await post(carlos, `/tareas/${t.id}/mover`, {
        version: t.version,
        antes_id: null,
        despues_id: null,
        estado: 'en_curso',
      });
      expect(r.cuerpo).toMatchObject({ estado: 'en_curso' });
      // Una columna no permitida se rechaza igual que en «cambiar estado».
      const invalido = await post(carlos, `/tareas/${t.id}/mover`, {
        version: r.cuerpo.version,
        antes_id: null,
        despues_id: null,
        estado: 'habilitada',
      });
      expect(invalido.estado).toBe(422);
    });

    it('dos personas mueven la misma tarjeta a la vez: una recibe 409', async () => {
      const t = await deCarlos('habilitada', 'Movida a la vez');
      const mover = { version: t.version, antes_id: null, despues_id: null, estado: 'en_curso' };
      const respuestas = await Promise.all([
        post(lider, `/tareas/${t.id}/mover`, mover),
        post(carlos, `/tareas/${t.id}/mover`, mover),
      ]);
      expect(respuestas.map((r) => r.estado).sort()).toEqual([200, 409]);
      expect(respuestas.find((r) => r.estado === 409)?.cuerpo).toMatchObject({
        codigo: 'conflicto_version',
        mensaje: 'Alguien cambió esta tarea. Recárgala para ver la versión más reciente.',
      });
    });
  });

  describe('editar, comentar, subtareas y eliminar', () => {
    it('el líder edita cualquier tarea; versión vieja → 409', async () => {
      const t = await enBacklog('Para editar');
      const r = await e.pedir(lider, 'PATCH', `${base}/tareas/${t.id}`, {
        version: t.version,
        titulo: 'Editada',
        prioridad: 'alta',
      });
      expect(r.cuerpo).toMatchObject({ titulo: 'Editada', prioridad: 'alta' });
      const vieja = await e.pedir(lider, 'PATCH', `${base}/tareas/${t.id}`, {
        version: t.version,
        titulo: 'Con versión vieja',
      });
      expect(vieja).toMatchObject({ estado: 409, cuerpo: { codigo: 'conflicto_version' } });
    });

    it('el integrante corrige su propuesta y el avance de su tarea, nada más', async () => {
      const suya = await propuesta('Mi propuesta');
      const corregida = await e.pedir(carlos, 'PATCH', `${base}/tareas/${suya.id}`, {
        version: suya.version,
        titulo: 'Mi propuesta corregida',
      });
      expect(corregida.cuerpo.titulo).toBe('Mi propuesta corregida');

      const ajenaTarea = await enBacklog('Del líder');
      const patch = (quien: Cookies, t: { id: string; version: number }, cambios: object) =>
        e.pedir(quien, 'PATCH', `${base}/tareas/${t.id}`, { version: t.version, ...cambios });
      expect(await patch(carlos, ajenaTarea, { titulo: 'Cambiada' })).toMatchObject({
        estado: 403,
        cuerpo: { mensaje: 'Solo el líder puede editar tareas de otras personas.' },
      });
      expect((await patch(daniela, suya, { titulo: 'x' })).estado).toBe(403);
      expect((await patch(invitada, ajenaTarea, { titulo: 'x' })).estado).toBe(403);

      const enCurso = await deCarlos('en_curso');
      expect((await patch(carlos, enCurso, { progreso: 60 })).cuerpo.progreso).toBe(60);
      const t = await actual(enCurso.id);
      expect((await patch(daniela, t, { progreso: 80 })).estado).toBe(403);
      expect((await patch(carlos, t, { titulo: 'No puedo' })).estado).toBe(403);
    });

    it('comentan líder, integrante e invitado con la tarea compartida', async () => {
      const t = await enBacklog('Para comentar');
      const comentar = (quien: Cookies, id = t.id) =>
        post(quien, `/tareas/${id}/comentarios`, { texto: 'Un comentario' });
      expect((await comentar(lider)).estado).toBe(201);
      const deCarlosC = await comentar(carlos);
      expect(deCarlosC.cuerpo).toMatchObject({ autor: { nombre: 'Carlos Ramírez' } });
      // Sin compartir: para la invitada la tarea no existe.
      expect((await comentar(invitada)).estado).toBe(404);
      await e.pedir(lider, 'PUT', `${base}/tareas/${t.id}/compartida`, {
        membresia_ids: [membresiaInvitada],
      });
      expect((await comentar(invitada)).estado).toBe(201);

      // Borrar: cada quien lo suyo; el líder, también lo ajeno.
      const ruta = `${base}/tareas/${t.id}/comentarios/${deCarlosC.cuerpo.id}`;
      expect((await e.pedir(daniela, 'DELETE', ruta)).estado).toBe(404);
      expect((await e.pedir(lider, 'DELETE', ruta)).estado).toBe(204);
    });

    it('las subtareas las gestiona el líder o el responsable', async () => {
      const t = await deCarlos('en_curso');
      const sub = await post(carlos, `/tareas/${t.id}/subtareas`, { titulo: 'Del responsable' });
      expect(sub.estado).toBe(201);
      expect((await post(lider, `/tareas/${t.id}/subtareas`, { titulo: 'Del líder' })).estado).toBe(
        201,
      );
      expect((await post(daniela, `/tareas/${t.id}/subtareas`, { titulo: 'x' })).estado).toBe(403);
      expect((await post(invitada, `/tareas/${t.id}/subtareas`, { titulo: 'x' })).estado).toBe(403);
      const hecha = await e.pedir(
        carlos,
        'PATCH',
        `${base}/tareas/${t.id}/subtareas/${sub.cuerpo.id}`,
        {
          hecha: true,
        },
      );
      expect(hecha.cuerpo).toMatchObject({ hecha: true });
    });

    it('solo el líder elimina', async () => {
      const t = await enBacklog('Para eliminar');
      expect((await e.pedir(carlos, 'DELETE', `${base}/tareas/${t.id}`)).estado).toBe(403);
      expect((await e.pedir(invitada, 'DELETE', `${base}/tareas/${t.id}`)).estado).toBe(403);
      expect((await e.pedir(lider, 'DELETE', `${base}/tareas/${t.id}`)).estado).toBe(204);
      expect((await get(lider, `/tareas/${t.id}`)).estado).toBe(404);
    });
  });

  describe('eventos de dominio y no filtración', () => {
    it('cada cambio deja su evento y su actividad en la misma transacción', async () => {
      const t = await propuesta('Con eventos');
      await post(lider, `/tareas/${t.id}/triaje`, {
        accion: 'aceptar',
        version: t.version,
        responsable_id: ID.carlos,
      });
      await post(carlos, `/tareas/${t.id}/asignacion`, { acepta: true });
      const eventos = await e.db
        .selectFrom('eventos_dominio')
        .select(['tipo', 'procesado_en'])
        .where('objeto_id', '=', t.id)
        .orderBy('id')
        .execute();
      expect(eventos.map((x) => x.tipo)).toEqual([
        'tarea.propuesta',
        'tarea.aceptada',
        'tarea.asignada',
        'tarea.asignacion_aceptada',
      ]);
      expect(eventos.every((x) => x.procesado_en === null)).toBe(true);
      const historial = (await actual(t.id)).historial.map((h) => h.resumen);
      expect(historial).toHaveLength(4);
      expect(historial.at(-1)).toMatch(/^Carlos propuso T-\d+ «Con eventos» \(en triaje\)$/);
    });

    it('un rechazo por permisos no deja eventos ni cambia la tarea', async () => {
      const t = await deCarlos('habilitada', 'Sin efectos');
      const antes = await e.db
        .selectFrom('eventos_dominio')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('objeto_id', '=', t.id)
        .executeTakeFirstOrThrow();
      await post(daniela, `/tareas/${t.id}/estado`, { version: t.version, estado: 'en_curso' });
      await post(lider, `/tareas/${t.id}/estado`, { version: t.version, estado: 'completada' });
      const despues = await e.db
        .selectFrom('eventos_dominio')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('objeto_id', '=', t.id)
        .executeTakeFirstOrThrow();
      expect(despues.n).toBe(antes.n);
      expect((await actual(t.id)).version).toBe(t.version);
    });

    it('quien no pertenece al equipo recibe 404 en todas las rutas', async () => {
      const t = await enBacklog('Invisible para ajenos');
      const v = { version: t.version };
      const intentos: [Parameters<Entorno['pedir']>[1], string, object?][] = [
        ['GET', '/tareas'],
        ['GET', '/tareas/conteos'],
        ['GET', `/tareas/${t.id}`],
        ['POST', '/tareas', { titulo: 'x' }],
        ['PATCH', `/tareas/${t.id}`, { ...v, titulo: 'x' }],
        ['DELETE', `/tareas/${t.id}`],
        ['POST', `/tareas/${t.id}/estado`, { ...v, estado: 'en_curso' }],
        ['POST', `/tareas/${t.id}/mover`, { ...v, antes_id: null, despues_id: null }],
        ['POST', `/tareas/${t.id}/triaje`, { ...v, accion: 'backlog' }],
        ['POST', `/tareas/${t.id}/asignar`, { ...v, responsable_id: null }],
        ['POST', `/tareas/${t.id}/asignacion`, { acepta: true }],
        ['PUT', `/tareas/${t.id}/compartida`, { membresia_ids: [] }],
        ['POST', `/tareas/${t.id}/subtareas`, { titulo: 'x' }],
        ['POST', `/tareas/${t.id}/comentarios`, { texto: 'x' }],
      ];
      for (const [metodo, ruta, cuerpo] of intentos) {
        const r = await e.pedir(ajena, metodo, `${base}${ruta}`, cuerpo);
        expect(r, `${metodo} ${ruta}`).toMatchObject({
          estado: 404,
          cuerpo: { codigo: 'equipo_no_encontrado' },
        });
      }
      // Tampoco alcanza la tarea a través de otro equipo al que sí pertenece.
      const propio = await e.pedir(ajena, 'POST', '/equipos', { nombre: 'Equipo de Paola' });
      const cruzado = await e.pedir(ajena, 'GET', `/equipos/${propio.cuerpo.id}/tareas/${t.id}`);
      expect(cruzado).toMatchObject({ estado: 404, cuerpo: { codigo: 'tarea_no_encontrada' } });
      await e.db.deleteFrom('equipos').where('id', '=', propio.cuerpo.id).execute();
    });
  });
});
