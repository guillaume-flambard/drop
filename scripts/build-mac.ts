// Build the macOS menu bar app with its own Node runtime. A distributable release is explicit.
// Usage: node scripts/build-mac.ts [--debug | --release] [--sign "Developer ID Application: …"]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

execFileSync(process.execPath, [join(root, 'scripts', 'bundle.ts')], { stdio: 'inherit' });
mkdirSync(resources, { recursive: true });
copyFileSync(process.execPath, join(resources, 'node'));
chmodSync(join(resources, 'node'), 0o755);
copyFileSync(join(root, 'dist', 'drop.mjs'), join(resources, 'drop.mjs'));
copyFileSync(join(root, 'dist', 'drop-mcp.mjs'), join(resources, 'drop-mcp.mjs'));

execFileSync('npx', ['--yes', '@tauri-apps/cli@2.12.1', 'build', ...(!release ? ['--debug'] : [])], {
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
