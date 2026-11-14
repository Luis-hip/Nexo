import type { EstadoTarea } from '@nexo/shared';
import { NOMBRE_ESTADO } from '@/lib/tareas';

/** En el espacio personal los estados se nombran como las columnas del tablero personal. */
export const NOMBRE_ESTADO_PERSONAL: Record<EstadoTarea, string> = {
  ...NOMBRE_ESTADO,
  backlog: 'Por hacer',
  aceptada: 'Por hacer',
  habilitada: 'Por hacer',
  completada: 'Hecha',
};
