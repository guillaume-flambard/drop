import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { arch, hostname, platform, release, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { scanSecrets } from '@drop/runner';
import {
  DAEMON_LOG,
  DaemonLog,
  installDaemonLog,
  LOG_LIMITS,
  logsDir,
  redactLogLine,
  scanLogLine,
  secretValues,
  type LogProcess,
} from '../src/logs.ts';
import { ENGINE_VERSION } from '../src/version.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const DAY = 24 * 60 * 60 * 1000;
const roots: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'drop-log-'));
  roots.push(root);
  return root;
}

function lines(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean);
}

/** A process as installDaemonLog sees it: what reaches its real stderr, and the code it exits with. */
class FakeProcess extends EventEmitter implements LogProcess {
  written: string[] = [];
  exitCode: number | undefined;
  stderr = {
    write: (chunk: string | Uint8Array): boolean => {
      this.written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    },
  };
  exit(code: number): void {
    this.exitCode = code;
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function until(check: () => boolean, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await sleep(100);
  }
  return false;
}

// Planted values: none may reach a log file.
const TOKEN = 'Qm9vdHN0cmFwLXRva2VuLWZvci10ZXN0cy0wMTIzNDU2Nzg5';
const ANTHROPIC = 'sk-ant-api03-' + 'A1b2C3d4E5f6'.repeat(4);
const GITHUB = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const BEARER = 'abcdefghijklmnop0123456789';
const PASSWORD = 'hunter2-hunter2';
const ENV_KEY = 'or-live-short-9Xy';

describe('daemon log (T4.37)', () => {
  it('keeps the previous run instead of emptying the log at start', async () => {
    const home = tempRoot();
    mkdirSync(join(home, 'user-home'));
    const apiPort = 30_000 + ((process.pid * 13 + 4_337) % 15_000);
    const env = {
      PATH: process.env.PATH ?? '',
      DROP_HOME: home,
      HOME: join(home, 'user-home'),
      USERPROFILE: join(home, 'user-home'),
      DROP_NOTIFY: 'off',
      DROP_LAN: 'off',
      DROP_LOG: 'file',
      DROP_APP_VERSION: '0.9.1',
    };
    execFileSync(
      process.execPath,
      [CLI, 'init', '--name', 'Logs', '--relay', `ws://127.0.0.1:${String(apiPort + 1)}/v1`, '--port', String(apiPort)],
      { env },
    );
    // A daemon.log left by a version before T4.37, emptied at each start, moves into the logs folder.
    writeFileSync(join(home, 'daemon.log'), '{"event":"before_t4_37"}\n');
    const file = join(logsDir(home), DAEMON_LOG);
    const headers = (): number =>
      existsSync(file) ? lines(file).filter((line) => line.includes('"log_header"')).length : 0;
    const run = async (count: number): Promise<void> => {
      const child = spawn(process.execPath, [CLI, 'serve'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
      children.push(child);
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      // The daemon reached its API: its relay status lines follow the header.
      expect(await until(() => headers() >= count && readFileSync(file, 'utf8').includes('relay:'))).toBe(true);
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
      // In file mode nothing of the daemon's own output reaches the real stderr.
      expect(stderr).toBe('');
    };
    await run(1);
    const first = lines(file);
    await run(2);
    const second = lines(file);
    // The first run, killed like a crash, is still there, followed by the second run's header.
    expect(second.slice(0, first.length)).toEqual(first);
    expect(headers()).toBe(2);
    const header = JSON.parse(second[first.length] ?? '{}') as Record<string, unknown>;
    expect(header).toMatchObject({ event: 'log_header', reason: 'start', app: '0.9.1', engine: ENGINE_VERSION });
    expect(readFileSync(join(logsDir(home), 'daemon.log.legacy'), 'utf8')).toContain('before_t4_37');
    expect(existsSync(join(home, 'daemon.log'))).toBe(false);
  }, 60_000);

  it('rotates by size and by age, keeps three files and deletes those older than fourteen days', () => {
    const root = tempRoot();
    // The real clock: retention compares it with file modification times.
    let now = Date.now();
    const header = { engine: ENGINE_VERSION, profile: 'private' };
    const log = new DaemonLog({ root, header, limits: { maxBytes: 2_000 }, now: () => now });
    log.start();
    const file = join(logsDir(root), DAEMON_LOG);
    const filler = JSON.stringify({ event: 'relay_status', code: 'E_OFFLINE', reason: 'x'.repeat(150) });
    for (let index = 0; index < 120; index += 1) log.write(filler);
    log.close();
    // Size: never past its limit by more than one line, three previous files at most.
    expect(statSync(file).size).toBeLessThan(2_000 + filler.length + 1);
    for (const kept of ['daemon.log.1', 'daemon.log.2', 'daemon.log.3'])
      expect(existsSync(join(logsDir(root), kept))).toBe(true);
    expect(existsSync(join(logsDir(root), 'daemon.log.4'))).toBe(false);
    // Each rotated-in file starts with its header.
    expect(JSON.parse(lines(file)[0] ?? '{}')).toMatchObject({ event: 'log_header', reason: 'rotate' });

    // Age: a file whose header is eight days old turns over at the next start, even when small.
    now += 8 * DAY;
    const previousFirst = lines(file)[0];
    // A rotated file untouched for fifteen days goes away.
    const stale = join(logsDir(root), 'daemon.log.3');
    utimesSync(stale, new Date(now - 15 * DAY), new Date(now - 15 * DAY));
    const later = new DaemonLog({ root, header, now: () => now });
    later.start();
    later.write(JSON.stringify({ event: 'after', code: 'E_NONE' }));
    later.close();
    expect(lines(join(logsDir(root), 'daemon.log.1'))[0]).toBe(previousFirst);
    expect(lines(file)).toHaveLength(2);
    const remaining = ['daemon.log.1', 'daemon.log.2', 'daemon.log.3'].filter((name) =>
      existsSync(join(logsDir(root), name)),
    );
    // The stale .3 was deleted before the chain moved down: .1 (the eight-day file), .2 and .3 (former .1 and .2).
    expect(remaining).toEqual(['daemon.log.1', 'daemon.log.2', 'daemon.log.3']);
    expect(LOG_LIMITS).toMatchObject({
      maxBytes: 2 * 1024 * 1024,
      keep: 3,
      rotateAfterMs: 7 * DAY,
      deleteAfterMs: 14 * DAY,
    });
  });

  it('starts each file and each run with a system header, without host or user name', () => {
    const root = tempRoot();
    const log = new DaemonLog({ root, header: { app: '1.2.3', engine: ENGINE_VERSION, profile: 'private' } });
    log.start();
    log.write('{"event":"one","code":"E_ONE"}');
    log.close();
    const again = new DaemonLog({ root, header: { app: '1.2.3', engine: ENGINE_VERSION, profile: 'private' } });
    again.start();
    again.close();
    const written = lines(join(logsDir(root), DAEMON_LOG));
    const header = JSON.parse(written[0] ?? '{}') as Record<string, unknown>;
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(ENGINE_VERSION).toBe(pkg.version);
    expect(header).toMatchObject({
      event: 'log_header',
      reason: 'start',
      app: '1.2.3',
      engine: ENGINE_VERSION,
      os: platform(),
      osRelease: release(),
      arch: arch(),
      node: process.versions.node,
      pid: process.pid,
      profile: 'private',
    });
    expect(typeof header.at).toBe('string');
    expect(JSON.parse(written[2] ?? '{}')).toMatchObject({ event: 'log_header', reason: 'start' });
    const text = written.join('\n');
    expect(text).not.toContain(hostname());
    expect(text).not.toContain(`"${userInfo().username}"`);
    if (platform() !== 'win32') {
      expect(statSync(logsDir(root)).mode & 0o777).toBe(0o700);
      expect(statSync(join(logsDir(root), DAEMON_LOG)).mode & 0o777).toBe(0o600);
    }
  });

  it('redacts patterns, key names and known values in the writing itself', () => {
    const root = tempRoot();
    const known = secretValues({ OPENROUTER_API_KEY: ENV_KEY, PATH: '/usr/bin', SHORT_TOKEN: 'abc' }, [TOKEN]);
    expect(known).toEqual([ENV_KEY, TOKEN]);
    const log = new DaemonLog({ root, header: { engine: ENGINE_VERSION }, known });
    log.start();
    const planted = [
      JSON.stringify({ event: 'api_request_failed', code: 'E_INTERNAL', path: `/app?token=${TOKEN}&x=1` }),
      JSON.stringify({ event: 'funding_failed', code: 'E_FUNDING', apiKey: 'tiny', password: PASSWORD }),
      JSON.stringify({ event: 'model_error', code: 'E_RUNNER', reason: `provider said ${ANTHROPIC} is invalid` }),
      `relay: Authorization: Bearer ${BEARER}`,
      `clone failed for https://x-access:${GITHUB}@github.com/a/b`,
      `env OPENROUTER_API_KEY=${ENV_KEY} rejected`,
      `TOKEN = ${PASSWORD}`,
      // Built in pieces, as in the runner's tests, so that no file of the repository holds a key header.
      ['-----BEGIN', 'OPENSSH PRIVATE KEY-----', 'not-a-key'].join(' '),
    ];
    for (const line of planted) log.write(line);
    log.close();
    const text = readFileSync(join(logsDir(root), DAEMON_LOG), 'utf8');
    for (const secret of [TOKEN, ANTHROPIC, GITHUB, BEARER, PASSWORD, ENV_KEY, 'tiny', 'OPENSSH PRIVATE KEY'])
      expect(text).not.toContain(secret);
    // The scanner reads a JSON line field by field, as it reads a capability output.
    for (const line of lines(join(logsDir(root), DAEMON_LOG))) expect(scanLogLine(line)).toEqual([]);
    // What makes a log useful stays: events, codes and the shape of the line.
    for (const kept of [
      'api_request_failed',
      'E_INTERNAL',
      'E_FUNDING',
      'model_error',
      '/app?token',
      'relay:',
      'Bearer',
    ])
      expect(text).toContain(kept);
    // A token the scanner finds becomes a short hash, the same each time, so lines still correlate.
    expect(redactLogLine(`peer ${ANTHROPIC}`)).toBe(redactLogLine(`again ${ANTHROPIC}`).replace('again', 'peer'));
    expect(redactLogLine(`peer ${ANTHROPIC}`)).toMatch(/^peer \[expurgé #[0-9a-f]{8}\]$/);
    // A line that still trips the scanner is replaced whole, keeping its event and code.
    expect(JSON.parse(lines(join(logsDir(root), DAEMON_LOG)).at(-1) ?? '{}')).toMatchObject({
      event: 'log_line_redacted',
      code: 'E_SECRET_DETECTED',
    });
    // The home folder becomes ~; a path the scanner would take for a secret keeps its end, file name and position.
    const frame = redactLogLine(
      'at start (file:///Users/someone/Applications/drop.app/Contents/Resources/drop.mjs:41523:17)',
      { home: '/Users/someone' },
    );
    expect(frame).not.toContain('someone');
    expect(frame).toMatch(/^at start \(.*Resources\/drop\.mjs:41523:17\)$/);
    expect(scanSecrets(frame)).toEqual([]);
    const temp = redactLogLine('at x (/var/folders/7k/qx1n2r3d4c5_6f7g8h9j0k0000gn/T/drop-test-XyZ12/drop.mjs:1:2)');
    expect(temp).toMatch(/^at x \(…\/.*drop\.mjs:1:2\)$/);
    expect(scanSecrets(temp)).toEqual([]);
    // A very long line is cut.
    expect(Buffer.byteLength(redactLogLine('a '.repeat(10_000)))).toBeLessThanOrEqual(LOG_LIMITS.maxLineBytes + 32);
  });

  it('logs a crash and every stray stderr write through the same redaction', () => {
    const root = tempRoot();
    const proc = new FakeProcess();
    const installed = installDaemonLog({
      root,
      env: { DROP_LOG: 'file' },
      proc,
      header: { engine: ENGINE_VERSION },
      known: [TOKEN],
    });
    expect(installed.path).toBe(join(logsDir(root), DAEMON_LOG));
    proc.stderr.write(`stray warning with ${GITHUB}\n`);
    proc.stderr.write('a line in ');
    proc.stderr.write(Buffer.from(`two parts ${TOKEN}\n`));
    proc.emit('uncaughtException', new Error(`boom ${ANTHROPIC}`));
    expect(proc.exitCode).toBe(1);
    installed.close();
    expect(proc.written).toEqual([]);
    const text = readFileSync(join(logsDir(root), DAEMON_LOG), 'utf8');
    for (const secret of [GITHUB, TOKEN, ANTHROPIC]) expect(text).not.toContain(secret);
    expect(text).toContain('stray warning with [expurgé #');
    expect(text).toContain('a line in two parts [expurgé]');
    const crash = lines(join(logsDir(root), DAEMON_LOG))
      .map((line) => JSON.parse(line.startsWith('{') ? line : '{}') as Record<string, unknown>)
      .find((entry) => entry.event === 'daemon_crash');
    expect(crash).toMatchObject({ code: 'E_CRASH', name: 'Error' });
    expect(String(crash?.message)).toMatch(/^boom \[expurgé #[0-9a-f]{8}\]$/);

    // Without DROP_LOG=file (drop serve in a terminal) the same redaction applies before the real stderr.
    const tty = new FakeProcess();
    const plain = installDaemonLog({
      root: tempRoot(),
      env: {},
      proc: tty,
      header: { engine: ENGINE_VERSION },
      known: [],
    });
    expect(plain.path).toBeUndefined();
    tty.stderr.write(`relay: Bearer ${BEARER}\n`);
    plain.close();
    expect(tty.written.join('')).toBe('relay: Bearer [expurgé]\n');
  });
});
