import { request } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropError, generateIdentity } from '@drop/protocol';
import { startLocalApi, type LocalApi } from '../src/api.ts';
import { NodeEngine, type CatalogEntry, type OutboundDrop } from '../src/engine.ts';
import { renderConsentCard, renderReview } from '../src/ui.ts';
import { MemoryStore } from './helpers.ts';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';
let api: LocalApi | undefined;

afterEach(async () => {
  await api?.close();
  api = undefined;
});

async function startApi(engine?: NodeEngine): Promise<LocalApi> {
  engine ??= new NodeEngine({
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
  it('reports requester capacity as E_RATE/429 for /drops and /ask', async () => {
    const engine = new NodeEngine({
      identity: await generateIdentity('Guillaume'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    vi.spyOn(engine, 'catalog').mockReturnValue([
      {
        card: {
          id: 'mcp.answer.github',
          title: 'GitHub',
          receives: ['Une question'],
          inputSchema: { properties: { question: { type: 'string' } }, required: ['question'] },
        },
        ownerName: 'Julie',
        online: true,
      } as unknown as CatalogEntry,
    ]);
    vi.spyOn(engine, 'catalogIsFresh').mockReturnValue(true);
    const requestDrop = vi
      .spyOn(engine, 'requestDrop')
      .mockRejectedValue(new DropError('E_RATE', 'Trop de demandes actives.'));
    const { port } = await startApi(engine);
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    expect(await post('/drops', { capabilityId: 'mcp.answer.github', input: {}, purpose: 'Test' })).toMatchObject({
      status: 429,
      body: { error: 'E_RATE' },
    });
    expect(await post('/ask', { question: 'Où en est le ticket GitHub ?' })).toMatchObject({
      status: 429,
      body: { error: 'E_RATE' },
    });
    requestDrop.mockRejectedValue(new DropError('E_TOO_LARGE'));
    expect(await post('/drops', { capabilityId: 'mcp.answer.github', input: {}, purpose: 'Test' })).toMatchObject({
      status: 413,
      body: { error: 'E_TOO_LARGE' },
    });
    expect(await post('/ask', { question: 'Où en est le ticket GitHub ?' })).toMatchObject({
      status: 413,
      body: { error: 'E_TOO_LARGE' },
    });
  });

  it('reports already sent routes when /ask reaches capacity midway', async () => {
    const engine = new NodeEngine({
      identity: await generateIdentity('Guillaume'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    vi.spyOn(engine, 'catalog').mockReturnValue(
      ['github', 'notion'].map((kind) => ({
        card: {
          id: `mcp.answer.${kind}`,
          title: kind,
          receives: ['Une question'],
          inputSchema: { properties: { question: { type: 'string' } }, required: ['question'] },
        },
        ownerName: 'Julie',
        online: true,
      })) as unknown as CatalogEntry[],
    );
    vi.spyOn(engine, 'catalogIsFresh').mockReturnValue(true);
    vi.spyOn(engine, 'requestDrop')
      .mockResolvedValueOnce({ dropId: '0199c5a0-0000-7000-8000-000000000001' } as OutboundDrop)
      .mockRejectedValueOnce(new DropError('E_RATE'));
    const { port } = await startApi(engine);
    const response = await fetch(`http://127.0.0.1:${String(port)}/ask`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Où en sont le commit GitHub et la documentation Notion ?' }),
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: 'E_RATE',
      asked: [{ dropId: '0199c5a0-0000-7000-8000-000000000001' }],
    });
  });
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

  it('tells the approver what the run may cost them', () => {
    const capped = renderConsentCard(
      { ...card, card: { ...card.card, cost: { kind: 'capped', maxUsd: 0.5 } } },
      Date.now(),
    );
    expect(capped).toContain('Coût max : 0,50 $, à votre charge.');
    expect(renderConsentCard({ ...card, card: { ...card.card, cost: { kind: 'free' } } }, Date.now())).toContain(
      'Coût : gratuit.',
    );
    expect(renderConsentCard({ ...card, card: { ...card.card, cost: { kind: 'unmeasured' } } }, Date.now())).toContain(
      'non mesuré',
    );
    expect(renderConsentCard(card, Date.now())).not.toContain('Coût');
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
