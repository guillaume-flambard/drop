import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  decodeInvite,
  fromBase64Url,
  generateIdentity,
  sealEnvelope,
  type Envelope,
  type Identity,
  type IrohAddr,
} from '@drop/protocol';
import { startLocalApi, type AdminHooks, type LocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import {
  IROH_NO_PATH_MESSAGE,
  IrohService,
  assertInternetAllowed,
  privateSocket,
  InternetSettingsSchema,
  sendInOrder,
  type IrohOptions,
} from '../src/iroh.ts';
import { renderPanel } from '../src/panel.ts';
import { MemoryStore, startMesh, until } from './helpers.ts';

const root = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const BINARY = join(root, 'crates', 'drop-iroh', 'target', 'release', 'drop-iroh');

beforeAll(() => {
  execFileSync('cargo', ['build', '--release', '--manifest-path', join(root, 'crates', 'drop-iroh', 'Cargo.toml')], {
    stdio: 'ignore',
  });
}, 600_000);

const services: IrohService[] = [];
const raws: ChildProcessWithoutNullStreams[] = [];
let api: LocalApi | undefined;
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  for (const raw of raws.splice(0)) raw.kill();
  await api?.close();
  api = undefined;
});

function irohFor(identity: Identity, extra: Partial<IrohOptions> = {}): IrohService {
  const service = new IrohService({
    identity,
    binary: BINARY,
    access: () => ({ peers: [], open: false }),
    addressOf: () => undefined,
    onEnvelope: () => undefined,
    connectMs: 1500,
    ...extra,
  });
  services.push(service);
  return service;
}

function envelope(from: Identity, to: Identity): Envelope {
  return { v: 1, id: randomUUID(), from: from.nodeId, to: to.nodeId } as unknown as Envelope;
}

/** drop-iroh driven by hand, to play a peer that answers whatever the test wants. */
async function rawIroh(identity: Identity, peers: string[]) {
  const child = spawn(BINARY, [], { stdio: ['pipe', 'pipe', 'pipe'], env: {} });
  raws.push(child);
  const lines: Record<string, unknown>[] = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  });
  const seed = Buffer.from(fromBase64Url(identity.secretKey).subarray(0, 32)).toString('base64url');
  child.stdin.write(`${JSON.stringify({ t: 'init', seed, relay: null, peers })}\n`);
  await until(() => lines.some((line) => line.t === 'ready'), 10_000);
  const ready = lines.find((line) => line.t === 'ready') as { id: string; addr: IrohAddr };
  return { child, lines, ready, write: (line: unknown) => child.stdin.write(`${JSON.stringify(line)}\n`) };
}

function call(port: number, token: string, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Host: `127.0.0.1:${String(port)}`,
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, text });
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

describe('internet (T4.2b)', () => {
  it('derives the iroh identity from the drop key, so the iroh id is the drop node id', async () => {
    const julie = await generateIdentity('Julie');
    const service = irohFor(julie);
    await service.start();
    expect(service.state()).toBe('on');
    expect(service.id()).toBe(julie.nodeId);
    expect(service.address()?.direct.length).toBeGreaterThan(0);
    expect(service.address()?.relay).toBeUndefined();

    // Without the program, the Internet mode is unavailable, never an error.
    const missing = irohFor(julie, { binary: join(root, 'no-such-drop-iroh') });
    await missing.start();
    expect(missing.state()).toBe('unavailable');

    // A program that cannot be started (here a directory): the start ends, explained, instead of hanging the daemon.
    const broken = irohFor(julie, { binary: root });
    await broken.start();
    expect(broken.state()).toBe('failed');
    expect(broken.lastError()).toBe('E_IROH_SPAWN');
  });

  it('delivers an envelope directly between two nodes with no relay, with a signed acknowledgement', async () => {
    const julie = await generateIdentity('Julie');
    const natha = await generateIdentity('Natha');
    const received: unknown[] = [];
    const answers: unknown[] = [];
    const addresses = new Map<string, IrohAddr>();
    const a = irohFor(julie, {
      access: () => ({ peers: [natha.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
      onEnvelope: (env) => answers.push(env),
    });
    const b = irohFor(natha, {
      access: () => ({ peers: [julie.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
      onEnvelope: (env) => received.push(env),
    });
    await Promise.all([a.start(), b.start()]);
    const bAddress = b.address();
    if (!bAddress) throw new Error('no address');
    addresses.set(natha.nodeId, bAddress);

    const first = envelope(julie, natha);
    expect(await a.send(first)).toBe('delivered');
    expect(received).toEqual([first]);
    // The connection is reused for the next one.
    expect(await a.send(envelope(julie, natha))).toBe('delivered');
    expect(received).toHaveLength(2);
    // Natha does not know Julie's address: the answer goes back on the connection Julie opened (a pairing, a NAT).
    expect(addresses.has(julie.nodeId)).toBe(false);
    const answer = envelope(natha, julie);
    expect(await b.send(answer)).toBe('delivered');
    expect(answers).toEqual([answer]);

    // A receiver that answers with an acknowledgement it did not sign: never counted as delivered.
    const marc = await generateIdentity('Marc');
    const forger = await rawIroh(marc, [julie.nodeId]);
    addresses.set(marc.nodeId, forger.ready.addr);
    const c = irohFor(julie, {
      access: () => ({ peers: [marc.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
    });
    await c.start();
    const forged = envelope(julie, marc);
    const sending = c.send(forged);
    await until(() => forger.lines.some((line) => line.t === 'env'), 10_000);
    const env = forger.lines.find((line) => line.t === 'env') as { rid: number; from: string };
    expect(env.from).toBe(julie.nodeId);
    forger.write({ t: 'reply', rid: env.rid, ack: JSON.stringify({ id: forged.id, sig: 'A'.repeat(86) }) });
    expect(await sending).toBe('unreachable');
    expect(c.lastError()).toBe('E_IROH_ACK');
  });

  it('refuses a connection from a node that is not a paired peer', async () => {
    const julie = await generateIdentity('Julie');
    const stranger = await generateIdentity('Inconnu');
    const received: unknown[] = [];
    const addresses = new Map<string, IrohAddr>();
    const target = irohFor(julie, { onEnvelope: (env) => received.push(env) });
    const dialer = irohFor(stranger, {
      access: () => ({ peers: [julie.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
    });
    await Promise.all([target.start(), dialer.start()]);
    const address = target.address();
    if (!address) throw new Error('no address');
    addresses.set(julie.nodeId, address);
    expect(await dialer.send(envelope(stranger, julie))).toBe('unreachable');
    expect(received).toEqual([]);

    // An envelope whose sender is not the authenticated node is dropped, not acknowledged.
    const natha = await generateIdentity('Natha');
    const relaying = irohFor(natha, {
      access: () => ({ peers: [julie.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
    });
    const open = irohFor(julie, {
      access: () => ({ peers: [natha.nodeId], open: false }),
      onEnvelope: (env) => received.push(env),
    });
    await Promise.all([relaying.start(), open.start()]);
    const openAddress = open.address();
    if (!openAddress) throw new Error('no address');
    addresses.set(julie.nodeId, openAddress);
    expect(await relaying.send(envelope(stranger, julie))).toBe('unreachable');
    expect(received).toEqual([]);

    // While an invite is live, a newcomer may connect to pair, within a small budget; once it ends, it is cut off.
    const access = { open: true };
    const host = irohFor(julie, {
      access: () => ({ peers: [], open: access.open }),
      onEnvelope: (env) => received.push(env),
    });
    await host.start();
    const hostAddress = host.address();
    if (!hostAddress) throw new Error('no address');
    addresses.set(julie.nodeId, hostAddress);
    const newcomer = irohFor(stranger, {
      access: () => ({ peers: [julie.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
    });
    await newcomer.start();
    const outcomes: string[] = [];
    for (let index = 0; index < 11; index++) outcomes.push(await newcomer.send(envelope(stranger, julie)));
    expect(outcomes.filter((outcome) => outcome === 'delivered')).toHaveLength(10);
    expect(outcomes[10]).toBe('unreachable');
    expect(received).toHaveLength(10);
    access.open = false;
    host.refresh();
    const later = irohFor(stranger, {
      access: () => ({ peers: [julie.nodeId], open: false }),
      addressOf: (nodeId) => addresses.get(nodeId),
    });
    await later.start();
    expect(await later.send(envelope(stranger, julie))).toBe('unreachable');
    expect(received).toHaveLength(10);
  });

  it('explains the failure when no path exists without a relay', async () => {
    const julie = await generateIdentity('Julie');
    const natha = await generateIdentity('Natha');
    const service = irohFor(julie, {
      access: () => ({ peers: [natha.nodeId], open: false }),
      // A documentation address: nothing answers there.
      addressOf: () => ({ direct: ['192.0.2.1:4433'] }),
    });
    await service.start();
    const relayed: Envelope[] = [];
    const lost = envelope(julie, natha);
    const outcome = await sendInOrder(lost, [service], {
      send: (env) => {
        relayed.push(env);
        return Promise.resolve('delivered');
      },
    });
    expect(outcome).toBe('delivered');
    expect(relayed).toEqual([lost]);
    expect(service.lastError()).toBe('E_IROH_NO_PATH');
    expect(service.status()).toMatchObject({ state: 'on', error: 'E_IROH_NO_PATH', message: IROH_NO_PATH_MESSAGE });
    expect(IROH_NO_PATH_MESSAGE).toContain('relais');

    // The next envelope does not wait for the same dead path again.
    const started = Date.now();
    expect(await service.send(envelope(julie, natha))).toBe('unreachable');
    expect(Date.now() - started).toBeLessThan(500);

    // A relay the peer names is never contacted by a node that chose none: no path, at once.
    const marc = await generateIdentity('Marc');
    const noRelay = irohFor(julie, {
      access: () => ({ peers: [marc.nodeId], open: false }),
      addressOf: () => ({ relay: 'https://relay.example.com', direct: [] }),
      connectMs: 5000,
    });
    await noRelay.start();
    const at = Date.now();
    expect(await noRelay.send(envelope(julie, marc))).toBe('unreachable');
    expect(noRelay.lastError()).toBe('E_IROH_NO_PATH');
    expect(Date.now() - at).toBeLessThan(1000);
  });

  it('shares its iroh addresses with each paired peer and keeps only valid ones', async () => {
    const mesh = await startMesh([]);
    try {
      const { requester, executor, approver } = mesh;
      await requester.engine.setIrohAddress({ relay: 'https://relay.team.example', direct: ['192.168.1.20:4433'] });
      await until(() => executor.engine.irohAddressOf(requester.identity.nodeId) !== undefined);
      expect(executor.engine.irohAddressOf(requester.identity.nodeId)).toEqual({
        relay: 'https://relay.team.example',
        direct: ['192.168.1.20:4433'],
      });

      // Turning the Internet mode off tells peers there is nothing left to dial.
      await requester.engine.setIrohAddress(undefined);
      await until(() => executor.engine.irohAddressOf(requester.identity.nodeId)?.relay === undefined);
      expect(executor.engine.irohAddressOf(requester.identity.nodeId)).toEqual({ direct: [] });

      // A relay in plain http outside this machine is refused; on loopback it is accepted, for a test relay.
      await approver.engine.setIrohAddress({ relay: 'http://relay.example.com', direct: ['10.0.0.9:4433'] });
      await approver.engine.setIrohAddress({ relay: 'http://127.0.0.1:3340', direct: ['10.0.0.9:4433'] });
      await until(() => executor.engine.irohAddressOf(approver.identity.nodeId) !== undefined);
      expect(executor.engine.irohAddressOf(approver.identity.nodeId)?.relay).toBe('http://127.0.0.1:3340');
      expect(executor.store.irohAddrMap[approver.identity.nodeId]?.relay).not.toBe('http://relay.example.com');

      // The invite carries the inviter's addresses, so pairing works without a drop relay.
      await executor.engine.setIrohAddress({ direct: ['192.168.1.30:4433'] });
      // Creating or using an invite changes who may connect: the program is told at once, not 2 s later.
      const accessChanges: string[] = [];
      executor.engine.on('access', () => accessChanges.push('executor'));
      const invite = decodeInvite(await executor.engine.invite(mesh.relay.url));
      expect(accessChanges).toEqual(['executor']);
      expect(invite.iroh).toEqual({ direct: ['192.168.1.30:4433'] });
      const newcomer = new NodeEngine({
        identity: await generateIdentity('Nouvelle'),
        ownerKind: 'human',
        store: new MemoryStore(),
        capabilities: [],
        transport: { send: () => Promise.resolve('offline') },
      });
      newcomer.on('access', () => accessChanges.push('newcomer'));
      await newcomer.pair(await executor.engine.invite(mesh.relay.url));
      expect(accessChanges).toEqual(['executor', 'executor', 'newcomer']);
      expect(newcomer.irohAddressOf(executor.identity.nodeId)).toEqual({ direct: ['192.168.1.30:4433'] });
      // Who may connect: paired peers and pairings in progress; anyone only while an invite is live.
      expect(newcomer.irohAccess()).toEqual({ peers: [executor.identity.nodeId], open: false });
      expect(executor.engine.irohAccess().open).toBe(true);

      // During that live invite, a node that is not a peer cannot plant addresses for itself.
      const stranger = await generateIdentity('Inconnu');
      await executor.engine.handleEnvelope(
        await sealEnvelope(stranger, executor.identity.nodeId, { type: 'iroh_addr', direct: ['10.9.9.9:4433'] }),
      );
      expect(executor.engine.irohAddressOf(stranger.nodeId)).toBeUndefined();
    } finally {
      await mesh.close();
    }
  });

  it('lets the owner choose no relay, their own relay or the n0 test relays, flagged as third party', async () => {
    const token = 'internet-token-0123456789abcdefghijk';
    let saved: unknown = { mode: 'off' };
    const admin: AdminHooks = {
      status: () => ({ displayName: 'Julie', nodeId: 'n', relayConnected: false }),
      tools: () => ({}),
      share: () => Promise.resolve({}),
      unshare: () => true,
      install: () => ({}),
      createTeam: () => ({}),
      link: () => Promise.resolve({}),
      unlink: () => true,
      connect: () => Promise.resolve({}),
      internet: () => ({ settings: saved, state: 'off' }),
      setInternet: (settings) => {
        saved = settings;
        return { ok: true };
      },
    };
    const engine = new NodeEngine({
      identity: await generateIdentity('Julie'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    api = await startLocalApi({
      engine,
      token,
      port: 0,
      relayUrl: 'ws://x/v1',
      refreshCatalogs: () => Promise.resolve(),
      admin,
    });
    const { port } = api;
    expect(
      (await call(port, token, 'POST', '/ui/admin/internet', { mode: 'relay', relay: 'https://relay.team.example' }))
        .status,
    ).toBe(200);
    expect(saved).toEqual({ mode: 'relay', relay: 'https://relay.team.example' });
    expect((await call(port, token, 'POST', '/ui/admin/internet', { mode: 'n0' })).status).toBe(200);
    expect(JSON.parse((await call(port, token, 'GET', '/ui/admin/internet')).text)).toMatchObject({
      settings: { mode: 'n0' },
    });
    for (const bad of [{ mode: 'relay', relay: 'http://relay.example.com' }, { mode: 'relay' }, { mode: 'everything' }])
      expect((await call(port, token, 'POST', '/ui/admin/internet', bad)).status).toBe(400);
    for (const method of ['PUT', 'DELETE', 'PATCH'])
      expect((await call(port, token, method, '/ui/admin/internet', { mode: 'off' })).status).toBe(405);
    expect(saved).toEqual({ mode: 'n0' });
    expect(InternetSettingsSchema.parse({ mode: 'relay', relay: 'http://127.0.0.1:3340' })).toBeTruthy();

    // The private profile never reaches a third party: no n0, an own relay only among its allowed origins, private
    // direct addresses only. The daemon applies the same check at start, for a file edited by hand.
    const network = { origins: ['https://10.0.0.5:8443'] };
    expect(() => {
      assertInternetAllowed({ mode: 'n0' }, { profile: 'private', network });
    }).toThrow(/E_DENIED/);
    expect(() => {
      assertInternetAllowed({ mode: 'relay', relay: 'https://relay.team.example' }, { profile: 'private', network });
    }).toThrow(/E_DENIED/);
    assertInternetAllowed({ mode: 'relay', relay: 'https://10.0.0.5:8443' }, { profile: 'private', network });
    assertInternetAllowed({ mode: 'n0' }, { profile: 'legacy' });
    expect(['10.1.2.3:4433', '[fd00::1]:4433', '192.168.1.4:9'].every(privateSocket)).toBe(true);
    expect(['8.8.8.8:4433', '[2001:db8::1]:4433', '127.0.0.1:4433'].some(privateSocket)).toBe(false);

    const html = renderPanel();
    expect(html).toContain('Connexion par Internet');
    expect(html).toContain('Relais de test de n0');
    expect(html).toContain('tiers');
    expect(html).toContain('voit vos adresses IP');
  });
});
