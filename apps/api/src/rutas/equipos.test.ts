import type { EquipoDetalle, Invitacion, Yo } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

describe.skipIf(!DATABASE_URL)('equipos e invitaciones', () => {
  let e: Entorno;
  let valeria: Cookies; // líder del equipo de la semilla
  let carlos: Cookies; // integrante del equipo de la semilla
  let mariana: Cookies; // invitada del equipo de la semilla
  let paola: Cookies; // sin equipo
  let hilda: Cookies;
  const creados: string[] = [];

  const base = `/equipos/${SEMILLA.equipo}`;

  /** Crea un equipo de prueba (se borra al terminar). */
  async function nuevoEquipo(lider: Cookies, datos: object = {}) {
    const r = await e.pedir(lider, 'POST', '/equipos', { nombre: 'Equipo de prueba', ...datos });
    expect(r.estado).toBe(201);
    creados.push(r.cuerpo.id);
    return r.cuerpo.id as string;
  }
  async function invitar(lider: Cookies, equipoId: string, datos: object) {
    const r = await e.pedir(lider, 'POST', `/equipos/${equipoId}/invitaciones`, datos);
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    return r.cuerpo as Invitacion;
  }

  beforeAll(async () => {
    e = await crearEntorno();
    valeria = await e.entrar(SEMILLA.valeria);
    carlos = await e.entrar(SEMILLA.carlos);
    mariana = await e.entrar(SEMILLA.mariana);
    paola = await e.entrar(SEMILLA.paola);
    hilda = await e.entrar('hilda@nexo.mx');
  });

  afterAll(async () => {
    if (creados.length) await e.db.deleteFrom('equipos').where('id', 'in', creados).execute();
    await e.db.deleteFrom('invitaciones').where('equipo_id', '=', SEMILLA.equipo).execute();
    // Quita lo que estas pruebas agregaron al equipo de la semilla (Paola como invitada).
    await e.db
      .deleteFrom('membresias')
      .where('equipo_id', '=', SEMILLA.equipo)
      .where('usuario_id', '=', '00000000-0000-4000-8000-000000000011')
      .execute();
    await e.cerrar();
  });

  describe('crear equipo (PER-06)', () => {
    it('quien lo crea queda como líder con el color 0 y aparece en /yo', async () => {
      const id = await nuevoEquipo(paola, {
        nombre: '  Tesis 2026 ',
        descripcion: 'Grupo de tesis',
      });
      const equipo = (await e.pedir(paola, 'GET', `/equipos/${id}`)).cuerpo as EquipoDetalle;
      expect(equipo).toMatchObject({
        nombre: 'Tesis 2026',
        mi_rol: 'lider',
        max_miembros: 8,
        miembros_activos: 1,
        invitados_activos: 0,
      });
      expect(equipo.miembros).toEqual([
        expect.objectContaining({ nombre: 'Paola Reyes', rol: 'lider', color_idx: 0 }),
      ]);
      const yo = (await e.pedir(paola, 'GET', '/yo')).cuerpo as Yo;
      expect(yo.equipos).toContainEqual(expect.objectContaining({ id, rol: 'lider' }));
    });

    it('valida el nombre y el tope de miembros (nunca más de 8)', async () => {
      const corto = await e.pedir(paola, 'POST', '/equipos', { nombre: 'A' });
      expect(corto).toMatchObject({ estado: 400, cuerpo: { codigo: 'validacion' } });
      const muchos = await e.pedir(paola, 'POST', '/equipos', {
        nombre: 'Grande',
        max_miembros: 9,
      });
      expect(muchos.estado).toBe(400);
      expect(muchos.cuerpo.mensaje).toBe('Un equipo admite hasta 8 miembros.');
    });

    it('exige sesión', async () => {
      expect((await e.pedir(null, 'POST', '/equipos', { nombre: 'Sin sesión' })).estado).toBe(401);
    });
  });

  describe('ver un equipo', () => {
    it('líder e integrante ven miembros y sprints; el invitado, no', async () => {
      const lider = (await e.pedir(valeria, 'GET', base)).cuerpo as EquipoDetalle;
      expect(lider).toMatchObject({ mi_rol: 'lider', miembros_activos: 8, invitados_activos: 2 });
      expect(lider.miembros).toHaveLength(10);
      expect(lider.sprints.map((s) => s.estado)).toEqual(['activo', 'planificado']);

      const integrante = (await e.pedir(carlos, 'GET', base)).cuerpo as EquipoDetalle;
      expect(integrante.mi_rol).toBe('integrante');
      expect(integrante.miembros).toHaveLength(10);

      const invitada = (await e.pedir(mariana, 'GET', base)).cuerpo as EquipoDetalle;
      expect(invitada).toMatchObject({ mi_rol: 'invitado', miembros: [], sprints: [] });
      expect(invitada.lider?.nombre).toBe('Valeria Mendoza');
    });

    it('quien no pertenece recibe 404, como si el equipo no existiera', async () => {
      for (const ruta of [base, `${base}/miembros`, `${base}/invitaciones`]) {
        const r = await e.pedir(paola, 'GET', ruta);
        expect(r, ruta).toMatchObject({ estado: 404, cuerpo: { codigo: 'equipo_no_encontrado' } });
      }
    });

    it('la lista de miembros: líder e integrante sí, invitado no', async () => {
      expect((await e.pedir(valeria, 'GET', `${base}/miembros`)).estado).toBe(200);
      expect((await e.pedir(carlos, 'GET', `${base}/miembros`)).estado).toBe(200);
      const r = await e.pedir(mariana, 'GET', `${base}/miembros`);
      expect(r).toMatchObject({
        estado: 403,
        cuerpo: { mensaje: 'Los invitados no ven la lista completa de miembros.' },
      });
    });

    it('un invitado con el acceso caducado recibe 403 acceso_caducado', async () => {
      const jorge = await e.entrar(SEMILLA.jorge);
      const where = (q: ReturnType<typeof e.db.updateTable<'membresias'>>) =>
        q
          .where('equipo_id', '=', SEMILLA.equipo)
          .where('usuario_id', '=', '00000000-0000-4000-8000-000000000010');
      await where(e.db.updateTable('membresias'))
        .set({ caduca_en: new Date(Date.now() - 60_000) })
        .execute();
      const r = await e.pedir(jorge, 'GET', base);
      expect(r).toMatchObject({ estado: 403, cuerpo: { codigo: 'acceso_caducado' } });
      await where(e.db.updateTable('membresias'))
        .set({ caduca_en: new Date(Date.now() + 2 * 86_400_000) })
        .execute();
    });
  });

  describe('invitaciones (AD-02, AD-03)', () => {
    it('solo el líder invita: integrante e invitado reciben 403 con el motivo', async () => {
      const datos = { rol_destino: 'integrante' };
      for (const quien of [carlos, mariana]) {
        const crear = await e.pedir(quien, 'POST', `${base}/invitaciones`, datos);
        expect(crear).toMatchObject({
          estado: 403,
          cuerpo: { codigo: 'sin_permiso', mensaje: 'Solo el líder puede invitar personas.' },
        });
        expect((await e.pedir(quien, 'GET', `${base}/invitaciones`)).estado).toBe(403);
      }
      const inv = await invitar(valeria, SEMILLA.equipo, datos);
      expect(inv.codigo).toMatch(/^NX[A-Z2-9]-[A-Z2-9]{4}$/);
      expect(inv).toMatchObject({ rol_destino: 'integrante', estado: 'pendiente' });
      expect((await e.pedir(valeria, 'GET', `${base}/invitaciones`)).cuerpo).toContainEqual(
        expect.objectContaining({ codigo: inv.codigo }),
      );
    });

    it('invitar a un invitado exige la duración de su acceso', async () => {
      const r = await e.pedir(valeria, 'POST', `${base}/invitaciones`, { rol_destino: 'invitado' });
      expect(r.estado).toBe(400);
      expect(r.cuerpo.mensaje).toBe('Elige cuánto dura el acceso del invitado.');
    });
  });

  describe('unirse con un código (PER-07)', () => {
    it('la vista previa muestra equipo, líder y rol; admite el enlace y minúsculas', async () => {
      const id = await nuevoEquipo(valeria, { nombre: 'Vista previa' });
      const inv = await invitar(valeria, id, { rol_destino: 'integrante' });
      const enlace = encodeURIComponent(`https://nexo.mx/invitacion/${inv.codigo.toLowerCase()}`);
      const r = await e.pedir(paola, 'GET', `/invitaciones/${enlace}`);
      expect(r.estado).toBe(200);
      expect(r.cuerpo).toMatchObject({
        codigo: inv.codigo,
        equipo: { id, nombre: 'Vista previa' },
        lider: 'Valeria Mendoza',
        miembros_activos: 1,
        rol_destino: 'integrante',
        ya_miembro: false,
      });
    });

    it('al unirse recibe un color libre y distinto; la invitación es de un solo uso', async () => {
      const id = await nuevoEquipo(valeria, { nombre: 'Unirse' });
      const inv = await invitar(valeria, id, { rol_destino: 'integrante' });
      const r = await e.pedir(paola, 'POST', `/invitaciones/${inv.codigo}/aceptar`);
      expect(r).toMatchObject({ estado: 200, cuerpo: { equipo_id: id, rol: 'integrante' } });

      const equipo = (await e.pedir(paola, 'GET', `/equipos/${id}`)).cuerpo as EquipoDetalle;
      expect(equipo.mi_rol).toBe('integrante');
      expect(equipo.miembros.map((m) => [m.nombre, m.color_idx])).toEqual([
        ['Valeria Mendoza', 0],
        ['Paola Reyes', 1],
      ]);

      const otraVez = await e.pedir(hilda, 'POST', `/invitaciones/${inv.codigo}/aceptar`);
      expect(otraVez).toMatchObject({ estado: 410, cuerpo: { codigo: 'invitacion_usada' } });
    });

    it('quien ya pertenece recibe 409 ya_miembro', async () => {
      const id = await nuevoEquipo(valeria, { nombre: 'Ya miembro' });
      const inv = await invitar(valeria, id, { rol_destino: 'integrante' });
      const r = await e.pedir(valeria, 'POST', `/invitaciones/${inv.codigo}/aceptar`);
      expect(r).toMatchObject({ estado: 409, cuerpo: { codigo: 'ya_miembro' } });
    });

    it('invitaciones inválidas: inexistente 404; revocada y caducada 410, con su motivo', async () => {
      const id = await nuevoEquipo(valeria, { nombre: 'Inválidas' });
      const inexistente = await e.pedir(paola, 'GET', '/invitaciones/NXZ-0000');
      expect(inexistente).toMatchObject({
        estado: 404,
        cuerpo: { codigo: 'invitacion_no_existe' },
      });

      const revocada = await invitar(valeria, id, { rol_destino: 'integrante' });
      const rev = await e.pedir(
        valeria,
        'POST',
        `/equipos/${id}/invitaciones/${revocada.id}/revocar`,
      );
      expect(rev).toMatchObject({ estado: 200, cuerpo: { estado: 'revocada' } });
      expect(
        await e.pedir(paola, 'POST', `/invitaciones/${revocada.codigo}/aceptar`),
      ).toMatchObject({
        estado: 410,
        cuerpo: { codigo: 'invitacion_revocada' },
      });

      const caducada = await invitar(valeria, id, { rol_destino: 'integrante' });
      await e.db
        .updateTable('invitaciones')
        .set({ caduca_en: new Date(Date.now() - 1000) })
        .where('id', '=', caducada.id)
        .execute();
      for (const metodo of ['GET', 'POST'] as const) {
        const ruta = `/invitaciones/${caducada.codigo}${metodo === 'POST' ? '/aceptar' : ''}`;
        expect(await e.pedir(paola, metodo, ruta)).toMatchObject({
          estado: 410,
          cuerpo: {
            codigo: 'invitacion_caducada',
            mensaje: 'Esta invitación caducó. Pide una nueva al líder del equipo.',
          },
        });
      }
    });
  });

  describe('tope de miembros: lo hace cumplir la BD (NX001)', () => {
    it('un equipo con 8 miembros activos rechaza al noveno con el mensaje traducido', async () => {
      const inv = await invitar(valeria, SEMILLA.equipo, { rol_destino: 'integrante' });
      const r = await e.pedir(paola, 'POST', `/invitaciones/${inv.codigo}/aceptar`);
      expect(r).toMatchObject({
        estado: 409,
        cuerpo: { codigo: 'equipo_lleno', mensaje: 'El equipo ya tiene 8 miembros.' },
      });
      // La invitación no se gastó: el rechazo deshizo toda la transacción.
      const lista = (await e.pedir(valeria, 'GET', `${base}/invitaciones`)).cuerpo as Invitacion[];
      expect(lista.find((i) => i.id === inv.id)?.estado).toBe('pendiente');
    });

    it('los invitados no cuentan: entra uno más con el cupo lleno y con caducidad', async () => {
      const inv = await invitar(valeria, SEMILLA.equipo, {
        rol_destino: 'invitado',
        duracion_invitado_dias: 14,
      });
      const r = await e.pedir(paola, 'POST', `/invitaciones/${inv.codigo}/aceptar`);
      expect(r).toMatchObject({ estado: 200, cuerpo: { rol: 'invitado' } });
      const yo = (await e.pedir(paola, 'GET', '/yo')).cuerpo as Yo;
      const m = yo.equipos.find((x) => x.id === SEMILLA.equipo);
      expect(m).toMatchObject({ rol: 'invitado', color_idx: null });
      const dias = (new Date(m?.caduca_en ?? 0).getTime() - Date.now()) / 86_400_000;
      expect(dias).toBeGreaterThan(13.9);
      expect(dias).toBeLessThan(14.1);
    });

    it('dos personas que se unen a la vez al último lugar: entra una sola', async () => {
      const id = await nuevoEquipo(valeria, { nombre: 'Último lugar', max_miembros: 2 });
      const [a, b] = await Promise.all([
        invitar(valeria, id, { rol_destino: 'integrante' }),
        invitar(valeria, id, { rol_destino: 'integrante' }),
      ]);
      // Dos conexiones simultáneas compiten por el único lugar libre.
      const respuestas = await Promise.all([
        e.pedir(paola, 'POST', `/invitaciones/${a.codigo}/aceptar`),
        e.pedir(hilda, 'POST', `/invitaciones/${b.codigo}/aceptar`),
      ]);
      expect(respuestas.map((r) => r.estado).sort()).toEqual([200, 409]);
      expect(respuestas.find((r) => r.estado === 409)?.cuerpo).toMatchObject({
        codigo: 'equipo_lleno',
        mensaje: 'El equipo ya tiene 2 miembros.',
      });
      const equipo = (await e.pedir(valeria, 'GET', `/equipos/${id}`)).cuerpo as EquipoDetalle;
      expect(equipo.miembros_activos).toBe(2);
    });
  });
});
