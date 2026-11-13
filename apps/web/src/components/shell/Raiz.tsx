import { Outlet, ScrollRestoration } from 'react-router';
import { ConfirmProvider, Toasts } from '@/components/ui';
import { useSincronizarApariencia } from '@/lib/apariencia';

/** Raíz de todas las rutas: apariencia, confirmaciones y avisos. */
export function Raiz() {
  useSincronizarApariencia();
  return (
    <ConfirmProvider>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[8px] focus:bg-brand focus:px-3 focus:py-2 focus:text-on-brand"
      >
        Saltar al contenido
      </a>
      <Outlet />
      <Toasts />
      <ScrollRestoration />
    </ConfirmProvider>
  );
}
