// Build the macOS menu bar app with its own Node runtime. A distributable release is explicit.
// Usage: node scripts/build-mac.ts [--debug | --release] [--sign "Developer ID Application: …"] [--notary-profile <name>]
// With --updates, the build is signed with drop's update key (TAURI_SIGNING_PRIVATE_KEY, never in the repo) and writes
// dist/updates/: latest.json and the archive to publish under https://drop.memolabs.dev/updates/ (D70). Without it the
// app carries no updater configuration and never looks for an update (D46, D76).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateManifest, updatePlatform, updaterConfig } from './mac-updates.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(root, 'apps', 'desktop', 'src-tauri');
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
// A notarytool keychain profile (xcrun notarytool store-credentials) keeps the password out of the environment.
// Tauri cannot read it, so this script submits the DMG itself when the profile is the only credential.
const profileIndex = args.indexOf('--notary-profile');
const notaryProfile = profileIndex >= 0 ? args[profileIndex + 1] : process.env.APPLE_NOTARY_PROFILE;
if (profileIndex >= 0 && !notaryProfile) throw new Error('--notary-profile needs a notarytool keychain profile name');
const notarizeWithProfile = Boolean(notaryProfile) && !hasApiCredentials && !hasAppleCredentials;
if (
  release &&
  (!identity?.startsWith('Developer ID Application: ') ||
    (!hasApiCredentials && !hasAppleCredentials && !notaryProfile))
) {
  throw new Error(
    'release requires Developer ID Application and Apple notarization credentials or a notarytool profile',
  );
}

const hostArch = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
const expectedNodeArch = hostArch === 'arm64' ? 'arm64' : hostArch === 'x86_64' ? 'x64' : null;
if (!expectedNodeArch || process.arch !== expectedNodeArch) {
  throw new Error(`bundled Node architecture ${process.arch} differs from Mac architecture ${hostArch}`);
}
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required for the bundle');

const publicKeyPath = join(root, 'apps', 'desktop', 'updater.pub');
const updates = args.includes('--updates');
const notesIndex = args.indexOf('--notes');
if (updates && !existsSync(publicKeyPath)) {
  throw new Error(`E_UPDATER_KEY: ${publicKeyPath} is missing, see docs/MAC_RELEASE.md`);
}
if (updates && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  throw new Error('E_UPDATER_KEY: set TAURI_SIGNING_PRIVATE_KEY to the update private key, see docs/MAC_RELEASE.md');
}

execFileSync(process.execPath, [join(root, 'scripts', 'bundle.ts')], { stdio: 'inherit' });
mkdirSync(resources, { recursive: true });
copyFileSync(process.execPath, join(resources, 'node'));
chmodSync(join(resources, 'node'), 0o755);
if (identity) {
  // The official Node binary carries get-task-allow, which notarization rejects; re-sign it for the hardened runtime.
  execFileSync(
    'codesign',
    [
      '--force',
      '--options',
      'runtime',
      '--timestamp',
      '--entitlements',
      join(tauriDir, 'node.entitlements'),
      '--sign',
      identity,
      join(resources, 'node'),
    ],
    { stdio: 'inherit' },
  );
}
// Internet by iroh (T4.2b, D68): its program sits next to the bundled Node, signed the same way, with its notices.
const irohCrate = join(root, 'crates', 'drop-iroh');
execFileSync('cargo', ['build', '--release', '--locked', '--manifest-path', join(irohCrate, 'Cargo.toml')], {
  stdio: 'inherit',
});
copyFileSync(join(irohCrate, 'target', 'release', 'drop-iroh'), join(resources, 'drop-iroh'));
chmodSync(join(resources, 'drop-iroh'), 0o755);
if (identity) {
  execFileSync(
    'codesign',
    ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, join(resources, 'drop-iroh')],
    { stdio: 'inherit' },
  );
}
execFileSync(
  process.execPath,
  [join(root, 'scripts', 'drop-iroh-notice.ts'), join(resources, 'drop-iroh-NOTICE.txt')],
  {
    stdio: 'inherit',
  },
);
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
// The DMG of this version: an older build may have left its own in the same directory.
const dmg = readdirSync(dmgDir).find((name) => name.startsWith(`drop_${config.version}_`) && name.endsWith('.dmg'));
if (!dmg) throw new Error(`E_BUILD_DMG: Tauri did not produce drop_${config.version}_*.dmg in ${dmgDir}`);
const dmgPath = join(dmgDir, dmg);

if (release && notarizeWithProfile && notaryProfile) {
  const submitted = execFileSync(
    'xcrun',
    ['notarytool', 'submit', dmgPath, '--keychain-profile', notaryProfile, '--wait', '--output-format', 'json'],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(submitted) as { id?: string; status?: string };
  if (result.status !== 'Accepted') {
    throw new Error(
      `notarization ${result.status ?? 'unknown'}: xcrun notarytool log ${result.id ?? '?'} --keychain-profile ${notaryProfile}`,
    );
  }
  execFileSync('xcrun', ['stapler', 'staple', dmgPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
  execFileSync('xcrun', ['stapler', 'validate', dmgPath], { stdio: 'inherit' });
}

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
    iroh: { sha256: sha256(join(resources, 'drop-iroh')) },
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
    platform: updatePlatform(hostArch),
  });
  const out = join(root, 'dist', 'updates');
  mkdirSync(out, { recursive: true });
  copyFileSync(join(bundleDir, 'drop.app.tar.gz'), join(out, artifact));
  writeFileSync(join(out, 'latest.json'), `${JSON.stringify(update, null, 2)}\n`);
  process.stdout.write(`update ${config.version} in ${out}: publish ${artifact} first, then latest.json\n`);
}
