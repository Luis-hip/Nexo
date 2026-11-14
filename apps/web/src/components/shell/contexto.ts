import type { Perfil, Yo } from '@nexo/shared';
import { createContext, useContext } from 'react';

/** Acciones globales que ofrece el shell a cualquier pantalla. */
export interface AccionesGlobales {
  nuevaTarea: () => void;
  abrirTarea: (id: string) => void;
}

export const AccionesCtx = createContext<AccionesGlobales | null>(null);
export function useAcciones(): AccionesGlobales {
  const c = useContext(AccionesCtx);
  if (!c) throw new Error('useAcciones fuera del shell');
  return c;
}

/** Sesión garantizada dentro del AppShell (fuera de él, usa `useYo`). */
export const SesionCtx = createContext<Yo | null>(null);
export function useSesion(): Yo {
  const c = useContext(SesionCtx);
  if (!c) throw new Error('useSesion fuera del shell');
  return c;
}

/** Perfil de la persona en un espacio: «personal» o su rol en el equipo; `undefined` si no pertenece. */
export function perfilEn(yo: Yo, equipoId: string | null): Perfil | undefined {
  if (!equipoId) return 'personal';
  return yo.equipos.find((e) => e.id === equipoId)?.rol;
}
