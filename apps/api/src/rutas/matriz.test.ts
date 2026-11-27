import { ACCIONES, puede, type Accion, type ContextoPermiso, type Perfil } from '@nexo/shared';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearEntorno, DATABASE_URL, type Cookies, type Entorno } from '../pruebas/ayudas';
import { COOKIE_SESION } from '../sesiones';

/**
 * Fase 5.3 · QA de permisos: recorre **todas** las filas de la matriz (`packages/shared/src/permisos.ts`,
 * docs/01 2.2) contra la API real, para los cuatro perfiles más una persona ajena al equipo.
 *
 * Cada «sonda» es una petición real. Se considera **permitida** si la API no responde 401, 403 ni 404, y
 * **prohibida** si responde 403 o 404 (la API usa 404 para no revelar lo que no se puede ver). Para no
 * cambiar datos, casi todas mandan un cuerpo inválido (la guardia de permisos va antes de validar: 400 =
 * pasó la guardia) o una versión vieja (409 = pasó la guardia). Todo ocurre en un equipo creado para la
 * prueba, con cuentas creadas por `/auth/registro`, que se borran al final: la semilla no se toca.
 */

type Rol = Exclude<Perfil, 'personal'>;
type Quien = Rol | 'ajeno';
interface Sonda {
  metodo: NonNullable<InjectOptions['method']>;
  url: string;
  cuerpo?: object;
  /** Contexto del objeto para las reglas (p) y (c). */
  ctx?: Omit<ContextoPermiso, 'perfil'>;
}

/** Acciones sin ruta en esta rama, con el motivo. La prueba exige que cada acción tenga sonda o motivo. */
const SIN_RUTA: Partial<Record<Accion, string>> = {};

/** En el espacio personal solo algunas acciones tienen ruta propia; las demás son de la interfaz. */
const PERSONAL_SOLO_INTERFAZ: Partial<Record<Accion, string>> = {
  asignar_responsable: 'En lo personal la persona es siempre la responsable.',
  habilitar_tarea:
    'Cambiar de estado una tarea personal es un PATCH de la tarea (cambiar_estado_tarea).',
  adjuntar_archivos: 'Sin archivos personales todavía (fase posterior).',
  crear_reunion: 'Sin reuniones personales todavía (fase posterior, PER-04).',
  exportar_reportes: 'El reporte personal (FALT-01) no tiene exportación.',
  crear_plantilla: 'Las plantillas son del equipo.',
  usar_plantilla: 'Las plantillas son del equipo.',
  ver_calendario: 'El calendario personal sale de /personal/tareas (ver_resumen).',
};

describe.skipIf(!DATABASE_URL)('matriz de permisos completa contra la API (5.3)', () => {
  let e: Entorno;
  const marca = `matriz-${Date.now()}`;
  const cookies = {} as Record<Quien | 'extra', Cookies>;
  const ids = {} as Record<Quien | 'extra', string>;
  let E = '';
  const obj: Record<string, string> = {};

  const pedir = async (quien: Cookies, s: Sonda) => {
    const r = await e.app.inject({
      method: s.metodo,
      url: s.url,
      cookies: quien,
      payload: s.cuerpo,
    });
    const esJson = String(r.headers['content-type'] ?? '').includes('json');
    return {
      estado: r.statusCode,
      cuerpo: r.body && esJson ? (r.json() as Record<string, unknown>) : null,
    };
  };
  const exigir = async (quien: Cookies, s: Sonda, esperado: number[]) => {
    const r = await pedir(quien, s);
    if (!esperado.includes(r.estado)) {
      throw new Error(`${s.metodo} ${s.url} → ${r.estado} ${JSON.stringify(r.cuerpo)}`);
    }
    // justificado: cuerpo JSON de la API en la preparación; cada uso toma el campo que necesita.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return r.cuerpo as any;
  };

  beforeAll(async () => {
    e = await crearEntorno();
    for (const quien of ['lider', 'integrante', 'invitado', 'ajeno', 'extra'] as const) {
      const r = await e.app.inject({
        method: 'POST',
        url: '/auth/registro',
        payload: {
          nombre: `Matriz ${quien}`,
          correo: `${marca}-${quien}@nexo.test`,
          contrasena: 'Matriz-2026!',
        },
      });
      if (r.statusCode !== 201) throw new Error(`registro ${quien}: ${r.body}`);
      cookies[quien] = { [COOKIE_SESION]: r.cookies.find((c) => c.name === COOKIE_SESION)!.value };
      ids[quien] = r.json().usuario.id;
    }
    const L = cookies.lider;
    E = `/equipos/${(await exigir(L, { metodo: 'POST', url: '/equipos', cuerpo: { nombre: 'Equipo matriz' } }, [201])).id}`;

    // Integrantes (el principal y uno extra para expulsar) e invitado, por invitación.
    for (const [quien, cuerpo] of [
      ['integrante', { rol_destino: 'integrante' }],
      ['extra', { rol_destino: 'integrante' }],
      ['invitado', { rol_destino: 'invitado', duracion_invitado_dias: 7 }],
    ] as const) {
      const inv = await exigir(L, { metodo: 'POST', url: `${E}/invitaciones`, cuerpo }, [201]);
      await exigir(
        cookies[quien],
        { metodo: 'POST', url: `/invitaciones/${inv.codigo}/aceptar` },
        [200],
      );
    }
    const miembros = (await exigir(
      L,
      { metodo: 'GET', url: `${E}/miembros` },
      [200],
    )) as unknown as {
      membresia_id: string;
      usuario_id: string;
    }[];
    const mem = (u: string) => miembros.find((m) => m.usuario_id === u)!.membresia_id;
    obj.mInvitado = mem(ids.invitado);
    obj.mExtra = mem(ids.extra);

    // Tareas: tP en votación; tA del integrante (aceptada y asumida); tL sin responsable, compartida con
    // el invitado. Con 2 integrantes la mayoría son 2 votos.
    const proponer = async (titulo: string, responsable: string | null) =>
      (
        await exigir(
          L,
          { metodo: 'POST', url: `${E}/tareas`, cuerpo: { titulo, responsable_id: responsable } },
          [201],
        )
      ).id as string;
    const aceptarPorVoto = async (t: string) => {
      for (const q of ['integrante', 'extra'] as const) {
        await exigir(
          cookies[q],
          { metodo: 'POST', url: `${E}/tareas/${t}/voto`, cuerpo: { voto: 'aceptar' } },
          [200],
        );
      }
    };
    obj.tP = await proponer('En votación', null);
    obj.tA = await proponer('Del integrante', ids.integrante);
    await aceptarPorVoto(obj.tA);
    await exigir(
      cookies.integrante,
      { metodo: 'POST', url: `${E}/tareas/${obj.tA}/asignacion`, cuerpo: { acepta: true } },
      [200],
    );
    obj.tL = await proponer('Compartida', null);
    await aceptarPorVoto(obj.tL);
    await exigir(
      L,
      {
        metodo: 'PUT',
        url: `${E}/tareas/${obj.tL}/compartida`,
        cuerpo: { membresia_ids: [obj.mInvitado] },
      },
      [200],
    );

    // Chat: canales del equipo y un mensaje del integrante.
    const convs = (await exigir(
      L,
      { metodo: 'GET', url: `${E}/chat/conversaciones` },
      [200],
    )) as unknown as {
      id: string;
      tipo: string;
    }[];
    obj.cEquipo = convs.find((c) => c.tipo === 'equipo')!.id;
    obj.cInvitados = convs.find((c) => c.tipo === 'invitados')!.id;
    obj.msg = (
      await exigir(
        cookies.integrante,
        {
          metodo: 'POST',
          url: `/chat/conversaciones/${obj.cEquipo}/mensajes`,
          cuerpo: { texto: 'Hola' },
        },
        [201],
      )
    ).id;

    // Una plantilla del equipo y una tarea personal de la persona ajena (su espacio personal).
    obj.plantilla = (
      await exigir(
        L,
        {
          metodo: 'POST',
          url: `${E}/plantillas`,
          cuerpo: { nombre: 'P', tipo: 'proyecto', elementos: ['Paso'] },
        },
        [201],
      )
    ).id;
    obj.tPersonal = (
      await exigir(
        cookies.ajeno,
        { metodo: 'POST', url: '/personal/tareas', cuerpo: { titulo: 'Mía' } },
        [201],
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    if (E) await e.db.deleteFrom('equipos').where('id', '=', E.split('/')[2]!).execute();
    await e.db.deleteFrom('usuarios').where('correo', 'like', `${marca}-%`).execute();
    await e.cerrar();
  });

  const v = '00000000-0000-4000-8000-0000000000aa'; // id con buen formato que no existe
  const sondas = (): Partial<Record<Accion, Sonda[]>> => ({
    ver_resumen: [
      { metodo: 'GET', url: `${E}/tareas/${obj.tL}`, ctx: { esCompartido: true } },
      { metodo: 'GET', url: `${E}/tareas/${obj.tP}`, ctx: { esCompartido: false } },
    ],
    crear_tarea: [
      { metodo: 'POST', url: `${E}/tareas`, cuerpo: {} },
      // «Usar» una plantilla de proyecto propone sus tareas: es crear tareas (DEC-033, DEC-024).
      { metodo: 'POST', url: `${E}/plantillas/${obj.plantilla}/usar` },
    ],
    votar_propuesta: [{ metodo: 'POST', url: `${E}/tareas/${obj.tP}/voto`, cuerpo: {} }],
    retirar_propuesta: [{ metodo: 'POST', url: `${E}/tareas/${obj.tP}/retirar`, cuerpo: {} }],
    asignar_responsable: [{ metodo: 'POST', url: `${E}/tareas/${obj.tL}/asignar`, cuerpo: {} }],
    responder_asignacion: [{ metodo: 'POST', url: `${E}/tareas/${obj.tA}/asignacion`, cuerpo: {} }],
    habilitar_tarea: [
      {
        metodo: 'POST',
        url: `${E}/tareas/${obj.tL}/estado`,
        cuerpo: { version: 999, estado: 'habilitada' },
      },
    ],
    cambiar_estado_tarea: [
      {
        metodo: 'POST',
        url: `${E}/tareas/${obj.tA}/estado`,
        cuerpo: { version: 999, estado: 'en_curso' },
        ctx: { esPropio: true },
      },
      {
        metodo: 'POST',
        url: `${E}/tareas/${obj.tL}/estado`,
        cuerpo: { version: 999, estado: 'en_curso' },
        ctx: { esPropio: false },
      },
    ],
    editar_tarea_ajena: [
      { metodo: 'PATCH', url: `${E}/tareas/${obj.tL}`, cuerpo: { version: 999, titulo: 'x' } },
    ],
    comentar: [
      // Con texto válido: si la tarea no está compartida, la regla (c) la aplica el servicio.
      {
        metodo: 'POST',
        url: `${E}/tareas/${obj.tL}/comentarios`,
        cuerpo: { texto: 'Sonda' },
        ctx: { esCompartido: true },
      },
      {
        metodo: 'POST',
        url: `${E}/tareas/${obj.tP}/comentarios`,
        cuerpo: { texto: 'Sonda' },
        ctx: { esCompartido: false },
      },
    ],
    adjuntar_archivos: [{ metodo: 'POST', url: `${E}/archivos`, cuerpo: {} }],
    chat_equipo: [{ metodo: 'GET', url: `/chat/conversaciones/${obj.cEquipo}/mensajes` }],
    chat_tarea: [
      {
        metodo: 'POST',
        url: `${E}/chat/tareas/${obj.tL}/conversacion`,
        ctx: { esCompartido: true },
      },
      {
        metodo: 'POST',
        url: `${E}/chat/tareas/${obj.tP}/conversacion`,
        ctx: { esCompartido: false },
      },
    ],
    mensajes_directos: [{ metodo: 'POST', url: `${E}/chat/dm`, cuerpo: { usuario_id: ids.extra } }],
    moderar_chat: [
      { metodo: 'POST', url: `/chat/mensajes/${obj.msg}/fijar`, cuerpo: { fijado: true } },
    ],
    crear_reunion: [{ metodo: 'POST', url: `${E}/reuniones`, cuerpo: {}, ctx: { esPropio: true } }],
    gestionar_sprints: [{ metodo: 'POST', url: `${E}/sprints`, cuerpo: {} }],
    moderar_retro: [{ metodo: 'POST', url: `${E}/sprints/${v}/retro/avanzar`, cuerpo: {} }],
    participar_retro: [{ metodo: 'POST', url: `${E}/sprints/${v}/retro/notas`, cuerpo: {} }],
    ver_reportes: [{ metodo: 'GET', url: `${E}/reportes`, ctx: { esPropio: true } }],
    exportar_reportes: [
      { metodo: 'GET', url: `${E}/reportes/exportar?solo_mias=true`, ctx: { esPropio: true } },
      { metodo: 'GET', url: `${E}/reportes/exportar?solo_mias=false`, ctx: { esPropio: false } },
    ],
    invitar_personas: [{ metodo: 'POST', url: `${E}/invitaciones`, cuerpo: {} }],
    convertir_invitado: [
      { metodo: 'POST', url: `${E}/miembros/${obj.mInvitado}/invitado`, cuerpo: {} },
    ],
    transferir_liderazgo: [{ metodo: 'POST', url: `${E}/liderazgo/transferencias`, cuerpo: {} }],
    votar_eleccion: [{ metodo: 'POST', url: `${E}/liderazgo/eleccion/${v}/voto`, cuerpo: {} }],
    archivar_equipo: [{ metodo: 'POST', url: `${E}/archivar`, cuerpo: {} }],
    ver_actividad: [{ metodo: 'GET', url: `${E}/actividad` }],
    crear_plantilla: [
      { metodo: 'POST', url: `${E}/plantillas`, cuerpo: {}, ctx: { esPropio: true } },
    ],
    // Ver las plantillas (y leer las guías de sprint y retro); convertirlas en tareas es crear_tarea.
    usar_plantilla: [{ metodo: 'GET', url: `${E}/plantillas`, ctx: { esPropio: true } }],
    ver_miembros: [{ metodo: 'GET', url: `${E}/miembros` }],
    ver_calendario: [
      {
        metodo: 'GET',
        url: `${E}/calendario?desde=2026-11-01T00:00:00.000Z&hasta=2026-12-01T00:00:00.000Z`,
      },
    ],
    ver_archivos: [{ metodo: 'GET', url: `${E}/archivos` }],
    ver_sprints: [{ metodo: 'GET', url: `${E}/sprints` }],
    ver_backlog: [{ metodo: 'GET', url: `${E}/tareas?vista=backlog` }],
    configurar_equipo: [{ metodo: 'PATCH', url: `${E}/configuracion`, cuerpo: {} }],
    canal_invitados: [{ metodo: 'GET', url: `/chat/conversaciones/${obj.cInvitados}/mensajes` }],
    configurar_whatsapp: [{ metodo: 'GET', url: `${E}/whatsapp` }],
    enviar_cola_whatsapp: [
      { metodo: 'POST', url: `${E}/whatsapp/cola/enviar`, cuerpo: { ids: ['no-es-uuid'] } },
    ],
    ver_historial_whatsapp: [{ metodo: 'GET', url: `${E}/whatsapp/historial` }],
    // Las dos que cambian la membresía van al final (orden de abajo).
    expulsar_miembros: [{ metodo: 'POST', url: `${E}/miembros/${obj.mExtra}/expulsar` }],
    salir_equipo: [{ metodo: 'POST', url: `${E}/salir` }],
  });

  /** Sondas del espacio personal (perfil «personal»): la persona ajena en su propio espacio. */
  const sondasPersonales = (): Partial<Record<Accion, Sonda[]>> => ({
    ver_resumen: [{ metodo: 'GET', url: '/personal/tareas' }],
    crear_tarea: [{ metodo: 'POST', url: '/personal/tareas', cuerpo: {} }],
    cambiar_estado_tarea: [
      {
        metodo: 'PATCH',
        url: `/personal/tareas/${obj.tPersonal}`,
        cuerpo: { version: 999, estado: 'en_curso' },
      },
    ],
    comentar: [
      { metodo: 'POST', url: `/personal/tareas/${obj.tPersonal}/comentarios`, cuerpo: {} },
    ],
    ver_reportes: [{ metodo: 'GET', url: '/personal/reporte', ctx: { esPropio: true } }],
  });

  it('cada acción de la matriz tiene una sonda o un motivo escrito', () => {
    const s = sondas();
    const sinCubrir = ACCIONES.filter((a) => !s[a] && !SIN_RUTA[a]);
    expect(sinCubrir).toEqual([]);
  });

  it('la API coincide con la matriz para líder, integrante, invitado y una persona ajena', async () => {
    const s = sondas();
    // Las que cambian la membresía, al final y en este orden: primero intentan los demás.
    const finales: Accion[] = ['expulsar_miembros', 'salir_equipo'];
    const orden = [...ACCIONES.filter((a) => !finales.includes(a)), ...finales];
    const fallos: string[] = [];
    let revisadas = 0;
    for (const accion of orden) {
      for (const sonda of s[accion] ?? []) {
        // El líder va al final de cada sonda: si la acción cambia algo, que sea después de los demás.
        for (const quien of ['ajeno', 'invitado', 'integrante', 'lider'] as const) {
          // En salir_equipo, el líder no puede irse mientras haya integrantes: va antes que ellos.
          const esperado =
            quien === 'ajeno' ? false : puede(accion, { perfil: quien, ...sonda.ctx }).permitido;
          const r = await pedir(cookies[quien], sonda);
          const permitido = ![401, 403, 404].includes(r.estado);
          revisadas++;
          if (permitido !== esperado) {
            fallos.push(
              `${accion} · ${quien} · ${sonda.metodo} ${sonda.url.replace(E, 'E')} → ${r.estado} (esperado ${esperado ? 'permitido' : 'prohibido'}) ${JSON.stringify(r.cuerpo).slice(0, 160)}`,
            );
          }
        }
      }
    }
    expect(fallos, fallos.join('\n')).toEqual([]);
    expect(revisadas).toBeGreaterThan(150);
  }, 120_000);

  it('perfil personal: las acciones con ruta propia coinciden con la matriz', async () => {
    const s = sondasPersonales();
    const fallos: string[] = [];
    for (const accion of ACCIONES) {
      const regla = puede(accion, { perfil: 'personal', esPropio: true }).permitido;
      if (!regla) continue; // «na»/«no» en lo personal: no hay ruta que probar
      if (!s[accion] && !PERSONAL_SOLO_INTERFAZ[accion]) {
        fallos.push(`${accion}: permitida en lo personal sin sonda ni motivo`);
        continue;
      }
      for (const sonda of s[accion] ?? []) {
        const r = await pedir(cookies.ajeno, sonda);
        if ([401, 403, 404].includes(r.estado)) fallos.push(`${accion} → ${r.estado}`);
      }
    }
    expect(fallos, fallos.join('\n')).toEqual([]);
  });

  it('no filtración: quien no es del equipo recibe 404 en todas las lecturas', async () => {
    const lecturas = [
      `${E}`,
      `${E}/tareas`,
      `${E}/tareas/${obj.tL}`,
      `${E}/tareas/conteos`,
      `${E}/miembros`,
      `${E}/archivos`,
      `${E}/actividad`,
      `${E}/reportes`,
      `${E}/calendario?desde=2026-11-01T00:00:00.000Z&hasta=2026-12-01T00:00:00.000Z`,
      `${E}/sprints`,
      `${E}/plantillas`,
      `${E}/liderazgo`,
      `${E}/configuracion`,
      `${E}/chat/conversaciones`,
      `${E}/chat/buscar?q=hola`,
      `/chat/conversaciones/${obj.cEquipo}/mensajes`,
      `/chat/conversaciones/${obj.cInvitados}/mensajes`,
      `/chat/conversaciones/${obj.cEquipo}/miembros`,
      `/chat/mensajes/${obj.msg}/hilo`,
      `${E}/whatsapp`,
      `${E}/whatsapp/cola`,
      `${E}/whatsapp/historial`,
      `${E}/solicitudes`,
    ];
    for (const url of lecturas) {
      const r = await e.app.inject({ method: 'GET', url, cookies: cookies.ajeno });
      expect(r.statusCode, url).toBe(404);
    }
  });
});
