import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cursorInstallLink, install, serverEntry } from '../src/install.ts';

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'install-home-'));
  const dropHome = join(home, '.drop');
  const source = join(home, 'drop-mcp.mjs');
  writeFileSync(source, '// bundled requester server\n');
  const ran: string[][] = [];
  return {
    home,
    dropHome,
    source,
    ran,
    options: { dropHome, home, serverSource: source, run: (argv: string[]) => ran.push(argv) },
  };
}

describe('installing drop in the coding agents (T2.5)', () => {
  it('uses the official CLI of Claude Code and Codex, with the bundled server copied into DROP_HOME', () => {
    const { dropHome, ran, options } = setup();
    install('claude_code', options);
    install('codex', options);
    const server = join(dropHome, 'bin', 'drop-mcp.mjs');
    expect(statSync(server).mode & 0o777).toBe(0o755);
    expect(ran).toEqual([
      ['claude', 'mcp', 'remove', '--scope', 'user', 'drop'],
      [
        'claude',
        'mcp',
        'add',
        '--scope',
        'user',
        'drop',
        '-e',
        'DROP_AGENT=claude_code',
        '-e',
        `DROP_HOME=${dropHome}`,
        '--',
        process.execPath,
        server,
      ],
      ['codex', 'mcp', 'remove', 'drop'],
      [
        'codex',
        'mcp',
        'add',
        'drop',
        '--env',
        'DROP_AGENT=codex',
        '--env',
        `DROP_HOME=${dropHome}`,
        '--',
        process.execPath,
        server,
      ],
    ]);
    ran.length = 0;
    install('codex', options, true);
    expect(ran).toEqual([['codex', 'mcp', 'remove', 'drop']]);
  });

  it('adds and removes only the drop entry in the Cursor and Claude Desktop files, after one backup', () => {
    const { home, dropHome, options } = setup();
    mkdirSync(join(home, '.cursor'));
    const cursor = join(home, '.cursor', 'mcp.json');
    writeFileSync(cursor, JSON.stringify({ mcpServers: { linear: { url: 'https://mcp.linear.app/sse' } }, other: 1 }));
    install('cursor', options);
    install('cursor', options);
    const written = JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: Record<string, unknown>; other: number };
    expect(Object.keys(written.mcpServers)).toEqual(['linear', 'drop']);
    expect(written.mcpServers.drop).toEqual({
      command: process.execPath,
      args: [join(dropHome, 'bin', 'drop-mcp.mjs')],
      env: { DROP_AGENT: 'cursor', DROP_HOME: dropHome },
    });
    expect(written.other).toBe(1);
    expect(JSON.parse(readFileSync(`${cursor}.bak-drop`, 'utf8'))).toEqual({
      mcpServers: { linear: { url: 'https://mcp.linear.app/sse' } },
      other: 1,
    });
    install('cursor', options, true);
    expect(Object.keys((JSON.parse(readFileSync(cursor, 'utf8')) as { mcpServers: object }).mcpServers)).toEqual([
      'linear',
    ]);

    install('claude_desktop', options);
    const desktop = join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    expect(existsSync(desktop)).toBe(true);
    expect(JSON.parse(readFileSync(desktop, 'utf8'))).toMatchObject({
      mcpServers: { drop: { env: { DROP_AGENT: 'claude_desktop' } } },
    });
  });

  it('builds a Cursor install link that carries the server entry', () => {
    const entry = serverEntry('cursor', '/Users/julie/.drop', '/Users/julie/.drop/bin/drop-mcp.mjs');
    const link = new URL(cursorInstallLink(entry));
    expect(link.protocol).toBe('cursor:');
    expect(link.searchParams.get('name')).toBe('drop');
    expect(JSON.parse(Buffer.from(link.searchParams.get('config') ?? '', 'base64').toString('utf8'))).toEqual(entry);
  });
});
