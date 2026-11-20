import { defineConfig, devices } from '@playwright/test';

/**
 * Fase 5.4 · Pruebas extremo a extremo de los 3 flujos críticos (docs/03). Necesitan la API y la web
 * en marcha con una BD migrada y sembrada. En local se reutilizan los servidores que ya estén abiertos;
 * en la CI se levantan aquí (la API en modo `test`, con límites por IP holgados).
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @nexo/api start',
      url: `${API}/salud`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { NODE_ENV: 'test', APP_URL: WEB, API_URL: API, PORT: '3000' },
    },
    {
      command: 'pnpm --filter @nexo/web dev --port 5173 --strictPort',
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_URL: API },
    },
  ],
});
