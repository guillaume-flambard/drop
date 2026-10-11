import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  decodeInvite,
  generateIdentity,
  openEnvelope,
  ReplayCache,
  sealEnvelope,
  sha256Hex,
  signCard,
  type DropState,
  type Envelope,
  type Identity,
  type Message,
} from '@drop/protocol';
import type { CapabilityImpl } from '@drop/runner';
import { NodeEngine } from '../src/engine.ts';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { fakeCapability, startMesh, until, type Mesh } from './helpers.ts';
import { expectPrivateMode } from '../../../test/private-mode.ts';

const LOW = 'test.service_state';
const HIGH = 'test.private_answer';
const CRASH = 'test.crashing';
let mesh: Mesh | undefined;

afterEach(async () => {
  await mesh?.close();
  mesh = undefined;
});

/** A capability that fails inside, with a path and a stack in its error. */
const crashing: CapabilityImpl<{ mode: string }> = {
  ...fakeCapability(CRASH, 'low'),
  input: z.object({ mode: z.string() }),
  execute: () =>
    Promise.reject(new Error('ENOENT: open /home/owner/.secrets/db.json\n    at read (/srv/drop/x.ts:1:1)')),
};

async function setup(): Promise<Mesh> {
  mesh = await startMesh([fakeCapability(LOW, 'low'), fakeCapability(HIGH, 'high'), crashing]);
  return mesh;
}

/** Every state the requester sees for its drop, in order, without repeats. */
function watchStates(m: Mesh): Map<string, DropState[]> {
  const seen = new Map<string, DropState[]>();
  const record = () => {
    for (const drop of m.requester.engine.outboundDrops()) {
      const states = seen.get(drop.dropId) ?? [];
      if (states.at(-1) !== drop.state) states.push(drop.state);
      seen.set(drop.dropId, states);
    }
  };
  m.requester.engine.on('change', record);
  return seen;
}

async function ask(m: Mesh, capabilityId: string, mode: string): Promise<string> {
  const drop = await m.requester.engine.requestDrop({
    capabilityId,
    input: { mode },
    purpose: 'Comprendre un incident en prod',
    agent: 'claude_code',
  });
  await until(() => m.approver.engine.pending().some((item) => item.dropId === drop.dropId));
  return drop.dropId;
}

async function openAs(recipient: Identity, envelope: Envelope): Promise<Message> {
  const opened = await openEnvelope(recipient, envelope, {
    isKnownPeer: () => true,
    replay: new ReplayCache(),
    now: envelope.ts,
  });
  return opened.message;
}

function homeFor(identity: Identity): DropHome {
  const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'drop-protocol-')), 'home'));
  home.init(identity, NodeConfigSchema.parse({ relayUrl: 'ws://relay.example/v1', ownerKind: 'human', apiPort: 0 }));
  return home;
}

describe('the protocol as the nodes play it', () => {
  it('writes identity.json with exactly the identity fields, in mode 0600', async () => {
    const identity = await generateIdentity('Julie');
    const home = homeFor(identity);
    const path = join(home.root, 'identity.json');
    expect(Object.keys(JSON.parse(readFileSync(path, 'utf8')) as object).sort()).toEqual([
      'createdAt',
      'displayName',
      'nodeId',
      'publicKey',
      'secretKey',
    ]);
    expectPrivateMode(path);
  });

  it('pairs with a signed pair_request carrying the token, answered by pair_accept, and both sides write peers.json', async () => {
    const julie = await generateIdentity('Julie');
    const natha = await generateIdentity('Natha');
    const homes = { julie: homeFor(julie), natha: homeFor(natha) };
    const sent: { from: Identity; to: Identity; envelope: Envelope }[] = [];
    const engines: Record<string, NodeEngine> = {};
    const make = (identity: Identity, other: Identity, home: DropHome) =>
      new NodeEngine({
        identity,
        ownerKind: 'human',
        store: home,
        capabilities: [],
        transport: {
          send: (envelope) => {
            sent.push({ from: identity, to: other, envelope });
            setImmediate(() => {
              engines[other.nodeId]?.handleEnvelope(envelope).catch(() => undefined);
            });
            return Promise.resolve('delivered');
          },
        },
      });
    engines[julie.nodeId] = make(julie, natha, homes.julie);
    engines[natha.nodeId] = make(natha, julie, homes.natha);
    const code = await engines[julie.nodeId]?.invite('ws://relay.example/v1');
    if (!code) throw new Error('no invite');
    await engines[natha.nodeId]?.pair(code);
    await until(() => homes.natha.peers().length === 1 && homes.julie.peers().length === 1);

    const [request, accept] = await Promise.all(sent.slice(0, 2).map(({ to, envelope }) => openAs(to, envelope)));
    expect(request).toMatchObject({ type: 'pair_request', oneTimeToken: decodeInvite(code).oneTimeToken });
    expect(sent[0]?.from.nodeId).toBe(natha.nodeId);
    expect(accept).toMatchObject({ type: 'pair_accept', displayName: 'Julie' });
    expect(sent[1]?.from.nodeId).toBe(julie.nodeId);
    for (const [home, other] of [
      [homes.julie, natha],
      [homes.natha, julie],
    ] as const) {
      const peers = JSON.parse(readFileSync(join(home.root, 'peers.json'), 'utf8')) as Record<string, unknown>[];
      expect(peers).toHaveLength(1);
      expect(Object.keys(peers[0] ?? {}).sort()).toEqual(['displayName', 'nodeId', 'ownerKind', 'pairedAt']);
      expect(peers[0]).toMatchObject({ nodeId: other.nodeId, displayName: other.displayName, ownerKind: 'human' });
    }
  });

  it('walks a low drop through proposed, awaiting_approval, approved, running, delivered, receipted, never in_review', async () => {
    const m = await setup();
    const states = watchStates(m);
    const dropId = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(states.get(dropId)).toEqual([
      'proposed',
      'awaiting_approval',
      'approved',
      'running',
      'delivered',
      'receipted',
    ]);
  });

  it('puts a high drop in review before delivering it', async () => {
    const m = await setup();
    const states = watchStates(m);
    const dropId = await ask(m, HIGH, 'ok');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.approver.engine.pending().some((item) => item.kind === 'review'));
    await m.approver.engine.review(dropId, 'send');
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(states.get(dropId)).toEqual([
      'proposed',
      'awaiting_approval',
      'approved',
      'running',
      'in_review',
      'delivered',
      'receipted',
    ]);
  });

  it('sends for review only an output that passed the schema and the secret scan', async () => {
    const m = await setup();
    for (const [mode, code] of [
      ['invalid', 'E_OUTPUT_INVALID'],
      ['secret', 'E_SECRET_DETECTED'],
    ] as const) {
      const dropId = await ask(m, HIGH, mode);
      await m.approver.engine.decide(dropId, 'allow_once');
      await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
      expect(m.requester.engine.drop(dropId)?.error?.code).toBe(code);
      expect(m.approver.engine.pending().some((item) => item.kind === 'review')).toBe(false);
    }
  });

  it('treats not now as a polite refusal: the same capability can be asked again', async () => {
    const m = await setup();
    const first = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(first, 'not_now');
    await until(() => m.requester.engine.drop(first)?.error !== undefined);
    expect(m.requester.engine.drop(first)).toMatchObject({ state: 'not_now', error: { code: 'E_NOT_NOW' } });
    const second = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(second, 'allow_once');
    await until(() => m.requester.engine.drop(second)?.result !== undefined);
  });

  it('reports an internal failure as a readable E_RUNNER, without stack or path', async () => {
    const m = await setup();
    const dropId = await ask(m, CRASH, 'go');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.requester.engine.drop(dropId)?.error !== undefined);
    const error = m.requester.engine.drop(dropId)?.error;
    expect(error?.code).toBe('E_RUNNER');
    expect(error?.message.length).toBeGreaterThan(0);
    expect(error?.message).not.toMatch(/\/home|\/srv|ENOENT|\bat\b.*:\d+/);
  });

  it('hashes the canonical input into the receipt, with neither the input nor the output', async () => {
    const m = await setup();
    const dropId = await ask(m, LOW, 'ok');
    await m.approver.engine.decide(dropId, 'allow_once');
    await until(() => m.approver.store.receiptList.length === 1 && m.requester.store.receiptList.length === 1);
    const receipt = m.executor.store.receiptList[0];
    expect(receipt?.inputHash).toBe(sha256Hex({ mode: 'ok' }));
    expect(receipt?.outputHash).toBe(sha256Hex({ status: 'ok', detail: 'tout va bien' }));
    expect(Object.keys(receipt ?? {})).not.toContain('input');
    expect(Object.keys(receipt ?? {})).not.toContain('output');
    expect(JSON.stringify(receipt)).not.toContain('tout va bien');
  });

  it('keeps only the catalog cards signed by the executor that sent them', async () => {
    const m = await setup();
    const card = m.requester.engine.catalog()[0]?.card;
    if (!card) throw new Error('no card');
    const forged = await signCard(m.approver.identity, card);
    const envelope = await sealEnvelope(
      m.executor.identity,
      m.requester.identity.nodeId,
      { type: 'catalog', cards: [forged] },
      { now: m.clock.now },
    );
    expect(await m.executor.client.send(envelope)).toBe('delivered');
    await until(() => m.requester.engine.catalog().length === 0);
    await m.requester.engine.refreshCatalogs();
    await until(() => m.requester.engine.catalog().length === 3);
  });
});
