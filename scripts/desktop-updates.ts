// Signed, cross-platform Tauri v2 update artifacts. A published GitHub Release is the stable update feed.
// The update signing key is independent of Apple's Developer ID and Windows Authenticode certificates.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DesktopPlatform } from './build-desktop.ts';

export const STABLE_FEED = 'https://github.com/memolabs-dev/drop/releases/latest/download/latest.json';
const RELEASES = 'https://github.com/memolabs-dev/drop/releases/download';
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const UPDATE_TARGETS = [
  'darwin-aarch64-app',
  'darwin-x86_64-app',
  'windows-x86_64-nsis',
  'linux-x86_64-appimage',
  'linux-aarch64-appimage',
] as const;
export type UpdateTarget = (typeof UPDATE_TARGETS)[number];
export interface UpdateFragment {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

export function updateTarget(platform: DesktopPlatform, arch: string): UpdateTarget {
  const suffix =
    arch === 'arm64' || arch === 'aarch64' ? 'aarch64' : arch === 'x64' || arch === 'x86_64' ? 'x86_64' : '';
  const bundle = platform === 'macos' ? 'app' : platform === 'windows' ? 'nsis' : 'appimage';
  const target = `${platform === 'macos' ? 'darwin' : platform}-${suffix}-${bundle}`;
  if (!UPDATE_TARGETS.includes(target as UpdateTarget))
    throw new Error(`E_UPDATE_PLATFORM: unsupported ${platform}/${arch}`);
  // No Windows arm64 build or updater is advertised.
  if (platform === 'windows' && suffix !== 'x86_64') throw new Error('E_UPDATE_PLATFORM: Windows arm64 is not built');
  return target as UpdateTarget;
}

export function desktopUpdaterConfig(pubkey: string): object {
  const key = pubkey.trim();
  if (!BASE64.test(key)) throw new Error('E_UPDATER_KEY: expected the base64 content of updater.pub');
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey: key,
        endpoints: [STABLE_FEED],
        requireSignedVersion: true,
        windows: { installMode: 'passive' },
      },
    },
  };
}

export function updateBundle(input: {
  platform: DesktopPlatform;
  arch: string;
  version: string;
  bundleRoot: string;
  installers: readonly { name: string; path: string }[];
}): { target: UpdateTarget; source: string; signaturePath: string; artifact: string } {
  const target = updateTarget(input.platform, input.arch);
  if (!VERSION.test(input.version)) throw new Error('E_UPDATE_VERSION: release version must be x.y.z');
  if (input.platform === 'macos') {
    const source = join(input.bundleRoot, 'macos', 'drop.app.tar.gz');
    return { target, source, signaturePath: `${source}.sig`, artifact: `drop-${input.version}-${target}.app.tar.gz` };
  }
  const suffix = input.platform === 'windows' ? '-setup.exe' : '.AppImage';
  const installer = input.installers.find(({ name }) => name.endsWith(suffix));
  if (!installer) throw new Error(`E_UPDATE_BUNDLE: no ${suffix} for ${target}`);
  return { target, source: installer.path, signaturePath: `${installer.path}.sig`, artifact: basename(installer.path) };
}

/** Validate the version bound into the trusted comment, not merely the presence of a .sig file. */
export function validateSignature(signature: string, version: string): string {
  const value = signature.trim();
  if (!value || !BASE64.test(value)) throw new Error('E_UPDATE_SIGNATURE: missing or malformed updater signature');
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const comment = /^trusted comment: (.*)$/m.exec(decoded)?.[1];
  const bound = comment
    ?.split('\t')
    .find((part) => part.startsWith('version:'))
    ?.slice(8);
  if (bound !== version) throw new Error(`E_UPDATE_SIGNATURE: signed ${bound ?? 'no version'}, expected ${version}`);
  return value;
}

export function updateFragment(input: {
  target: UpdateTarget;
  version: string;
  signature: string;
  artifact: string;
  tag: string;
  notes: string;
  pubDate: Date;
}): UpdateFragment {
  if (!VERSION.test(input.version) || !/^v[0-9]+\.[0-9]+\.[0-9]+(?:-ci\.[0-9]+)?$/.test(input.tag)) {
    throw new Error('E_UPDATE_VERSION: invalid release version or tag');
  }
  if (input.tag !== `v${input.version}` && !input.tag.startsWith(`v${input.version}-ci.`)) {
    throw new Error('E_UPDATE_VERSION: release tag and version disagree');
  }
  if (!UPDATE_TARGETS.includes(input.target)) throw new Error('E_UPDATE_PLATFORM: unsupported target');
  if (!/^[a-zA-Z0-9_.-]+$/.test(input.artifact)) throw new Error('E_UPDATE_ASSET: unsafe archive name');
  return {
    version: input.version,
    notes: input.notes,
    pub_date: input.pubDate.toISOString(),
    platforms: {
      [input.target]: {
        signature: validateSignature(input.signature, input.version),
        url: `${RELEASES}/${input.tag}/${input.artifact}`,
      },
    },
  };
}

/** Do not produce a partial feed: every architecture must receive the same tested release. */
export function mergeUpdateFragments(fragments: readonly UpdateFragment[]): UpdateFragment {
  if (fragments.length !== UPDATE_TARGETS.length) throw new Error('E_UPDATE_INCOMPLETE: expected all five platforms');
  const first = fragments[0];
  if (!first || !VERSION.test(first.version)) throw new Error('E_UPDATE_VERSION: no valid version');
  const merged: UpdateFragment = {
    version: first.version,
    notes: first.notes,
    pub_date: first.pub_date,
    platforms: {},
  };
  for (const fragment of fragments) {
    if (fragment.version !== first.version) throw new Error('E_UPDATE_VERSION: mixed release versions');
    for (const [target, entry] of Object.entries(fragment.platforms)) {
      if (!UPDATE_TARGETS.includes(target as UpdateTarget) || merged.platforms[target])
        throw new Error('E_UPDATE_PLATFORM: unknown or duplicate target');
      const url = new URL(entry.url);
      if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/memolabs-dev/drop/releases/download/')) {
        throw new Error('E_UPDATE_URL: update must come from the repository release');
      }
      validateSignature(entry.signature, fragment.version);
      merged.platforms[target] = entry;
    }
  }
  if (UPDATE_TARGETS.some((target) => !merged.platforms[target]))
    throw new Error('E_UPDATE_INCOMPLETE: missing target');
  return merged;
}

export function readUpdateFragment(path: string): UpdateFragment {
  return JSON.parse(readFileSync(path, 'utf8')) as UpdateFragment;
}
