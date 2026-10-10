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

/** A fresh private node on its own ports, its HOME inside the test directory, never notifying. */
function serve(apiPort: number, exitWithParent: boolean): ChildProcess {
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
  const child = spawn(process.execPath, [CLI, 'serve'], { env, stdio: ['pipe', 'ignore', 'ignore'] });
  children.push(child);
  return child;
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
});
