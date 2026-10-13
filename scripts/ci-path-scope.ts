/**
 * T4.28: pure, conservative classification of a change before choosing CI work.
 * No CI job is skipped by this file. The required test, test-windows and test-macos
 * job names must remain present when this is eventually wired into GitHub Actions.
 *
 * Supply BOTH old and new paths for renames: a code-to-doc rename is not docs-only.
 * Unknown, empty and malformed diffs MUST run the full matrix.
 */
export type CiPathScope = 'docs-only' | 'code' | 'shared-or-unknown';

const DOC_ROOT = new Set(['README.md', 'README.fr.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SUPPORT.md']);
const RESEARCH_NOTE = /^docs\/research\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.md$/;

export function classifyCiPaths(paths: readonly string[] | null | undefined): CiPathScope {
  if (!paths || paths.length === 0 || paths.length > 10_000) return 'shared-or-unknown';
  let hasCode = false;
  for (const path of paths) {
    // Git's NUL-separated paths may contain newlines and other control characters:
    // never treat such names or non-canonical paths as safely documentary.
    if (
      path.length === 0 ||
      path.startsWith('/') ||
      path.startsWith('./') ||
      path.endsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '.' || part === '..' || part === '') ||
      Array.from(path).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      return 'shared-or-unknown';
    if (DOC_ROOT.has(path) || RESEARCH_NOTE.test(path)) continue;
    // CI, configs, lockfiles, specs, fixtures and unclassified docs are shared:
    // a change can affect *every* platform even when it doesn't modify runtime code.
    if (
      path.startsWith('.github/') ||
      path.startsWith('scripts/') ||
      path.startsWith('test/') ||
      path.startsWith('openspec/') ||
      path.startsWith('docs/') ||
      path === 'package.json' ||
      path === 'pnpm-lock.yaml' ||
      path === 'pnpm-workspace.yaml' ||
      path.startsWith('tsconfig')
    )
      return 'shared-or-unknown';
    if (/^(apps|packages|crates|site)\//.test(path)) {
      hasCode = true;
      continue;
    }
    return 'shared-or-unknown';
  }
  return hasCode ? 'code' : 'docs-only';
}

/** Safe to try a reduced docs-specific job ONLY after the required checks' behavior is proven. */
export function isDocumentationOnly(paths: readonly string[] | null | undefined): boolean {
  return classifyCiPaths(paths) === 'docs-only';
}
