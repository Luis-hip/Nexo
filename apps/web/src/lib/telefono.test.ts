import { describe, expect, it } from 'vitest';
import {
  aE164,
  buscarPaises,
  desdeE164,
  errorPara,
  esValido,
  formatoLegible,
  limpiar,
  PAISES,
  separar,
} from './telefono';

describe('teléfono con lada aparte', () => {
  it('México va primero y por defecto', () => {
    expect(PAISES[0]?.pais).toBe('MX');
    expect(desdeE164(null)).toEqual({ pais: 'MX', numero: '' });
  });

  it('limpia espacios, guiones y paréntesis', () => {
    expect(limpiar(' (55) 1234-5678 ')).toBe('5512345678');
    expect(limpiar('+52 55.1234.5678')).toBe('+525512345678');
    expect(limpiar('0052 5512345678')).toBe('+525512345678');
  });

  it('separa la lada al pegar un número con +', () => {
    expect(separar('+52 55 1234 5678', 'MX')).toEqual({ pais: 'MX', numero: '5512345678' });
    expect(separar('+521 222 123 4567', 'MX')).toEqual({ pais: 'MX', numero: '2221234567' });
    expect(separar('+1 415 555 2671', 'MX')).toEqual({ pais: 'US', numero: '4155552671' });
    expect(separar('+34 612 34 56 78', 'MX')).toEqual({ pais: 'ES', numero: '612345678' });
  });

  it('con México, quita el prefijo 52 o 521 si quedan 10 dígitos', () => {
    expect(separar('525512345678', 'MX')).toEqual({ pais: 'MX', numero: '5512345678' });
    expect(separar('5215512345678', 'MX')).toEqual({ pais: 'MX', numero: '5512345678' });
    // 10 dígitos que empiezan con 52 son un número local, no una lada.
    expect(separar('5212345678', 'MX')).toEqual({ pais: 'MX', numero: '5212345678' });
  });

  it('un + a medio escribir espera a que se complete', () => {
    expect(separar('+5', 'MX', false)).toBeNull();
    expect(separar('+525512345678', 'MX', false)).toEqual({ pais: 'MX', numero: '5512345678' });
  });

  it('valida según el país', () => {
    expect(esValido({ pais: 'MX', numero: '5512345678' })).toBe(true);
    expect(esValido({ pais: 'MX', numero: '551234567' })).toBe(false);
    expect(errorPara({ pais: 'MX', numero: '551234567' })).toBe(
      'Escribe los 10 dígitos de tu número, sin lada.',
    );
    expect(esValido({ pais: 'US', numero: '4155552671' })).toBe(true);
  });

  it('compone E.164 como lo espera la API (+52 + 10 dígitos)', () => {
    expect(aE164({ pais: 'MX', numero: '5512345678' })).toBe('+525512345678');
    expect(aE164({ pais: 'US', numero: '4155552671' })).toBe('+14155552671');
    expect(aE164({ pais: 'MX', numero: '5512345678' })).toMatch(/^\+[1-9]\d{7,14}$/);
  });

  it('descompone los números guardados, también el formato antiguo +521', () => {
    expect(desdeE164('+525512345678')).toEqual({ pais: 'MX', numero: '5512345678' });
    expect(desdeE164('+5212221234567')).toEqual({ pais: 'MX', numero: '2221234567' });
    expect(formatoLegible('+525512345678')).toBe('+52 55 1234 5678');
  });

  it('busca por nombre sin acentos, siglas o lada', () => {
    expect(buscarPaises('mexico').map((o) => o.pais)).toContain('MX');
    expect(buscarPaises('es').map((o) => o.pais)).toContain('ES');
    expect(buscarPaises('+52')[0]?.pais).toBe('MX');
  });
});
