import { describe, expect, it } from 'vitest';
import {
  aCsv,
  celdaCsv,
  esquemaCrearReunion,
  esquemaEditarReunion,
  esquemaSubirArchivo,
  tamanoLegible,
} from './vistas';

describe('exportación a CSV (EQ-17)', () => {
  it('pone comillas cuando hace falta y escapa las comillas internas', () => {
    expect(celdaCsv('Simple')).toBe('Simple');
    expect(celdaCsv('Con, coma')).toBe('"Con, coma"');
    expect(celdaCsv('Dice "hola"')).toBe('"Dice ""hola"""');
    expect(celdaCsv(null)).toBe('');
    expect(celdaCsv(42)).toBe('42');
  });

  it('desactiva las fórmulas que una hoja de cálculo ejecutaría', () => {
    expect(celdaCsv('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(celdaCsv('+1')).toBe("'+1");
    expect(celdaCsv('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('arma encabezados y filas con saltos CRLF', () => {
    const csv = aCsv(
      [
        { clave: 'a', titulo: 'Código' },
        { clave: 'b', titulo: 'Título' },
      ],
      [{ a: 'T-01', b: 'Uno, dos' }],
    );
    expect(csv).toBe('Código,Título\r\nT-01,"Uno, dos"\r\n');
  });
});

describe('esquemas de vistas', () => {
  it('una reunión nueva toma valores por defecto', () => {
    const r = esquemaCrearReunion.parse({ titulo: ' Revisión ', inicio: '2026-11-20T16:00:00Z' });
    expect(r).toMatchObject({ titulo: 'Revisión', duracion_min: 30, repeticion: 'ninguna' });
  });

  it('editar una reunión exige al menos un cambio y no inventa valores', () => {
    expect(esquemaEditarReunion.safeParse({}).success).toBe(false);
    expect(esquemaEditarReunion.parse({ lugar: 'Sala 2' })).toEqual({ lugar: 'Sala 2' });
  });

  it('un archivo de tipo no permitido o mayor de 5 MB no pasa', () => {
    expect(
      esquemaSubirArchivo.safeParse({
        nombre: 'x.svg',
        mime: 'image/svg+xml',
        contenido_base64: 'aA==',
      }).success,
    ).toBe(false);
    expect(
      esquemaSubirArchivo.safeParse({
        nombre: 'g.pdf',
        mime: 'application/pdf',
        contenido_base64: 'A'.repeat(7_000_000 + 10),
      }).success,
    ).toBe(false);
  });

  it('muestra tamaños legibles', () => {
    expect(tamanoLegible(512)).toBe('512 B');
    expect(tamanoLegible(1536)).toBe('1.5 KB');
    expect(tamanoLegible(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
