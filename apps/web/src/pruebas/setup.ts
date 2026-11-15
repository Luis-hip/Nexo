import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sin `globals`, Testing Library no limpia solo: se desmonta lo pintado tras cada prueba.
afterEach(() => cleanup());
