// Signed updates of the Mac app (T2.4, D70). The app looks for `latest.json` under drop.memolabs.dev/updates and only
// installs an archive signed with drop's update key (minisign, Tauri updater plugin) whose signature names the version
// the manifest announces. This module builds that manifest and the `--config` that turns the updater on; the build
// itself is scripts/build-mac.ts.

export const UPDATES_URL = 'https://drop.memolabs.dev/updates';
export const UPDATE_ENDPOINT = `${UPDATES_URL}/latest.json`;
/** The app embeds the Node binary of the Mac that builds it, so one platform per build: Apple silicon for now (D30). */
const PLATFORM = 'darwin-aarch64';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
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
export function updateManifest(input: { version: string; signature: string; notes: string; pubDate: Date }): {
  manifest: UpdateManifest;
  artifact: string;
} {
  if (!SEMVER.test(input.version)) throw new Error(`E_UPDATE_VERSION: ${input.version} is not a semver version`);
  const signature = input.signature.trim();
  const signed = signature && BASE64.test(signature) ? signedVersion(signature) : undefined;
  if (signed !== input.version) {
    throw new Error(`E_UPDATE_SIGNATURE: the signature is for ${signed ?? 'no version'}, not ${input.version}`);
  }
  const artifact = `drop-${input.version}-${PLATFORM}.app.tar.gz`;
  return {
    artifact,
    manifest: {
      version: input.version,
      notes: input.notes,
      pub_date: input.pubDate.toISOString(),
      platforms: { [PLATFORM]: { signature, url: `${UPDATES_URL}/${artifact}` } },
    },
  };
}
