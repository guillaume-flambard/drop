import { describe, expect, it } from 'vitest';
import { decodeInvite, generateIdentity, sealEnvelope } from '@drop/protocol';
import { NodeEngine } from '../src/engine.ts';
import { MemoryStore } from './helpers.ts';

describe('replay quota (T4.2d)', () => {
  it('leaves the node replay cache to known peers and accepted pairings while an invite is live', async () => {
    const [julie, stranger] = await Promise.all([generateIdentity('Julie'), generateIdentity('Inconnu')]);
    const store = new MemoryStore();
    const engine = new NodeEngine({
      identity: julie,
      ownerKind: 'human',
      store,
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    const invite = decodeInvite(await engine.invite('ws://127.0.0.1:1/v1'));
    for (let index = 0; index < 25; index++)
      await engine.handleEnvelope(await sealEnvelope(stranger, julie.nodeId, { type: 'catalog_request' }));
    expect(engine.memoryStats().replay).toBe(0);

    // The invitee's real pairing request is accepted and remembered.
    await engine.handleEnvelope(
      await sealEnvelope(stranger, julie.nodeId, {
        type: 'pair_request',
        oneTimeToken: invite.oneTimeToken,
        displayName: 'Inconnu',
        ownerKind: 'human',
      }),
    );
    expect(engine.peers().map((peer) => peer.nodeId)).toEqual([stranger.nodeId]);
    expect(engine.memoryStats().replay).toBe(1);
  });
});
