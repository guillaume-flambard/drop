import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  factCapabilityId,
  FACT_OUTPUT_SCHEMA,
  generateIdentity,
  openEnvelope,
  ReplayCache,
  sealEnvelope,
  sha256Hex,
  signFact,
  uuidv7,
  verifyFact,
  type Envelope,
  type Message,
} from '@drop/protocol';
import { startLocalApi, type LocalApi } from '../src/api.ts';
import { factResultHolds } from '../src/facts.ts';
import { routeFacts } from '../src/route.ts';
import type { CatalogEntry } from '../src/engine.ts';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { allReceiptsValid, fakeCapability, startMesh, until, type Mesh } from './helpers.ts';

const DAY = 24 * 60 * 60 * 1000;
const TOKEN = 'test-token-0123456789abcdefghijklmnop';
let mesh: Mesh | undefined;
const apis: LocalApi[] = [];

afterEach(async () => {
  for (const api of apis.splice(0)) await api.close();
  await mesh?.close();
  mesh = undefined;
});

const DEPLOY = {
  topic: 'Date du prochain déploiement',
  keywords: ['déploiement', 'mise en production'],
  statement: 'Le prochain déploiement est prévu jeudi 15 octobre à 10 h.',
  source: { label: 'Planning des releases', url: 'https://example.com/releases' },
};

async function setup(): Promise<Mesh> {
  mesh = await startMesh([fakeCapability('service.status', 'low')]);
  return mesh;
}

/** What the executor sends back to the requester, opened with the requester's key. */
function repliesTo(m: Mesh): Message[] {
  const replies: Message[] = [];
  const replay = new ReplayCache();
  const original = m.executor.transport.send.bind(m.executor.transport);
  m.executor.transport.send = (envelope: Envelope) => {
    if (envelope.to === m.requester.identity.nodeId)
      void openEnvelope(m.requester.identity, envelope, { isKnownPeer: () => true, replay, now: m.clock.now }).then(
        (opened) => replies.push(opened.message),
        () => undefined,
      );
    return original(envelope);
  };
  return replies;
}

/** A drop_request for a fact, sent as the requester without going through its catalog. */
async function ask(m: Mesh, factId: string, version: string): Promise<string> {
  const dropId = uuidv7(m.clock.now);
  const envelope = await sealEnvelope(
    m.requester.identity,
    m.executor.identity.nodeId,
    {
      type: 'drop_request',
      dropId,
      capabilityId: factCapabilityId(factId),
      capabilityVersion: version,
      input: {},
      purpose: 'Savoir quand on déploie',
      requestedBy: { nodeId: m.requester.identity.nodeId, displayName: 'Guillaume', agent: 'claude_code' },
    },
    { now: m.clock.now },
  );
  await m.executor.engine.handleEnvelope(envelope);
  return dropId;
}

describe('published facts (T4.4)', () => {
  it('publishes, edits and retires a signed fact, refuses a secret, and keeps facts privately on disk', async () => {
    const m = await setup();
    const fact = await m.executor.engine.publishFact(DEPLOY);
    expect(fact).toMatchObject({ revision: 1, status: 'active', audience: { kind: 'team' }, sensitivity: 'low' });
    expect(fact.validTo - fact.publishedAt).toBe(30 * DAY);
    const stored = () => m.executor.store.factList[0];
    expect(await verifyFact(stored()?.signed ?? { fact, sig: '' })).toBe(true);

    const edited = await m.executor.engine.editFact(fact.factId, { ...DEPLOY, statement: 'Reporté à vendredi.' });
    expect(edited).toMatchObject({ factId: fact.factId, revision: 2, statement: 'Reporté à vendredi.' });
    expect(await verifyFact(stored()?.signed ?? { fact, sig: '' })).toBe(true);

    await expect(
      m.executor.engine.publishFact({ ...DEPLOY, statement: 'Clé : sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' }),
    ).rejects.toMatchObject({ code: 'E_SECRET_DETECTED' });
    await expect(m.executor.engine.publishFact({ ...DEPLOY, validDays: 400 })).rejects.toMatchObject({
      code: 'E_SCHEMA',
    });
    await expect(
      m.executor.engine.publishFact({ ...DEPLOY, audience: { kind: 'peers', nodeIds: ['x'.repeat(43)] } }),
    ).rejects.toMatchObject({ code: 'E_SCHEMA' });

    expect(await m.executor.engine.retireFact(fact.factId)).toBe(true);
    expect(m.executor.engine.facts()).toEqual([
      expect.objectContaining({ factId: fact.factId, status: 'retired', live: false }),
    ]);
    expect(await verifyFact(stored()?.signed ?? { fact, sig: '' })).toBe(true);
    expect(await m.executor.engine.retireFact(fact.factId)).toBe(false);

    // On disk: facts.json under DROP_HOME, owner-only, read back as written.
    const owner = await generateIdentity('Julie');
    const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'facts-home-')), 'home'));
    home.init(owner, NodeConfigSchema.parse({ relayUrl: 'ws://127.0.0.1:1/v1', ownerKind: 'human', apiPort: 0 }));
    const signed = await signFact(owner, {
      ...fact,
      owner: { kind: 'human', displayName: 'Julie', nodeId: owner.nodeId },
      status: 'active',
    });
    home.saveFacts([{ signed, served: 2 }]);
    expect(statSync(join(home.root, 'facts.json')).mode & 0o777).toBe(0o600);
    expect(home.facts()).toEqual([{ signed, served: 2 }]);
  });

  it('lists a fact only in the catalog of its audience', async () => {
    const m = await setup();
    const fact = await m.executor.engine.publishFact({
      ...DEPLOY,
      audience: { kind: 'peers', nodeIds: [m.requester.identity.nodeId] },
    });
    await m.requester.engine.refreshCatalogs();
    await m.approver.engine.refreshCatalogs();
    const id = factCapabilityId(fact.factId);
    await until(() => m.requester.engine.catalog().some((entry) => entry.card.id === id));
    // The approver's catalog from the same node arrives too, without the fact.
    await until(() => m.approver.engine.catalog().length > 0);
    const card = m.requester.engine.catalog().find((entry) => entry.card.id === id)?.card;
    expect(card).toMatchObject({
      title: DEPLOY.topic,
      keywords: DEPLOY.keywords,
      approval: 'auto_low',
      version: '1.1.0',
    });
    // The catalog carries the topic, never the statement.
    expect(JSON.stringify(m.requester.engine.catalog())).not.toContain('jeudi 15 octobre');
    expect(m.approver.engine.catalog().some((entry) => entry.card.id === id)).toBe(false);
  });

  it('serves a fact without a decision, with a signed receipt marked fact', async () => {
    const m = await setup();
    const fact = await m.executor.engine.publishFact(DEPLOY);
    await m.requester.engine.refreshCatalogs();
    const id = factCapabilityId(fact.factId);
    await until(() => m.requester.engine.catalog().some((entry) => entry.card.id === id));
    const drop = await m.requester.engine.requestDrop({
      capabilityId: id,
      input: {},
      purpose: 'Planifier',
      agent: 'other',
    });
    await until(() => m.requester.engine.drop(drop.dropId)?.state === 'receipted');
    const result = m.requester.engine.drop(drop.dropId)?.result;
    expect(result?.outputSchemaHash).toBe(sha256Hex(FACT_OUTPUT_SCHEMA));
    expect(result?.output).toMatchObject({ kind: 'fact', fact: { statement: DEPLOY.statement, factId: fact.factId } });
    // No consent card anywhere: publishing was the owner's consent.
    expect(m.approver.engine.pending()).toEqual([]);
    expect(m.executor.engine.pending()).toEqual([]);
    expect(m.executor.engine.facts()[0]?.served).toBe(1);
    await until(() => m.executor.store.receiptList.length === 1 && m.requester.store.receiptList.length === 1);
    for (const store of [m.executor.store, m.requester.store]) {
      expect(await allReceiptsValid(store.receiptList)).toBe(true);
      expect(store.receiptList[0]).toMatchObject({
        capabilityId: id,
        answeredBy: 'fact',
        decision: 'allow_once',
        reviewed: true,
        approver: m.executor.identity.nodeId,
      });
    }
  });

  it('refuses a retired, expired, out-of-audience or outdated fact without saying which', async () => {
    const m = await setup();
    const replies = repliesTo(m);
    const refusal = { type: 'drop_error', code: 'E_SCHEMA', message: 'Fait indisponible.' };
    const outcome = async (dropId: string) => {
      await until(() =>
        replies.some((reply) => 'dropId' in reply && reply.dropId === dropId && reply.type !== 'drop_status'),
      );
      return replies.find((reply) => 'dropId' in reply && reply.dropId === dropId && reply.type !== 'drop_status');
    };

    const live = await m.executor.engine.publishFact(DEPLOY);
    expect((await outcome(await ask(m, live.factId, '1.1.0')))?.type).toBe('drop_result');

    const retired = await m.executor.engine.publishFact({ ...DEPLOY, topic: 'Ancien sujet' });
    await m.executor.engine.retireFact(retired.factId);
    expect(await outcome(await ask(m, retired.factId, '1.1.0'))).toMatchObject(refusal);

    const elsewhere = await m.executor.engine.publishFact({
      ...DEPLOY,
      audience: { kind: 'peers', nodeIds: [m.approver.identity.nodeId] },
    });
    expect(await outcome(await ask(m, elsewhere.factId, '1.1.0'))).toMatchObject(refusal);

    const outdated = await m.executor.engine.publishFact({ ...DEPLOY, topic: 'Sujet modifié' });
    await m.executor.engine.editFact(outdated.factId, { ...DEPLOY, topic: 'Sujet modifié', statement: 'Nouveau.' });
    expect(await outcome(await ask(m, outdated.factId, '1.1.0'))).toMatchObject(refusal);

    const shortLived = await m.executor.engine.publishFact({ ...DEPLOY, topic: 'Court', validDays: 7 });
    m.clock.now += 8 * DAY;
    expect(await outcome(await ask(m, shortLived.factId, '1.1.0'))).toMatchObject(refusal);
  });

  it('rejects at the requester a fact whose signature or validity does not hold', async () => {
    const m = await setup();
    const fact = await m.executor.engine.publishFact(DEPLOY);
    await m.requester.engine.refreshCatalogs();
    const id = factCapabilityId(fact.factId);
    await until(() => m.requester.engine.catalog().some((entry) => entry.card.id === id));
    // The executor's stored fact is altered after signing: what it serves no longer matches the signature.
    const stored = m.executor.store.factList[0];
    if (stored) stored.signed = { ...stored.signed, fact: { ...stored.signed.fact, statement: 'Déploiement annulé.' } };
    const drop = await m.requester.engine.requestDrop({
      capabilityId: id,
      input: {},
      purpose: 'Planifier',
      agent: 'other',
    });
    await until(() => m.requester.engine.drop(drop.dropId)?.error !== undefined);
    expect(m.requester.engine.drop(drop.dropId)?.result).toBeUndefined();
    expect(m.requester.engine.drop(drop.dropId)?.error?.code).toBe('E_OUTPUT_INVALID');

    // A genuine fact that has expired by the requester's clock, or served for another card, does not hold either.
    const owner = await generateIdentity('Julie');
    const signed = await signFact(owner, {
      ...fact,
      owner: { kind: 'human', displayName: 'Julie', nodeId: owner.nodeId },
    });
    const output = { kind: 'fact', fact: signed.fact, sig: signed.sig };
    const hash = sha256Hex(FACT_OUTPUT_SCHEMA);
    const expected = { capabilityId: id, executor: owner.nodeId, now: fact.publishedAt + DAY };
    expect(await factResultHolds(output, hash, expected)).toBe(true);
    expect(await factResultHolds(output, hash, { ...expected, now: fact.validTo + 1 })).toBe(false);
    expect(await factResultHolds(output, hash, { ...expected, executor: m.executor.identity.nodeId })).toBe(false);
    expect(await factResultHolds(output, hash, { ...expected, capabilityId: factCapabilityId(uuidv7()) })).toBe(false);
    expect(await factResultHolds(output, 'a'.repeat(64), expected)).toBe(false);

    // A capability that is not a fact cannot pass its result off as one.
    const plain = await m.requester.engine.requestDrop({
      capabilityId: 'service.status',
      input: { mode: 'ok' },
      purpose: 'État',
      agent: 'other',
    });
    const forged = await sealEnvelope(
      m.executor.identity,
      m.requester.identity.nodeId,
      { type: 'drop_result', dropId: plain.dropId, output, outputSchemaHash: hash },
      { now: m.clock.now },
    );
    await m.requester.engine.handleEnvelope(forged);
    await until(() => m.requester.engine.drop(plain.dropId)?.error !== undefined);
    expect(m.requester.engine.drop(plain.dropId)?.result).toBeUndefined();
    expect(m.requester.engine.drop(plain.dropId)?.error?.code).toBe('E_OUTPUT_INVALID');
  });

  it('answers ask_team with a fact whose keyword appears in the question, before any capability', async () => {
    const m = await setup();
    const published = await m.executor.engine.publishFact(DEPLOY);
    // The requester learns of the fact with its next catalog refresh, as for any capability.
    await m.requester.engine.refreshCatalogs();
    const id = factCapabilityId(published.factId);
    await until(() => m.requester.engine.catalog().some((entry) => entry.card.id === id));
    const api = await startLocalApi({
      engine: m.requester.engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://127.0.0.1:1/v1',
      refreshCatalogs: async () => {
        await m.requester.engine.refreshCatalogs();
        await until(() => m.requester.engine.catalog().length >= 2);
      },
    });
    apis.push(api);
    const res = await fetch(`http://127.0.0.1:${String(api.port)}/ask`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Quand a lieu le prochain déploiement en prod ?', agent: 'claude_code' }),
    });
    const body = (await res.json()) as { asked: { dropId: string; title: string; reason: string }[] };
    expect(body.asked).toHaveLength(1);
    expect(body.asked[0]).toMatchObject({ title: DEPLOY.topic, reason: 'fait publié sur déploiement' });
    const dropId = body.asked[0]?.dropId ?? '';
    await until(() => m.requester.engine.drop(dropId)?.state === 'receipted');
    expect(m.requester.engine.drop(dropId)?.result?.output).toMatchObject({ kind: 'fact' });
    expect(m.approver.engine.pending()).toEqual([]);
  });

  it('manages facts through the panel routes', async () => {
    const m = await setup();
    const api = await startLocalApi({
      engine: m.executor.engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://127.0.0.1:1/v1',
      refreshCatalogs: () => Promise.resolve(),
    });
    apis.push(api);
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${String(api.port)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };
    const created = await call('POST', '/ui/facts', DEPLOY);
    expect(created).toMatchObject({ status: 200, body: { ok: true } });
    const factId = (created.body.fact as { factId: string }).factId;
    expect(
      await call('POST', '/ui/facts', { ...DEPLOY, statement: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' }),
    ).toMatchObject({
      status: 400,
      body: { code: 'E_SECRET_DETECTED' },
    });
    expect(await call('POST', '/ui/facts', { ...DEPLOY, topic: '' })).toMatchObject({
      status: 400,
      body: { code: 'E_SCHEMA' },
    });
    expect(await call('POST', '/ui/facts', '{not json')).toMatchObject({ status: 400, body: { code: 'E_SCHEMA' } });
    expect(await call('POST', `/ui/facts/${factId}`, { ...DEPLOY, statement: 'Vendredi.' })).toMatchObject({
      status: 200,
      body: { fact: { revision: 2, statement: 'Vendredi.' } },
    });
    const listed = await call('GET', '/ui/facts');
    expect(listed.body.facts).toEqual([expect.objectContaining({ factId, served: 0, live: true })]);
    expect(listed.body.peers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: m.requester.identity.nodeId, displayName: 'Guillaume' }),
      ]),
    );
    expect(await call('POST', `/ui/facts/${factId}/retire`, {})).toMatchObject({ status: 200 });
    expect(await call('POST', `/ui/facts/${factId}/retire`, {})).toMatchObject({ status: 404 });
    expect(await call('POST', `/ui/facts/${uuidv7()}`, DEPLOY)).toMatchObject({ status: 404 });
  });

  it('keeps a retire made while a fact is being served, and limits fact requests per peer', async () => {
    const m = await setup();
    const replies = repliesTo(m);
    const fact = await m.executor.engine.publishFact(DEPLOY);
    // Hold the executor's sends: the result is on its way while the owner retires the fact and publishes another.
    const gate: { open?: () => void } = {};
    const held = new Promise<void>((resolve) => (gate.open = resolve));
    const send = m.executor.transport.send.bind(m.executor.transport);
    m.executor.transport.send = async (envelope) => {
      await held;
      return send(envelope);
    };
    const serving = m.executor.engine.handleEnvelope(
      await sealEnvelope(
        m.requester.identity,
        m.executor.identity.nodeId,
        {
          type: 'drop_request',
          dropId: uuidv7(m.clock.now),
          capabilityId: factCapabilityId(fact.factId),
          capabilityVersion: '1.1.0',
          input: {},
          purpose: 'Encore',
          requestedBy: { nodeId: m.requester.identity.nodeId, displayName: 'Guillaume', agent: 'other' },
        },
        { now: m.clock.now },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await m.executor.engine.retireFact(fact.factId)).toBe(true);
    const other = await m.executor.engine.publishFact({ ...DEPLOY, topic: 'Autre sujet' });
    gate.open?.();
    await serving;
    m.executor.transport.send = send;
    const facts = m.executor.engine.facts();
    expect(facts.find((item) => item.factId === fact.factId)?.status).toBe('retired');
    expect(facts.some((item) => item.factId === other.factId)).toBe(true);

    // A retire and an edit started together: exactly one wins, and the stored fact says which.
    const contested = await m.executor.engine.publishFact({ ...DEPLOY, topic: 'Disputé' });
    const [retiredFirst, edited] = await Promise.all([
      m.executor.engine.retireFact(contested.factId),
      m.executor.engine.editFact(contested.factId, { ...DEPLOY, topic: 'Disputé', statement: 'Modifié.' }),
    ]);
    expect(Number(retiredFirst) + Number(edited !== undefined)).toBe(1);
    const final = m.executor.engine.facts().find((item) => item.factId === contested.factId);
    expect(final?.status).toBe(retiredFirst ? 'retired' : 'active');
    expect(final?.revision).toBe(retiredFirst ? 1 : 2);

    // Eleven requests in a minute from one peer: the eleventh is refused with E_RATE.
    const busy = await m.executor.engine.publishFact({ ...DEPLOY, topic: 'Très demandé' });
    const ids: string[] = [];
    for (let index = 0; index < 11; index += 1) ids.push(await ask(m, busy.factId, '1.1.0'));
    await until(() =>
      replies.some((reply) => 'dropId' in reply && reply.dropId === ids[10] && reply.type !== 'drop_status'),
    );
    expect(replies.find((reply) => 'dropId' in reply && reply.dropId === ids[10])).toMatchObject({
      type: 'drop_error',
      code: 'E_RATE',
    });
  });

  it('serves no fact from an unreadable store, keeps the catalog, and mints no capped key for a fact', async () => {
    let minted = 0;
    const funder = {
      mint: () => {
        minted += 1;
        return Promise.resolve(undefined);
      },
      release: () => Promise.resolve(),
    };
    const m = (mesh = await startMesh([fakeCapability('service.status', 'low')], { requester: { funder } }));
    const fact = await m.executor.engine.publishFact(DEPLOY);
    await m.requester.engine.refreshCatalogs();
    const id = factCapabilityId(fact.factId);
    await until(() => m.requester.engine.catalog().some((entry) => entry.card.id === id));
    const drop = await m.requester.engine.requestDrop({
      capabilityId: id,
      input: {},
      purpose: 'Planifier',
      agent: 'other',
    });
    await until(() => m.requester.engine.drop(drop.dropId)?.state === 'receipted');
    expect(minted).toBe(0);

    m.executor.store.facts = () => {
      throw new Error('corrupt facts.json');
    };
    await m.requester.engine.refreshCatalogs();
    await until(() => !m.requester.engine.catalog().some((entry) => entry.card.id === id));
    expect(m.requester.engine.catalog().some((entry) => entry.card.id === 'service.status')).toBe(true);
  });

  it('ignores routing terms too short or in another script, and offline facts', () => {
    const entry = (keywords: string[], title: string, online = true): CatalogEntry => ({
      card: { id: factCapabilityId(uuidv7()), title, keywords } as CatalogEntry['card'],
      ownerNodeId: 'node-julie',
      ownerName: 'Julie',
      online,
    });
    const question = 'Quel est le statut de la CI ?';
    expect(routeFacts([entry(['日本'], '🚀')], question)).toEqual([]);
    expect(routeFacts([entry(['de', 'a'], 'CI')], question)).toEqual([]);
    expect(routeFacts([entry(['statut'], 'Statut de la CI', false)], question)).toEqual([]);
    expect(routeFacts([entry(['statut'], 'Statut de la CI')], question)).toHaveLength(1);
  });
});
