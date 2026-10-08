import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'openspec/',
    '.claude/',
    '.agents/',
    'docs/demo/julie-repo/',
  ]),
  {
    // Exceptions go through this file, where review sees them; inline disables are ignored (D15).
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // `void promise` must not silence an unhandled rejection.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: false }],
    },
  },
  {
    // Only root tooling config may be JavaScript; product code is TypeScript (checked by test/tooling.test.ts).
    files: ['*.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
