import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A focused test (`it.only`) must fail the gate instead of silently skipping the rest.
    allowOnly: false,
    include: ['**/*.{test,spec}.{ts,tsx,mts,cts}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'openspec/**',
      '.claude/**',
      '.agents/**',
      'docs/demo/julie-repo/**',
    ],
  },
});
