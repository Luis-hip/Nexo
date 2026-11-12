# Nexo · Artículo (borrador guiado)

> **Cómo usar este documento.** Sigue la plantilla «Estructura de un artículo» del equipo, sección por sección. Está centrado en la **aportación de WhatsApp**; del resto de Nexo solo hay menciones generales. Tiene dos partes: **A) Instrucciones y reglas** (para quienes redactan) y **B) El artículo**, con texto de primer borrador.
>
> **Regla de oro:** el borrador está escrito *como si parte de la app ya estuviera implementada*, pero **ninguna afirmación sobre el sistema es definitiva** hasta resolver su marca `[VERIFICAR]`. No se inventan cifras, resultados de pruebas ni usuarios. Todo lo que no se pueda demostrar al entregar se reescribe en futuro o en condicional.

---

# PARTE A · Instrucciones

## A.1 Quién escribe qué

| Sección | Responsables (cronograma) |
|---|---|
| Introducción y marco teórico | Carlos, Isac, Jova (Fase 1) |
| Estado del arte | Carlos, Isac (Fase 2) |
| Metodología (casos de uso, redes de Petri) | Carlos, Isac, Jova (Fase 3) |
| Arquitectura y bosquejos | Todos (Fase 4) |
| Resultados y capturas | Carlos, Isac (Fase 5) |
| Conclusiones, abstract y referencias | Carlos, Isac, Jova (Fase 6) |

Todas las personas pueden ayudar con código y artículo.

## A.2 Reglas del borrador

1. **Marcas `[VERIFICAR: Fase N · tarea]`.** Cada frase que describa algo del sistema lleva una marca ligada a la fase del plan (`03_Plan_de_Accion.md`) que la vuelve verdadera. Al terminar esa fase se comprueba y se **quita la marca** o se corrige la frase.
2. **Tabla de verificación (B.14).** Lista todas las marcas. No se entrega el artículo con filas sin cerrar.
3. **Sin cifras inventadas.** Nada de «mejora del 40 %», «20 usuarios», «latencia de X ms». Si no se midió, no se escribe. Los espacios de datos se escriben `[DATO PENDIENTE: qué se medirá y cómo]`.
4. **Capturas:** al inicio salen del prototipo de Figma (se rotulan «Prototipo de interfaz»); cuando la función exista, se reemplazan por capturas de la app real. Nunca se rotula como «aplicación implementada» una captura del prototipo.
5. **WhatsApp real vs. simulado.** Si al cerrar no hubo envío real (Fase 4.3), el artículo dice «implementación con proveedor simulado» y presenta el envío real como trabajo futuro.
6. **Datos de WhatsApp:** los límites (8 participantes, enlace de invitación, aprobación de solicitudes) provienen de una fuente de terceros y deben confirmarse con la documentación oficial de Meta (Fase 0, `docs/whatsapp-verificacion.md`) antes de citarse.
7. **Citas:** no se cita nada que no se haya leído. Las referencias de B.13 son un punto de partida real, pero cada una se **revisa** (autores, año, páginas, URL, fecha de consulta) antes de entregar.
8. **Metodología:** solo **redes de Petri**. Se omiten AMENITIES, SD y SR. Se complementan con diagrama de casos de uso, diagrama de arquitectura y bosquejos de interfaz.
9. **Resultados no obtenidos:** si no hubo pruebas con personas, la sección de resultados describe lo **verificado funcionalmente** (pruebas automáticas, escenarios de las redes de Petri recorridos en la app) y lo declara como tal.

## A.3 Cómo hacer el diagrama de redes de Petri

Una **red de Petri** tiene **lugares** (círculos: condiciones o estados), **transiciones** (rectángulos: eventos o acciones), **arcos** (flechas, siempre entre un lugar y una transición) y **marcas** (puntos dentro de los lugares: dónde «está» el sistema). Una transición se dispara si todos sus lugares de entrada tienen marca; al dispararse mueve las marcas a sus lugares de salida.

Se modelan **dos *proclets*** (redes pequeñas que se comunican por mensajes): **Tarea** y **Aviso a WhatsApp**, con la tabla de B.9.4 como contenido.

**Opción 1 · A mano (papel o pizarra).**
1. Dibuja la red **Tarea** con los lugares y transiciones de la Tabla B.9.4.1; coloca una marca en `Propuesta`.
2. Dibuja la red **Aviso a WhatsApp** con la Tabla B.9.4.2; deja una marca en `Sin evento`.
3. Une ambas con **arcos de mensaje** (línea punteada) desde las transiciones de Tarea que generan evento hasta `Evento recibido` de la otra red (Tabla B.9.4.3).
4. Recorre con el dedo los dos escenarios de B.9.4.4 (tarea rechazada, entrega a tiempo y tardía) moviendo las marcas; si algo no avanza, falta un arco.
5. Fotografía o escanea con buena luz y repasa en limpio con una herramienta gráfica (draw.io, Figma, PowerPoint).

**Opción 2 · Con una herramienta de Petri (recomendado).** Usa **PIPE** (Platform Independent Petri net Editor) u otra herramienta de redes de Petri. Crea los lugares y transiciones de las tablas, agrega los arcos y las marcas iniciales, y usa el simulador para disparar transiciones y comprobar los escenarios. Exporta como imagen para el artículo.

**Opción 3 · Con IA.** Pide a una IA que genere el diagrama a partir de las tablas de B.9.4. Plantilla de petición:

> «Con las tablas de lugares, transiciones y arcos que te pego, genera el código de una red de Petri (con el formato que indique la herramienta que usaré: [PIPE / Graphviz DOT / draw.io XML]). Dos redes separadas (Tarea y Aviso a WhatsApp) con arcos de mensaje punteados entre ellas. Lugares como círculos, transiciones como rectángulos, marcas iniciales en `Propuesta` y `Sin evento`. No agregues elementos que no estén en las tablas. Después lista, paso a paso, cómo se dispara la secuencia “tarea rechazada” y la secuencia “entrega a tiempo”.»

Revisa **siempre** el resultado contra las tablas: la IA puede omitir arcos o inventar lugares. Un diagrama es válido solo si cada elemento está en las tablas y los escenarios se recorren sin quedarse atascados.

**Criterios de calidad del diagrama:** (a) los arcos nunca unen dos lugares ni dos transiciones; (b) toda transición tiene al menos un lugar de entrada y uno de salida; (c) los dos escenarios se recorren de principio a fin; (d) las figuras llevan título y leyenda.

---

# PARTE B · El artículo

## B.1 Título

**Nexo: integración de avisos de trabajo colaborativo con grupos de WhatsApp en un tablero de tareas para equipos pequeños** *(título provisional; ajustar al cerrar)*

## B.2 Autores

Luis Ángel Ortiz Hipólito; Carlos [apellidos]; Isac [apellidos]; Jova [apellidos]. *(Completar nombres completos; dudas sobre «Carlos»/«Carlo» en D-02.)*

## B.3 Adscripciones

Benemérita Universidad Autónoma de Puebla (BUAP), [Facultad / carrera], Puebla, México. *(Completar con la adscripción exacta y correos institucionales.)*

## B.4 Resumen

Los equipos pequeños de estudio y proyecto organizan su trabajo en herramientas de tareas, pero sus conversaciones cotidianas ocurren en WhatsApp, lo que separa el estado del trabajo de los avisos que lo mueven. Este trabajo presenta **Nexo**, una aplicación web de gestión colaborativa de tareas con tablero, roles y sprints, cuya aportación principal es la **integración con grupos de WhatsApp**: el líder define qué eventos del trabajo se avisan al grupo, y cada integrante otorga su consentimiento individual. Se describe el modelo de roles, el diseño de mensajes dinámicos (instantáneos y en reporte), una capa de proveedor que permite operar de forma simulada o con la API de WhatsApp Cloud, y el modelado del flujo mediante redes de Petri con dos *proclets*. `[VERIFICAR: Fase 4 · WhatsApp simulado/real]` Se reportan los resultados verificados funcionalmente y se discuten las limitaciones, entre ellas el tope de participantes por grupo. `[VERIFICAR: Fase 0 · límite oficial; Fase 5 · resultados]`

**Palabras clave:** trabajo colaborativo, gestión de tareas, WhatsApp, redes de Petri, notificaciones, equipos pequeños.

## B.5 Abstract

Small study and project teams manage their work in task tools, yet their everyday conversations happen on WhatsApp, which separates the state of the work from the alerts that move it. This paper presents **Nexo**, a collaborative task-management web application with a board, roles and sprints, whose main contribution is its **integration with WhatsApp groups**: the team leader defines which work events are announced to the group, and each member gives individual consent. We describe the role model, the design of dynamic messages (instant and report modes), a provider layer that allows simulated or WhatsApp Cloud API operation, and the modelling of the flow with Petri nets using two proclets. `[VERIFICAR: Fase 4]` We report functionally verified results and discuss limitations, including the participant cap per group. `[VERIFICAR: Fase 0; Fase 5]`

**Keywords:** collaborative work, task management, WhatsApp, Petri nets, notifications, small teams.

## B.6 Introducción

El trabajo en equipo en entornos académicos y de proyectos pequeños suele repartirse entre una herramienta de organización (tableros, listas, calendarios) y un canal de mensajería. En México, WhatsApp es el canal de comunicación cotidiano de estos equipos `[VERIFICAR: cita con dato de uso en México]`. La consecuencia es una brecha: la tarea cambia de estado en el tablero, pero el aviso llega tarde o no llega, y quien lleva el orden termina copiando y pegando recordatorios.

**Problema.** No existe, en las herramientas de tareas más usadas, un mecanismo en el que el **líder del equipo** controle qué avisos del tablero llegan al grupo de WhatsApp y que respete el **consentimiento individual** de cada persona. `[VERIFICAR: Fase 2 · estado del arte (tabla B.8)]`

**Objetivo.** Diseñar y construir una aplicación de gestión de tareas con roles claros e integración con grupos de WhatsApp, y modelar el flujo de avisos con redes de Petri.

**Aportación.** (1) Un modelo de avisos a nivel de grupo con consentimiento individual; (2) mensajes dinámicos generados desde datos reales del trabajo, en modo instantáneo y de reporte; (3) una capa de proveedor intercambiable (simulado, API de grupos, mensajes directos); (4) el modelado formal del flujo con dos *proclets*.

**Alcance.** El artículo se centra en la integración con WhatsApp. El resto de Nexo (tablero, sprints, Hill Chart, chat interno) se menciona solo como contexto.

**Organización.** La sección 2 presenta el marco teórico; la 3, el estado del arte; la 4, la metodología; la 5, los resultados; la 6, las conclusiones.

## B.7 Marco teórico

**Trabajo colaborativo apoyado por computadora (CSCW).** Disciplina que estudia cómo los sistemas apoyan la coordinación de personas; la **percepción de la actividad** (*awareness*) es una necesidad central: saber qué ocurre en el trabajo del grupo sin preguntar. Los avisos son un mecanismo de percepción. `[VERIFICAR: cita CSCW/awareness]`

**Tableros y métodos ágiles.** El tablero de tareas por estado (estilo Kanban) y los *sprints* organizan el trabajo en ciclos cortos con retrospectiva; Nexo adopta ambos en versión ligera. `[VERIFICAR: cita Kanban/Scrum]`

**Hill Chart.** Visualización de avance en forma de colina: la subida es «descubrir» y la bajada «ejecutar»; fue popularizada por Basecamp. `[VERIFICAR: cita Shape Up]`

**Notificaciones y consentimiento.** Una notificación útil es oportuna, relevante y controlable; el consentimiento individual evita convertir el aviso en ruido. `[VERIFICAR: cita sobre notificaciones]`

**WhatsApp Business Platform.** API oficial de Meta para que una empresa envíe y reciba mensajes; incluye una API para grupos. Según la documentación consultada, los grupos tienen un límite de participantes que incluye el número de la empresa, no hay una operación para agregar participantes (se entra por enlace de invitación y la empresa aprueba la solicitud) y se requiere una cuenta de empresa verificada. `[VERIFICAR: Fase 0 · docs/whatsapp-verificacion.md — datos provenientes de una fuente de terceros hasta confirmarse con Meta]`

**Redes de Petri.** Formalismo matemático para modelar sistemas concurrentes y distribuidos con **lugares**, **transiciones**, **arcos** y **marcas**. Permiten analizar propiedades como ausencia de bloqueos y alcanzabilidad. Los ***proclets*** son redes pequeñas que representan procesos independientes y se coordinan intercambiando mensajes, apropiado para modelar «la tarea» y «el aviso» como procesos distintos. `[VERIFICAR: citas Petri, Murata, proclets]`

## B.8 Estado del arte

*(El equipo ya tiene una versión aprobada en clase: pegarla aquí y completar la tabla con las herramientas que comparó. La tabla de abajo es solo la estructura; **no copiar valores sin comprobarlos en las fuentes**.)*

| Herramienta | Tablero de tareas | Roles definidos | Aviso a grupo de WhatsApp | Control del líder sobre qué se avisa | Consentimiento individual | Fuente |
|---|---|---|---|---|---|---|
| Trello | `[VERIFICAR]` | `[VERIFICAR]` | `[VERIFICAR]` | `[VERIFICAR]` | `[VERIFICAR]` | `[cita]` |
| Asana | `[VERIFICAR]` | `[VERIFICAR]` | `[VERIFICAR]` | `[VERIFICAR]` | `[VERIFICAR]` | `[cita]` |
| (otras del trabajo de clase) | | | | | | |
| **Nexo** | Sí `[VERIFICAR: Fase 2]` | Sí `[VERIFICAR: Fase 2]` | Sí `[VERIFICAR: Fase 4]` | Sí `[VERIFICAR: Fase 4]` | Sí `[VERIFICAR: Fase 4]` | Este trabajo |

Cada celda se llena con lo que la **documentación oficial** de cada herramienta dice a la fecha de consulta (anotarla). Si una herramienta se integra con WhatsApp mediante terceros (por ejemplo, plataformas de automatización), se indica «mediante terceros», no «sí».

## B.9 Metodología de desarrollo

Se modeló el sistema con **redes de Petri**, complementadas con un diagrama de casos de uso, un diagrama de arquitectura y bosquejos de interfaz. *(No se usan AMENITIES, SD ni SR.)*

### B.9.1 Casos de uso

Actores: **Líder**, **Integrante**, **Invitado**, **Persona (espacio personal)** y **Sistema de WhatsApp** (actor externo). Casos de uso centrales para este artículo: configurar la integración (líder), definir reglas de eventos (líder), dar consentimiento (integrante), revisar y enviar la cola (líder), consultar historial (líder, integrante), recibir aviso (integrante en WhatsApp). *(Dibujar el diagrama UML de casos de uso y rotularlo como Figura 1.)* `[VERIFICAR: Fase 3]`

### B.9.2 Arquitectura

Aplicación web de tres capas: cliente React, API Fastify y base de datos PostgreSQL, con comunicación en tiempo real (WebSocket) y una cola de tareas en la propia base de datos. Los cambios de interés se registran como **eventos de dominio** en la misma transacción que el cambio (patrón *outbox*); un procesador decide, según las reglas del equipo, si se genera un aviso, lo deja en cola y, tras la revisión del líder, lo entrega mediante una **capa de proveedor** con tres implementaciones: simulado, API de grupos y mensajes directos. *(Figura 2: diagrama de arquitectura; tomar el de `01_Contexto_y_Especificaciones.md`, sección 7.)* `[VERIFICAR: Fase 4]`

### B.9.3 Bosquejos de interfaz

Figuras 3 a 5: panel de WhatsApp (WA-01), reglas de eventos (WA-05) y vista previa en burbuja (WA-03). *(Capturas del prototipo, rotuladas «Prototipo de interfaz», hasta que existan las reales.)* `[VERIFICAR: Fase 4 · reemplazar por capturas reales]`

### B.9.4 Modelado con redes de Petri (dos *proclets*)

#### Tabla B.9.4.1 · *Proclet* «Tarea»

| Tipo | Elemento | Significado |
|---|---|---|
| Lugar | `Propuesta` | Un integrante propuso la tarea (marca inicial) |
| Transición | `Aceptar (líder)` | El líder acepta en triaje |
| Transición | `Rechazar (líder)` | El líder rechaza la propuesta |
| Lugar | `Rechazada` | Estado final de rechazo |
| Lugar | `Asignada` | Con responsable, pendiente de respuesta |
| Transición | `Aceptar asignación` | El responsable acepta |
| Lugar | `En curso` | El responsable trabaja |
| Transición | `Entregar` | El responsable envía a revisión/entrega |
| Lugar | `Entregada` | Entregada |
| Transición | `Vencer` | Pasa el plazo sin entrega |
| Lugar | `Vencida` | Plazo superado |
| Transición | `Entregar tarde` | Se entrega después de vencida |
| Lugar | `Hecha` | Estado final |

#### Tabla B.9.4.2 · *Proclet* «Aviso a WhatsApp»

| Tipo | Elemento | Significado |
|---|---|---|
| Lugar | `Sin evento` | Espera (marca inicial) |
| Lugar | `Evento recibido` | Llegó un evento de la tarea |
| Transición | `Evaluar reglas` | Comprueba la regla del equipo y el consentimiento |
| Lugar | `Sin regla / sin consentimiento` | No se avisa |
| Lugar | `Mensaje generado` | Se creó el texto desde la plantilla |
| Transición | `Encolar` | Pasa a la cola |
| Lugar | `En cola` | Espera la revisión del líder |
| Transición | `Enviar (líder)` | El líder envía |
| Lugar | `Enviado` | Entregado al proveedor |
| Transición | `Confirmar estado` | Llega el estado (entregado/leído/fallido) |
| Lugar | `Estado final` | Registrado en el historial |

#### Tabla B.9.4.3 · Arcos de mensaje entre *proclets*

| Desde (Tarea) | Hacia (Aviso) | Evento |
|---|---|---|
| `Aceptar asignación` | `Evento recibido` | «Tarea asignada» |
| `Vencer` | `Evento recibido` | «Tarea vencida» |
| `Entregar` | `Evento recibido` | «Entrega a tiempo» |
| `Entregar tarde` | `Evento recibido` | «Entrega tardía» |
| `Rechazar (líder)` | `Evento recibido` | «Propuesta rechazada» |

#### B.9.4.4 Escenarios que debe recorrer la red

1. **Tarea rechazada:** `Propuesta → Rechazar (líder) → Rechazada`; mensaje «Propuesta rechazada»; `Evaluar reglas` → `Mensaje generado → Encolar → En cola → Enviar (líder) → Enviado → Confirmar estado`.
2. **Entrega a tiempo:** `Propuesta → Aceptar → Asignada → Aceptar asignación → En curso → Entregar → Entregada → Hecha`; mensaje «Entrega a tiempo».
3. **Entrega tardía:** `… En curso → Vencer → Vencida → Entregar tarde → Hecha`; mensajes «Tarea vencida» y luego «Entrega tardía».
4. **Sin consentimiento:** `Evaluar reglas → Sin regla / sin consentimiento` (no se avisa a esa persona).

*(Figura 6: red de Petri. Se construye siguiendo la Parte A.3. Si se hace con herramienta, indicar cuál.)* `[VERIFICAR: Fase 3 · comprobar que cada escenario coincide con el comportamiento real de la app]`

## B.10 Resultados

> **Estado:** sección en preparación. Se rellena con lo que se haya **verificado**. No se escriben cifras no medidas.

**B.10.1 Implementación.** Se construyó `[VERIFICAR: lista exacta de lo terminado por fase]`: tablero con roles y permisos `[Fase 2]`, chat en tiempo real `[Fase 4]`, cola de avisos de WhatsApp con reglas, consentimiento y modos instantáneo y de reporte `[Fase 4]`, proveedor simulado `[Fase 4]` y, en su caso, envío real a un grupo de prueba `[VERIFICAR: Fase 4.3 · si no se logró, eliminar esta frase]`.

**B.10.2 Verificación funcional.** Se ejecutaron pruebas automáticas de permisos (matriz de cuatro perfiles) `[VERIFICAR: Fase 5 · número real de casos y de aprobados]`, de integridad de la base de datos (11 pruebas) `[VERIFICAR: Fase 0 · confirmar las 11 OK]` y de los tres flujos extremo a extremo `[VERIFICAR: Fase 5]`. Los escenarios de la red de Petri (B.9.4.4) se recorrieron en la aplicación `[VERIFICAR: Fase 5 · cuáles se recorrieron realmente]`.

**B.10.3 Tabla de resultados.**

| Verificación | Resultado | Evidencia |
|---|---|---|
| Matriz de permisos | `[DATO PENDIENTE]` | `[captura/registro de CI]` |
| Pruebas de la BD | `[DATO PENDIENTE]` | `[salida del script]` |
| Escenario «tarea rechazada» | `[DATO PENDIENTE]` | `[captura]` |
| Escenario «entrega a tiempo» | `[DATO PENDIENTE]` | `[captura]` |
| Escenario «entrega tardía» | `[DATO PENDIENTE]` | `[captura]` |
| Envío real a grupo de prueba | `[DATO PENDIENTE o «no realizado»]` | `[captura]` |

**B.10.4 Capturas.** Figuras 7 a 10 (panel de WhatsApp, cola de envío, historial, vista previa). Reemplazar las del prototipo por las de la app real y quitar el rótulo «Prototipo». `[VERIFICAR: Fase 5.5]`

**B.10.5 Limitaciones observadas.** Tope de participantes por grupo `[VERIFICAR: Fase 0]`; dependencia de una cuenta de empresa verificada; ausencia de pruebas con usuarios `[VERIFICAR: si no hubo, dejarlo explícito]`.

## B.11 Conclusiones y trabajo a futuro

**Conclusiones.** Nexo muestra que es viable acoplar el estado de un tablero de tareas con avisos a un grupo de WhatsApp bajo control del líder y con consentimiento individual, y que modelar el flujo con *proclets* de Petri ayuda a precisar los escenarios y a diseñar las pruebas. `[VERIFICAR: Fase 6 · ajustar a lo realmente logrado]` La principal restricción es el tamaño de los grupos de la API de WhatsApp. `[VERIFICAR: Fase 0]`

**Trabajo a futuro.** Evaluación con equipos reales; envío real a grupos si no se logró; análisis formal de propiedades de la red (acotación, ausencia de bloqueos); edición colaborativa de texto; segunda ruta para equipos mayores al límite del grupo; internacionalización. *(Quitar de esta lista lo que sí se haya hecho.)*

## B.12 Agradecimientos *(opcional)*

## B.13 Referencias

*Punto de partida real; **verificar cada dato** (autores, año, páginas, URL, fecha de consulta) y completar con las fuentes del estado del arte aprobado.*

1. Petri, C. A. (1962). *Kommunikation mit Automaten*. Tesis doctoral, Universidad de Bonn. `[VERIFICAR]`
2. Murata, T. (1989). Petri nets: Properties, analysis and applications. *Proceedings of the IEEE*, 77(4), 541–580. `[VERIFICAR]`
3. Singer, R. (2019). *Shape Up: Stop Running in Circles and Ship Work that Matters*. Basecamp. `[VERIFICAR]` *(Hill Charts)*
4. Meta. *WhatsApp Business Platform / Cloud API: documentación para desarrolladores* (sección de grupos). `[URL y fecha de consulta]`
5. PIPE: *Platform Independent Petri net Editor*. `[VERIFICAR: sitio y versión usada]`
6. `[Referencia sobre proclets]`
7. `[Referencias de CSCW / awareness]`
8. `[Referencias de Kanban / Scrum]`
9. `[Documentación oficial de cada herramienta del estado del arte, con fecha de consulta]`

## B.14 Tabla de verificación (cerrar antes de entregar)

| # | Afirmación o marca | Dónde | Se cierra en | Cómo se comprueba | Estado |
|---|---|---|---|---|---|
| 1 | Límite de participantes y reglas de grupos de WhatsApp | B.4, B.7, B.10.5, B.11 | Fase 0 | `docs/whatsapp-verificacion.md` con enlaces oficiales | ☐ |
| 2 | Comparación con otras herramientas | B.8 | Fase 2 | Documentación oficial con fecha | ☐ |
| 3 | Tablero y roles funcionando | B.8, B.10.1 | Fase 2 | Pruebas de permisos y capturas | ☐ |
| 4 | Casos de uso y red de Petri coinciden con la app | B.9.1, B.9.4 | Fase 3 | Recorrido de escenarios en la app | ☐ |
| 5 | Chat en tiempo real | B.10.1 | Fase 4 | Prueba con dos navegadores | ☐ |
| 6 | Cola de avisos, reglas, consentimiento, modos | B.4, B.9.2, B.10.1 | Fase 4 | Prueba de evento → mensaje → historial | ☐ |
| 7 | Envío real a grupo de prueba | B.4, B.10.1, B.11 | Fase 4.3 | Captura del mensaje en el grupo o nota «no realizado» | ☐ |
| 8 | Resultados de pruebas | B.10.2, B.10.3 | Fase 5 | Registros de CI y salida de scripts | ☐ |
| 9 | Capturas reales | B.9.3, B.10.4 | Fase 5.5 | Sustituir las del prototipo | ☐ |
| 10 | Conclusiones ajustadas a lo logrado | B.11 | Fase 6 | Revisión del equipo | ☐ |
| 11 | Referencias revisadas | B.13 | Fase 6 | Cada dato contrastado | ☐ |
| 12 | Datos sobre uso de WhatsApp en México | B.6 | Fase 1 | Fuente citada | ☐ |
