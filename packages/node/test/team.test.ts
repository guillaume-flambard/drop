import { afterEach, describe, expect, it } from 'vitest';
import { createTeam, generateIdentity, sealEnvelope, type Identity } from '@drop/protocol';
import { RelayClient, startRelay } from '@drop/relay';
import { NodeEngine } from '../src/engine.ts';
import { fakeCapability, MemoryStore, until } from './helpers.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function network(names: string[]) {
  const identities = await Promise.all(names.map((name) => generateIdentity(name)));
  const relay = await startRelay(
    { port: 0, allowedNodeIds: identities.map((identity) => identity.nodeId) },
    { logger: () => undefined },
  );
  cleanups.push(() => relay.close());
  const nodes = identities.map((identity: Identity, index) => {
    const store = new MemoryStore();
    const link: { client?: RelayClient } = {};
    const engine = new NodeEngine({
      identity,
      ownerKind: 'human',
      store,
      capabilities: [fakeCapability(`test.tool_${String(index)}`, 'low')],
      agents: () => (index % 2 === 0 ? ['Claude Code'] : ['Codex']),
      transport: { send: (envelope) => (link.client ? link.client.send(envelope) : Promise.resolve('offline')) },
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
    cleanups.push(() => {
      client.close();
    });
    store.publishedList.push({
      capabilityId: `test.tool_${String(index)}`,
      approverNodeIds: [identity.nodeId],
      config: {},
      publishedAt: new Date().toISOString(),
    });
    return { identity, engine, store, client };
  });
  await Promise.all(nodes.map((node) => node.client.waitReady()));
  return { relay, nodes };
}

describe('team (T2.9)', () => {
  it('everyone invited by any member ends up paired with every member, and sees their agents and tools', async () => {
    const {
      relay,
      nodes: [guillaume, julie, natha, sami],
    } = await network(['Guillaume', 'Julie', 'Natha', 'Sami']);
    if (!guillaume || !julie || !natha || !sami) throw new Error('nodes');
    guillaume.engine.createTeam('Atlas');
    await julie.engine.pair(await guillaume.engine.invite(relay.url));
    await natha.engine.pair(await julie.engine.invite(relay.url));
    await sami.engine.pair(await guillaume.engine.invite(relay.url));

    const everyone = [guillaume, julie, natha, sami];
    await until(() =>
      everyone.every((node) => node.engine.team()?.members.length === 4 && node.engine.peers().length === 3),
    );
    for (const node of everyone) expect(node.engine.team()?.team.name).toBe('Atlas');
    expect(natha.store.peerList.find((peer) => peer.nodeId === guillaume.identity.nodeId)?.via).toBe(
      julie.identity.nodeId,
    );

    await natha.engine.refreshCatalogs();
    await until(() => natha.engine.teamView().every((member) => member.online));
    const view = natha.engine.teamView();
    expect(view.map((member) => [member.displayName, member.self, member.agents])).toEqual([
      ['Natha', true, ['Claude Code']],
      ['Julie', false, ['Codex']],
      ['Guillaume', false, ['Claude Code']],
      ['Sami', false, ['Codex']],
    ]);
    expect(view.find((member) => member.displayName === 'Sami')?.capabilities).toEqual([
      { id: 'test.tool_3', title: 'Donner un état de service' },
    ]);
  });

  it('ignores a roster from another team, and a node outside any team ignores rosters', async () => {
    const {
      relay,
      nodes: [guillaume, julie, outsider],
    } = await network(['Guillaume', 'Julie', 'Outsider']);
    if (!guillaume || !julie || !outsider) throw new Error('nodes');
    guillaume.engine.createTeam('Atlas');
    await julie.engine.pair(await guillaume.engine.invite(relay.url));
    await until(() => julie.engine.team()?.members.length === 2);
    // The outsider pairs with Julie without joining her team, then claims to be in another team with a stranger.
    julie.store.savePeer({
      nodeId: outsider.identity.nodeId,
      displayName: 'Outsider',
      ownerKind: 'human',
      pairedAt: new Date().toISOString(),
    });
    const stranger = await generateIdentity('Stranger');
    const forged = await sealEnvelope(outsider.identity, julie.identity.nodeId, {
      type: 'team_roster',
      team: createTeam('Other'),
      members: [{ nodeId: stranger.nodeId, displayName: 'Stranger', ownerKind: 'human', agents: [] }],
    });
    await julie.engine.handleEnvelope(forged);
    expect(julie.engine.team()?.members.map((member) => member.displayName)).toEqual(['Julie', 'Guillaume']);
    expect(julie.engine.peers().some((peer) => peer.nodeId === stranger.nodeId)).toBe(false);
    expect(outsider.engine.team()).toBeUndefined();
  });
});
