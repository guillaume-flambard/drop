import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { askAgent } from '@drop/a2a';
import { sealEnvelope } from '@drop/protocol';
import type { CapabilityImpl } from '@drop/runner';
import { startLocalApi, type LocalApi } from '../src/api.ts';
import { startMesh, until, type Mesh } from './helpers.ts';

const TOKEN = 'owner-token-0123456789abcdefghijklmn';
let api: LocalApi | undefined;
let mesh: Mesh | undefined;
afterEach(async () => {
  await api?.close();
  await mesh?.close();
  api = undefined;
  mesh = undefined;
});

/** The same share on two machines: every Figma share is called mcp.answer.figma. */
const figma: CapabilityImpl<{ question: string }> = {
  card: {
    id: 'mcp.answer.figma',
    version: '1.0.0',
    title: 'Répondre depuis Figma',
    sensitivity: 'low',
    receives: ['la question'],
    neverReceives: ['les fichiers'],
    approval: 'always',
    maxOutputChars: 2000,
    budget: { maxSeconds: 5 },
  },
  input: z.object({ question: z.string() }),
  output: z.object({ answer: z.string() }),
  configSchema: z.object({}),
  preview: (input) => input.question,
  execute: () => Promise.resolve({ answer: 'ok' }),
};

function call(port: number, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Host: `127.0.0.1:${String(port)}`,
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, json: JSON.parse(text) as Record<string, unknown> });
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function twoOwners() {
  mesh = await startMesh([figma]);
  const { requester, executor, approver } = mesh;
  // The approver shares a Figma too; the requester pairs with them as well.
  await requester.engine.pair(await approver.engine.invite(mesh.relay.url));
  await until(() => requester.engine.peers().length === 2);
  approver.store.publishedList.push({
    capabilityId: 'mcp.answer.figma',
    approverNodeIds: [approver.identity.nodeId],
    config: {},
    publishedAt: new Date().toISOString(),
  });
  await requester.engine.refreshCatalogs();
  await until(() => requester.engine.catalog().filter((entry) => entry.card.id === 'mcp.answer.figma').length === 2);
  api = await startLocalApi({
    engine: requester.engine,
    token: TOKEN,
    port: 0,
    relayUrl: mesh.relay.url,
    refreshCatalogs: () => Promise.resolve(),
  });
  return { requester, executor, approver, port: api.port };
}

describe('owner targeting (T4.17)', () => {
  it('sends a drop to the owner it names and refuses an id that two peers publish', async () => {
    const { requester, executor, approver, port } = await twoOwners();
    const listed = (await call(port, 'GET', '/capabilities')).json.capabilities as { owner_node_id: string }[];
    expect(listed.map((entry) => entry.owner_node_id).sort()).toEqual(
      [approver.identity.nodeId, executor.identity.nodeId].sort(),
    );

    const body = {
      capabilityId: 'mcp.answer.figma',
      input: { question: 'Où en est la maquette ?' },
      purpose: 'Préparer la revue',
    };
    const ambiguous = await call(port, 'POST', '/drops', body);
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.json.error).toBe('E_AMBIGUOUS_CAPABILITY');
    expect((ambiguous.json.owners as { owner_node_id: string }[]).map((owner) => owner.owner_node_id).sort()).toEqual(
      [approver.identity.nodeId, executor.identity.nodeId].sort(),
    );
    expect(requester.engine.outboundDrops()).toEqual([]);

    for (const owner of [approver, executor]) {
      const sent = await call(port, 'POST', '/drops', { ...body, ownerNodeId: owner.identity.nodeId });
      expect(sent.status).toBe(201);
      expect(requester.engine.drop(sent.json.dropId as string)?.executor).toBe(owner.identity.nodeId);
    }
    const nobody = await call(port, 'POST', '/drops', { ...body, ownerNodeId: requester.identity.nodeId });
    expect(nobody.status).toBe(404);

    // A peer that lists the same card twice is not ambiguous with itself: the duplicate is dropped on receipt.
    const cards = await executor.engine.ownCards();
    await requester.engine.handleEnvelope(
      await sealEnvelope(executor.identity, requester.identity.nodeId, {
        type: 'catalog',
        cards: [...cards, ...cards],
      }),
    );
    expect(
      requester.engine
        .catalog()
        .filter((entry) => entry.ownerNodeId === executor.identity.nodeId && entry.card.id === 'mcp.answer.figma'),
    ).toHaveLength(1);
  });

  it('routes ask_team to each owner of a capability that two peers share', async () => {
    const { requester, executor, approver, port } = await twoOwners();
    const asked = await call(port, 'POST', '/ask', { question: 'Où en est la maquette Figma du projet ?' });
    expect(asked.status).toBe(200);
    const drops = (asked.json.asked as { dropId: string }[]).map(
      (entry) => requester.engine.drop(entry.dropId)?.executor,
    );
    expect(drops.sort()).toEqual([approver.identity.nodeId, executor.identity.nodeId].sort());

    // The same question from an A2A agent reaches both owners too (it waits for their decisions, never given here).
    const viaA2a = askAgent({
      url: `http://127.0.0.1:${String(port)}`,
      text: 'Où en est la maquette Figma du projet ?',
      headers: { Authorization: `Bearer ${TOKEN}` },
      pollMs: 50,
    });
    viaA2a.catch(() => undefined);
    await until(() => requester.engine.outboundDrops().length === 4);
    const latest = requester.engine.outboundDrops().slice(0, 2);
    expect(latest.map((drop) => drop.executor).sort()).toEqual(
      [approver.identity.nodeId, executor.identity.nodeId].sort(),
    );
  });
});
