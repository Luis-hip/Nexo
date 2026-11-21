# Plan integrado de los pendientes (2026-11-21)

> Qué se construye, en qué orden y, sobre todo, **cómo encajan las piezas para que ninguna duplique ni pise a otra**.
> Rama: `Dev_Luis` → `dev` → `main` → `produccion`, siempre por PR.

Piezas:

| # | Pieza | Origen |
|---|---|---|
| A | WhatsApp al empezar: paso opcional en la bienvenida, aviso al unirse a un equipo y «Enviarme mi reporte» sin número verificado | Pedido de Luis (2026-11-21), sobre el spike 1 a 1 (DEC-039) |
| B | Verificación en dos pasos (TOTP: Google Authenticator, Authy, Microsoft Authenticator) | Mejora pendiente (AUTH-07) |
| C | Entrar con Google y validación del correo | Mejora pendiente (AUTH-07). Regla de Luis: si la cuenta es de Google, el correo queda verificado; si no, se manda el correo de verificación |
| D | Módulo de contacto y soporte completo | `12_Plan_Contacto.md` |

---

## 1. Reglas para que se complementen

### 1.1 Un solo registro de WhatsApp, tres puertas de entrada (A)
- Un componente, **`RegistroWhatsApp`**, con número, consentimiento y verificación (el paso rediseñado el 2026-11-21). Lo usan:
  1. **La bienvenida**: el paso 4 de `/bienvenida/:paso`, opcional, con «Omitir este paso».
  2. **Ajustes → WhatsApp**: el mismo componente, no una copia.
  3. **`/app/whatsapp/activar`**: la página a la que llevan el aviso al unirse a un equipo y «Enviarme mi reporte».
- **«Primer ingreso» es la bienvenida.** Hoy toda cuenta nueva entra a `/bienvenida/1` (y con Google será igual, pieza C). No se crea otro flujo ni otra bandera: quien omite el paso lo retoma en Ajustes → WhatsApp.
- **Al aceptar una invitación:**
  - Con número verificado y consentimiento general, la membresía nueva queda con `consentimiento_wa = true` en el mismo proceso (`proc_invitacion_aceptar`), y el líder la ve activa sin pedirle nada.
  - Sin número verificado, la pantalla del equipo muestra «Activa WhatsApp para recibir los avisos de este equipo», con acceso directo a `/app/whatsapp/activar?volver=…`.
- **«Enviarme mi reporte» sin número verificado** no da error: lleva a `/app/whatsapp/activar?accion=reporte&volver=…`. Al quedar verificado, se envía el reporte y regresa.

### 1.2 Un solo flujo de inicio de sesión (B + C)
```
contraseña ─┐
            ├─► ¿2FA activa? ── no ─► sesión
Google ─────┘        │
                     sí ─► desafío (código TOTP o de respaldo) ─► sesión
```
- La 2FA aplica a **los dos métodos**. El desafío pendiente vive en la BD (token de un solo uso con hash, 5 minutos y 5 intentos), no en memoria.
- **Correo verificado:** un solo mecanismo (`tokens_verificacion` + `proc_auth_verificar_correo`):
  - Al crear o vincular una cuenta con Google se marca `correo_verificado_en`, porque Google ya verificó el correo (`email_verified`).
  - Con un correo que no es de Google se manda el correo de verificación de siempre.
- **Cuentas solo con Google (sin contraseña):**
  - **Eliminar la cuenta**, que hoy pide la contraseña, se confirma con el código 2FA si la tiene activa, o escribiendo su correo si no.
  - **Desactivar la 2FA** pide un código válido.
  - Pueden **crear una contraseña** con «¿Olvidaste tu contraseña?», el flujo que ya existe.
- **Vincular Google a una cuenta existente** solo es posible con sesión iniciada (Ajustes → Cuenta) o si el correo de Google ya está verificado en Nexo. Así nadie se apodera de una cuenta creando un Google con el mismo correo.

### 1.3 Un solo correo, un solo ciclo de trabajos (D sobre lo que ya existe)
- **Correo:** el módulo de contacto usa la interfaz `Correo` de `apps/api/src/correo.ts` (Resend). No se crea otro `EmailProvider`.
- **Trabajos:** no hay un *worker* aparte. El outbox de contacto corre en el mismo ciclo de trabajos de la API (`trabajos/`), como WhatsApp, con `FOR UPDATE SKIP LOCKED`.
- **Mientras `RESEND_API_KEY` siga «ignorado hasta nuevo aviso»:** los mensajes se guardan y se ven en el panel (la BD es la fuente de verdad, D1), y los correos esperan en el outbox. Para que no se acumulen sin fin, se marcan `fallido` tras sus reintentos y se pueden reintentar desde el panel.
- **Canal WhatsApp en contacto:** queda el valor `whatsapp` en el outbox y la interfaz `CanalNotificacion`, sin implementarlo. El módulo de WhatsApp (spike 1 a 1) ya existe y podrá enchufarse después, sin duplicar código.

### 1.4 Permisos del panel de contacto
- Nexo no tiene roles de sistema (los roles son por equipo).
- Se crea **`permisos_sistema (usuario_id, permiso)`** con `contacto.ver` y `contacto.gestionar`, que se otorgan con un script (`db:permiso`), nunca desde la web.
- La API los comprueba siempre. Recomendado: quien gestione contacto debe tener la 2FA activa (B); el panel lo recuerda con un aviso.

### 1.5 Privacidad: una sola actualización
El aviso de privacidad (`/privacidad`) se actualiza una vez y cubre todo lo nuevo:
- **Google:** identificador, correo y nombre.
- **2FA:** secreto cifrado y códigos solo como hash.
- **Contacto:** nombre, correo, mensaje, contexto técnico e IP solo como HMAC; retención de 12 meses.
- **WhatsApp:** ya estaba.

---

## 2. Paso 0 del plan de contacto: supuestos contra el repo

| Supuesto del plan | Realidad del repo | Ajuste |
|---|---|---|
| Procesos `sp_contacto_*`, `RETURNS TABLE` o `PROCEDURE` | Funciones `proc_*` que devuelven `jsonb`, con `fn_conceder_procesos()` (DEC-025) | `proc_contacto_*` y `fn_contacto_*` |
| IDs `BIGINT` | `uuid` en todas las tablas | `uuid`; el folio sigue siendo `NX-2026-000123` |
| Tabla `contacto_mensajes` nueva | **Ya existe** (0001) con `proc_contacto_enviar` y `POST /contacto` (PUB-08) | Se **amplía** con `ALTER TABLE`, sin perder lo guardado; `POST /contacto` evoluciona |
| Códigos `NX001`–`NX004` | Ya usados con otro significado (`NX001` equipo lleno, etc.) | Datos inválidos → `NX010`; no encontrado o token → `NX006`; transición → `NX007`; límite → **`NX013` (429)**, nuevo |
| Rutas `/api/...` | Sin prefijo (`/contacto`, `/auth/...`) | `/contacto`, `/contacto/seguimiento`, `/admin/contacto/...` |
| Roles admin/desarrollador | No existen | `permisos_sistema` (1.4) |
| *Worker* en Render | Los trabajos corren dentro de la API (plan gratuito: se duerme) | Ciclo de trabajos de la API (1.3) |
| `EmailProvider` nuevo | `Correo` (Resend) ya existe | Se reutiliza (1.3) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | El front es Vite | `VITE_TURNSTILE_SITE_KEY`. El captcha se activa solo cuando haya claves; sin ellas quedan honeypot y límites |
| Front con su librería | Componentes propios (`components/ui`) | Se usan esos |

---

## 3. Orden y por qué

1. **A · WhatsApp al empezar.** No depende de nada y cierra el spike.
2. **B · 2FA.** Cambia el flujo de inicio de sesión.
3. **C · Google.** Se conecta a ese mismo flujo y a su paso de 2FA.
4. **D · Contacto.** Usa la sesión, el correo, los permisos y la página de privacidad ya actualizados.

Migraciones previstas: `0036` (A: consentimiento al aceptar invitación), `0037` (B), `0038` (C), `0039`–`0040` (D).

## 4. Lo que necesita a Luis (fuera del código)

| Para | Qué | Dónde |
|---|---|---|
| C | Cliente OAuth de Google (ID y secreto) con el origen `https://app.nexo.lol` y la redirección `https://api.nexo.lol/auth/google/callback` | Google Cloud Console |
| D | Claves de Cloudflare Turnstile (sitio y secreto) | Cloudflare |
| D | `RESEND_API_KEY` y DNS SPF/DKIM/DMARC | Sigue «ignorado hasta nuevo aviso»: sin eso no salen correos |
| D | Quién tendrá `contacto.ver` y `contacto.gestionar` | `db:permiso` |
