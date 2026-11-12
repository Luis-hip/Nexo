import type { TareaPersonal, TareaPersonalDetalle, Yo } from '@nexo/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../app';
import { cargarConfig } from '../config';
import { crearBaseDatos, type BaseDatos } from '../db/conexion';
import { COOKIE_SESION } from '../sesiones';

// Pruebas de integración: necesitan una BD migrada y sembrada (`pnpm db:reset`; la CI lo hace).
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('espacio personal', () => {
  let db: BaseDatos;
  let app: FastifyInstance;
  let paola: Record<string, string>;
  let valeria: Record<string, string>;
  const creadas: string[] = [];

  async function entrar(email: string) {
    const r = await app.inject({ method: 'POST', url: '/dev/login', payload: { email } });
    const cookie = r.cookies.find((c) => c.name === COOKIE_SESION);
    return { [COOKIE_SESION]: cookie?.value ?? '' };
  }

  async function crearTarea(cookies: Record<string, string>, payload: object) {
    const r = await app.inject({ method: 'POST', url: '/personal/tareas', cookies, payload });
    expect(r.statusCode).toBe(201);
    const tarea = r.json<TareaPersonalDetalle>();
    creadas.push(tarea.id);
    return tarea;
  }

  beforeAll(async () => {
    const config = cargarConfig({ DATABASE_URL, NODE_ENV: 'test', DEV_LOGIN_ENABLED: 'true' });
    db = crearBaseDatos(config.DATABASE_URL);
    app = await crearApp(config, db);
    paola = await entrar('paola.reyes@nexo.mx');
    valeria = await entrar('valeria@nexo.mx');
  });

  afterAll(async () => {
    if (creadas.length) await db.deleteFrom('tareas').where('id', 'in', creadas).execute();
    // La semilla no trae etiquetas personales: todas las que queden son de estas pruebas.
    await db.deleteFrom('etiquetas').where('usuario_id', 'is not', null).execute();
    await app.close();
    await db.destroy();
  });

  describe('sesión', () => {
    it('sin sesión responde 401 con el formato de error', async () => {
      for (const url of ['/yo', '/personal/tareas']) {
        const r = await app.inject({ method: 'GET', url });
        expect(r.statusCode).toBe(401);
        expect(r.json()).toMatchObject({ codigo: 'no_autenticado' });
      }
    });

    it('GET /yo devuelve el usuario, sus equipos y su perfil en cada uno', async () => {
      const lider = (await app.inject({ method: 'GET', url: '/yo', cookies: valeria })).json<Yo>();
      expect(lider.usuario.correo).toBe('valeria@nexo.mx');
      expect(lider.equipos).toEqual([
        expect.objectContaining({ nombre: 'Equipo Nexo', rol: 'lider' }),
      ]);

      const sola = (await app.inject({ method: 'GET', url: '/yo', cookies: paola })).json<Yo>();
      expect(sola.usuario.nombre).toBe('Paola Reyes');
      expect(sola.equipos).toEqual([]);
    });

    it('POST /salir revoca la sesión: el mismo token deja de servir', async () => {
      const cookies = await entrar('ivan@nexo.mx');
      expect((await app.inject({ method: 'GET', url: '/yo', cookies })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/salir', cookies })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/yo', cookies })).statusCode).toBe(401);
    });
  });

  describe('tareas personales', () => {
    it('lista las tareas de la semilla con su semáforo', async () => {
      const r = await app.inject({ method: 'GET', url: '/personal/tareas', cookies: paola });
      expect(r.statusCode).toBe(200);
      const tareas = r.json<TareaPersonal[]>();
      const practica = tareas.find((t) => t.titulo === 'Entregar práctica de Redes');
      expect(practica).toMatchObject({ estado: 'en_curso', prioridad: 'alta', semaforo: 'ambar' });
    });

    it('crea, edita, completa y borra una tarea', async () => {
      const tarea = await crearTarea(paola, {
        titulo: '  Leer el capítulo 3  ',
        prioridad: 'baja',
        etiquetas: ['Lectura', 'lectura', 'redes'],
      });
      expect(tarea).toMatchObject({
        titulo: 'Leer el capítulo 3',
        estado: 'backlog',
        version: 1,
        etiquetas: ['Lectura', 'redes'],
      });
      expect(tarea.codigo).toBeGreaterThan(0);

      const url = `/personal/tareas/${tarea.id}`;
      const editada = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 1, titulo: 'Leer el capítulo 4', estado: 'en_curso', progreso: 40 },
      });
      expect(editada.json()).toMatchObject({
        titulo: 'Leer el capítulo 4',
        estado: 'en_curso',
        progreso: 40,
        version: 2,
      });

      const completada = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 2, estado: 'completada' },
      });
      expect(completada.json()).toMatchObject({
        estado: 'completada',
        progreso: 100,
        resultado: 'a_tiempo',
        semaforo: 'verde',
        version: 3,
      });
      expect(completada.json<TareaPersonal>().completada_en).not.toBeNull();

      const reabierta = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 3, estado: 'en_curso' },
      });
      expect(reabierta.json()).toMatchObject({
        estado: 'en_curso',
        resultado: null,
        completada_en: null,
      });

      expect((await app.inject({ method: 'DELETE', url, cookies: paola })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url, cookies: paola })).statusCode).toBe(404);
    });

    it('completar después del plazo deja el resultado «con retraso»', async () => {
      const tarea = await crearTarea(paola, {
        titulo: 'Tarea vencida',
        vence_en: new Date(Date.now() - 86_400_000).toISOString(),
      });
      expect(tarea.semaforo).toBe('rojo');
      const r = await app.inject({
        method: 'PATCH',
        url: `/personal/tareas/${tarea.id}`,
        cookies: paola,
        payload: { version: tarea.version, estado: 'completada' },
      });
      expect(r.json()).toMatchObject({ resultado: 'con_retraso', semaforo: 'ambar' });
    });

    it('guardar con una versión vieja devuelve 409', async () => {
      const tarea = await crearTarea(paola, { titulo: 'Concurrencia' });
      const url = `/personal/tareas/${tarea.id}`;
      const primera = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 1, titulo: 'Primera edición' },
      });
      expect(primera.statusCode).toBe(200);
      const segunda = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 1, titulo: 'Edición con versión vieja' },
      });
      expect(segunda.statusCode).toBe(409);
      expect(segunda.json()).toMatchObject({
        codigo: 'conflicto_version',
        detalles: { version_actual: 2 },
      });
    });

    it('valida la entrada: título vacío y atascar sin motivo', async () => {
      const vacio = await app.inject({
        method: 'POST',
        url: '/personal/tareas',
        cookies: paola,
        payload: { titulo: '   ' },
      });
      expect(vacio.statusCode).toBe(400);
      expect(vacio.json()).toMatchObject({ codigo: 'validacion', mensaje: 'Escribe un título.' });

      const tarea = await crearTarea(paola, { titulo: 'Para atascar' });
      const url = `/personal/tareas/${tarea.id}`;
      const sinMotivo = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 1, estado: 'atascada' },
      });
      expect(sinMotivo.statusCode).toBe(400);
      const conMotivo = await app.inject({
        method: 'PATCH',
        url,
        cookies: paola,
        payload: { version: 1, estado: 'atascada', motivo: 'Falta el libro' },
      });
      expect(conMotivo.json()).toMatchObject({ estado: 'atascada', motivo: 'Falta el libro' });
    });

    it('filtra por estado, etiqueta y texto', async () => {
      const tarea = await crearTarea(paola, {
        titulo: 'Filtro único xyz',
        etiquetas: ['filtro-xyz'],
      });
      const consulta = async (qs: string) =>
        (await app.inject({ method: 'GET', url: `/personal/tareas?${qs}`, cookies: paola }))
          .json<TareaPersonal[]>()
          .map((t) => t.id);

      expect(await consulta('etiqueta=filtro-xyz')).toEqual([tarea.id]);
      expect(await consulta('q=único xyz')).toEqual([tarea.id]);
      expect(await consulta('estado=backlog')).toContain(tarea.id);
      expect(await consulta('estado=en_curso&estado=completada')).not.toContain(tarea.id);
    });

    it('subtareas y comentarios propios', async () => {
      const tarea = await crearTarea(paola, { titulo: 'Con subtareas' });
      const base = `/personal/tareas/${tarea.id}`;
      const sub = await app.inject({
        method: 'POST',
        url: `${base}/subtareas`,
        cookies: paola,
        payload: { titulo: 'Paso 1' },
      });
      expect(sub.statusCode).toBe(201);
      const hecha = await app.inject({
        method: 'PATCH',
        url: `${base}/subtareas/${sub.json().id}`,
        cookies: paola,
        payload: { hecha: true },
      });
      expect(hecha.json()).toMatchObject({ titulo: 'Paso 1', hecha: true });

      const comentario = await app.inject({
        method: 'POST',
        url: `${base}/comentarios`,
        cookies: paola,
        payload: { texto: 'Nota para mí' },
      });
      expect(comentario.statusCode).toBe(201);

      const detalle = (
        await app.inject({ method: 'GET', url: base, cookies: paola })
      ).json<TareaPersonalDetalle>();
      expect(detalle).toMatchObject({ subtareas_total: 1, subtareas_hechas: 1 });
      expect(detalle.comentarios.map((c) => c.texto)).toEqual(['Nota para mí']);
    });
  });

  describe('privacidad: otra persona no puede ver ni tocar mis tareas', () => {
    it('no aparecen en su lista y cada ruta responde 404', async () => {
      const tarea = await crearTarea(paola, { titulo: 'Privada de Paola' });
      const base = `/personal/tareas/${tarea.id}`;

      const lista = await app.inject({ method: 'GET', url: '/personal/tareas', cookies: valeria });
      expect(lista.json<TareaPersonal[]>().map((t) => t.titulo)).not.toContain('Privada de Paola');
      expect(
        lista.json<TareaPersonal[]>().every((t) => t.titulo !== 'Entregar práctica de Redes'),
      ).toBe(true);

      const intentos = [
        { method: 'GET', url: base },
        { method: 'PATCH', url: base, payload: { version: 1, titulo: 'Hackeada' } },
        { method: 'DELETE', url: base },
        { method: 'POST', url: `${base}/subtareas`, payload: { titulo: 'x' } },
        { method: 'POST', url: `${base}/comentarios`, payload: { texto: 'x' } },
      ] as const;
      for (const intento of intentos) {
        const r = await app.inject({ ...intento, cookies: valeria });
        expect(r.statusCode, `${intento.method} ${intento.url}`).toBe(404);
        expect(r.json()).toMatchObject({ codigo: 'tarea_no_encontrada' });
      }

      const intacta = await app.inject({ method: 'GET', url: base, cookies: paola });
      expect(intacta.json()).toMatchObject({ titulo: 'Privada de Paola', version: 1 });
    });

    it('las etiquetas personales tampoco se comparten', async () => {
      await crearTarea(paola, { titulo: 'Con etiqueta', etiquetas: ['solo-paola'] });
      const mias = await app.inject({ method: 'GET', url: '/personal/etiquetas', cookies: paola });
      const suyas = await app.inject({
        method: 'GET',
        url: '/personal/etiquetas',
        cookies: valeria,
      });
      expect(mias.json()).toContain('solo-paola');
      expect(suyas.json()).not.toContain('solo-paola');
    });
  });
});
