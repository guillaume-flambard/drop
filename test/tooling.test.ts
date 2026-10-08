import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

function trackedFiles(pattern: RegExp): string[] {
  const listed = run('git', ['ls-files', '--cached', '--others', '--exclude-standard']);
  expect(listed.status, listed.output).toBe(0);
  return listed.output
    .split('\n')
    .filter((file) => pattern.test(file))
    .filter((file) => !/^(openspec|\.claude|\.agents)\//.test(file));
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
  '@anthropic-ai/claude-agent-sdk',
]);

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
        // Only a real local workspace package is exempt; an npm alias named @drop/* is not.
        if ((dep.startsWith('@drop/') && version.startsWith('workspace:')) || IMPOSED_STACK.has(dep)) continue;
        if (!entries.some((entry) => entry.includes(`\`${dep}\``))) unrecorded.push(`${path}: ${dep}`);
      }
    }
  }
  return unrecorded;
}

describe('monorepo tooling', () => {
  it('root package.json pins pnpm, Node >=22.13 and packages/* workspaces', () => {
    const pkg = readJson('package.json');
    expect(pkg.private).toBe(true);
    expect(String(pkg.packageManager)).toMatch(/^pnpm@/);
    expect((pkg.engines as Record<string, string>).node).toBe('>=22.13');
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
    const dir = mkdtempSync(join(tmpdir(), 'drop-tsc-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ extends: join(root, 'tsconfig.base.json'), compilerOptions: { noEmit: true, types: [] } }),
      );
      writeFileSync(join(dir, 'valid.ts'), 'export const ok: number = 1;\n');
      const valid = run(tscBin, ['-p', join(dir, 'tsconfig.json')], dir);
      expect(valid.status, valid.output).toBe(0);

      writeFileSync(join(dir, 'broken.ts'), 'export const n: number = "not a number";\n');
      const broken = run(tscBin, ['-p', join(dir, 'tsconfig.json')], dir);
      expect(broken.status).not.toBe(0);
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

  it('lint rejects a floating promise and an unsafe any from JSON.parse', async () => {
    const eslint = new ESLint({ cwd: root });
    const filePath = join(root, 'test', 'tooling.test.ts');
    const code = [
      'async function work(): Promise<void> {}',
      'work();',
      "export const parsed: { id: string } = JSON.parse('{}');",
      '',
    ].join('\n');
    const [result] = await eslint.lintText(code, { filePath });
    const rules = (result?.messages ?? []).filter((message) => message.severity === 2).map((m) => m.ruleId);
    expect(rules).toEqual(
      expect.arrayContaining(['@typescript-eslint/no-floating-promises', '@typescript-eslint/no-unsafe-assignment']),
    );
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
        },
      },
    };
    expect(findUnrecordedDependencies(manifests, decisions)).toEqual([
      'packages/a/package.json: is-odd',
      'packages/a/package.json: @drop/relay',
    ]);
  });
});
