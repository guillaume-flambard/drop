import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectAgents, shareId } from '../src/detect.ts';

describe('detecting agents and their MCP servers (T2.8)', () => {
  it('lists each agent, whether drop is installed, and what each server is, without any secret value', () => {
    const home = mkdtempSync(join(tmpdir(), 'detect-home-'));
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          'figma-desktop': { type: 'http', url: 'http://127.0.0.1:3845/mcp' },
          drop: { command: 'node', args: ['/x/packages/requester-mcp/src/index.ts'] },
          notion: {
            command: 'npx',
            args: ['-y', '@notionhq/notion-mcp-server', 'inline-secret-value'],
            env: { NOTION_TOKEN: 'ntn_secret_value' },
          },
        },
      }),
    );
    mkdirSync(join(home, '.cursor'));
    writeFileSync(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { crm: { url: 'https://mcp.hubspot.com/x' } } }),
    );
    const started = performance.now();
    const agents = detectAgents(home);
    expect(performance.now() - started).toBeLessThan(3000);
    const claude = agents.find((agent) => agent.agent === 'claude_code');
    expect(claude).toMatchObject({ installed: true, dropInstalled: true });
    expect(claude?.servers.map((server) => [server.name, server.kind, server.shareable])).toEqual([
      ['figma-desktop', 'figma', true],
      ['drop', undefined, false],
      ['notion', 'notion', true],
    ]);
    expect(claude?.servers[2]).toMatchObject({ where: 'npx', envNames: ['NOTION_TOKEN'] });
    expect(agents.find((agent) => agent.agent === 'cursor')?.servers[0]).toMatchObject({
      kind: 'crm',
      where: 'mcp.hubspot.com',
    });
    expect(JSON.stringify(agents)).not.toContain('ntn_secret_value');
    expect(JSON.stringify(agents)).not.toContain('inline-secret-value');
    expect(shareId({ name: 'figma-desktop', kind: 'figma' })).toBe('mcp.answer.figma');
    expect(shareId({ name: '42-Notion Team', kind: undefined })).toBe('mcp.answer.notion_team');
  });

  it('drop share publishes a detected server with its read-only tools, and never drop itself', () => {
    const fixture = resolve(
      import.meta.dirname,
      '..',
      '..',
      'capabilities',
      'test',
      'fixtures',
      'fake-design-mcp-stdio.ts',
    );
    const cli = resolve(import.meta.dirname, '..', 'src', 'cli.ts');
    const home = mkdtempSync(join(tmpdir(), 'share-home-'));
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          figma: { command: process.execPath, args: [fixture] },
          drop: { command: 'node', args: ['/x/packages/requester-mcp/src/index.ts'] },
        },
      }),
    );
    const dropHome = join(home, '.drop');
    const env = { ...process.env, HOME: home, USERPROFILE: home, DROP_HOME: dropHome };
    const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
    expect(
      run('init', '--profile', 'legacy', '--name', 'Julie', '--kind', 'human', '--relay', 'wss://relay.example/v1')
        .status,
    ).toBe(0);
    const shared = run('share', 'claude_code/figma');
    expect(shared.stdout).toContain('published mcp.answer.figma');
    const published = JSON.parse(readFileSync(join(dropHome, 'capabilities', 'mcp.answer.figma.json'), 'utf8')) as {
      config: { label: string; server: unknown; tools: string[] };
    };
    expect(published.config).toMatchObject({
      label: 'mon Figma',
      server: { transport: 'agent', agent: 'claude_code', name: 'figma' },
      tools: ['get_design_context'],
    });
    expect(run('share', 'claude_code/drop').stderr).toContain('fait partie de drop');
  }, 15_000);

  it('drop share checks the server first: OAuth-only, refused token, unreachable, missing or destructive tools (T2.16)', async () => {
    const fixture = resolve(
      import.meta.dirname,
      '..',
      '..',
      'capabilities',
      'test',
      'fixtures',
      'fake-design-mcp-stdio.ts',
    );
    // Answers like Notion's or Figma's remote servers to a client without a token: 401 pointing at OAuth metadata.
    const oauthOnly = createServer((req, res) => {
      req.resume();
      res.writeHead(401, {
        'WWW-Authenticate': 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"',
      });
      res.end();
    });
    await new Promise<void>((done) => oauthOnly.listen(0, '127.0.0.1', done));
    const address = oauthOnly.address();
    const url = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}/mcp`;
    const cli = resolve(import.meta.dirname, '..', 'src', 'cli.ts');
    const home = mkdtempSync(join(tmpdir(), 'share-check-home-'));
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          figma: { command: process.execPath, args: [fixture] },
          notion: { type: 'http', url },
          linear: { type: 'http', url, headers: { Authorization: 'Bearer lin_api_wrong' } },
          offline: { type: 'http', url: 'http://127.0.0.1:9/mcp' },
        },
      }),
    );
    const dropHome = join(home, '.drop');
    const env = { ...process.env, HOME: home, USERPROFILE: home, DROP_HOME: dropHome };
    // Asynchronous, so that the OAuth-only server above can answer while the CLI runs.
    const run = (...args: string[]) =>
      new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
        const child = spawn(process.execPath, [cli, ...args], { env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('close', (status) => {
          done({ status, stdout, stderr });
        });
      });
    try {
      expect(
        (
          await run(
            'init',
            '--profile',
            'legacy',
            '--name',
            'Natha',
            '--kind',
            'human',
            '--relay',
            'wss://relay.example/v1',
          )
        ).status,
      ).toBe(0);
      const oauth = await run('share', 'claude_code/notion', '--tools', 'search');
      expect(oauth.status).not.toBe(0);
      expect(oauth.stderr).toContain('demande une connexion OAuth');
      expect((await run('share', 'claude_code/linear')).stderr).toContain('refuse son jeton');
      expect((await run('share', 'claude_code/offline')).stderr).toContain('ne répond pas');
      const missing = await run('share', 'claude_code/figma', '--tools', 'get_design_context,get_comments');
      expect(missing.stderr).toContain('n’offre pas get_comments');
      expect(missing.stderr).toContain('get_design_context, delete_frame, export_all');
      expect((await run('share', 'claude_code/figma', '--tools', 'delete_frame')).stderr).toContain(
        'marque comme destructifs : delete_frame',
      );
      const capabilities = join(dropHome, 'capabilities');
      expect(existsSync(capabilities) ? readdirSync(capabilities) : []).toEqual([]);
      const shared = await run('share', 'claude_code/figma', '--tools', 'get_design_context');
      expect(shared.stdout).toContain('published mcp.answer.figma');
    } finally {
      oauthOnly.close();
    }
  }, 30_000);
});
