import type { EquipoDetalle, TareaEquipo, TareaEquipoDetalle } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

const ID = {
  carlos: '00000000-0000-4000-8000-000000000002',
  daniela: '00000000-0000-4000-8000-000000000003',
  mariana: '00000000-0000-4000-8000-000000000009',
};

/**
 * Pruebas de la Fase 2 (docs/03, 2.3) y de la votación de la Fase 2.5 (docs/07, sección 1):
 * por cada ruta, un caso permitido y uno prohibido para cada rol. Se usa un equipo propio:
 * Valeria (líder), Carlos y Daniela (integrantes), Mariana (invitada) y Paola (no pertenece).
 * Con 2 integrantes, una propuesta se acepta con 2 votos a favor.
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
  const votar = (quien: Cookies | null, id: string, voto: string, comentario?: string) =>
    post(quien, `/tareas/${id}/voto`, { voto, ...(comentario && { comentario }) });

  /** Propuesta de la líder, en votación. */
  async function propuesta(
    titulo = 'Propuesta de prueba',
    extra: object = {},
  ): Promise<TareaEquipoDetalle> {
    const r = await post(lider, '/tareas', { titulo, ...extra });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.estado).toBe('propuesta');
    return r.cuerpo;
  }
  /** Propuesta aceptada por los dos integrantes: queda «aceptada», en el tablero. */
  async function aceptada(titulo = 'Tarea aceptada', extra: object = {}) {
    const t = await propuesta(titulo, extra);
    await votar(carlos, t.id, 'aceptar');
    const r = await votar(daniela, t.id, 'aceptar');
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo.estado).toBe('aceptada');
    return actual(t.id);
  }
  /** Tarea aceptada que la líder apartó al backlog. */
  async function enBacklog(titulo = 'Tarea de prueba'): Promise<TareaEquipoDetalle> {
    const t = await aceptada(titulo);
    const r = await post(lider, `/tareas/${t.id}/estado`, {
      version: t.version,
      estado: 'backlog',
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    return r.cuerpo;
  }
  /** Tarea en el tablero, de Carlos y con la asignación ya aceptada, en el estado pedido. */
  async function deCarlos(
    estado: 'aceptada' | 'habilitada' | 'en_curso' = 'habilitada',
    titulo = 'Tarea de Carlos',
  ): Promise<TareaEquipoDetalle> {
    const creada = await aceptada(titulo, { responsable_id: ID.carlos });
    expect(creada).toMatchObject({ estado: 'aceptada', asignacion_pendiente: true });
    let t: TareaEquipoDetalle = (
      await post(carlos, `/tareas/${creada.id}/asignacion`, { acepta: true })
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

  /** Une a una persona a un equipo con una invitación de la líder. */
  async function unir(equipo: string, quien: Cookies, datos: object) {
    const inv = await e.pedir(lider, 'POST', `/equipos/${equipo}/invitaciones`, datos);
    const r = await e.pedir(quien, 'POST', `/invitaciones/${inv.cuerpo.codigo}/aceptar`);
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
  }

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
    await unir(equipoId, carlos, { rol_destino: 'integrante' });
    await unir(equipoId, daniela, { rol_destino: 'integrante' });
    await unir(equipoId, invitada, { rol_destino: 'invitado', duracion_invitado_dias: 7 });
    const equipo: EquipoDetalle = (await get(lider, '')).cuerpo;
    membresiaInvitada = equipo.miembros.find((m) => m.rol === 'invitado')?.membresia_id ?? '';
  });

  afterAll(async () => {
    await e.db.deleteFrom('equipos').where('id', '=', equipoId).execute();
    await e.cerrar();
  });

  describe('proponer (EQ-07)', () => {
    it('la líder propone con subtareas y etiquetas: la tarea entra en votación', async () => {
      const r = await post(lider, '/tareas', {
        titulo: 'Con subtareas',
        subtareas: ['Diseñar', 'Programar'],
        etiquetas: ['diseño'],
        responsable_id: ID.daniela,
      });
      expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
      expect(r.cuerpo).toMatchObject({
        estado: 'propuesta',
        origen: 'propuesta',
        proponente: { nombre: 'Valeria Mendoza' },
        responsable: { nombre: 'Daniela Torres' },
        asignacion_pendiente: true,
        etiquetas: ['diseño'],
        subtareas_total: 2,
        votacion: {
          abierta: true,
          total_integrantes: 2,
          necesarios: 2,
          emitidos: 0,
          aceptar: 0,
          rechazar: 0,
          votaron: [],
          mi_voto: null,
        },
      });
      expect(r.cuerpo.subtareas.map((s: { titulo: string }) => s.titulo)).toEqual([
        'Diseñar',
        'Programar',
      ]);
      expect(r.cuerpo.codigo).toBeGreaterThan(0);
    });

    it('un integrante ya no crea ni propone (403); el invitado tampoco; quien no pertenece, 404', async () => {
      expect(await post(carlos, '/tareas', { titulo: 'x' })).toMatchObject({
        estado: 403,
        cuerpo: {
          codigo: 'sin_permiso',
          mensaje:
            'Solo el líder propone tareas; tú votas si se aceptan. Comparte tus ideas en el chat o en los comentarios.',
        },
      });
      expect((await post(invitada, '/tareas', { titulo: 'x' })).estado).toBe(403);
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
    it('líder e integrante ven tablero, backlog y votación; conteos incluidos', async () => {
      await enBacklog('Para conteos');
      await propuesta('Para el conteo de votación');
      for (const quien of [lider, carlos]) {
        for (const vista of ['tablero', 'backlog', 'votacion', 'mias', 'todas']) {
          expect((await get(quien, `/tareas?vista=${vista}`)).estado, vista).toBe(200);
        }
        const conteos = (await get(quien, '/tareas/conteos')).cuerpo;
        expect(conteos.backlog).toBeGreaterThan(0);
        expect(conteos.votacion).toBeGreaterThan(0);
      }
    });

    it('el invitado solo ve lo compartido con él y no tiene backlog ni votación', async () => {
      const compartida = await deCarlos('habilitada', 'Compartida con la invitada');
      const privada = await deCarlos('habilitada', 'No compartida');
      const r = await e.pedir(lider, 'PUT', `${base}/tareas/${compartida.id}/compartida`, {
        membresia_ids: [membresiaInvitada],
      });
      expect(r.cuerpo.compartida_con).toEqual([membresiaInvitada]);

      const lista: Resp<TareaEquipo[]> = await get(invitada, '/tareas?vista=tablero');
      expect(lista.cuerpo.map((t) => t.titulo)).toEqual(['Compartida con la invitada']);
      const vista = await get(invitada, `/tareas/${compartida.id}`);
      expect(vista.estado).toBe(200);
      expect(vista.cuerpo.historial).toEqual([]);
      // La invitada no ve nada de la votación, ni siquiera el conteo.
      expect(vista.cuerpo.votacion).toBeNull();
      expect(await get(invitada, `/tareas/${privada.id}`)).toMatchObject({
        estado: 404,
        cuerpo: { codigo: 'tarea_no_encontrada' },
      });
      for (const v of ['backlog', 'votacion', 'mias']) {
        expect((await get(invitada, `/tareas?vista=${v}`)).estado, v).toBe(403);
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

  describe('votación de propuestas (EQ-05, DEC-024)', () => {
    it('solo votan los integrantes: la líder y la invitada reciben 403', async () => {
      const t = await propuesta('Quién vota');
      expect(await votar(lider, t.id, 'aceptar')).toMatchObject({
        estado: 403,
        cuerpo: {
          codigo: 'sin_permiso',
          mensaje: 'Solo los integrantes votan las propuestas; el líder propone.',
        },
      });
      expect((await votar(invitada, t.id, 'aceptar')).estado).toBe(403);
      expect((await votar(ajena, t.id, 'aceptar')).estado).toBe(404);
      expect((await votar(null, t.id, 'aceptar')).estado).toBe(401);
      expect((await votar(carlos, t.id, 'abstenerse')).estado).toBe(400);
      expect((await actual(t.id)).votacion).toMatchObject({ emitidos: 0, abierta: true });
    });

    it('con 2 integrantes un voto no basta; con el segundo queda aceptada', async () => {
      const t = await propuesta('Mayoría de dos');
      const uno = await votar(carlos, t.id, 'aceptar');
      expect(uno.cuerpo).toMatchObject({
        estado: 'propuesta',
        votacion: { abierta: true, emitidos: 1, aceptar: 1, mi_voto: { voto: 'aceptar' } },
      });
      const dos = await votar(daniela, t.id, 'aceptar');
      expect(dos.cuerpo).toMatchObject({
        estado: 'aceptada',
        votacion: { abierta: false, aceptar: 2, rechazar: 0, votaron: [] },
      });
      // Cerrada la votación ya no se vota.
      expect(await votar(carlos, t.id, 'rechazar')).toMatchObject({
        estado: 422,
        cuerpo: { codigo: 'votacion_cerrada' },
      });
    });

    it('con 3 integrantes se acepta con 2 votos; con 4, con 3', async () => {
      const emilio = await e.entrar(SEMILLA.emilio);
      const ivan = await e.entrar(SEMILLA.ivan);
      const otro = (await e.pedir(lider, 'POST', '/equipos', { nombre: 'Pruebas de mayoría' }))
        .cuerpo.id;
      const rutas = `/equipos/${otro}/tareas`;
      const proponer = async (titulo: string) =>
        (await e.pedir(lider, 'POST', rutas, { titulo })).cuerpo as TareaEquipoDetalle;
      const voto = async (quien: Cookies, id: string) =>
        (await e.pedir(quien, 'POST', `${rutas}/${id}/voto`, { voto: 'aceptar' })).cuerpo.estado;
      try {
        for (const quien of [carlos, daniela, emilio]) {
          await unir(otro, quien, { rol_destino: 'integrante' });
        }
        const tres = await proponer('Con tres integrantes');
        expect(tres.votacion).toMatchObject({ total_integrantes: 3, necesarios: 2 });
        expect(await voto(carlos, tres.id)).toBe('propuesta');
        expect(await voto(daniela, tres.id)).toBe('aceptada');

        await unir(otro, ivan, { rol_destino: 'integrante' });
        const cuatro = await proponer('Con cuatro integrantes');
        expect(cuatro.votacion).toMatchObject({ total_integrantes: 4, necesarios: 3 });
        expect(await voto(carlos, cuatro.id)).toBe('propuesta');
        expect(await voto(daniela, cuatro.id)).toBe('propuesta');
        expect(await voto(emilio, cuatro.id)).toBe('aceptada');
      } finally {
        await e.db.deleteFrom('equipos').where('id', '=', otro).execute();
      }
    });

    it('se puede cambiar el voto mientras siga abierta; el empate no la cierra', async () => {
      const t = await propuesta('Voto cambiado');
      await votar(carlos, t.id, 'aceptar');
      const cambiado = await votar(carlos, t.id, 'rechazar', 'Lo pensé mejor');
      expect(cambiado.cuerpo.votacion).toMatchObject({
        emitidos: 1,
        aceptar: 0,
        rechazar: 1,
        mi_voto: { voto: 'rechazar', comentario: 'Lo pensé mejor' },
      });
      // Uno a favor y uno en contra: empate, sigue en votación (V-4).
      const empate = await votar(daniela, t.id, 'aceptar');
      expect(empate.cuerpo).toMatchObject({
        estado: 'propuesta',
        votacion: { abierta: true, emitidos: 2 },
      });
    });

    it('nadie ve el voto ajeno mientras está abierta: solo el conteo y quién votó (V-8)', async () => {
      const t = await propuesta('Voto secreto');
      await votar(carlos, t.id, 'rechazar', 'COMENTARIO-PRIVADO-DE-CARLOS');
      for (const quien of [daniela, lider]) {
        const detalle = await get(quien, `/tareas/${t.id}`);
        expect(detalle.cuerpo.votacion).toMatchObject({
          abierta: true,
          emitidos: 1,
          rechazar: 1,
          votaron: [{ usuario_id: ID.carlos, nombre: 'Carlos Ramírez' }],
          mi_voto: null,
        });
        expect(Object.keys(detalle.cuerpo.votacion.votaron[0]).sort()).toEqual([
          'nombre',
          'usuario_id',
        ]);
        // Ni el comentario ni la actividad revelan el sentido del voto.
        expect(JSON.stringify(detalle.cuerpo)).not.toContain('COMENTARIO-PRIVADO-DE-CARLOS');
        expect(detalle.cuerpo.historial[0].resumen).toMatch(/^Carlos votó la propuesta T-\d+/);
        const lista: Resp<TareaEquipo[]> = await get(quien, '/tareas?vista=votacion');
        expect(JSON.stringify(lista.cuerpo)).not.toContain('COMENTARIO-PRIVADO-DE-CARLOS');
        expect(lista.cuerpo.find((x) => x.id === t.id)?.votacion).toMatchObject({
          emitidos: 1,
          mi_voto: null,
        });
      }
      // Cada quien sí ve su propio voto, y la propuesta aparece entre «mis votos» (FALT-08).
      expect((await get(carlos, `/tareas/${t.id}`)).cuerpo.votacion.mi_voto).toMatchObject({
        voto: 'rechazar',
        comentario: 'COMENTARIO-PRIVADO-DE-CARLOS',
      });
      const mias: Resp<TareaEquipo[]> = await get(carlos, '/tareas?vista=mias');
      expect(mias.cuerpo.map((x) => x.id)).toContain(t.id);

      // Cerrada, solo queda el conteo final: ya no se dice quién votó.
      await votar(daniela, t.id, 'rechazar');
      const cerrada = (await get(lider, `/tareas/${t.id}`)).cuerpo;
      expect(cerrada).toMatchObject({
        estado: 'rechazada',
        rechazo_por: 'votacion',
        votacion: { abierta: false, aceptar: 0, rechazar: 2, votaron: [] },
      });
    });

    it('rechazada por mayoría: la líder la reformula como una propuesta nueva', async () => {
      const t = await propuesta('Para rechazar');
      await votar(carlos, t.id, 'rechazar');
      const r = await votar(daniela, t.id, 'rechazar');
      expect(r.cuerpo).toMatchObject({ estado: 'rechazada', rechazo_por: 'votacion' });
      expect(r.cuerpo.motivo).toBe('Rechazada por mayoría (2 de 2)');

      const cuerpo = { titulo: 'Para rechazar, versión 2', subtareas: ['Acotar el alcance'] };
      expect((await post(carlos, `/tareas/${t.id}/reformular`, cuerpo)).estado).toBe(403);
      expect((await post(invitada, `/tareas/${t.id}/reformular`, cuerpo)).estado).toBe(403);
      const nueva = await post(lider, `/tareas/${t.id}/reformular`, cuerpo);
      expect(nueva.estado, JSON.stringify(nueva.cuerpo)).toBe(201);
      expect(nueva.cuerpo).toMatchObject({
        estado: 'propuesta',
        titulo: 'Para rechazar, versión 2',
        subtareas_total: 1,
        votacion: { abierta: true, emitidos: 0 },
      });
      expect(nueva.cuerpo.id).not.toBe(t.id);
      // La anterior se conserva como historial, con sus votos.
      expect(await actual(t.id)).toMatchObject({ estado: 'rechazada', votacion: { rechazar: 2 } });
      // Una tarea que sí prosperó no se reformula.
      const viva = await aceptada('No se reformula');
      expect(await post(lider, `/tareas/${viva.id}/reformular`, cuerpo)).toMatchObject({
        estado: 422,
        cuerpo: { codigo: 'transicion_invalida' },
      });
    });

    it('la líder retira una propuesta en votación; nadie más puede', async () => {
      const t = await propuesta('Para retirar');
      const cuerpo = { version: t.version };
      expect(await post(carlos, `/tareas/${t.id}/retirar`, cuerpo)).toMatchObject({
        estado: 403,
        cuerpo: { mensaje: 'Solo el líder puede retirar o reformular propuestas.' },
      });
      expect((await post(invitada, `/tareas/${t.id}/retirar`, cuerpo)).estado).toBe(403);
      expect(
        await post(lider, `/tareas/${t.id}/retirar`, { version: t.version + 7 }),
      ).toMatchObject({
        estado: 409,
        cuerpo: { codigo: 'conflicto_version', detalles: { version_actual: t.version } },
      });
      const r = await post(lider, `/tareas/${t.id}/retirar`, cuerpo);
      expect(r.cuerpo).toMatchObject({ estado: 'cancelada', votacion: { abierta: false } });
      expect((await votar(carlos, t.id, 'aceptar')).estado).toBe(422);
      // Retirada dos veces: ya no está en votación.
      expect(
        (await post(lider, `/tareas/${t.id}/retirar`, { version: r.cuerpo.version })).estado,
      ).toBe(422);
    });
  });

  describe('backlog y tablero', () => {
    it('la líder aparta una tarea aceptada al backlog y la regresa; un integrante no', async () => {
      const t = await aceptada('Va y vuelve');
      const alBacklog = { version: t.version, estado: 'backlog' };
      expect((await post(carlos, `/tareas/${t.id}/estado`, alBacklog)).estado).toBe(403);
      const b = await post(lider, `/tareas/${t.id}/estado`, alBacklog);
      expect(b.cuerpo).toMatchObject({ estado: 'backlog', sprint_id: null });
      const r = await post(lider, `/tareas/${t.id}/estado`, {
        version: b.cuerpo.version,
        estado: 'aceptada',
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

    it('mientras sigue en votación no se cambia el responsable (422)', async () => {
      const t = await propuesta('Aún en votación');
      const r = await post(lider, `/tareas/${t.id}/asignar`, {
        version: t.version,
        responsable_id: ID.carlos,
      });
      expect(r).toMatchObject({ estado: 422, cuerpo: { codigo: 'transicion_invalida' } });
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

    it('rechazar exige motivo; la líder reasigna directamente, sin nueva votación (V-11)', async () => {
      const creada = await aceptada('Asignación rechazada', { responsable_id: ID.carlos });
      const id = creada.id;
      expect(
        (await post(carlos, `/tareas/${id}/asignacion`, { acepta: false })).cuerpo.mensaje,
      ).toBe('Explica por qué rechazas la asignación.');
      const r = await post(carlos, `/tareas/${id}/asignacion`, {
        acepta: false,
        motivo: 'Estoy saturado',
      });
      // La tarea sigue aceptada: solo se queda sin responsable.
      expect(r.cuerpo).toMatchObject({
        estado: 'aceptada',
        responsable: null,
        asignacion_pendiente: false,
      });
      expect(r.cuerpo.historial[0].resumen).toMatch(/rechazó la asignación.*«Estoy saturado»/);

      const reasignada = await post(lider, `/tareas/${id}/asignar`, {
        version: r.cuerpo.version,
        responsable_id: ID.daniela,
      });
      expect(reasignada.cuerpo).toMatchObject({
        estado: 'aceptada',
        asignacion_pendiente: true,
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

    it('una propuesta no cambia de estado a mano: la resuelve la votación (422)', async () => {
      const t = await propuesta('No se mueve a mano');
      const r = await post(lider, `/tareas/${t.id}/estado`, {
        version: t.version,
        estado: 'aceptada',
      });
      expect(r).toMatchObject({
        estado: 422,
        cuerpo: { mensaje: 'Las propuestas se resuelven por votación de los integrantes.' },
      });
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
      const creada = await aceptada('Sin aceptar', { responsable_id: ID.carlos });
      const habilitada = await post(lider, `/tareas/${creada.id}/estado`, {
        version: creada.version,
        estado: 'habilitada',
      });
      const r = await post(carlos, `/tareas/${creada.id}/estado`, {
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

    it('el integrante solo actualiza el avance de su tarea: no edita propuestas ni tareas ajenas', async () => {
      const patch = (quien: Cookies, t: { id: string; version: number }, cambios: object) =>
        e.pedir(quien, 'PATCH', `${base}/tareas/${t.id}`, { version: t.version, ...cambios });
      const enVotacion = await propuesta('Propuesta de la líder');
      expect(await patch(carlos, enVotacion, { titulo: 'Cambiada' })).toMatchObject({
        estado: 403,
        cuerpo: { mensaje: 'Solo el líder puede editar tareas de otras personas.' },
      });
      const ajenaTarea = await enBacklog('Del líder');
      expect((await patch(daniela, ajenaTarea, { titulo: 'x' })).estado).toBe(403);
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
      const t = await aceptada('Con eventos', { responsable_id: ID.carlos });
      await post(carlos, `/tareas/${t.id}/asignacion`, { acepta: true });
      const eventos = await e.db
        .selectFrom('eventos_dominio')
        .select(['tipo', 'procesado_en', 'carga'])
        .where('objeto_id', '=', t.id)
        .orderBy('id')
        .execute();
      expect(eventos.map((x) => x.tipo)).toEqual([
        'tarea.propuesta',
        'tarea.votada',
        'tarea.votada',
        'tarea.aceptada_por_votacion',
        'tarea.asignacion_aceptada',
      ]);
      expect(eventos.every((x) => x.procesado_en === null)).toBe(true);
      // El evento del voto no dice si fue a favor o en contra.
      expect(JSON.stringify(eventos[1]?.carga)).not.toMatch(/aceptar|rechazar/);
      const historial = (await actual(t.id)).historial.map((h) => h.resumen);
      expect(historial).toHaveLength(5);
      expect(historial.at(-1)).toMatch(/^Valeria propuso T-\d+ «Con eventos» \(en votación\)$/);
      expect(historial).toContain(
        `El equipo aceptó T-${String(t.codigo).padStart(2, '0')} «Con eventos» por mayoría (2 de 2)`,
      );
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
      await votar(lider, t.id, 'aceptar');
      await votar(carlos, t.id, 'aceptar');
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
        ['POST', `/tareas/${t.id}/voto`, { voto: 'aceptar' }],
        ['POST', `/tareas/${t.id}/retirar`, v],
        ['POST', `/tareas/${t.id}/reformular`, { titulo: 'x' }],
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

  describe('reglas duplicadas entre TypeScript y la BD (DEC-025)', () => {
    it('la mayoría de la votación es la misma en packages/shared y en fn_votacion_resultado', async () => {
      const { resultadoVotacion } = await import('@nexo/shared');
      const { sql } = await import('kysely');
      for (let n = 0; n <= 8; n++) {
        for (let a = 0; a <= n; a++) {
          for (let r = 0; a + r <= n; r++) {
            const fila = await sql<{
              x: string;
            }>`select fn_votacion_resultado(${a}::int, ${r}::int, ${n}::int) as x`.execute(e.db);
            expect(fila.rows[0]?.x, `${a} a favor, ${r} en contra, ${n}`).toBe(
              resultadoVotacion(a, r, n),
            );
          }
        }
      }
    });

    it('la máquina de estados es la misma en estados.ts y en la tabla transiciones_estado', async () => {
      const { TRANSICIONES } = await import('@nexo/shared');
      const deTs = Object.entries(TRANSICIONES)
        .flatMap(([desde, destinos]) =>
          Object.entries(destinos ?? {}).flatMap(([hacia, quienes]) =>
            (quienes ?? []).map((quien) => `${desde} → ${hacia} (${quien})`),
          ),
        )
        .sort();
      const filas = await e.db
        .selectFrom('transiciones_estado')
        .select(['desde', 'hacia', 'quien'])
        .execute();
      const deBd = filas.map((f) => `${f.desde} → ${f.hacia} (${f.quien})`).sort();
      expect(deBd).toEqual(deTs);
      expect(deBd.length).toBeGreaterThan(10);
    });

    it('con el rol nexo_app la API solo puede ejecutar procesos: no lee tablas', async () => {
      const { sql } = await import('kysely');
      // Un proceso sí funciona…
      await e.db.transaction().execute(async (tx) => {
        await sql`set local role nexo_app`.execute(tx);
        const ok = await sql<{ x: { recibido: boolean } }>`
          select proc_contacto_enviar('Ana', 'ana@prueba.mx', 'Duda', 'Mensaje enviado como nexo_app') as x
        `.execute(tx);
        expect(ok.rows[0]?.x.recibido).toBe(true);
      });
      // …pero no las tablas, las vistas, las auxiliares ni los procesos de desarrollo.
      for (const consulta of [
        sql`select * from tareas limit 1`,
        sql`select * from v_tareas_semaforo limit 1`,
        sql`update usuarios set nombre = 'Intruso'`,
        sql`select fn_integrantes_activos(gen_random_uuid())`,
        sql`select proc_dev_usuarios()`,
      ]) {
        const codigo = await e.db
          .transaction()
          .execute(async (tx) => {
            await sql`set local role nexo_app`.execute(tx);
            await consulta.execute(tx);
            return 'permitido';
          })
          .catch((error: { code?: string }) => error.code);
        // 42501 = insufficient_privilege
        expect(codigo).toBe('42501');
      }
    });

    it('el índice fraccionario de la BD da las mismas claves que la librería', async () => {
      const { generateKeyBetween } = await import('fractional-indexing');
      const { sql } = await import('kysely');
      const entre = async (a: string | null, b: string | null) =>
        (await sql<{ k: string }>`select fn_orden_entre(${a}::text, ${b}::text) as k`.execute(e.db))
          .rows[0]?.k;
      // Recorrido determinista: insertar al final, al principio y en medio muchas veces.
      const claves: string[] = [];
      let semilla = 7;
      const azar = (n: number) => (semilla = (semilla * 1103515245 + 12345) % 2147483648) % n;
      for (let i = 0; i < 120; i++) {
        const pos = azar(claves.length + 1);
        const a = claves[pos - 1] ?? null;
        const b = claves[pos] ?? null;
        const esperada = generateKeyBetween(a, b);
        expect(await entre(a, b), `entre ${a} y ${b}`).toBe(esperada);
        claves.splice(pos, 0, esperada);
      }
      // Extremos: siempre al principio y siempre al final.
      let primero: string | null = null;
      let ultimo: string | null = null;
      for (let i = 0; i < 70; i++) {
        primero = generateKeyBetween(null, primero);
        ultimo = generateKeyBetween(ultimo, null);
      }
      expect(await entre(null, primero)).toBe(generateKeyBetween(null, primero));
      expect(await entre(ultimo, null)).toBe(generateKeyBetween(ultimo, null));
    });
  });
});
