import { statSync } from 'node:fs';
import { expect } from 'vitest';

/**
 * Asserts that a private file (0600) or folder (0700) exists and is owner-only on macOS and Linux. Windows has no POSIX
 * mode bits (stat always reports 0666 or 0444): there a file under the user profile is protected by the profile's ACL,
 * so only its existence is checked. Explicit Windows ACLs for the private files are a T3.7 follow-up.
 */
export function expectPrivateMode(path: string, mode: 0o600 | 0o700 = 0o600): void {
  const stats = statSync(path);
  if (process.platform === 'win32') return;
  expect(stats.mode & 0o777, path).toBe(mode);
}
