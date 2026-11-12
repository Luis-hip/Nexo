import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas de integración comparten la misma BD: se ejecutan en serie.
    fileParallelism: false,
  },
});
