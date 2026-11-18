import { describe, expect, it } from 'vitest';
import {
  diasRestantes,
  esquemaCerrarSprint,
  esquemaNotaRetro,
  esquemaPlanearSprint,
  serieBurndown,
} from './sprints';

describe('serieBurndown', () => {
  it('un punto por día del sprint, con la línea ideal de las tareas del inicio a cero', () => {
    const s = serieBurndown('2026-11-02', '2026-11-06', [
      { dia: '2026-11-02', total: 4, completadas: 0 },
    ]);
    expect(s.map((d) => d.dia)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(s.map((d) => d.ideal)).toEqual([4, 3, 2, 1, 0]);
  });

  it('cada día lleva lo que faltaba según la última instantánea; después de la última, null', () => {
    const s = serieBurndown('2026-11-02', '2026-11-06', [
      { dia: '2026-11-02', total: 4, completadas: 0 },
      { dia: '2026-11-04', total: 5, completadas: 2 },
    ]);
    expect(s.map((d) => d.restantes)).toEqual([4, 4, 3, null, null]);
  });

  it('los días anteriores a la primera instantánea no tienen dato', () => {
    const s = serieBurndown('2026-11-02', '2026-11-04', [
      { dia: '2026-11-03', total: 3, completadas: 1 },
    ]);
    expect(s.map((d) => d.restantes)).toEqual([null, 2, null]);
    expect(s[0]?.ideal).toBe(3);
  });

  it('si el sprint se cerró después del fin, la serie llega hasta la foto de cierre', () => {
    const s = serieBurndown('2026-11-02', '2026-11-03', [
      { dia: '2026-11-02', total: 2, completadas: 0 },
      { dia: '2026-11-05', total: 2, completadas: 2 },
    ]);
    expect(s).toHaveLength(4);
    expect(s.at(-1)).toEqual({ dia: '2026-11-05', restantes: 0, ideal: 0 });
  });

  it('cruza el fin de mes sin perder días', () => {
    const s = serieBurndown('2026-11-29', '2026-12-02', []);
    expect(s.map((d) => d.dia)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(s.every((d) => d.restantes === null && d.ideal === 0)).toBe(true);
  });
});

describe('diasRestantes', () => {
  it('cuenta el día de hoy y no baja de cero', () => {
    expect(diasRestantes('2026-11-20', '2026-11-17')).toBe(4);
    expect(diasRestantes('2026-11-17', '2026-11-17')).toBe(1);
    expect(diasRestantes('2026-11-10', '2026-11-17')).toBe(0);
  });
});

describe('esquemas de sprints', () => {
  it('el plan acepta fechas AAAA-MM-DD con el fin después del inicio', () => {
    expect(
      esquemaPlanearSprint.safeParse({ inicio: '2026-11-18', fin: '2026-12-01' }).success,
    ).toBe(true);
    const mal = esquemaPlanearSprint.safeParse({ inicio: '2026-11-18', fin: '2026-11-18' });
    expect(mal.success).toBe(false);
    expect(mal.error?.issues[0]?.message).toBe('El sprint debe terminar después de empezar.');
    expect(esquemaPlanearSprint.safeParse({ inicio: '18/11/2026' }).success).toBe(false);
  });

  it('la capacidad va de 0 a 300 horas enteras', () => {
    const u = '00000000-0000-4000-8000-000000000002';
    expect(
      esquemaPlanearSprint.safeParse({ capacidad: [{ usuario_id: u, horas: 30 }] }).success,
    ).toBe(true);
    expect(
      esquemaPlanearSprint.safeParse({ capacidad: [{ usuario_id: u, horas: 301 }] }).success,
    ).toBe(false);
    expect(
      esquemaPlanearSprint.safeParse({ capacidad: [{ usuario_id: u, horas: 2.5 }] }).success,
    ).toBe(false);
  });

  it('al cerrar, las pendientes se liberan si no se dice otra cosa', () => {
    expect(esquemaCerrarSprint.parse({})).toEqual({ pendientes: 'liberar' });
    expect(esquemaCerrarSprint.safeParse({ pendientes: 'backlog' }).success).toBe(false);
  });

  it('una nota de retrospectiva no puede ir vacía y por defecto no es anónima', () => {
    expect(esquemaNotaRetro.parse({ columna: 'bien', texto: '  Buen ritmo  ' })).toEqual({
      columna: 'bien',
      texto: 'Buen ritmo',
      anonima: false,
    });
    expect(esquemaNotaRetro.safeParse({ columna: 'bien', texto: '   ' }).success).toBe(false);
    expect(esquemaNotaRetro.safeParse({ columna: 'otra', texto: 'x' }).success).toBe(false);
  });
});
