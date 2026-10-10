import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cursorInstallLink, installSteps, serverEntry } from '../src/install.ts';

describe('agent installation command construction (T2.5)', () => {
  it('uses the official CLI argument forms for Claude Code and Codex', () => {
    const home = mkdtempSync(join(tmpdir(), 'drop-install-'));
    const dropHome = join(home, '.drop');
    const server = join(dropHome, 'bin', 'drop-mcp.mjs');
    const claude = serverEntry('claude_code', dropHome, server);
    const codex = serverEntry('codex', dropHome, server);
    expect(installSteps('claude_code', claude, home)[0]).toEqual({
      kind: 'run',
      argv: [
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
    });
    expect(installSteps('codex', codex, home)[0]).toEqual({
      kind: 'run',
      argv: [
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
    });
  });

  it('targets only the known JSON configuration paths', () => {
    const home = mkdtempSync(join(tmpdir(), 'drop-install-'));
    const entry = serverEntry('cursor', join(home, '.drop'), join(home, '.drop', 'bin', 'drop-mcp.mjs'));
    expect(installSteps('cursor', entry, home)).toEqual([
      { kind: 'json', file: join(home, '.cursor', 'mcp.json'), entry },
    ]);
    expect(installSteps('claude_desktop', null, home)).toEqual([
      {
        kind: 'json',
        file: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
        entry: null,
      },
    ]);
  });

  it('builds a Cursor install link with the server entry', () => {
    const entry = serverEntry('cursor', '/Users/julie/.drop', '/Users/julie/.drop/bin/drop-mcp.mjs');
    const link = new URL(cursorInstallLink(entry));
    expect(link.protocol).toBe('cursor:');
    expect(link.searchParams.get('name')).toBe('drop');
    expect(JSON.parse(Buffer.from(link.searchParams.get('config') ?? '', 'base64').toString('utf8'))).toEqual(entry);
  });
});
