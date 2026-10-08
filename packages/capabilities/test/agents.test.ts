import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentServers, codexServers, connectMcp, toolResultText } from '../src/index.ts';

const FIXTURE = resolve(import.meta.dirname, 'fixtures', 'fake-design-mcp-stdio.ts');

/** A home directory with the four agents' config files, as found on macOS. */
function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'agents-home-'));
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        figma: {
          type: 'stdio',
          command: process.execPath,
          args: [FIXTURE],
          env: { FAKE_DESIGN_TOKEN: 'from-claude-file' },
        },
        notion: { type: 'http', url: 'https://mcp.notion.com/mcp', headers: { Authorization: 'Bearer x' } },
      },
      projects: { '/work/app': { mcpServers: { postgres: { command: 'npx', args: ['-y', 'mcp-postgres'] } } } },
    }),
  );
  mkdirSync(join(home, '.cursor'));
  writeFileSync(
    join(home, '.cursor', 'mcp.json'),
    JSON.stringify({ mcpServers: { linear: { url: 'https://mcp.linear.app/sse' } } }),
  );
  mkdirSync(join(home, 'Library', 'Application Support', 'Claude'), { recursive: true });
  writeFileSync(
    join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
    '{"preferences":{}}',
  );
  mkdirSync(join(home, '.codex'));
  writeFileSync(
    join(home, '.codex', 'config.toml'),
    [
      'model = "gpt-5"',
      '[mcp_servers.github]',
      'command = "docker"',
      'args = ["run", "-i", "ghcr.io/github/github-mcp-server"]',
      '[mcp_servers.github.env]',
      'GITHUB_PERSONAL_ACCESS_TOKEN = "ghp_fromcodex"',
      '[mcp_servers.old]',
      'command = "old-server"',
      'enabled = false',
      '[profiles.fast]',
      'command = "not-a-server"',
    ].join('\n'),
  );
  return home;
}

describe('MCP servers declared by the coding agents (T2.8)', () => {
  it('reads the servers of Claude Code, Cursor, Claude Desktop and Codex, with their env and headers', () => {
    const home = fakeHome();
    expect(agentServers('claude_code', home).map((server) => [server.name, server.transport])).toEqual([
      ['figma', 'stdio'],
      ['notion', 'http'],
      ['postgres', 'stdio'],
    ]);
    expect(agentServers('claude_code', home)[1]?.headers).toEqual({ Authorization: 'Bearer x' });
    expect(agentServers('cursor', home)).toMatchObject([
      { name: 'linear', transport: 'http', url: 'https://mcp.linear.app/sse' },
    ]);
    expect(agentServers('claude_desktop', home)).toEqual([]);
    expect(agentServers('codex', home)).toEqual([
      {
        name: 'github',
        transport: 'stdio',
        command: 'docker',
        args: ['run', '-i', 'ghcr.io/github/github-mcp-server'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_fromcodex' },
        headers: {},
      },
    ]);
    expect(agentServers('cursor', join(home, 'nowhere'))).toEqual([]);
    expect(codexServers('[mcp_servers."quoted name"]\nurl = "https://x.example/mcp" # comment\n')).toMatchObject([
      { name: 'quoted name', transport: 'http', url: 'https://x.example/mcp' },
    ]);
  });

  it('starts a server as its agent declares it, with the secrets read from the agent file at run time', async () => {
    const home = fakeHome();
    const previous = process.env.HOME;
    process.env.HOME = home;
    try {
      const client = await connectMcp({ transport: 'agent', agent: 'claude_code', name: 'figma' }, {});
      try {
        const result = await client.callTool({ name: 'get_design_context', arguments: { frame: 'Checkout' } });
        expect(toolResultText(result)).toContain('with token');
      } finally {
        await client.close();
      }
      await expect(connectMcp({ transport: 'agent', agent: 'claude_code', name: 'gone' }, {})).rejects.toThrow(/gone/);
    } finally {
      process.env.HOME = previous;
    }
  });
});
