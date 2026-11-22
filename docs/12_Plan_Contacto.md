# Nexo — Módulo de Contacto y Soporte (buzón de dudas, errores y sugerencias)

> Documento de especificación + plan de acción para implementación **completa** (no MVP).
> Pensado para pasarse tal cual a Claude Code en el repo de Nexo.
> Rama de trabajo: `Dev_Luis` → PR a `dev`. Nadie sube directo a `dev`, `main` ni `produccion`.

---

## 0. Instrucciones para quien implemente (leer primero)

1. **Auditar antes de escribir.** Este documento asume el stack descrito en la sección 1.3. Antes de crear nada, revisa el repo y confirma o corrige esos supuestos (framework de la API, driver/ORM, cómo se llaman los procesos almacenados hoy, tabla de usuarios y roles, sistema de autenticación, cómo corre el worker, librería de UI del front). **Donde este documento y el repo discrepen, gana el repo**: adapta nombres y convenciones, no impongas las de aquí.
2. **Convenciones obligatorias del proyecto:**
   - Toda operación de BD va como **proceso almacenado**. El código de la API/worker **no lleva SQL de negocio**; solo invoca los procesos.
   - Los procesos se documentan en el **doc de procesos almacenados** existente (agregar una sección «Contacto»).
   - Los **secretos y claves no se exponen**: solo variables de entorno, nunca en el repo, logs, respuestas de la API ni el front. Solo quien tenga permiso de desarrollador los ve.
3. **Coordinación:** otro integrante trabaja la conexión con WhatsApp (Fase 4). Este módulo **no implementa WhatsApp**; solo deja una interfaz de canal de notificación para que se enchufe después (sección 7.4).
4. **Entrega en commits pequeños**, uno por paso de la sección 12, cada uno con su criterio de aceptación cumplido. Al terminar, abrir PR de `Dev_Luis` hacia `dev`.
5. Todo el texto visible al usuario va **en español**. Código, nombres de funciones y comentarios técnicos siguen la convención ya usada en el repo.

---

## 1. Objetivo, alcance y supuestos

### 1.1 Objetivo
Que usuarios **registrados y no registrados** puedan enviar dudas, reportes de errores y sugerencias desde la app, y que el equipo (desarrolladores/administradores) **los reciba, gestione y responda** con trazabilidad, sin depender de un correo compartido.

### 1.2 Alcance (todo esto entra)
- Formulario público de contacto (visitantes y usuarios con sesión).
- Persistencia en PostgreSQL con folio de seguimiento por mensaje.
- Panel de administración: bandeja, filtros, búsqueda, detalle con hilo, notas internas, asignación, cambio de estado, prioridad, respuestas al remitente, métricas y exportación CSV.
- Notificaciones por correo: aviso al equipo, confirmación al remitente, respuesta del equipo al remitente.
- Consulta pública del estado de un mensaje con folio + token.
- Protección anti-abuso (captcha, honeypot, rate limit, validación, sanitización).
- Auditoría (bitácora de eventos), retención y anonimización de datos.
- Pruebas (BD, API, worker, front, e2e) y documentación.

### 1.3 Supuestos a verificar en el repo (paso 0)
| Supuesto | Fuente | Verificar |
|---|---|---|
| Front en Vercel, API + worker + BD en Render, dominio `nexo.lol` (`app.` / `api.`) | Decisiones del equipo | Nombres reales de servicios y variables |
| PostgreSQL con lógica en procesos almacenados | Decisión del equipo | Si se usan `FUNCTION` o `PROCEDURE`, y el prefijo/convención de nombres |
| Existe tabla de usuarios y un esquema de roles/permisos (admin, líder, desarrollador, integrante) | Decisión del equipo | Nombre de tablas, cómo se emiten/validan los permisos |
| Existe un worker en Render | Decisión del equipo | Framework de jobs, cómo se programan tareas |
| Tamaño de equipo y roles: líder + integrantes | Decisión del equipo | Quién debe poder gestionar contacto |

> Si en el repo no existe sistema de roles/permisos reutilizable, crear los permisos `contacto.ver` y `contacto.gestionar` siguiendo el mecanismo que ya exista; si no hay ninguno, usar el rol de desarrollador/administrador como único autorizado y dejar el permiso granular documentado como siguiente paso.

---

## 2. Decisiones de diseño

| # | Decisión | Motivo |
|---|---|---|
| D1 | La **BD es la fuente de verdad**; el correo es solo notificación | Un correo perdido, rebotado o en spam no puede perder un mensaje |
| D2 | **Outbox en BD** para notificaciones (tabla `contacto_outbox` + worker) | La API responde rápido, los envíos se reintentan, y no se pierde nada si el proveedor de correo falla |
| D3 | Correo por **API HTTP** del proveedor (p. ej. Resend, Brevo o Mailgun), no SMTP directo | Render restringe puertos SMTP salientes en planes gratuitos (confirmar en su documentación vigente). El proveedor concreto se elige por el equipo; el código debe quedar detrás de una interfaz `EmailProvider` |
| D4 | **Cloudflare Turnstile** como captcha (gratuito, poco intrusivo); verificar siempre en servidor | El endpoint público es el vector de abuso principal |
| D5 | **Folio** legible (`NX-2026-000123`) + **token de seguimiento** secreto, guardado solo como hash | Permite a un visitante consultar su caso sin cuenta, sin exponer datos de otros |
| D6 | **Bitácora de eventos** única (`contacto_eventos`) para notas, respuestas, cambios de estado y asignaciones | Un solo hilo cronológico, auditable |
| D7 | La IP se guarda como **HMAC con sal secreta**, nunca en claro | Anti-abuso sin almacenar dato personal directo |
| D8 | Adjuntos (capturas) **fuera de alcance** en esta fase | El disco de Render es efímero; requiere almacenamiento de objetos externo. Se documenta como mejora futura. En su lugar, el formulario de «error» captura contexto técnico automático (URL, navegador, versión) |
| D9 | WhatsApp **no se implementa aquí**; solo la interfaz de canal | Evitar trabajo duplicado con el integrante de WhatsApp |

---

## 3. Modelo de datos

> Ajustar nombres de tabla de usuarios (`usuarios`), tipos de ID y esquema al repo real. Todas las fechas en `TIMESTAMPTZ`.

### 3.1 Secuencia y folio
```sql
CREATE SEQUENCE contacto_folio_seq START 1;
-- Folio: 'NX-' || año || '-' || lpad(nextval, 6, '0')  → NX-2026-000123
```

### 3.2 `contacto_mensajes`
```sql
CREATE TABLE contacto_mensajes (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  folio                  TEXT        NOT NULL UNIQUE,
  tipo                   TEXT        NOT NULL CHECK (tipo IN ('duda','error','sugerencia')),
  estado                 TEXT        NOT NULL DEFAULT 'nuevo'
                         CHECK (estado IN ('nuevo','en_revision','esperando_usuario','resuelto','descartado')),
  prioridad              TEXT        NOT NULL DEFAULT 'normal'
                         CHECK (prioridad IN ('baja','normal','alta')),
  usuario_id             BIGINT      NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre                 VARCHAR(100) NOT NULL,
  correo                 VARCHAR(254) NOT NULL,
  asunto                 VARCHAR(150) NOT NULL,
  mensaje                TEXT        NOT NULL CHECK (char_length(mensaje) BETWEEN 10 AND 5000),
  contexto               JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- url, navegador, versión app, idioma (solo tipo 'error' lo llena el front)
  token_seguimiento_hash TEXT        NOT NULL,                        -- SHA-256 del token; el token plano solo viaja en el correo de confirmación
  ip_hash                TEXT        NULL,                            -- HMAC-SHA256(ip, IP_HASH_SALT)
  user_agent             VARCHAR(300) NULL,
  asignado_a             BIGINT      NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  anonimizado            BOOLEAN     NOT NULL DEFAULT FALSE,
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendido_en            TIMESTAMPTZ NULL,   -- primera acción del equipo (para métrica de tiempo de primera respuesta)
  resuelto_en            TIMESTAMPTZ NULL
);

CREATE INDEX idx_contacto_estado_creado   ON contacto_mensajes (estado, creado_en DESC);
CREATE INDEX idx_contacto_tipo            ON contacto_mensajes (tipo);
CREATE INDEX idx_contacto_asignado        ON contacto_mensajes (asignado_a) WHERE asignado_a IS NOT NULL;
CREATE INDEX idx_contacto_usuario         ON contacto_mensajes (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX idx_contacto_correo          ON contacto_mensajes (lower(correo));
-- Búsqueda de texto (español)
CREATE INDEX idx_contacto_busqueda ON contacto_mensajes
  USING GIN (to_tsvector('spanish', coalesce(asunto,'') || ' ' || coalesce(mensaje,'') || ' ' || coalesce(nombre,'')));
```
Trigger para mantener `actualizado_en` en cada `UPDATE`.

### 3.3 `contacto_eventos` (hilo y bitácora)
```sql
CREATE TABLE contacto_eventos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mensaje_id  BIGINT      NOT NULL REFERENCES contacto_mensajes(id) ON DELETE CASCADE,
  tipo_evento TEXT        NOT NULL CHECK (tipo_evento IN
              ('creado','nota_interna','respuesta','cambio_estado','cambio_prioridad','asignacion','sistema')),
  autor_id    BIGINT      NULL REFERENCES usuarios(id) ON DELETE SET NULL,  -- NULL = sistema / remitente
  contenido   TEXT        NULL CHECK (contenido IS NULL OR char_length(contenido) <= 5000),
  metadatos   JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- p. ej. {"de":"nuevo","a":"en_revision"}
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacto_eventos_mensaje ON contacto_eventos (mensaje_id, creado_en);
```
- `nota_interna`: solo visible para el equipo.
- `respuesta`: visible también para el remitente en la consulta de seguimiento.

### 3.4 `contacto_outbox` (notificaciones pendientes)
```sql
CREATE TABLE contacto_outbox (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mensaje_id       BIGINT      NOT NULL REFERENCES contacto_mensajes(id) ON DELETE CASCADE,
  evento_id        BIGINT      NULL REFERENCES contacto_eventos(id) ON DELETE SET NULL,
  canal            TEXT        NOT NULL DEFAULT 'correo' CHECK (canal IN ('correo','whatsapp')),
  plantilla        TEXT        NOT NULL CHECK (plantilla IN ('aviso_equipo','confirmacion_remitente','respuesta_remitente')),
  destinatario     TEXT        NOT NULL,
  estado           TEXT        NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','procesando','enviado','fallido')),
  intentos         INT         NOT NULL DEFAULT 0,
  proximo_intento  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_error     TEXT        NULL,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  enviado_en       TIMESTAMPTZ NULL
);
CREATE INDEX idx_outbox_pendientes ON contacto_outbox (proximo_intento) WHERE estado IN ('pendiente','procesando');
```

### 3.5 `contacto_intentos` (rate limit en BD)
```sql
CREATE TABLE contacto_intentos (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_clave TEXT        NOT NULL CHECK (tipo_clave IN ('ip','correo','global')),
  clave_hash TEXT        NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_intentos_clave ON contacto_intentos (tipo_clave, clave_hash, creado_en DESC);
```
Se usa BD (no memoria del proceso) porque la API puede escalar a más de una instancia en Render.

### 3.6 Permisos
Crear (con el mecanismo existente de roles/permisos): `contacto.ver` (leer bandeja y detalle) y `contacto.gestionar` (cambiar estado, asignar, notas, responder, exportar). Los roles administrador y desarrollador tienen ambos.

---

## 4. Procesos almacenados

> Prefijo `sp_contacto_*`. Las lecturas que devuelven filas son `FUNCTION ... RETURNS TABLE`; las escrituras pueden ser `FUNCTION` que retornan el resultado o `PROCEDURE` con parámetros `OUT`, según la convención del repo. Toda escritura multi-tabla va en **una sola transacción**. Los errores de negocio se lanzan con `RAISE EXCEPTION` usando códigos `SQLSTATE` propios (p. ej. `'NX001'`) que la API traduce a HTTP.

| Proceso | Entradas | Comportamiento | Salida |
|---|---|---|---|
| `sp_contacto_verificar_limite` | `p_ip_hash`, `p_correo_hash` | Cuenta intentos en ventanas: IP ≤ 3/hora y ≤ 10/día; correo ≤ 3/día; global ≤ 200/hora. Si excede lanza `NX_LIMITE`. Si no, registra el intento. | `retry_after_seg` si excede |
| `sp_contacto_crear` | `p_tipo, p_nombre, p_correo, p_asunto, p_mensaje, p_usuario_id, p_contexto, p_token_hash, p_ip_hash, p_user_agent` | Valida tipo y longitudes; normaliza correo a minúsculas; genera folio con la secuencia; inserta mensaje; inserta evento `creado`; encola 2 filas en outbox (`aviso_equipo` a la dirección del equipo y `confirmacion_remitente` al correo del remitente). Todo en una transacción. | `id`, `folio` |
| `sp_contacto_listar` | `p_estado[]`, `p_tipo[]`, `p_prioridad[]`, `p_asignado_a`, `p_solo_sin_asignar`, `p_busqueda`, `p_desde`, `p_hasta`, `p_orden`, `p_limite`, `p_offset` | Filtra y pagina; búsqueda con `to_tsvector('spanish')` + coincidencia por folio/correo; ordena por fecha o prioridad. Excluye `mensaje` completo (solo extracto de 160 caracteres). | filas + `total` |
| `sp_contacto_obtener` | `p_id` | Devuelve el mensaje completo y su lista de eventos ordenada. | mensaje + eventos |
| `sp_contacto_cambiar_estado` | `p_id, p_nuevo_estado, p_autor_id` | Valida transición (matriz 4.1). Registra evento `cambio_estado`. Marca `atendido_en` si es la primera acción; marca `resuelto_en` al pasar a `resuelto` y lo limpia si se reabre. | mensaje actualizado |
| `sp_contacto_cambiar_prioridad` | `p_id, p_prioridad, p_autor_id` | Actualiza y registra evento. | mensaje actualizado |
| `sp_contacto_asignar` | `p_id, p_asignado_a, p_autor_id` | Valida que el asignado exista, esté activo y tenga `contacto.gestionar` (o `NULL` para desasignar). Evento `asignacion`. Si el estado es `nuevo`, pasa a `en_revision`. | mensaje actualizado |
| `sp_contacto_agregar_nota` | `p_id, p_contenido, p_autor_id` | Inserta evento `nota_interna`. Marca `atendido_en` si aplica. | evento |
| `sp_contacto_responder` | `p_id, p_contenido, p_autor_id, p_marcar_estado` | Inserta evento `respuesta`; encola `respuesta_remitente` en outbox; opcionalmente cambia estado a `esperando_usuario` o `resuelto`. Una sola transacción. | evento |
| `sp_contacto_seguimiento` | `p_folio, p_token_hash` | Compara hash en tiempo constante; devuelve estado, tipo, asunto, fechas y **solo** eventos `respuesta` (nunca notas internas). Si no coincide: error genérico (no revelar si el folio existe). | datos públicos |
| `sp_contacto_metricas` | `p_desde, p_hasta` | Totales por tipo y estado; abiertos vs. resueltos; tiempo medio de primera respuesta (`atendido_en - creado_en`) y de resolución; mensajes por día; top asignados. | un registro JSON/tabla |
| `sp_contacto_exportar` | mismos filtros que `listar` (sin paginar, tope de 10 000) | Devuelve filas para CSV. | filas |
| `sp_contacto_outbox_tomar` | `p_limite` | `SELECT ... FOR UPDATE SKIP LOCKED` de pendientes con `proximo_intento <= now()`; las marca `procesando` y suma intento. Recupera filas `procesando` con más de 10 min (worker caído). | filas con datos para armar el correo |
| `sp_contacto_outbox_resultado` | `p_id, p_ok, p_error` | Si ok → `enviado`. Si falla → backoff exponencial (1, 5, 15, 60, 180 min) y tras 5 intentos `fallido`. | — |
| `sp_contacto_anonimizar` | `p_id` o `p_correo` | Reemplaza `nombre`, `correo`, `ip_hash`, `user_agent`, `mensaje` y contenido de eventos por marcas fijas; `anonimizado = TRUE`. Para solicitudes de eliminación de datos. | filas afectadas |
| `sp_contacto_purgar` | `p_meses_retencion` (def. 12) | Anonimiza mensajes `resuelto`/`descartado` con más de N meses; borra `contacto_intentos` con más de 7 días y outbox `enviado` con más de 90 días. | conteos |

### 4.1 Matriz de transiciones de estado
```
nuevo              → en_revision, resuelto, descartado
en_revision        → esperando_usuario, resuelto, descartado
esperando_usuario  → en_revision, resuelto, descartado
resuelto           → en_revision            (reabrir)
descartado         → en_revision            (reabrir)
```
Cualquier otra transición lanza `NX_TRANSICION_INVALIDA`.

### 4.2 Códigos de error propios
| SQLSTATE | Significado | HTTP |
|---|---|---|
| `NX001` | Datos inválidos | 400 |
| `NX002` | No encontrado / token inválido | 404 |
| `NX003` | Transición de estado inválida | 409 |
| `NX004` | Usuario asignado inválido | 422 |
| `NX_LIMITE` (definir código) | Límite de envíos excedido | 429 |

---

## 5. API

Base: `https://api.nexo.lol`. Respuestas en JSON. Errores con forma uniforme:
```json
{ "error": { "codigo": "VALIDACION", "mensaje": "El mensaje debe tener al menos 10 caracteres.", "campos": { "mensaje": "Muy corto" } } }
```

### 5.1 Endpoints públicos

**`POST /api/contacto`** — crear mensaje (visitantes y usuarios con sesión).
```json
// Request
{
  "tipo": "error",                  // duda | error | sugerencia
  "nombre": "Ana Pérez",            // si hay sesión, se ignora y se toma de la cuenta
  "correo": "ana@correo.com",       // idem
  "asunto": "No carga mi tablero",
  "mensaje": "Al abrir el tablero ...",
  "contexto": { "url": "/tableros/3", "navegador": "Chrome 130", "version_app": "0.3.0" },
  "captcha_token": "<turnstile>",
  "web": ""                         // honeypot: debe venir vacío
}
// Response 201
{ "folio": "NX-2026-000123", "mensaje": "Recibimos tu mensaje. Te avisaremos por correo." }
```
Flujo en la API:
1. Rechazar silenciosamente (responder 201 falso, sin guardar) si el honeypot `web` no está vacío.
2. Validar con esquema (sección 5.3). Sanitizar texto.
3. Verificar captcha contra Turnstile (servidor). Falla → 400 `CAPTCHA_INVALIDO`.
4. Calcular `ip_hash` y `correo_hash`; llamar `sp_contacto_verificar_limite`. Excede → 429 con `Retry-After`.
5. Generar token de seguimiento aleatorio (≥ 32 bytes, URL-safe); guardar solo su SHA-256.
6. Llamar `sp_contacto_crear`.
7. Devolver folio. **El token plano nunca se devuelve en la respuesta**: solo viaja en el correo de confirmación (enlace de seguimiento).

**`GET /api/contacto/seguimiento?folio=...&token=...`** — consulta de estado.
Respuesta: `{ folio, tipo, asunto, estado, creado_en, actualizado_en, respuestas: [{contenido, creado_en}] }`.
Sin coincidencia → 404 genérico. Limitar a 20 consultas/hora por IP.

### 5.2 Endpoints de administración
Todos requieren sesión válida + permiso. `ver` para lecturas, `gestionar` para escrituras.

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `GET /api/admin/contacto` | ver | Lista con filtros `estado, tipo, prioridad, asignado, sin_asignar, q, desde, hasta, orden, pagina, por_pagina` (máx. 100). Devuelve `{ datos, total, pagina, por_pagina }`. |
| `GET /api/admin/contacto/:id` | ver | Detalle + eventos. |
| `PATCH /api/admin/contacto/:id/estado` | gestionar | `{ "estado": "en_revision" }` |
| `PATCH /api/admin/contacto/:id/prioridad` | gestionar | `{ "prioridad": "alta" }` |
| `PATCH /api/admin/contacto/:id/asignacion` | gestionar | `{ "asignado_a": 7 }` o `null` |
| `POST /api/admin/contacto/:id/notas` | gestionar | `{ "contenido": "..." }` |
| `POST /api/admin/contacto/:id/respuestas` | gestionar | `{ "contenido": "...", "estado_resultante": "esperando_usuario" \| "resuelto" \| null }` |
| `GET /api/admin/contacto/metricas` | ver | Parámetros `desde`, `hasta`. |
| `GET /api/admin/contacto/exportar.csv` | gestionar | Mismos filtros; CSV UTF-8 con BOM, con neutralización de fórmulas (prefijar `'` a celdas que empiecen con `=`, `+`, `-`, `@`). |
| `GET /api/admin/contacto/pendientes/conteo` | ver | `{ nuevos: n }` para el indicador del menú. |
| `DELETE /api/admin/contacto/:id/datos` | gestionar | Anonimiza (llama `sp_contacto_anonimizar`). Requiere confirmación explícita en el front. |

### 5.3 Validaciones (esquema)
| Campo | Regla |
|---|---|
| `tipo` | enum `duda`/`error`/`sugerencia` |
| `nombre` | 2–100 caracteres, recortado |
| `correo` | formato válido, ≤ 254, minúsculas |
| `asunto` | 3–150 |
| `mensaje` | 10–5000 |
| `contexto` | objeto con claves permitidas (`url`, `navegador`, `version_app`, `idioma`), cada valor ≤ 300 caracteres; el resto se descarta |
| Nota / respuesta | 1–5000 |

Sanitización: eliminar caracteres de control, normalizar espacios; **no** aceptar HTML (texto plano). Escapar siempre al renderizar.

### 5.4 Seguridad de la API (checklist)
- CORS restringido a `https://app.nexo.lol` (y localhost solo en desarrollo).
- Si la sesión usa cookies: protección CSRF en rutas de admin y `SameSite` adecuado.
- Límite de tamaño de cuerpo (p. ej. 20 KB) en el endpoint público.
- Cabeceras de seguridad (helmet o equivalente).
- `ip_hash = HMAC-SHA256(ip, IP_HASH_SALT)`. Respetar la IP real tras el proxy de Render (`trust proxy` configurado correctamente, no confiar en cabeceras arbitrarias).
- Comparación de hashes de token en tiempo constante.
- Los logs **no** registran cuerpo del mensaje, correo ni token; solo folio e ID.
- Prevenir inyección de cabeceras en correos: nunca interpolar entradas del usuario en `From`, `To`, `Subject` sin sanitizar saltos de línea; el `Reply-To` de las respuestas del equipo es la dirección del equipo, no la del remitente.
- Abuso de «confirmación al remitente» (usar el formulario para mandar correos a terceros): mitigado por captcha + límite por correo (3/día) + plantilla de confirmación neutra y sin contenido escrito por el usuario.

---

## 6. Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | API | Secreto de verificación del captcha |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` *(o equivalente del front)* | Front | Clave pública del captcha |
| `EMAIL_PROVIDER_API_KEY` | Worker | Clave del proveedor de correo |
| `EMAIL_FROM` | Worker | Remitente, p. ej. `Nexo <contacto@nexo.lol>` |
| `EMAIL_REPLY_TO` | Worker | Dirección del equipo para respuestas |
| `CONTACTO_EQUIPO_DESTINO` | Worker/API | Dirección que recibe los avisos del equipo |
| `IP_HASH_SALT` | API | Sal secreta para HMAC de IP/correo (≥ 32 bytes aleatorios) |
| `APP_URL` | API/Worker | `https://app.nexo.lol`, para armar enlaces |
| `CONTACTO_RETENCION_MESES` | Worker | Por defecto 12 |

Actualizar `.env.example` (sin valores reales) y el doc de secretos. Dar de alta los valores reales en Render y Vercel, no en el repo.

---

## 7. Worker y notificaciones

### 7.1 Procesamiento del outbox
- Ciclo cada 15–30 s: `sp_contacto_outbox_tomar(10)` → por cada fila, armar correo según `plantilla` → enviar por `EmailProvider` → `sp_contacto_outbox_resultado`.
- Concurrencia segura gracias a `FOR UPDATE SKIP LOCKED`; si hay más de una instancia del worker no se duplican envíos.
- Backoff exponencial y máximo de 5 intentos (definido en el proceso almacenado). Las filas `fallido` se muestran en el panel (sección 8.3) para reenvío manual.

### 7.2 Plantillas de correo (HTML + versión texto plano, en español)
1. **`aviso_equipo`** — asunto: `[Nexo][{tipo}] {folio} — {asunto}`. Cuerpo: tipo, remitente (nombre + si es usuario registrado), extracto del mensaje (primeros 300 caracteres, escapado) y botón «Abrir en el panel» → `{APP_URL}/admin/contacto/{id}`. Prioridad alta se indica en el asunto.
2. **`confirmacion_remitente`** — «Recibimos tu mensaje». Incluye folio y enlace de seguimiento `{APP_URL}/contacto/seguimiento?folio=...&token=...`. **No repite el contenido** escrito por el usuario.
3. **`respuesta_remitente`** — contenido de la respuesta del equipo (escapado), folio y enlace de seguimiento. `Reply-To` = dirección del equipo.

Los tres: diseño sobrio con identidad de Nexo, enlace de «No fuiste tú / ignora este mensaje», sin imágenes remotas obligatorias.

### 7.3 Entregabilidad del dominio (tarea de configuración)
Configurar en el DNS de `nexo.lol` los registros que indique el proveedor: **SPF, DKIM** y **DMARC** (empezar con `p=none`, subir a `quarantine` tras verificar). Probar con un destinatario Gmail y otro Outlook y revisar que no caiga en spam. Documentar los registros usados.

### 7.4 Interfaz de canal (para el integrante de WhatsApp)
Definir en el worker:
```ts
interface CanalNotificacion {
  canal: 'correo' | 'whatsapp';
  enviar(item: OutboxItem): Promise<{ ok: boolean; error?: string }>;
}
```
Solo se implementa `CanalCorreo`. El worker resuelve el canal por `contacto_outbox.canal`. Cuando WhatsApp esté listo, bastará registrar su implementación y encolar filas con `canal = 'whatsapp'` (p. ej. aviso al equipo). **No tocar ni duplicar la integración de WhatsApp.**

### 7.5 Tareas programadas
- Diaria: `sp_contacto_purgar(CONTACTO_RETENCION_MESES)`.
- Opcional configurable: recordatorio al equipo si hay mensajes `nuevo` con más de 48 h sin atender (un solo correo resumen por día).

---

## 8. Frontend

> Usar la librería de UI, el sistema de rutas y el manejo de estado que ya tenga el front. Accesible (etiquetas, foco, contraste, navegación por teclado) y responsivo.

### 8.1 Entrada al formulario
Enlace «Contacto» visible en el pie/menú tanto para visitantes como para sesión iniciada → ruta pública `/contacto`.

### 8.2 Página pública `/contacto`
- Selector de **tipo** (Duda / Error / Sugerencia) con descripción corta de cada uno.
- Campos: nombre, correo, asunto, mensaje (contador de caracteres 0/5000). Con sesión: nombre y correo precargados y de solo lectura.
- Para tipo «Error»: texto de ayuda («¿qué hacías, qué esperabas y qué pasó?») y captura automática, no editable, de URL previa, navegador y versión de la app en `contexto` (informar al usuario de qué se envía).
- Campo honeypot `web` oculto con CSS y `aria-hidden`/`tabindex="-1"`, `autocomplete="off"`.
- Widget Turnstile.
- Aviso de privacidad con enlace y casilla de aceptación (obligatoria).
- Estados: validación en línea, botón deshabilitado y «Enviando…», éxito (muestra folio y explica que llegó un correo con el enlace de seguimiento), error 429 («Has enviado muchos mensajes, intenta de nuevo en N minutos»), error de captcha, error de red con reintento y **sin perder lo escrito**.

### 8.3 Página `/contacto/seguimiento`
Lee `folio` y `token` de la URL (o permite pegarlos). Muestra estado con insignia, fechas y las respuestas del equipo. Mensaje genérico si no se encuentra.

### 8.4 Panel `/admin/contacto` (ruta protegida)
Guard: requiere sesión y permiso `contacto.ver`; los controles de escritura solo se muestran con `contacto.gestionar`. Verificar siempre también en la API (el front no es una barrera de seguridad).

**Bandeja**
- Tabla con: folio, tipo (insignia), asunto, remitente (marca si es usuario registrado), prioridad, estado, asignado, fecha relativa.
- Filtros: estado (multi), tipo (multi), prioridad, asignado (incluye «sin asignar» y «mis mensajes»), rango de fechas.
- Búsqueda por texto, folio o correo (con debounce).
- Orden y paginación del lado servidor. Los `nuevo` resaltados.
- Contador de nuevos en el menú (consulta `pendientes/conteo`, refresco cada 60 s y al enfocar la pestaña).
- Estados de carga, vacío y error.
- Botón «Exportar CSV» con los filtros activos.

**Detalle `/admin/contacto/:id`**
- Encabezado: folio, tipo, remitente, correo, fecha, contexto técnico (si es error).
- Mensaje original.
- Hilo cronológico: eventos con icono y autor; las **notas internas** con estilo diferenciado («solo equipo»); las respuestas marcadas como «enviado al remitente».
- Acciones: cambiar estado (solo transiciones válidas), prioridad, asignar a integrante.
- Editor de **nota interna** y editor de **respuesta** (con vista previa y selector «dejar en: esperando usuario / resuelto / sin cambio»). Confirmación antes de enviar.
- Si hay envíos `fallido` en el outbox de ese mensaje: banner con botón «Reintentar».
- Acción «Eliminar datos personales» (anonimizar) con doble confirmación.

**Métricas** (pestaña o tarjetas en la parte superior)
Mensajes totales y abiertos, por tipo, por estado, mensajes por día (gráfica), tiempo medio de primera respuesta y de resolución, carga por integrante.

### 8.5 Seguridad en el front
- Renderizar todo contenido de usuarios como **texto** (sin `innerHTML`/`dangerouslySetInnerHTML`).
- No guardar el token de seguimiento en `localStorage`.
- No incluir secretos en el bundle; solo la clave pública del captcha.

---

## 9. Privacidad y retención
- Aviso de privacidad actualizado: qué se guarda (nombre, correo, mensaje, contexto técnico, IP en forma de hash), para qué (atender el mensaje), cuánto tiempo (12 meses tras resolverse) y cómo solicitar eliminación.
- Eliminación a solicitud: `DELETE /api/admin/contacto/:id/datos` o por correo (`sp_contacto_anonimizar`).
- Purga automática (sección 7.5).
- Acceso al panel limitado a quien tenga permiso; las exportaciones CSV contienen datos personales: documentar que no deben compartirse fuera del equipo.

---

## 10. Pruebas

### 10.1 Base de datos
- Creación feliz: devuelve folio único; crea evento `creado` y 2 filas de outbox.
- Folios consecutivos y únicos bajo concurrencia.
- Rechazo de tipo inválido, mensaje corto/largo, correo vacío.
- Matriz de transiciones: todas las válidas pasan, todas las inválidas lanzan `NX003`.
- `atendido_en` solo se fija una vez; `resuelto_en` se fija y se limpia al reabrir.
- `sp_contacto_seguimiento`: token correcto devuelve solo respuestas; token incorrecto y folio inexistente dan el **mismo** error.
- Rate limit en los bordes de cada ventana.
- Outbox: `SKIP LOCKED` con dos consumidores simultáneos no duplica; recuperación de filas `procesando` antiguas; backoff y paso a `fallido` tras 5 intentos.
- Anonimización deja `mensaje`, `nombre`, `correo` y contenido de eventos sin dato original.

### 10.2 API (integración)
- Público: honeypot lleno (201 falso, nada guardado), captcha inválido, validaciones por campo, 429 con `Retry-After`, éxito completo.
- Admin: sin sesión 401, sin permiso 403, filtros y paginación, cada PATCH/POST, export CSV con neutralización de fórmulas (celda `=1+1` sale como `'=1+1`).
- Que ninguna respuesta pública incluya notas internas, `ip_hash`, `token_seguimiento_hash` ni datos de otros mensajes.

### 10.3 Worker
- Con proveedor de correo simulado: envío ok, fallo temporal con reintento, fallo permanente a `fallido`.
- Plantillas: el contenido del usuario aparece escapado; ningún salto de línea de entrada del usuario llega a una cabecera.

### 10.4 Front
- Pruebas de componentes del formulario (validaciones, estados, honeypot oculto) y de la bandeja (filtros, paginación, guard de ruta).

### 10.5 End-to-end (flujo completo)
Visitante envía mensaje → llega aviso al correo del equipo (entorno de prueba) → admin lo ve en la bandeja → lo asigna y responde → el visitante recibe el correo → consulta el seguimiento con su token y ve la respuesta → admin marca resuelto → métricas reflejan el cambio.

### 10.6 Seguridad (manual / script)
Intentos de XSS en asunto y mensaje (se muestran como texto en panel y correo), inyección SQL en filtros (los SP son parametrizados), enumeración de folios sin token, abuso de rate limit rotando correos con la misma IP, y envío masivo sin captcha.

---

## 11. Documentación a entregar
1. Sección «Contacto» en el **doc de procesos almacenados** (cada SP: parámetros, retorno, errores).
2. `.env.example` actualizado y nota en el doc de secretos.
3. README del módulo: arquitectura (diagrama del flujo), cómo correr worker y pruebas localmente, cómo configurar proveedor de correo y captcha, y registros DNS usados.
4. Guía corta de uso del panel para el equipo (estados, cuándo usar nota vs. respuesta, política de tiempos de respuesta sugerida).
5. Aviso de privacidad actualizado.

---

## 12. Plan de ejecución por pasos

Cada paso termina con commit(s) en `Dev_Luis` y su criterio de aceptación cumplido.

| Paso | Trabajo | Criterio de aceptación |
|---|---|---|
| **0. Auditoría** | Revisar repo: stack real, convención de SP, usuarios/roles, worker, UI. Registrar en el README del módulo las diferencias con los supuestos y ajustar este plan. | Lista de supuestos confirmados/corregidos escrita en el PR |
| **1. Base de datos** | Scripts de migración: tablas, índices, secuencia, trigger de `actualizado_en`, permisos. Todos los SP de la sección 4. Documentar en el doc de procesos. | Suite SQL (10.1) en verde; migración aplicable y reversible en BD limpia |
| **2. API pública** | `POST /api/contacto`, seguimiento, verificación de captcha, rate limit, hashing de IP/token, manejo de errores. | Pruebas 10.2 (público) en verde |
| **3. Worker y correo** | Interfaz `EmailProvider` + `CanalCorreo`, ciclo del outbox, 3 plantillas, tarea de purga, DNS (SPF/DKIM/DMARC) documentado. | Pruebas 10.3 en verde; correo de prueba real recibido fuera de spam |
| **4. API de administración** | Endpoints de la sección 5.2 con permisos, export CSV, métricas, anonimización. | Pruebas 10.2 (admin) en verde |
| **5. Front público** | `/contacto` y `/contacto/seguimiento` con todos los estados de 8.2 y 8.3. | Flujo visitante y flujo con sesión funcionan en `dev`; pruebas 10.4 (formulario) |
| **6. Front admin** | Bandeja, detalle, acciones, métricas, exportación, contador en menú, guard de ruta. | Pruebas 10.4 (panel) y recorrido manual completo |
| **7. Endurecimiento** | Revisar checklist 5.4 y 8.5, pruebas de seguridad 10.6, límites, logs sin PII, cabeceras. | Sin hallazgos abiertos de severidad alta/media |
| **8. E2E y documentación** | Prueba 10.5 completa; entregables de la sección 11. | Flujo e2e verde; documentación revisada |
| **9. PR** | PR `Dev_Luis` → `dev` con resumen, capturas del panel, lista de variables de entorno nuevas a dar de alta en Render/Vercel y pasos de despliegue. | Revisión de al menos otro integrante; sin conflictos |

> El despliegue a producción sigue el esquema de fases del equipo (Fase 3.5). Este módulo no debe llegar a `produccion` sin pasar por `dev` → `main` → `produccion` vía PR.

---

## 13. Fuera de alcance (futuras mejoras)
- Adjuntos y capturas de pantalla (requiere almacenamiento de objetos externo).
- Responder desde la app con recepción de respuestas del remitente por correo entrante (hilo bidireccional por email).
- Canal WhatsApp para avisos al equipo (lo trabaja el integrante de WhatsApp; enchufar vía `CanalNotificacion`).
- Plantillas de respuesta rápida, etiquetas personalizadas, SLA con alertas automáticas.
- Clasificación automática de mensajes y detección de duplicados.

---

## 14. Criterios de «terminado» del módulo completo
- [ ] Un visitante sin cuenta y un usuario registrado pueden enviar los tres tipos de mensaje.
- [ ] Cada mensaje queda en BD con folio, y el equipo recibe aviso por correo con enlace al panel.
- [ ] El remitente recibe confirmación y puede consultar su estado con folio + token.
- [ ] El equipo puede filtrar, buscar, asignar, priorizar, anotar, responder, cambiar estado y exportar.
- [ ] Solo roles con permiso acceden al panel (verificado en API, no solo en front).
- [ ] Captcha, honeypot, rate limit, validación y escape de contenido activos y probados.
- [ ] Ningún secreto en el repo, logs ni respuestas; IP y token solo como hash.
- [ ] Reintentos de correo y recuperación ante caída del worker verificados.
- [ ] Retención/anonimización funcionando.
- [ ] Todas las pruebas en verde y documentación entregada.

---

## 15. Prompt de arranque para Claude Code

> Estás en el repo de Nexo, en la rama `Dev_Luis`. Lee completo `PLAN_CONTACTO_NEXO.md` y ejecútalo. Empieza por el **Paso 0 (auditoría)**: revisa el stack real del repo y dime qué supuestos del documento no se cumplen antes de escribir código. Respeta las convenciones del proyecto: toda operación de BD como proceso almacenado (sin SQL de negocio en el código), secretos solo por variables de entorno, y nada de subir directo a `dev`/`main`/`produccion`. No implementes la integración de WhatsApp. Trabaja un paso a la vez, con commits pequeños, corre las pruebas de cada paso y no avances si el criterio de aceptación no se cumple. Al terminar un paso, resume qué hiciste y qué decisiones tomaste. Si algo del plan choca con el repo, gana el repo: propón el ajuste y continúa.
