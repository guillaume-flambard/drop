// Checks the resources of an installed or unpacked desktop app the way the shell uses them (T3.7, T3.8): the bundled
// Node runs drop.mjs, creates a private identity like the first launch does, serves, answers the shell's health probe,
// finds drop-iroh next to itself, then stops by itself once its stdin pipe closes, as when the shell dies (T4.18).
// Usage: node scripts/desktop-smoke.ts <resources directory>
// Run by .github/workflows/release.yml on the macOS DMG, the Windows installer and the Linux packages.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/desktop-smoke.ts <resources directory>');
const resources = resolve(dir);
const windows = process.platform === 'win32';
const node = join(resources, windows ? 'node.exe' : 'node');
const iroh = join(resources, windows ? 'drop-iroh.exe' : 'drop-iroh');
const cli = join(resources, 'drop.mjs');

/** A port nobody listens on now: the default 7781 may belong to a drop already running on this machine. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        done(port);
      });
    });
  });
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`E_SMOKE: ${message}`);
  process.stdout.write(`ok  ${message}\n`);
}

for (const file of [node, iroh, cli, join(resources, 'drop-mcp.mjs'), join(resources, 'drop-iroh-NOTICE.txt')]) {
  check(existsSync(file), `${file} is bundled`);
}
if (!windows) {
  for (const program of [node, iroh]) {
    let runnable = true;
    try {
      accessSync(program, constants.X_OK);
    } catch {
      runnable = false;
    }
    check(runnable, `${program} is executable`);
  }
}

const version = spawnSync(node, ['--version'], { encoding: 'utf8' });
check(version.status === 0 && /^v\d+\./.test(version.stdout), `bundled Node runs (${version.stdout.trim()})`);
// drop-iroh reads its commands on stdin and stops when stdin closes; an empty stdin must end it quickly.
const irohRun = spawnSync(iroh, [], { input: '', timeout: 20_000 });
check(irohRun.error === undefined, `drop-iroh starts and stops on a closed stdin (exit ${String(irohRun.status)})`);

const temp = mkdtempSync(join(tmpdir(), 'drop-smoke-'));
const userHome = join(temp, 'home');
mkdirSync(userHome);
const env: Record<string, string> = {
  PATH: process.env.PATH ?? '',
  DROP_HOME: join(temp, 'drop'),
  HOME: userHome,
  USERPROFILE: userHome,
  DROP_NOTIFY: 'off',
  ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
};
try {
  // The shell's first launch (apps/desktop/src-tauri/src/main.rs, ensure_identity), on a loopback relay nobody serves.
  // The destination is chosen by this test, never taken from a file whose
  // content could point the local API token at the wrong loopback process.
  const smokePort = await freePort();
  const init = spawnSync(
    node,
    [
      cli,
      'init',
      '--profile',
      'private',
      '--name',
      'Smoke',
      '--kind',
      'human',
      '--relay',
      'ws://127.0.0.1:9/v1',
      '--port',
      String(smokePort),
    ],
    { env, encoding: 'utf8' },
  );
  check(init.status === 0, `drop init succeeds${init.status === 0 ? '' : `: ${init.stderr}`}`);
  check(existsSync(join(temp, 'drop', 'identity.json')), 'the first launch writes a private identity');
  const config = JSON.parse(readFileSync(join(temp, 'drop', 'config.json'), 'utf8')) as { apiPort: number };
  check(config.apiPort === smokePort, 'persisted API port equals the requested test-only port');

  // The bundle's shutdown/relaunch path is the same one used after a signed update.
  // Assert that private identity and authorization survive a real daemon restart.
  const originalIdentity = readFileSync(join(temp, 'drop', 'identity.json'), 'utf8');
  const originalPort = smokePort;
  let originalToken: string | undefined;

  for (const attempt of [1, 2]) {
    // An unpredictable instance marker prevents a different loopback process
    // from spoofing the health probe before we send a private API token.
    const marker = 'smoke-' + randomUUID();
    const daemon = spawn(node, [cli, 'serve'], {
      env: { ...env, DROP_EXIT_WITH_PARENT: 'stdin', DROP_SHELL_INSTANCE: marker },
      stdio: ['pipe', 'ignore', 'inherit'],
    });
    const exited = new Promise<number | null>((done) => {
      daemon.once('exit', (code) => {
        done(code);
      });
    });
    try {
      const deadline = Date.now() + 30_000;
      let healthy = false;
      while (!healthy && Date.now() < deadline) {
        try {
          const response = await fetch('http://127.0.0.1:' + String(originalPort) + '/_shell/health');
          const body = (await response.json()) as { instance?: string };
          healthy = response.ok && body.instance === marker;
        } catch {
          // Not listening yet.
        }
        if (!healthy) await new Promise((done) => setTimeout(done, 300));
      }
      check(healthy, 'launch ' + String(attempt) + ': daemon responds to the shell health probe');
      const token = readFileSync(join(temp, 'drop', 'local-token'), 'utf8').trim();
      check(token.length >= 32, 'the private local authorization token is available');
      if (originalToken === undefined) originalToken = token;
      else check(token === originalToken, 'restart did not rotate the private API token');

      const settings = await fetch('http://127.0.0.1:' + String(originalPort) + '/ui/admin/internet', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (settings.ok) {
        const internet = (await settings.json()) as { available?: boolean };
        check(internet.available === true, 'the daemon finds drop-iroh next to the bundled Node');
      } else {
        process.stdout.write('skip drop-iroh discovery, HTTP ' + String(settings.status) + '\n');
      }

      const unauthorized = await fetch('http://127.0.0.1:' + String(originalPort) + '/_shell/update-ready');
      check(unauthorized.status === 401, 'the update readiness API refuses unauthenticated callers');
      const readiness = await fetch('http://127.0.0.1:' + String(originalPort) + '/_shell/update-ready', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const readinessBody = (await readiness.json()) as { ready?: boolean };
      check(
        readiness.ok && typeof readinessBody.ready === 'boolean',
        'the shell can read authenticated update readiness',
      );

      check(
        readFileSync(join(temp, 'drop', 'identity.json'), 'utf8') === originalIdentity,
        'restart preserves the original cryptographic identity',
      );
      const currentConfig = JSON.parse(readFileSync(join(temp, 'drop', 'config.json'), 'utf8')) as { apiPort: number };
      check(currentConfig.apiPort === originalPort, 'restart preserves the private local API port');

      // The shell dies: the system closes its end of the pipe.
      daemon.stdin.end();
      const timeout = new Promise<string>((done) => {
        setTimeout(() => {
          done('timeout');
        }, 15_000);
      });
      const code = await Promise.race([exited, timeout]);
      check(code === 0, 'launch ' + String(attempt) + ': daemon stops with the shell (exit ' + String(code) + ')');
    } finally {
      if (daemon.exitCode === null) daemon.kill();
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
