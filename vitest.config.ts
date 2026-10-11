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
      // Build output of the Mac app and the Rust crates, the same folders eslint.config.js ignores.
      'apps/desktop/src-tauri/target/**',
      'crates/*/target/**',
      'apps/desktop/src-tauri/gen/**',
      'apps/desktop/src-tauri/resources/**',
    ],
  },
});
