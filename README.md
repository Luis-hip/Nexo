# Nexo

Aplicación web de trabajo colaborativo tipo tablero para equipos pequeños (hasta 8 miembros activos), con una aportación propia: **avisos y reportes por WhatsApp**, al grupo del equipo o a cada persona, configurados por el líder y con consentimiento individual.

> Estado: **Fases 0 a 6 terminadas y en producción** en `https://app.nexo.lol` (API en `https://api.nexo.lol`). Sigue la etapa de **pruebas de usabilidad con personas reales**; lo que salga de ahí se trabaja como mejoras. Detalle en [`docs/progreso.md`](docs/progreso.md).

## Documentación

| Documento                                                                                                                 | Contenido                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [`docs/06_README_AGENTS.md`](docs/06_README_AGENTS.md)                                                                    | Índice y orden de lectura (empieza aquí)                               |
| [`docs/01_Contexto_y_Especificaciones.md`](docs/01_Contexto_y_Especificaciones.md)                                        | Producto, roles y permisos, diseño, stack, arquitectura, convenciones  |
| [`docs/02_Base_de_Datos.md`](docs/02_Base_de_Datos.md)                                                                    | Diseño completo de la base de datos                                    |
| [`docs/03_Plan_de_Accion.md`](docs/03_Plan_de_Accion.md)                                                                  | Fases 0–6 con criterio de terminado                                    |
| [`docs/04_Articulo.md`](docs/04_Articulo.md) · [`docs/05_Cronograma.md`](docs/05_Cronograma.md)                           | Artículo y cronograma                                                  |
| [`docs/07_Cambios_de_Alcance_Fase2.md`](docs/07_Cambios_de_Alcance_Fase2.md)                                              | Fase 2.5: votación de propuestas, procesos en la BD, secretos          |
| [`docs/08_Procesos_BD.md`](docs/08_Procesos_BD.md)                                                                        | Procesos `proc_*` de la BD (un apartado por proceso)                   |
| [`docs/09_Seguridad_y_Secretos.md`](docs/09_Seguridad_y_Secretos.md)                                                      | Política de secretos, rotación, filtraciones y lista de producción     |
| [`docs/10_Plan_de_Despliegue.md`](docs/10_Plan_de_Despliegue.md)                                                          | Fase 3.5: Vercel + Render + dominio propio (en línea desde 2026-11-18) |
| [`docs/11_Plan_Spike_WhatsApp_1a1.md`](docs/11_Plan_Spike_WhatsApp_1a1.md)                                                | WhatsApp 1 a 1 (canal directo, formatos y ventana de 24 h)             |
| [`docs/12_Plan_Contacto.md`](docs/12_Plan_Contacto.md) · [`docs/14_Contacto_Operacion.md`](docs/14_Contacto_Operacion.md) | Módulo de contacto: diseño y operación                                 |
| [`docs/13_Plan_Integrado_Pendientes.md`](docs/13_Plan_Integrado_Pendientes.md)                                            | 2FA, Google, WhatsApp al empezar y contacto, sin solaparse             |
| [`docs/15_Rol_Soporte.md`](docs/15_Rol_Soporte.md)                                                                        | Rol «Soporte de Nexo»: permisos y tablero `/soporte`                   |
| [`docs/operacion.md`](docs/operacion.md)                                                                                  | Operación de producción paso a paso (Render, Vercel, Meta, Resend…)    |
| [`docs/decisiones.md`](docs/decisiones.md) · [`docs/progreso.md`](docs/progreso.md)                                       | Decisiones tomadas · qué está hecho y qué falta                        |

## Requisitos

- Node.js 22 o superior
- pnpm 10 (`npm i -g pnpm@10`; en PowerShell, si la política de ejecución bloquea `pnpm.ps1`, usa `pnpm.cmd`)
- Base de datos, una de dos:
  - **Sin Docker (recomendado en Windows):** nada más; `pnpm db:local` levanta PGlite (PostgreSQL embebido) en el puerto 5432.
  - **Con Docker:** `docker compose up -d` levanta PostgreSQL 16.

## Levantarlo en local (5 minutos)

```bash
git clone https://github.com/Luis-hip/Nexo.git
cd Nexo
pnpm install
cp .env.example apps/api/.env      # valores falsos de ejemplo: sirven tal cual en local
```

En **otra terminal**, deja corriendo la base de datos (una de las dos):

```bash
pnpm db:local                      # PGlite; los datos quedan en .pglite/ (ignorada por git)
# o bien: docker compose up -d
```

De vuelta en la primera:

```bash
pnpm db:reset                      # borra el esquema local, aplica las migraciones y carga la semilla
pnpm dev                           # web en http://localhost:5173 y API en http://localhost:3000
```

Si la terminal de `db:local` se cierra, la API responde con error (`ECONNREFUSED … 5432`): vuelve a abrirla.

### Entrar

- **Acceso de desarrollo:** abre http://localhost:5173/entrar y elige un usuario de la semilla (por ejemplo Paola, que solo tiene espacio personal, o Valeria, líder del Equipo Nexo). Solo existe con `DEV_LOGIN_ENABLED=true`; la API no arranca en producción con ese valor.
- **Cuenta de soporte local** (tablero `/soporte`, sin equipos): `pnpm --filter @nexo/api db:soporte`. Crea `soporte@nexo.lol` y escribe la contraseña en `.credenciales-demo.md` (ignorado por git). Al entrar pide activar la verificación en dos pasos.
- **Correos en local:** no se envían. El texto completo, con el enlace de verificación o de recuperación, sale en el registro de la API.
- **WhatsApp en local:** `WHATSAPP_PROVIDER=simulado` (valor del ejemplo). Los avisos van a la cola y al historial sin salir a Meta.
- **Catálogo de componentes:** http://localhost:5173/interna/componentes (solo en desarrollo).

### Integraciones opcionales en local

Todas se activan con variables en `apps/api/.env`. Sin ellas la app funciona igual: el botón, la casilla o el envío correspondiente simplemente no aparecen.

| Qué                  | Variables                                                               | Dónde se explica                |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| WhatsApp real        | `WHATSAPP_PROVIDER=real`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, …      | `docs/operacion.md` §15         |
| Entrar con Google    | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (callback `localhost:3000`)  | `.env.example`, `docs/13` §1.2  |
| Captcha del contacto | `TURNSTILE_SECRET_KEY` y, en `apps/web/.env`, `VITE_TURNSTILE_SITE_KEY` | `docs/14_Contacto_Operacion.md` |
| Correos reales       | `CORREO_PROVEEDOR=resend`, `RESEND_API_KEY`                             | `docs/operacion.md`             |

## Pruebas

| Comando                                              | Qué prueba                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` | Tipos, ESLint (sin avisos) y formato                                                       |
| `pnpm test`                                          | Vitest: `shared`, web y API (las de integración de la API usan `DATABASE_URL`)             |
| `pnpm db:test`                                       | Pruebas de integridad SQL                                                                  |
| `pnpm db:test:procesos`                              | Pruebas de los procesos `proc_*` (cada una imprime `OK Pn`)                                |
| `pnpm procesos:verificar`                            | Que cada proceso de la BD esté documentado en `docs/08`                                    |
| `pnpm --filter @nexo/web e2e`                        | Playwright: los flujos críticos en el navegador (antes: `npx playwright install chromium`) |

Las pruebas de integración de la API necesitan la base levantada. En la terminal donde las corras, define `DATABASE_URL=postgres://nexo:nexo@localhost:5432/nexo`. La CI corre todo esto, gitleaks incluido, en cada PR.

**Prueba de humo en producción** (Fase 6). Recorre los mismos flujos contra `app.nexo.lol`: registra dos cuentas con direcciones de prueba de Resend, crea un equipo, une a la segunda persona, completa una tarea y chatea. Al final borra las dos cuentas:

```bash
cd apps/web
E2E_PRODUCCION=1 E2E_WEB_URL=https://app.nexo.lol E2E_API_URL=https://api.nexo.lol npx playwright test e2e/flujos.e2e.ts
```

## Scripts de la base de datos

| Script                               | Qué hace                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm db:migrate` · `pnpm db:seed`   | Aplicar migraciones · cargar la semilla                                             |
| `pnpm db:reset`                      | Base local desde cero (nunca en producción)                                         |
| `pnpm db:local`                      | PostgreSQL local sin Docker (PGlite en el puerto 5432)                              |
| `pnpm db:tipos`                      | Regenerar `apps/api/src/db/tipos.ts` desde la BD (se versiona; no pasarle Prettier) |
| `pnpm --filter @nexo/api db:soporte` | Alta de una cuenta de soporte (`--produccion` con `DATABASE_URL_PRODUCCION`)        |
| `pnpm --filter @nexo/api db:permiso` | Dar o quitar un permiso de sistema                                                  |

## Secretos

Ningún secreto va al repositorio:

- `.env` está ignorado y solo se sube `.env.example`, con valores falsos.
- El navegador no recibe secretos: todo `VITE_*` es público.
- En producción, los secretos viven solo en los paneles de Render y Vercel.

La política completa, la rotación, qué hacer ante una filtración y la lista revisada antes de producción están en [`docs/09_Seguridad_y_Secretos.md`](docs/09_Seguridad_y_Secretos.md).

## Estructura

```
apps/api/        Fastify; llama procesos `proc_*` de la BD. db/migrations, db/seed, db/tests, scripts/
apps/web/        React + Vite + Tailwind v4; e2e/ con Playwright
packages/shared/ Zod, constantes, permisos y color (compartido por web y API)
docs/            Especificaciones, decisiones, operación y progreso
.github/         CI y plantillas de issues y PR
```

## Producción

| Pieza    | Dónde                                  | Cómo se despliega                                                          |
| -------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Web      | Vercel (`app.nexo.lol`)                | Sola al fusionar en `produccion`                                           |
| API y BD | Render (`api.nexo.lol`)                | «Manual Deploy → Deploy latest commit»; las migraciones corren al arrancar |
| DNS      | Porkbun (`nexo.lol`)                   | `app`, `api` y los registros de Resend                                     |
| Correo   | Resend (dominio `nexo.lol` verificado) | —                                                                          |
| WhatsApp | Meta Cloud API (usuario del sistema)   | Webhook en `api.nexo.lol/whatsapp/webhook`                                 |

Paso a paso y estado de cada integración: [`docs/operacion.md`](docs/operacion.md).

## Cómo trabajamos: ramas y pull requests

Convención completa en [`docs/decisiones.md`, DEC-001](docs/decisiones.md#dec-001--convención-de-ramas-y-pull-requests).

```
Dev_Luis ─┐
Dev_Jova ─┤
Dev_Carlos┼─ PR ─► dev ─ PR ─► main ─ PR ─► produccion
Dev_Isac ─┘
```

| Rama                                             | Para qué                                      | Quién sube                           |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------ |
| `produccion`                                     | Definitiva: la que se despliega               | Nadie directo; solo PR desde `main`  |
| `main`                                           | Versión estable revisada                      | Nadie directo; solo PR desde `dev`   |
| `dev`                                            | Integración y pruebas conjuntas               | Nadie directo; solo PR desde `Dev_*` |
| `Dev_Luis`, `Dev_Jova`, `Dev_Carlos`, `Dev_Isac` | Rama de cada integrante (back y front juntos) | Solo su dueño                        |

- **`dev`, `main` y `produccion` están protegidas:** solo se fusionan por pull request con la **CI en verde**.
- Cada integrante trabaja en su rama `Dev_<Nombre>`, creada desde `dev`, sin separar back y front.
- **Ramas cortas** (opcionales) con el formato `modulo/descripcion` (p. ej. `tablero/arrastrar-tarjetas`): salen de tu rama `Dev_<Nombre>` y vuelven a ella por PR. No uses `Dev_Luis/…` como nombre: Git no lo permite si ya existe `Dev_Luis`.
- Antes de abrir un PR a `dev`, trae lo último de `dev` a tu rama y resuelve ahí los conflictos.
- Las promociones `dev` → `main` y `main` → `produccion` se fusionan con **Create a merge commit** (no squash), para que las ramas compartan historia.
- Commits en español: `tipo(modulo): descripción` (`feat`, `fix`, `docs`, `test`, `chore`).

Flujo típico:

```bash
git switch Dev_Luis
git pull origin dev
# … cambios …
git commit -m "feat(api): descripción del cambio"
git push origin Dev_Luis
# En GitHub: PR Dev_Luis → dev, esperar la CI en verde y fusionar.
# Después, PR dev → main y PR main → produccion, cada uno con la CI en verde.
# Por último, en Render: Manual Deploy → Deploy latest commit (la web se despliega sola).
```
