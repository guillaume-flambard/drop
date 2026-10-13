import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/test.yml', 'utf8');
const count = (needle: string): number => workflow.split(needle).length - 1;

describe('T4.28 required status checks always exist', () => {
  it('keeps all three required job names, triggers and no workflow path filter', () => {
    expect(workflow).toContain('  pull_request:');
    expect(workflow).toContain('  merge_group:');
    expect(workflow).toContain('  test:\n    name: test\n');
    expect(workflow).toContain('  test-cross:\n    name: test-${{ matrix.label }}\n');
    expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:\s*$/m);
    // Both required OS checks execute the same job with a Windows/macOS matrix.
    expect(workflow).toContain('label: windows');
    expect(workflow).toContain('label: macos');
  });

  it('forces full checks on merge_group or unreadable diffs', () => {
    expect(count('id: ci-scope')).toBe(2);
    expect(count('if [ "$GITHUB_EVENT_NAME" != "merge_group" ]; then')).toBe(2);
    expect(count('|| scope=shared-or-unknown')).toBe(2);
    expect(count('fetch-depth: 0')).toBe(2);
    expect(count('node scripts/ci-git-scope.ts')).toBe(2);
    expect(count('run: pnpm -r lint')).toBe(2);
  });

  it('reduces only expensive steps for docs, never the job or spec guard', () => {
    expect(count('if: steps.ci-scope.outputs.docs_only')).toBeGreaterThanOrEqual(6);
    expect(count('name: Build drop-iroh')).toBe(2);
    expect(workflow).toContain('openspec-guard@0.3.0');
    expect(workflow).toContain("if: steps.ci-scope.outputs.docs_only != 'true'");
    expect(workflow).not.toContain('jobs:\n  test:\n    if:');
  });
});
