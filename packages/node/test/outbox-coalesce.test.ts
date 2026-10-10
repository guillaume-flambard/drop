import { describe, expect, it } from 'vitest';
import { generateIdentity, type Envelope, type Identity } from '@drop/protocol';
import { NodeEngine } from '../src/engine.ts';
import { MemoryStore, until } from './helpers.ts';

async function pairOfEngines(send: (envelope: Envelope) => Promise<string>) {
  const stores: MemoryStore[] = [];
  const [julie, natha] = await Promise.all([generateIdentity('Julie'), generateIdentity('Natha')]);
  const make = (identity: Identity, other: Identity, transport: (envelope: Envelope) => Promise<string>) => {
    const store = new MemoryStore();
    stores.push(store);
    store.savePeer({
      nodeId: other.nodeId,
      displayName: other.displayName,
      ownerKind: 'human',
      pairedAt: new Date().toISOString(),
    });
    return new NodeEngine({ identity, ownerKind: 'human', store, capabilities: [], transport: { send: transport } });
  };
  const sentByNatha: Envelope[] = [];
  const natha_ = make(natha, julie, (envelope) => {
    sentByNatha.push(envelope);
    return Promise.resolve('delivered');
  });
  const julie_ = make(julie, natha, send);
  return { julie, natha, julieEngine: julie_, nathaEngine: natha_, sentByNatha, julieStore: stores[1] };
}

const address = (index: number) => ({ direct: [`192.168.1.${String((index % 250) + 1)}:${String(40000 + index)}`] });

describe('outbox coalescing (T4.2e)', () => {
  it('keeps one state message per peer and type, so announcements never evict a real request', async () => {
    const link: { online: boolean; deliver?: (envelope: Envelope) => Promise<void> } = { online: false };
    const { julieEngine, nathaEngine, julie, natha, sentByNatha, julieStore } = await pairOfEngines(
      async (envelope) => {
        if (!link.online) return 'offline';
        await link.deliver?.(envelope);
        return 'delivered';
      },
    );
    link.deliver = (envelope) =>
      envelope.to === natha.nodeId ? nathaEngine.handleEnvelope(envelope) : Promise.resolve();

    // Marc is away too: state messages are kept per peer, one each.
    const marc = await generateIdentity('Marc');
    julieStore?.savePeer({
      nodeId: marc.nodeId,
      displayName: 'Marc',
      ownerKind: 'human',
      pairedAt: new Date().toISOString(),
    });
    // A real request waits for each peer, then a roaming Mac announces 1,500 addresses and its key a few times.
    await julieEngine.refreshCatalogs();
    for (let index = 0; index < 1500; index++) await julieEngine.setIrohAddress(address(index));
    for (let index = 0; index < 5; index++) await julieEngine.announceLanKey();
    // Three catalog requests (Natha, Marc, Julie's own node), then one address and one key per peer.
    expect(julieEngine.memoryStats().outbox).toBe(7);

    link.online = true;
    await julieEngine.flushOutbox();
    expect(julieEngine.memoryStats().outbox).toBe(0);
    // Natha answered the catalog request, and knows Julie's last address only.
    await until(() => sentByNatha.some((envelope) => envelope.to === julie.nodeId));
    expect(nathaEngine.irohAddressOf(julie.nodeId)).toEqual(address(1499));
  }, 30_000);

  it('never lets an older state message, re-queued after a failed send, replace a newer one', async () => {
    const gate: { release?: (outcome: string) => void } = {};
    const delivered: Envelope[] = [];
    const mode = { value: 'offline' as 'offline' | 'hold' | 'online' };
    const { julieEngine, nathaEngine, julie } = await pairOfEngines((envelope) => {
      if (mode.value === 'hold')
        return new Promise<string>((resolve) => {
          gate.release = resolve;
        });
      if (mode.value === 'online') {
        delivered.push(envelope);
        return nathaEngine.handleEnvelope(envelope).then(() => 'delivered');
      }
      return Promise.resolve('offline');
    });
    await julieEngine.setIrohAddress(address(1));
    expect(julieEngine.memoryStats().outbox).toBe(1);

    // The flush takes address 1 in flight; meanwhile address 2 is queued; then the first send fails.
    mode.value = 'hold';
    const flushing = julieEngine.flushOutbox();
    await until(() => gate.release !== undefined);
    mode.value = 'offline';
    await julieEngine.setIrohAddress(address(2));
    gate.release?.('offline');
    await flushing;
    expect(julieEngine.memoryStats().outbox).toBe(1);

    mode.value = 'online';
    await julieEngine.flushOutbox();
    expect(delivered).toHaveLength(1);
    expect(nathaEngine.irohAddressOf(julie.nodeId)).toEqual(address(2));
  });

  it('never lets an older queued state message overwrite a newer one already delivered live', async () => {
    const mode = { online: false };
    const holder: { natha?: NodeEngine } = {};
    const { julieEngine, nathaEngine, julie } = await pairOfEngines(async (envelope) => {
      if (!mode.online) return 'offline';
      await holder.natha?.handleEnvelope(envelope);
      return 'delivered';
    });
    holder.natha = nathaEngine;
    await julieEngine.setIrohAddress(address(1));
    mode.online = true;
    // Address 2 goes out live; the queued address 1 is now stale and must never be sent after it.
    await julieEngine.setIrohAddress(address(2));
    await julieEngine.flushOutbox();
    expect(julieEngine.memoryStats().outbox).toBe(0);
    expect(nathaEngine.irohAddressOf(julie.nodeId)).toEqual(address(2));
  });

  it('stops announcing an address once a newer one is being announced', async () => {
    const names = ['Julie', 'Natha', 'Marc'] as const;
    const ids = await Promise.all(names.map((name) => generateIdentity(name)));
    const [julie, natha, marc] = ids as [Identity, Identity, Identity];
    const stores = names.map(() => new MemoryStore());
    for (const [index, store] of stores.entries())
      for (const other of ids)
        if (other !== ids[index])
          store.savePeer({
            nodeId: other.nodeId,
            displayName: other.displayName,
            ownerKind: 'human',
            pairedAt: new Date().toISOString(),
          });
    const engines = new Map<string, NodeEngine>();
    const gate: { release?: (outcome: string) => void } = {};
    const mode = { value: 'hold-first' as 'hold-first' | 'offline' | 'online' };
    const julieEngine = new NodeEngine({
      identity: julie,
      ownerKind: 'human',
      store: stores[0] ?? new MemoryStore(),
      capabilities: [],
      transport: {
        send: async (envelope) => {
          if (mode.value === 'hold-first') {
            mode.value = 'offline';
            return new Promise<string>((resolve) => {
              gate.release = resolve;
            });
          }
          if (mode.value === 'offline') return 'offline';
          await engines.get(envelope.to)?.handleEnvelope(envelope);
          return 'delivered';
        },
      },
    });
    for (const [index, identity] of [natha, marc].entries())
      engines.set(
        identity.nodeId,
        new NodeEngine({
          identity,
          ownerKind: 'human',
          store: stores[index + 1] ?? new MemoryStore(),
          capabilities: [],
          transport: { send: () => Promise.resolve('delivered') },
        }),
      );
    // Announcing address 1 stalls on its first peer; address 2 is announced meanwhile, then the stall fails.
    const first = julieEngine.setIrohAddress(address(1));
    await until(() => gate.release !== undefined);
    await julieEngine.setIrohAddress(address(2));
    gate.release?.('offline');
    await first;
    mode.value = 'online';
    await julieEngine.flushOutbox();
    for (const peer of [natha, marc]) expect(stores[ids.indexOf(peer)]?.irohAddrMap[julie.nodeId]).toEqual(address(2));
  });
});
