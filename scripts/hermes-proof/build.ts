import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { NODE_BUNDLE_OPTIONS } from '../bundle.ts';
const directory = new URL('../../dist/hermes-proof/', import.meta.url);
await mkdir(directory, { recursive: true });
for (const [source, name] of [
  ['scripts/hermes-proof/fixture.ts', 'fixture.mjs'],
  ['packages/requester-mcp/src/index.ts', 'drop-mcp.mjs'],
]) {
  if (!source || !name) throw new Error('E_BUILD_INPUT');
  await build({ ...NODE_BUNDLE_OPTIONS, entryPoints: [source], outfile: new URL(name, directory).pathname });
}
for (const name of ['evaluate.py', 'verify.py', 'run.sh'])
  await copyFile(new URL(name, import.meta.url), new URL(name, directory));
