import type { AjustesUsuario } from '@nexo/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, SEMILLA, type Cookies, type Entorno } from '../pruebas/ayudas';

/** Ajustes de la persona (PF-04, PF-06) y reporte personal (FALT-01). */
describe.skipIf(!DATABASE_URL)('ajustes y reporte personal', () => {
  let e: Entorno;
  let paola: Cookies;
  let carlos: Cookies;

  beforeAll(async () => {
    e = await crearEntorno();
    paola = await e.entrar(SEMILLA.paola);
    carlos = await e.entrar(SEMILLA.carlos);
  });
  afterAll(async () => {
    await e.db.deleteFrom('preferencias_notificacion').execute();
    await e.cerrar();
  });

  it('sin sesión no hay ajustes (401)', async () => {
    expect((await e.pedir(null, 'GET', '/yo/ajustes')).estado).toBe(401);
    expect((await e.pedir(null, 'GET', '/personal/reporte')).estado).toBe(401);
  });

  it('cada persona guarda sus avisos, silencio y privacidad', async () => {
    const r = await e.pedir(paola, 'PATCH', '/yo/ajustes', {
      silencio_desde: '22:00',
      silencio_hasta: '07:00',
      estado_visible: false,
      notificaciones: [
        { evento: 'reunion', por_app: false, por_whatsapp: true, por_correo: false },
      ],
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(200);
    const a: AjustesUsuario = r.cuerpo;
    expect(a).toMatchObject({ silencio_desde: '22:00', estado_visible: false });
    expect(a.notificaciones.find((n) => n.evento === 'reunion')).toMatchObject({ por_app: false });
    const deCarlos: AjustesUsuario = (await e.pedir(carlos, 'GET', '/yo/ajustes')).cuerpo;
    expect(deCarlos.notificaciones.every((n) => n.por_app)).toBe(true);
  });

  it('valida en la API: silencio completo y horas válidas (400)', async () => {
    const incompleto = await e.pedir(paola, 'PATCH', '/yo/ajustes', { silencio_desde: '22:00' });
    expect(incompleto.estado).toBe(400);
    const mala = await e.pedir(paola, 'PATCH', '/yo/ajustes', {
      silencio_desde: '25:00',
      silencio_hasta: '07:00',
    });
    expect(mala.estado).toBe(400);
  });

  it('el reporte personal junta lo personal y lo de cada equipo', async () => {
    const r = await e.pedir(carlos, 'GET', '/personal/reporte');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.por_espacio.some((x: { nombre: string }) => x.nombre === 'Equipo Nexo')).toBe(
      true,
    );
    const p = await e.pedir(paola, 'GET', '/personal/reporte');
    expect(p.cuerpo.por_espacio).toEqual([
      expect.objectContaining({ equipo_id: null, nombre: 'Espacio personal' }),
    ]);
  });
});
