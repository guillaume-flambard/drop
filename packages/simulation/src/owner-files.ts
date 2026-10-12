import { closeSync, fchmodSync, openSync, writeFileSync } from 'node:fs';

/**
 * Campaign files readable by their owner only (T4.26, CodeQL js/insecure-temporary-file). The campaign directory comes
 * from mkdtemp (0700) by default, but `--work-dir` may name any directory: plan, relay configuration, planted logs and
 * reports are created 0600 whatever the umask, and a file left by an earlier run is narrowed before it is written.
 * Windows keeps only the read-only bit; the profile's ACL protects the files there.
 */
const OWNER_ONLY = 0o600;

/** Opens `path` with `flags`, created 0600, and narrows it to 0600 if it existed; the caller closes the descriptor. */
export function openOwnerOnly(path: string, flags: 'w' | 'a'): number {
  // The mode is written out here, where static analysis reads it (CodeQL looks for a literal mode at the open call).
  const fd = openSync(path, flags, 0o600);
  try {
    fchmodSync(fd, OWNER_ONLY);
  } catch (error) {
    closeSync(fd);
    throw error;
  }
  return fd;
}

function writeWith(flags: 'w' | 'a', path: string, content: string): void {
  const fd = openOwnerOnly(path, flags);
  try {
    writeFileSync(fd, content);
  } finally {
    closeSync(fd);
  }
}

/** Writes `content` to `path`, owner-only. */
export function writeOwnerOnly(path: string, content: string): void {
  writeWith('w', path, content);
}

/** Appends `content` to `path`, owner-only. */
export function appendOwnerOnly(path: string, content: string): void {
  writeWith('a', path, content);
}
