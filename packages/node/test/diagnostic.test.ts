import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { scanSecrets } from '@drop/runner';
import { startDaemon } from '../src/daemon.ts';
import { buildDiagnostic, type DiagnosticStatus } from '../src/diagnostic.ts';
import { DEFAULT_RELAY_URL, DropHome } from '../src/home.ts';
import { APP_LOG, DAEMON_LOG, logsDir } from '../src/logs.ts';
import { privateConfig } from '../src/private-config.ts';
import { ENGINE_VERSION } from '../src/version.ts';

const roots: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ANTHROPIC = 'sk-ant-api03-' + 'Z9y8X7w6V5u4'.repeat(4);
const UPDATE_TOKEN = 'upd4te-t0ken-Q1w2E3r4T5y6U7i8O9p0';

async function newHome(): Promise<{ home: DropHome; user: string }> {
  const base = mkdtempSync(join(tmpdir(), 'drop-diag-'));
  roots.push(base);
  const user = join(base, 'user-home');
  const home = new DropHome(join(user, '.drop'));
  home.init(await generateIdentity('Zoé Diagnostic'), privateConfig(DEFAULT_RELAY_URL, 'human', 0));
  return { home, user };
}

const status: DiagnosticStatus = {
  appVersion: '0.4.2',
  profile: 'private',
  relayConnected: false,
  lan: 'on',
  internet: 'off',
  peers: 2,
  policy: false,
};

describe('redacted diagnostic (T4.37)', () => {
  it('never exports a planted secret, from the daemon log, the app log or the node files', async () => {
    const { home, user } = await newHome();
    mkdirSync(logsDir(home.root), { recursive: true });
    // A log written before T4.37, without redaction, and the shell's own log.
    writeFileSync(
      join(logsDir(home.root), 'daemon.log.legacy'),
      [
        JSON.stringify({ event: 'model_error', code: 'E_RUNNER', reason: `bad key ${ANTHROPIC}` }),
        // Built in pieces, as in the runner's tests, so that no file of the repository holds a key header.
        ['-----BEGIN', 'RSA PRIVATE KEY-----', 'not-a-key'].join(' '),
      ].join('\n') + '\n',
    );
    writeFileSync(
      join(logsDir(home.root), DAEMON_LOG),
      [
        JSON.stringify({ event: 'api_request_failed', code: 'E_INTERNAL', path: `/app?token=${home.localToken()}` }),
        JSON.stringify({ event: 'relay_status', code: 'E_OFFLINE' }),
      ].join('\n') + '\n',
    );
    writeFileSync(
      join(logsDir(home.root), APP_LOG),
      JSON.stringify({ at: 1, code: 'E_UPDATE_CHECK', detail: `https://drop.example/updates?token=${UPDATE_TOKEN}` }) +
        '\n',
    );
    const { secretKey } = JSON.parse(readFileSync(join(home.root, 'identity.json'), 'utf8')) as { secretKey: string };
    const diagnostic = buildDiagnostic({ root: home.root, home: user, status, known: [home.localToken()] });
    for (const secret of [ANTHROPIC, home.localToken(), UPDATE_TOKEN, 'RSA PRIVATE KEY', secretKey])
      expect(diagnostic.text).not.toContain(secret);
    expect(diagnostic.removed).toBe(1);
    expect(diagnostic.text).toContain('1 ligne retirée');
    expect(scanSecrets(diagnostic.text)).toEqual([]);
    // The redacted lines still say what happened.
    for (const kept of ['E_RUNNER', 'E_INTERNAL', 'E_OFFLINE', 'E_UPDATE_CHECK'])
      expect(diagnostic.text).toContain(kept);
  });

  it('exports versions, system and states, and leaves out keys, token, peers and request contents', async () => {
    const { home, user } = await newHome();
    home.savePeer({ nodeId: 'P'.repeat(43), displayName: 'Paulette Peer', ownerKind: 'human', pairedAt: '2026-10-01' });
    mkdirSync(logsDir(home.root), { recursive: true });
    writeFileSync(
      join(logsDir(home.root), DAEMON_LOG),
      JSON.stringify({ event: 'config_unreadable', code: 'E_CONFIG', path: join(user, '.cursor', 'mcp.json') }) + '\n',
    );
    const diagnostic = buildDiagnostic({ root: home.root, home: user, status, now: () => Date.UTC(2026, 9, 12) });
    const text = diagnostic.text;
    expect(text).toContain('Diagnostic drop');
    expect(text).toContain('2026-10-12T00:00:00.000Z');
    expect(text).toContain('App : 0.4.2');
    expect(text).toContain(`Moteur : ${ENGINE_VERSION}`);
    expect(text).toContain(`Système : ${platform()}`);
    expect(text).toContain(arch());
    expect(text).toContain('Profil : private');
    expect(text).toContain('Relais : non connecté');
    expect(text).toContain('Pairs connus : 2');
    // The home folder reads ~, in the path of the log and inside the lines.
    expect(text).toContain(join('~', '.drop', 'logs', 'daemon.log'));
    expect(text).toContain(join('~', '.cursor', 'mcp.json'));
    expect(text).not.toContain(user);
    // Nothing of the identity, the peers, the team or the requests.
    const identity = readFileSync(join(home.root, 'identity.json'), 'utf8');
    const { nodeId } = JSON.parse(identity) as { nodeId: string };
    for (const left of [nodeId, 'Zoé Diagnostic', 'Paulette Peer', home.localToken(), '"relayUrl"'])
      expect(text).not.toContain(left);
    expect(diagnostic.logDir).toBe(logsDir(home.root));
    expect(diagnostic.logPath).toBe(join(logsDir(home.root), DAEMON_LOG));
  });

  it('never exports a custom DROP_HOME outside the account home, including a long path', () => {
    const foreignRoot = join(tmpdir(), 'Portable-Q2pj1fwZvABXy8T7K0G96rhLaEDCb39nFvMn5sTw', '.drop');
    const text = buildDiagnostic({ root: foreignRoot, home: join(tmpdir(), 'different-home'), status }).text;
    expect(text).not.toContain(foreignRoot);
    expect(text).toContain(join('~', '.drop', 'logs', 'daemon.log'));
    expect(scanSecrets(text)).toEqual([]);
  });

  it('serves the diagnostic and opens the logs folder only with the token', async () => {
    const { home } = await newHome();
    const opened: string[] = [];
    const daemon = await startDaemon(home, {
      apiPort: 0,
      notifications: false,
      log: () => undefined,
      openFolder: (dir) => {
        opened.push(dir);
        return Promise.resolve();
      },
    });
    cleanups.push(() => daemon.stop());
    const base = `http://127.0.0.1:${String(daemon.api.port)}`;
    const auth = { Authorization: `Bearer ${home.localToken()}` };
    expect((await fetch(`${base}/ui/admin/diagnostic`)).status).toBe(401);
    expect((await fetch(`${base}/ui/admin/logs/open`, { method: 'POST' })).status).toBe(401);
    expect(opened).toEqual([]);

    const response = await fetch(`${base}/ui/admin/diagnostic`, { headers: auth });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { text: string; logDir: string; removed: number };
    expect(body.text).toContain('Diagnostic drop');
    expect(body.logDir).toBe(logsDir(home.root));
    expect(scanSecrets(body.text)).toEqual([]);

    const open = await fetch(`${base}/ui/admin/logs/open`, { method: 'POST', headers: auth });
    expect(open.status).toBe(200);
    expect(opened).toEqual([logsDir(home.root)]);
    expect(opened).not.toContain(home.root);

    // The status gives the versions and the logs folder to the panel and the workspace.
    const state = (await (await fetch(`${base}/ui/admin/status`, { headers: auth })).json()) as Record<string, unknown>;
    expect(state).toMatchObject({ version: { engine: ENGINE_VERSION }, logDir: logsDir(home.root) });
  });

  it('exports no ending of a key and no control or bidi character that could forge a section (review of PR #82)', async () => {
    const { home, user } = await newHome();
    mkdirSync(logsDir(home.root), { recursive: true });
    const key = 'Zm9vYmFyYmF6cXV4cXV1eHh5enp6eXl4eHd3dnZ1/9rE4=';
    const hex = 'a3f9'.repeat(16);
    writeFileSync(
      join(logsDir(home.root), 'daemon.log.legacy'),
      [
        `raw key ${key}`,
        JSON.stringify({ event: 'seed', code: 'E_SEED', nodeSeed: hex }),
        JSON.stringify({
          event: 'forged',
          code: 'E_FORGED',
          reason: 'x\nDiagnostic drop, préparé le 2026-01-01\u001b[31m red \u202egnp.exe',
        }),
      ].join('\n') + '\n',
    );
    const { text } = buildDiagnostic({ root: home.root, home: user, status });
    for (const secret of ['/9rE4=', key.slice(0, 20), hex.slice(0, 16)]) expect(text).not.toContain(secret);
    expect(text.split('\n').filter((line) => line.startsWith('Diagnostic drop'))).toHaveLength(1);
    const unsafe = Array.from(text).filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return (code < 0x20 && code !== 0x0a) || code === 0x7f || (code >= 0x202a && code <= 0x202e);
    });
    expect(unsafe).toEqual([]);
    expect(text).toContain('E_FORGED');
    expect(text).toContain('\\u001b');
  });
});
