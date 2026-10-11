import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleOutDir } from '../scripts/bundle.ts';

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

describe('the bundle output directory, which the build empties first (B2)', () => {
  it('refuses --out without a value instead of emptying the working directory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'drop-bundle-cwd-'));
    const sentinel = join(cwd, 'keep.txt');
    writeFileSync(sentinel, 'must survive');
    try {
      const run = spawnSync(process.execPath, [join(root, 'scripts', 'bundle.ts'), '--out'], {
        cwd,
        encoding: 'utf8',
        timeout: 60_000,
      });
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('E_BUNDLE_OUT');
      expect(existsSync(sentinel)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  it('refuses an empty value, the repository, its ancestors and the home directory', () => {
    const home = homedir();
    for (const args of [
      ['--out'],
      ['--out', ''],
      ['--out', '--mcpb'],
      ['--out', root],
      ['--out', dirname(root)],
      ['--out', '/'],
      ['--out', home],
    ]) {
      expect(() => bundleOutDir(args, root, home), args.join(' ')).toThrow(/E_BUNDLE_OUT/);
    }
  });

  it('defaults to dist/ in the repository and accepts a separate directory', () => {
    const out = join(tmpdir(), 'drop-bundle-elsewhere');
    expect(bundleOutDir([], root, homedir())).toBe(join(root, 'dist'));
    expect(bundleOutDir(['--mcpb'], root, homedir())).toBe(join(root, 'dist'));
    expect(bundleOutDir(['--out', out], root, homedir())).toBe(out);
    // Resolved against the working directory: `/work` is `D:\work` on Windows, on the current drive.
    const cwd = resolve('/work');
    expect(bundleOutDir(['--out', 'build/out'], root, homedir(), cwd)).toBe(join(cwd, 'build', 'out'));
  });
});
