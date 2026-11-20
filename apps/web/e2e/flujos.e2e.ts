import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Fase 5.4 · Los 3 flujos críticos de docs/03, de punta a punta en el navegador:
 *  1. Crear equipo e invitar: Ana se registra, crea un equipo e invita; Beto se registra y se une con el código.
 *  2. Crear, asignar y completar una tarea: Ana propone una tarea para Beto; Beto la vota, acepta la
 *     asignación, la empieza y la completa.
 *  3. Chat: Ana y Beto, en dos navegadores, intercambian mensajes en tiempo real. (El aviso de WhatsApp
 *     simulado se sumará al juntar la rama de WhatsApp.)
 * Las cuentas son nuevas en cada corrida (correo con marca de tiempo, dominio de pruebas `.test`).
 */
test.describe.configure({ mode: 'serial' });

const marca = Date.now();
const ana = { nombre: 'Ana Prueba', correo: `ana-${marca}@e2e.test`, contrasena: 'Ana-e2e-2026' };
const beto = {
  nombre: 'Beto Prueba',
  correo: `beto-${marca}@e2e.test`,
  contrasena: 'Beto-e2e-2026',
};
const nombreEquipo = `Equipo E2E ${String(marca).slice(-5)}`;
const tituloTarea = `Preparar la demo ${String(marca).slice(-5)}`;

let paginaAna: Page;
let paginaBeto: Page;
let urlEquipo = '';

async function registrar(browser: Browser, p: typeof ana) {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  await page.goto('/registro');
  await page.getByLabel('Nombre', { exact: true }).fill(p.nombre);
  await page.getByLabel('Correo').fill(p.correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(p.contrasena);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/bienvenida\/1/);
  // El recorrido de primer uso (ONB-04) se marca como visto con la misma sesión, para que no tape
  // las pantallas que se prueban aquí.
  const api = process.env.E2E_API_URL ?? 'http://localhost:3000';
  const web = process.env.E2E_WEB_URL ?? 'http://localhost:5173';
  const r = await page.request.patch(`${api}/yo/preferencias`, {
    data: { tour_visto: true },
    headers: { origin: web },
  });
  expect(r.ok()).toBe(true);
  // El aviso de cookies tapa parte de la pantalla: se rechazan las opcionales.
  const rechazar = page.getByRole('button', { name: 'Rechazar' });
  if (await rechazar.isVisible().catch(() => false)) await rechazar.click();
  return page;
}

/** Cierra el recorrido de primer uso si aparece. */
async function sinRecorrido(page: Page) {
  const saltar = page.getByRole('button', { name: 'Saltar recorrido' });
  if (await saltar.isVisible({ timeout: 2_000 }).catch(() => false)) await saltar.click();
}

test.afterAll(async () => {
  await paginaAna?.context().close();
  await paginaBeto?.context().close();
});

test('1 · crear equipo e invitar: la otra persona se une con el código', async ({ browser }) => {
  paginaAna = await registrar(browser, ana);
  await paginaAna.goto('/app/equipos/nuevo');
  await sinRecorrido(paginaAna);
  await paginaAna.getByLabel('Nombre del equipo').fill(nombreEquipo);
  for (let i = 0; i < 3; i++) await paginaAna.getByRole('button', { name: 'Continuar' }).click();
  await paginaAna.getByRole('button', { name: 'Crear equipo' }).click();
  await expect(paginaAna).toHaveURL(/\/app\/e\/[0-9a-f-]+\/equipo$/);
  urlEquipo = paginaAna.url().replace(/\/equipo$/, '');

  await paginaAna.getByRole('button', { name: 'Invitar' }).first().click();
  await paginaAna.getByRole('button', { name: 'Crear invitación' }).click();
  const codigo = (await paginaAna.locator('p.font-mono').first().textContent())?.trim();
  expect(codigo).toMatch(/^[A-Z0-9-]{4,}$/);
  await paginaAna.getByRole('button', { name: 'Listo' }).click();

  paginaBeto = await registrar(browser, beto);
  await paginaBeto.goto('/app/equipos/unirse');
  await sinRecorrido(paginaBeto);
  await paginaBeto.getByLabel('Código o enlace').fill(codigo!);
  await paginaBeto.getByLabel('Código o enlace').press('Enter');
  await paginaBeto.getByRole('button', { name: 'Confirmar y unirme' }).click();
  await expect(paginaBeto).toHaveURL(new RegExp(`${urlEquipo.split('/app')[1]}$`));
  await expect(paginaBeto.getByText(nombreEquipo).first()).toBeVisible();

  // Ana ve a Beto en Miembros.
  await paginaAna.reload();
  await expect(paginaAna.getByText(beto.nombre).first()).toBeVisible();
});

test('2 · crear, asignar y completar una tarea', async () => {
  // Ana propone la tarea con Beto de responsable (DEC-024: entra a votación).
  await paginaAna.goto(`${urlEquipo}/tareas`);
  await sinRecorrido(paginaAna);
  await paginaAna.getByRole('button', { name: 'Nueva propuesta' }).first().click();
  await paginaAna.getByLabel('Título', { exact: true }).fill(tituloTarea);
  await paginaAna.getByLabel('Responsable (opcional)').selectOption({ label: beto.nombre });
  await paginaAna.getByRole('button', { name: 'Enviar a votación' }).click();
  await expect(paginaAna.getByRole('button', { name: 'Enviar a votación' })).toBeHidden();

  // Beto vota a favor en «Votación»: con un solo integrante, la mayoría es 1 y queda aceptada.
  await paginaBeto.goto(`${urlEquipo}/tareas/votacion`);
  await paginaBeto.getByRole('button', { name: 'A favor' }).first().click();
  await expect(paginaBeto.getByText(tituloTarea)).toBeHidden();

  // Abre el detalle de la tarea desde la lista.
  const abrir = async (page: Page) => {
    await page.goto(`${urlEquipo}/tareas/lista`);
    await page.getByText(tituloTarea).first().click();
    return page.getByRole('dialog');
  };
  /** Cambia el estado con el selector del detalle y espera a que quede guardado. */
  const cambiarEstado = async (page: Page, valor: string, nombre: string) => {
    const panel = await abrir(page);
    await panel.getByLabel('Cambiar estado').selectOption(valor);
    const confirmar = page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirmar|Completar|Marcar/ });
    if (
      await confirmar
        .first()
        .isVisible({ timeout: 1_500 })
        .catch(() => false)
    ) {
      await confirmar.first().click();
    }
    await expect(
      panel.getByLabel('Cambiar estado').or(panel.getByText(nombre)).first(),
    ).toBeVisible();
    await expect(
      panel.getByText(`${nombre} (actual)`).or(panel.getByText(nombre)).first(),
    ).toBeVisible();
  };

  // Beto acepta la asignación.
  const panelBeto = await abrir(paginaBeto);
  await panelBeto.getByRole('button', { name: 'Aceptar' }).click();
  await expect(panelBeto.getByRole('button', { name: 'Rechazar' })).toBeHidden();

  // Ana la habilita (solo el líder); Beto la empieza y la completa.
  await cambiarEstado(paginaAna, 'habilitada', 'Habilitada');
  await cambiarEstado(paginaBeto, 'en_curso', 'En curso');
  await cambiarEstado(paginaBeto, 'completada', 'Completada');

  // Ana la ve completada en su tablero.
  await paginaAna.goto(`${urlEquipo}/tareas/lista`);
  await expect(paginaAna.locator('li, tr').filter({ hasText: tituloTarea }).first()).toContainText(
    'Completada',
  );
});

test('3 · chat en tiempo real entre dos navegadores', async () => {
  await paginaAna.goto(`${urlEquipo}/chat`);
  await paginaBeto.goto(`${urlEquipo}/chat`);
  await sinRecorrido(paginaAna);
  await sinRecorrido(paginaBeto);
  for (const p of [paginaAna, paginaBeto]) {
    await p
      .getByRole('link', { name: new RegExp(nombreEquipo) })
      .first()
      .click();
    await expect(p.getByRole('textbox', { name: /Mensaje para/ })).toBeVisible();
  }
  await paginaAna.getByRole('textbox', { name: /Mensaje para/ }).fill('Hola Beto, ¿vemos la demo?');
  await paginaAna.getByRole('textbox', { name: /Mensaje para/ }).press('Enter');
  // Beto lo recibe sin recargar.
  await expect(paginaBeto.getByText('Hola Beto, ¿vemos la demo?', { exact: true })).toBeVisible();

  await paginaBeto.getByRole('textbox', { name: /Mensaje para/ }).fill('¡Sí! A las 5.');
  await paginaBeto.getByRole('textbox', { name: /Mensaje para/ }).press('Enter');
  await expect(paginaAna.getByText('¡Sí! A las 5.', { exact: true })).toBeVisible();
});
