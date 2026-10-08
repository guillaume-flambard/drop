import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decodeInvite, generateIdentity, sealEnvelope, type Envelope } from '@drop/protocol';
import { startRelay } from '@drop/relay';
import { startDaemon, type Daemon } from '../src/daemon.ts';
import { NodeEngine } from '../src/engine.ts';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { MemoryStore } from './helpers.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('joining the relay by invitation (T2.1)', () => {
  it('a node the relay does not know pairs through an invite code and is admitted, with no allowlist edit', async () => {
    const vps = await generateIdentity('VPS');
    const julie = await generateIdentity('Julie');
    const relay = await startRelay({ port: 0, allowedNodeIds: [vps.nodeId] }, { logger: () => undefined });
    cleanups.push(() => relay.close());
    const daemon = async (identity: typeof vps): Promise<{ home: DropHome; daemon: Daemon }> => {
      const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'drop-home-')), 'home'));
      home.init(identity, NodeConfigSchema.parse({ relayUrl: relay.url, ownerKind: 'human', apiPort: 0 }));
      const started = await startDaemon(home, { apiPort: 0, notifications: false, log: () => undefined });
      cleanups.push(() => started.stop());
      return { home, daemon: started };
    };
    const owner = await daemon(vps);
    const newcomer = await daemon(julie);
    await owner.daemon.relay.waitReady();
    expect(newcomer.daemon.relay.connected).toBe(false);

    await newcomer.daemon.engine.pair(await owner.daemon.engine.invite(relay.url));
    await until(() => newcomer.daemon.engine.peers().some((peer) => peer.nodeId === vps.nodeId));
    expect(newcomer.daemon.relay.connected).toBe(true);
    expect(owner.daemon.engine.peers().some((peer) => peer.nodeId === julie.nodeId)).toBe(true);
    expect(existsSync(join(newcomer.home.root, 'admission.json'))).toBe(false);
  });

  it('the inviter ignores a pair request whose code expired, a day after it was issued', async () => {
    const julie = await generateIdentity('Julie');
    const natha = await generateIdentity('Natha');
    const clock = { now: Date.now() };
    const sent: Envelope[] = [];
    const inviter = new NodeEngine({
      identity: julie,
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      now: () => clock.now,
      transport: {
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve('delivered');
        },
      },
    });
    const invite = decodeInvite(await inviter.invite('ws://relay.example/v1'), clock.now);
    clock.now += 24 * 3_600_000 + 1;
    const request = await sealEnvelope(
      natha,
      julie.nodeId,
      { type: 'pair_request', oneTimeToken: invite.oneTimeToken, displayName: 'Natha', ownerKind: 'human' },
      { now: clock.now },
    );
    await inviter.handleEnvelope(request);
    expect(inviter.peers()).toEqual([]);
    expect(sent).toEqual([]);
  });
});
