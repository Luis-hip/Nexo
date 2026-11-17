import { useEquipoActual } from './contexto';
import { ListaTareas, Tablero } from './tareas';

export { Miembros } from './Miembros';
export { Resumen } from './Resumen';
export { Backlog, TareaRuta, TareasLayout, Votacion } from './tareas';

/** El invitado no tiene tablero ni lista: ve sus tareas compartidas (IN-02) en el layout. */
export function TableroRuta() {
  const { equipo } = useEquipoActual();
  return equipo.mi_rol === 'invitado' ? null : <Tablero />;
}
export function ListaRuta() {
  const { equipo } = useEquipoActual();
  return equipo.mi_rol === 'invitado' ? null : <ListaTareas />;
}
