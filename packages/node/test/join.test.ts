import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInvite,
  decodeInvite,
  DropError,
  encodeInvite,
  generateIdentity,
  isDropError,
  sealEnvelope,
  type Envelope,
  type Identity,
} from '@drop/protocol';
import { startRelay } from '@drop/relay';
import { startDaemon, type Daemon } from '../src/daemon.ts';
import { NodeEngine } from '../src/engine.ts';
import { DEFAULT_RELAY_URL, DropHome, NodeConfigSchema, type NodeConfig } from '../src/home.ts';
import { privateConfig, switchRelay } from '../src/private-config.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function until(check: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function newHome(identity: Identity, config: NodeConfig): DropHome {
  const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'drop-join-')), 'home'));
  home.init(identity, config);
  return home;
}

async function serve(home: DropHome, lines: string[] = []): Promise<Daemon> {
  const daemon = await startDaemon(home, {
    apiPort: 0,
    notifications: false,
    log: (line) => lines.push(line),
  });
  cleanups.push(() => daemon.stop());
  return daemon;
}

async function post(
  daemon: Daemon,
  home: DropHome,
  path: string,
  body?: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`http://127.0.0.1:${String(daemon.api.port)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${home.localToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** An engine on an in-memory transport: what it sends is collected, nothing leaves the test. */
function engineOn(identity: Identity, home: DropHome, sent: Envelope[], now = () => Date.now()): NodeEngine {
  return new NodeEngine({
    identity,
    ownerKind: 'human',
    store: home,
    capabilities: [],
    now,
    transport: {
      send: (envelope) => {
        sent.push(envelope);
        return Promise.resolve('delivered');
      },
    },
  });
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return isDropError(error) ? error.code : 'not a DropError';
  }
  return 'accepted';
}

describe('one-link join (T4.23)', () => {
  it('a fresh private node adopts the relay of the link, is admitted and joins the team after Rejoindre', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    const relay = await startRelay({ port: 0, allowedNodeIds: [guillaume.nodeId] }, { logger: () => undefined });
    cleanups.push(() => relay.close());
    const ownerHome = newHome(
      guillaume,
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: relay.url, ownerKind: 'human' }),
    );
    const owner = await serve(ownerHome);
    await owner.relay.waitReady();
    owner.engine.createTeam('Atelier');
    // Julie's app was opened before the link: a private identity on the loopback default relay.
    const julieHome = newHome(julie, privateConfig(DEFAULT_RELAY_URL, 'human', 0));
    const originsBefore = julieHome.config().network?.origins;
    const lines: string[] = [];
    const newcomer = await serve(julieHome, lines);

    const { json: invite } = await post(owner, ownerHome, '/ui/invite');
    const link = String(invite.link);
    expect(link.startsWith('https://drop.memolabs.dev/join#')).toBe(true);
    expect(link.slice(link.indexOf('#') + 1)).toBe(invite.code);

    const preview = await post(newcomer, julieHome, '/ui/pair/preview', { code: link });
    expect(preview.json).toMatchObject({ displayName: 'Guillaume', team: 'Atelier', relay: 'adopt' });
    // Nothing moved before « Rejoindre ».
    expect(julieHome.config().relayUrl).toBe(DEFAULT_RELAY_URL);
    expect(newcomer.relay.url).toBe(DEFAULT_RELAY_URL);

    const joined = await post(newcomer, julieHome, '/ui/pair', { code: link });
    expect(joined.json).toMatchObject({ nodeId: guillaume.nodeId, relay: 'adopt', next: 'connect_agents' });
    await until(() => newcomer.engine.peers().some((peer) => peer.nodeId === guillaume.nodeId));
    expect(julieHome.config()).toMatchObject({ profile: 'private', relayUrl: relay.url, relayAdopted: true });
    // The adopted relay is only the relay (T4.33): the private destinations stay what the owner had.
    expect(julieHome.config().network?.origins).toEqual(originsBefore);
    expect(julieHome.config().network?.origins).not.toContain(new URL(relay.url).origin);
    expect(newcomer.relay.connected).toBe(true);
    expect(existsSync(join(julieHome.root, 'admission.json'))).toBe(false);
    await until(() => (owner.engine.team()?.members ?? []).some((member) => member.nodeId === julie.nodeId));
    expect(newcomer.engine.team()?.team.name).toBe('Atelier');
    // Her own invites now name the team's relay.
    const { json: hers } = await post(newcomer, julieHome, '/ui/invite');
    expect(decodeInvite(String(hers.code)).relayUrl).toBe(relay.url);
    // Never the invite in a log line.
    const code = String(invite.code);
    expect(lines.some((line) => line.includes(code.slice(0, 40)))).toBe(false);
    expect(lines.some((line) => line.includes('relay_adopted'))).toBe(true);
  });

  it('keeps the relay of a node that already joined someone, and refuses a relay it may not adopt (E_INVITE_RELAY)', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    const julieHome = newHome(julie, privateConfig(DEFAULT_RELAY_URL, 'human', 0));
    const newcomer = await serve(julieHome);
    const before = readFileSync(join(julieHome.root, 'config.json'), 'utf8');
    for (const relayUrl of ['ws://drop.memolabs.dev/v1', 'wss://8.8.8.8/v1']) {
      const code = encodeInvite(await createInvite(guillaume, relayUrl));
      const preview = await post(newcomer, julieHome, '/ui/pair/preview', { code });
      expect(preview, relayUrl).toMatchObject({ status: 400, json: { error: 'E_INVITE_RELAY' } });
      const joined = await post(newcomer, julieHome, '/ui/pair', { code });
      expect(joined.json.error, relayUrl).toBe('E_INVITE_RELAY');
    }
    expect(readFileSync(join(julieHome.root, 'config.json'), 'utf8')).toBe(before);
    expect(newcomer.engine.peers()).toEqual([]);
    // Once she has a team, an invite through another relay keeps hers: the pairing uses every path she has.
    newcomer.engine.createTeam('Maison');
    const elsewhere = encodeInvite(await createInvite(guillaume, 'wss://drop.memolabs.dev/v1'));
    expect((await post(newcomer, julieHome, '/ui/pair/preview', { code: elsewhere })).json.relay).toBe('kept');
    expect((await post(newcomer, julieHome, '/ui/pair', { code: elsewhere })).json.relay).toBe('kept');
    expect(julieHome.config().relayUrl).toBe(DEFAULT_RELAY_URL);
  });

  it('accepts a link once even on two quick « Rejoindre », and moves no relay while a pairing is pending', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const marc = await generateIdentity('Marc');
    const julie = await generateIdentity('Julie');
    const home = newHome(
      julie,
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: 'ws://127.0.0.1:9/v1', ownerKind: 'human' }),
    );
    const sent: Envelope[] = [];
    const adopted: string[] = [];
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const engine = new NodeEngine({
      identity: julie,
      ownerKind: 'human',
      store: home,
      capabilities: [],
      transport: {
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve('delivered');
        },
      },
      relayPlan: (_url, fresh) => (fresh ? 'adopt' : 'kept'),
      adoptRelay: async (url) => {
        adopted.push(url);
        await gate;
      },
    });
    const code = encodeInvite(await createInvite(guillaume, 'wss://team.example/v1'));
    const first = engine.join(code);
    const second = engine.join(code);
    release();
    expect((await first).relay).toBe('adopt');
    expect(await refusal(second)).toBe('E_INVITE_USED');
    expect(sent).toHaveLength(1);
    // Guillaume has not answered yet: another link may pair, but never moves the relay a second time.
    const other = encodeInvite(await createInvite(marc, 'wss://other.example/v1'));
    expect((await engine.join(other)).relay).toBe('kept');
    expect(adopted).toEqual(['wss://team.example/v1']);
  });

  it('answers each refusal with its stable code: modified, expired, own, reused, unreadable', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    const julieHome = newHome(
      julie,
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: 'ws://127.0.0.1:9/v1', ownerKind: 'human' }),
    );
    const newcomer = await serve(julieHome);
    const code = encodeInvite(await createInvite(guillaume, 'ws://127.0.0.1:9/v1'));
    const raw = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Record<string, unknown>;
    const modified = Buffer.from(JSON.stringify({ ...raw, displayName: 'Banque' })).toString('base64url');
    const expired = encodeInvite(await createInvite(guillaume, 'ws://127.0.0.1:9/v1', Date.now() - 25 * 3_600_000));
    const own = encodeInvite(await createInvite(julie, 'ws://127.0.0.1:9/v1'));
    for (const [input, error] of [
      [modified, 'E_INVITE_SIG'],
      [expired, 'E_INVITE_EXPIRED'],
      [own, 'E_INVITE'],
      ['drop://link?session=abc', 'E_INVITE'],
    ] as const) {
      const answer = await post(newcomer, julieHome, '/ui/pair', { code: input });
      expect(answer.status, error).toBe(400);
      expect(answer.json, error).toMatchObject({ error, code: error });
      expect(String(answer.json.message)).not.toContain(input);
    }
    expect((await post(newcomer, julieHome, '/ui/pair', { code: `drop://join?invite=${code}` })).status).toBe(200);
    const again = await post(newcomer, julieHome, '/ui/pair/preview', { code });
    expect(again.json).toMatchObject({ error: 'E_INVITE_USED' });
    expect((await post(newcomer, julieHome, '/ui/pair', { code })).json.error).toBe('E_INVITE_USED');
  });

  it('remembers accepted invites across a restart: a reused link stays refused (E_INVITE_USED)', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    const home = newHome(
      julie,
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: 'ws://127.0.0.1:9/v1', ownerKind: 'human' }),
    );
    const code = encodeInvite(await createInvite(guillaume, 'ws://127.0.0.1:9/v1'));
    const sent: Envelope[] = [];
    await engineOn(julie, home, sent).join(code);
    expect(sent).toHaveLength(1);
    // Owner-only where the system has modes; Windows has no 0600 to read back.
    if (process.platform !== 'win32') expect(statSync(join(home.root, 'invites.json')).mode & 0o777).toBe(0o600);
    // The file keeps a hash of the token, never the token itself.
    expect(readFileSync(join(home.root, 'invites.json'), 'utf8')).not.toContain(decodeInvite(code).oneTimeToken);
    const restarted = engineOn(julie, home, sent);
    expect(await refusal(restarted.join(code))).toBe('E_INVITE_USED');
    expect(sent).toHaveLength(1);
  });

  it('the inviter honours a link sent before its restart, once, and forgets it when it expires', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    const natha = await generateIdentity('Natha');
    const clock = { now: Date.now() };
    const home = newHome(
      guillaume,
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: 'ws://127.0.0.1:9/v1', ownerKind: 'human' }),
    );
    const sent: Envelope[] = [];
    const first = decodeInvite(await engineOn(guillaume, home, sent, () => clock.now).invite('ws://127.0.0.1:9/v1'));
    const late = decodeInvite(await engineOn(guillaume, home, sent, () => clock.now).invite('ws://127.0.0.1:9/v1'));
    // The Mac restarts: a new engine on the same home.
    const restarted = engineOn(guillaume, home, sent, () => clock.now);
    const request = async (from: Identity, token: string) =>
      restarted.handleEnvelope(
        await sealEnvelope(
          from,
          guillaume.nodeId,
          { type: 'pair_request', oneTimeToken: token, displayName: from.displayName, ownerKind: 'human' },
          { now: clock.now },
        ),
      );
    await request(julie, first.oneTimeToken);
    expect(restarted.peers().map((peer) => peer.displayName)).toEqual(['Julie']);
    await request(natha, first.oneTimeToken);
    expect(restarted.peers().map((peer) => peer.displayName)).toEqual(['Julie']);
    clock.now += 24 * 3_600_000 + 1;
    await request(natha, late.oneTimeToken);
    expect(restarted.peers().map((peer) => peer.displayName)).toEqual(['Julie']);
  });
});

describe('join hardening (T4.33)', () => {
  it('adopts a relay only from the default loopback relay: a relay set by hand is kept', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    // A fresh node, no peer and no team, whose owner chose an internal relay with drop init --relay.
    const julieHome = newHome(julie, privateConfig('ws://10.0.0.9:7780/v1', 'human', 0));
    const lines: string[] = [];
    const newcomer = await serve(julieHome, lines);
    const before = readFileSync(join(julieHome.root, 'config.json'), 'utf8');
    const code = encodeInvite(await createInvite(guillaume, 'wss://drop.memolabs.dev/v1'));
    expect((await post(newcomer, julieHome, '/ui/pair/preview', { code })).json.relay).toBe('kept');
    const joined = await post(newcomer, julieHome, '/ui/pair', { code });
    expect(joined).toMatchObject({ status: 200, json: { nodeId: guillaume.nodeId, relay: 'kept' } });
    expect(readFileSync(join(julieHome.root, 'config.json'), 'utf8')).toBe(before);
    expect(newcomer.relay.url).toBe('ws://10.0.0.9:7780/v1');
    // The pairing request still leaves, through every path this node has.
    expect(lines.some((line) => line.includes('invite_accepted') && line.includes('relay_kept'))).toBe(true);
    expect(lines.some((line) => line.includes('relay_adopted'))).toBe(false);
  });

  it('switching relay keeps every listed origin and never lists the adopted relay', async () => {
    const julie = await generateIdentity('Julie');
    const origins = ['ws://127.0.0.1:7780', 'http://127.0.0.1:11434', 'http://10.20.0.4:8080'];
    const home = newHome(julie, privateConfig(DEFAULT_RELAY_URL, 'human', 0, { origins }));
    const adopted = switchRelay(home, 'ws://10.0.0.5:7780/v1');
    expect(adopted).toMatchObject({ relayUrl: 'ws://10.0.0.5:7780/v1', relayAdopted: true });
    expect(adopted.network?.origins).toEqual(origins);
    // A restart reads it back: the marker alone exempts the adopted literal relay from being a listed origin.
    expect(home.config()).toMatchObject({ relayUrl: 'ws://10.0.0.5:7780/v1', relayAdopted: true });
    expect(home.config().network?.origins).toEqual(origins);
    expect(() => NodeConfigSchema.parse({ ...adopted, relayAdopted: undefined })).toThrow();
  });

  it('answers E_LOCKED or E_CONFLICT, not E_INVITE_RELAY, when config.json cannot be rewritten, and keeps the invite usable', async () => {
    const guillaume = await generateIdentity('Guillaume');
    const julie = await generateIdentity('Julie');
    const julieHome = newHome(julie, privateConfig(DEFAULT_RELAY_URL, 'human', 0));
    const lines: string[] = [];
    const newcomer = await serve(julieHome, lines);
    const before = readFileSync(join(julieHome.root, 'config.json'), 'utf8');
    const code = encodeInvite(await createInvite(guillaume, 'ws://127.0.0.1:9/v1'));
    // Another operation holds the configuration lock.
    const lock = join(julieHome.root, '.private-migration.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid }), { mode: 0o600 });
    const locked = await post(newcomer, julieHome, '/ui/pair', { code });
    expect(locked).toMatchObject({ status: 400, json: { error: 'E_LOCKED', code: 'E_LOCKED' } });
    expect(String(locked.json.message)).not.toContain(code);
    expect(String(locked.json.message)).not.toBe('');
    expect(readFileSync(join(julieHome.root, 'config.json'), 'utf8')).toBe(before);
    expect(lines.some((line) => line.includes('"code":"E_LOCKED"'))).toBe(true);
    expect(lines.some((line) => line.includes('invite_accepted'))).toBe(false);
    rmSync(lock);
    const joined = await post(newcomer, julieHome, '/ui/pair', { code });
    expect(joined).toMatchObject({ status: 200, json: { relay: 'adopt' } });
    expect(julieHome.config().relayUrl).toBe('ws://127.0.0.1:9/v1');

    // The same for a configuration that changed during the rewrite, through the engine's own refusal.
    const marc = await generateIdentity('Marc');
    const home = newHome(
      marc,
      NodeConfigSchema.parse({ profile: 'legacy', relayUrl: DEFAULT_RELAY_URL, ownerKind: 'human' }),
    );
    const sent: Envelope[] = [];
    let conflict = true;
    const engine = new NodeEngine({
      identity: marc,
      ownerKind: 'human',
      store: home,
      capabilities: [],
      transport: {
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve('delivered');
        },
      },
      relayPlan: (_url, fresh) => (fresh ? 'adopt' : 'kept'),
      adoptRelay: () =>
        conflict ? Promise.reject(new DropError('E_CONFLICT', 'E_CONFLICT configuration changed')) : Promise.resolve(),
    });
    const other = encodeInvite(await createInvite(guillaume, 'wss://team.example/v1'));
    expect(await refusal(engine.join(other))).toBe('E_CONFLICT');
    expect(sent).toHaveLength(0);
    conflict = false;
    expect((await engine.join(other)).relay).toBe('adopt');
    expect(sent).toHaveLength(1);
  });
});
