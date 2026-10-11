import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findInstaller,
  installerKinds,
  mergeConfig,
  programNames,
  resolvePlatform,
  windowsSigningConfig,
} from '../scripts/build-desktop.ts';

const tauriDir = join(import.meta.dirname, '..', 'apps', 'desktop', 'src-tauri');
const readConfig = (name: string): { bundle: { targets?: string[]; resources: Record<string, string> } } =>
  JSON.parse(readFileSync(join(tauriDir, name), 'utf8')) as {
    bundle: { targets?: string[]; resources: Record<string, string> };
  };

describe('the desktop build for macOS, Windows and Linux (T3.7, T3.8)', () => {
  it('builds for the machine it runs on, which --platform may confirm but never change', () => {
    expect(resolvePlatform([], 'darwin')).toBe('macos');
    expect(resolvePlatform([], 'win32')).toBe('windows');
    expect(resolvePlatform(['--platform', 'linux'], 'linux')).toBe('linux');
    expect(() => resolvePlatform(['--platform', 'windows'], 'darwin')).toThrow(/E_BUILD_PLATFORM/);
    expect(() => resolvePlatform(['--platform'], 'linux')).toThrow(/E_BUILD_PLATFORM/);
    expect(() => resolvePlatform([], 'freebsd')).toThrow(/E_BUILD_PLATFORM/);
  });

  it('ships node.exe and drop-iroh.exe on Windows, where the node looks for drop-iroh.exe next to itself', () => {
    expect(programNames('windows')).toEqual({ node: 'node.exe', iroh: 'drop-iroh.exe' });
    expect(programNames('linux')).toEqual({ node: 'node', iroh: 'drop-iroh' });
    expect(programNames('macos')).toEqual({ node: 'node', iroh: 'drop-iroh' });
  });

  it('bundles exactly the programs each platform config names, next to the shared files', () => {
    const base = readConfig('tauri.conf.json');
    expect(base.bundle.targets).toBeUndefined();
    expect(Object.values(base.bundle.resources).sort()).toEqual(['drop-iroh-NOTICE.txt', 'drop-mcp.mjs', 'drop.mjs']);
    for (const [file, platform] of [
      ['tauri.macos.conf.json', 'macos'],
      ['tauri.windows.conf.json', 'windows'],
      ['tauri.linux.conf.json', 'linux'],
    ] as const) {
      const { node, iroh } = programNames(platform);
      expect(readConfig(file).bundle.resources).toEqual({ [`resources/${node}`]: node, [`resources/${iroh}`]: iroh });
    }
    expect(readConfig('tauri.macos.conf.json').bundle.targets).toEqual(['app', 'dmg']);
    expect(readConfig('tauri.windows.conf.json').bundle.targets).toEqual(['nsis', 'msi']);
    expect(readConfig('tauri.linux.conf.json').bundle.targets).toEqual(['appimage', 'deb']);
  });

  it('collects the installers of this version only, per platform', () => {
    expect(installerKinds('windows').map((kind) => kind.suffix)).toEqual(['-setup.exe', '.msi']);
    expect(installerKinds('linux').map((kind) => kind.suffix)).toEqual(['.AppImage', '.deb']);
    const files = ['drop_0.0.9_x64-setup.exe', 'drop_0.1.0_x64-setup.exe', 'drop_0.1.0_x64_en-US.msi'];
    expect(findInstaller(files, '0.1.0', '-setup.exe')).toBe('drop_0.1.0_x64-setup.exe');
    expect(findInstaller(files, '0.1.0', '.msi')).toBe('drop_0.1.0_x64_en-US.msi');
    expect(findInstaller(files, '0.2.0', '.msi')).toBeUndefined();
  });

  it('signs Windows builds only with a well-formed certificate thumbprint, timestamped', () => {
    expect(windowsSigningConfig({})).toBeUndefined();
    expect(windowsSigningConfig({ WINDOWS_CERTIFICATE_THUMBPRINT: ' ' })).toBeUndefined();
    const thumbprint = 'A'.repeat(40);
    expect(windowsSigningConfig({ WINDOWS_CERTIFICATE_THUMBPRINT: thumbprint })).toEqual({
      bundle: {
        windows: {
          certificateThumbprint: thumbprint,
          digestAlgorithm: 'sha256',
          timestampUrl: 'http://timestamp.digicert.com',
        },
      },
    });
    expect(() => windowsSigningConfig({ WINDOWS_CERTIFICATE_THUMBPRINT: 'not-a-thumbprint' })).toThrow(
      /E_WINDOWS_SIGN/,
    );
  });

  it('merges the extra build configs key by key', () => {
    expect(
      mergeConfig({ bundle: { createUpdaterArtifacts: true }, plugins: { updater: { pubkey: 'k' } } }, undefined, {
        bundle: { windows: { digestAlgorithm: 'sha256' } },
      }),
    ).toEqual({
      bundle: { createUpdaterArtifacts: true, windows: { digestAlgorithm: 'sha256' } },
      plugins: { updater: { pubkey: 'k' } },
    });
  });
});
