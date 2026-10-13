import { execFileSync } from 'node:child_process';
import { classifyGitNameStatusZ } from './ci-git-diff.ts';
import type { CiPathScope } from './ci-path-scope.ts';

/** GitHub provides 40-hex commit SHAs; never allow untrusted flags or arbitrary refs. */
const COMMIT_SHA = /^[a-fA-F0-9]{40}$/;
export type GitDiffReader = (args: readonly string[], cwd: string) => Uint8Array;

const readGitDiff: GitDiffReader = (args, cwd) =>
  execFileSync('git', [...args], { cwd, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, timeout: 10_000 });

/**
 * Git adapter for T4.28: invalid/missing SHAs, shallow clones, inaccessible
 * history, merge conflicts and any subprocess error all run the full matrix.
 * The shell is never involved. No job is skipped here.
 */
export function classifyGitCommits(
  baseSha: string | undefined,
  headSha: string | undefined,
  cwd: string,
  reader: GitDiffReader = readGitDiff,
): CiPathScope {
  if (!baseSha || !headSha || !COMMIT_SHA.test(baseSha) || !COMMIT_SHA.test(headSha) || !cwd)
    return 'shared-or-unknown';
  try {
    const result = reader(['diff', '--name-status', '-z', '--find-renames', baseSha, headSha, '--'], cwd);
    return classifyGitNameStatusZ(result);
  } catch {
    return 'shared-or-unknown';
  }
}

/** The CLI emits only the scope, never filenames, credentials or invocation details. */
if (process.argv[1]?.endsWith('/ci-git-scope.ts')) {
  process.stdout.write(
    classifyGitCommits(process.env.DROP_CI_BASE_SHA, process.env.DROP_CI_HEAD_SHA, process.cwd()) + '\n',
  );
}
