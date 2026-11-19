# Nexo · Guía de operación y primer despliegue

> Complementa `10_Plan_de_Despliegue.md` (DEC-027, DEC-035). **Nada de esto se ha ejecutado todavía.** Reglas: ningún secreto en el repositorio ni en el chat; los valores solo viven en los paneles de Render y Vercel; preguntar antes de cada `git push`. Lo marcado con ⚠ no se verificó y debe confirmarse en el panel antes de actuar.

## 1. Antes de empezar

- [ ] Las Fases 2.5 y 3 están en `main` y la CI está en verde.
- [ ] Este trabajo (archivos `render.yaml`, `apps/web/vercel.json`, `.node-version`, ajustes de la API) llegó a `produccion` por PR (`Dev_Luis` → `dev` → `main` → `produccion`). Render y Vercel despliegan **solo** desde `produccion`.
- [ ] Tienes sesión en Render, Vercel, Porkbun y GitHub. Quien aprueba los pagos de Render es una persona del equipo (≈ $13/mes).
- [ ] Generaste (en tu equipo, sin pegarla en ningún chat) la clave de cifrado: `openssl rand -hex 32` (64 caracteres hexadecimales). Es distinta de la de local y de la de CI.

## 2. Render: base de datos y API

1. **Blueprint.** En Render: *New → Blueprint*, elige el repositorio y la rama `produccion`. Render lee `render.yaml` y propone `nexo-api` (web) y `nexo-bd` (PostgreSQL 16), ambos en **plan gratuito** ($0, decisión del 2026-11-18, DEC-036). Revisa que el total sea $0 **antes** de aprobar. ⚠ Confirma en la pantalla que la región es `virginia` y que el repositorio es el correcto.
2. **Variables que te pide.** `ENCRYPTION_KEY` (la de 64 hex) y `DATABASE_URL`. Para `DATABASE_URL` pon **por ahora** un valor provisional (por ejemplo la cadena interna de la BD): se corrige en el paso 4. `SESSION_SECRET` la genera Render.
3. **Primer despliegue.** Corre la construcción y, al arrancar, ejecuta `pnpm --filter @nexo/api db:migrate` (con `DATABASE_URL_MIGRACIONES`, el dueño de la BD) y luego la API. En el plan gratuito no existe `preDeployCommand`, por eso las migraciones van en el arranque. Si falla, mira los registros del despliegue. ⚠ Si `corepack` no existe en el entorno de Render, cambia el comando de construcción a `npm install -g pnpm@10.34.9 && pnpm install --frozen-lockfile --prod=false`. La semilla **no** se carga nunca.
4. **Rol de la API (`nexo_app`).** La migración 0008 crea `nexo_app` sin inicio de sesión (docs/09). Una persona lo habilita **una vez** con `pnpm.cmd --filter @nexo/api db:rol-app` (en PowerShell usa `pnpm.cmd` si la política de ejecución bloquea `pnpm.ps1`). El script lee de variables de entorno de esa terminal `DATABASE_URL_MIGRACIONES` (la **External Database URL** del dueño, del panel de la BD) y `NEXO_APP_PASSWORD` (contraseña nueva, larga y única), cuenta las migraciones aplicadas y ejecuta `ALTER ROLE nexo_app LOGIN PASSWORD …`. No imprime ni guarda las contraseñas.
   Luego arma la cadena `postgres://nexo_app:<contraseña>@<host interno>:5432/<nombre de la BD>` y guárdala como `DATABASE_URL` del servicio `nexo-api` en el panel. ⚠ **El nombre de la BD no es `nexo`**: Render añade un sufijo (aquí `nexo_2d6b`, host interno `dpg-dbv8lamk1f9s73bqg6tg-a`); cópialo del panel de la BD (sección Connections). Guarda la contraseña en tu gestor de contraseñas, no en el repo. Reinicia el servicio.
5. **Acceso a la BD.** ⚠ `render.yaml` no restringe las IP. Cuando termines el paso 4, limita el acceso externo en el panel de la BD.
6. **Salud.** `https://<servicio>.onrender.com/salud` debe responder `{"estado":"ok"}`.

## 3. Vercel: el front

1. *Add New → Project*, importa el repositorio.
2. **Root Directory:** `apps/web`. Vercel detecta Vite y usa `apps/web/vercel.json` (`pnpm build`, salida `dist`, reescritura a `index.html`). ⚠ Confirma que instala desde la raíz del monorepo (`workspace:*`); si falla, activa la opción de incluir archivos fuera del directorio raíz.
3. **Rama de producción:** *Settings → Git → Production Branch = `produccion`*. El `vercel.json` ya desactiva el despliegue de las demás ramas.
4. **Variable de construcción pública:** `VITE_API_URL=https://api.nexo.lol` (es pública: no pongas ningún secreto aquí).
5. ⚠ El plan gratuito (Hobby) tiene límites y términos de uso que no se verificaron: revísalos antes de contar con él.

## 4. DNS en Porkbun (`nexo.lol`)

Copia **exactamente** lo que indique cada plataforma, no lo que diga este documento.

| Subdominio | Lo crea | Registro |
|---|---|---|
| `api.nexo.lol` | Render (*Settings → Custom Domains*) | El que muestre Render (normalmente un CNAME) |
| `app.nexo.lol` | Vercel (*Settings → Domains*) | El que muestre Vercel (normalmente un CNAME) |
| `nexo.lol` (raíz) | Vercel (agregar el dominio y redirigir a `app.nexo.lol`) | El que muestre Vercel (normalmente un registro A) ⚠ |

El certificado HTTPS lo gestiona cada plataforma ⚠. La propagación puede tardar de minutos a horas. Para la tarea 0.7 (Meta) basta con que `https://nexo.lol` abra algo público.

## 5. Comprobaciones finales

- [ ] `https://api.nexo.lol/salud` y `https://app.nexo.lol` responden con HTTPS.
- [ ] La prueba de humo del paso 10 de `10`: registrarse, entrar, crear equipo, proponer una tarea, votar con otro usuario, mover una tarea en el tablero y ver los sprints. ⚠ En producción no hay `DEV_LOGIN`; la autenticación real llega en la Fase 5, así que hoy no se puede entrar sin ella. Hay que decidir cómo se prueba (ver «Pendiente»).
- [ ] La cookie funciona entre `app.` y `api.` y el CORS solo admite `https://app.nexo.lol`.
- [ ] `DEV_LOGIN_ENABLED=false` en Render (el servidor se niega a arrancar si es `true`).
- [ ] Copias de seguridad activas y **una restauración probada** (paso 12 de `10`).
- [ ] Avisos de uso y presupuesto configurados en Render.

## 6. Operación diaria

- **Registros.** Render: servicio `nexo-api` → *Logs*. Vercel: proyecto → *Deployments → Logs*. Los registros ocultan las rutas sensibles (`RUTAS_OCULTAS_EN_REGISTROS`).
- **Reiniciar.** Render: *Manual Deploy → Restart*. ⚠ Confirmar el nombre exacto del botón.
- **Volver a una versión anterior.** Render: *Rollbacks* del servicio. Vercel: *Deployments → Promote to Production* sobre un despliegue anterior. ⚠ Confirmar en el panel. Alternativa segura: revertir el PR en `produccion`.
- **Rotar un secreto.** Cambia el valor en el panel, reinicia el servicio y revisa `docs/09_Seguridad_y_Secretos.md`. `SESSION_SECRET` cierra todas las sesiones; **`ENCRYPTION_KEY` no se rota sin migrar lo ya cifrado**. Si un secreto se expuso, rótalo de inmediato y anota el incidente en `docs/seguridad-incidentes.md`.
- **Restaurar la BD.** Render ofrece recuperación a un punto en el tiempo (3 días en el plan Hobby, según `10` ✔). Después de restaurar, repite la prueba de humo. No edites a mano la BD de producción sin anotarlo.
- **Migraciones nuevas.** Van en `apps/api/db/migrations`, con *Down*, y se aplican solas en cada despliegue (`preDeployCommand`).

## 7. Límites del plan gratuito de Render (DEC-036)

- **La API se apaga tras 15 min sin tráfico.** La primera petición después tarda en despertarla (decenas de segundos). El front carga, pero el primer llamado a la API puede parecer lento o fallar por tiempo de espera.
- **Los temporizadores de la API no corren dormida.** Los plazos de las elecciones de líder (`trabajos/plazos.ts`) solo avanzan con la API despierta; se resuelven al volver a consultar (`GET /liderazgo`).
- **La BD gratuita expira a los 30 días y no tiene copias de seguridad.** Creada el 2026-11-18, Render indica que **expira el 2026-12-18** («Your database will expire on December 18, 2026»). Antes de esa fecha: pasar a un plan de pago (`0.1c-256mb`, ≈ $10.50/mes con el disco por defecto) o exportar los datos.
- **El chat en tiempo real (Fase 4)** necesita una API siempre encendida: ahí habrá que pasar la API a un plan de pago (`0.5c-512mb`, $7/mes).
- Las copias y la restauración probada del paso 12 de `10` **no son posibles** en este plan; ese criterio queda sin cumplir hasta pasar a pago.

## 8. Pendiente / decisiones

- ⚠ **Cómo probar en producción sin `DEV_LOGIN`.** La autenticación real es de la Fase 5. Opciones: probar solo `/salud` y las pantallas públicas hasta la Fase 5, o crear un usuario de prueba por un proceso de BD autorizado. Decidir en equipo (DEC-035).
- El chat en tiempo real y el webhook de WhatsApp no existen hasta la Fase 4; sus pruebas se repiten entonces.
- La lista de IP permitidas de la BD y la región se revisan al crear el Blueprint.
