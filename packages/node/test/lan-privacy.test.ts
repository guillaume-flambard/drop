import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity, sealEnvelope } from '@drop/protocol';
import { NodeEngine } from '../src/engine.ts';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { LanService, type LanDiscovery } from '../src/lan.ts';
import { randomBytes } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { SeenAnnouncements } from '../src/lan-mdns.ts';
import { knockMac, LAN_EPOCH_MS, newLanKey } from '../src/lan-tags.ts';
import { MemoryStore, fakeCapability, startMesh, until, type Mesh } from './helpers.ts';

let mesh: Mesh | undefined;
const services: LanService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  await mesh?.close();
  mesh = undefined;
});

async function engineAt(clock: { now: number }, name: string, lanKey = newLanKey()) {
  const identity = await generateIdentity(name);
  const store = new MemoryStore();
  const engine = new NodeEngine({
    identity,
    lanKey,
    ownerKind: 'human',
    store,
    capabilities: [fakeCapability('service.status', 'low')],
    transport: { send: () => Promise.resolve('delivered') },
    now: () => clock.now,
  });
  return { identity, store, engine, lanKey };
}

describe('local network privacy (T4.2c)', () => {
  it('announces only a rotating tag that paired peers recognize, never the node id', async () => {
    const clock = { now: Date.UTC(2026, 9, 10, 9, 0) };
    const julie = await engineAt(clock, 'Julie');
    const natha = await engineAt(clock, 'Natha');
    const stranger = await engineAt(clock, 'Inconnu');
    natha.store.saveLanKey(julie.identity.nodeId, julie.lanKey);
    natha.store.savePeer({ nodeId: julie.identity.nodeId, displayName: 'Julie', ownerKind: 'human', pairedAt: '' });

    const first = julie.engine.lanAnnouncement();
    expect(JSON.stringify(first)).not.toContain(julie.identity.nodeId);
    expect(JSON.stringify(first)).not.toContain(julie.lanKey);
    expect(first.tag).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(natha.engine.lanRecognizes(julie.identity.nodeId, first)).toBe(true);
    expect(stranger.engine.lanRecognizes(julie.identity.nodeId, first)).toBe(false);

    clock.now += LAN_EPOCH_MS;
    const second = julie.engine.lanAnnouncement();
    expect(second.tag).not.toBe(first.tag);
    expect(natha.engine.lanRecognizes(julie.identity.nodeId, second)).toBe(true);
    // The previous period's tag is still accepted, to absorb rotation and clock drift; an older one is not.
    expect(natha.engine.lanRecognizes(julie.identity.nodeId, first)).toBe(true);
    clock.now += LAN_EPOCH_MS;
    expect(natha.engine.lanRecognizes(julie.identity.nodeId, first)).toBe(false);
    // Another node's key never recognizes Julie.
    natha.store.saveLanKey(stranger.identity.nodeId, stranger.lanKey);
    expect(natha.engine.lanRecognizes(stranger.identity.nodeId, julie.engine.lanAnnouncement())).toBe(false);

    // What a node remembers of the network: every match newest first, bounded, stale entries dropped.
    const table = new SeenAnnouncements(3);
    const at = Date.UTC(2026, 9, 10, 9, 0);
    const peer = (port: number) => ({ addresses: ['192.168.1.2'], port });
    table.add('old', first, peer(1), at);
    table.add('copy', { tag: 'x'.repeat(22), invites: [] }, peer(2), at);
    table.add('new', first, peer(3), at + 1000);
    expect(table.find((seen) => seen.tag === first.tag, at + 2000).map((item) => item.port)).toEqual([3, 1]);
    table.add('fourth', second, peer(4), at + 3000);
    expect(table.size()).toBe(3);
    expect(table.find((seen) => seen.tag === first.tag, at + 4000).map((item) => item.port)).toEqual([3]);
    expect(table.find(() => true, at + 3 * LAN_EPOCH_MS)).toEqual([]);
  });

  it('lets the invitee find the inviter through the invite only while it is live', async () => {
    const clock = { now: Date.UTC(2026, 9, 10, 9, 0) };
    const julie = await engineAt(clock, 'Julie');
    const natha = await engineAt(clock, 'Natha');
    const other = await engineAt(clock, 'Autre');
    expect(julie.engine.lanAnnouncement().invites).toEqual([]);
    const code = await julie.engine.invite('ws://127.0.0.1:1/v1');
    await natha.engine.pair(code);
    const during = julie.engine.lanAnnouncement();
    expect(during.invites).toHaveLength(1);
    expect(natha.engine.lanRecognizes(julie.identity.nodeId, during)).toBe(true);
    // Someone without the code cannot tell the inviter from anyone else.
    expect(other.engine.lanRecognizes(julie.identity.nodeId, during)).toBe(false);
    // Once the invite has expired, it is no longer announced.
    clock.now += 24 * 60 * 60 * 1000;
    const after = julie.engine.lanAnnouncement();
    expect(after.invites).toEqual([]);
    expect(natha.engine.lanRecognizes(julie.identity.nodeId, after)).toBe(false);
  });

  it('shares its discovery key with each paired peer and keeps it private on disk', async () => {
    const m = (mesh = await startMesh([fakeCapability('service.status', 'low')]));
    // startMesh pairs requester and approver with the executor: each side got the other's key.
    await until(
      () =>
        m.requester.engine.lanRecognizes(m.executor.identity.nodeId, m.executor.engine.lanAnnouncement()) &&
        m.executor.engine.lanRecognizes(m.requester.identity.nodeId, m.requester.engine.lanAnnouncement()),
    );
    expect(Object.keys(m.approver.store.lanKeyMap)).toEqual([m.executor.identity.nodeId]);
    // A node that is not a peer cannot plant a key, for itself or for someone else.
    const stranger = await generateIdentity('Inconnu');
    const before = { ...m.requester.store.lanKeyMap };
    const planted = await sealEnvelope(stranger, m.requester.identity.nodeId, { type: 'lan_key', key: newLanKey() });
    await m.requester.engine.handleEnvelope(planted);
    expect(m.requester.store.lanKeyMap).toEqual(before);
    // Announcing again at start reaches every peer.
    const ownKeys = { ...m.executor.store.lanKeyMap };
    m.executor.store.lanKeyMap = {};
    await m.requester.engine.announceLanKey();
    await until(() => m.executor.store.lanKeyMap[m.requester.identity.nodeId] === ownKeys[m.requester.identity.nodeId]);

    // On disk: this node's key and the peers' keys, owner-only, stable across reads.
    const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'lan-home-')), 'home'));
    home.init(
      await generateIdentity('Julie'),
      NodeConfigSchema.parse({ relayUrl: 'ws://127.0.0.1:1/v1', ownerKind: 'human' }),
    );
    const key = home.lanKey();
    expect(home.lanKey()).toBe(key);
    expect(statSync(join(home.root, 'lan-key')).mode & 0o777).toBe(0o600);
    home.saveLanKey('x'.repeat(43), newLanKey());
    expect(Object.keys(home.lanKeys())).toEqual(['x'.repeat(43)]);
    expect(statSync(join(home.root, 'lan-keys.json')).mode & 0o777).toBe(0o600);
  });

  it('recovers from a passing refusal with growing delays', async () => {
    const starts: number[] = [];
    const discovery: LanDiscovery = {
      start: (_self, onError) => {
        starts.push(Date.now());
        // The first two attempts are refused, as a Wi-Fi change or a passing multicast error would be.
        if (starts.length <= 2) onError?.('EHOSTUNREACH');
        return Promise.resolve();
      },
      find: () => [],
      stop: () => Promise.resolve(),
    };
    const identity = await generateIdentity('Julie');
    const logs: Record<string, unknown>[] = [];
    const service = new LanService({
      identity,
      discovery,
      canReach: () => true,
      canAccept: () => true,
      onEnvelope: () => undefined,
      announcement: () => ({ tag: 'a'.repeat(22), invites: [] }),
      recognizes: () => false,
      knockSecrets: () => [],
      secretFor: () => undefined,
      host: '127.0.0.1',
      retryDelaysMs: [40, 160, 640],
      log: (entry) => logs.push(entry),
    });
    services.push(service);
    await service.start();
    expect(service.state()).toBe('denied');
    await until(() => service.state() === 'on', 3000);
    expect(starts).toHaveLength(3);
    const [first = 0, second = 0, third = 0] = starts;
    expect(second - first).toBeGreaterThanOrEqual(35);
    expect(third - second).toBeGreaterThanOrEqual(150);
    expect(logs.filter((entry) => entry.event === 'lan_denied')).toHaveLength(2);
    expect(logs.filter((entry) => entry.event === 'lan_restored')).toHaveLength(1);

    // A refusal right after each start must not turn into a restart storm: delays keep growing.
    const flapping: number[] = [];
    const flappy = new LanService({
      identity,
      discovery: {
        start: (_self, onError) => {
          flapping.push(Date.now());
          setTimeout(() => onError?.('EHOSTUNREACH'), 5);
          return Promise.resolve();
        },
        find: () => [],
        stop: () => Promise.resolve(),
      },
      canReach: () => true,
      canAccept: () => true,
      onEnvelope: () => undefined,
      announcement: () => ({ tag: 'b'.repeat(22), invites: [] }),
      recognizes: () => false,
      knockSecrets: () => [],
      secretFor: () => undefined,
      host: '127.0.0.1',
      retryDelaysMs: [40, 160, 640],
    });
    services.push(flappy);
    await flappy.start();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(flapping.length).toBeLessThanOrEqual(3);

    // Stopped while a retry is pending: nothing starts afterwards.
    const late: number[] = [];
    const stopping = new LanService({
      identity,
      discovery: {
        start: (_self, onError) => {
          late.push(Date.now());
          onError?.('EHOSTUNREACH');
          return Promise.resolve();
        },
        find: () => [],
        stop: () => Promise.resolve(),
      },
      canReach: () => true,
      canAccept: () => true,
      onEnvelope: () => undefined,
      announcement: () => ({ tag: 'c'.repeat(22), invites: [] }),
      recognizes: () => false,
      knockSecrets: () => [],
      secretFor: () => undefined,
      host: '127.0.0.1',
      retryDelaysMs: [30],
    });
    await stopping.start();
    await stopping.stop();

    // Stopped while the discovery is still starting: the discovery is stopped again once it resolves.
    const opened = { start: 0, stop: 0 };
    const gate: { open?: () => void } = {};
    const slow = new LanService({
      identity,
      discovery: {
        start: () => {
          opened.start += 1;
          return new Promise<void>((resolve) => (gate.open = resolve));
        },
        find: () => [],
        stop: () => {
          opened.stop += 1;
          return Promise.resolve();
        },
      },
      canReach: () => true,
      canAccept: () => true,
      onEnvelope: () => undefined,
      announcement: () => ({ tag: 'f'.repeat(22), invites: [] }),
      recognizes: () => false,
      knockSecrets: () => [],
      secretFor: () => undefined,
      host: '127.0.0.1',
    });
    const starting = slow.start();
    await until(() => opened.start === 1);
    await slow.stop();
    const stopsBefore = opened.stop;
    gate.open?.();
    await starting;
    expect(opened.stop).toBe(stopsBefore + 1);
    expect(slow.state()).not.toBe('on');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(late).toHaveLength(1);
    expect(stopping.state()).toBe('off');
  });

  it('says nothing to a connection that cannot knock with a key it holds', async () => {
    const julie = await generateIdentity('Julie');
    const key = newLanKey();
    const service = new LanService({
      identity: julie,
      discovery: { start: () => Promise.resolve(), find: () => [], stop: () => Promise.resolve() },
      canReach: () => true,
      canAccept: () => true,
      onEnvelope: () => undefined,
      announcement: () => ({ tag: 'd'.repeat(22), invites: [] }),
      recognizes: () => false,
      knockSecrets: () => [key],
      secretFor: () => undefined,
      host: '127.0.0.1',
    });
    services.push(service);
    const port = await service.start();
    const listen = (frames: (nonce: string) => unknown[]) =>
      new Promise<string[]>((resolve) => {
        const received: string[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/`);
        const nonce = randomBytes(32).toString('base64url');
        ws.on('open', () => {
          for (const frame of frames(nonce)) ws.send(JSON.stringify(frame));
        });
        ws.on('message', (raw: Buffer) => received.push(raw.toString()));
        ws.on('close', (_code, reason) => {
          if (reason.length > 0) received.push(`close:${reason.toString()}`);
          resolve(received);
        });
        ws.on('error', () => {
          resolve(received);
        });
        setTimeout(() => {
          ws.terminate();
          resolve(received);
        }, 600);
      });
    // Silence, then a knock with the wrong secret, then a hello straight away: nothing comes back, not the id.
    for (const frames of [
      () => [],
      (nonce: string) => [{ t: 'knock', nonce, mac: knockMac(newLanKey(), nonce) }],
      (nonce: string) => [{ t: 'hello', id: 'x'.repeat(43), nonce }],
    ]) {
      const received = await listen(frames);
      expect(received).toEqual([]);
    }
    // With the right key, the answer proves the same secret and only then comes the hello.
    const answered = await listen((nonce) => [{ t: 'knock', nonce, mac: knockMac(key, nonce) }]);
    expect(answered.map((frame) => (JSON.parse(frame) as { t: string }).t)).toEqual(['knock_ok', 'hello']);
    expect(answered[1]).toContain(julie.nodeId);

    // The other way round: a node replaying Julie's tag at its own address cannot answer the knock, and Natha,
    // dialing it, never sends her hello.
    const natha = await generateIdentity('Natha');
    const fake = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => fake.once('listening', resolve));
    const heard: string[] = [];
    fake.on('connection', (ws) => {
      ws.on('message', (raw: Buffer) => {
        const frame = JSON.parse(raw.toString()) as { t: string };
        heard.push(frame.t);
        if (frame.t === 'knock') ws.send(JSON.stringify({ t: 'knock_ok', mac: 'z'.repeat(43) }));
      });
    });
    const fakeAddress = fake.address();
    const dialer = new LanService({
      identity: natha,
      discovery: {
        start: () => Promise.resolve(),
        find: () => [
          { addresses: ['127.0.0.1'], port: typeof fakeAddress === 'object' && fakeAddress ? fakeAddress.port : 0 },
        ],
        stop: () => Promise.resolve(),
      },
      canReach: () => true,
      canAccept: () => true,
      onEnvelope: () => undefined,
      announcement: () => ({ tag: 'e'.repeat(22), invites: [] }),
      recognizes: () => true,
      knockSecrets: () => [],
      secretFor: () => key,
      host: '127.0.0.1',
      allowLoopback: true,
    });
    services.push(dialer);
    await dialer.start();
    expect(
      await dialer.send({
        v: 1,
        id: '01923456-789a-7bcd-8ef0-123456789abc',
        from: natha.nodeId,
        to: julie.nodeId,
      } as never),
    ).toBe('unreachable');
    expect(heard).toEqual(['knock']);
    await new Promise<void>((resolve) => {
      for (const client of fake.clients) client.terminate();
      fake.close(() => {
        resolve();
      });
    });
  });
});
