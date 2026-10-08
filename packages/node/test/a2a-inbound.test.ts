import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { askAgent } from '@drop/a2a';
import { generateIdentity, type Identity } from '@drop/protocol';
import { startRelay } from '@drop/relay';
import { startDaemon, type Daemon } from '../src/daemon.ts';
import { DropHome, NodeConfigSchema } from '../src/home.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const FIXTURE = resolve(
  import.meta.dirname,
  '..',
  '..',
  'capabilities',
  'test',
  'fixtures',
  'fake-design-mcp-stdio.ts',
);

async function until(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function daemonFor(identity: Identity, relayUrl: string): Promise<{ home: DropHome; daemon: Daemon }> {
  const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'a2a-home-')), 'home'));
  home.init(identity, NodeConfigSchema.parse({ relayUrl, ownerKind: 'human', apiPort: 0 }));
  const daemon = await startDaemon(home, { apiPort: 0, notifications: false, log: () => undefined });
  cleanups.push(() => daemon.stop());
  return { home, daemon };
}

describe('the team as an A2A agent (T2.14)', () => {
  it('serves a card listing the team tools, routes an A2A question to a colleague, and reports her refusal', async () => {
    const [guillaume, julie] = await Promise.all([generateIdentity('Guillaume'), generateIdentity('Julie')]);
    const relay = await startRelay(
      { port: 0, allowedNodeIds: [guillaume.nodeId, julie.nodeId] },
      { logger: () => undefined },
    );
    cleanups.push(() => relay.close());
    const g = await daemonFor(guillaume, relay.url);
    const j = await daemonFor(julie, relay.url);
    j.home.publish({
      capabilityId: 'mcp.answer.figma',
      approverNodeIds: [julie.nodeId],
      config: {
        label: 'mon Figma',
        server: { transport: 'stdio', command: process.execPath, args: [FIXTURE], env: [] },
        tools: ['get_design_context'],
      },
      publishedAt: new Date().toISOString(),
    });
    await Promise.all([g.daemon.relay.waitReady(), j.daemon.relay.waitReady()]);
    await g.daemon.engine.pair(await j.daemon.engine.invite(relay.url));
    await until(() => g.daemon.engine.peers().length === 1);
    await g.daemon.engine.refreshCatalogs();
    await until(() => g.daemon.engine.catalog().length === 1);

    const base = `http://127.0.0.1:${String(g.daemon.api.port)}`;
    const card = (await (await fetch(`${base}/.well-known/agent-card.json`)).json()) as {
      name: string;
      skills: { id: string; name: string }[];
      supportedInterfaces: { url: string; protocolBinding: string }[];
      securitySchemes: Record<string, unknown>;
    };
    expect(card.skills).toEqual([
      expect.objectContaining({ id: 'mcp.answer.figma', name: 'Répondre à partir de mon Figma' }),
    ]);
    expect(card.supportedInterfaces[0]).toMatchObject({ url: `${base}/a2a`, protocolBinding: 'JSONRPC' });
    expect(Object.keys(card.securitySchemes)).toEqual(['bearer']);

    const headers = { Authorization: `Bearer ${g.home.localToken()}` };
    const asked = askAgent({
      url: base,
      text: 'Le bouton de la maquette de paiement est-il prêt ?',
      headers,
      pollMs: 50,
    });
    await until(() => j.daemon.engine.pending().length === 1);
    const pending = j.daemon.engine.pending()[0];
    expect(pending).toMatchObject({ kind: 'approval', purpose: 'Question reçue d’un agent A2A.' });
    await j.daemon.engine.decide(pending?.dropId ?? '', 'deny');
    expect(await asked).toMatchObject({ outcome: 'rejected', text: 'Julie : E_DENIED' });

    const vague = await askAgent({ url: base, text: 'Quel temps fera-t-il demain à Lyon ?', headers, pollMs: 50 });
    expect(vague.outcome).toBe('input_required');
    expect(vague.text).toContain('Julie (Répondre à partir de mon Figma)');
    await expect(askAgent({ url: base, text: 'Le bouton de la maquette est-il prêt ?' })).rejects.toThrow();
  }, 30_000);
});
