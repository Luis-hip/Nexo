import { describe, expect, it } from 'vitest';
import { ACCIONES, MATRIZ_PERMISOS, PERFILES, puede, type Accion } from './permisos';

/**
 * Copia literal de la tabla de docs/01_Contexto_y_Especificaciones.md, sección 2.2.
 * Una fila de la tabla = un caso. Columnas: Personal | Líder | Integrante | Invitado.
 * ✔ sí · ✖ no · (p) solo lo propio · (c) solo lo compartido · — no aplica.
 */
const TABLA: [Accion, string, string, string, string][] = [
  ['ver_resumen', '✔', '✔', '✔', '(c)'],
  ['crear_tarea', '✔', '✔', '✖', '✖'],
  ['proponer_tarea', '—', '—', '✔', '✖'],
  ['triaje', '—', '✔', '✖', '✖'],
  ['asignar_responsable', '✔', '✔', '✖', '✖'],
  ['responder_asignacion', '—', '✔', '✔', '✖'],
  ['habilitar_tarea', '✔', '✔', '✖', '✖'],
  ['cambiar_estado_tarea', '✔', '✔', '(p)', '✖'],
  ['editar_tarea_ajena', '—', '✔', '✖', '✖'],
  ['comentar', '✔', '✔', '✔', '(c)'],
  ['adjuntar_archivos', '✔', '✔', '✔', '✖'],
  ['chat_equipo', '—', '✔', '✔', '✖'],
  ['chat_tarea', '—', '✔', '✔', '(c)'],
  ['mensajes_directos', '—', '✔', '✔', '✖'],
  ['moderar_chat', '—', '✔', '✖', '✖'],
  ['crear_reunion', '(p)', '✔', '✔', '✖'],
  ['gestionar_sprints', '—', '✔', '✖', '✖'],
  ['moderar_retro', '—', '✔', '✖', '✖'],
  ['participar_retro', '—', '✔', '✔', '✖'],
  ['ver_reportes', '(p)', '✔', '✔', '✖'],
  ['exportar_reportes', '(p)', '✔', '(p)', '✖'],
  ['configurar_whatsapp', '—', '✔', '✖', '✖'],
  ['enviar_cola_whatsapp', '—', '✔', '✖', '✖'],
  ['ver_historial_whatsapp', '—', '✔', '✔', '✖'],
  ['invitar_personas', '—', '✔', '✖', '✖'],
  ['expulsar_miembros', '—', '✔', '✖', '✖'],
  ['convertir_invitado', '—', '✔', '✖', '✖'],
  ['transferir_liderazgo', '—', '✔', '✖', '✖'],
  ['votar_eleccion', '—', '✖', '✔', '✖'],
  ['salir_equipo', '—', '✔', '✔', '✔'],
];

const casos = TABLA.flatMap(([accion, ...celdas]) =>
  PERFILES.map((perfil, i) => ({ accion, perfil, celda: celdas[i] as string })),
);

describe('matriz de permisos (docs/01, 2.2)', () => {
  it('la tabla de la prueba cubre las 30 filas de docs/01, en orden', () => {
    expect(TABLA).toHaveLength(30);
    expect(TABLA.map(([a]) => a)).toEqual(ACCIONES.slice(0, 30));
  });

  it('las acciones adicionales del prototipo nunca dan acceso a un invitado salvo su canal', () => {
    const extras = ACCIONES.slice(30);
    expect(extras).toHaveLength(10);
    for (const accion of extras) {
      const r = puede(accion, { perfil: 'invitado', esPropio: true, esCompartido: true });
      expect(r.permitido, accion).toBe(accion === 'canal_invitados');
    }
  });

  it.each(casos)('$accion · $perfil → $celda', ({ accion, perfil, celda }) => {
    const sinContexto = puede(accion, { perfil }).permitido;
    const propio = puede(accion, { perfil, esPropio: true }).permitido;
    const compartido = puede(accion, { perfil, esCompartido: true }).permitido;
    const ajeno = puede(accion, { perfil, esPropio: false, esCompartido: false }).permitido;

    switch (celda) {
      case '✔':
        expect([sinContexto, propio, compartido, ajeno]).toEqual([true, true, true, true]);
        break;
      case '✖':
      case '—':
        expect([sinContexto, propio, compartido, ajeno]).toEqual([false, false, false, false]);
        break;
      case '(p)':
        expect([sinContexto, propio, compartido, ajeno]).toEqual([false, true, false, false]);
        break;
      case '(c)':
        expect([sinContexto, propio, compartido, ajeno]).toEqual([false, false, true, false]);
        break;
      default:
        throw new Error(`Celda desconocida: ${celda}`);
    }
  });

  it('al negar devuelve el motivo en español de la acción y si debe ocultarse', () => {
    expect(puede('crear_tarea', { perfil: 'integrante' })).toEqual({
      permitido: false,
      motivo: MATRIZ_PERMISOS.crear_tarea.motivo,
      oculto: false,
    });
    expect(puede('crear_tarea', { perfil: 'invitado' })).toMatchObject({ oculto: true });
    expect(puede('triaje', { perfil: 'personal' })).toMatchObject({ oculto: true });
  });
});
