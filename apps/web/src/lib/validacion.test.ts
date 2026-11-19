import { esquemaCrearReunion, esquemaRegistro } from '@nexo/shared';
import { describe, expect, it } from 'vitest';
import { erroresDe, primerError } from './validacion';

describe('validación en el cliente con los esquemas de la API (5.2)', () => {
  it('da los errores por campo en español', () => {
    const { datos, errores } = erroresDe(esquemaRegistro, {
      nombre: 'A',
      correo: 'x',
      contrasena: '1',
    });
    expect(datos).toBeNull();
    expect(errores.nombre).toBe('Escribe tu nombre (al menos 2 letras).');
    expect(errores.correo).toBe('Escribe un correo válido.');
    expect(errores.contrasena).toMatch(/al menos 8/);
  });

  it('devuelve los datos ya normalizados si son válidos', () => {
    const { datos } = erroresDe(esquemaRegistro, {
      nombre: '  Ana López ',
      correo: ' ANA@Nexo.MX ',
      contrasena: 'una-frase-larga',
    });
    expect(datos).toMatchObject({ nombre: 'Ana López', correo: 'ana@nexo.mx' });
  });

  it('primerError: undefined si es válido; si no, un mensaje sin inglés', () => {
    expect(
      primerError(esquemaCrearReunion, { titulo: 'Daily', inicio: '2026-11-20T15:00:00.000Z' }),
    ).toBeUndefined();
    const m = primerError(esquemaCrearReunion, { inicio: 'mañana' });
    expect(m).toBeTruthy();
    expect(m).not.toMatch(/Invalid|expected/);
  });
});
