import { puede, type Accion, type Perfil } from '@nexo/shared';
import {
  Activity,
  BarChart3,
  Bell,
  Calendar,
  CheckSquare,
  Flag,
  Folder,
  HelpCircle,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  MessageCircle,
  MessageSquareShare,
  UserCircle,
  Users,
  UsersRound,
} from 'lucide-react';

export interface ItemNav {
  clave: string;
  etiqueta: string;
  ruta: string;
  icono: typeof Home;
  permiso?: Accion;
  exacto?: boolean;
  grupo?: 'Trabajo' | 'Comunicación' | 'Gestión';
}

export interface Navegacion {
  inferior: ItemNav[];
  mas: ItemNav[];
  lateral: ItemNav[];
}

/** Elementos de navegación según el espacio (personal o equipo) y el perfil. */
export function navegacion(perfil: Perfil, equipoId: string | null): Navegacion {
  if (!equipoId || perfil === 'personal') {
    const b = '/app/personal';
    const items: ItemNav[] = [
      { clave: 'inicio', etiqueta: 'Inicio', ruta: b, icono: Home, exacto: true, grupo: 'Trabajo' },
      {
        clave: 'tareas',
        etiqueta: 'Mis tareas',
        ruta: `${b}/tareas`,
        icono: CheckSquare,
        grupo: 'Trabajo',
      },
      {
        clave: 'calendario',
        etiqueta: 'Calendario',
        ruta: `${b}/calendario`,
        icono: Calendar,
        grupo: 'Comunicación',
      },
      {
        clave: 'equipos',
        etiqueta: 'Equipos',
        ruta: `${b}/equipos`,
        icono: Users,
        grupo: 'Gestión',
      },
      {
        clave: 'reportes',
        etiqueta: 'Reportes',
        ruta: `${b}/reportes`,
        icono: BarChart3,
        grupo: 'Gestión',
      },
    ];
    return {
      inferior: items.slice(0, 4),
      mas: [
        ...items.slice(4),
        {
          clave: 'notificaciones',
          etiqueta: 'Notificaciones',
          ruta: '/app/notificaciones',
          icono: Bell,
        },
        ...pie(),
      ],
      lateral: items,
    };
  }

  const b = `/app/e/${equipoId}`;
  const todos: ItemNav[] = [
    {
      clave: 'resumen',
      etiqueta: 'Resumen',
      ruta: b,
      icono: LayoutDashboard,
      exacto: true,
      grupo: 'Trabajo',
    },
    {
      clave: 'tareas',
      etiqueta: 'Tareas',
      ruta: `${b}/tareas`,
      icono: CheckSquare,
      grupo: 'Trabajo',
    },
    {
      clave: 'sprints',
      etiqueta: 'Sprints',
      ruta: `${b}/sprints`,
      icono: Flag,
      permiso: 'ver_sprints',
      grupo: 'Trabajo',
    },
    {
      clave: 'chat',
      etiqueta: 'Chat',
      ruta: `${b}/chat`,
      icono: MessageCircle,
      grupo: 'Comunicación',
    },
    {
      clave: 'calendario',
      etiqueta: 'Calendario',
      ruta: `${b}/calendario`,
      icono: Calendar,
      permiso: 'ver_calendario',
      grupo: 'Comunicación',
    },
    {
      clave: 'reportes',
      etiqueta: 'Reportes',
      ruta: `${b}/reportes`,
      icono: BarChart3,
      permiso: 'ver_reportes',
      grupo: 'Gestión',
    },
    {
      clave: 'whatsapp',
      etiqueta: 'WhatsApp',
      ruta: `${b}/whatsapp`,
      icono: MessageSquareShare,
      permiso: 'configurar_whatsapp',
      grupo: 'Gestión',
    },
    {
      clave: 'equipo',
      etiqueta: 'Equipo',
      ruta: `${b}/equipo`,
      icono: UsersRound,
      permiso: 'ver_miembros',
      grupo: 'Gestión',
    },
    {
      clave: 'archivos',
      etiqueta: 'Archivos',
      ruta: `${b}/archivos`,
      icono: Folder,
      permiso: 'ver_archivos',
      grupo: 'Gestión',
    },
    {
      clave: 'actividad',
      etiqueta: 'Actividad',
      ruta: `${b}/actividad`,
      icono: Activity,
      permiso: 'ver_actividad',
      grupo: 'Gestión',
    },
    {
      clave: 'plantillas',
      etiqueta: 'Plantillas',
      ruta: `${b}/plantillas`,
      icono: LayoutTemplate,
      permiso: 'usar_plantilla',
      grupo: 'Gestión',
    },
  ];
  const visibles = todos.filter((i) => !i.permiso || puede(i.permiso, { perfil }).permitido);
  const por = (claves: string[]) => claves.flatMap((k) => visibles.filter((i) => i.clave === k));
  const mas = por([
    'reportes',
    'whatsapp',
    'equipo',
    'sprints',
    'archivos',
    'actividad',
    'plantillas',
  ]);
  if (perfil === 'invitado') {
    mas.push({
      clave: 'equipos',
      etiqueta: 'Mis equipos',
      ruta: '/app/personal/equipos',
      icono: Users,
    });
  }
  return {
    inferior: por(['resumen', 'tareas', 'chat', 'calendario']),
    mas: [...mas, ...pie()],
    lateral: visibles,
  };
}

export function pie(): ItemNav[] {
  return [
    { clave: 'ayuda', etiqueta: 'Ayuda', ruta: '/ajustes/ayuda', icono: HelpCircle },
    { clave: 'perfil', etiqueta: 'Perfil', ruta: '/ajustes/perfil', icono: UserCircle },
  ];
}
