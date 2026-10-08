import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
}

function run(cmd: string, args: string[], cwd = root): number {
  try {
    execFileSync(cmd, args, { cwd, stdio: 'pipe' });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

// Dependencies imposed by AGENTS.md; anything else must be named in docs/DECISIONS.md.
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

describe('monorepo tooling', () => {
  it('root package.json pins pnpm, Node >=22 and packages/* workspaces', () => {
    const pkg = readJson('package.json');
    expect(pkg.private).toBe(true);
    expect(String(pkg.packageManager)).toMatch(/^pnpm@/);
    expect((pkg.engines as Record<string, string>).node).toBe('>=22');
    const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/^\s+- packages\/\*$/m);
  });

  it('root lint and typecheck scripts cover the repo and exit 0 when clean', () => {
    const pkg = readJson('package.json');
    const scripts = pkg.scripts as Record<string, string>;
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(['lint', 'typecheck', 'test']));
    const workspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/^includeWorkspaceRoot: true$/m);
    expect(run('pnpm', ['lint'])).toBe(0);
    expect(run('pnpm', ['typecheck'])).toBe(0);
  }, 60_000);

  it('typecheck exits non-zero on a type error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drop-tsc-'));
    try {
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ extends: join(root, 'tsconfig.base.json'), compilerOptions: { noEmit: true, types: [] } }),
      );
      writeFileSync(join(dir, 'broken.ts'), 'export const n: number = "not a number";\n');
      const tsc = join(root, 'node_modules', '.bin', 'tsc');
      expect(run(tsc, ['-p', join(dir, 'tsconfig.json')], dir)).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('base tsconfig enables strict, noUncheckedIndexedAccess and exactOptionalPropertyTypes', () => {
    const options = readJson('tsconfig.base.json').compilerOptions as Record<string, unknown>;
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.exactOptionalPropertyTypes).toBe(true);
    expect(readJson('tsconfig.json').extends).toBe('./tsconfig.base.json');
  });

  it('lint reports explicit any as an error', async () => {
    const eslint = new ESLint({ cwd: root });
    const [result] = await eslint.lintText('export const value: any = 1;\n', {
      filePath: join(root, 'packages', 'example', 'src', 'value.ts'),
    });
    const messages = result?.messages ?? [];
    expect(messages).toContainEqual(
      expect.objectContaining({ ruleId: '@typescript-eslint/no-explicit-any', severity: 2 }),
    );
  });

  it('format check flags an unformatted file', async () => {
    const options = (await prettier.resolveConfig(join(root, 'test', 'x.ts'))) ?? {};
    const formatted = await prettier.check('export const a = {b:1}\n', { ...options, parser: 'typescript' });
    expect(formatted).toBe(false);
    const pkg = readJson('package.json');
    expect((pkg.scripts as Record<string, string>)['format:check']).toBe('prettier --check .');
  });

  it('gitignore excludes drop identities and env files', () => {
    expect(run('git', ['check-ignore', '-q', '--no-index', '.drop-test/identity.json'])).toBe(0);
    expect(run('git', ['check-ignore', '-q', '--no-index', '.env.local'])).toBe(0);
    expect(run('git', ['check-ignore', '-q', '--no-index', 'node_modules/x'])).toBe(0);
    expect(run('git', ['check-ignore', '-q', '--no-index', 'dist/index.js'])).toBe(0);
    expect(run('git', ['check-ignore', '-q', '--no-index', 'coverage/index.html'])).toBe(0);
  });

  it('every dependency outside the imposed stack is recorded in DECISIONS', () => {
    const decisions = readFileSync(join(root, 'docs', 'DECISIONS.md'), 'utf8');
    const manifests = ['package.json'];
    const packagesDir = join(root, 'packages');
    if (existsSync(packagesDir)) {
      for (const name of readdirSync(packagesDir)) {
        if (existsSync(join(packagesDir, name, 'package.json'))) manifests.push(join('packages', name, 'package.json'));
      }
    }
    const unrecorded: string[] = [];
    for (const manifest of manifests) {
      const pkg = readJson(manifest);
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const dep of Object.keys((pkg[field] as Record<string, string> | undefined) ?? {})) {
          if (dep.startsWith('@drop/') || IMPOSED_STACK.has(dep)) continue;
          if (!decisions.includes(`\`${dep}\``)) unrecorded.push(`${manifest}: ${dep}`);
        }
      }
    }
    expect(unrecorded).toEqual([]);
  });
});
