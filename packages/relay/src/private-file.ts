import { closeSync, fchmodSync, openSync, writeFileSync } from 'node:fs';

const PRIVATE_MODE = 0o600;

/**
 * Writes `data` to `path`, readable by its owner only. `writeFileSync`'s `mode` applies only when it creates the file:
 * an existing file is narrowed through its descriptor before the new content lands, so it never shows with a wider mode.
 */
export function writePrivate(path: string, data: string): void {
  const fd = openSync(path, 'w', PRIVATE_MODE);
  try {
    fchmodSync(fd, PRIVATE_MODE);
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}
