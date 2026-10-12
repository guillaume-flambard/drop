import { describe, expect, it } from 'vitest';
import {
  UPDATE_TARGETS,
  STABLE_FEED,
  desktopUpdaterConfig,
  mergeUpdateFragments,
  updateBundle,
  updateFragment,
  updateTarget,
  validateSignature,
} from '../scripts/desktop-updates.ts';

function signature(version: string): string {
  return Buffer.from(
    `untrusted comment: signature from tauri secret key\nRUQfake\ntrusted comment: timestamp:1\tfile:drop\tversion:${version}\nZmFrZQ==\n`,
  ).toString('base64');
}
const PUBKEY = Buffer.from('public-key').toString('base64');
const date = new Date('2026-10-12T00:00:00.000Z');

describe('desktop updater artifacts', () => {
  it('uses the stable published release, never a CI draft or a mutable tag', () => {
    expect(STABLE_FEED).toBe('https://github.com/memolabs-dev/drop/releases/latest/download/latest.json');
    expect(desktopUpdaterConfig(PUBKEY)).toEqual({
      bundle: { createUpdaterArtifacts: true },
      plugins: {
        updater: {
          pubkey: PUBKEY,
          endpoints: [STABLE_FEED],
          requireSignedVersion: true,
          windows: { installMode: 'passive' },
        },
      },
    });
    expect(() => desktopUpdaterConfig('../private.key')).toThrow(/E_UPDATER_KEY/);
  });

  it('maps macOS, Windows and Linux to Tauri v2 runtime target names', () => {
    expect(updateTarget('macos', 'arm64')).toBe('darwin-aarch64-app');
    expect(updateTarget('macos', 'x64')).toBe('darwin-x86_64-app');
    expect(updateTarget('windows', 'x64')).toBe('windows-x86_64-nsis');
    expect(updateTarget('linux', 'x64')).toBe('linux-x86_64-appimage');
    expect(updateTarget('linux', 'arm64')).toBe('linux-aarch64-appimage');
    expect(() => updateTarget('windows', 'arm64')).toThrow(/E_UPDATE_PLATFORM/);
  });

  it('selects exactly Tauri v2 platform-native update archives', () => {
    const sample = (platform: 'macos' | 'windows' | 'linux', arch: string, name: string) =>
      updateBundle({
        platform,
        arch,
        version: '0.2.0',
        bundleRoot: '/tmp/tauri/bundle',
        installers: [{ name, path: `/tmp/tauri/bundle/${name}` }],
      });
    expect(sample('macos', 'arm64', 'drop_0.2.0_aarch64.dmg').artifact).toBe(
      'drop-0.2.0-darwin-aarch64-app.app.tar.gz',
    );
    expect(sample('windows', 'x64', 'drop_0.2.0_x64-setup.exe').signaturePath).toContain('-setup.exe.sig');
    expect(sample('linux', 'x64', 'drop_0.2.0_amd64.AppImage').artifact).toBe('drop_0.2.0_amd64.AppImage');
    expect(() => sample('windows', 'x64', 'drop_0.2.0_x64.msi')).toThrow(/E_UPDATE_BUNDLE/);
  });

  it('binds signature and release version, refusing empty, mismatched and unsafe artifacts', () => {
    expect(validateSignature(signature('0.2.0'), '0.2.0')).toBe(signature('0.2.0'));
    expect(() => validateSignature(signature('0.1.0'), '0.2.0')).toThrow(/E_UPDATE_SIGNATURE/);
    const base = {
      target: UPDATE_TARGETS[0],
      version: '0.2.0',
      signature: signature('0.2.0'),
      artifact: 'drop-0.2.0-darwin-aarch64-app.app.tar.gz',
      tag: 'v0.2.0',
      notes: 'Fixes',
      pubDate: date,
    };
    expect(updateFragment(base).platforms['darwin-aarch64-app']?.url).toBe(
      'https://github.com/memolabs-dev/drop/releases/download/v0.2.0/drop-0.2.0-darwin-aarch64-app.app.tar.gz',
    );
    expect(() => updateFragment({ ...base, tag: 'v0.3.0' })).toThrow(/E_UPDATE_VERSION/);
    expect(() => updateFragment({ ...base, artifact: '../fake.exe' })).toThrow(/E_UPDATE_ASSET/);
  });

  it('publishes only five distinct same-version targets pointing to this repository', () => {
    const fragments = UPDATE_TARGETS.map((target) =>
      updateFragment({
        target,
        version: '0.2.0',
        signature: signature('0.2.0'),
        artifact: `drop-0.2.0-${target}.bin`,
        tag: 'v0.2.0',
        notes: 'Fixes',
        pubDate: date,
      }),
    );
    expect(Object.keys(mergeUpdateFragments(fragments).platforms).sort()).toEqual([...UPDATE_TARGETS].sort());
    expect(() => mergeUpdateFragments(fragments.slice(1))).toThrow(/E_UPDATE_INCOMPLETE/);
    expect(() => mergeUpdateFragments([...fragments.slice(1), fragments[1]!])).toThrow(/E_UPDATE_PLATFORM/);
    const different = structuredClone(fragments);
    different[2]!.version = '0.3.0';
    expect(() => mergeUpdateFragments(different)).toThrow(/E_UPDATE_VERSION/);
    const hostile = structuredClone(fragments);
    hostile[0]!.platforms['darwin-aarch64-app']!.url = 'https://not-our-repository.example/installer';
    expect(() => mergeUpdateFragments(hostile)).toThrow(/E_UPDATE_URL/);
  });
});
