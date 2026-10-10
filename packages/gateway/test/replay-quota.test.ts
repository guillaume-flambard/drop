import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity, sealEnvelope, type NodeId } from '@drop/protocol';
import { RelayClient, startRelay } from '@drop/relay';
import { createHash } from 'node:crypto';
import { Bridge, OAuthServer } from '../src/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function until(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('replay quota (T4.2d)', () => {
  it('keeps the gateway replay cache empty for envelopes without a pending session', async () => {
    const [gateway, stranger] = await Promise.all([generateIdentity('drop gateway'), generateIdentity('Inconnu')]);
    const relay = await startRelay(
      { port: 0, allowedNodeIds: [gateway.nodeId, stranger.nodeId], rateLimitPerMinute: 1000 },
      { logger: () => undefined },
    );
    cleanups.push(() => relay.close());
    const granted: { sessionId: string; nodeId: NodeId }[] = [];
    // Two sessions waiting for their link: each may be claimed once, as the gateway's OAuth server does.
    const waiting = new Set(['pending-session-0001', 'mismatch-session-0001']);
    const bridge = new Bridge({
      identity: gateway,
      relayUrl: relay.url,
      claimPendingSession: (sessionId) => waiting.delete(sessionId),
      onLinkGrant: (sessionId, nodeId) => {
        granted.push({ sessionId, nodeId });
        return sessionId === 'pending-session-0001';
      },
      isLinkedNode: () => false,
    });
    bridge.start();
    cleanups.push(() => {
      bridge.close();
    });
    const sender = new RelayClient({ identity: stranger, url: relay.url, onEnvelope: () => undefined });
    sender.start();
    cleanups.push(() => {
      sender.close();
    });
    await Promise.all([bridge.client.waitReady(), sender.waitReady()]);

    const grant = (sessionId: string) => ({
      type: 'link_grant' as const,
      sessionId,
      clientId: 'client-0123456789',
      clientName: 'Claude',
      redirectHost: 'claude.ai',
    });
    for (let index = 0; index < 30; index++) {
      const message =
        index % 2 === 0
          ? { type: 'catalog_request' as const }
          : grant(`unknown-session-${String(index).padStart(4, '0')}`);
      expect(await sender.send(await sealEnvelope(stranger, gateway.nodeId, message))).toBe('delivered');
    }
    // A session the sender opened itself, flooded with mismatched claims: the first claims it, the rest are refused.
    for (let index = 0; index < 10; index++)
      expect(await sender.send(await sealEnvelope(stranger, gateway.nodeId, grant('mismatch-session-0001')))).toBe(
        'delivered',
      );
    // A last valid link, sent twice: granted once. Neither link takes a place in the replay cache.
    const valid = await sealEnvelope(stranger, gateway.nodeId, grant('pending-session-0001'));
    expect(await sender.send(valid)).toBe('delivered');
    expect(await sender.send(valid)).toBe('delivered');
    await until(() => granted.length === 2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(granted).toEqual([
      { sessionId: 'mismatch-session-0001', nodeId: stranger.nodeId },
      { sessionId: 'pending-session-0001', nodeId: stranger.nodeId },
    ]);
    expect(bridge.memoryStats()).toEqual({ replay: 0, pending: 0 });

    // The gateway's OAuth server claims a session for one link_grant only, accepted or not.
    const oauth = new OAuthServer({ resource: 'https://drop.example/mcp' });
    const { client_id } = oauth.register({ redirect_uris: ['https://claude.ai/cb'], client_name: 'Claude' }) as {
      client_id: string;
    };
    const authorize = () =>
      oauth.authorize(
        new URLSearchParams({
          response_type: 'code',
          client_id,
          redirect_uri: 'https://claude.ai/cb',
          code_challenge: createHash('sha256').update('v'.repeat(43)).digest('base64url'),
          code_challenge_method: 'S256',
        }),
      );
    const session = authorize();
    expect(oauth.claimLink(session.id)).toBe(true);
    expect(oauth.claimLink(session.id)).toBe(false);
    expect(oauth.claimLink('no-such-session')).toBe(false);
    const linked = authorize();
    expect(oauth.claimLink(linked.id)).toBe(true);
    expect(
      oauth.approve(linked.id, 'node', { clientId: client_id, clientName: 'Claude', redirectHost: 'claude.ai' }),
    ).toBe(true);
    expect(oauth.claimLink(linked.id)).toBe(false);
  });
});
