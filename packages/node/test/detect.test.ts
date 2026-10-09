import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
            args: ['-y', '@notionhq/notion-mcp-server'],
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
    expect(claude?.servers[2]).toMatchObject({ where: 'npx @notionhq/notion-mcp-server', envNames: ['NOTION_TOKEN'] });
    expect(agents.find((agent) => agent.agent === 'cursor')?.servers[0]).toMatchObject({
      kind: 'crm',
      where: 'mcp.hubspot.com',
    });
    expect(JSON.stringify(agents)).not.toContain('ntn_secret_value');
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
    const env = { ...process.env, HOME: home, DROP_HOME: dropHome };
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
    expect(run('share', 'claude_code/drop').stderr).toContain('part of drop itself');
  });
});
