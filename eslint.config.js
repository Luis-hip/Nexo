import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'apps/api/src/db/tipos.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // docs/01, sección 10.1: prohibido `any` salvo con comentario `// justificado:`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // DEC-025 (docs/08): la API no lleva SQL de negocio. Toda operación sobre datos es un proceso
    // `proc_*` de la BD y el único archivo que lo llama es `repositorios/procesos.ts`.
    // Quedan fuera la conexión (`db/`) y las pruebas, que preparan y comprueban datos a mano.
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/repositorios/procesos.ts',
      'apps/api/src/db/**',
      'apps/api/src/pruebas/**',
      'apps/api/src/**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'kysely',
              message:
                'La API no escribe SQL: llama a un proceso de la BD con llamarProceso() desde repositorios/ (docs/08).',
            },
            {
              name: 'pg',
              message:
                'La API no escribe SQL: llama a un proceso de la BD con llamarProceso() desde repositorios/ (docs/08).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.property.name=/^(selectFrom|insertInto|updateTable|deleteFrom|mergeInto|replaceInto|transaction)$/]',
          message:
            'La API no escribe SQL ni abre transacciones: cada operación es un proceso atómico de la BD (docs/08).',
        },
        {
          selector: "TaggedTemplateExpression[tag.name='sql']",
          message: 'SQL solo dentro de un proceso de la BD (docs/08).',
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
