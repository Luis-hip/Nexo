# Nexo · Cronograma

> Adaptación del borrador de seis fases del equipo al plan técnico (`03_Plan_de_Accion.md`). **Sin fechas fijas**: el proyecto dura **2 a 3 semanas** y las fases se reparten en ese tiempo. Los responsables salen de la columna del borrador original.

## 1. Equipo

| Persona | Rol principal | También puede |
|---|---|---|
| **Luis** | Desarrollo principal (con Jova) | Artículo |
| **Jova** | Desarrollo (con Luis) y apoyo al artículo | Ambos |
| **Carlos** *(¿«Carlo»? ver D-02)* | Artículo | Código |
| **Isac** | Artículo | Código |

## 2. Resumen por fase

Las fases 1 a 6 son las del borrador del equipo; la **Fase 0** es nueva y corta.

| Fase | Desarrollo (Luis, Jova) | Artículo | Hito de salida |
|---|---|---|---|
| **0 · Arranque** *(nueva)* | Repositorio, CI, BD con 11 pruebas `OK`, *dev login* | Carlos e Isac: trámites de Meta y verificación de WhatsApp (`docs/whatsapp-verificacion.md`) | CI en verde; Meta iniciada; decisión D-01 con datos |
| **1 · Arquitectura base, roles, espacio personal** | Sistema de diseño, páginas públicas, estructura de la app, permisos, espacio personal | **Introducción y marco teórico** (Carlos, Isac, Jova) | `fase-1` |
| **2 · Tablero y estados** | Equipos, invitaciones, tablero, triaje, estados | **Estado del arte** | `fase-2` |
| **3 · Hill Chart y diseño** | Hill Chart, color, sprints, vistas secundarias, ajustes | **Metodología y casos de uso** (incluye redes de Petri) | `fase-3` |
| **4 · Chat y WhatsApp** | Chat en tiempo real, WhatsApp simulado y envío real mínimo | **Arquitectura y bosquejos** (todos) | `fase-4` |
| **5 · QA y matriz de permisos** | Autenticación real, validaciones, pruebas de permisos, índices | **Resultados y capturas** | `fase-5` |
| **6 · Despliegue** | Producción, README, prueba de humo | **Conclusiones, abstract y referencias** | `v1.0` |

## 3. Cambios respecto al borrador (a confirmar por el equipo)

| # | Cambio | Motivo |
|---|---|---|
| C-1 | Se agrega una **Fase 0** | El repositorio, la CI y los trámites de Meta deben estar listos antes; la verificación de la empresa puede tardar días |
| C-2 | **Un envío mínimo de WhatsApp** (un evento a un grupo de prueba) se intenta **desde la mitad de la Fase 3 y se cierra en la Fase 4**, no solo al final | El artículo se centra en WhatsApp; no debe ser lo último en validarse. Si la cuenta no está lista, se cierra con el modo simulado |
| C-3 | La **autenticación real** (login/registro/logout) pasa a la Fase 5 | Primero las vistas y los módulos; mientras tanto se usa el *dev login* |
| C-4 | Se agrega la sección «Estado del arte» a la Fase 2 con **tabla de comparación** | Lo pide la plantilla del artículo |
| C-5 | El **artículo se redacta en paralelo**, con marcas `[VERIFICAR]` | Evita escribirlo todo al final; se cierra con la tabla de verificación |

## 4. Detalle por fase

### Fase 0 · Arranque
- **Desarrollo:** tareas 0.1–0.6 y 0.8 del plan. **Dueño:** Luis.
- **Artículo:** crear cuenta de Meta, iniciar verificación, leer la documentación oficial y llenar `docs/whatsapp-verificacion.md`. **Dueños:** Carlos e Isac, con apoyo de Jova.
- **Salida:** 11 pruebas SQL `OK`, CI verde, evidencia de Meta, decisión D-01 tomada o razonada.

### Fase 1 · Arquitectura base, roles y espacio personal
- **Desarrollo (Luis, Jova):** secciones 1.1–1.5 del plan.
- **Artículo (Carlos, Isac, Jova):** B.6 Introducción y B.7 Marco teórico; dato de uso de WhatsApp en México con fuente.
- **Salida:** espacio personal funcionando con datos reales; introducción y marco teórico en borrador.

### Fase 2 · Tablero y estados
- **Desarrollo:** secciones 2.1–2.3.
- **Artículo:** B.8 Estado del arte con la tabla de comparación (documentación oficial y fecha de consulta).
- **Salida:** equipos y tablero con permisos probados.

### Fase 3 · Hill Chart y diseño
- **Desarrollo:** secciones 3.1–3.7.
- **Artículo:** B.9.1 casos de uso y B.9.4 redes de Petri: construir el diagrama siguiendo la Parte A.3 de `04_Articulo.md`.
- **Salida:** Hill Chart, sprints y vistas secundarias; casos de uso y red de Petri dibujados.

### Fase 4 · Chat y WhatsApp
- **Desarrollo:** secciones 4.1–4.3; Luis lleva WhatsApp.
- **Artículo (todos):** B.9.2 arquitectura y B.9.3 bosquejos.
- **Salida:** chat en tiempo real; WhatsApp simulado completo; envío real o nota explícita.

### Fase 5 · QA y matriz de permisos
- **Desarrollo:** autenticación real, validaciones, pruebas de la matriz, `EXPLAIN` de las 7 consultas, accesibilidad, móvil, extremo a extremo.
- **Artículo:** B.10 Resultados **solo con datos reales**; sustituir capturas del prototipo por las de la app.
- **Salida:** CI con todas las pruebas; resultados y capturas listos.

### Fase 6 · Despliegue
- **Desarrollo:** secciones de la Fase 6.
- **Artículo:** B.11 conclusiones, B.4/B.5 resumen y abstract finales, B.13 referencias revisadas, cierre de la tabla B.14.
- **Salida:** aplicación en línea y artículo sin marcas pendientes.

## 5. Distribución de tiempo orientativa (2–3 semanas)

| Fase | Semana 1 | Semana 2 | Semana 3 (si hay) |
|---|---|---|---|
| 0 | ■■ | | |
| 1 | ■■ | | |
| 2 | ■ | ■■ | |
| 3 | | ■■ | |
| 4 | | ■■ | ■ |
| 5 | | | ■■ |
| 6 | | | ■ |

Con **2 semanas** se comprimen las fases 5 y 6 y se pasan a «fase posterior» las pantallas P3 (ver plan, sección 9). **No** se recortan las pruebas de permisos ni la verificación del artículo.

## 6. Puntos de control

| Punto | Cuándo | Qué se decide |
|---|---|---|
| Fin de Fase 0 | Primeros días | D-01 (capacidad de WhatsApp); si Meta está lista o se cierra con modo simulado |
| Fin de Fase 2 | Mitad del proyecto | Qué pantallas P2 se mantienen; ajuste del alcance |
| Fin de Fase 4 | Antes de QA | ¿Envío real logrado? Define cómo se redacta el artículo (real o simulado) |
| Fin de Fase 5 | Antes de desplegar | Lista de pendientes «fase posterior» |

## 7. Preguntas para el equipo

1. ¿El nombre es **Carlos** o **Carlo**? (D-02)
2. ¿Confirman los cambios C-1 a C-5?
3. ¿Hay fecha límite externa (entrega de la materia o del artículo)? Si la hay, se coloca sobre este cronograma.
