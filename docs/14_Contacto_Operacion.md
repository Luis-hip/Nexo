# Módulo de contacto: arquitectura, operación y guía del panel

> Implementación de `12_Plan_Contacto.md`, con los ajustes al repo de `13_Plan_Integrado_Pendientes.md` (sección 2). Hecho el 2026-11-21 en `Dev_Luis`.

## 1. Arquitectura

```
Formulario (/contacto) ─► POST /contacto ─► límites (BD) ─► proc_contacto_crear ─┬─► contacto_mensajes (folio)
   trampa + captcha         HMAC IP/correo                                         ├─► contacto_eventos («creado»)
                                                                                   └─► contacto_outbox (aviso + confirmación)
Ciclo de trabajos (cada 30 s, dentro de la API) ─► proc_contacto_outbox_tomar (SKIP LOCKED)
   └─► CanalNotificacion «correo» (Resend) ─► proc_contacto_outbox_resultado (reintentos 1/5/15/60/180 min)
Panel (/soporte/contacto) ─► /soporte/contacto/… ─► proc_contacto_* (exigen contacto.ver / contacto.gestionar)
Seguimiento (/contacto/seguimiento) ─► folio + token (SHA-256) ─► solo respuestas
Retención (diaria) ─► proc_contacto_purgar (12 meses)
```

**La BD es la fuente de verdad.** Si el correo falla, el mensaje sigue en el panel y el envío queda «fallido», con un botón para reintentarlo.

## 2. Diferencias con el plan

| Plan | Implementado | Por qué |
|---|---|---|
| `sp_contacto_*`, IDs `BIGINT` | `proc_contacto_*` y `fn_*`, `uuid`, retorno `jsonb` | Convención DEC-025 |
| Códigos `NX001`–`NX004` | `NX010`, `NX006`, `NX007`, `NX005`; nuevo `NX013` (429) | Ya estaban usados |
| Worker aparte | Ciclo dentro de la API (`trabajos/contacto.ts`) | El plan gratuito de Render no tiene worker |
| `EmailProvider` nuevo | `Correo` de `correo.ts` (Resend), con HTML y `Reply-To` | Un solo correo (docs/13 1.3) |
| Roles admin/desarrollador | `permisos_sistema` y `pnpm db:permiso` | Nexo solo tiene roles por equipo |
| Rutas `/api/...` | Sin prefijo (`/contacto`, `/soporte/contacto`) | Convención del repo |
| Respuesta con enlace de seguimiento | La respuesta remite al enlace del correo de confirmación | El token solo existe como hash; el plano solo viaja cifrado para la confirmación |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `VITE_TURNSTILE_SITE_KEY` | La web es Vite |

## 3. Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | API (Render) | Opcional. Sin ella no hay captcha, pero siguen la trampa para bots y los límites |
| `VITE_TURNSTILE_SITE_KEY` | Web (Vercel) | Clave pública del captcha |
| `CONTACTO_EQUIPO_DESTINO` | API | Correo que recibe el aviso de cada mensaje nuevo. Sin ella no hay aviso (el panel sí lo muestra) |
| `CONTACTO_RETENCION_MESES` | API | 12 por defecto |
| `IP_HASH_SALT` | API | Opcional. Si falta, se deriva de `ENCRYPTION_KEY` |
| `RESEND_API_KEY` | API | **Ignorada hasta nuevo aviso**: sin ella los correos quedan «fallidos» y el panel funciona igual |

**DNS (pendiente, junto con Resend):** SPF, DKIM y DMARC que indique Resend para `nexo.lol` (DMARC empezando con `p=none`). Probar con Gmail y Outlook.

## 4. Dar acceso al panel

> **Desde 0040 el panel es parte del rol «Soporte de Nexo» (`docs/15_Rol_Soporte.md`):** solo lo usan cuentas de tipo `soporte` con verificación en dos pasos, en su tablero `/soporte`. Las cuentas de soporte las da de alta otra cuenta de soporte con `soporte.alta` (Equipo de soporte → Dar de alta) o un desarrollador con `db:soporte`; nadie lo elige al registrarse.

**Cuenta de soporte (recomendada):** `soporte@nexo.lol` no pertenece a ningún equipo. Tiene el correo verificado y solo el permiso `contacto.gestionar`, así el soporte no se mezcla con el espacio personal de nadie. La crea el script con una contraseña aleatoria, que guarda en `.credenciales-demo.md` (fuera de git):

```
pnpm --filter @nexo/api db:soporte                    # local
pnpm --filter @nexo/api db:soporte -- --produccion    # con DATABASE_URL_PRODUCCION, después del despliegue de 0039
pnpm --filter @nexo/api db:soporte -- --nueva-clave   # cambia la contraseña
```

Creada en local el 2026-11-21. En producción se crea al desplegar el módulo.

**Permisos a otras cuentas:**

```
pnpm --filter @nexo/api db:permiso -- persona@correo contacto.gestionar
pnpm --filter @nexo/api db:permiso -- persona@correo contacto.ver
pnpm --filter @nexo/api db:permiso -- persona@correo contacto.gestionar --quitar
```

- **Local:** usa `DATABASE_URL`.
- **Producción:** usa `DATABASE_URL_MIGRACIONES`, la cadena externa del dueño, y después se borra del `.env`.
- **Permisos:**
  - `gestionar` incluye `ver`.
  - Desde la web nunca se otorgan permisos.
  - Se recomienda que quien gestione tenga la verificación en dos pasos activa.

## 5. Guía del panel para el equipo

- **Estados:** Nuevo → En revisión → Esperando respuesta → Resuelto, o Descartado. Un mensaje resuelto o descartado se puede reabrir (vuelve a «En revisión»). El selector solo ofrece los cambios válidos.
- **Asignar:** al asignar un mensaje nuevo, pasa solo a «En revisión». Solo se asigna a quien tiene `contacto.gestionar`.
- **Nota o respuesta:**
  - **Nota interna:** solo la ve el equipo y aparece en amarillo, marcada «Solo equipo».
  - **Respuesta:** le llega por correo al remitente y aparece en su seguimiento. Antes de enviarla se pide confirmación y se elige en qué estado queda el mensaje.
- **Tiempos sugeridos:** primera respuesta en menos de 2 días hábiles. Los errores con prioridad alta, el mismo día.
- **Exportar CSV:** usa los filtros activos. Lleva datos personales: **no compartirlo fuera del equipo**.
- **Eliminar datos personales:** para solicitudes de eliminación. Pide escribir el folio para confirmar y no se puede deshacer.

## 6. Pruebas

- **SQL:** P242–P249, con folio, límites, permisos, transiciones, seguimiento sin notas internas, outbox con reintentos y recuperación, asignación, bandeja, métricas, anonimización y purga.
- **API:** `rutas/contacto.test.ts`, con trampa para bots, validaciones, 429 con `Retry-After`, sesión, 401 y 403, CSV con fórmulas neutralizadas, seguimiento con el token del correo, y plantillas con contenido escapado y sin saltos de línea en el asunto.
- **Recorrido manual (2026-11-21, local):**
  1. Se envió un reporte de error con sesión.
  2. Se consultó el seguimiento con el enlace del correo.
  3. En el panel se asignó, se respondió dejándolo en «Esperando respuesta» y se revisaron las métricas.
- **Pendiente:** la concurrencia real de `SKIP LOCKED` con dos instancias. Solo se probó la recuperación de envíos atorados.
