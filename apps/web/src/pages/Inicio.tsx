import { MAX_MIEMBROS_EQUIPO } from '@nexo/shared';

export function Inicio() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <p className="text-sm font-medium text-brand">Fase 0 · Arranque</p>
      <h1 className="text-3xl font-semibold text-fg">Nexo</h1>
      <p className="text-muted">
        Trabajo colaborativo tipo tablero para equipos de hasta {MAX_MIEMBROS_EQUIPO} personas, con
        avisos en el grupo de WhatsApp del equipo.
      </p>
    </main>
  );
}
