// Builds what is installed outside the repo (D29): Node refuses TypeScript under node_modules
// (https://nodejs.org/api/typescript.html, "Type stripping in dependencies"), so a distributed drop is one JS file each.
//   dist/drop.mjs       the node CLI and daemon (`drop serve`, `drop install`…)
//   dist/drop-mcp.mjs   the requester MCP server that agents start
//   dist/drop-relay.mjs the internally hosted relay
//   dist/drop.mcpb      a Claude Desktop bundle around drop-mcp.mjs (https://github.com/anthropics/mcpb, manifest 0.3)
// Development keeps running the .ts sources directly (D16).
// Usage: node scripts/bundle.ts [--mcpb] [--out <dir>] (default dist/; the tests bundle into a temporary directory)
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type BuildOptions } from 'esbuild';

/** esbuild options shared by every Node bundle of the repo (this script and the proof builds). */
export const NODE_BUNDLE_OPTIONS = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  // ws loads these native speedups only if present; without them it uses its JS code.
  external: ['bufferutil', 'utf-8-validate'],
  // Some dependencies are CommonJS and call require(); an ESM bundle needs one.
  banner: {
    js: "import { createRequire as __dropRequire } from 'node:module';const require = __dropRequire(import.meta.url);",
  },
  logLevel: 'warning',
} as const satisfies BuildOptions;

/** True when `path` is `ancestor` itself or lies inside it. */
function within(path: string, ancestor: string): boolean {
  const rel = relative(ancestor, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * The directory the build empties then fills. `--out` needs a value, and never names the repository, a directory that
 * contains it, or the home directory: the build deletes it first.
 */
export function bundleOutDir(args: readonly string[], root: string, home: string, cwd = process.cwd()): string {
  const index = args.indexOf('--out');
  if (index < 0) return join(root, 'dist');
  const value = args[index + 1];
  if (value === undefined || value.trim() === '' || value.startsWith('--')) {
    throw new Error('E_BUNDLE_OUT: --out attend un dossier de sortie');
  }
  const out = resolve(cwd, value);
  if (within(resolve(root), out) || out === resolve(home)) {
    throw new Error(`E_BUNDLE_OUT: ${out} contient le dépôt ou est le dossier personnel, la construction le viderait`);
  }
  return out;
}

async function main(): Promise<void> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = bundleOutDir(process.argv.slice(2), root, homedir());
  const version = (
    JSON.parse(readFileSync(join(root, 'packages', 'node', 'package.json'), 'utf8')) as { version: string }
  ).version;

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  await build({
    ...NODE_BUNDLE_OPTIONS,
    entryPoints: [join(root, 'packages', 'node', 'src', 'cli.ts')],
    outfile: join(dist, 'drop.mjs'),
  });
  await build({
    ...NODE_BUNDLE_OPTIONS,
    entryPoints: [join(root, 'packages', 'requester-mcp', 'src', 'index.ts')],
    outfile: join(dist, 'drop-mcp.mjs'),
  });
  await build({
    ...NODE_BUNDLE_OPTIONS,
    entryPoints: [join(root, 'packages', 'relay', 'src', 'cli.ts')],
    outfile: join(dist, 'drop-relay.mjs'),
  });
  process.stdout.write(`${dist}/drop.mjs, ${dist}/drop-mcp.mjs and ${dist}/drop-relay.mjs (version ${version})\n`);

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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'E_BUNDLE: unexpected failure'}\n`);
    process.exitCode = 1;
  }
}
