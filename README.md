# Nexo

Aplicación web de trabajo colaborativo tipo tablero para equipos pequeños (hasta 8 miembros activos), con una aportación propia: **avisos en el grupo de WhatsApp del equipo**, configurados por el líder y con consentimiento individual.

> Estado: **Fase 1 · Base, roles y espacio personal** (ver [`docs/progreso.md`](docs/progreso.md)).

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

**Acceso de desarrollo.** Abre http://localhost:5173/entrar y elige un usuario de la semilla (por ejemplo Paola, que solo tiene espacio personal, o Valeria, líder del Equipo Nexo). Solo funciona con `DEV_LOGIN_ENABLED=true`; el servidor no arranca en producción con esa variable activa. En desarrollo, http://localhost:5173/interna/componentes muestra todos los componentes de la interfaz.

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
```
