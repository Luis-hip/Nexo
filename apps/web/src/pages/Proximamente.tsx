import { Hammer } from 'lucide-react';
import { Link, Outlet, useParams } from 'react-router';
import { perfilEn, useSesion } from '@/components/shell/contexto';
import { SinPermisos, Vacio } from '@/components/ui';

/** Pantalla de una sección que el plan construye en una fase posterior (docs/progreso.md). */
export function Proximamente({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <Vacio
      nivel="h1"
      icono={<Hammer />}
      titulo={titulo}
      texto={`Esta sección se construye en la Fase ${fase} del plan. Mientras tanto, tu espacio personal ya funciona con datos reales.`}
      accion={
        <Link
          to="/app/personal"
          className="inline-flex h-11 items-center rounded-[8px] bg-brand px-4 text-sm font-medium text-on-brand"
        >
          Ir a mi espacio personal
        </Link>
      }
    />
  );
}

/**
 * Guarda del espacio de equipo: la persona debe ser miembro activo. La membresía viene de
 * GET /yo (la API); cada ruta de equipo de la Fase 2 la vuelve a comprobar en el servidor.
 */
export function EquipoGuard() {
  const yo = useSesion();
  const { equipo } = useParams();
  if (!perfilEn(yo, equipo ?? null)) {
    return (
      <SinPermisos
        motivo="No perteneces a este equipo o el equipo no existe. Para unirte necesitas un enlace o código de invitación del líder."
        salida="/app/equipos/unirse"
        textoSalida="Unirme con un código"
      />
    );
  }
  return <Outlet />;
}
