import { describe, expect, it } from 'vitest';
import { UPDATE_ENDPOINT, updateManifest, updaterConfig } from '../scripts/mac-updates.ts';

// A `.sig` file as `tauri build` writes it: base64 of a minisign signature whose trusted comment names the version.
function sig(trustedComment: string): string {
  const text = `untrusted comment: signature from tauri secret key\nRUQfake\ntrusted comment: ${trustedComment}\nZmFrZQ==\n`;
  return Buffer.from(text).toString('base64');
}

const PUBKEY = Buffer.from('untrusted comment: minisign public key: ABCD\nRWQfakepublickey\n').toString('base64');

describe('signed updates of the Mac app (T2.4)', () => {
  it('announces the build for darwin-aarch64 with its signature and a versioned URL under /updates', () => {
    const signature = sig('timestamp:1760000000\tfile:drop.app.tar.gz\tversion:0.2.0');
    const { manifest, artifact } = updateManifest({
      version: '0.2.0',
      signature,
      notes: 'Correctifs',
      pubDate: new Date('2026-10-09T12:00:00Z'),
    });
    expect(artifact).toBe('drop-0.2.0-darwin-aarch64.app.tar.gz');
    expect(manifest).toEqual({
      version: '0.2.0',
      notes: 'Correctifs',
      pub_date: '2026-10-09T12:00:00.000Z',
      platforms: {
        'darwin-aarch64': {
          signature,
          url: 'https://drop.memolabs.dev/updates/drop-0.2.0-darwin-aarch64.app.tar.gz',
        },
      },
    });
  });

  it('refuses a signature made for another version, or carrying none', () => {
    const base = { version: '0.2.0', notes: '', pubDate: new Date() };
    expect(() =>
      updateManifest({ ...base, signature: sig('timestamp:1\tfile:drop.app.tar.gz\tversion:0.1.0') }),
    ).toThrow(/E_UPDATE_SIGNATURE/);
    expect(() => updateManifest({ ...base, signature: sig('timestamp:1\tfile:drop.app.tar.gz') })).toThrow(
      /E_UPDATE_SIGNATURE/,
    );
    expect(() => updateManifest({ ...base, signature: '' })).toThrow(/E_UPDATE_SIGNATURE/);
    expect(() => updateManifest({ ...base, version: 'latest', signature: sig('timestamp:1\tversion:latest') })).toThrow(
      /E_UPDATE_VERSION/,
    );
  });

  it('turns the updater on only with a public key, over HTTPS, and requires the version in the signature', () => {
    expect(updaterConfig(`${PUBKEY}\n`)).toEqual({
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey: PUBKEY, endpoints: [UPDATE_ENDPOINT], requireSignedVersion: true } },
    });
    expect(UPDATE_ENDPOINT).toBe('https://drop.memolabs.dev/updates/latest.json');
    expect(() => updaterConfig('')).toThrow(/E_UPDATER_KEY/);
    expect(() => updaterConfig('/Users/me/.tauri/drop.key.pub')).toThrow(/E_UPDATER_KEY/);
  });
});
