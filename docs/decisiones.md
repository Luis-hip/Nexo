# Nexo · Registro de decisiones

> Regla (docs/03, sección 1.2): si algo no está en `01`/`02`, se elige lo más simple, se anota aquí y se sigue; si es irreversible, se pregunta. Cada entrada: fecha, contexto, decisión y consecuencia. Las decisiones pendientes del producto (D-01, D-02, D-03) siguen en `01_Contexto_y_Especificaciones.md`.

| ID | Fecha | Tema | Estado |
|---|---|---|---|
| DEC-001 | 2026-11-12 | Convención de ramas y *pull requests* (`dev`, `main`, `produccion`, `Dev_<Nombre>`) | Vigente (revisada el mismo día; actualiza `01`, sección 9, y `03`, regla 1) |
| DEC-002 | 2026-11-12 | Primera ejecución de los scripts SQL (tarea 0.4) | Vigente |
| DEC-003 | 2026-11-12 | La migración `0001` no tiene bajada | Vigente |
| DEC-004 | 2026-11-12 | Cómo se ejecutan las pruebas SQL | Vigente |
| DEC-005 | 2026-11-12 | TypeScript 5.9 en lugar de 7 | Vigente |
| DEC-006 | 2026-11-12 | La API se ejecuta con `tsx` (sin compilar) hasta la Fase 6 | Vigente |
| DEC-007 | 2026-11-12 | Formateador: Prettier | Vigente |
| DEC-008 | 2026-11-12 | Tokens de color tomados de la tabla de `01` | Provisional (Fase 1) |
| DEC-009 | 2026-11-12 | Nombre del repositorio y licencia | Licencia pendiente |
| DEC-010 | 2026-11-12 | Versiones fijadas al crear el repositorio | Vigente |

---

## DEC-001 · Convención de ramas y *pull requests*

**Contexto.** `01`, sección 9, proponía solo `main` y ramas cortas `modulo/descripcion`. El equipo decidió tener ramas compartidas por etapa y una rama fija por persona. (Una primera versión de esta decisión, con dos ramas por persona `Dev_<Nombre>_<Back|Front>`, se descartó el mismo día antes de subirse: no se separa back y front.)

**Decisión.**

Ramas compartidas (protegidas: **nadie sube directo**, solo por *pull request* con la CI en verde):

| Rama | Para qué | Recibe PR desde |
|---|---|---|
| `dev` | Integración y pruebas conjuntas del equipo | `Dev_<Nombre>` |
| `main` | Versión estable revisada | `dev` |
| `produccion` | Definitiva: **la que se despliega** (Fase 6) | `main` |

Ramas personales, creadas desde `dev`, **una por integrante** (sin separar back y front):

| Integrante | Rama |
|---|---|
| Luis | `Dev_Luis` |
| Jova | `Dev_Jova` |
| Carlos | `Dev_Carlos` |
| Isac | `Dev_Isac` |

**Flujo:** `Dev_<Nombre>` → PR a `dev` → PR a `main` → PR a `produccion`.

- Cada quien sube (*push*) solo a su rama `Dev_<Nombre>`.
- **Ramas cortas opcionales** (`modulo/descripcion`, p. ej. `tablero/arrastrar-tarjetas`): salen de la rama `Dev_<Nombre>` de su dueño y vuelven a ella por PR. No pueden llamarse `Dev_Luis/…`, porque Git no admite una rama `Dev_Luis` y otra `Dev_Luis/algo` a la vez.
- Antes de abrir un PR a `dev`, la rama personal se actualiza con `dev` (`git pull origin dev`) y los conflictos se resuelven en la propia rama.
- Las promociones `dev` → `main` y `main` → `produccion` se fusionan con **«Create a merge commit»** (no *squash* ni *rebase*), para que las tres ramas compartan historia y no aparezcan conflictos falsos en la siguiente promoción.
- Después de fusionar, la rama `Dev_<Nombre>` **no se borra**: se sigue usando y se vuelve a actualizar con `dev`.
- La CI corre en cada *push* a `main`, `dev`, `produccion` y `Dev_*`, y en cada PR hacia ellas. El check obligatorio es **«Verificar (BD, tipos, lint, pruebas, build)»**.
- Commits en español con el formato `tipo(modulo): descripción` (`feat`, `fix`, `docs`, `test`, `chore`), como dice `01`, sección 9.

**Protección en GitHub** (Settings → Branches, para `main`, `dev` y `produccion`): exigir PR antes de fusionar, exigir el check de CI en verde con la rama al día, incluir a los administradores y prohibir *push* forzado y borrado. Las reglas de protección solo se aplican en repositorios **públicos** o con plan de pago: si el repositorio pasa a privado con el plan gratuito, GitHub deja de hacerlas cumplir.

**Consecuencia.** Un cambio tarda tres PR en llegar a `produccion`, a cambio de probarse juntos en `dev` antes de `main`. Las ramas personales son de larga vida: hay que traer `dev` a menudo y mantener los PR pequeños (un cambio por PR, `03`, sección 1.1).

## DEC-002 · Primera ejecución de los scripts SQL (tarea 0.4)

**Contexto.** `02_Base_de_Datos.md` advierte que los scripts se reconstruyeron y no se volvieron a ejecutar.

**Decisión / resultado.** Se copiaron **sin modificar**: `01_esquema.sql` → `apps/api/db/migrations/0001_esquema.sql`, `02_semilla.sql` → `apps/api/db/seed/semilla.sql`, `03_pruebas.sql` → `apps/api/db/tests/pruebas.sql`. Sobre una base vacía (migrar → sembrar → pruebas) salieron las **11 líneas `OK`** (1, 2, 3, 4, 5, 6, 7, 7b, 8, 9, 10) **sin tener que corregir nada**.

- En local se ejecutó con **PGlite** (PostgreSQL compilado a WebAssembly, con `citext`), porque la máquina de desarrollo aún no tiene Docker ni `psql`. PGlite se basa en PostgreSQL 17, no en 16.
- La verificación contra **PostgreSQL 16** real la hace la CI (servicio `postgres:16`) en cada *push*. Si la CI da un resultado distinto, se registra aquí.

## DEC-003 · La migración `0001` no tiene bajada

**Contexto.** `01`, sección 10.12, pide subida y bajada en cada migración, pero el plan exige copiar `01_esquema.sql` sin modificar. `node-pg-migrate` trata un `.sql` sin marcadores como solo subida.

**Decisión.** `0001_esquema.sql` queda sin bajada. Para volver a empezar en local se usa `pnpm db:reset` (borra el esquema `public`, migra y siembra; se niega a correr con `NODE_ENV=production`). Desde la `0002` en adelante, cada migración lleva los marcadores `-- Up Migration` y `-- Down Migration`.

## DEC-004 · Cómo se ejecutan las pruebas SQL

**Decisión.** `pnpm db:test` ejecuta `pruebas.sql` con un script de Node (`apps/api/scripts/pruebas-sql.ts`): omite los metacomandos de `psql` (`\set …`), se detiene en el primer error (como `ON_ERROR_STOP`), exige **exactamente** las 11 líneas `OK` esperadas y lo hace **dentro de una transacción que se revierte**, para poder repetirlo sin `db:reset` y sin dejar datos de prueba. Funciona sin tener `psql` instalado. La CI, además, ejecuta la forma literal del plan (`psql -v ON_ERROR_STOP=1 … -f pruebas.sql`) y cuenta las 11 líneas.

## DEC-005 · TypeScript 5.9 en lugar de 7

**Contexto.** Al instalar, `pnpm` eligió TypeScript 7, que `typescript-eslint` todavía no soporta (ESLint fallaba al arrancar).

**Decisión.** Se fija `typescript@~5.9` en todo el monorepo. Se puede subir cuando `typescript-eslint` soporte la versión 7.

## DEC-006 · La API se ejecuta con `tsx` hasta la Fase 6

**Contexto.** `packages/shared` se consume como código TypeScript fuente y los imports no llevan extensión; compilar la API con `tsc` no produce ESM ejecutable por Node sin más configuración.

**Decisión.** `build` de la API solo verifica tipos; `dev` y `start` usan `tsx`. La forma de empaquetar para producción (por ejemplo `tsup`/`esbuild`) se decide en la Fase 6 junto con el alojamiento (D-03).

## DEC-007 · Formateador: Prettier

`01`, sección 6, permite Prettier u `oxfmt`. Se elige **Prettier** (más extendido; la CI corre `pnpm format:check`). No se formatean `docs/`, los `.sql` ni el archivo de tipos generado.

## DEC-008 · Tokens de color tomados de la tabla de `01`

El zip del prototipo no está en el repositorio. `apps/web/src/styles/tokens.css` usa la tabla de `01`, sección 5.2. En la Fase 1 (tarea 1.1) se contrastan con `src/index.css` del prototipo y se corrigen si difieren.

## DEC-009 · Nombre del repositorio y licencia

El plan sugería `nexo`; el repositorio ya existía como `Luis-hip/Nexo` y se conserva. **La licencia está pendiente**: la decide el equipo (no se agrega `LICENSE` hasta entonces). Verificar que el repositorio sea **privado** al inicio, como pide el plan.

## DEC-010 · Versiones fijadas al crear el repositorio

Quedan en `pnpm-lock.yaml`. Principales: Node ≥ 22 (CI con 22), pnpm 10, React 19.3, react-router 8, Vite 8, Tailwind 4.3, Fastify 5, Kysely 0.29 + kysely-codegen 0.20, node-pg-migrate 9, Zod 4, Vitest 5, ESLint 10. `fastify`, `kysely` y `zod` son las del stack de `01`, sección 6; ninguna librería tuvo que sustituirse.
