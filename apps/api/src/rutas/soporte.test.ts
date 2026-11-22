import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  crearEntorno,
  DATABASE_URL,
  entrarComoSoporte,
  SEMILLA,
  type Cookies,
  type Entorno,
} from '../pruebas/ayudas';

/** Rol de soporte (docs/15_Rol_Soporte.md; migración 0040). */
describe.skipIf(!DATABASE_URL)('rol de soporte por la API', () => {
  let e: Entorno;
  let soporte: Cookies;
  let sinDosPasos: Cookies;
  let persona: Cookies;
  const marca = Date.now();
  const correoPersona = `persona-sop-${marca}@nexo.test`;

  beforeAll(async () => {
    e = await crearEntorno();
    soporte = await entrarComoSoporte(e, `soporte-${marca}@nexo.test`);
    sinDosPasos = await entrarComoSoporte(e, `soporte-sin2fa-${marca}@nexo.test`, undefined, false);
    persona = await e.entrar(SEMILLA.daniela);
    await e.app.inject({
      method: 'POST',
      url: '/auth/registro',
      payload: {
        nombre: 'Persona Ayuda',
        correo: correoPersona,
        contrasena: 'Contraseña-segura-1',
      },
    });
  });
  afterAll(async () => {
    await e.db.deleteFrom('usuarios').where('correo', 'like', '%-sop-%@nexo.test').execute();
    await e.db.deleteFrom('usuarios').where('correo', 'like', 'soporte-%@nexo.test').execute();
    await e.db.deleteFrom('usuarios').where('correo', 'like', 'nuevo-sop-%@nexo.test').execute();
    await e.cerrar();
  });

  it('la sesión dice que es soporte; una persona y un soporte sin 2FA no usan el tablero', async () => {
    expect((await e.pedir(soporte, 'GET', '/yo')).cuerpo.usuario.tipo_cuenta).toBe('soporte');
    expect((await e.pedir(persona, 'GET', '/soporte/plataforma')).estado).toBe(403);
    const sin = await e.pedir(sinDosPasos, 'GET', '/soporte/plataforma');
    expect(sin.estado).toBe(403);
    expect(sin.cuerpo.codigo).toBe('dos_pasos_requerido');
  });

  it('cifras de la plataforma sin datos personales', async () => {
    const r = await e.pedir(soporte, 'GET', '/soporte/plataforma');
    expect(r.estado).toBe(200);
    expect(r.cuerpo.cuentas).toBeGreaterThan(0);
    expect(r.cuerpo.altas_por_semana).toHaveLength(8);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/@/);
  });

  it('no puede crear equipos ni tareas personales', async () => {
    expect(
      (await e.pedir(soporte, 'POST', '/equipos', { nombre: 'Equipo de soporte' })).estado,
    ).toBe(403);
    expect(
      (await e.pedir(soporte, 'POST', '/personal/tareas', { titulo: 'Una tarea' })).estado,
    ).toBe(403);
  });

  it('ayuda con cuentas: busca por correo exacto, reenvía la verificación y desbloquea; queda en la bitácora', async () => {
    const r = await e.pedir(
      soporte,
      'GET',
      `/soporte/cuentas?correo=${encodeURIComponent(correoPersona.toUpperCase())}`,
    );
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({
      correo: correoPersona,
      correo_verificado: false,
      equipos_activos: 0,
    });
    expect(r.cuerpo).not.toHaveProperty('tareas');
    expect((await e.pedir(soporte, 'GET', '/soporte/cuentas?correo=persona-sop')).estado).toBe(404);
    const antes = e.correos.length;
    const v = await e.pedir(soporte, 'POST', `/soporte/cuentas/${r.cuerpo.id}/verificacion`);
    expect(v.cuerpo).toEqual({ enviado: true });
    expect(
      e.correos
        .slice(antes)
        .some((c) => c.para === correoPersona && c.texto.includes('/verificar?token=')),
    ).toBe(true);
    await e.db
      .updateTable('usuarios')
      .set({ bloqueado_hasta: new Date(Date.now() + 600_000) })
      .where('correo', '=', correoPersona)
      .execute();
    const d = await e.pedir(soporte, 'POST', `/soporte/cuentas/${r.cuerpo.id}/desbloquear`);
    expect(d.cuerpo.bloqueada_hasta).toBeNull();
    const b = await e.pedir(soporte, 'GET', '/soporte/bitacora');
    const acciones = b.cuerpo.map((x: { accion: string }) => x.accion);
    expect(acciones).toEqual(
      expect.arrayContaining(['buscar_cuenta', 'reenviar_verificacion', 'desbloquear']),
    );
  });

  it('alta de otra cuenta de soporte: enlace para elegir contraseña y aparece en el equipo; una persona no puede', async () => {
    const correo = `nuevo-sop-${marca}@nexo.test`;
    expect(
      (await e.pedir(persona, 'POST', '/soporte/equipo', { correo, nombre: 'Nueva' })).estado,
    ).toBe(403);
    const r = await e.pedir(soporte, 'POST', '/soporte/equipo', {
      correo,
      nombre: 'Nueva Soporte',
    });
    expect(r.estado, JSON.stringify(r.cuerpo)).toBe(201);
    expect(r.cuerpo.enlace).toMatch(/\/restablecer\?token=/);
    const repetido = await e.pedir(soporte, 'POST', '/soporte/equipo', {
      correo: correoPersona,
      nombre: 'Otra',
    });
    expect(repetido.estado).toBe(409);
    const equipo = await e.pedir(soporte, 'GET', '/soporte/equipo');
    expect(equipo.cuerpo.find((m: { correo: string }) => m.correo === correo)).toMatchObject({
      activa: false,
      dos_pasos: false,
    });
    // La persona nueva elige su contraseña con el enlace y ya puede entrar (y deberá activar la 2FA).
    const token = new URL(r.cuerpo.enlace).searchParams.get('token');
    const ok = await e.app.inject({
      method: 'POST',
      url: '/auth/restablecer',
      payload: { token, contrasena: 'Contraseña-soporte-1' },
    });
    expect(ok.statusCode, ok.body).toBe(200);
    const entra = await e.app.inject({
      method: 'POST',
      url: '/auth/entrar',
      payload: { correo, contrasena: 'Contraseña-soporte-1' },
    });
    expect(entra.json().usuario.tipo_cuenta).toBe('soporte');
  });
});
