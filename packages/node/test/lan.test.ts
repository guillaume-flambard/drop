import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { generateIdentity, signDetached, type Identity } from '@drop/protocol';
import { NodeEngine, type Transport } from '../src/engine.ts';
import { LanService, memoryDiscovery, privateAddresses, type LanDiscovery, type LanOptions } from '../src/lan.ts';
import { knockAnswerMac, knockMac } from '../src/lan-tags.ts';
import { MemoryStore, fakeCapability, until } from './helpers.ts';

const services: LanService[] = [];
const servers: WebSocketServer[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => {
      for (const client of server.clients) client.terminate();
      server.close(() => {
        resolve();
      });
    });
});

function lanFor(
  identity: Identity,
  discovery: LanDiscovery,
  rules: { canReach?: (nodeId: string) => boolean; canAccept?: (nodeId: string) => boolean } = {},
  extra: Partial<LanOptions> = {},
): LanService {
  const service = new LanService({
    identity,
    discovery,
    canReach: rules.canReach ?? (() => true),
    canAccept: rules.canAccept ?? (() => true),
    onEnvelope: () => undefined,
    // A plain scheme for these session tests: the tag is the node id. Rotating tags are tested in T4.2c below.
    announcement: () => ({ tag: identity.nodeId, invites: [] }),
    recognizes: (nodeId, seen) => seen.tag === nodeId,
    knockSecrets: () => [identity.nodeId],
    secretFor: (nodeId) => nodeId,
    host: '127.0.0.1',
    allowLoopback: true,
    ...extra,
  });
  services.push(service);
  return service;
}

/** A raw client that announces `claimed` and signs its proof with `signer`; resolves with the close reason. */
function rawSession(
  port: number,
  claimed: Identity,
  signer: Identity,
  serverId: string,
  frames: unknown[] = [],
): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/`);
    const knock = randomBytes(32).toString('base64url');
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'knock', nonce: knock, mac: knockMac(serverId, knock) }));
    });
    ws.on('message', (raw: Buffer) => {
      const frame = JSON.parse(raw.toString()) as { t: string; nonce?: string };
      if (frame.t === 'knock_ok') {
        ws.send(JSON.stringify({ t: 'hello', id: claimed.nodeId, nonce: randomBytes(32).toString('base64url') }));
        return;
      }
      if (frame.t !== 'hello' || !frame.nonce) return;
      signDetached(signer, `drop-lan-v1|${frame.nonce}|${claimed.nodeId}|${serverId}`).then(
        (sig) => {
          ws.send(JSON.stringify({ t: 'proof', sig }));
          for (const extra of frames) ws.send(JSON.stringify(extra));
        },
        () => undefined,
      );
    });
    ws.on('close', (_code, reason) => {
      resolve(reason.toString());
    });
  });
}

const envelopeTo = (from: Identity, to: Identity) =>
  ({ v: 1, id: randomUUID(), from: from.nodeId, to: to.nodeId }) as never;

describe('local network (T4.2)', () => {
  it('keeps only private addresses from discovery, loopback only when allowed', () => {
    const announced = ['8.8.8.8', '192.168.1.5', '10.0.0.2', '172.20.1.1', '172.32.0.1', 'fe80::1', 'fd12::1', '::1'];
    expect(privateAddresses([...announced, '127.0.0.1'])).toEqual(['192.168.1.5', '10.0.0.2', '172.20.1.1', 'fd12::1']);
    expect(privateAddresses(['127.0.0.1', '::1', '8.8.8.8'], { loopback: true })).toEqual(['127.0.0.1', '::1']);
  });

  it('refuses a peer whose proof does not match the announced or expected key', async () => {
    const owner = await generateIdentity('Julie');
    const impostor = await generateIdentity('Mallory');
    const victim = await generateIdentity('Natha');
    const discovery = memoryDiscovery();
    const service = lanFor(owner, discovery.for(owner.nodeId));
    const port = await service.start();

    // Mallory announces Natha's id but can only sign with her own key; she waits for the verdict before sending.
    expect(await rawSession(port, victim, impostor, owner.nodeId)).toBe('E_LAN_IDENTITY');
    // The same exchange signed with the right key goes through: the refusal above comes from the signature alone.
    const honest = new Promise<string>((resolve) => {
      rawSession(port, victim, victim, owner.nodeId).then(resolve, () => undefined);
      setTimeout(() => {
        resolve('open');
      }, 500);
    });
    expect(await honest).toBe('open');

    // An outbound session to Julie's id that reaches someone else is refused too.
    const other = await generateIdentity('Autre');
    const otherPort = await lanFor(other, discovery.for(other.nodeId)).start();
    // Someone else answers to Julie's announcement: it replaces her entry on the board.
    discovery.announce(owner.nodeId, { tag: owner.nodeId, invites: [] }, ['127.0.0.1'], otherPort);
    const dialer = lanFor(victim, discovery.for(victim.nodeId));
    await dialer.start();
    expect(await dialer.send(envelopeTo(victim, owner))).toBe('unreachable');
  });

  it('refuses an unknown key when no invite is live', async () => {
    const owner = await generateIdentity('Julie');
    const stranger = await generateIdentity('Inconnu');
    const received: unknown[] = [];
    const service = lanFor(
      owner,
      memoryDiscovery().for(owner.nodeId),
      { canAccept: () => false },
      { onEnvelope: (envelope) => received.push(envelope) },
    );
    const port = await service.start();
    const reason = await rawSession(port, stranger, stranger, owner.nodeId, [
      { t: 'env', envelope: { id: randomUUID() } },
    ]);
    expect(reason).toBe('E_LAN_UNKNOWN');
    expect(received).toEqual([]);
  });

  it('survives malformed, oversized and early frames, and dead addresses', async () => {
    const owner = await generateIdentity('Julie');
    const asker = await generateIdentity('Natha');
    const discovery = memoryDiscovery();
    const received: unknown[] = [];
    const port = await lanFor(owner, discovery.for(owner.nodeId), {}, { onEnvelope: (e) => received.push(e) }).start();

    // Oversized frame: ws emits an error on the socket, which must close it and leave the node running.
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/`);
      ws.on('open', () => {
        ws.send(Buffer.alloc(600 * 1024, 120));
      });
      ws.on('error', () => undefined);
      ws.on('close', () => {
        resolve();
      });
    });
    // Not JSON.
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${String(port)}/`);
      ws.on('open', () => {
        ws.send('{not json');
      });
      ws.on('close', () => {
        resolve();
      });
    });
    // An envelope sent right after the proof, before the owner finished checking it, is held and then delivered.
    const early = { id: randomUUID() };
    rawSession(port, asker, asker, owner.nodeId, [{ t: 'env', envelope: early }]).catch(() => undefined);
    await until(() => received.length === 1, 5_000);
    expect(received).toEqual([early]);

    // A peer announced on a port where nothing listens: unreachable, no crash, no unhandled rejection.
    const ghost = await generateIdentity('Fantôme');
    discovery.announce(`hand:${ghost.nodeId}`, { tag: ghost.nodeId, invites: [] }, ['127.0.0.1'], 1);
    const dialer = lanFor(asker, discovery.for(asker.nodeId));
    await dialer.start();
    expect(await dialer.send(envelopeTo(asker, ghost))).toBe('unreachable');
  });

  it('counts an envelope as delivered only after the peer signed its acknowledgement', async () => {
    const asker = await generateIdentity('Natha');
    const owner = await generateIdentity('Julie');
    // A peer that proves Julie's key but acknowledges with a signature that is not hers.
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    server.on('connection', (ws) => {
      ws.on('message', (raw: Buffer) => {
        const frame = JSON.parse(raw.toString()) as { t: string; nonce?: string; envelope?: { id: string } };
        if (frame.t === 'knock' && frame.nonce) {
          ws.send(JSON.stringify({ t: 'knock_ok', mac: knockAnswerMac(owner.nodeId, frame.nonce) }));
          ws.send(JSON.stringify({ t: 'hello', id: owner.nodeId, nonce: randomBytes(32).toString('base64url') }));
          return;
        }
        if (frame.t === 'hello' && frame.nonce)
          signDetached(owner, `drop-lan-v1|${frame.nonce}|${owner.nodeId}|${asker.nodeId}`).then(
            (sig) => {
              ws.send(JSON.stringify({ t: 'proof', sig }));
            },
            () => undefined,
          );
        if (frame.t === 'env' && frame.envelope)
          signDetached(asker, `drop-lan-ack-v1|${frame.envelope.id}|${owner.nodeId}|${asker.nodeId}`).then(
            (sig) => {
              ws.send(JSON.stringify({ t: 'ack', id: frame.envelope?.id, sig }));
            },
            () => undefined,
          );
      });
    });
    const address = server.address();
    const discovery = memoryDiscovery();
    discovery.announce(
      `hand:${owner.nodeId}`,
      { tag: owner.nodeId, invites: [] },
      ['127.0.0.1'],
      typeof address === 'object' && address ? address.port : 0,
    );
    const dialer = lanFor(asker, discovery.for(asker.nodeId), {}, { ackMs: 1_000 });
    await dialer.start();
    expect(await dialer.send(envelopeTo(asker, owner))).toBe('unreachable');

    // With the real peer, the acknowledgement verifies and the envelope counts as delivered.
    const realPort = await lanFor(owner, discovery.for(owner.nodeId)).start();
    discovery.announce(`hand:${owner.nodeId}`, { tag: owner.nodeId, invites: [] }, ['127.0.0.1'], realPort);
    const fresh = lanFor(asker, discovery.for(asker.nodeId));
    await fresh.start();
    expect(await fresh.send(envelopeTo(asker, owner))).toBe('delivered');
  });

  it('completes a consented drop between two paired nodes with no relay at all', async () => {
    const discovery = memoryDiscovery();
    const make = async (name: string) => {
      const identity = await generateIdentity(name);
      const store = new MemoryStore();
      const link: { lan?: LanService } = {};
      const transport: Transport = {
        send: (envelope) =>
          link.lan
            ? link.lan.send(envelope).then((outcome) => (outcome === 'delivered' ? 'delivered' : 'offline'))
            : Promise.resolve('offline'),
      };
      const engine = new NodeEngine({
        identity,
        ownerKind: 'human',
        store,
        capabilities: [fakeCapability('service.status', 'low')],
        transport,
      });
      link.lan = lanFor(
        identity,
        discovery.for(identity.nodeId),
        {
          canReach: (nodeId) => engine.canReachDirectly(nodeId),
          canAccept: (nodeId) => engine.canAcceptDirectly(nodeId),
        },
        {
          onEnvelope: (envelope) => {
            void engine.handleEnvelope(envelope).catch(() => undefined);
          },
          // The real announcement: rotating tags, recognized from the invite, then from the shared key.
          announcement: () => engine.lanAnnouncement(),
          recognizes: (nodeId, seen) => engine.lanRecognizes(nodeId, seen),
          knockSecrets: () => engine.lanKnockSecrets(),
          secretFor: (nodeId) => engine.lanSecretFor(nodeId),
        },
      );
      await link.lan.start();
      return { identity, store, engine };
    };
    const owner = await make('Julie');
    const asker = await make('Natha');
    owner.store.publishedList.push({
      capabilityId: 'service.status',
      approverNodeIds: [owner.identity.nodeId],
      config: {},
      publishedAt: new Date().toISOString(),
    });

    await asker.engine.pair(await owner.engine.invite('ws://127.0.0.1:1/v1'));
    await until(() => asker.engine.peers().length === 1 && owner.engine.peers().length === 1, 10_000);
    await asker.engine.refreshCatalogs();
    await until(() => asker.engine.catalog().length === 1, 10_000);

    const drop = await asker.engine.requestDrop({
      capabilityId: 'service.status',
      input: { mode: 'ok' },
      purpose: 'Essai sans relais',
      agent: 'other',
    });
    await until(() => owner.engine.pending().length === 1, 10_000);
    expect(await owner.engine.decide(drop.dropId, 'allow_once')).toBe(true);
    await until(() => ['delivered', 'receipted'].includes(asker.engine.drop(drop.dropId)?.state ?? ''), 10_000);
    expect(asker.engine.drop(drop.dropId)?.result?.output).toEqual({ status: 'ok', detail: 'tout va bien' });
  }, 30_000);

  it('neither listens nor announces when the local mode is off', async () => {
    const identity = await generateIdentity('Hors ligne');
    const discovery = memoryDiscovery();
    const service = lanFor(identity, discovery.for(identity.nodeId), {}, { enabled: false });
    expect(await service.start()).toBe(0);
    expect(discovery.seen()).toEqual([]);
    expect(service.state()).toBe('off');
  });

  it('reports E_LAN_DENIED and keeps going when the local port cannot be opened', async () => {
    const first = await generateIdentity('Premier');
    const port = await lanFor(first, memoryDiscovery().for(first.nodeId)).start();
    const second = await generateIdentity('Second');
    const logs: Record<string, unknown>[] = [];
    const blocked = lanFor(
      second,
      memoryDiscovery().for(second.nodeId),
      {},
      { port, log: (entry) => logs.push(entry) },
    );
    expect(await blocked.start()).toBe(0);
    expect(blocked.state()).toBe('denied');
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_LAN_DENIED' }));
    expect(await blocked.send(envelopeTo(second, first))).toBe('unreachable');
  });
});
