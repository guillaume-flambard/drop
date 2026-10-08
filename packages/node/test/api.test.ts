import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { startLocalApi, type LocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { renderConsentCard, renderReview } from '../src/ui.ts';
import { MemoryStore } from './helpers.ts';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';
let api: LocalApi | undefined;

afterEach(async () => {
  await api?.close();
  api = undefined;
});

async function startApi(): Promise<LocalApi> {
  const engine = new NodeEngine({
    identity: await generateIdentity('Guillaume'),
    ownerKind: 'human',
    store: new MemoryStore(),
    capabilities: [],
    transport: { send: () => Promise.resolve('offline') },
  });
  api = await startLocalApi({
    engine,
    token: TOKEN,
    port: 0,
    relayUrl: 'ws://127.0.0.1:1/v1',
    refreshCatalogs: () => Promise.resolve(),
  });
  return api;
}

function get(port: number, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('local API', () => {
  it('refuses a request without the token', async () => {
    const { port } = await startApi();
    expect(await get(port, '/peers', { Host: `127.0.0.1:${String(port)}` })).toBe(401);
    expect(await get(port, '/peers', { Host: `127.0.0.1:${String(port)}`, Authorization: 'Bearer wrong' })).toBe(401);
    expect(await get(port, '/peers', { Host: `127.0.0.1:${String(port)}`, Authorization: `Bearer ${TOKEN}` })).toBe(
      200,
    );
  });

  it('refuses a foreign Host header even with the token (DNS rebinding)', async () => {
    const { port } = await startApi();
    const auth = { Authorization: `Bearer ${TOKEN}` };
    expect(await get(port, '/peers', { ...auth, Host: `evil.example:${String(port)}` })).toBe(401);
    expect(await get(port, '/peers', { ...auth, Host: '127.0.0.1:1' })).toBe(401);
    expect(await get(port, '/peers', { ...auth, Host: `localhost:${String(port)}` })).toBe(200);
  });
});

describe('consent UI', () => {
  const card = {
    kind: 'approval' as const,
    dropId: '0199c5a0-0000-7000-8000-000000000001',
    executor: 'x'.repeat(43),
    card: {
      capabilityId: 'production.error_summary',
      title: 'Résumer les erreurs <b>prod</b>',
      receives: ["l'état du service"],
      neverReceives: ['les lignes de log'],
      sensitivity: 'high' as const,
      executorName: 'VPS',
    },
    inputPreview: '<script>alert(1)</script>',
    purpose: '"><img src=x onerror=alert(1)>',
    requestedBy: { nodeId: 'y'.repeat(43), displayName: 'Guillaume <i>', agent: 'claude_code' as const },
    expiresAt: Date.now() + 600_000,
  };

  it('escapes an input containing a script tag', () => {
    const html = renderConsentCard(card, Date.now());
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>prod');
  });

  it('shows no technical identifier and defaults to « Pas maintenant »', () => {
    const html = renderConsentCard(card, Date.now());
    expect(html).not.toContain('production.error_summary');
    expect(html).not.toContain(card.requestedBy.nodeId);
    expect(html).not.toContain(card.executor);
    expect(html).toMatch(/value="not_now" autofocus>Pas maintenant/);
    expect(html).toContain('Sensibilité haute');
    expect(html.indexOf('Pas maintenant')).toBeLessThan(html.indexOf('Autoriser une fois'));
  });

  it('escapes every reviewed field', () => {
    const html = renderReview(
      {
        kind: 'review',
        dropId: card.dropId,
        executor: card.executor,
        title: 'T',
        output: { answer: '<script>x</script>' },
        expiresAt: Date.now() + 1000,
      },
      Date.now(),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('name="redact" value="answer"');
  });
});
