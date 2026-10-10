import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('private bundled bootstrap', () => {
  it('initializes a fresh private home without starting the imported MCP executable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-bundle-private-'));
    try {
      const bundle = join(root, 'drop.mjs');
      const home = join(root, 'home');
      await build({
        entryPoints: [resolve('packages/node/src/cli.ts')],
        outfile: bundle,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node22.18',
        external: ['bufferutil', 'utf-8-validate'],
        banner: {
          js: "import { createRequire as __dropRequire } from 'node:module';const require = __dropRequire(import.meta.url);",
        },
      });
      const initialized = spawnSync(process.execPath, [bundle, 'init', '--profile', 'private', '--name', 'Owner'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, DROP_HOME: home },
      });
      expect(initialized.status, initialized.stderr).toBe(0);
      const config: unknown = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
      expect(config).toMatchObject({
        profile: 'private',
        relayUrl: 'ws://127.0.0.1:7780/v1',
        payer: 'owner',
        gateways: [],
      });
      expect(statSync(join(home, 'identity.json')).mode & 0o777).toBe(0o600);
      expect(initialized.stdout).not.toContain('jsonrpc');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15000);
});
