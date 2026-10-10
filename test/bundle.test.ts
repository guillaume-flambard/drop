import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

/** Sends one JSON-RPC request to a stdio MCP server and resolves with its first reply line. */
function ask(command: string[], env: NodeJS.ProcessEnv, message: unknown): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, command, { env });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`no reply; stdout: ${out}`));
    }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      const line = out.split('\n').find((candidate) => candidate.trim().startsWith('{'));
      if (line) {
        clearTimeout(timer);
        child.kill();
        done(line);
      }
    });
    child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

describe('the bundled files that ship outside the repo (D29, T2.18)', () => {
  let out: string;

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), 'drop-bundle-'));
    const built = spawnSync(process.execPath, [join(root, 'scripts', 'bundle.ts'), '--out', out], {
      encoding: 'utf8',
    });
    expect(built.status, built.stderr).toBe(0);
  }, 60_000);

  afterAll(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('drop.mjs runs its own command on a fresh DROP_HOME, without starting the requester MCP server', async () => {
    const home = join(mkdtempSync(join(tmpdir(), 'drop-bundle-home-')), '.drop');
    const env = { ...process.env, DROP_HOME: home };
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [join(out, 'drop.mjs'), ...args], { env, encoding: 'utf8', timeout: 15_000 });
    const init = run(
      'init',
      '--profile',
      'legacy',
      '--name',
      'Julie',
      '--kind',
      'human',
      '--relay',
      'wss://relay.example/v1',
    );
    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toContain('initialized');
    const help = run('help');
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('drop <command>');

    // drop-mcp.mjs, on the other hand, is the requester MCP server: it answers an MCP initialize.
    const reply = await ask([join(out, 'drop-mcp.mjs')], env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'bundle-test', version: '1' } },
    });
    expect(JSON.parse(reply)).toMatchObject({ id: 1, result: { serverInfo: { name: 'drop' } } });
  }, 30_000);
});
