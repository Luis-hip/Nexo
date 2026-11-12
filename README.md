# Nexo

Aplicación web de trabajo colaborativo tipo tablero para equipos pequeños (hasta 8 miembros activos), con una aportación propia: **avisos en el grupo de WhatsApp del equipo**, configurados por el líder y con consentimiento individual.

> Estado: **Fase 0 · Arranque** (ver [`docs/progreso.md`](docs/progreso.md)).

## Documentación

| Documento                                                                                       | Contenido                                                             |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`docs/06_README_AGENTS.md`](docs/06_README_AGENTS.md)                                          | Índice y orden de lectura (empieza aquí)                              |
| [`docs/01_Contexto_y_Especificaciones.md`](docs/01_Contexto_y_Especificaciones.md)              | Producto, roles y permisos, diseño, stack, arquitectura, convenciones |
| [`docs/02_Base_de_Datos.md`](docs/02_Base_de_Datos.md)                                          | Diseño completo de la base de datos                                   |
| [`docs/03_Plan_de_Accion.md`](docs/03_Plan_de_Accion.md)                                        | Fases 0–6 con criterio de terminado                                   |
| [`docs/04_Articulo.md`](docs/04_Articulo.md) · [`docs/05_Cronograma.md`](docs/05_Cronograma.md) | Artículo y cronograma                                                 |
| [`docs/decisiones.md`](docs/decisiones.md)                                                      | Decisiones tomadas durante el desarrollo                              |
| [`docs/progreso.md`](docs/progreso.md)                                                          | Qué está hecho y qué falta por fase                                   |

## Requisitos

- Node.js 22 o superior
- pnpm 10 (`npm i -g pnpm@10`)
- Docker (para PostgreSQL 16 en local)

## Instalación

```bash
git clone git@github.com:Luis-hip/Nexo.git
cd Nexo
pnpm install
cp .env.example apps/api/.env
docker compose up -d
pnpm db:reset
pnpm db:test
pnpm dev
```

`pnpm db:reset` borra el esquema local, aplica las migraciones y carga la semilla. `pnpm db:test` debe terminar con **11 pruebas SQL OK**. La web queda en http://localhost:5173 y la API en http://localhost:3000.

**Acceso de desarrollo.** Con `DEV_LOGIN_ENABLED=true`, `POST /dev/login` con `{ "email": "valeria@nexo.mx" }` crea una sesión para cualquier usuario de la semilla (`GET /dev/usuarios` los lista). El servidor no arranca en producción con esa variable activa.

## Scripts

| Script                                               | Qué hace                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                                           | Web y API en modo desarrollo                                       |
| `pnpm build`                                         | Verifica tipos y construye la web                                  |
| `pnpm typecheck` · `pnpm lint` · `pnpm format:check` | Tipos, ESLint y formato                                            |
| `pnpm test`                                          | Pruebas (Vitest); las de integración de la API usan `DATABASE_URL` |
| `pnpm db:migrate` · `pnpm db:seed`                   | Aplicar migraciones · cargar la semilla                            |
| `pnpm db:test`                                       | Pruebas de integridad SQL (11 `OK`)                                |
| `pnpm db:reset`                                      | Base local desde cero (nunca en producción)                        |
| `pnpm db:tipos`                                      | Regenerar `apps/api/src/db/tipos.ts` desde la BD (se versiona)     |

## Estructura

```
apps/api/        Fastify + Kysely; db/migrations, db/seed, db/tests, scripts/
apps/web/        React + Vite + Tailwind v4
packages/shared/ Zod, constantes y (desde la Fase 1) permisos y color
docs/            Especificaciones, decisiones y progreso
.github/         CI y plantillas de issues y PR
```

## Cómo trabajamos: ramas y pull requests

Convención completa en [`docs/decisiones.md`, DEC-001](docs/decisiones.md#dec-001--convención-de-ramas-y-pull-requests).

- **`main`** es la rama protegida. Nadie hace _push_ directo a `main`.
- Cada integrante tiene **dos ramas**, creadas desde `main`, con el formato **`Dev_<Nombre>_<Back|Front>`**:

  | Integrante | Backend           | Frontend           |
  | ---------- | ----------------- | ------------------ |
  | Luis       | `Dev_Luis_Back`   | `Dev_Luis_Front`   |
  | Jova       | `Dev_Jova_Back`   | `Dev_Jova_Front`   |
  | Carlos     | `Dev_Carlos_Back` | `Dev_Carlos_Front` |
  | Isac       | `Dev_Isac_Back`   | `Dev_Isac_Front`   |

- Trabajo de API y BD en la rama `_Back`; trabajo de la web en la rama `_Front`.
- Los **pull requests salen de una rama `Dev_*` hacia `main`** y solo se fusionan con la **CI en verde**.
- Antes de abrir un PR, trae lo último de `main` a tu rama y resuelve ahí los conflictos.
- Commits en español: `tipo(modulo): descripción` (`feat`, `fix`, `docs`, `test`, `chore`).

Flujo típico:

```bash
git switch Dev_Luis_Back
git pull origin main
# … cambios …
git commit -m "feat(api): descripción del cambio"
git push origin Dev_Luis_Back
# Abrir el PR Dev_Luis_Back → main en GitHub y esperar la CI en verde
```
