// Build the macOS menu bar app with its own Node runtime. A distributable release is explicit.
// Usage: node scripts/build-mac.ts [--debug | --release] [--sign "Developer ID Application: …"]
// With --updates, the build is signed with drop's update key (TAURI_SIGNING_PRIVATE_KEY, never in the repo) and writes
// dist/updates/: latest.json and the archive to publish under https://drop.memolabs.dev/updates/ (D70). Without it the
// app carries no updater configuration and never looks for an update (D46, D76).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateManifest, updaterConfig } from './mac-updates.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(root, 'apps', 'mac', 'src-tauri');
const resources = join(tauriDir, 'resources');
const args = process.argv.slice(2);
const release = args.includes('--release');
if (release && args.includes('--debug')) throw new Error('choose --debug or --release');
const signIndex = args.indexOf('--sign');
const identity = signIndex >= 0 ? args[signIndex + 1] : process.env.APPLE_SIGNING_IDENTITY;
if (signIndex >= 0 && !identity) throw new Error('--sign needs a Developer ID Application identity');
const hasApiCredentials = Boolean(
  process.env.APPLE_API_ISSUER && process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_PATH,
);
const hasAppleCredentials = Boolean(process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID);
if (release && (!identity?.startsWith('Developer ID Application: ') || (!hasApiCredentials && !hasAppleCredentials))) {
  throw new Error('release requires Developer ID Application and Apple notarization credentials in the environment');
}

const hostArch = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
const expectedNodeArch = hostArch === 'arm64' ? 'arm64' : hostArch === 'x86_64' ? 'x64' : null;
if (!expectedNodeArch || process.arch !== expectedNodeArch) {
  throw new Error(`bundled Node architecture ${process.arch} differs from Mac architecture ${hostArch}`);
}
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required for the bundle');

const publicKeyPath = join(root, 'apps', 'mac', 'updater.pub');
const updates = args.includes('--updates');
const notesIndex = args.indexOf('--notes');
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
const updaterArgs = updates ? ['--config', JSON.stringify(updaterConfig(readFileSync(publicKeyPath, 'utf8')))] : [];
execFileSync('npx', ['--yes', '@tauri-apps/cli@2.12.1', 'build', ...(!release ? ['--debug'] : []), ...updaterArgs], {
  cwd: tauriDir,
  stdio: 'inherit',
  env: { ...process.env, ...(identity ? { APPLE_SIGNING_IDENTITY: identity } : {}) },
});

const config = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8')) as { version: string };
const bundleRoot = join(tauriDir, 'target', release ? 'release' : 'debug', 'bundle');
const appPath = join(bundleRoot, 'macos', 'drop.app');
const dmgDir = join(bundleRoot, 'dmg');
const dmg = readdirSync(dmgDir).find((name) => name.endsWith('.dmg'));
if (!dmg) throw new Error('Tauri did not produce a DMG');
const dmgPath = join(dmgDir, dmg);

if (release) {
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const manifest = {
  product: 'drop',
  version: config.version,
  architecture: hostArch,
  nodeVersion: process.versions.node,
  qualification: release ? 'signed-notarized-local-checks-passed' : 'development-only',
  artifacts: {
    dmg: { name: dmg, sha256: sha256(dmgPath) },
    node: { sha256: sha256(join(resources, 'node')) },
    cli: { sha256: sha256(join(resources, 'drop.mjs')) },
    mcp: { sha256: sha256(join(resources, 'drop-mcp.mjs')) },
  },
};
const manifestPath = join(bundleRoot, 'drop-build-manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Mac app: ${appPath}\nDMG: ${dmgPath}\nManifest: ${manifestPath}\n`);

if (updates) {
  const bundleDir = join(bundleRoot, 'macos');
  const { manifest: update, artifact } = updateManifest({
    version: config.version,
    signature: readFileSync(join(bundleDir, 'drop.app.tar.gz.sig'), 'utf8'),
    notes: notesIndex >= 0 ? (args[notesIndex + 1] ?? '') : '',
    pubDate: new Date(),
  });
  const out = join(root, 'dist', 'updates');
  mkdirSync(out, { recursive: true });
  copyFileSync(join(bundleDir, 'drop.app.tar.gz'), join(out, artifact));
  writeFileSync(join(out, 'latest.json'), `${JSON.stringify(update, null, 2)}\n`);
  process.stdout.write(`update ${config.version} in ${out}: publish ${artifact} first, then latest.json\n`);
}
