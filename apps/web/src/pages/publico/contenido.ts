export const ARTICULOS: {
  slug: string;
  categoria: string;
  titulo: string;
  resumen: string;
  secciones: { t: string; p: string }[];
}[] = [
  {
    slug: 'crear-un-equipo',
    categoria: 'Primeros pasos',
    titulo: 'Cómo crear un equipo',
    resumen: 'Crea tu equipo en 4 pasos y conviértete en su líder.',
    secciones: [
      {
        t: 'Antes de empezar',
        p: 'Toda cuenta nace con un Espacio personal. Desde ahí puedes crear un equipo cuando quieras; al hacerlo te conviertes en su único líder.',
      },
      {
        t: 'Los 4 pasos',
        p: '1) Nombre, descripción y avatar. 2) Duración del sprint (1, 2 o 3 semanas) y zona horaria. 3) Invitaciones opcionales por enlace, código o correo. 4) Decide si tus tareas personales siguen privadas (por defecto) o copias algunas al equipo.',
      },
      {
        t: 'Después de crearlo',
        p: 'Llegarás al Resumen del equipo. Desde Equipo › Invitar compartes el código y desde WhatsApp conectas el grupo cuando estés listo.',
      },
    ],
  },
  {
    slug: 'unirse-con-codigo',
    categoria: 'Primeros pasos',
    titulo: 'Unirte con un código o enlace',
    resumen: 'Usa el código que te compartió el líder.',
    secciones: [
      {
        t: 'Dónde ingresarlo',
        p: 'En Equipos › Unirme con código escribe el código (por ejemplo NX4-821Q) o pega el enlace. Verás una vista previa con el líder, los miembros y el rol que tendrás.',
      },
      {
        t: 'Errores comunes',
        p: 'Si el código caducó o ya se usó, pide uno nuevo al líder. No existe búsqueda pública de equipos: siempre necesitas una invitación.',
      },
    ],
  },
  {
    slug: 'hill-chart',
    categoria: 'Trabajo',
    titulo: 'Leer el Hill Chart',
    resumen: 'Color, forma y anillo: qué significa cada figura.',
    secciones: [
      {
        t: 'La colina',
        p: 'La subida es «Definiendo» (todavía hay incógnitas) y la bajada «Ejecutando» (ya se sabe qué hacer). La posición refleja el progreso de 0 a 100.',
      },
      {
        t: 'Forma y color',
        p: 'El color es el del responsable. La forma es el estado: triángulo atascada, círculo avanza con normalidad, cuadrado completada.',
      },
      {
        t: 'Anillo de urgencia',
        p: 'Un anillo ámbar indica que vence en menos de 48 horas; rojo, que está vencida. La figura conserva el color de su responsable.',
      },
    ],
  },
  {
    slug: 'votacion',
    categoria: 'Trabajo',
    titulo: 'Proponer tareas y votarlas',
    resumen: 'El líder propone, los integrantes votan.',
    secciones: [
      {
        t: 'Proponer',
        p: 'El líder propone cada tarea junto con sus subtareas. La propuesta llega a Votación. Si eres integrante y tienes una idea, compártela en el chat o en los comentarios.',
      },
      {
        t: 'Votar',
        p: 'Cada integrante vota a favor o en contra y puede cambiar su voto mientras la votación siga abierta. Se ve cuántos votaron y quiénes, pero no cómo votó cada persona. El líder no vota y los invitados no ven las propuestas.',
      },
      {
        t: 'Resultado',
        p: 'La propuesta se acepta para el sprint cuando más de la mitad de los integrantes vota a favor, y se rechaza cuando más de la mitad vota en contra. Con empate sigue abierta; el líder puede retirarla o reformularla como una propuesta nueva.',
      },
    ],
  },
  {
    slug: 'estados-de-tarea',
    categoria: 'Trabajo',
    titulo: 'Estados de una tarea',
    resumen: 'De Propuesta a Completada.',
    secciones: [
      {
        t: 'El flujo',
        p: 'Propuesta → Aceptada → Habilitada → En curso ⇄ Atascada → Completada (a tiempo o con retraso). Una propuesta puede quedar Rechazada por votación o Retirada por el líder.',
      },
      {
        t: 'Quién mueve',
        p: 'El líder habilita y puede reabrir; el responsable pasa a En curso, marca Atascada (con motivo) o Completada.',
      },
    ],
  },
  {
    slug: 'whatsapp',
    categoria: 'Comunicación',
    titulo: 'Avisos por WhatsApp',
    resumen: 'Qué se envía al instante y qué va al reporte.',
    secciones: [
      {
        t: 'Al instante',
        p: 'Reuniones creadas, movidas o canceladas y entregas que vencen en menos de 24 horas.',
      },
      {
        t: 'En el reporte',
        p: 'Tareas aceptadas al sprint, asignaciones, cambios de estado o fecha y resultados de las votaciones se agrupan en el reporte diario o semanal.',
      },
      {
        t: 'Revisión',
        p: 'El líder siempre revisa la cola antes de enviar, con Envío rápido o con la vista detallada.',
      },
    ],
  },
  {
    slug: 'chat',
    categoria: 'Comunicación',
    titulo: 'Usar el chat',
    resumen: 'Menciones, hilos y convertir mensajes en tareas.',
    secciones: [
      {
        t: 'Menciones y tareas',
        p: 'Escribe @ para mencionar y # para vincular una tarea, que se mostrará como tarjeta.',
      },
      {
        t: 'Convertir en tarea',
        p: 'Desde el menú de un mensaje: el líder crea la tarea directamente; el integrante crea una propuesta.',
      },
    ],
  },
  {
    slug: 'liderazgo',
    categoria: 'Equipo',
    titulo: 'Transferir el liderazgo',
    resumen: 'Transferencia directa o votación del equipo.',
    secciones: [
      {
        t: 'Transferencia',
        p: 'El líder elige a un integrante, que acepta o rechaza. Al aceptar, los roles se intercambian.',
      },
      {
        t: 'Votación',
        p: 'Postulación, votación secreta de 72 horas y mayoría simple. Si hay empate, segunda ronda de 24 horas. El líder saliente no vota y sigue como interino.',
      },
    ],
  },
  {
    slug: 'invitados',
    categoria: 'Equipo',
    titulo: 'Acceso de invitados',
    resumen: 'Ver y comentar lo compartido, con caducidad.',
    secciones: [
      {
        t: 'Qué puede hacer',
        p: 'Un invitado ve y comenta solo las tareas compartidas y usa el canal de Invitados. No adjunta ni cambia estados.',
      },
      {
        t: 'Caducidad',
        p: 'El acceso caduca en 7, 14 o 30 días. El invitado puede pedir una ampliación o convertirse en integrante.',
      },
    ],
  },
];

export const FAQ = [
  ['¿Nexo es gratis?', 'Sí. Nexo no tiene planes de pago ni facturación.'],
  [
    '¿En qué se diferencia de Trello?',
    'Pone la comunicación al centro: chat integrado por equipo y por tarea, notificaciones inteligentes y avisos al grupo de WhatsApp.',
  ],
  [
    '¿Puedo usarlo solo?',
    'Sí. Toda cuenta tiene un Espacio personal con tareas, calendario y un mini Hill Chart. Puedes crear o unirte a un equipo después.',
  ],
  [
    '¿Quién puede crear tareas?',
    'El líder propone las tareas con sus subtareas y los integrantes votan si se aceptan para el sprint.',
  ],
  [
    '¿Se envía algo a WhatsApp sin mi permiso?',
    'No. El líder revisa cada aviso antes de enviarlo y cada integrante decide si acepta ser mencionado.',
  ],
  [
    '¿Qué pasa si el líder se va?',
    'Antes de salir debe transferir el liderazgo o abrir una votación. El equipo nunca queda sin líder.',
  ],
];
