import { describe, expect, it } from 'vitest';
import { esquemaRegistro } from './index';

describe('mensajes de validación (5.2)', () => {
  it('los mensajes que genera Zod salen en español', () => {
    const r = esquemaRegistro.safeParse({ nombre: 'Ana López' });
    expect(r.success).toBe(false);
    const mensajes = r.error!.issues.map((i) => i.message).join(' ');
    expect(mensajes).not.toMatch(/Invalid input|expected/);
    expect(mensajes).toMatch(/[Ee]ntrada inválida|se esperaba|Escribe/);
  });

  it('los mensajes propios de los campos se conservan', () => {
    const r = esquemaRegistro.safeParse({ nombre: 'A', correo: 'x', contrasena: '1' });
    const textos = r.error!.issues.map((i) => i.message);
    expect(textos).toContain('Escribe tu nombre (al menos 2 letras).');
    expect(textos).toContain('Escribe un correo válido.');
  });
});
