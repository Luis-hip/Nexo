import type { MiembroChat } from '@nexo/shared';
import { describe, expect, it } from 'vitest';
import {
  consultaDeMencion,
  extraerMenciones,
  partirMenciones,
  sugerirMenciones,
} from './menciones';

const miembro = (usuario_id: string, nombre: string): MiembroChat => ({
  usuario_id,
  nombre,
  color_idx: 0,
  rol: 'integrante',
});
const ana = miembro('1', 'Ana Ruiz');
const anaLuz = miembro('2', 'Ana Luz Pérez');

describe('menciones del chat', () => {
  it('detecta a quien se menciona con su nombre completo, sin importar mayúsculas', () => {
    expect(extraerMenciones('hola @ana ruiz y @ANA LUZ PÉREZ', [ana, anaLuz]).sort()).toEqual([
      '1',
      '2',
    ]);
    expect(extraerMenciones('hola @Ana', [ana, anaLuz])).toEqual([]);
    expect(extraerMenciones('sin menciones', [ana])).toEqual([]);
  });

  it('parte el texto en tramos y resalta solo las menciones válidas', () => {
    expect(partirMenciones('Mira @Ana Ruiz, es tuyo @Nadie', ['Ana Ruiz'])).toEqual([
      { texto: 'Mira ', mencion: false },
      { texto: '@Ana Ruiz', mencion: true },
      { texto: ', es tuyo @Nadie', mencion: false },
    ]);
    expect(partirMenciones('texto', [])).toEqual([{ texto: 'texto', mencion: false }]);
  });

  it('el nombre más largo gana y los caracteres especiales no rompen la expresión', () => {
    const t = partirMenciones('@Ana Luz Pérez ok', ['Ana', 'Ana Luz Pérez', 'Dr. (X)']);
    expect(t[0]).toEqual({ texto: '@Ana Luz Pérez', mencion: true });
    expect(partirMenciones('@Dr. (X)', ['Dr. (X)'])[0]?.mencion).toBe(true);
  });

  it('propone nombres mientras se escribe tras el @', () => {
    expect(consultaDeMencion('hola @an', 8)).toEqual({ desde: 5, q: 'an' });
    expect(consultaDeMencion('correo a@b.com', 14)).toBeNull();
    expect(consultaDeMencion('sin arroba', 10)).toBeNull();
    expect(
      sugerirMenciones('an', [ana, anaLuz, miembro('3', 'Luis')], '1').map((m) => m.usuario_id),
    ).toEqual(['2']);
  });
});
