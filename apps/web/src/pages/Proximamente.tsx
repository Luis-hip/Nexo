import { Hammer } from 'lucide-react';
import { Link } from 'react-router';
import { Vacio } from '@/components/ui';

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
