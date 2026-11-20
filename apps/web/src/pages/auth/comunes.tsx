import type { ReactNode } from 'react';

/** Tarjeta centrada de las pantallas de autenticación (AUTH-*). */
export function Tarjeta({
  titulo,
  subtitulo,
  children,
  nombre,
  icono,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  nombre: string;
  icono?: ReactNode;
}) {
  return (
    <div
      className="anim-up rounded-[16px] border border-line bg-raised p-6 shadow-soft sm:p-8"
      data-name={nombre}
    >
      {icono && (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-brand/10 text-brand [&>svg]:size-6">
          {icono}
        </div>
      )}
      <h1 className="text-[22px] sm:text-[28px]">{titulo}</h1>
      {subtitulo && <p className="mt-1.5 text-sm text-muted">{subtitulo}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Solo se aceptan destinos internos, para no redirigir fuera de Nexo. */
export const destinoSeguro = (volver: string | null) =>
  volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : null;
