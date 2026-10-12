import { connect, createServer, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity, type Identity } from '@drop/protocol';
import { RelayClient, startRelay, type RelayClientLogEntry } from '@drop/relay';
import { NodeEngine } from '../src/engine.ts';
import { MemoryStore, until } from './helpers.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * A TCP proxy in front of the relay. `freeze()` stops every open connection from carrying anything, in both
 * directions, without closing it: a half-open link such as a stuck proxy or a peer gone without a FIN. Connections
 * opened afterwards work.
 */
async function proxy(target: number) {
  const links: { client: Socket; upstream: Socket; closed: boolean }[] = [];
  const server = createServer((client) => {
    const upstream = connect(target, '127.0.0.1');
    const link = { client, upstream, closed: false };
    links.push(link);
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => {
      link.closed = true;
      upstream.destroy();
    });
    upstream.on('close', () => client.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('E_TEST_ADDRESS');
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const { client, upstream } of links) {
          client.destroy();
          upstream.destroy();
        }
        server.close(() => {
          resolve();
        });
      }),
  );
  return {
    url: `ws://127.0.0.1:${String(address.port)}/v1`,
    links,
    freeze: () => {
      for (const { client, upstream } of links) {
        client.unpipe(upstream);
        upstream.unpipe(client);
        // What the node sends is read and dropped, so that its FIN is seen when it gives the connection up.
        client.on('data', () => undefined);
        client.resume();
        upstream.pause();
      }
    },
  };
}

function node(identity: Identity, url: string, timings: Partial<ConstructorParameters<typeof RelayClient>[0]> = {}) {
  const link: { client?: RelayClient } = {};
  const engine = new NodeEngine({
    identity,
    ownerKind: 'human',
    store: new MemoryStore(),
    capabilities: [],
    transport: { send: (envelope) => (link.client ? link.client.send(envelope) : Promise.resolve('offline')) },
  });
  const statuses: string[] = [];
  const client = new RelayClient({
    identity,
    url,
    onEnvelope: (envelope) => {
      void engine.handleEnvelope(envelope).catch(() => undefined);
    },
    // As in the daemon: each new connection drains the outbox.
    onStatus: (status) => {
      statuses.push(status);
      if (status === 'connected') void engine.flushOutbox().catch(() => undefined);
    },
    minBackoffMs: 20,
    maxBackoffMs: 50,
    ...timings,
  });
  link.client = client;
  client.start();
  cleanups.push(() => {
    client.close();
  });
  return { engine, client, statuses };
}

describe('relay liveness (T3.1f)', () => {
  it('sends a pairing request again after the relay connection went half-open, and the pairing completes', async () => {
    const [julie, vps] = await Promise.all([generateIdentity('Julie'), generateIdentity('VPS')]);
    const relay = await startRelay(
      { port: 0, allowedNodeIds: [julie.nodeId, vps.nodeId] },
      { logger: () => undefined },
    );
    cleanups.push(() => relay.close());
    const front = await proxy(relay.port);
    const logs: RelayClientLogEntry[] = [];
    const requester = node(julie, front.url, {
      ackTimeoutMs: 300,
      pingIntervalMs: 200,
      connectTimeoutMs: 2_000,
      log: (entry) => logs.push(entry),
    });
    const executor = node(vps, relay.url);
    await Promise.all([requester.client.waitReady(), executor.client.waitReady()]);
    const code = await executor.engine.invite(relay.url);

    front.freeze();
    // The pairing request leaves on a connection that no longer carries anything: no acknowledgement ever comes.
    void requester.engine.pair(code).catch(() => undefined);

    await until(
      () =>
        requester.engine.peers().some((peer) => peer.nodeId === vps.nodeId) &&
        executor.engine.peers().some((peer) => peer.nodeId === julie.nodeId),
      5_000,
    );
    // Given up on the missing acknowledgement, or on the heartbeat if it fired first.
    expect(logs).toContainEqual(expect.objectContaining({ code: 'E_RELAY_TIMEOUT' }));
    expect(requester.statuses).toEqual(expect.arrayContaining(['connected', 'disconnected']));
    // The frozen connection was destroyed by the client, not left open.
    await until(() => front.links[0]?.closed === true, 2_000);
    expect(front.links.length).toBeGreaterThanOrEqual(2);
  }, 15_000);
});
