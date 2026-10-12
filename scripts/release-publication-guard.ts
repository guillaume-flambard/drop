// A tagged release must never become public as "automatic" if macOS or Windows
// would require users to bypass OS trust warnings. This check runs after all
// platform builds and before changing the draft to a published stable release.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuildQualification {
  product: string;
  version: string;
  platform: string;
  architecture: string;
  qualification: string;
}

const EXPECTED = {
  'macos:arm64': 'signed-notarized-local-checks-passed',
  'macos:x86_64': 'signed-notarized-local-checks-passed',
  'windows:x64': 'authenticode-signed',
  'linux:x64': 'unsigned',
  'linux:arm64': 'unsigned',
} as const;

export function verifyStableDistribution(manifests: readonly BuildQualification[]): void {
  if (manifests.length !== Object.keys(EXPECTED).length) {
    throw new Error('E_PUBLIC_RELEASE: expected five distinct build manifests');
  }
  const seen = new Set<string>();
  const version = manifests[0]?.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('E_PUBLIC_RELEASE: invalid version');
  for (const manifest of manifests) {
    const key = `${manifest.platform}:${manifest.architecture}`;
    if (!(key in EXPECTED) || seen.has(key)) throw new Error('E_PUBLIC_RELEASE: unexpected or duplicate platform');
    seen.add(key);
    if (manifest.product !== 'drop' || manifest.version !== version) {
      throw new Error('E_PUBLIC_RELEASE: mixed product or version');
    }
    const expected = EXPECTED[key as keyof typeof EXPECTED];
    if (manifest.qualification !== expected) {
      throw new Error(`E_PUBLIC_RELEASE: ${key} requires ${expected}, got ${manifest.qualification}`);
    }
  }
  for (const key of Object.keys(EXPECTED)) {
    if (!seen.has(key)) throw new Error(`E_PUBLIC_RELEASE: missing ${key}`);
  }
}

function main(dir: string): void {
  const filenames = readdirSync(dir).filter((name) => /^drop-build-manifest-[\w-]+\.json$/.test(name));
  const manifests = filenames.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as BuildQualification);
  verifyStableDistribution(manifests);
  process.stdout.write('Stable public release trust checks passed for five architectures.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) throw new Error('Usage: node scripts/release-publication-guard.ts <release-dir>');
  main(resolve(dir));
}
