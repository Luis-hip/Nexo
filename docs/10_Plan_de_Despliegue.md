# Nexo · Plan de despliegue (Fase 3.5)

> **Cuándo se ejecuta:** después de terminar la **Fase 3** (Fase 3.5). **Hasta entonces no se despliega nada ni se crean cuentas.** Este documento se escribe ahora para que el equipo esté al corriente y para que Code pueda **preparar** lo que sí le toca (archivos de configuración y guía paso a paso).
>
> **Decisión (2026-11-16, DEC-027):** **front en Vercel**; **API, worker y base de datos en Render**; **dominio propio** con los subdominios `app.` y `api.`. Despliegue **automático solo desde la rama `produccion`**.

## 0. Cómo leer este documento

1. Lee antes `01_Contexto_y_Especificaciones.md` (sección 8), `07_Cambios_de_Alcance_Fase2.md` (Fase 2.5: secretos y procesos) y `09_Seguridad_y_Secretos.md`.
2. **Datos verificados** en la documentación oficial el 2026-11-15/16 llevan la marca ✔. Lo que **no se verificó** lleva la marca ⚠ y debe confirmarse en la documentación del servicio antes de actuar. **No inventes pasos ni precios.**
3. Reglas de siempre: ningún secreto en el repositorio; preguntar antes de cada `git push`; todo cambio de BD como migración nueva.

## 1. Quién hace qué

| Tarea | Code | Persona del equipo |
|---|:-:|:-:|
| Escribir/ajustar archivos de configuración (`render.yaml`, `vercel.json`, `.env.example`), cookie, CORS, scripts de arranque y migraciones | ✔ | Revisa |
| Mantener este documento al día y escribir la guía de operación | ✔ | Revisa |
| Crear cuentas en Vercel y Render, vincularlas a GitHub, aprobar pagos | | **✔** |
| Solicitar el GitHub Student Developer Pack y registrar el dominio | | **✔** (una persona; la oferta es de un solo uso por estudiante ⚠) |
| Crear los registros DNS en el registrador | | **✔** |
| Cargar los secretos en el panel de Render/Vercel | | **✔** (quien tenga permiso de administrador) |
| Ejecutar el despliegue con las herramientas de línea de comandos | Opcional | Opcional |

> Se recomienda **desplegar a mano la primera vez** (desde el panel) para controlar qué se publica y qué se paga. Si más adelante se instalan las herramientas de línea de comandos de Vercel y Render con sesión iniciada, Code podría ejecutar pasos concretos, siempre **con aprobación explícita**.

## 2. Arquitectura de despliegue

```
Navegador
   │ https://app.<dominio>                     https://api.<dominio>
   ▼                                                   ▼
Vercel  (front React/Vite, estático)        Render  (API Fastify + Socket.IO + pg-boss)
                                                       │
                                                       ▼
                                            Render PostgreSQL 16 (BD)
                                                       ▲
                          Meta (webhooks de WhatsApp) ─┘  → https://api.<dominio>/webhooks/whatsapp
```

- **`app.<dominio>`** → proyecto de Vercel. **`api.<dominio>`** → servicio web de Render. Son subdominios del **mismo sitio**, así que la cookie de sesión viaja entre ellos.
- El **worker** (`pg-boss`: avisos de WhatsApp, vencimientos, elecciones de 72 h) corre **en el mismo proceso** de la API; se separa a un servicio propio solo si hace falta.
- La API es el único lugar que habla con la BD y con WhatsApp.

## 3. Costos de referencia (precios de las páginas oficiales de Render al 2026-11-15 ✔; confirmar al contratar)

| Concepto | Referencia |
|---|---|
| Servicio web de pago más barato en Render | **$7/mes** (menos de 1 CPU, 512 MB) |
| PostgreSQL de pago más barato en Render | **$6/mes** (256 MB, 100 conexiones); restauración a un punto en el tiempo de 3 días en el plan Hobby |
| Cuota del espacio de trabajo Hobby | $0 |
| **Total aproximado API + BD** | **~$13/mes** (+ worker aparte, $7, solo si se separa) |
| Vercel (plan gratuito) | ⚠ **No verificado**: revisar límites y términos de uso del plan gratuito |
| Dominio | Según el registrador; con el GitHub Student Developer Pack puede ser gratis el primer año ⚠ |

**Si crece:** la BD sube a $19 (1 GB) y la API a $25 (1 CPU, 2 GB). Los servicios gratuitos de Render **no** sirven: el web service gratuito se apaga a los 15 min sin tráfico y el PostgreSQL gratuito expira a los 30 días y no tiene copias ✔.

## 4. Datos sobre Vercel que condicionan el diseño

> Como el chat (Socket.IO) y las tareas programadas (`pg-boss`) llegan en la Fase 4, **la decisión de alojar la API en Render ya está justificada desde ahora** para no tener que mover la API después.

- ✔ Las Functions de Vercel soportan WebSockets en **beta pública**, con un máximo de conexión de 1800 s (también beta) y estado compartido en un almacén externo. **Por eso la API no va en Vercel.**
- ⚠ El **front** es estático (React/Vite): es el uso más sencillo de Vercel. Confirmar en su documentación la configuración de un proyecto Vite.

## 5. Dominio propio

1. **Obtener el dominio.** Opciones: comprarlo en un registrador (por ejemplo Cloudflare, Namecheap o Porkbun ⚠) o usar la oferta del **GitHub Student Developer Pack** (dominio gratis el primer año con terminaciones como `.me`, `.tech` o `.dev`/`.app` según el socio ⚠; **no incluye `.com`**). Condiciones por confirmar en `education.github.com`: ser estudiante inscrito, correo escolar (BUAP) o prueba de inscripción, **un solo uso por estudiante**, **renovación a precio normal** después del primer año (apagar la renovación automática o decidirlo antes), y algún socio puede pedir tarjeta registrada.
2. **Quién lo solicita:** **una** persona del equipo; la aprobación puede tardar, así que **pedirlo antes de la Fase 3.5**.
3. **Subdominios:** `app.<dominio>` (Vercel) y `api.<dominio>` (Render). Cada plataforma indica en su panel el registro DNS exacto (normalmente un **CNAME**) ⚠: copiar lo que muestran, no lo que diga este documento.
4. El certificado HTTPS lo gestiona cada plataforma ⚠ (confirmar).

## 6. Estado del código y configuración que prepara Code (sin desplegar)

### 6.0 Qué hay hoy en el repositorio (revisado el 2026-11-16, `dev` en `a6d7895`)

| Elemento | Hoy | Falta |
|---|---|---|
| Comprobación de salud | `GET /salud` ✔ (en `apps/api/src/app.ts`) | — |
| Puerto y host | Lee `PORT` y escucha en `0.0.0.0` ✔ (Render asigna el puerto) | — |
| Cookie de sesión | `HttpOnly`, `SameSite=Lax`, `Secure` solo en producción, **sin `Domain`** ✔ | — |
| CORS | `origin: APP_URL`, `credentials: true` ✔; el front usa `credentials: 'include'` ✔ | Comprobar `Origin` en peticiones que modifican datos (Fase 2.5) |
| URL de la API en el front | `VITE_API_URL`, por omisión `http://localhost:3000` | En Vercel definir `VITE_API_URL=https://api.<dominio>` como variable **pública de construcción** |
| Arranque de la API | `start` usa `tsx --env-file-if-exists=.env`; `build` solo comprueba tipos (DEC-006) | Decidir cómo empaquetar (ver 6.3) |
| Migraciones | `pnpm db:migrate` (script con `tsx` y `node-pg-migrate`, ambos **dependencias de desarrollo**) | En Render, instalar con dependencias de desarrollo o empaquetar el script |
| Cadena de migraciones | Los scripts usan `DATABASE_URL` | Agregar `DATABASE_URL_MIGRACIONES` y los roles (Fase 2.5) |
| Validación de entorno | `config.ts` no exige secretos y `APP_URL` tiene valor local por omisión | Fase 2.5 (`07`, 3.5) |
| Tiempo real, tareas programadas, webhook | No existen (`socket.io`, `pg-boss` y la ruta `/webhooks/whatsapp` llegan en la Fase 4) | Este plan los trata como **futuros**; la prueba de humo (paso 10) y el paso 11 dependen de la Fase 4 |
| `render.yaml` y `vercel.json` | No existen | Los prepara Code (6.1 y 6.2) |

> **Ojo con el orden:** como la Fase 3.5 va después de la Fase 3 y **antes** de la Fase 4, el chat en tiempo real y WhatsApp aún no existirán al desplegar. Los pasos 10 (chat) y 11 (WhatsApp) se **repiten en la Fase 4**: en la 3.5 la prueba de humo cubre registro, equipos, votación, tablero y sprints; el chat y el webhook se comprueban cuando existan.

### 6.1 y siguientes: lo que se prepara

1. **`render.yaml`** (plantilla de infraestructura de Render ⚠ confirmar sintaxis vigente): un servicio web (API) y una base PostgreSQL 16; comando de construcción, comando de arranque, comprobación de salud (`GET /salud`), rama `produccion`, **sin valores de secretos** (`sync: false`).
2. **`vercel.json`** o configuración del proyecto (⚠ confirmar): directorio `apps/web`, comando `pnpm build`, salida `dist`, reescritura de rutas a `index.html` para el enrutador del front. Rama de producción: `produccion`.
3. **API para producción (DEC-006):** hoy corre con `tsx`. Decidir y anotar en `decisiones.md` la forma de empaquetar (por ejemplo `tsup`/`esbuild` o seguir con `tsx` en producción) y probar `pnpm build && pnpm start` en local.
4. **Migraciones en cada despliegue:** `pnpm db:migrate` como paso previo al arranque (⚠ confirmar si Render lo ofrece como comando previo al despliegue en el plan elegido; si no, ejecutarlo al arrancar). **La semilla no se carga en producción.**
5. **Roles de la BD (`07`, sección 2.2):** crear `nexo_migraciones` y `nexo_app`; la API usa `nexo_app` y las migraciones, `nexo_migraciones`. Dos cadenas de conexión distintas.
6. **Cookie de sesión:** `HttpOnly; Secure; SameSite=Lax`, **sin atributo `Domain`** (cookie del propio `api.<dominio>`; el navegador la envía a `api.` desde `app.` porque son del mismo sitio). El front llama a la API con `credentials: 'include'`.
7. **CORS:** origen permitido **solo** `https://app.<dominio>` (nunca `*`), con `Access-Control-Allow-Credentials: true`; lo mismo para Socket.IO (`cors.origin` y `credentials`).
8. **Protección adicional contra peticiones falsas:** verificar el encabezado `Origin` en las peticiones que modifican datos (debe ser `https://app.<dominio>`).
9. **Webhook de WhatsApp:** `https://api.<dominio>/webhooks/whatsapp`, con verificación de firma HMAC (`01`, 7.4).
10. **Variables de entorno de producción** (`01` sección 8, `09`): `NODE_ENV=production`, `DEV_LOGIN_ENABLED=false` (el servidor se niega a arrancar si es `true`), `DATABASE_URL` (rol `nexo_app`), `DATABASE_URL_MIGRACIONES`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `APP_URL=https://app.<dominio>`, `API_URL=https://api.<dominio>`, `WHATSAPP_*` si aplica. Un valor **distinto** al de local y al de CI.
11. **Ramas y despliegue automático:** conectar **solo `produccion`** a Vercel y a Render. En Vercel, desactivar o limitar los *preview deployments* de las ramas personales y de `dev` (⚠ confirmar el ajuste exacto); en Render, activar el despliegue automático **solo** para `produccion`.
12. **Guía de operación** `docs/operacion.md`: cómo ver registros, reiniciar, volver a una versión anterior, rotar un secreto, restaurar la BD.

## 7. Pasos de ejecución de la Fase 3.5 (en orden)

| # | Paso | Quién |
|---|---|---|
| 1 | Fase 3 terminada, CI en verde en `produccion` (promover `dev` → `main` → `produccion` por PR) | Equipo |
| 2 | Tener el dominio y acceso a su DNS | Persona |
| 3 | Crear la base PostgreSQL en Render; guardar las cadenas de conexión **solo** en el panel | Persona |
| 4 | Crear los roles `nexo_migraciones` y `nexo_app`; ejecutar las migraciones sobre la BD vacía | Persona + guía de Code |
| 5 | Crear el servicio web de Render desde el repositorio (rama `produccion`), cargar variables, esperar el primer despliegue | Persona |
| 6 | Agregar `api.<dominio>` en Render y crear el CNAME que indique | Persona |
| 7 | Crear el proyecto de Vercel desde el repositorio (rama `produccion`), cargar variables públicas, desplegar | Persona |
| 8 | Agregar `app.<dominio>` en Vercel y crear el registro DNS que indique | Persona |
| 9 | Comprobar HTTPS en ambos subdominios y que `GET /salud` responde | Persona |
| 10 | **Prueba de humo en producción:** registrarse, entrar, crear equipo, crear una propuesta, votar con otro usuario, mover una tarea en el tablero y comprobar los sprints. *(El chat en tiempo real se agrega a esta prueba en la Fase 4.)* | Equipo |
| 11 | WhatsApp: configurar el webhook en Meta con la URL pública, verificar la firma, enviar **un** mensaje de prueba. **Solo cuando exista en la Fase 4**; en la 3.5 se omite | Equipo |
| 12 | Activar las copias de seguridad/restauración del plan de BD y **probar una restauración** | Persona |
| 13 | Configurar avisos de uso y presupuesto en Render; revisar que `DEV_LOGIN_ENABLED=false` | Persona |
| 14 | Actualizar `progreso.md`, `README.md` (URL pública) y la tabla de verificación del artículo | Code + equipo |

## 8. Riesgos y qué hacer

| Riesgo | Señal | Respuesta |
|---|---|---|
| La cookie no llega a la API | Login funciona en local y no en producción | Verificar que front y API son subdominios del mismo dominio, `credentials: 'include'`, CORS con el origen exacto y `Secure` |
| WebSocket se corta o no conecta | El chat no actualiza | Confirmar `wss://api.<dominio>`, CORS de Socket.IO y que el servicio de Render no está en plan gratuito |
| Memoria insuficiente (512 MB) | Reinicios del servicio | Subir el plan de la API |
| BD de 256 MB / 100 conexiones | Errores de conexión | Limitar el *pool* de conexiones; subir de plan |
| Se publica algo por error | Despliegue desde otra rama | Solo `produccion` conectada; PR obligatorio |
| Secreto expuesto | Alerta de gitleaks o de GitHub | Rotarlo de inmediato (`09`) |
| Costos inesperados | Factura mayor | Avisos de uso; revisar el plan cada semana |
| El dominio gratuito vence al año | Aviso del registrador | Decidir renovar o cambiar; apagar la renovación automática si no se quiere |
| Un precio o límite cambió | Diferencia con este documento | Mandan los datos vigentes de las páginas oficiales; anotarlo en `decisiones.md` |

## 9. Reversión

- **API:** volver al despliegue anterior desde el panel de Render ⚠ (confirmar) o revertir el PR en `produccion`.
- **Front:** volver a un despliegue anterior desde Vercel ⚠ (confirmar).
- **BD:** las migraciones nuevas llevan *Down*; ante un daño real, restaurar a un punto en el tiempo (3 días en Hobby ✔) y repetir la prueba de humo.
- **Nunca** editar a mano la BD de producción para «arreglar» algo sin anotarlo.

## 10. Criterio de terminado de la Fase 3.5

- [ ] `https://app.<dominio>` y `https://api.<dominio>` responden con HTTPS.
- [ ] La prueba de humo del paso 10 pasa en producción (sin chat ni WhatsApp, que aún no existen).
- [ ] La cookie de sesión funciona entre los dos subdominios y el CORS solo admite el origen del front.
- [ ] `DEV_LOGIN_ENABLED=false` en producción y el servidor se niega a arrancar si fuera `true`.
- [ ] Solo la rama `produccion` despliega; las demás no publican nada.
- [ ] Las migraciones se aplicaron con `nexo_migraciones`; la API usa `nexo_app`; no se cargó la semilla.
- [ ] Hay copias de seguridad y se probó una restauración.
- [ ] Ningún secreto en el repositorio (gitleaks en verde) y los de producción solo en los paneles.
- [ ] `docs/operacion.md`, `progreso.md` y el `README.md` al día; DEC-027 actualizada con lo realmente usado.

## 11. Qué se actualiza en los demás documentos

`01` sección 0 (D-03 resuelta) y 8 (alojamiento, dominios, variables por entorno); `03` (Fase 3.5 y Fase 6 sin despliegue); `05` (Fase 3.5); `06` (tabla de documentos); `04` (la sección de arquitectura puede citar el despliegue **solo si ya existe**; con marca `[VERIFICAR]`); `decisiones.md` (DEC-027).
