import { describe, expect, it } from 'vitest';
import { comprobarTransicion, transicionesValidas } from './estados';
import type { Perfil } from './permisos';
import { ESTADOS_TAREA, type EstadoTarea } from './tareas';

const YO = 'yo';
const OTRO = 'otro';

/**
 * Tabla de casos (docs/03, 2.2.7): desde · perfil · ¿es el responsable? · destinos válidos.
 * Cualquier destino que no aparezca en la fila es inválido.
 */
const TABLA: [EstadoTarea, Perfil, boolean, EstadoTarea[]][] = [
  // El líder mueve cualquier tarea, sea o no su responsable.
  ['propuesta', 'lider', false, []],
  ['backlog', 'lider', false, []],
  ['aceptada', 'lider', false, ['habilitada']],
  ['habilitada', 'lider', false, ['en_curso']],
  ['en_curso', 'lider', false, ['atascada', 'completada']],
  ['atascada', 'lider', false, ['en_curso', 'completada']],
  ['completada', 'lider', false, ['en_curso']],
  ['rechazada', 'lider', false, []],
  ['aceptada', 'lider', true, ['habilitada']],
  // El integrante solo mueve las suyas, no habilita ni reabre.
  ['propuesta', 'integrante', true, []],
  ['backlog', 'integrante', true, []],
  ['aceptada', 'integrante', true, []],
  ['habilitada', 'integrante', true, ['en_curso']],
  ['en_curso', 'integrante', true, ['atascada', 'completada']],
  ['atascada', 'integrante', true, ['en_curso', 'completada']],
  ['completada', 'integrante', true, []],
  ['rechazada', 'integrante', true, []],
  // Integrante que no es el responsable: nada.
  ['habilitada', 'integrante', false, []],
  ['en_curso', 'integrante', false, []],
  ['atascada', 'integrante', false, []],
  // El invitado nunca cambia estados, ni siendo «responsable».
  ['habilitada', 'invitado', true, []],
  ['en_curso', 'invitado', true, []],
];

describe('máquina de estados de tareas de equipo', () => {
  it.each(TABLA)('%s · %s · responsable=%s → %j', (estado, perfil, esResponsable, validos) => {
    const tarea = {
      estado,
      responsable_id: esResponsable ? YO : OTRO,
      asignacion_pendiente: false,
    };
    expect(transicionesValidas(tarea, perfil, YO).sort()).toEqual([...validos].sort());

    // Cada destino posible: válido solo si está en la fila; si no, hay motivo en español.
    for (const destino of ESTADOS_TAREA) {
      const r = comprobarTransicion(tarea, destino, perfil, YO);
      expect(r.valida, `${estado} → ${destino}`).toBe(validos.includes(destino));
      if (!r.valida) expect(r.motivo.length).toBeGreaterThan(10);
    }
  });

  it('con la asignación pendiente, el responsable no mueve la tarea pero el líder sí', () => {
    const tarea = { estado: 'habilitada', responsable_id: YO, asignacion_pendiente: true } as const;
    expect(transicionesValidas(tarea, 'integrante', YO)).toEqual([]);
    expect(comprobarTransicion(tarea, 'en_curso', 'integrante', YO)).toEqual({
      valida: false,
      motivo: 'Primero acepta la asignación.',
    });
    expect(transicionesValidas(tarea, 'lider', OTRO)).toEqual(['en_curso']);
  });

  it('explica cada tipo de rechazo', () => {
    const t = (estado: EstadoTarea, responsable = YO) => ({
      estado,
      responsable_id: responsable,
      asignacion_pendiente: false,
    });
    const motivo = (...a: Parameters<typeof comprobarTransicion>) => {
      const r = comprobarTransicion(...a);
      return r.valida ? null : r.motivo;
    };
    expect(motivo(t('en_curso'), 'completada', 'invitado', YO)).toBe(
      'Los invitados no cambian estados.',
    );
    expect(motivo(t('en_curso', OTRO), 'completada', 'integrante', YO)).toMatch(
      /Solo el responsable/,
    );
    expect(motivo(t('aceptada'), 'habilitada', 'integrante', YO)).toBe(
      'Solo el líder puede habilitar tareas.',
    );
    expect(motivo(t('completada'), 'en_curso', 'integrante', YO)).toMatch(/reabrir/);
    expect(motivo(t('propuesta'), 'aceptada', 'lider', YO)).toMatch(/triaje/);
    expect(motivo(t('habilitada'), 'completada', 'lider', YO)).toBe(
      'No se puede pasar de «Habilitada» a «Completada».',
    );
  });
});
