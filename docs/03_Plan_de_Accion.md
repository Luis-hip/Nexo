# Nexo · Plan de acción

> **Cómo usar este documento.** Es la lista de trabajo, en orden. Cada fase tiene: objetivo, entregables, instrucciones paso a paso, **criterio de terminado** y dueño sugerido. Una IA puede ejecutarlo de forma autónoma si ya leyó `06_README_AGENTS.md`, `01_Contexto_y_Especificaciones.md` y `02_Base_de_Datos.md`. Una fase **no se da por terminada** hasta cumplir todo su criterio.
>
> **Estrategia: MVP primero y modular.** Primero se ven las pantallas (público y principales por rol), con datos reales desde el principio pero con acceso de desarrollo (*dev login*); la autenticación real y las validaciones finas van **después** (Fase 5). Cada módulo es independiente y tiene dueño.

## 0. Mapa de fases

| Fase | Nombre | Resultado visible |
|---|---|---|
| **0** | Arranque del repositorio y de la BD | Repositorio en GitHub, CI en verde, BD creada con las 11 pruebas `OK`, trámites de WhatsApp iniciados |
| **1** | Base, roles y espacio personal | Diseño base, páginas públicas, estructura de la app, espacio personal con datos reales |
| **2** | Equipos, tablero y estados | Crear/unirse a un equipo, tablero, triaje, estados de tarea, permisos por rol |
| **3** | Hill Chart, sprints y vistas secundarias | Resumen con Hill Chart, sprints, calendario, reportes, miembros, ajustes |
| **4** | Chat y WhatsApp | Chat en tiempo real; WhatsApp simulado de extremo a extremo y envío real mínimo |
| **5** | Autenticación real, QA y permisos | Login/registro/logout, validaciones, matriz de permisos probada, revisión de índices |
| **6** | Despliegue y cierre | Aplicación en línea, documentación y entrega |

Correspondencia con el cronograma del equipo (`05_Cronograma.md`): la Fase 0 es nueva y corta; las Fases 1–6 de este plan son las Fases 1–6 del cronograma.

## 1. Reglas de ejecución (para personas y para IAs)

1. **Un cambio, una rama, un *pull request*.** `main` solo recibe PR con CI en verde.
2. **No inventar.** Si algo no está en `01`/`02`, se elige lo más simple, se anota en `docs/decisiones.md` y se sigue; si es irreversible, se pregunta.
3. **No tocar el esquema aplicado.** Todo cambio de BD es una migración nueva.
4. **Probar antes de marcar terminado.** Cada criterio de terminado se verifica ejecutando algo (pruebas, la app en el navegador), no leyendo el código.
5. **Pantallas desde el prototipo:** se abre la pantalla equivalente del zip (ver la columna «Prototipo» de la sección 9), se copia su estructura y textos, y se **reconecta a la API real**. No se copia el estado simulado (`useReducer`, `localStorage`, Simulador).
6. **Cada pantalla de datos** implementa los cinco estados (cargando, vacío, error, sin permiso, sin conexión) y funciona en móvil de 360 px.
7. **Al terminar cada fase:** actualizar `docs/progreso.md` (qué se hizo, qué quedó pendiente), etiquetar el commit `fase-N` y avisar al equipo.

---

## FASE 0 · Arranque del repositorio y de la BD

**Dueño:** Luis (con Jova). **Paralelo:** Carlos e Isac, tarea 0.7.

**Objetivo:** que cualquiera pueda clonar, instalar y tener la app y la BD funcionando, y que los trámites lentos (Meta) ya estén corriendo.

### Tareas

**0.1 Crear el repositorio en GitHub.**
- Nombre `nexo`, privado al inicio. Añadir `README.md`, `.gitignore` (Node), licencia a decidir.
- Proteger `main`: exigir PR y CI en verde.
- Plantillas: `.github/ISSUE_TEMPLATE/` (tarea, error) y `.github/pull_request_template.md` (qué cambia, cómo probarlo, capturas).
- Tablero de proyecto en GitHub con columnas Por hacer / En curso / En revisión / Hecho; una *issue* por cada fase y por cada módulo grande.

**0.2 Estructura del monorepo (ver `01`, sección 9).**
- `pnpm init`, `pnpm-workspace.yaml` con `apps/*` y `packages/*`.
- `apps/web`: Vite + React 19 + TypeScript + Tailwind v4 + react-router.
- `apps/api`: Fastify + TypeScript (`tsx` para desarrollo).
- `packages/shared`: TypeScript puro (Zod, permisos, color).
- `tsconfig.base.json` con `strict: true`; ESLint y formateador; scripts raíz: `dev`, `build`, `typecheck`, `lint`, `test`.

**0.3 Base de datos local.**
- `docker-compose.yml` con `postgres:16`, base `nexo`, volumen persistente.
- Copiar `01_esquema.sql` a `apps/api/db/migrations/0001_esquema.sql` **sin modificar**; `02_semilla.sql` a `apps/api/db/seed/semilla.sql`; `03_pruebas.sql` a `apps/api/db/tests/pruebas.sql`.
- Configurar `node-pg-migrate` para ejecutar archivos SQL; scripts `db:migrate`, `db:seed`, `db:test`, `db:reset`.

**0.4 Ejecutar los tres scripts y confirmar que funcionan.**
- Sobre una base vacía: migrar, sembrar, ejecutar `psql -v ON_ERROR_STOP=1 -d nexo -f pruebas.sql`.
- **Debe salir exactamente 11 líneas `NOTICE: OK …`** (pruebas 1, 2, 3, 4, 5, 6, 7, 7b, 8, 9, 10).
- Si algo falla: el archivo reconstruido para el documento de BD **no se había ejecutado de nuevo**. Corregir el error con una **migración nueva** (si ya se aplicó) o, en esta primera corrida, corregir `0001` y anotarlo en `docs/decisiones.md` y en `02_Base_de_Datos.md`.

**0.5 Tipos generados.** `kysely-codegen` genera `apps/api/src/db/tipos.ts` desde la BD; script `db:tipos`. El tipo generado **se versiona**.

**0.6 CI (GitHub Actions).** Un flujo que: instala con `pnpm`, levanta un servicio PostgreSQL 16, migra, siembra, ejecuta las pruebas SQL (y falla si no hay 11 `OK`), `typecheck`, `lint`, `test` y `build`.

**0.7 Trámites de WhatsApp (en paralelo, empezar ya).**
- Crear la cuenta de **Meta for Developers** y la app; crear la cuenta de **WhatsApp Business (WABA)**; conseguir el **número de pruebas**.
- Iniciar la **verificación de la empresa** (puede tardar días): anotar qué documentos pide Meta.
- Leer la **documentación oficial de Meta** sobre grupos de la API Cloud y **verificar**: límite de participantes, si el número de la empresa cuenta, cómo se une la gente, requisitos de cuenta y **costos vigentes**. Escribir el resultado en `docs/whatsapp-verificacion.md` con enlaces.
- **Con ese resultado, el equipo resuelve la decisión D-01** (ver `01`, 7.3).

**0.8 Datos de prueba y acceso de desarrollo.** Implementar `POST /dev/login` y la guarda que impide arrancar en producción con `DEV_LOGIN_ENABLED=true` (ver `01`, sección 8).

### Criterio de terminado de la Fase 0
- [ ] `git clone` + `pnpm install` + `docker compose up -d` + `pnpm db:reset` deja la BD lista.
- [ ] Las **11 pruebas `OK`** salen en local y en CI.
- [ ] La CI está en verde en `main`.
- [ ] `docs/whatsapp-verificacion.md` existe, con datos oficiales **o** con la nota «no se pudo verificar» y el motivo.
- [ ] Cuenta de Meta creada y trámite de verificación iniciado (evidencia: captura o nota).
- [ ] `docs/decisiones.md` creado.

---

## FASE 1 · Base, roles y espacio personal

**Dueño:** Luis y Jova (arquitectura, roles, espacio personal) · Carlos, Isac y Jova (introducción y marco teórico del artículo).

**Objetivo:** el esqueleto sobre el que se monta todo lo demás y la primera experiencia completa de una persona sola.

### 1.1 Sistema de diseño en el front
1. Copiar los tokens de `src/index.css` del prototipo a `apps/web/src/styles/tokens.css`; exponerlos con `@theme inline`. Tema claro/oscuro con `[data-theme]`.
2. Crear `components/ui/`: `Boton`, `Campo` (texto, área, selector, casilla, interruptor), `Tarjeta`, `Insignia`, `Avatar`, `Modal`, `PanelLateral`, `Toast`, `Banner`, `Pestanas`, `Tabla`, `EstadoVacio`, `EstadoError`, `Esqueleto`, `Menu`. Todos con teclado y foco visible.
3. Componente `EstadosDatos` que implementa cargando/vacío/error/sin permiso/sin conexión para reutilizar en toda pantalla.
4. **Hecho cuando:** una página temporal de pruebas interna (no se publica) muestra todos los componentes en claro y oscuro, y el contraste de texto es ≥ 4.5:1.

### 1.2 Páginas públicas (vistas primero)
Implementar, solo visuales y responsivas, desde el prototipo: `/` (PUB-01), `/caracteristicas`, `/como-funciona`, `/whatsapp-info`, `/para-quien`, `/ayuda` y `/ayuda/:articulo`, `/acerca`, `/contacto`, `/terminos`, `/privacidad`, 404 y 500, y el aviso de cookies. Las páginas de ayuda leen de un archivo local de contenido. El formulario de `/contacto` guarda en `contacto_mensajes`.

### 1.3 Estructura de la aplicación
1. `AppShell` (barra lateral/inferior en móvil, selector de espacios GL-02, menú de perfil GL-03, búsqueda global GL-01 con búsqueda simple al inicio).
2. Rutas con *lazy loading*; `EquipoGuard` que verifica en la API que el usuario es miembro activo del equipo y devuelve su perfil.
3. Layouts público y de autenticación.

### 1.3b API base
1. Servidor Fastify con `pino`, manejo de errores con formato `{ codigo, mensaje, detalles? }`, CORS al `APP_URL`, cookies de sesión.
2. Sesión: tabla `sesiones` (token opaco, *hash*); el *dev login* crea sesiones reales con este mismo mecanismo (así la Fase 5 solo cambia **cómo se obtiene** la sesión).
3. `packages/shared/permisos.ts` con la matriz completa de `01`, sección 2.2, y su prueba parametrizada (una fila de la tabla = un caso).
4. `GET /yo` (usuario, equipos y perfil en cada uno).

### 1.4 Espacio personal con datos reales
Pantallas PER-01 a PER-05 y PER-08 (ver sección 9): inicio personal, mis tareas (lista y tablero), detalle, calendario, lista de equipos. API: CRUD de tareas personales (privadas: solo su dueño), filtros, subtareas, etiquetas, comentarios propios.

### 1.5 Onboarding
ONB-01 a ONB-03 y tour de primer uso: guardan perfil y preferencias reales.

### 1.6 Artículo (paralelo)
Carlos, Isac y Jova redactan introducción y marco teórico en `04_Articulo.md`.

### Criterio de terminado de la Fase 1
- [ ] Con *dev login* se entra como cualquier usuario de la semilla y se ve el espacio personal con datos reales.
- [ ] Las páginas públicas existen, responsivas y con contraste correcto.
- [ ] Una persona puede crear, editar, completar y borrar tareas personales, y **otra persona no puede verlas** (prueba automática).
- [ ] La prueba parametrizada de la matriz de permisos pasa.
- [ ] CI en verde; tag `fase-1`.

---

## FASE 2 · Equipos, tablero y estados

**Dueño:** Luis y Jova · Carlos, Isac: estado del arte del artículo.

**Objetivo:** que un equipo real pueda organizar trabajo con roles.

### 2.1 Crear y unirse
1. **Crear equipo (PER-06, 4 pasos):** nombre, descripción, límite de miembros (por defecto 8; ver D-01), confirmación. Quien crea es líder. Todo en una transacción.
2. **Invitaciones (AD-02, AD-03):** enlace y código con caducidad; invitar como integrante o como invitado. El tope de 8 lo hace cumplir la BD: traducir `NX001` a «El equipo ya tiene 8 miembros».
3. **Unirse (PER-07, AUTH-08, AUTH-09, AUTH-10):** con código o enlace; invitaciones inválidas/caducadas/usadas muestran la pantalla de error.
4. **Pantalla `FALT-02` (invitado caducado/revocado)** (ver sección 9).

### 2.2 Tareas del equipo
1. **Tablero (EQ-02)** con columnas por estado, columnas vacías plegadas, tarjetas con responsable, plazo y semáforo.
2. **Arrastrar y soltar** con `dnd-kit`; el orden usa `fractional-indexing`; la API recibe «mover tarea X entre A y B» y calcula el nuevo `orden` en una transacción con comprobación de `version` (responde `409` si hay conflicto).
3. **Lista (EQ-03), Backlog (EQ-04), Detalle (EQ-06).**
4. **Crear/editar y proponer (EQ-07).** Integrante → crea una **propuesta**; líder → crea directamente.
5. **Triaje (EQ-05):** el líder acepta, rechaza (con motivo) o reasigna.
6. **Asignar y responder (EQ-08):** el líder asigna; el integrante acepta o rechaza con motivo.
7. **Máquina de estados** en `packages/shared/estados.ts`: tabla de transiciones válidas por rol. Se aplica en el servidor; la interfaz solo ofrece las válidas.
8. **Eventos de dominio:** cada cambio inserta su evento y una fila en `actividad` en la misma transacción.
9. **Resumen reducido del invitado (IN-01 a IN-04):** solo tareas compartidas, con banner de caducidad.

### 2.3 Permisos aplicados
Cada ruta de esta fase usa la guarda `requierePermiso`. Pruebas de integración: por cada ruta, un caso permitido y uno prohibido para **cada rol**.

### Criterio de terminado de la Fase 2
- [ ] Líder, integrante e invitado ven y pueden hacer **solo** lo que dice la matriz (pruebas automáticas).
- [ ] Un equipo con 8 miembros activos rechaza al noveno (y la prueba con dos conexiones simultáneas confirma que no se cuela).
- [ ] Mover una tarjeta en dos navegadores a la vez produce un `409` en uno y la interfaz lo explica.
- [ ] Toda transición de estado inválida devuelve error; la tabla de casos pasa.
- [ ] CI en verde; tag `fase-2`.

---

## FASE 3 · Hill Chart, sprints y vistas secundarias

**Dueño:** Luis y Jova · Carlos, Isac: metodología y casos de uso del artículo.

### 3.1 Resumen del equipo con Hill Chart (EQ-01)
SVG propio según `01`, 5.5: puntos con el color/forma del responsable (5.4), arrastre para actualizar avance, historial. Texto alternativo por punto. Mini Hill Chart en el inicio personal (PER-01).

### 3.2 Color de miembros
Implementar `packages/shared/color.ts` (OKLCH, ángulo áureo, evitando bandas del semáforo, forma por miembro) y usarlo en avatares, tarjetas y Hill Chart. Prueba: los 8 colores de la semilla son distinguibles entre sí y de las señales.

### 3.3 Sprints
EQ-09 (activo), EQ-10 (planeación con capacidad), EQ-11 (cierre; instantánea en `sprint_instantaneas`), EQ-13 (historial), EQ-12 (retrospectiva con 3 puntos de voto por persona; la BD impide el cuarto, `NX003`).

### 3.4 Vistas secundarias
Calendario del equipo (EQ-14) y reuniones (EQ-15); reportes (EQ-16, EQ-17; el integrante solo exporta lo propio); actividad (EQ-18); archivos (EQ-19; subida con límite de tamaño y tipos permitidos); plantillas (EQ-20); miembros (AD-01, AD-04, AD-05); configuración del equipo (AD-06); notificaciones (NT-01).

### 3.5 Liderazgo
Transferencia (AD-07, AD-08) y elección (AD-09): votación de 72 h con 24 h de desempate; el líder saliente no vota (`NX002`) y queda interino. Los plazos los controla una tarea programada de `pg-boss`. Salir (AD-10), expulsar (AD-11), archivar (AD-12).

### 3.6 Ajustes
PF-01 a PF-09 (perfil, cuenta, apariencia, notificaciones, WhatsApp personal y consentimiento, privacidad y datos, mis equipos, atajos, ayuda).

### 3.7 Pantallas faltantes de prioridad media
Las marcadas «Fase 3» en la sección 9.

### Criterio de terminado de la Fase 3
- [ ] El Hill Chart muestra datos reales y se actualiza al arrastrar, con persistencia.
- [ ] Un sprint se planea, se inicia, se cierra (con instantánea) y tiene retrospectiva.
- [ ] Una elección de liderazgo completa funciona de punta a punta (con plazos acortados en la prueba).
- [ ] Todas las pantallas de las secciones 3.1 a 3.6 existen o están anotadas explícitamente como «fase posterior» en `docs/progreso.md`.
- [ ] CI en verde; tag `fase-3`.

---

## FASE 4 · Chat y WhatsApp

**Dueño:** Luis (WhatsApp), todos apoyan · Carlos, Isac: arquitectura y bosquejos del artículo.

### 4.1 Chat en tiempo real
1. Socket.IO en la API con autenticación por la cookie de sesión; **sala por equipo y por conversación**; al conectarse se comprueba la membresía y el perfil.
2. Mensajes (CH-02), por tarea (CH-03), directos (CH-04), hilos (CH-05), fijados (CH-06), nueva conversación (CH-07), búsqueda (CH-08, con `tsvector`), convertir mensaje en tarea (CH-09), canal de Invitados (CH-10).
3. Reacciones, menciones, lecturas (`conversacion_lecturas`).
4. Los invitados **solo** reciben eventos del canal de Invitados y de tareas compartidas: el servidor decide a qué salas se une cada conexión.
5. Moderación del líder: fijar y eliminar ajenos.

### 4.2 WhatsApp · parte 1: simulado de extremo a extremo
1. Interfaz `ProveedorWhatsApp` y la implementación `simulado` (`01`, 7.2).
2. Procesador de eventos de dominio: lee `eventos_dominio`, consulta `whatsapp_reglas`, genera el mensaje desde la plantilla y lo deja `en_cola`.
3. Pantallas: panel (WA-01), cola detallada (WA-02), burbuja de vista previa (WA-03), historial (WA-04), reglas y programación (WA-05), asistente para conectar el grupo (WA-06), consentimiento y menciones (WA-07), error/pausa/desconexión (WA-08).
4. Modo **instantáneo** y modo **reporte** (acumulación y envío programado con `pg-boss`).
5. El líder revisa y envía; el consentimiento individual se respeta (sin consentimiento no se menciona ni se envía a esa persona).

### 4.3 WhatsApp · parte 2: envío real mínimo
Solo si la cuenta de Meta está lista (Fase 0, tarea 0.7):
1. Implementar `cloud_api_grupos` (o `cloud_api_directo`, según D-01): enviar **un mensaje de un evento a un grupo de prueba**.
2. Webhook de estados con verificación de firma HMAC; registrar en `whatsapp_webhook_eventos`; actualizar el estado del mensaje.
3. Pantallas `FALT-03` y `FALT-04` (unirse al grupo y aprobar solicitudes), según lo que confirme la verificación de Meta.
4. **Si la cuenta no está lista**, se deja documentado y el artículo describe el modo simulado como lo implementado, sin afirmar envío real.

### Criterio de terminado de la Fase 4
- [ ] Dos navegadores con distintos usuarios intercambian mensajes en tiempo real; un invitado **no** recibe mensajes del chat del equipo (prueba).
- [ ] Un evento de tarea genera un mensaje en la cola de WhatsApp con la plantilla correcta; el líder lo envía y aparece en el historial como enviado.
- [ ] Sin consentimiento de una persona, no se la menciona.
- [ ] Un reporte programado se genera y se envía a la hora.
- [ ] Envío real: **o** evidencia (captura del mensaje en el grupo de prueba) **o** nota explícita de por qué no se hizo.
- [ ] CI en verde; tag `fase-4`.

---

## FASE 5 · Autenticación real, QA y permisos

**Dueño:** todos · Carlos, Isac: resultados y capturas del artículo.

### 5.1 Autenticación real
Registro (AUTH-01), inicio de sesión (AUTH-02), cierre de sesión, recuperar y restablecer contraseña (AUTH-03 a AUTH-05), verificar correo (AUTH-06), sesión expirada (AUTH-11). Argon2id; límite de intentos; mensajes que no revelan si un correo existe. 2FA (AUTH-07) **solo si hay tiempo** (si no, queda como «fase posterior»). El envío de correos puede ser a la consola en desarrollo y a un proveedor sencillo en producción.

### 5.2 Validaciones
Revisar **todos** los formularios: validación en cliente y en servidor con los mismos esquemas Zod; límites de longitud; mensajes en español.

### 5.3 QA de permisos
1. Prueba automática que recorre **todas** las filas de la matriz de `01`, 2.2, contra la API real para los cuatro perfiles.
2. Prueba de «no filtración»: un usuario de otro equipo no puede leer nada de este (tareas, chat, archivos, WhatsApp).
3. Prueba de sesiones: cerrar sesión invalida el token; un token caducado da `401`.

### 5.4 Calidad y rendimiento
1. Ampliar la semilla (sección 14.3 de `02`) y ejecutar `EXPLAIN (ANALYZE, BUFFERS)` sobre las 7 consultas clave de `02`, sección 13: **ninguna debe hacer barrido secuencial sobre tablas grandes.** Si lo hace, agregar un índice con una migración nueva.
2. Revisión de accesibilidad: navegación con teclado de las pantallas principales; contraste; `prefers-reduced-motion`.
3. Revisión móvil de 360 px de todas las pantallas principales.
4. Pruebas extremo a extremo (Playwright) de los 3 flujos críticos: crear equipo e invitar; crear, asignar y completar tarea; chat y aviso de WhatsApp simulado.

### 5.5 Capturas para el artículo
Tomar capturas de la app real (o del prototipo donde aún no exista) de cada pantalla que cite el artículo.

### Criterio de terminado de la Fase 5
- [ ] Se puede registrar, entrar, salir y recuperar contraseña con una cuenta real.
- [ ] `DEV_LOGIN_ENABLED` está en `false` en el entorno de producción y el servidor lo exige.
- [ ] La prueba de la matriz completa pasa.
- [ ] Las 7 consultas pasan la revisión de `EXPLAIN` (evidencia pegada en `docs/rendimiento.md`).
- [ ] Los 3 flujos extremo a extremo pasan en CI.
- [ ] CI en verde; tag `fase-5`.

---

## FASE 6 · Despliegue y cierre

**Dueño:** Luis y Jova · Carlos, Isac: conclusiones, abstract y referencias.

1. **Elegir alojamiento (D-03)** y crear los servicios: PostgreSQL gestionado y la API; el front como estático.
2. **Variables de entorno de producción** (`01`, sección 8); ningún secreto en el repositorio.
3. **Migraciones en producción:** `db:migrate` en el despliegue; **la semilla no se carga** en producción (o solo un equipo de demostración, decidido por el equipo).
4. **HTTPS, cookies `Secure`, CORS** al dominio real; límites de peticiones activos.
5. **Webhook de WhatsApp** apuntando a la URL pública (si hay cuenta real).
6. **Copias de seguridad:** activar las del proveedor y anotar cómo restaurar.
7. **Prueba de humo en producción:** registrar, crear equipo, crear tarea, chatear, ver un aviso de WhatsApp.
8. **Cierre:** `README.md` con instrucciones de instalación y uso; actualizar la tabla de verificación del artículo (`04`); resumen de lo que quedó fuera en `docs/progreso.md`.

### Criterio de terminado de la Fase 6
- [ ] La aplicación está accesible por una URL pública y pasa la prueba de humo.
- [ ] El `README.md` permite a alguien nuevo levantar el proyecto en local.
- [ ] La tabla de verificación del artículo no tiene marcas `[VERIFICAR]` sin resolver.
- [ ] Tag `v1.0`.

---

## 9. Pantallas: prioridad por rol y pantallas faltantes

**Prioridad.** **P1** = MVP (debe estar), **P2** = deseable en el plazo, **P3** = fase posterior si no alcanza el tiempo.

### 9.1 Pantallas del prototipo por rol

| Rol | P1 | P2 | P3 |
|---|---|---|---|
| **Visitante** | PUB-01, PUB-02, PUB-03, PUB-04, PUB-12 | PUB-05 a PUB-11, PUB-13, PUB-14 | — |
| **Cuenta** (sin sesión) | AUTH-01, AUTH-02 (Fase 5) | AUTH-03 a AUTH-06, AUTH-10, AUTH-11 | AUTH-07 (2FA) |
| **Personal** | PER-01, PER-02, PER-03, PER-05, PER-06, PER-07, ONB-01 | PER-04, PER-08, ONB-02, ONB-03 | ONB-04 |
| **Líder** | EQ-01, EQ-02, EQ-05, EQ-06, EQ-07, EQ-08, AD-01, AD-02, WA-01, WA-05, WA-06 | EQ-03, EQ-04, EQ-09 a EQ-13, EQ-14, EQ-16, AD-03 a AD-07, AD-11, AD-06, WA-02 a WA-04, WA-07, WA-08, CH-* | EQ-15, EQ-17 a EQ-20, AD-08 a AD-10, AD-12 |
| **Integrante** | EQ-01, EQ-02, EQ-06, EQ-07, EQ-08, CH-02, CH-04 | EQ-03, EQ-09, EQ-12, EQ-14, EQ-16, WA-04, CH-03, CH-05 a CH-09, AD-09, AD-10 | EQ-18 a EQ-20 |
| **Invitado** | IN-01, IN-02, IN-03, AUTH-09, CH-10 | IN-04 | — |
| **Todos** | NT-01, PF-01, PF-02, GL-02, GL-03, GL-05 | PF-03 a PF-07, GL-01, GL-04 | PF-08, PF-09 |

**No se programan:** GL-06 (Simulador), SYS-01 (`/sistema`), SYS-02 (`/indice`).

### 9.2 Pantallas faltantes (propuestas, a confirmar por el equipo)

Resultado de cruzar el inventario, el router y los flujos reales. **Son propuestas**: ninguna se programa sin confirmación del equipo (salvo las de estados, que son parte de GL-05).

| ID | Rol | Pantalla | Motivo | Fase |
|---|---|---|---|---|
| FALT-01 | Personal | Reportes personales (`/app/personal/reportes`) | La ruta existe en el router, pero no aparece en el inventario | 3 |
| FALT-02 | Invitado | Invitación caducada o revocada / acceso expirado | El invitado caduca; hoy solo hay un banner (IN-04) | 2 |
| FALT-03 | Integrante | Unirme al grupo de WhatsApp (enlace y estado de la solicitud) | La API de grupos solo admite entrar con enlace y aprobación | 4 (si hay cuenta real) |
| FALT-04 | Líder | Aprobar solicitudes de unión al grupo de WhatsApp | La empresa debe aprobar cada solicitud | 4 (si hay cuenta real) |
| FALT-05 | Todos | Sin permiso (403) y sin conexión como pantallas completas | GL-05 es un catálogo, no pantallas de ruta | 1 |
| FALT-06 | Líder | Aviso y pantalla de «equipo lleno» (límite alcanzado) | Hace visible el tope de miembros y D-01 | 2 |
| FALT-07 | Líder | Historial de transferencias y elecciones de liderazgo | La BD guarda `transferencias_liderazgo` y `elecciones` sin vista de consulta | 3 |
| FALT-08 | Integrante | Mis solicitudes pendientes (propuestas y cambios) | El integrante propone tareas y no ve su estado en un solo lugar | 2 |
| FALT-09 | Personal | Exportar y eliminar mis datos | La BD tiene `exportaciones_datos`; PF-06 no cubre el flujo completo | 5 |

Reglas para estas pantallas: mismo sistema de diseño, cinco estados, permisos de la matriz, y se agregan al inventario de `docs/progreso.md` al construirlas.

---

## 10. Riesgos y qué hacer

| Riesgo | Señal | Respuesta |
|---|---|---|
| Plazo corto (2–3 semanas, 2 programadores, ~100 pantallas) | Una fase termina tarde | Recortar a P1/P2; mover P3 a «fase posterior» **y anotarlo**; nunca saltarse pruebas de permisos |
| Cuenta de Meta tarda | Sin verificación al llegar a la Fase 4 | Cerrar con modo simulado; el artículo lo dice con claridad |
| Capacidad del grupo de WhatsApp (D-01) | La verificación contradice el 8 | Ajustar `max_miembros` por defecto o usar la opción de avisos individuales; documentar |
| Conflictos de código entre personas e IAs | PR con cambios ajenos | Un dueño por módulo; PR pequeños; rebase frecuente |
| Scripts SQL no re-ejecutados | Fallo en 0.4 | Corregir y registrar (ver 0.4) |
| Librería abandonada o con cambios | Falla la instalación | Sustituir por equivalente y anotar en `docs/decisiones.md` |

## 11. Qué entrega cada fase al artículo

| Fase | Material para el artículo |
|---|---|
| 0 | Resultado de la verificación de WhatsApp (marco teórico y estado del arte) |
| 1 | Introducción, marco teórico, capturas del espacio personal |
| 2 | Estado del arte, capturas de tablero y roles |
| 3 | Casos de uso, metodología, capturas de Hill Chart y sprints |
| 4 | Arquitectura, bosquejos, capturas y evidencias de WhatsApp (corazón del artículo) |
| 5 | Resultados (solo con datos reales de pruebas) y capturas finales |
| 6 | Conclusiones, trabajo a futuro y cierre de la tabla `[VERIFICAR]` |
