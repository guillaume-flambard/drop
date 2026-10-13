import { describe, expect, it } from 'vitest';
import { classifyGitNameStatusZ, parseGitNameStatusZ } from '../scripts/ci-git-diff.ts';

const bytes = (content: string): Uint8Array => Buffer.from(content, 'utf8');

describe('T4.28 Git -z name-status parsing', () => {
  it('preserves paths for adds, modifications, deletes and type changes', () => {
    expect(parseGitNameStatusZ(bytes('A\0README.md\0M\0docs/research/a.md\0D\0CONTRIBUTING.md\0'))).toEqual([
      'README.md',
      'docs/research/a.md',
      'CONTRIBUTING.md',
    ]);
    expect(classifyGitNameStatusZ(bytes('T\0apps/desktop/src-tauri/src/main.rs\0'))).toBe('code');
  });

  it('never treats code renamed into documentation as docs-only', () => {
    const rename = bytes('R100\0packages/node/src/old.ts\0docs/research/new.md\0');
    expect(parseGitNameStatusZ(rename)).toEqual(['packages/node/src/old.ts', 'docs/research/new.md']);
    expect(classifyGitNameStatusZ(rename)).toBe('code');
    expect(classifyGitNameStatusZ(bytes('C80\0scripts/old.ts\0README.md\0'))).toBe('shared-or-unknown');
    expect(classifyGitNameStatusZ(bytes('R099\0README.md\0README.fr.md\0'))).toBe('docs-only');
  });

  it('fails closed for empty, truncated, unknown or malformed statuses', () => {
    for (const raw of [
      undefined,
      null,
      bytes(''),
      bytes('M\0README.md'),
      bytes('M\0'),
      bytes('R100\0README.md\0'),
      bytes('R101\0README.md\0README.fr.md\0'),
      bytes('X\0README.md\0'),
      bytes('U\0README.md\0'),
      bytes('README.md\0'),
      new Uint8Array([77, 0, 255, 0]),
    ]) {
      expect(parseGitNameStatusZ(raw)).toBeNull();
      expect(classifyGitNameStatusZ(raw)).toBe('shared-or-unknown');
    }
  });

  it('keeps native NUL boundaries so a newline path is not silently reinterpreted', () => {
    expect(classifyGitNameStatusZ(bytes('M\0docs/research/good\n.md\0'))).toBe('shared-or-unknown');
    expect(classifyGitNameStatusZ(bytes('M\0README.md\0M\0.github/workflows/test.yml\0'))).toBe('shared-or-unknown');
  });
});
