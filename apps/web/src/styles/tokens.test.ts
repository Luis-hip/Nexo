// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Se lee el archivo tal cual (Vitest no procesa CSS en las pruebas).
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Lee los tokens de un bloque de tokens.css (`:root` o `[data-theme='dark']`). */
function tokensDe(selector: string): Record<string, string> {
  const inicio = css.indexOf(`${selector} {`);
  const bloque = css.slice(inicio, css.indexOf('}', inicio));
  return Object.fromEntries(
    [...bloque.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
  );
}

/** Luminancia relativa y razón de contraste según WCAG 2.x. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}
function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

// Pares texto/fondo que usa la interfaz. Las variantes `-text` son las de texto de señal.
const TEXTOS = [
  '--text-primary',
  '--text-secondary',
  '--brand-primary',
  '--signal-ok-text',
  '--signal-warn-text',
  '--signal-danger-text',
  '--signal-info-text',
];
const FONDOS = ['--bg-canvas', '--bg-surface', '--bg-raised'];

describe.each([
  ['claro', ':root'],
  ['oscuro', "[data-theme='dark']"],
])('contraste de los tokens en tema %s (docs/01, 5.1: mínimo 4.5:1)', (_tema, selector) => {
  const t = tokensDe(selector);

  it('el bloque define todos los tokens de color', () => {
    for (const nombre of [...TEXTOS, ...FONDOS, '--brand-on-primary']) {
      expect(t[nombre], nombre).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(TEXTOS.flatMap((texto) => FONDOS.map((fondo) => [texto, fondo] as const)))(
    '%s sobre %s',
    (texto, fondo) => {
      expect(contraste(t[texto] ?? '', t[fondo] ?? '')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('texto del botón primario sobre el color de marca', () => {
    expect(
      contraste(t['--brand-on-primary'] ?? '', t['--brand-primary'] ?? ''),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
