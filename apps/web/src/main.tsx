import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { enrutador } from './enrutador';
import { ErrorApi } from './lib/api';
import './styles/index.css';

const consultas = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Solo se reintenta lo que puede arreglarse solo: fallos de red y errores 5xx.
      retry: (intentos, error) =>
        intentos < 2 && (!(error instanceof ErrorApi) || error.estado === 0 || error.estado >= 500),
    },
  },
});

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('No existe el elemento #raiz');

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={consultas}>
      <RouterProvider router={enrutador} />
    </QueryClientProvider>
  </StrictMode>,
);
