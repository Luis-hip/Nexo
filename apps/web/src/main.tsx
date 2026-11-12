import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { enrutador } from './enrutador';
import './styles/index.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('No existe el elemento #raiz');

createRoot(raiz).render(
  <StrictMode>
    <RouterProvider router={enrutador} />
  </StrictMode>,
);
