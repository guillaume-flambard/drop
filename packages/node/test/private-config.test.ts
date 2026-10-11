import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { privateConfig, migratePrivate, rollbackPrivate } from '../src/private-config.ts';
import { expectPrivateMode } from '../../../test/private-mode.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('private configuration', () => {
  it('initializes without cloud accounts and rejects forbidden profile settings', () => {
    const config = privateConfig('ws://127.0.0.1:7780/v1', 'human', 7781);
    expect(config).toMatchObject({ profile: 'private', payer: 'owner', gateways: [] });
    expect(config.funding).toBeUndefined();
    expect(() => privateConfig('wss://drop.memolabs.dev/v1', 'human', 7781)).toThrow();
    expect(() => NodeConfigSchema.parse({ ...config, funding: { kind: 'openrouter' } })).toThrow();
  });
  it('recovers a migration interrupted before replacement and refuses an occupied lock', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-private-'));
    roots.push(root);
    const home = new DropHome(root);
    home.init(
      await generateIdentity('Owner'),
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: 'wss://drop.memolabs.dev/v1', ownerKind: 'human' }),
    );
    const before = readFileSync(join(root, 'config.json'), 'utf8');
    writeFileSync(join(root, 'private-migration.json'), JSON.stringify({ before, after: 'not committed' }), {
      mode: 0o600,
    });
    writeFileSync(join(root, '.private-migration.lock'), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
    expect(() => {
      rollbackPrivate(home);
    }).toThrow('E_LOCKED');
    rmSync(join(root, '.private-migration.lock'));
    rollbackPrivate(home);
    expect(readFileSync(join(root, 'config.json'), 'utf8')).toBe(before);
  });

  it('backs up migrates and restores configuration without changing identity or publications', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-private-'));
    roots.push(root);
    const home = new DropHome(root);
    home.init(
      await generateIdentity('Owner'),
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: 'wss://drop.memolabs.dev/v1', ownerKind: 'human' }),
    );
    home.publish({
      capabilityId: 'repo.answer',
      approverNodeIds: [home.identity().nodeId],
      config: { repoPath: '/example' },
      publishedAt: new Date().toISOString(),
    });
    const original = readFileSync(join(root, 'config.json'), 'utf8');
    const identity = readFileSync(join(root, 'identity.json'), 'utf8');
    const publication = readFileSync(join(root, 'capabilities/repo.answer.json'), 'utf8');
    migratePrivate(home, 'ws://127.0.0.1:7780/v1');
    expect(home.config().profile).toBe('private');
    expectPrivateMode(join(root, 'private-migration.json'));
    expect(readFileSync(join(root, 'identity.json'), 'utf8')).toBe(identity);
    expect(readFileSync(join(root, 'capabilities/repo.answer.json'), 'utf8')).toBe(publication);
    expect(() => {
      migratePrivate(home, 'ws://127.0.0.1:7780/v1');
    }).toThrow();
    const migrated = readFileSync(join(root, 'config.json'), 'utf8');
    writeFileSync(join(root, 'config.json'), migrated + ' ');
    expect(() => {
      rollbackPrivate(home);
    }).toThrow('E_CONFLICT');
    writeFileSync(join(root, 'config.json'), migrated);
    rollbackPrivate(home);
    expect(readFileSync(join(root, 'config.json'), 'utf8')).toBe(original);
  });
});
