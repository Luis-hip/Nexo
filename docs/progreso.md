# Nexo · Progreso

> Se actualiza al terminar cada fase (docs/03, sección 1.7): qué se hizo, qué quedó pendiente.

## Fase 0 · Arranque del repositorio y de la BD

**Estado:** en curso.

### Hecho

- **0.2 Monorepo** con pnpm: `apps/web` (Vite + React 19 + TypeScript + Tailwind v4 + react-router), `apps/api` (Fastify + TypeScript + `tsx`), `packages/shared` (Zod, constantes). `tsconfig.base.json` con `strict: true`, ESLint, Prettier y scripts raíz `dev`, `build`, `typecheck`, `lint`, `test`.
- **0.3 BD local:** `docker-compose.yml` con `postgres:16`; los tres scripts copiados sin modificar; migraciones con `node-pg-migrate`; scripts `db:migrate`, `db:seed`, `db:test`, `db:reset`.
- **0.4** Las **11 pruebas `OK`** salen sin cambios en los scripts (en local con PGlite; ver DEC-002). Pendiente de confirmar en la CI con PostgreSQL 16.
- **0.5 Tipos generados** con `kysely-codegen` en `apps/api/src/db/tipos.ts` (versionado); la CI comprueba que siguen al día.
- **0.6 CI** en `.github/workflows/ci.yml`: instala, levanta PostgreSQL 16, migra, siembra, pruebas SQL (falla si no hay 11 `OK`), tipos, `typecheck`, `lint`, formato, `test` y `build`.
- **0.8 Dev login:** `POST /dev/login { email }` y `GET /dev/usuarios`, solo con `DEV_LOGIN_ENABLED=true`; crean sesiones reales (token opaco, *hash* SHA-256 en `sesiones`, cookie `HttpOnly; SameSite=Lax`). El servidor **se niega a arrancar** con `NODE_ENV=production` y `DEV_LOGIN_ENABLED=true` (prueba automática).
- **0.1 (parcial):** `README.md`, `.gitignore`, plantillas de *issues* (tarea, error) y de PR; convención de ramas `Dev_<Nombre>_<Back|Front>` (DEC-001).

### Pendiente

- [ ] **Proteger `main`** en GitHub (Settings → Branches): exigir PR y el check **CI / Verificar** en verde; prohibir *push* directo.
- [ ] Confirmar que el repositorio es **privado** y decidir la **licencia** (DEC-009).
- [ ] Tablero de proyecto en GitHub (Por hacer / En curso / En revisión / Hecho) e *issues* por fase y módulo grande.
- [ ] CI en verde en `main` (se confirma tras el primer *push*).
- [ ] **0.7 WhatsApp** (Carlos e Isac, con Jova): cuenta de Meta for Developers, app, WABA, número de pruebas, verificación de la empresa, y llenar `docs/whatsapp-verificacion.md`. Con eso, decidir **D-01**.
- [ ] Probar `docker compose up -d` + `pnpm db:reset` en una máquina con Docker (la de Luis aún no lo tiene).
