// Kept for the commands already written down: the macOS build is now scripts/build-desktop.ts --platform macos, with the
// same options (--debug | --release [--unsigned], --sign, --notary-profile, --updates, --notes). See docs/RELEASE.md.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'build-desktop.ts');
try {
  execFileSync(process.execPath, [script, '--platform', 'macos', ...process.argv.slice(2)], { stdio: 'inherit' });
} catch {
  process.exitCode = 1;
}
