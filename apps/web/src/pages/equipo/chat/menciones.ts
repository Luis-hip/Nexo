import type { MiembroChat } from '@nexo/shared';

/**
 * Menciones del chat (CH-02): se escriben como `@Nombre Apellido`. Al enviar se detecta quién
 * fue mencionado con el nombre completo; al mostrar se resaltan los mismos tramos.
 */

/** Ids de quienes aparecen como `@Nombre` en el texto (el nombre más largo gana). */
export function extraerMenciones(
  texto: string,
  miembros: Pick<MiembroChat, 'usuario_id' | 'nombre'>[],
) {
  const ids = new Set<string>();
  for (const m of [...miembros].sort((a, b) => b.nombre.length - a.nombre.length)) {
    if (texto.toLowerCase().includes(`@${m.nombre.toLowerCase()}`)) ids.add(m.usuario_id);
  }
  return [...ids];
}

export interface Tramo {
  texto: string;
  mencion: boolean;
}

/** Parte el texto en tramos normales y menciones (solo las de `nombres`). */
export function partirMenciones(texto: string, nombres: string[]): Tramo[] {
  const buenos = [...new Set(nombres)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (buenos.length === 0) return [{ texto, mencion: false }];
  const escapado = buenos.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(?:${escapado.join('|')})`, 'gi');
  const tramos: Tramo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index > desde) tramos.push({ texto: texto.slice(desde, m.index), mencion: false });
    tramos.push({ texto: m[0], mencion: true });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) tramos.push({ texto: texto.slice(desde), mencion: false });
  return tramos;
}

/** Texto tras el último `@` si la persona está escribiendo una mención (sin espacios dobles). */
export function consultaDeMencion(
  texto: string,
  cursor: number,
): { desde: number; q: string } | null {
  const antes = texto.slice(0, cursor);
  const i = antes.lastIndexOf('@');
  if (i < 0 || (i > 0 && !/\s/.test(antes[i - 1]!))) return null;
  const q = antes.slice(i + 1);
  return q.length <= 40 && !/\n|\s\s/.test(q) ? { desde: i, q } : null;
}

/** Miembros que encajan con lo escrito tras el `@`, sin contarse a uno mismo. */
export function sugerirMenciones(q: string, miembros: MiembroChat[], yo: string) {
  const n = q.toLowerCase();
  return miembros
    .filter((m) => m.usuario_id !== yo && m.nombre.toLowerCase().includes(n))
    .slice(0, 6);
}
