import { z } from 'zod';

/**
 * Fase 5.2 · Mensajes de validación en español. Los esquemas de Nexo ya traen mensajes propios en
 * los campos de los formularios; esto cubre los que Zod genera por su cuenta (un campo que falta, un
 * tipo equivocado), que antes llegaban en inglés a la API y a la web. Se importa primero en `index.ts`.
 */
z.config(z.locales.es());
