import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateIdentity, openEnvelope, ReplayCache, sealEnvelope, uuidv7, type Envelope } from '@drop/protocol';
import { DropHome } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';
import { NodeEngine } from '../src/engine.ts';
import { fakeCapability } from './helpers.ts';

const NOW = 1_791_460_000_000;

describe('bounded received drops', () => {
  it('rejects stale and future identifiers before writing a marker', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-window-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW - 30 * 60_000 - 1), NOW)).toBe('expired');
      expect(home.claimDrop(uuidv7(NOW + 5 * 60_000 + 1), NOW)).toBe('expired');
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      expect(readdirSync(join(root, 'received-drops')).length).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('prunes old markers and rejects them after restart and clock rollback', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-rollback-'));
    try {
      const first = new DropHome(root);
      const oldId = uuidv7(NOW);
      expect(first.claimDrop(oldId, NOW)).toBe('claimed');
      expect(first.claimDrop(uuidv7(NOW + 31 * 60_000), NOW + 31 * 60_000)).toBe('claimed');
      const restarted = new DropHome(root);
      expect(restarted.claimDrop(oldId, NOW)).toBe('expired');
      expect(readdirSync(join(root, 'received-drops'))).not.toContain(oldId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed when replay clock state is corrupt', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-corrupt-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      writeFileSync(join(root, 'received-drops-clock'), 'corrupt');
      expect(() => new DropHome(root).claimDrop(uuidv7(NOW + 1), NOW + 1)).toThrow('E_REPLAY_STATE');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a claim while another process owns the replay lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-lock-'));
    try {
      const home = new DropHome(root);
      const lock = join(root, 'received-drops.lock');
      mkdirSync(lock, { mode: 0o700 });
      const dropId = uuidv7(NOW);
      expect(() => home.claimDrop(dropId, NOW)).toThrow('E_REPLAY_STATE');
      rmdirSync(lock);
      expect(home.claimDrop(dropId, NOW)).toBe('claimed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats lowercase and uppercase UUIDv7 as the same claim', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-case-'));
    try {
      const home = new DropHome(root);
      const dropId = uuidv7(NOW);
      expect(home.claimDrop(dropId.toUpperCase(), NOW)).toBe('claimed');
      expect(readdirSync(join(root, 'received-drops'))).toEqual([dropId]);
      expect(home.claimDrop(dropId, NOW)).toBe('duplicate');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('migrates an existing uppercase marker before admitting another request', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-case-migration-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      const dropId = uuidv7(NOW);
      writeFileSync(join(root, 'received-drops', dropId.toUpperCase()), '');
      expect(home.claimDrop(dropId, NOW)).toBe('duplicate');
      expect(readdirSync(join(root, 'received-drops'))).toContain(dropId);
      expect(readdirSync(join(root, 'received-drops'))).not.toContain(dropId.toUpperCase());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes legacy UUIDv4 markers because new requests cannot reuse them', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-migration-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      const legacy = '550e8400-e29b-41d4-a716-446655440000';
      writeFileSync(join(root, 'received-drops', legacy), '');
      expect(home.claimDrop(uuidv7(NOW + 1), NOW + 1)).toBe('claimed');
      expect(readdirSync(join(root, 'received-drops'))).not.toContain(legacy);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses another claim at the marker cap', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-cap-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      const dir = join(root, 'received-drops');
      const prefix = uuidv7(NOW).slice(0, 24);
      for (let index = 1; index < 16_384; index += 1) {
        const suffix = index.toString(16).padStart(12, '0');
        writeFileSync(join(dir, `${prefix}${suffix}`), '');
      }
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('capacity');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('private replay admission', () => {
  it('refuses an old drop before consent and reports a corrupt replay store as E_RATE', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-'));
    try {
      const owner = await generateIdentity('Owner');
      const requester = await generateIdentity('Requester');
      const home = new DropHome(root);
      home.init(owner, privateConfig('ws://127.0.0.1:7780/v1', 'human', 0));
      home.savePeer({
        nodeId: requester.nodeId,
        displayName: 'Requester',
        ownerKind: 'human',
        pairedAt: new Date(NOW).toISOString(),
      });
      home.publish({
        capabilityId: 'test.state',
        approverNodeIds: [owner.nodeId],
        config: {},
        publishedAt: new Date(NOW).toISOString(),
      });
      const replies: Envelope[] = [];
      const engine = new NodeEngine({
        identity: owner,
        ownerKind: 'human',
        store: home,
        capabilities: [fakeCapability('test.state', 'low')],
        transport: {
          send: (envelope) => {
            replies.push(envelope);
            return Promise.resolve('delivered');
          },
        },
        now: () => NOW,
      });
      const request = async (dropId: string) =>
        sealEnvelope(
          requester,
          owner.nodeId,
          {
            type: 'drop_request',
            dropId,
            capabilityId: 'test.state',
            capabilityVersion: '1.0.0',
            input: { mode: 'ok' },
            purpose: 'Test replay',
            requestedBy: { nodeId: requester.nodeId, displayName: 'Requester', agent: 'codex' },
          },
          { now: NOW },
        );
      await engine.handleEnvelope(await request(uuidv7(NOW - 30 * 60_000 - 1)));
      expect(engine.pending()).toHaveLength(0);
      expect(
        (
          await openEnvelope(requester, replies.at(-1), {
            isKnownPeer: (id) => id === owner.nodeId,
            replay: new ReplayCache(),
            now: NOW,
          })
        ).message,
      ).toMatchObject({ type: 'drop_error', code: 'E_EXPIRED' });
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      writeFileSync(join(root, 'received-drops-clock'), 'corrupt');
      await engine.handleEnvelope(await request(uuidv7(NOW)));
      expect(engine.pending()).toHaveLength(0);
      expect(
        (
          await openEnvelope(requester, replies.at(-1), {
            isKnownPeer: (id) => id === owner.nodeId,
            replay: new ReplayCache(),
            now: NOW,
          })
        ).message,
      ).toMatchObject({ type: 'drop_error', code: 'E_RATE' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('private restart', () => {
  it('rejects a previously received drop after restart before any consent can be reused', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-'));
    try {
      const owner = await generateIdentity('Owner');
      const requester = await generateIdentity('Requester');
      const home = new DropHome(root);
      home.init(owner, privateConfig('ws://127.0.0.1:7780/v1', 'human', 0));
      home.savePeer({
        nodeId: requester.nodeId,
        displayName: 'Requester',
        ownerKind: 'human',
        pairedAt: new Date().toISOString(),
      });
      home.publish({
        capabilityId: 'test.state',
        approverNodeIds: [owner.nodeId],
        config: {},
        publishedAt: new Date().toISOString(),
      });
      const impl = fakeCapability('test.state', 'low');
      let executions = 0;
      const execute = impl.execute.bind(impl);
      impl.execute = async (...args) => {
        executions++;
        return execute(...args);
      };
      const make = () =>
        new NodeEngine({
          identity: owner,
          ownerKind: 'human',
          store: home,
          capabilities: [impl],
          transport: { send: () => Promise.resolve('delivered') },
        });
      const first = make();
      const dropId = uuidv7();
      const request = await sealEnvelope(requester, owner.nodeId, {
        type: 'drop_request',
        dropId,
        capabilityId: impl.card.id,
        capabilityVersion: impl.card.version,
        input: { mode: 'ok' },
        purpose: 'Test restart',
        requestedBy: { nodeId: requester.nodeId, displayName: 'Requester', agent: 'claude_code' },
      });
      await first.handleEnvelope(request);
      expect(first.pending()).toHaveLength(1);
      await first.decide(dropId, 'allow_once');
      expect(executions).toBe(1);
      const restarted = make();
      await restarted.handleEnvelope(request);
      expect(restarted.pending()).toHaveLength(0);
      await restarted.decide(dropId, 'allow_once');
      expect(executions).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
