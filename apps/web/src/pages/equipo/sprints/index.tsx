import { Outlet, useLocation, useNavigate } from 'react-router';
import { Encabezado, Segmentado } from '@/components/ui';
import { useEquipoActual } from '../contexto';

export { CerrarSprint, SprintActivo } from './Activo';
export { HistorialSprints, SprintHistorico } from './Historial';
export { PlanearSprint } from './Planear';
export { RetroRuta } from './Retro';

const VISTAS = ['activo', 'planear', 'historial', 'retro'] as const;
type Vista = (typeof VISTAS)[number];

/** Sprints (Fase 3.3): pestañas Activo · Planear · Historial · Retrospectiva. */
export function SprintsLayout() {
  const { base } = useEquipoActual();
  const loc = useLocation();
  const nav = useNavigate();
  const ruta = `${base}/sprints`;
  const vista: Vista = VISTAS.find((v) => loc.pathname.startsWith(`${ruta}/${v}`)) ?? 'activo';
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Sprints"
        descripcion="Ciclos de trabajo del equipo: plan, avance, cierre y retrospectiva."
      />
      <Segmentado
        etiqueta="Vista de sprints"
        valor={vista}
        onChange={(v) => nav(`${ruta}/${v}`)}
        opciones={[
          { valor: 'activo', etiqueta: 'Activo' },
          { valor: 'planear', etiqueta: 'Planear' },
          { valor: 'historial', etiqueta: 'Historial' },
          { valor: 'retro', etiqueta: 'Retrospectiva' },
        ]}
      />
      <Outlet />
    </div>
  );
}
