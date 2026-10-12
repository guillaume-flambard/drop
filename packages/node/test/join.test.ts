import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInvite,
  decodeInvite,
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
import { DropHome, NodeConfigSchema, type NodeConfig } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';

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
    // Julie's app was opened before the link: a private identity on the loopback default, where no relay runs.
    const julieHome = newHome(julie, privateConfig('ws://127.0.0.1:9/v1', 'human', 0));
    const lines: string[] = [];
    const newcomer = await serve(julieHome, lines);

    const { json: invite } = await post(owner, ownerHome, '/ui/invite');
    const link = String(invite.link);
    expect(link.startsWith('https://drop.memolabs.dev/join#')).toBe(true);
    expect(link.slice(link.indexOf('#') + 1)).toBe(invite.code);

    const preview = await post(newcomer, julieHome, '/ui/pair/preview', { code: link });
    expect(preview.json).toMatchObject({ displayName: 'Guillaume', team: 'Atelier', relay: 'adopt' });
    // Nothing moved before « Rejoindre ».
    expect(julieHome.config().relayUrl).toBe('ws://127.0.0.1:9/v1');
    expect(newcomer.relay.url).toBe('ws://127.0.0.1:9/v1');

    const joined = await post(newcomer, julieHome, '/ui/pair', { code: link });
    expect(joined.json).toMatchObject({ nodeId: guillaume.nodeId, relay: 'adopt', next: 'connect_agents' });
    await until(() => newcomer.engine.peers().some((peer) => peer.nodeId === guillaume.nodeId));
    expect(julieHome.config()).toMatchObject({ profile: 'private', relayUrl: relay.url });
    // The old loopback relay leaves the private destinations, the new literal one joins them.
    expect([...(julieHome.config().network?.origins ?? [])].sort()).toEqual(
      ['http://127.0.0.1:11434', new URL(relay.url).origin].sort(),
    );
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
    const julieHome = newHome(julie, privateConfig('ws://127.0.0.1:9/v1', 'human', 0));
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
    expect(julieHome.config().relayUrl).toBe('ws://127.0.0.1:9/v1');
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
