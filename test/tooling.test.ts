import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const tscBin = join(root, 'node_modules', '.bin', 'tsc');

interface RunResult {
  status: number;
  output: string;
}

// Runs a command and keeps its output so a failing assertion shows the diagnostics.
// A command that cannot start at all throws instead of passing for a failure.
function run(cmd: string, args: string[], cwd = root): RunResult {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
}

function scripts(manifest: Record<string, unknown>): Record<string, string> {
  return (manifest.scripts as Record<string, string> | undefined) ?? {};
}

function packageManifests(): Record<string, Record<string, unknown>> {
  const manifests: Record<string, Record<string, unknown>> = { 'package.json': readJson('package.json') };
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return manifests;
  for (const name of readdirSync(packagesDir)) {
    const path = join('packages', name, 'package.json');
    if (existsSync(join(root, path))) manifests[path] = readJson(path);
  }
  return manifests;
}

// NUL-delimited so git never quotes a path (non-ASCII or special characters) out of the pattern's reach.
function gitFiles(args: string[]): string[] {
  const listed = spawnSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'utf8' });
  if (listed.error) throw listed.error;
  expect(listed.status, listed.stderr).toBe(0);
  return listed.stdout.split('\0').filter((file) => file !== '');
}

function trackedFiles(pattern: RegExp): string[] {
  return gitFiles(['--cached', '--others', '--exclude-standard'])
    .filter((file) => pattern.test(file))
    .filter((file) => !/^(openspec|\.claude|\.agents|docs\/demo\/julie-repo)\//.test(file));
}

// Dependencies imposed by AGENTS.md; anything else must be named in a `- **D<n>**` entry of docs/DECISIONS.md.
const IMPOSED_STACK = new Set([
  'typescript',
  'zod',
  'vitest',
  'eslint',
  'prettier',
  '@modelcontextprotocol/sdk',
  'libsodium-wrappers',
  'ws',
]);

// A plain registry version or range; anything else (alias, git, path, URL, tarball) can swap the code behind the name.
const PLAIN_RANGE = /^[~^]?\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/;

// Files that must never be committed, checked on tracked paths independently of the effective .gitignore rules.
const FORBIDDEN_FILE = /(^|\/)(\.drop[^/]*|\.env[^/]*|[^/]+\.pem|[^/]+\.key|id_ed25519[^/]*|\.npmrc)(\/|$)/;

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

export function findUnrecordedDependencies(
  manifests: Record<string, Record<string, unknown>>,
  decisions: string,
): string[] {
  // An entry is its `- **D<n>**` line plus the indented continuation lines below it.
  const entries = decisions.match(/^- \*\*D\d+\*\*.*(?:\n {2}.*)*/gm) ?? [];
  const unrecorded: string[] = [];
  for (const [path, manifest] of Object.entries(manifests)) {
    for (const field of DEPENDENCY_FIELDS) {
      for (const dep of Object.keys((manifest[field] as Record<string, string> | undefined) ?? {})) {
        const version = (manifest[field] as Record<string, string>)[dep] ?? '';
        if (dep.startsWith('@drop/') && version.startsWith('workspace:')) continue;
        // A non-registry source is never approved by name alone, even for a dependency named in DECISIONS.
        if (!PLAIN_RANGE.test(version)) {
          unrecorded.push(`${path}: ${dep}@${version}`);
          continue;
        }
        if (IMPOSED_STACK.has(dep)) continue;
        if (!entries.some((entry) => entry.includes(`\`${dep}\``))) unrecorded.push(`${path}: ${dep}`);
      }
    }
  }
  return unrecorded;
}

describe('monorepo tooling', () => {
  it('root package.json pins pnpm, Node >=22.18 and packages/* workspaces', () => {
    const pkg = readJson('package.json');
    expect(pkg.private).toBe(true);
    expect(String(pkg.packageManager)).toMatch(/^pnpm@/);
    expect((pkg.engines as Record<string, string>).node).toBe('>=22.18');
    const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/^\s+- packages\/\*$/m);
  });

  it('recursive and root lint and typecheck run the root scripts and exit 0 when clean', () => {
    expect(Object.keys(scripts(readJson('package.json')))).toEqual(
      expect.arrayContaining(['lint', 'typecheck', 'test', 'format:check']),
    );
    for (const args of [['lint'], ['typecheck'], ['-r', 'lint'], ['-r', 'typecheck']]) {
      const result = run('pnpm', args);
      expect(result.status, result.output).toBe(0);
    }
    expect(run('pnpm', ['-r', 'typecheck']).output).toContain('tsc --noEmit -p tsconfig.json');
  }, 180_000);

  it('typecheck exits non-zero on a type error and zero on valid code', () => {
    // Exercises the real root script and tsconfig, so a disabled check (e.g. `noCheck`) turns this red.
    const dir = join(root, 'test', 'typecheck-probe');
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, 'valid.ts'), 'export const ok: number = 1;\n');
      const valid = run('pnpm', ['typecheck']);
      expect(valid.status, valid.output).toBe(0);

      writeFileSync(join(dir, 'broken.ts'), 'export const n: number = "not a number";\n');
      const broken = run('pnpm', ['typecheck']);
      expect(broken.status).not.toBe(0);
      expect(broken.output).toContain('typecheck-probe/broken.ts');
      expect(broken.output).toContain('TS2322');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('every TypeScript file is typechecked and every test file is collected', () => {
    const tsFiles = trackedFiles(/\.(ts|tsx|mts|cts)$/);
    const listed = run(tscBin, ['-p', 'tsconfig.json', '--listFilesOnly']);
    expect(listed.status, listed.output).toBe(0);
    const typechecked = new Set(listed.output.split('\n').map((file) => file.trim()));
    expect(tsFiles.filter((file) => !typechecked.has(join(root, file)))).toEqual([]);

    const javascript = trackedFiles(/\.(js|mjs|cjs|jsx)$/).filter((file) => !/^[^/]+\.config\.js$/.test(file));
    expect(javascript).toEqual([]);
    // skipLibCheck spares third-party declarations (the MCP SDK needs DOM types); so no declaration file may be ours.
    expect(trackedFiles(/\.d\.(ts|mts|cts)$/)).toEqual([]);

    const testFiles = trackedFiles(/\.(test|spec)\.(ts|tsx|mts|cts)$/);
    const collected = run('pnpm', ['exec', 'vitest', 'list', '--filesOnly']);
    expect(collected.status, collected.output).toBe(0);
    expect(testFiles.filter((file) => !collected.output.includes(file))).toEqual([]);
  }, 120_000);

  it('a focused test fails the run instead of skipping the others', async () => {
    const { default: config } = (await import(join(root, 'vitest.config.ts'))) as {
      default: { test?: { allowOnly?: boolean } };
    };
    expect(config.test?.allowOnly).toBe(false);
  });

  it('workspace packages define no lint, typecheck or test script of their own', () => {
    const offenders = Object.entries(packageManifests())
      .filter(([path]) => path !== 'package.json')
      .flatMap(([path, manifest]) =>
        ['lint', 'typecheck', 'test'].filter((name) => name in scripts(manifest)).map((name) => `${path}: ${name}`),
      );
    expect(offenders).toEqual([]);
  });

  it('base tsconfig enables strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes', () => {
    const options = readJson('tsconfig.base.json').compilerOptions as Record<string, unknown>;
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.exactOptionalPropertyTypes).toBe(true);
    expect(readJson('tsconfig.json').extends).toBe('./tsconfig.base.json');
  });

  it('lint reports explicit any as an error, even behind an inline disable', async () => {
    const eslint = new ESLint({ cwd: root });
    const filePath = join(root, 'test', 'tooling.test.ts');
    expect(await eslint.isPathIgnored(join(root, 'packages', 'example', 'src', 'value.ts'))).toBe(false);
    for (const code of ['export const value: any = 1;\n', '/* eslint-disable */\nexport const value: any = 1;\n']) {
      const [result] = await eslint.lintText(code, { filePath });
      expect(result?.messages ?? []).toContainEqual(
        expect.objectContaining({ ruleId: '@typescript-eslint/no-explicit-any', severity: 2 }),
      );
    }
  });

  it('lint rejects a floating promise, a void-discarded promise and an unsafe any from JSON.parse', async () => {
    const eslint = new ESLint({ cwd: root });
    const filePath = join(root, 'test', 'tooling.test.ts');
    const code = [
      'async function work(): Promise<void> {}',
      'work();',
      "export const parsed: { id: string } = JSON.parse('{}');",
      "void Promise.reject(new Error('unhandled'));",
      '',
    ].join('\n');
    const [result] = await eslint.lintText(code, { filePath });
    const rules = (result?.messages ?? []).filter((message) => message.severity === 2).map((m) => m.ruleId);
    expect(rules).toEqual(
      expect.arrayContaining(['@typescript-eslint/no-floating-promises', '@typescript-eslint/no-unsafe-assignment']),
    );
    // One for the bare call, one for the `void`-discarded rejection.
    expect(rules.filter((rule) => rule === '@typescript-eslint/no-floating-promises')).toHaveLength(2);
  });

  it('format check uses the repo Prettier config and flags an unformatted file', async () => {
    const options = await prettier.resolveConfig(join(root, 'packages', 'example', 'src', 'a.ts'));
    expect(options).toMatchObject({ singleQuote: true });
    const info = await prettier.getFileInfo(join(root, 'packages', 'example', 'src', 'a.ts'), {
      ignorePath: [join(root, '.gitignore'), join(root, '.prettierignore')],
    });
    expect(info.ignored).toBe(false);
    expect(await prettier.check('export const a = {b:1}\n', { ...options, parser: 'typescript' })).toBe(false);
    expect(scripts(readJson('package.json'))['format:check']).toBe('prettier --check .');
    expect(scripts(readJson('package.json')).lint).toContain('prettier --check .');
  });

  it('gitignore excludes drop identities, keys and env files', () => {
    const ignored = [
      '.drop-test/identity.json',
      '.drop-key',
      '.drop.json',
      '.env.local',
      'secret.pem',
      'node.key',
      'id_ed25519',
      '.npmrc',
      '.env.example',
      'packages/foo/.env.example',
      'node_modules/x',
      'dist/index.js',
      'coverage/index.html',
    ];
    for (const path of ignored) {
      expect(run('git', ['check-ignore', '-q', '--no-index', path]).status, path).toBe(0);
    }
    // Independent of .gitignore (a nested `!.env.local` would defeat it): no tracked path may be a secret file.
    expect(gitFiles(['--cached']).filter((file) => FORBIDDEN_FILE.test(file))).toEqual([]);
    // A force-added file escapes .gitignore: no tracked file may match an ignore pattern.
    const trackedButIgnored = run('git', ['ls-files', '--cached', '--ignored', '--exclude-standard']);
    expect(trackedButIgnored.status, trackedButIgnored.output).toBe(0);
    expect(trackedButIgnored.output.trim()).toBe('');
  });

  it('every dependency outside the imposed stack is recorded in DECISIONS', () => {
    const decisions = readFileSync(join(root, 'docs', 'DECISIONS.md'), 'utf8');
    expect(findUnrecordedDependencies(packageManifests(), decisions)).toEqual([]);
  });

  it('dependency check reports a dependency missing from the decision entries', () => {
    const decisions = '- **D1** — uses `left-pad` because reasons.\n\nMentions `is-odd` outside any entry.\n';
    const manifests = {
      'packages/a/package.json': {
        dependencies: {
          'left-pad': '1',
          'is-odd': '1',
          zod: '4',
          '@drop/protocol': 'workspace:*',
          '@drop/relay': 'npm:unreviewed-external@1.0.0',
          ws: 'attacker/fake-ws',
          prettier: '../fake-prettier',
          vitest: 'npm:unreviewed-external@1.0.0',
        },
        devDependencies: { 'left-pad-alias': 'npm:left-pad@1.0.0' },
      },
    };
    const decisionsWithAlias = `${decisions}- **D2** — \`left-pad-alias\` is approved.\n`;
    expect(findUnrecordedDependencies(manifests, decisionsWithAlias)).toEqual([
      'packages/a/package.json: is-odd',
      'packages/a/package.json: @drop/relay@npm:unreviewed-external@1.0.0',
      'packages/a/package.json: ws@attacker/fake-ws',
      'packages/a/package.json: prettier@../fake-prettier',
      'packages/a/package.json: vitest@npm:unreviewed-external@1.0.0',
      'packages/a/package.json: left-pad-alias@npm:left-pad@1.0.0',
    ]);
  });
});
