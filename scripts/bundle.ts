// Builds what is installed outside the repo (D29): Node refuses TypeScript under node_modules
// (https://nodejs.org/api/typescript.html, "Type stripping in dependencies"), so a distributed drop is one JS file each.
//   dist/drop.mjs       the node CLI and daemon (`drop serve`, `drop install`…)
//   dist/drop-mcp.mjs   the requester MCP server that agents start
//   dist/drop.mcpb      a Claude Desktop bundle around drop-mcp.mjs (https://github.com/anthropics/mcpb, manifest 0.3)
// Development keeps running the .ts sources directly (D16).
// Usage: node scripts/bundle.ts [--mcpb] [--out <dir>] (default dist/; the tests bundle into a temporary directory)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const dist = outIndex > 0 ? resolve(process.argv[outIndex + 1] ?? '') : join(root, 'dist');
const version = (
  JSON.parse(readFileSync(join(root, 'packages', 'node', 'package.json'), 'utf8')) as { version: string }
).version;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  platform: 'node' as const,
  format: 'esm' as const,
  target: 'node22.18',
  // ws loads these native speedups only if present; without them it uses its JS code.
  external: ['bufferutil', 'utf-8-validate'],
  // Some dependencies are CommonJS and call require(); an ESM bundle needs one.
  banner: {
    js: "import { createRequire as __dropRequire } from 'node:module';const require = __dropRequire(import.meta.url);",
  },
  logLevel: 'warning' as const,
};
await build({
  ...common,
  entryPoints: [join(root, 'packages', 'node', 'src', 'cli.ts')],
  outfile: join(dist, 'drop.mjs'),
});
await build({
  ...common,
  entryPoints: [join(root, 'packages', 'requester-mcp', 'src', 'index.ts')],
  outfile: join(dist, 'drop-mcp.mjs'),
});
process.stdout.write(`${dist}/drop.mjs and ${dist}/drop-mcp.mjs (version ${version})\n`);

if (process.argv.includes('--mcpb')) {
  const staging = join(dist, 'mcpb');
  mkdirSync(join(staging, 'server'), { recursive: true });
  copyFileSync(join(dist, 'drop-mcp.mjs'), join(staging, 'server', 'index.mjs'));
  writeFileSync(
    join(staging, 'manifest.json'),
    `${JSON.stringify(
      {
        manifest_version: '0.3',
        name: 'drop',
        display_name: 'drop',
        version,
        description:
          'Demande à un collègue une réponse depuis ses outils, sans accès : il autorise, seul le résultat revient.',
        author: { name: 'Memo Labs' },
        server: {
          type: 'node',
          entry_point: 'server/index.mjs',
          mcp_config: {
            command: 'node',
            args: ['${__dirname}/server/index.mjs'],
            env: { DROP_AGENT: 'claude_desktop' },
          },
        },
        compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=22.18.0' } },
      },
      null,
      2,
    )}\n`,
  );
  execFileSync('npx', ['--yes', '@anthropic-ai/mcpb@2.1.2', 'pack', staging, join(dist, 'drop.mcpb')], {
    stdio: 'inherit',
  });
  process.stdout.write('dist/drop.mcpb\n');
}
