import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { RelayClient } from '@drop/relay';
import { startDaemon } from '../src/daemon.ts';
import { DropHome } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';
import { expectPrivateMode } from '../../../test/private-mode.ts';

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function initializedHome(): Promise<DropHome> {
  const root = mkdtempSync(join(tmpdir(), 'drop-local-token-test-'));
  roots.push(root);
  const home = new DropHome(root);
  home.init(await generateIdentity('Token Test'), privateConfig('ws://127.0.0.1:1/v1', 'human', 0));
  return home;
}

describe('local token fail-closed behavior', () => {
  it('creates a local token with owner-only permissions', async () => {
    const home = await initializedHome();
    expect(home.localToken()).not.toBe('');
    expectPrivateMode(join(home.root, 'local-token'));
  });

  it('refuses to start with a missing or empty local token', async () => {
    const relayStart = vi.spyOn(RelayClient.prototype, 'start').mockImplementation(() => undefined);
    for (const value of [undefined, '', '   ']) {
      const home = await initializedHome();
      const path = join(home.root, 'local-token');
      if (value === undefined) unlinkSync(path);
      else writeFileSync(path, value);
      let opened = false;
      const outcome = await startDaemon(home, { apiPort: 0, notifications: false, log: () => undefined }).then(
        async (daemon) => {
          opened = daemon.api.server.listening;
          await daemon.stop();
          return 'started';
        },
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(Error);
      expect(String(outcome)).toContain('E_TOKEN');
      expect(relayStart).not.toHaveBeenCalled();
      expect(opened).toBe(false);
      expect(() => home.localToken()).toThrow('E_TOKEN');
    }
  });
});
