import { describe, expect, it } from 'vitest';
import { ERRORES_BD, MAX_MIEMBROS_EQUIPO, esquemaDevLogin } from './index';

describe('esquemaDevLogin', () => {
  it('normaliza el correo', () => {
    expect(esquemaDevLogin.parse({ email: '  Valeria@Nexo.MX ' })).toEqual({
      email: 'valeria@nexo.mx',
    });
  });
  it('rechaza un correo inválido con mensaje en español', () => {
    const r = esquemaDevLogin.safeParse({ email: 'no-es-correo' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Escribe un correo válido.');
  });
});

describe('constantes', () => {
  it('el tope de miembros es 8', () => {
    expect(MAX_MIEMBROS_EQUIPO).toBe(8);
    expect(Object.keys(ERRORES_BD)).toEqual(['NX001', 'NX002', 'NX003']);
  });
});
