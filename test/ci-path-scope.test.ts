import { describe, expect, it } from 'vitest';
import { classifyCiPaths, isDocumentationOnly } from '../scripts/ci-path-scope.ts';

describe('T4.28 CI scope classification (no workflow skip yet)', () => {
  it('only reduces a tight allowlist of non-generated documentation', () => {
    const changes = ['README.fr.md', 'docs/research/2026-10-12-openwhispr.md', 'docs/research/studies/a.md'];
    expect(classifyCiPaths(changes)).toBe('docs-only');
    expect(isDocumentationOnly(changes)).toBe(true);
    expect(classifyCiPaths(['docs/PRD.md'])).toBe('shared-or-unknown');
    expect(classifyCiPaths(['docs/TASKS.md'])).toBe('shared-or-unknown');
    expect(classifyCiPaths(['docs/ACCEPTANCE.md'])).toBe('shared-or-unknown');
    expect(classifyCiPaths(['docs/research/figure.svg'])).toBe('shared-or-unknown');
  });

  it('keeps runtime code as full CI, including mixed docs and code', () => {
    expect(classifyCiPaths(['packages/node/src/api.ts'])).toBe('code');
    expect(classifyCiPaths(['README.md', 'crates/drop-iroh/src/main.rs'])).toBe('code');
    expect(classifyCiPaths(['apps/desktop/src-tauri/src/main.rs'])).toBe('code');
    expect(classifyCiPaths(['site/join.html'])).toBe('code');
  });

  it('forces the full matrix for build, workflow, dependency and test changes', () => {
    for (const path of [
      '.github/workflows/test.yml',
      '.github/scripts/ci-scope.cjs',
      'scripts/ci-path-scope.ts',
      'test/ci-path-scope.test.ts',
      'openspec/specs/node/spec.md',
      'pnpm-lock.yaml',
      'package.json',
      'tsconfig.json',
      'fixtures/unknown.json',
    ])
      expect(classifyCiPaths(['README.md', path]), path).toBe('shared-or-unknown');
  });

  it('fails closed for missing, invalid, ambiguous and rename paths', () => {
    expect(classifyCiPaths([])).toBe('shared-or-unknown');
    expect(classifyCiPaths(null)).toBe('shared-or-unknown');
    expect(classifyCiPaths(undefined)).toBe('shared-or-unknown');
    for (const path of [
      'docs/research/../other.md',
      './README.md',
      '/README.md',
      'docs\\research\\a.md',
      'docs/research/a\n.md',
      'docs/research//a.md',
      'docs/research/a.md/',
    ])
      expect(classifyCiPaths([path]), path).toBe('shared-or-unknown');
    // A rename from code to README must include both paths, never infer docs-only.
    expect(classifyCiPaths(['packages/node/src/old.ts', 'README.md'])).toBe('code');
    expect(classifyCiPaths(Array.from({ length: 10_001 }, () => 'README.md'))).toBe('shared-or-unknown');
  });
});
