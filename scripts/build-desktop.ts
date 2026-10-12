// Builds the desktop app (T2.4, T3.7, T3.8) for the system it runs on: macOS, Windows or Linux, with its own Node
// runtime, drop-iroh and the two bundles of drop. One Tauri shell for the three (apps/desktop/src-tauri); what differs
// per system lives in tauri.<platform>.conf.json (bundle targets, program names), merged by Tauri itself
// (v2.tauri.app/develop/configuration-files, "Platform-specific Configuration").
//
// Usage: node scripts/build-desktop.ts [--platform macos|windows|linux] [--debug | --release] [--unsigned]
//                                      [--sign "Developer ID Application: …"] [--notary-profile <name>]
//                                      [--updates] [--notes "…"]
// - The build embeds the Node that runs this script, so it builds for this machine only: --platform, when given, must
//   name it (the default). No cross build: MSI needs Windows and AppImage needs the target's architecture (Tauri docs).
// - Without --release the build is a debug build, for trials only.
// - macOS --release is signed with a Developer ID and notarized (docs/RELEASE.md); --release --unsigned makes an
//   optimised build signed ad hoc instead, what CI produces without Apple secrets.
// - Windows --release is Authenticode-signed when WINDOWS_CERTIFICATE_THUMBPRINT names a certificate of the user's
//   store (v2.tauri.app/distribute/sign/windows), unsigned otherwise. Linux packages are never signed.
// - --updates signs platform-native updater bundles and writes one fragment per target to dist/updates/.
// The installers and a manifest of their SHA-256 land in dist/desktop/.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopUpdaterConfig, updateBundle, updateFragment } from './desktop-updates.ts';

export type DesktopPlatform = 'macos' | 'windows' | 'linux';

/** The Tauri CLI every build uses, pinned. */
export const TAURI_CLI = '@tauri-apps/cli@2.12.1';

const HOSTS: Partial<Record<NodeJS.Platform, DesktopPlatform>> = { darwin: 'macos', win32: 'windows', linux: 'linux' };

/** The platform to build: this machine's, which --platform may only confirm. */
export function resolvePlatform(args: readonly string[], host: NodeJS.Platform): DesktopPlatform {
  const native = HOSTS[host];
  if (!native) throw new Error(`E_BUILD_PLATFORM: no desktop app for ${host}`);
  const index = args.indexOf('--platform');
  if (index < 0) return native;
  const wanted = args[index + 1];
  if (wanted !== 'macos' && wanted !== 'windows' && wanted !== 'linux') {
    throw new Error('E_BUILD_PLATFORM: --platform takes macos, windows or linux');
  }
  if (wanted !== native) {
    throw new Error(
      `E_BUILD_PLATFORM: this machine builds for ${native}, not ${wanted}: the app embeds the Node that runs the build`,
    );
  }
  return wanted;
}

/** The programs the app ships next to each other in its resources: Windows only runs .exe files. */
export function programNames(platform: DesktopPlatform): { node: string; iroh: string } {
  return platform === 'windows' ? { node: 'node.exe', iroh: 'drop-iroh.exe' } : { node: 'node', iroh: 'drop-iroh' };
}

/** Where Tauri writes each installer of a platform, relative to target/<profile>/bundle, and its file suffix. */
export function installerKinds(platform: DesktopPlatform): { dir: string; suffix: string }[] {
  switch (platform) {
    case 'macos':
      return [{ dir: 'dmg', suffix: '.dmg' }];
    case 'windows':
      return [
        { dir: 'nsis', suffix: '-setup.exe' },
        { dir: 'msi', suffix: '.msi' },
      ];
    case 'linux':
      return [
        { dir: 'appimage', suffix: '.AppImage' },
        { dir: 'deb', suffix: '.deb' },
      ];
  }
}

/** The installer of this version among the files of a bundle directory: an older build may have left its own. */
export function findInstaller(files: readonly string[], version: string, suffix: string): string | undefined {
  return files.find((name) => name.startsWith(`drop_${version}_`) && name.endsWith(suffix));
}

/** What `tauri build --config` merges for Authenticode signing, when a certificate thumbprint is given. */
export function windowsSigningConfig(env: Readonly<Record<string, string | undefined>>): object | undefined {
  const thumbprint = env.WINDOWS_CERTIFICATE_THUMBPRINT?.trim();
  if (!thumbprint) return undefined;
  if (!/^[0-9A-Fa-f]{40}$/.test(thumbprint)) {
    throw new Error('E_WINDOWS_SIGN: WINDOWS_CERTIFICATE_THUMBPRINT must be the 40 hex digits of a SHA-1 thumbprint');
  }
  const timestampUrl = env.WINDOWS_TIMESTAMP_URL?.trim() || 'http://timestamp.digicert.com';
  return { bundle: { windows: { certificateThumbprint: thumbprint, digestAlgorithm: 'sha256', timestampUrl } } };
}

/**
 * The environment `tauri build` runs in. Tauri takes an APPLE_* variable that is set but empty as a value: CI passes
 * absent secrets as empty strings, and an empty APPLE_SIGNING_IDENTITY makes codesign fail with "no identity found".
 * So empty ones are dropped, and so is any signing identity when the build is not signed with a Developer ID.
 */
export function tauriEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  identity: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || (key.startsWith('APPLE_') && value === '')) continue;
    out[key] = value;
  }
  delete out.APPLE_SIGNING_IDENTITY;
  if (identity) out.APPLE_SIGNING_IDENTITY = identity;
  return out;
}

/** Merges plain JSON objects key by key, as RFC 7396 does for what Tauri receives with --config. */
export function mergeConfig(...parts: (object | undefined)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part) continue;
    for (const [key, value] of Object.entries(part as Record<string, unknown>)) {
      const current = out[key];
      out[key] = isObject(current) && isObject(value) ? mergeConfig(current, value) : value;
    }
  }
  return out;
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * How npx is started without a shell: Windows has only npx.cmd, which Node refuses to spawn without one since April
 * 2024. npm's own npx-cli.js, next to the Node that runs this script, works everywhere.
 */
function npx(): { command: string; prefix: string[] } {
  const bin = dirname(process.execPath);
  for (const candidate of [
    join(bin, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    join(bin, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ]) {
    if (existsSync(candidate)) return { command: process.execPath, prefix: [candidate] };
  }
  if (process.platform === 'win32') throw new Error('E_BUILD_NPX: npm is missing next to this Node');
  return { command: 'npx', prefix: [] };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function machineArch(platform: DesktopPlatform): string {
  if (platform !== 'macos') return process.arch;
  // Under Rosetta an x64 Node would end up in an arm64 app: refuse it.
  const machine = execFileSync('uname', ['-m'], { encoding: 'utf8' }).trim();
  const expected = machine === 'arm64' ? 'arm64' : machine === 'x86_64' ? 'x64' : null;
  if (!expected || process.arch !== expected) {
    throw new Error(`bundled Node architecture ${process.arch} differs from Mac architecture ${machine}`);
  }
  return machine;
}

function main(): void {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const tauriDir = join(root, 'apps', 'desktop', 'src-tauri');
  const resources = join(tauriDir, 'resources');
  const args = process.argv.slice(2);
  const platform = resolvePlatform(args, process.platform);
  const names = programNames(platform);
  const release = args.includes('--release');
  if (release && args.includes('--debug')) throw new Error('choose --debug or --release');
  const unsigned = args.includes('--unsigned');
  const signIndex = args.indexOf('--sign');
  const identity = signIndex >= 0 ? args[signIndex + 1] : unsigned ? undefined : process.env.APPLE_SIGNING_IDENTITY;
  if (signIndex >= 0 && !identity) throw new Error('--sign needs a Developer ID Application identity');
  if (unsigned && signIndex >= 0) throw new Error('choose --sign or --unsigned');
  if (platform !== 'macos' && (signIndex >= 0 || args.includes('--notary-profile'))) {
    throw new Error('--sign and --notary-profile are for macOS; Windows signs with WINDOWS_CERTIFICATE_THUMBPRINT');
  }
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
  const macSigned = platform === 'macos' && release && !unsigned;
  if (
    macSigned &&
    (!identity?.startsWith('Developer ID Application: ') ||
      (!hasApiCredentials && !hasAppleCredentials && !notaryProfile))
  ) {
    throw new Error(
      'release requires Developer ID Application and Apple notarization credentials or a notarytool profile; --unsigned builds without',
    );
  }
  // Only a Developer ID re-signs the bundled programs; an unsigned build keeps Node's own signature.
  const codesignIdentity = platform === 'macos' && !unsigned ? identity : undefined;
  const windowsSigning = platform === 'windows' && release ? windowsSigningConfig(process.env) : undefined;

  const arch = machineArch(platform);
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required for the bundle');

  const publicKeyPath = join(root, 'apps', 'desktop', 'updater.pub');
  const updates = args.includes('--updates');
  const notesIndex = args.indexOf('--notes');
  if (updates && !existsSync(publicKeyPath)) {
    throw new Error(`E_UPDATER_KEY: ${publicKeyPath} is missing, see docs/RELEASE.md`);
  }
  if (updates && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
    throw new Error('E_UPDATER_KEY: set TAURI_SIGNING_PRIVATE_KEY to the update private key, see docs/RELEASE.md');
  }

  execFileSync(process.execPath, [join(root, 'scripts', 'bundle.ts')], { stdio: 'inherit' });
  mkdirSync(resources, { recursive: true });
  const nodePath = join(resources, names.node);
  copyFileSync(process.execPath, nodePath);
  chmodSync(nodePath, 0o755);
  if (codesignIdentity) {
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
        codesignIdentity,
        nodePath,
      ],
      { stdio: 'inherit' },
    );
  }
  // Internet by iroh (T4.2b, D68): its program sits next to the bundled Node, signed the same way, with its notices.
  const irohCrate = join(root, 'crates', 'drop-iroh');
  execFileSync('cargo', ['build', '--release', '--locked', '--manifest-path', join(irohCrate, 'Cargo.toml')], {
    stdio: 'inherit',
  });
  const irohPath = join(resources, names.iroh);
  copyFileSync(join(irohCrate, 'target', 'release', names.iroh), irohPath);
  chmodSync(irohPath, 0o755);
  if (codesignIdentity) {
    execFileSync('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', codesignIdentity, irohPath], {
      stdio: 'inherit',
    });
  }
  execFileSync(
    process.execPath,
    [join(root, 'scripts', 'drop-iroh-notice.ts'), join(resources, 'drop-iroh-NOTICE.txt')],
    { stdio: 'inherit' },
  );
  copyFileSync(join(root, 'dist', 'drop.mjs'), join(resources, 'drop.mjs'));
  copyFileSync(join(root, 'dist', 'drop-mcp.mjs'), join(resources, 'drop-mcp.mjs'));

  // Without --updates the app gets no updater config, so it does not look for updates (D46, D76). An unsigned macOS
  // build is signed ad hoc: Apple silicon refuses to open an unsigned app downloaded from the Internet ("damaged"), while
  // an ad hoc one opens after the user allows it (v2.tauri.app/distribute/sign/macos, "Ad-Hoc Signing").
  const extraConfig = mergeConfig(
    updates ? desktopUpdaterConfig(readFileSync(publicKeyPath, 'utf8')) : undefined,
    windowsSigning,
    platform === 'macos' && unsigned ? { bundle: { macOS: { signingIdentity: '-' } } } : undefined,
  );
  const configArgs: string[] = [];
  if (Object.keys(extraConfig).length > 0) {
    // A file rather than inline JSON: no quoting problem on any system.
    const configPath = join(mkdtempSync(join(tmpdir(), 'drop-tauri-')), 'build.conf.json');
    writeFileSync(configPath, JSON.stringify(extraConfig));
    configArgs.push('--config', configPath);
  }
  const runner = npx();
  execFileSync(
    runner.command,
    [...runner.prefix, '--yes', TAURI_CLI, 'build', ...(!release ? ['--debug'] : []), ...configArgs],
    {
      cwd: tauriDir,
      stdio: 'inherit',
      env: tauriEnvironment(process.env, codesignIdentity),
    },
  );

  const config = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8')) as { version: string };
  const bundleRoot = join(tauriDir, 'target', release ? 'release' : 'debug', 'bundle');
  const installers = installerKinds(platform).map(({ dir, suffix }) => {
    const folder = join(bundleRoot, dir);
    const name = existsSync(folder) ? findInstaller(readdirSync(folder), config.version, suffix) : undefined;
    if (!name) throw new Error(`E_BUILD_BUNDLE: Tauri did not produce drop_${config.version}_*${suffix} in ${folder}`);
    return { name, path: join(folder, name) };
  });

  if (platform === 'macos') {
    const appPath = join(bundleRoot, 'macos', 'drop.app');
    const dmg = installers[0];
    if (!dmg) throw new Error('E_BUILD_BUNDLE: no DMG');
    if (macSigned && notarizeWithProfile && notaryProfile) {
      const submitted = execFileSync(
        'xcrun',
        ['notarytool', 'submit', dmg.path, '--keychain-profile', notaryProfile, '--wait', '--output-format', 'json'],
        { encoding: 'utf8' },
      );
      const result = JSON.parse(submitted) as { id?: string; status?: string };
      if (result.status !== 'Accepted') {
        throw new Error(
          `notarization ${result.status ?? 'unknown'}: xcrun notarytool log ${result.id ?? '?'} --keychain-profile ${notaryProfile}`,
        );
      }
      execFileSync('xcrun', ['stapler', 'staple', dmg.path], { stdio: 'inherit' });
      execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
      execFileSync('xcrun', ['stapler', 'validate', dmg.path], { stdio: 'inherit' });
    }
    if (macSigned) {
      execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' });
      execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath], { stdio: 'inherit' });
      execFileSync('xcrun', ['stapler', 'validate', appPath], { stdio: 'inherit' });
    }
  }

  const qualification = !release
    ? 'development-only'
    : platform === 'macos'
      ? macSigned
        ? 'signed-notarized-local-checks-passed'
        : 'unsigned-ad-hoc'
      : platform === 'windows' && windowsSigning
        ? 'authenticode-signed'
        : 'unsigned';
  const out = join(root, 'dist', 'desktop');
  mkdirSync(out, { recursive: true });
  for (const installer of installers) copyFileSync(installer.path, join(out, installer.name));
  const manifest = {
    product: 'drop',
    version: config.version,
    platform,
    architecture: arch,
    nodeVersion: process.versions.node,
    qualification,
    artifacts: {
      installers: installers.map((installer) => ({ name: installer.name, sha256: sha256(installer.path) })),
      node: { sha256: sha256(nodePath) },
      iroh: { sha256: sha256(irohPath) },
      cli: { sha256: sha256(join(resources, 'drop.mjs')) },
      mcp: { sha256: sha256(join(resources, 'drop-mcp.mjs')) },
    },
  };
  const manifestPath = join(out, `drop-build-manifest-${platform}-${arch}.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(
    `${installers.map((installer) => `${platform} installer: ${join(out, installer.name)}`).join('\n')}\nManifest: ${manifestPath}\n`,
  );

  if (updates) {
    const asset = updateBundle({ platform, arch, version: config.version, bundleRoot, installers });
    if (!existsSync(asset.source) || !existsSync(asset.signaturePath)) {
      throw new Error(`E_UPDATE_BUNDLE: Tauri did not sign ${asset.target} (${asset.source})`);
    }
    const fragment = updateFragment({
      version: config.version,
      target: asset.target,
      signature: readFileSync(asset.signaturePath, 'utf8'),
      artifact: asset.artifact,
      tag: process.env.DROP_RELEASE_TAG ?? `v${config.version}`,
      notes: notesIndex >= 0 ? (args[notesIndex + 1] ?? '') : '',
      pubDate: new Date(),
    });
    const updatesDir = join(root, 'dist', 'updates');
    mkdirSync(updatesDir, { recursive: true });
    copyFileSync(asset.source, join(updatesDir, asset.artifact));
    writeFileSync(join(updatesDir, `${asset.target}.json`), `${JSON.stringify(fragment, null, 2)}\n`);
    process.stdout.write(`update ${config.version} (${asset.target}) ready in ${updatesDir}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
