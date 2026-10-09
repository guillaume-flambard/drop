import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateIdentity,
  openEnvelope,
  ReplayCache,
  sealEnvelope,
  uuidv7,
  type Envelope,
  type Message,
} from '@drop/protocol';
import { DropHome, MAX_RECEIVED_DROPS, REPLAY_LOCK_OWNER } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';
import { MAX_ACTIVE_EXECUTING_DROPS, NodeEngine, type EngineLogEntry } from '../src/engine.ts';
import { fakeCapability } from './helpers.ts';

const NOW = 1_791_460_000_000;

/** Fills received-drops with live UUIDv7 markers sharing the timestamp of `at`. */
function fillMarkers(root: string, at: number, count: number): void {
  const dir = join(root, 'received-drops');
  mkdirSync(dir, { recursive: true });
  const prefix = uuidv7(at).slice(0, 24);
  for (let index = 0; index < count; index += 1) {
    writeFileSync(join(dir, `${prefix}${(index + 1).toString(16).padStart(12, '0')}`), '');
  }
}

/** One owner node on a real DropHome, a paired requester, and every reply and log line captured. */
async function ownerNode(root: string, now = NOW) {
  const clock = { now };
  const owner = await generateIdentity('Owner');
  const requester = await generateIdentity('Requester');
  const other = await generateIdentity('Other');
  const home = new DropHome(root);
  home.init(owner, privateConfig('ws://127.0.0.1:7780/v1', 'human', 0));
  for (const peer of [requester, other]) {
    home.savePeer({
      nodeId: peer.nodeId,
      displayName: peer.displayName,
      ownerKind: 'human',
      pairedAt: new Date(now).toISOString(),
    });
  }
  home.publish({
    capabilityId: 'test.state',
    approverNodeIds: [owner.nodeId],
    config: {},
    publishedAt: new Date(now).toISOString(),
  });
  const replies: Envelope[] = [];
  const logs: EngineLogEntry[] = [];
  const transport = {
    fail: false,
    send: (envelope: Envelope): Promise<string> => {
      if (transport.fail) return Promise.reject(new Error('transport offline'));
      replies.push(envelope);
      return Promise.resolve('delivered');
    },
  };
  const engine = new NodeEngine({
    identity: owner,
    ownerKind: 'human',
    store: home,
    capabilities: [fakeCapability('test.state', 'low')],
    transport,
    log: (entry) => logs.push(entry),
    now: () => clock.now,
  });
  const send = async (dropId: string, sender = requester) =>
    engine.handleEnvelope(
      await sealEnvelope(
        sender,
        owner.nodeId,
        {
          type: 'drop_request',
          dropId,
          capabilityId: 'test.state',
          capabilityVersion: '1.0.0',
          input: { mode: 'ok' },
          purpose: 'Test replay',
          requestedBy: { nodeId: sender.nodeId, displayName: sender.displayName, agent: 'codex' },
        },
        { now: clock.now },
      ),
    );
  const lastReply = async (recipient = requester): Promise<Message> =>
    (
      await openEnvelope(recipient, replies.at(-1), {
        isKnownPeer: (id) => id === owner.nodeId,
        replay: new ReplayCache(),
        now: clock.now,
      })
    ).message;
  const errorsTo = async (recipient = requester): Promise<Message[]> => {
    const messages: Message[] = [];
    for (const envelope of replies.filter((candidate) => candidate.to === recipient.nodeId)) {
      const { message } = await openEnvelope(recipient, envelope, {
        isKnownPeer: (id) => id === owner.nodeId,
        replay: new ReplayCache(),
        now: clock.now,
      });
      if (message.type === 'drop_error') messages.push(message);
    }
    return messages;
  };
  return { home, engine, replies, logs, send, lastReply, errorsTo, requester, other, clock, transport };
}

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  return child.pid;
}

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
      expect(readdirSync(root)).not.toContain('received-drops');
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
      expect(readdirSync(dir)).toHaveLength(MAX_RECEIVED_DROPS);
      const later = NOW + 31 * 60_000;
      expect(home.claimDrop(uuidv7(later), later)).toBe('claimed');
      expect(readdirSync(dir)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('deletes legacy nil and max UUID markers instead of blocking admission', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-nil-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      const legacy = ['00000000-0000-0000-0000-000000000000', 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'];
      for (const name of legacy) writeFileSync(join(root, 'received-drops', name), '');
      expect(home.claimDrop(uuidv7(NOW + 1), NOW + 1)).toBe('claimed');
      for (const name of legacy) expect(readdirSync(join(root, 'received-drops'))).not.toContain(name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed if the durable replay clock disappears after migration and pruning', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-missing-clock-'));
    try {
      const home = new DropHome(root);
      const dropId = uuidv7(NOW);
      expect(home.claimDrop(dropId, NOW)).toBe('claimed');
      const later = NOW + 31 * 60_000;
      expect(home.claimDrop(uuidv7(later), later)).toBe('claimed');
      expect(readdirSync(join(root, 'received-drops'))).not.toContain(dropId);
      unlinkSync(join(root, 'received-drops-clock'));
      expect(() => home.claimDrop(dropId, NOW)).toThrow('E_REPLAY_STATE missing clock');
      expect(readdirSync(join(root, 'received-drops'))).not.toContain(dropId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed if the marker directory disappears after a durable claim', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-missing-markers-'));
    try {
      const home = new DropHome(root);
      const dropId = uuidv7(NOW);
      expect(home.claimDrop(dropId, NOW)).toBe('claimed');
      rmSync(join(root, 'received-drops'), { recursive: true });
      expect(() => new DropHome(root).claimDrop(dropId, NOW)).toThrow('E_REPLAY_STATE missing markers');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignores operating system and foreign entries in the marker directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-foreign-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      const dir = join(root, 'received-drops');
      writeFileSync(join(dir, '.DS_Store'), '');
      writeFileSync(join(dir, '._backup'), '');
      mkdirSync(join(dir, 'Archive'));
      expect(home.claimDrop(uuidv7(NOW + 1), NOW + 1)).toBe('claimed');
      expect(readdirSync(dir)).toEqual(expect.arrayContaining(['.DS_Store', '._backup', 'Archive']));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still fails closed on a marker-shaped entry that is not a file', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-marker-dir-'));
    try {
      const home = new DropHome(root);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      mkdirSync(join(root, 'received-drops', uuidv7(NOW)));
      expect(() => home.claimDrop(uuidv7(NOW + 1), NOW + 1)).toThrow('E_REPLAY_STATE');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reclaims only its own replay lock and refuses an old foreign lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-stale-lock-'));
    try {
      const home = new DropHome(root);
      const lock = join(root, 'received-drops.lock');
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, 'owner'), REPLAY_LOCK_OWNER);
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
      expect(readdirSync(root)).not.toContain('received-drops.lock');
      // Age and PID cannot prove an owner is dead across slow disks or container PID namespaces.
      for (const [index, owner] of [`${String(deadPid())} 00\n`, ''].entries()) {
        mkdirSync(lock, { mode: 0o700 });
        writeFileSync(join(lock, 'owner'), owner);
        expect(() => home.claimDrop(uuidv7(NOW + index + 1), NOW + index + 1)).toThrow('E_REPLAY_STATE claim locked');
        const old = new Date(Date.now() - 5 * 60_000);
        utimesSync(lock, old, old);
        expect(() => home.claimDrop(uuidv7(NOW + index + 1), NOW + index + 1)).toThrow('E_REPLAY_STATE claim locked');
        expect(readdirSync(lock)).toEqual(['owner']);
        rmSync(lock, { recursive: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never takes over a foreign replay lock even when its takeover sentinel is old', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-takeover-'));
    try {
      const home = new DropHome(root);
      const lock = join(root, 'received-drops.lock');
      mkdirSync(lock, { mode: 0o700 });
      const old = new Date(Date.now() - 5 * 60_000);
      utimesSync(lock, old, old);
      mkdirSync(`${lock}.takeover`, { mode: 0o700 });
      expect(() => home.claimDrop(uuidv7(NOW), NOW)).toThrow('E_REPLAY_STATE claim locked');
      expect(readdirSync(root)).toContain('received-drops.lock');
      utimesSync(`${lock}.takeover`, old, old);
      expect(() => home.claimDrop(uuidv7(NOW), NOW)).toThrow('E_REPLAY_STATE claim locked');
      expect(readdirSync(root)).toContain('received-drops.lock');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps a replay lock owned by another live process', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-live-lock-'));
    try {
      const home = new DropHome(root);
      const lock = join(root, 'received-drops.lock');
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, 'owner'), `${String(process.ppid)}\n`);
      expect(() => home.claimDrop(uuidv7(NOW), NOW)).toThrow('E_REPLAY_STATE claim locked');
      expect(readdirSync(lock)).toEqual(['owner']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires manual removal of an ownerless replay lock before admission resumes', () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-ownerless-lock-'));
    try {
      const home = new DropHome(root);
      const lock = join(root, 'received-drops.lock');
      mkdirSync(lock, { mode: 0o700 });
      expect(() => home.claimDrop(uuidv7(NOW), NOW)).toThrow('E_REPLAY_STATE claim locked');
      const old = new Date(Date.now() - 5 * 60_000);
      utimesSync(lock, old, old);
      expect(() => home.claimDrop(uuidv7(NOW), NOW)).toThrow('E_REPLAY_STATE claim locked');
      rmSync(lock, { recursive: true });
      expect(home.claimDrop(uuidv7(NOW), NOW)).toBe('claimed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('replay admission through the engine', () => {
  it('reports a full replay store as E_RATE before consent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-full-'));
    try {
      const node = await ownerNode(root);
      fillMarkers(root, NOW, MAX_RECEIVED_DROPS);
      await node.send(uuidv7(NOW));
      expect(node.engine.pending()).toHaveLength(0);
      expect(readdirSync(join(root, 'received-drops'))).toHaveLength(MAX_RECEIVED_DROPS);
      expect(await node.lastReply()).toMatchObject({ type: 'drop_error', code: 'E_RATE' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('refuses a request after clock rollback with E_EXPIRED and logs that the replay clock is ahead', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-rollback-'));
    try {
      const node = await ownerNode(root);
      const ahead = NOW + 31 * 60_000;
      expect(node.home.claimDrop(uuidv7(ahead), ahead)).toBe('claimed');
      await node.send(uuidv7(NOW));
      expect(node.engine.pending()).toHaveLength(0);
      expect(await node.lastReply()).toMatchObject({ type: 'drop_error', code: 'E_EXPIRED' });
      expect(node.logs).toContainEqual(
        expect.objectContaining({ event: 'drop_rejected', code: 'E_EXPIRED', reason: 'replay_clock_ahead' }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('logs the replay store failure cause without a path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-cause-'));
    try {
      const node = await ownerNode(root);
      mkdirSync(join(root, 'received-drops'));
      writeFileSync(join(root, 'received-drops-clock'), 'corrupt');
      await node.send(uuidv7(NOW));
      expect(node.logs).toContainEqual(
        expect.objectContaining({ event: 'drop_rejected', code: 'E_REPLAY_STATE', reason: 'corrupt clock' }),
      );
      expect(JSON.stringify(node.logs)).not.toContain(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('answers a duplicate of an active request with its current state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-active-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW);
      await node.send(dropId);
      expect(node.engine.pending()).toHaveLength(1);
      const before = node.replies.length;
      await node.send(dropId);
      expect(node.replies.length).toBeGreaterThan(before);
      expect(await node.lastReply()).toEqual({ type: 'drop_status', dropId, state: 'awaiting_approval' });
      expect(node.engine.pending()).toHaveLength(1);
      // The active check runs before capability lookup: unpublishing must not turn a duplicate into a failure.
      node.home.unpublish('test.state');
      await node.send(dropId);
      expect(await node.lastReply()).toEqual({ type: 'drop_status', dropId, state: 'awaiting_approval' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses another peer reusing an active drop id without revealing its state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-other-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW);
      await node.send(dropId);
      await node.send(dropId, node.other);
      expect(await node.lastReply(node.other)).toMatchObject({ type: 'drop_error', dropId, code: 'E_DENIED' });
      expect(node.engine.pending()).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('answers a duplicate of a finished request with its recorded outcome', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-finished-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW);
      await node.send(dropId);
      expect(await node.engine.decide(dropId, 'not_now')).toBe(true);
      const [outcome] = await node.errorsTo();
      expect(outcome).toMatchObject({ type: 'drop_error', dropId, code: 'E_NOT_NOW' });
      await node.send(dropId);
      expect(await node.errorsTo()).toEqual([outcome, outcome]);
      expect(node.engine.memoryStats().executing).toBe(0);
      expect(node.engine.memoryStats().completedErrors).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('expires a finished-error summary within 30 minutes even for a future UUIDv7', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-future-summary-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW + 5 * 60_000);
      await node.send(dropId);
      expect(await node.engine.decide(dropId, 'not_now')).toBe(true);
      expect(node.engine.memoryStats().completedErrors).toBe(1);
      node.clock.now = NOW + 30 * 60_000 + 1;
      await node.engine.tick();
      expect(node.engine.memoryStats().completedErrors).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('frees a delivered request without reopening its durable replay marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-delivered-memory-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW);
      await node.send(dropId);
      expect(await node.engine.decide(dropId, 'allow_once')).toBe(true);
      expect(node.engine.memoryStats().executing).toBe(0);
      await node.send(dropId);
      expect(node.engine.pending()).toHaveLength(0);
      expect(await node.lastReply()).toMatchObject({ type: 'drop_error', dropId, code: 'E_DENIED' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('frees an expired approval without reopening its durable replay marker', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-expired-memory-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW);
      await node.send(dropId);
      node.clock.now += 11 * 60_000;
      await node.engine.tick();
      expect(node.engine.memoryStats().executing).toBe(0);
      expect(node.engine.pending()).toHaveLength(0);
      await node.send(dropId);
      expect(await node.lastReply()).toMatchObject({ type: 'drop_error', dropId, code: 'E_EXPIRED' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not strand an approved request when transport throws on status', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-transport-'));
    try {
      const node = await ownerNode(root);
      const dropId = uuidv7(NOW);
      await node.send(dropId);
      node.transport.fail = true;
      expect(await node.engine.decide(dropId, 'allow_once')).toBe(true);
      expect(node.engine.memoryStats().executing).toBe(0);
      expect(node.engine.memoryStats().outbox).toBeGreaterThan(0);
      expect(node.logs).toContainEqual(expect.objectContaining({ code: 'E_RUNNER', reason: 'transport_exception' }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses another request before consent when active execution memory is full', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-engine-active-cap-'));
    try {
      const node = await ownerNode(root);
      for (let index = 0; index < MAX_ACTIVE_EXECUTING_DROPS; index += 1) await node.send(uuidv7(NOW + index));
      expect(node.engine.memoryStats().executing).toBe(MAX_ACTIVE_EXECUTING_DROPS);
      const extra = uuidv7(NOW + MAX_ACTIVE_EXECUTING_DROPS);
      await node.send(extra);
      expect(node.engine.pending()).toHaveLength(MAX_ACTIVE_EXECUTING_DROPS);
      expect(await node.lastReply()).toMatchObject({ type: 'drop_error', dropId: extra, code: 'E_RATE' });
      expect(node.engine.memoryStats().executing).toBe(MAX_ACTIVE_EXECUTING_DROPS);
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
