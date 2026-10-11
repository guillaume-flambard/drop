import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENTS } from '@drop/capabilities';
import { createTeam, ERROR_CODES, generateIdentity, REQUESTER_AGENTS } from '@drop/protocol';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { migratePrivate, privateConfig } from '../src/private-config.ts';
import { expectPrivateMode } from '../../../test/private-mode.ts';

const RELAY = 'ws://127.0.0.1:7780/v1';
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'drop-hygiene-'));
  roots.push(root);
  return root;
}

/** A private configuration as written to disk, without the fields the test wants to leave to the schema. */
function privateRaw(omit: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(privateConfig(RELAY, 'human', 7781)).filter(([key]) => !omit.includes(key)));
}

describe('configuration hygiene (T4.15)', () => {
  it('reads a configuration without a profile as the private profile drop init creates', () => {
    expect(NodeConfigSchema.parse(privateRaw(['profile'])).profile).toBe('private');
    // A pre-profile legacy file is no longer silently legacy: it must say so, or pass the private checks.
    expect(NodeConfigSchema.safeParse({ relayUrl: 'wss://relay.example/v1', ownerKind: 'human' }).success).toBe(false);
    expect(
      NodeConfigSchema.parse({ relayUrl: 'wss://relay.example/v1', ownerKind: 'human', profile: 'legacy' }),
    ).toMatchObject({ profile: 'legacy', payer: 'requester' });
  });

  it('makes the owner pay in the private profile and refuses a requester payer', () => {
    expect(NodeConfigSchema.parse(privateRaw(['payer'])).payer).toBe('owner');
    expect(NodeConfigSchema.safeParse({ ...privateRaw([]), payer: 'requester' }).success).toBe(false);
  });

  it('still migrates a pre-profile legacy configuration to the private profile', async () => {
    const root = tempRoot();
    const home = new DropHome(root);
    home.init(
      await generateIdentity('Owner'),
      NodeConfigSchema.parse({ relayUrl: 'wss://relay.example/v1', ownerKind: 'human', profile: 'legacy' }),
    );
    writeFileSync(
      join(root, 'config.json'),
      `${JSON.stringify({ relayUrl: 'wss://relay.example/v1', ownerKind: 'human', apiPort: 7781 })}\n`,
    );
    migratePrivate(home, RELAY);
    expect(home.config()).toMatchObject({ profile: 'private', payer: 'owner', relayUrl: RELAY });
  });

  it('keeps peers.json and team.json owner-only, narrowing existing files', async () => {
    const root = tempRoot();
    const home = new DropHome(root);
    const identity = await generateIdentity('Owner');
    home.init(identity, privateConfig(RELAY, 'human', 0));
    const peers = join(root, 'peers.json');
    const team = join(root, 'team.json');
    expectPrivateMode(peers);

    chmodSync(peers, 0o644);
    home.savePeer({ nodeId: identity.nodeId, displayName: 'Peer', ownerKind: 'human', pairedAt: '' });
    expectPrivateMode(peers);

    const state = { team: createTeam('Équipe'), members: [] };
    home.saveTeam(state);
    expectPrivateMode(team);
    chmodSync(team, 0o644);
    home.saveTeam(state);
    expectPrivateMode(team);

    // A file left wider by an older version is narrowed at start, before anything is written to it.
    chmodSync(peers, 0o644);
    chmodSync(team, 0o644);
    const before = readFileSync(peers, 'utf8');
    home.securePrivateFiles();
    expectPrivateMode(peers);
    expectPrivateMode(team);
    expect(readFileSync(peers, 'utf8')).toBe(before);
  });

  it('lists E_QUEUE_FULL among the stable error codes', () => {
    expect(ERROR_CODES).toContain('E_QUEUE_FULL');
  });

  it('detects exactly the agents the protocol can name on a consent card', () => {
    expect([...AGENTS]).toEqual(REQUESTER_AGENTS.filter((agent) => agent !== 'other'));
  });
});
