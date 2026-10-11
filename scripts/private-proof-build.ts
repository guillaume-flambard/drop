import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { NODE_BUNDLE_OPTIONS } from './bundle.ts';

mkdirSync('dist/private-proof', { recursive: true });
await build({
  ...NODE_BUNDLE_OPTIONS,
  entryPoints: ['packages/node/test/private-system.ts'],
  outfile: 'dist/private-proof/proof.mjs',
});
