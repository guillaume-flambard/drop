// Signed updates of the Mac app (T2.4, D70). The app looks for `latest.json` under drop.memolabs.dev/updates and only
// installs an archive signed with drop's update key (minisign, Tauri updater plugin) whose signature names the version
// the manifest announces. This module builds that manifest and the `--config` that turns the updater on; the build
// itself is scripts/build-mac.ts.

export const UPDATES_URL = 'https://drop.memolabs.dev/updates';
export const UPDATE_ENDPOINT = `${UPDATES_URL}/latest.json`;
/** The update platforms Tauri names `darwin-<arch>`: Apple silicon and Intel. */
const PLATFORMS = ['darwin-aarch64', 'darwin-x86_64'] as const;
export type UpdatePlatform = (typeof PLATFORMS)[number];

/**
 * The app embeds the Node binary of the Mac that builds it, so one platform per build (D30), named after that Mac's
 * `uname -m` (scripts/build-mac.ts refuses any other architecture).
 */
export function updatePlatform(machine: string): UpdatePlatform {
  if (machine === 'arm64' || machine === 'aarch64') return 'darwin-aarch64';
  if (machine === 'x86_64') return 'darwin-x86_64';
  throw new Error(`E_UPDATE_PLATFORM: no update platform for a ${machine} Mac`);
}

// One version pattern for the manifest and for the archive names the public site serves (scripts/site.ts).
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;
const SEMVER = new RegExp(`^${VERSION}$`);
/** The name of an update archive, exactly as updateManifest() publishes it. */
export const UPDATE_ARCHIVE = new RegExp(String.raw`^drop-${VERSION}-darwin-(?:aarch64|x86_64)\.app\.tar\.gz$`);
// A public key as `tauri signer generate` writes it to the .pub file: base64 on one line, never a path.
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export interface UpdateManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

/** What `tauri build --config` merges into tauri.conf.json so that the build signs and the app checks for updates. */
export function updaterConfig(pubkey: string): object {
  const key = pubkey.trim();
  if (!BASE64.test(key)) throw new Error('E_UPDATER_KEY: the public key must be the content of the .pub file');
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: { updater: { pubkey: key, endpoints: [UPDATE_ENDPOINT], requireSignedVersion: true } },
  };
}

/** The version the signature's trusted comment carries (`timestamp:…\tfile:…\tversion:x.y.z`), if any. */
function signedVersion(signature: string): string | undefined {
  const text = Buffer.from(signature, 'base64').toString('utf8');
  const comment = /^trusted comment: (.*)$/m.exec(text)?.[1];
  const field = comment?.split('\t').find((part) => part.startsWith('version:'));
  return field?.slice('version:'.length);
}

/**
 * `latest.json` for the archive `tauri build` signed, and the name to publish that archive under. Refuses a signature
 * made for another version: the app would reject the update (requireSignedVersion), better to fail the release.
 */
export function updateManifest(input: {
  version: string;
  signature: string;
  notes: string;
  pubDate: Date;
  platform: string;
}): {
  manifest: UpdateManifest;
  artifact: string;
} {
  if (!SEMVER.test(input.version)) throw new Error(`E_UPDATE_VERSION: ${input.version} is not a semver version`);
  const platform = PLATFORMS.find((candidate) => candidate === input.platform);
  if (!platform) throw new Error(`E_UPDATE_PLATFORM: ${input.platform} is not ${PLATFORMS.join(' or ')}`);
  const signature = input.signature.trim();
  const signed = signature && BASE64.test(signature) ? signedVersion(signature) : undefined;
  if (signed !== input.version) {
    throw new Error(`E_UPDATE_SIGNATURE: the signature is for ${signed ?? 'no version'}, not ${input.version}`);
  }
  const artifact = `drop-${input.version}-${platform}.app.tar.gz`;
  return {
    artifact,
    manifest: {
      version: input.version,
      notes: input.notes,
      pub_date: input.pubDate.toISOString(),
      platforms: { [platform]: { signature, url: `${UPDATES_URL}/${artifact}` } },
    },
  };
}
