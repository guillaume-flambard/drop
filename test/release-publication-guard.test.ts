import { describe, expect, it } from 'vitest';
import { verifyStableDistribution, type BuildQualification } from '../scripts/release-publication-guard.ts';

const signed = [
  {
    product: 'drop',
    version: '0.1.0',
    platform: 'macos',
    architecture: 'arm64',
    qualification: 'signed-notarized-local-checks-passed',
  },
  {
    product: 'drop',
    version: '0.1.0',
    platform: 'macos',
    architecture: 'x86_64',
    qualification: 'signed-notarized-local-checks-passed',
  },
  { product: 'drop', version: '0.1.0', platform: 'windows', architecture: 'x64', qualification: 'authenticode-signed' },
  { product: 'drop', version: '0.1.0', platform: 'linux', architecture: 'x64', qualification: 'unsigned' },
  { product: 'drop', version: '0.1.0', platform: 'linux', architecture: 'arm64', qualification: 'unsigned' },
] as const satisfies readonly BuildQualification[];

describe('stable release automatic publication guard', () => {
  it('permits a complete notarized Apple and Authenticode Windows release', () => {
    expect(() => {
      verifyStableDistribution(signed);
    }).not.toThrow();
  });
  it('refuses drafts missing a platform or mixing versions or product names', () => {
    expect(() => {
      verifyStableDistribution(signed.slice(1));
    }).toThrow('five distinct');
    expect(() => {
      verifyStableDistribution(signed.map((m, i) => (i === 1 ? { ...m, version: '0.2.0' } : m)));
    }).toThrow('mixed');
    expect(() => {
      verifyStableDistribution(signed.map((m, i) => (i === 4 ? { ...m, product: 'fake' } : m)));
    }).toThrow('mixed');
  });
  it('refuses ad hoc Mac and unsigned Windows packages, even when Tauri has signed their updater', () => {
    expect(() => {
      verifyStableDistribution(signed.map((m, i) => (i === 0 ? { ...m, qualification: 'unsigned-ad-hoc' } : m)));
    }).toThrow('macos:arm64');
    expect(() => {
      verifyStableDistribution(signed.map((m, i) => (i === 2 ? { ...m, qualification: 'unsigned' } : m)));
    }).toThrow('windows:x64');
  });
  it('refuses duplicate or unexpected platform combinations', () => {
    expect(() => {
      verifyStableDistribution([...signed.slice(0, 4), signed[0]]);
    }).toThrow('duplicate');
    expect(() => {
      verifyStableDistribution(signed.map((m, i) => (i === 1 ? { ...m, architecture: 'unexpected' } : m)));
    }).toThrow('unexpected');
  });
});
