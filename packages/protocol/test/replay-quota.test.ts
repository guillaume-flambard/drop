import { describe, expect, it } from 'vitest';
import { generateIdentity, isDropError, openEnvelope, ReplayCache, sealEnvelope } from '../src/index.ts';

const NOW = 1_791_460_000_000;
const TOKEN = 'one-time-token-0123456789';

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return isDropError(error) ? error.code : 'thrown';
  }
}

describe('replay quota (T4.2d)', () => {
  it('keeps unknown senders out of the replay cache until their pairing is accepted', async () => {
    const [host, peer, stranger] = await Promise.all([
      generateIdentity('Julie'),
      generateIdentity('Natha'),
      generateIdentity('Inconnu'),
    ]);
    // A small cache: before T4.2d, more unknown envelopes than places filled it and refused everyone with E_REPLAY.
    const replay = new ReplayCache(30 * 60_000, 8);
    const options = {
      isKnownPeer: (nodeId: string) => nodeId === peer.nodeId,
      replay,
      now: NOW,
      acceptPairToken: (token: string) => token === TOKEN,
    };
    const pairRequest = (token: string) => ({
      type: 'pair_request' as const,
      oneTimeToken: token,
      displayName: 'Inconnu',
      ownerKind: 'human' as const,
    });
    for (let index = 0; index < 20; index++) {
      const envelope = await sealEnvelope(stranger, host.nodeId, { type: 'catalog_request' }, { now: NOW });
      expect(await code(openEnvelope(host, envelope, options))).toBe('E_UNKNOWN_PEER');
    }
    const wrongToken = await sealEnvelope(stranger, host.nodeId, pairRequest('not-the-token-0123456789'), { now: NOW });
    expect(await code(openEnvelope(host, wrongToken, options))).toBe('E_UNKNOWN_PEER');
    expect(replay.size()).toBe(0);

    const fromPeer = await sealEnvelope(peer, host.nodeId, { type: 'catalog_request' }, { now: NOW });
    expect(await code(openEnvelope(host, fromPeer, options))).toBe('ok');
    expect(await code(openEnvelope(host, fromPeer, options))).toBe('E_REPLAY');

    // An accepted pairing is remembered: the same envelope again is a replay, before or after decryption.
    const accepted = await sealEnvelope(stranger, host.nodeId, pairRequest(TOKEN), { now: NOW });
    expect(await code(openEnvelope(host, accepted, options))).toBe('ok');
    expect(replay.size()).toBe(2);
    expect(await code(openEnvelope(host, accepted, options))).toBe('E_REPLAY');
    // Two copies opened at once: only one is accepted.
    const twin = await sealEnvelope(stranger, host.nodeId, pairRequest(TOKEN), { now: NOW });
    const outcomes = await Promise.all([
      code(openEnvelope(host, twin, options)),
      code(openEnvelope(host, twin, options)),
    ]);
    expect(outcomes.sort()).toEqual(['E_REPLAY', 'ok']);
  });

  it('purges only up to the first live entry and never counts an expired one as seen', () => {
    const replay = new ReplayCache(1000, 100);
    expect(replay.check('a', 0)).toBe(true);
    expect(replay.check('b', 10)).toBe(true);
    expect(replay.check('c', 2000)).toBe(true);
    // a and b expired at 1000 and 1010: purged; c is live and stays.
    expect(replay.size()).toBe(1);
    expect(replay.seen('c', 2000)).toBe(true);
    expect(replay.seen('a', 2000)).toBe(false);

    // The clock went back after c was written: d expires before c, behind a live entry the purge stops at.
    expect(replay.check('d', 500)).toBe(true);
    expect(replay.size()).toBe(2);
    // At 1600, d (expired at 1500) sits behind c (live until 3000): it stays in place but is never seen.
    expect(replay.seen('d', 1600)).toBe(false);
    // The purge stopped at c: writing e leaves d in the map, three entries, no full scan.
    expect(replay.check('e', 1600)).toBe(true);
    expect(replay.size()).toBe(3);
    expect(replay.check('d', 1600)).toBe(true);
    expect(replay.size()).toBe(3);
    expect(replay.seen('d', 1600)).toBe(true);

    // A clock that jumped forward then came back: x stays live far ahead and blocks the purge. When the cache is
    // full, a full sweep runs before refusing, so expired entries behind x still make room.
    const jumped = new ReplayCache(1000, 3);
    expect(jumped.check('x', 100_000)).toBe(true);
    expect(jumped.check('a', 0)).toBe(true);
    expect(jumped.check('b', 10)).toBe(true);
    expect(jumped.check('c', 2000)).toBe(true);
    expect(jumped.size()).toBe(2);
  });
});
