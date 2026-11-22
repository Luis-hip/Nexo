# Rol «Soporte de Nexo»

> Decidido por Luis el 2026-11-21. Sustituye la idea de dar el permiso del panel a una cuenta normal: el soporte es un **tipo de cuenta** con su propio tablero.

## 1. Qué es

Una cuenta de trabajo del equipo que atiende Nexo. No usa Nexo como producto: no tiene espacio personal ni equipos. Su único trabajo es atender a las personas.

- `usuarios.tipo_cuenta = 'soporte'` (el resto de las cuentas son `persona`).
- La crea el script `pnpm --filter @nexo/api db:soporte` (docs/14 §4). No hay registro desde la web.
- **Permisos de sistema:**
  - `contacto.ver` y `contacto.gestionar`: el panel de contacto.
  - `cuentas.ayudar`: las herramientas de ayuda.
  - El script da los tres. Los permisos solo se otorgan con `db:permiso`.

## 2. Qué hace

| Área | Acciones |
|---|---|
| **Inicio** | Cifras de la plataforma, **sin datos personales**: cuentas, cuentas nuevas, verificadas, con 2FA o con Google, equipos activos y altas por semana. Además, el resumen de contacto: nuevos, abiertos y tiempos |
| **Contacto** | La bandeja completa (docs/14 §5): ver, responder, notas internas, asignar, estado y prioridad, métricas, CSV y eliminar datos de un remitente |
| **Cuentas** | Buscar una cuenta por correo exacto y ver solo su estado: creada, correo verificado, bloqueo por intentos, 2FA, Google, cuántos equipos activos tiene (el número, no cuáles) y última actividad. Acciones: **reenviar el correo de verificación** y **desbloquear** tras intentos fallidos |
| **Bitácora** | Cada acción sobre una cuenta queda registrada: quién, qué, a quién y cuándo |
| **Mi cuenta** | Contraseña, verificación en dos pasos y sesiones abiertas |

## 3. Qué NO hace

- No tiene espacio personal, tareas, calendario, reportes ni WhatsApp.
- No pertenece a equipos: no puede crear uno, unirse ni aceptar invitaciones. **La BD lo impide**, no solo la web.
- No ve el contenido de los equipos (tareas, chat, reuniones, votaciones), ni las cuentas de una persona más allá de su estado.
- No puede cambiar el correo, la contraseña ni los datos de otra persona, ni entrar como ella.
- No aparece en búsquedas, menciones ni listas de miembros, porque no pertenece a ningún equipo.
- **No entra con Google:** solo con contraseña y verificación en dos pasos.
- No otorga permisos ni crea otras cuentas de soporte; eso solo se hace con los scripts.

## 4. Seguridad

- **Verificación en dos pasos obligatoria:**
  - Mientras no la active, la cuenta solo ve la pantalla para activarla.
  - Los procesos del panel y de cuentas también la exigen (`NX005`, `dos_pasos_requerido`).
- Las herramientas de cuentas solo buscan por **correo exacto**, sin listados ni búsquedas parciales, para que no sirvan para recorrer la base.
- Todo lo que hace una cuenta de soporte sobre otra queda en `soporte_bitacora`.

## 5. Web

- Tablero propio en `/soporte` con estas secciones:
  - Inicio.
  - Contacto (`/soporte/contacto`, `/soporte/contacto/:id`).
  - Cuentas.
  - Mi cuenta.
- Cualquier ruta de la app de personas (`/app/...`, `/ajustes/...`, `/bienvenida/...`) lleva a `/soporte`, y la app de personas ya no muestra el panel.
- El aviso por correo de un mensaje nuevo enlaza a `/soporte/contacto/:id`.
