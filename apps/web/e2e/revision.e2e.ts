import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Fase 5.4 · Revisión automática de las pantallas principales con las personas de la semilla:
 *  - A 360 px de ancho no hay desplazamiento horizontal.
 *  - axe-core (WCAG 2.1 A y AA) no encuentra problemas graves ni críticos.
 *  - Navegación con teclado: el primer Tab llega al enlace «Saltar al contenido».
 * Con `CAPTURAS=1` además guarda capturas para el artículo (5.5) en docs/capturas/.
 */
const SEMILLA = '10000000-0000-4000-8000-000000000001';
const E = `/app/e/${SEMILLA}`;
const CAPTURAS = process.env.CAPTURAS === '1';

async function entrar(page: Page, correo: string) {
  await page.goto('/entrar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill('Nexo-2026');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/app/);
  const api = process.env.E2E_API_URL ?? 'http://localhost:3000';
  const web = process.env.E2E_WEB_URL ?? 'http://localhost:5173';
  await page.request.patch(`${api}/yo/preferencias`, {
    data: { tour_visto: true },
    headers: { origin: web },
  });
  // Aviso de cookies ya respondido (solo las esenciales), para que no tape las capturas.
  await page.evaluate(() => localStorage.setItem('nx-cookies', 'esenciales'));
}

/** Pantallas por persona: [ruta, nombre de la captura]. */
const PANTALLAS: Record<string, [string, string][]> = {
  'valeria@nexo.mx': [
    [`${E}`, 'eq-01-resumen-lider'],
    [`${E}/tareas`, 'eq-02-tablero'],
    [`${E}/tareas/votacion`, 'eq-05-votacion'],
    [`${E}/sprints/activo`, 'eq-09-sprint-activo'],
    [`${E}/chat`, 'ch-01-chat'],
    [`${E}/calendario`, 'eq-14-calendario'],
    [`${E}/reportes`, 'eq-16-reportes'],
    [`${E}/equipo`, 'ad-01-miembros'],
    ['/app/personal', 'per-01-inicio'],
    ['/ajustes/cuenta', 'pf-02-cuenta'],
  ],
  'carlos@nexo.mx': [
    [`${E}`, 'eq-01-resumen-integrante'],
    [`${E}/tareas/votacion`, 'eq-05-votacion-integrante'],
  ],
  'mariana.lozano@universidad.mx': [
    [`${E}`, 'in-01-resumen-invitada'],
    [`${E}/chat`, 'ch-10-canal-invitados'],
  ],
};

for (const [correo, pantallas] of Object.entries(PANTALLAS)) {
  test(`pantallas de ${correo}: 360 px sin desbordar y sin problemas graves de accesibilidad`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await entrar(page, correo);
    const problemas: string[] = [];
    for (const [ruta, nombre] of pantallas) {
      await page.setViewportSize({ width: 360, height: 760 });
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (desborde > 1)
        problemas.push(`${ruta}: ${desborde}px de desplazamiento horizontal a 360 px`);

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      for (const v of axe.violations.filter(
        (x) => x.impact === 'critical' || x.impact === 'serious',
      )) {
        problemas.push(
          `${ruta}: axe ${v.impact} «${v.id}» en ${v.nodes.length} elemento(s): ${v.nodes[0]?.target.join(' ')} · ${v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ')}`,
        );
      }

      if (CAPTURAS) {
        await page.screenshot({ path: `../../docs/capturas/${nombre}-movil.png` });
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `../../docs/capturas/${nombre}.png` });
      }
    }
    expect(problemas, problemas.join('\n')).toEqual([]);
  });
}

test('teclado: el primer Tab lleva a «Saltar al contenido» y este enfoca el contenido', async ({
  page,
}) => {
  await entrar(page, 'carlos@nexo.mx');
  await page.goto(`${E}/tareas`);
  await page.waitForLoadState('networkidle');
  // Desde el inicio del documento, como al llegar a la página.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  const enfocado = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  expect(enfocado).toContain('Saltar al contenido');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#contenido$/);
});
