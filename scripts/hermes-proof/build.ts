import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
const directory = new URL('../../dist/hermes-proof/', import.meta.url);
await mkdir(directory, { recursive: true });
const common = {
  bundle: true,
  platform: 'node' as const,
  format: 'esm' as const,
  target: 'node22.18',
  external: ['bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __dropRequire } from 'node:module';const require = __dropRequire(import.meta.url);",
  },
};
for (const [source, name] of [
  ['scripts/hermes-proof/fixture.ts', 'fixture.mjs'],
  ['packages/requester-mcp/src/index.ts', 'drop-mcp.mjs'],
]) {
  if (!source || !name) throw new Error('E_BUILD_INPUT');
  await build({ ...common, entryPoints: [source], outfile: new URL(name, directory).pathname });
}
for (const name of ['evaluate.py', 'verify.py', 'run.sh'])
  await copyFile(new URL(name, import.meta.url), new URL(name, directory));
