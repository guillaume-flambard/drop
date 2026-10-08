// Builds the Mac app (T2.4): bundles drop (D29), puts node and the two bundles into the app's resources, then runs
// `tauri build`. The app embeds the node binary that runs this script (arm64 on Apple silicon), so it needs no
// install of Node on the user's Mac.
// Usage: node scripts/build-mac.ts [--debug] [--sign "Developer ID Application: …"]
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(root, 'apps', 'mac', 'src-tauri');
const resources = join(tauriDir, 'resources');

execFileSync(process.execPath, [join(root, 'scripts', 'bundle.ts')], { stdio: 'inherit' });
mkdirSync(resources, { recursive: true });
copyFileSync(process.execPath, join(resources, 'node'));
chmodSync(join(resources, 'node'), 0o755);
copyFileSync(join(root, 'dist', 'drop.mjs'), join(resources, 'drop.mjs'));
copyFileSync(join(root, 'dist', 'drop-mcp.mjs'), join(resources, 'drop-mcp.mjs'));

const debug = process.argv.includes('--debug');
const signIndex = process.argv.indexOf('--sign');
const identity = signIndex > 0 ? process.argv[signIndex + 1] : undefined;
execFileSync('npx', ['--yes', '@tauri-apps/cli@2.12.1', 'build', ...(debug ? ['--debug'] : [])], {
  cwd: tauriDir,
  stdio: 'inherit',
  env: { ...process.env, ...(identity ? { APPLE_SIGNING_IDENTITY: identity } : {}) },
});
process.stdout.write(`app in ${join(tauriDir, 'target', debug ? 'debug' : 'release', 'bundle', 'macos')}\n`);
