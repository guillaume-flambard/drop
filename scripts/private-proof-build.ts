import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/private-proof', { recursive: true });
await build({
  entryPoints: ['packages/node/test/private-system.ts'],
  outfile: 'dist/private-proof/proof.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __dropRequire } from 'node:module';const require = __dropRequire(import.meta.url);",
  },
});
