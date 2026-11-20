# Nexo · Verificación de la API de WhatsApp (tarea 0.7)

> **Estado (2026-11-20, DEC-WA-2):** la verificación del negocio, la OBA y la API de grupos quedan **ignoradas hasta nuevo aviso**. Nexo usa el número de pruebas con mensajes directos (hasta 5 destinatarios dados de alta en Meta). D-01 queda resuelta para esta etapa: sin grupos, el tope de 8 no depende de Meta.

> **Estado: investigación de documentación hecha el 2026-11-18; trámites de cuenta en curso.** Dueños: Carlos e Isac, con apoyo de Jova. Este documento se llena **solo con la documentación oficial de Meta** (developers.facebook.com), con enlace y fecha de consulta en cada dato. Si algo no se puede confirmar, se escribe «no se pudo verificar» y el motivo. Con el resultado, el equipo resuelve **D-01** (`01`, sección 7.3).

## 1. Trámites

| Trámite | Estado | Fecha | Evidencia (captura o nota) |
|---|---|---|---|
| Cuenta de Meta for Developers | Hecho (lo informó Luis) | 2026-11-18 | Falta adjuntar captura |
| App creada | Hecho | 2026-11-18 | App «Nexo conexión de equipos», modo desarrollo, vinculada al portfolio «Nexo app colaborativa», caso de uso WhatsApp. Visto en el panel; falta captura |
| Cuenta de WhatsApp Business (WABA) | Hecho (WABA de prueba) | 2026-11-18 | Creada por Meta al aceptar los términos en «Paso 1. Pruébalo». IDs guardados fuera del repo |
| Número de pruebas | Hecho | 2026-11-18 | Número de prueba asignado por Meta (envía a un máximo de 5 números). Falta captura con el token oculto |
| Verificación de la empresa iniciada | Pendiente (el asistente existe en Centro de seguridad, aún no se envía la solicitud) | 2026-11-18 | Portfolio «Nexo app colaborativa» sin verificar; Meta muestra «Iniciar verificación» |
| Documentos que pide Meta para la verificación | Anotado | 2026-11-18 | Asistente en 3 pasos: (1) información del negocio: nombre, dirección, teléfono, correo y sitio web; (2) confirmar la conexión con el negocio por un método de contacto a elegir; (3) subir documentos aceptados, solo «si no se encuentra el negocio». La lista exacta de documentos aceptados no se vio todavía |

> **OBA (consultado 2026-11-18 en [Cuentas de empresa oficiales](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts), actualizada 19 sep 2026).** La API de grupos exige OBA. Meta **no otorga OBA a números de cuentas de prueba**, ni a números de empleados ni de la app WhatsApp Business. Requisitos: cumplir la Política de mensajes de WhatsApp Business; estar registrado en la plataforma al menos 30 días; que el portfolio haya completado la verificación del negocio; verificación en dos pasos activa en el número; nombre visible aprobado. La solicitud se envía en Administrador de WhatsApp > número > Perfil > Cuenta de empresa oficial > Enviar solicitud. Si la rechazan, se reintenta tras 30 días.
>
> **Consecuencia:** con el número de pruebas actual **no se pueden crear grupos**. El envío real a grupos (4.3) necesita un número real, la verificación del negocio aprobada y OBA. Estado hoy: verificación del negocio pendiente (sin sitio web desplegado ni documentos reales), por lo que OBA no se puede solicitar todavía.

## 2. Preguntas a verificar

Los datos de `01`, sección 7.3, vienen de un sitio de terceros y **no** cuentan como verificados. Las respuestas de abajo salen de la documentación oficial, consultada el 2026-11-18. La página está traducida con IA al español; el texto en inglés es el original.

Base: [API de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) (actualizada 15 oct 2026), [Primeros pasos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started) (21 may 2026), [Administración de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference) (4 nov 2026), [Precios de la API de grupo](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/pricing) (10 sep 2026).

| # | Pregunta | Respuesta oficial | Enlace | Fecha de consulta |
|---|---|---|---|---|
| 1 | ¿Cuál es el límite de participantes de un grupo creado con la API Cloud? | «Participantes máximos por grupo: 8». También: 10.000 grupos por número empresarial y 1 empresa de API Cloud por grupo. | [API de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) | 2026-11-18 |
| 2 | ¿El número de la empresa cuenta dentro de ese límite? | **No se pudo verificar de forma explícita.** La documentación dice que el número usado para crear el grupo «siempre se añade como creador y administrador», pero no dice si ocupa uno de los 8 lugares. Se debe probar con un grupo real o preguntar a Meta. | [Administración de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference) | 2026-11-18 |
| 3 | ¿Cómo se une la gente (enlace de invitación, aprobación de la empresa)? ¿Hay endpoint para agregar participantes? | Los grupos son solo por invitación. Al crear el grupo se genera un enlace (`invite_link`, llega por webhook `group_lifecycle_update`). **No se pueden añadir participantes manualmente**: se envía el enlace con una plantilla de «Enlace de invitación al grupo». Opcional: `join_approval_mode = approval_required` para que la empresa apruebe o rechace cada solicitud (por defecto `auto_approve`); hay endpoints para obtener, aprobar y rechazar solicitudes. Sí hay endpoint para **eliminar** participantes. | [Primeros pasos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started), [Administración de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference) | 2026-11-18 |
| 4 | ¿Qué requisitos de cuenta pide (empresa verificada, permiso `whatsapp_business_messaging`, otros)? | Cuenta de empresa oficial (OBA). El número debe usarse con la API Cloud (no con la app de WhatsApp Business ni en multisolución). Servidor de webhook configurado; app suscrita a `group_lifecycle_update`, `group_participants_update`, `group_settings_update`, `group_status_update` y a la cuenta de mensajes del número; permiso `whatsapp_business_messaging`. Tipos no admitidos: llamadas, mensajes temporales, de visualización única, de autenticación, comerciales e interactivos. No se puede editar ni eliminar mensajes. | [API de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups), [Primeros pasos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started) | 2026-11-18 |
| 5 | ¿Qué costos vigentes aplican (por conversación, por mensaje, por grupo) en México? | Precio **por mensaje entregado, por destinatario**: un mensaje facturable a un grupo de 5 personas cobra 5 entregas, según el país de cada destinatario. Las tarifas de grupo son las mismas que las de mensajes individuales. Meta publica hojas de tarifas en MXN (CSV/PDF). Mensajes sin plantilla: gratis hasta el nivel gratuito de 1.000 mensajes (compartido con los de servicio 1:1; una unidad por destinatario). A partir del 1 oct 2026, los mensajes de utilidad dentro de un intervalo de servicio de grupo se cobran. Cifra exacta en MXN: **no se pudo verificar**, está solo en archivos CSV/PDF que no se descargaron. | [Precios de la API de grupo](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/pricing), [Precios de WhatsApp Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) | 2026-11-18 |
| 6 | ¿Hay límites de envío o de grupos por número? | Sí, de grupos: 10.000 por número empresarial. Los límites de envío (mensajes por segundo o por día) de la API de grupos **no se pudieron verificar** en estas páginas. | [API de grupos](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups) | 2026-11-18 |

## 3. Conclusión para D-01

<!-- Qué opción de 01, 7.3, recomienda el resultado y por qué. No se cambia max_miembros sin decisión del equipo. -->

**Propuesta para que el equipo la discuta (no es decisión):**

- El tope oficial es **8 participantes por grupo**, y el número de Nexo se añade siempre como administrador. La documentación no aclara si ocupa uno de los 8; hasta confirmarlo con un grupo real de prueba (4.3), conviene suponer el peor caso: **7 personas + el número de Nexo**.
- Esto apunta a la **opción 3** de `01`, 7.3: mantener 8 miembros en la app y que el grupo de WhatsApp sea **opcional por persona** (quien no entre recibe el aviso por la app). Es la que menos obliga a cambiar `max_miembros`.
- Entrar es siempre por enlace de invitación y el líder puede activar la aprobación, así que las pantallas `FALT-03` y `FALT-04` del plan siguen siendo necesarias.
- Antes de decidir faltan: la pregunta 2 (¿cuenta el número de Nexo?), la tarifa en MXN y los límites de envío.
- **Bloqueo para la 4.3:** el envío real a grupos exige OBA, que a su vez exige verificación del negocio aprobada, 30 días de registro y un número real (no de pruebas). Con el estado actual, la 4.3 no se puede hacer, y el plan ya prevé ese caso: dejar el motivo documentado y describir el modo simulado como lo implementado.
- Alternativa a evaluar: `cloud_api_directo` (avisos individuales, sin grupos), que no necesita OBA. No se verificó aquí qué requisitos tiene el envío directo de plantillas a personas; queda como pregunta para el equipo.
