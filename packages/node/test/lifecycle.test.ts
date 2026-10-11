import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const homes: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

/** A fresh private node on its own ports, its HOME inside the test directory, never notifying: its environment. */
function prepare(apiPort: number, exitWithParent: boolean): Record<string, string> {
  const home = mkdtempSync(join(tmpdir(), 'drop-lifecycle-'));
  homes.push(home);
  mkdirSync(join(home, 'user-home'));
  const env = {
    PATH: process.env.PATH ?? '',
    DROP_HOME: home,
    HOME: join(home, 'user-home'),
    DROP_NOTIFY: 'off',
    ...(exitWithParent ? { DROP_EXIT_WITH_PARENT: 'stdin' } : {}),
  };
  execFileSync(
    process.execPath,
    [
      CLI,
      'init',
      '--name',
      'Lifecycle',
      '--relay',
      `ws://127.0.0.1:${String(apiPort + 1)}/v1`,
      '--port',
      String(apiPort),
    ],
    { env },
  );
  expect(readFileSync(join(home, 'identity.json'), 'utf8')).toContain('nodeId');
  return env;
}

function serve(apiPort: number, exitWithParent: boolean): ChildProcess {
  const child = spawn(process.execPath, [CLI, 'serve'], {
    env: prepare(apiPort, exitWithParent),
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  children.push(child);
  return child;
}

/** True while a process with this id exists (signal 0 only checks, on every system). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(100);
  }
  return false;
}

const port = (offset: number) => 30_000 + ((process.pid * 11 + offset * 97) % 15_000);

describe('daemon lifecycle (T4.18)', () => {
  it("AC stops serving when the shell's stdin pipe closes, and only in that mode", async () => {
    // Both ports must be free first, or a foreign listener would fake the « still listening » checks.
    expect(await listening(port(1))).toBe(false);
    expect(await listening(port(2))).toBe(false);
    const watched = serve(port(1), true);
    const plain = serve(port(2), false);
    expect(await until(() => listening(port(1)), 30_000)).toBe(true);
    expect(await until(() => listening(port(2)), 30_000)).toBe(true);

    const exited = new Promise<number | null>((resolve) => {
      watched.once('exit', (code) => {
        resolve(code);
      });
    });
    watched.stdin?.end();
    plain.stdin?.end();
    expect(await Promise.race([exited, sleep(15_000).then(() => 'timeout')])).toBe(0);
    expect(await until(async () => !(await listening(port(1))), 5_000)).toBe(true);

    await sleep(2_000);
    expect(plain.exitCode).toBeNull();
    expect(await listening(port(2))).toBe(true);
  }, 90_000);

  // The desktop shell on Windows and Linux too (T3.7, T3.8): a parent holds the daemon's stdin pipe as the Tauri app does,
  // then is killed without a chance to clean up (SIGKILL, TerminateProcess on Windows). The system closes the pipe.
  it('stops serving when the process holding its stdin is killed, on every system', async () => {
    expect(await listening(port(3))).toBe(false);
    const env = prepare(port(3), true);
    // The shell: starts `drop serve` with a stdin pipe it keeps, prints the daemon's pid, then waits.
    const shell = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          "import { spawn } from 'node:child_process';",
          "const daemon = spawn(process.execPath, [process.argv[1], 'serve'], { stdio: ['pipe', 'ignore', 'ignore'] });",
          "process.stdout.write(String(daemon.pid) + '\\n');",
          'setInterval(() => {}, 1000);',
        ].join('\n'),
        CLI,
      ],
      { env, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    children.push(shell);
    const daemonPid = await new Promise<number>((resolve, reject) => {
      shell.stdout.once('data', (chunk: Buffer) => {
        resolve(Number(chunk.toString('utf8').trim()));
      });
      shell.once('exit', () => {
        reject(new Error('the shell stand-in exited early'));
      });
    });
    try {
      expect(await until(() => listening(port(3)), 30_000)).toBe(true);
      shell.kill('SIGKILL');
      expect(await until(() => Promise.resolve(!alive(daemonPid)), 15_000)).toBe(true);
      expect(await listening(port(3))).toBe(false);
    } finally {
      if (alive(daemonPid)) process.kill(daemonPid, 'SIGKILL');
    }
  }, 90_000);
});
