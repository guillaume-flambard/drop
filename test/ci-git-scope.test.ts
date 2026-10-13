import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyGitCommits, isCiScopeEntrypoint } from '../scripts/ci-git-scope.ts';

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 10_000 }).trim();
}

describe('T4.28 real Git diff adapter', () => {
  it('prints the scope on Windows and POSIX entrypoints', () => {
    expect(isCiScopeEntrypoint('/home/runner/work/drop/scripts/ci-git-scope.ts')).toBe(true);
    expect(isCiScopeEntrypoint('C:\\a\\drop\\scripts\\ci-git-scope.ts')).toBe(true);
    expect(isCiScopeEntrypoint('scripts\\ci-git-scope.ts')).toBe(true);
    expect(isCiScopeEntrypoint('another-module.ts')).toBe(false);
    expect(isCiScopeEntrypoint(undefined)).toBe(false);
  });

  it('detects real docs-only commits and never forgets code-to-doc renames', () => {
    const repo = mkdtempSync(join(tmpdir(), 'drop-ci-scope-'));
    try {
      git(repo, 'init', '-q');
      git(repo, 'config', 'user.name', 'Drop CI Test');
      git(repo, 'config', 'user.email', 'ci-test@example.invalid');
      mkdirSync(join(repo, 'packages/node/src'), { recursive: true });
      mkdirSync(join(repo, 'docs/research'), { recursive: true });
      writeFileSync(join(repo, 'README.md'), 'initial documentation\n');
      writeFileSync(join(repo, 'packages/node/src/example.ts'), 'export const source = 1;\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-qm', 'initial');
      const before = git(repo, 'rev-parse', 'HEAD');
      writeFileSync(join(repo, 'README.md'), 'only documentation changed\n');
      git(repo, 'add', 'README.md');
      git(repo, 'commit', '-qm', 'docs only');
      const docsHead = git(repo, 'rev-parse', 'HEAD');
      expect(classifyGitCommits(before, docsHead, repo)).toBe('docs-only');

      // A code file becoming a research note must still run the complete CI.
      git(repo, 'mv', 'packages/node/src/example.ts', 'docs/research/example.md');
      git(repo, 'commit', '-qm', 'rename code to markdown');
      const renameHead = git(repo, 'rev-parse', 'HEAD');
      expect(classifyGitCommits(docsHead, renameHead, repo)).toBe('code');
      expect(classifyGitCommits(renameHead, renameHead, repo)).toBe('shared-or-unknown');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 20_000);

  it('fails closed on suspicious input and git errors, without shelling', () => {
    const base = 'a'.repeat(40);
    const head = 'b'.repeat(40);
    let calls = 0;
    const reader = (): Uint8Array => {
      calls += 1;
      return Buffer.from('M\0README.md\0');
    };
    expect(classifyGitCommits('--exec=$(touch /tmp/malicious)', head, '/tmp', reader)).toBe('shared-or-unknown');
    expect(classifyGitCommits(base, undefined, '/tmp', reader)).toBe('shared-or-unknown');
    expect(classifyGitCommits(base, head, '', reader)).toBe('shared-or-unknown');
    expect(calls).toBe(0);
    expect(classifyGitCommits(base, head, '/tmp', reader)).toBe('docs-only');
    expect(calls).toBe(1);
    const fail = (): Uint8Array => {
      throw new Error('git unavailable');
    };
    expect(classifyGitCommits(base, head, '/tmp', fail)).toBe('shared-or-unknown');
  });
});
