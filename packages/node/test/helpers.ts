import type { StoredFact } from '../src/facts.ts';
import { z } from 'zod';
import { generateIdentity, verifyReceipt, type Identity, type IrohAddr, type Receipt } from '@drop/protocol';
import { RelayClient, startRelay, type RelayHandle } from '@drop/relay';
import type { CapabilityImpl } from '@drop/runner';
import { NodeEngine, type EngineOptions, type NodeStore, type Transport } from '../src/engine.ts';
import type { AgentLink, Peer, Published, TeamState } from '../src/home.ts';

export class MemoryStore implements NodeStore {
  readonly peerList: Peer[] = [];
  readonly publishedList: Published[] = [];
  readonly receiptList: Receipt[] = [];
  teamState: TeamState | undefined;
  linkList: AgentLink[] = [];
  factList: StoredFact[] = [];
  lanKeyMap: Record<string, string> = {};
  irohAddrMap: Record<string, IrohAddr> = {};

  irohAddrs(): Record<string, IrohAddr> {
    return this.irohAddrMap;
  }

  saveIrohAddr(nodeId: string, address: IrohAddr): void {
    this.irohAddrMap = { ...this.irohAddrMap, [nodeId]: address };
  }

  lanKeys(): Record<string, string> {
    return this.lanKeyMap;
  }

  saveLanKey(nodeId: string, key: string): void {
    this.lanKeyMap = { ...this.lanKeyMap, [nodeId]: key };
  }

  facts(): StoredFact[] {
    return this.factList;
  }

  saveFacts(facts: StoredFact[]): void {
    this.factList = structuredClone(facts);
  }

  links(): AgentLink[] {
    return this.linkList;
  }

  saveLinks(links: AgentLink[]): void {
    this.linkList = [...links];
  }

  team(): TeamState | undefined {
    return this.teamState;
  }

  saveTeam(state: TeamState): void {
    this.teamState = structuredClone(state);
  }

  peers(): Peer[] {
    return this.peerList;
  }

  savePeer(peer: Peer): void {
    const index = this.peerList.findIndex((existing) => existing.nodeId === peer.nodeId);
    if (index >= 0) this.peerList.splice(index, 1);
    this.peerList.push(peer);
  }

  published(): Published[] {
    return this.publishedList;
  }

  appendReceipt(receipt: Receipt): void {
    this.receiptList.push(receipt);
  }
}

/** A deterministic capability whose input picks the failure mode under test. */
export function fakeCapability(id: string, sensitivity: 'low' | 'high'): CapabilityImpl<{ mode: string }> {
  return {
    card: {
      id,
      version: '1.0.0',
      title: sensitivity === 'high' ? 'Répondre sur un sujet privé' : 'Donner un état de service',
      sensitivity,
      receives: ['Un état'],
      neverReceives: ['Les données brutes'],
      approval: 'always',
      maxOutputChars: 2000,
      budget: { maxSeconds: 5 },
    },
    input: z.object({ mode: z.enum(['ok', 'invalid', 'secret']) }),
    output: z.object({ status: z.string(), detail: z.string() }),
    configSchema: z.object({}),
    preview: (input) => `mode ${input.mode}`,
    execute: (input) => {
      if (input.mode === 'invalid') return Promise.resolve({ status: 'ok', unexpected: true });
      if (input.mode === 'secret')
        return Promise.resolve({ status: 'ok', detail: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' });
      return Promise.resolve({ status: 'ok', detail: 'tout va bien' });
    },
  };
}

export interface TestNode {
  identity: Identity;
  engine: NodeEngine;
  store: MemoryStore;
  client: RelayClient;
  transport: Transport;
}

export interface Mesh {
  relay: RelayHandle;
  clock: { now: number };
  requester: TestNode;
  executor: TestNode;
  approver: TestNode;
  close(): Promise<void>;
}

export async function until(check: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Relay + three nodes: Guillaume requests, the VPS executes, Julie approves. Everyone is paired with everyone. */
export async function startMesh(
  capabilities: CapabilityImpl[],
  extra: {
    requester?: Partial<EngineOptions>;
    executor?: Partial<EngineOptions>;
    approver?: Partial<EngineOptions>;
  } = {},
): Promise<Mesh> {
  const clock = { now: Date.now() };
  const ids = {
    requester: await generateIdentity('Guillaume'),
    executor: await generateIdentity('VPS'),
    approver: await generateIdentity('Julie'),
  };
  const relay = await startRelay(
    { port: 0, allowedNodeIds: Object.values(ids).map((identity) => identity.nodeId) },
    { logger: () => undefined },
  );
  const make = async (
    identity: Identity,
    ownerKind: 'human' | 'machine',
    options: Partial<EngineOptions> = {},
  ): Promise<TestNode> => {
    const store = new MemoryStore();
    const link: { client?: RelayClient } = {};
    const transport: Transport = {
      send: (envelope) => (link.client ? link.client.send(envelope) : Promise.resolve('offline')),
    };
    const engine = new NodeEngine({
      identity,
      ownerKind,
      store,
      capabilities,
      now: () => clock.now,
      transport,
      ...options,
    });
    const client = new RelayClient({
      identity,
      url: relay.url,
      onEnvelope: (envelope) => {
        void engine.handleEnvelope(envelope).catch(() => undefined);
      },
    });
    link.client = client;
    client.start();
    await client.waitReady();
    return { identity, engine, store, client, transport };
  };
  const requester = await make(ids.requester, 'human', extra.requester);
  const executor = await make(ids.executor, 'machine', extra.executor);
  const approver = await make(ids.approver, 'human', extra.approver);

  // Pairing through real invites: requester ↔ executor, approver ↔ executor.
  for (const node of [requester, approver]) {
    const code = await executor.engine.invite(relay.url);
    await node.engine.pair(code);
    await until(
      () =>
        node.engine.peers().length === 1 &&
        executor.engine.peers().some((peer) => peer.nodeId === node.identity.nodeId),
    );
  }
  for (const capability of capabilities) {
    executor.store.publishedList.push({
      capabilityId: capability.card.id,
      approverNodeIds: [approver.identity.nodeId],
      config: {},
      publishedAt: new Date().toISOString(),
    });
  }
  await requester.engine.refreshCatalogs();
  await until(() => requester.engine.catalog().length === capabilities.length);

  return {
    relay,
    clock,
    requester,
    executor,
    approver,
    close: async () => {
      for (const node of [requester, executor, approver]) node.client.close();
      await relay.close();
    },
  };
}

export async function allReceiptsValid(receipts: Receipt[]): Promise<boolean> {
  for (const receipt of receipts) if (!(await verifyReceipt(receipt))) return false;
  return true;
}
