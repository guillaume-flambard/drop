// Builds the Mac app (T2.4): bundles drop (D29), puts node and the two bundles into the app's resources, then runs
// `tauri build`. The app embeds the node binary that runs this script (arm64 on Apple silicon), so it needs no
// install of Node on the user's Mac.
// With --updates, the build is signed with drop's update key (TAURI_SIGNING_PRIVATE_KEY, never in the repo) and writes
// dist/updates/: latest.json and the archive to publish under https://drop.memolabs.dev/updates/ (D35).
// Usage: node scripts/build-mac.ts [--debug] [--sign "Developer ID Application: …"] [--updates [--notes "…"]]
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateManifest, updaterConfig } from './mac-updates.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(root, 'apps', 'mac', 'src-tauri');
const resources = join(tauriDir, 'resources');
const publicKeyPath = join(root, 'apps', 'mac', 'updater.pub');

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const debug = process.argv.includes('--debug');
const identity = option('--sign');
const updates = process.argv.includes('--updates');
if (updates && !existsSync(publicKeyPath)) {
  throw new Error(`E_UPDATER_KEY: ${publicKeyPath} is missing, see apps/mac/README.md`);
}
if (updates && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  throw new Error('E_UPDATER_KEY: set TAURI_SIGNING_PRIVATE_KEY to the update private key, see apps/mac/README.md');
}

execFileSync(process.execPath, [join(root, 'scripts', 'bundle.ts')], { stdio: 'inherit' });
mkdirSync(resources, { recursive: true });
copyFileSync(process.execPath, join(resources, 'node'));
chmodSync(join(resources, 'node'), 0o755);
copyFileSync(join(root, 'dist', 'drop.mjs'), join(resources, 'drop.mjs'));
copyFileSync(join(root, 'dist', 'drop-mcp.mjs'), join(resources, 'drop-mcp.mjs'));

// Without --updates the app gets no updater config, so it does not look for updates (a local or debug build).
const config = updates ? ['--config', JSON.stringify(updaterConfig(readFileSync(publicKeyPath, 'utf8')))] : [];
execFileSync('npx', ['--yes', '@tauri-apps/cli@2.12.1', 'build', ...(debug ? ['--debug'] : []), ...config], {
  cwd: tauriDir,
  stdio: 'inherit',
  env: { ...process.env, ...(identity ? { APPLE_SIGNING_IDENTITY: identity } : {}) },
});
const bundleDir = join(tauriDir, 'target', debug ? 'debug' : 'release', 'bundle', 'macos');
process.stdout.write(`app in ${bundleDir}\n`);

if (updates) {
  const { version } = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8')) as { version: string };
  const { manifest, artifact } = updateManifest({
    version,
    signature: readFileSync(join(bundleDir, 'drop.app.tar.gz.sig'), 'utf8'),
    notes: option('--notes') ?? '',
    pubDate: new Date(),
  });
  const out = join(root, 'dist', 'updates');
  mkdirSync(out, { recursive: true });
  copyFileSync(join(bundleDir, 'drop.app.tar.gz'), join(out, artifact));
  writeFileSync(join(out, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`update ${version} in ${out}: publish ${artifact} first, then latest.json\n`);
}
