import type { Accion, EquipoDetalle, ResultadoPermiso } from '@nexo/shared';
import { createContext, useContext } from 'react';
import { SinPermisos } from '@/components/ui';

/** Equipo de la ruta, ya comprobado en el servidor, con el perfil de quien lo ve. */
export interface EquipoActual {
  equipo: EquipoDetalle;
  /** Ruta base del equipo: `/app/e/:id`. */
  base: string;
  usuarioId: string;
  /** Permiso de la matriz para el perfil en este equipo (oculta o desactiva controles). */
  puede: (accion: Accion, ctx?: { esPropio?: boolean; esCompartido?: boolean }) => ResultadoPermiso;
}

export const EquipoCtx = createContext<EquipoActual | null>(null);

export function useEquipoActual(): EquipoActual {
  const c = useContext(EquipoCtx);
  if (!c) throw new Error('useEquipoActual fuera de un equipo');
  return c;
}

/** Guarda de una vista por permiso de la matriz: explica el motivo en vez de mostrarla. */
export function Requiere({ permiso, children }: { permiso: Accion; children: React.ReactNode }) {
  const { puede: p, base } = useEquipoActual();
  const r = p(permiso);
  if (!r.permitido) {
    return <SinPermisos motivo={r.motivo} salida={base} textoSalida="Volver al Resumen" />;
  }
  return <>{children}</>;
}
