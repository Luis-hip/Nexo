import { createBrowserRouter } from 'react-router';
import { Inicio } from './pages/Inicio';
import { NoEncontrada } from './pages/NoEncontrada';

// Fase 0: solo el esqueleto. Las rutas de docs/01, sección 3.2, llegan en la Fase 1.
export const enrutador = createBrowserRouter([
  { path: '/', element: <Inicio /> },
  { path: '*', element: <NoEncontrada /> },
]);
