import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOnboarding, manualOnboarding, previewOnboarding } from '../src/onboarding.ts';
import { renderPanel } from '../src/panel.ts';

function cursorPlan(options: Parameters<typeof previewOnboarding>[0]) {
  const plan = previewOnboarding(options).find((item) => item.agent === 'cursor');
  if (!plan) throw new Error('cursor plan missing');
  return plan;
}

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'drop-onboarding-'));
  const dropHome = join(home, '.drop');
  const source = join(home, 'drop-mcp.mjs');
  writeFileSync(source, '// test server\n');
  const cursor = join(home, '.cursor', 'mcp.json');
  mkdirSync(join(home, '.cursor'));
  return { home, dropHome, source, cursor };
}

describe('local agent onboarding (T3.3)', () => {
  it('AC-CONNECT-01 analyzes known adapters without exposing secret values', () => {
    const f = fixture();
    const executed: string[][] = [];
    writeFileSync(
      join(f.home, '.claude.json'),
      JSON.stringify({
        mcpServers: { github: { command: 'node', args: ['claude-secret'], env: { TOKEN: 'claude-value' } } },
      }),
    );
    mkdirSync(join(f.home, '.codex'));
    writeFileSync(
      join(f.home, '.codex', 'config.toml'),
      '[mcp_servers.github]\ncommand = "node"\nargs = ["codex-secret"]\n',
    );
    const desktopDir = join(f.home, 'Library', 'Application Support', 'Claude');
    mkdirSync(desktopDir, { recursive: true });
    writeFileSync(
      join(desktopDir, 'claude_desktop_config.json'),
      JSON.stringify({ mcpServers: { github: { command: 'node', args: ['desktop-secret'] } } }),
    );
    writeFileSync(
      f.cursor,
      JSON.stringify({
        mcpServers: { notion: { command: 'node', args: ['secret-argument'], env: { TOKEN: 'secret-value' } } },
      }),
    );
    const plans = previewOnboarding({
      home: f.home,
      dropHome: f.dropHome,
      serverSource: f.source,
      // Laid out as on macOS, whatever system runs the tests.
      platform: 'darwin',
      // No app or binary in this temporary home: the nine clients added in T4.5 are absent.
      probe: { home: f.home, apps: [], path: '', platform: 'darwin' },
      run: (argv) => {
        executed.push(argv);
      },
    });
    expect(plans).toHaveLength(13);
    const known = ['claude_code', 'claude_desktop', 'cursor', 'codex'];
    expect(plans.filter((plan) => known.includes(plan.agent)).every((plan) => plan.state === 'ready')).toBe(true);
    expect(plans.filter((plan) => !known.includes(plan.agent)).every((plan) => plan.state === 'absent')).toBe(true);
    expect(plans.find((plan) => plan.agent === 'cursor')?.state).toBe('ready');
    expect(JSON.stringify(plans)).not.toContain('secret-value');
    expect(JSON.stringify(plans)).not.toContain('secret-argument');
    expect(JSON.stringify(plans)).not.toContain('claude-secret');
    expect(JSON.stringify(plans)).not.toContain('codex-secret');
    expect(JSON.stringify(plans)).not.toContain('desktop-secret');
    expect(JSON.stringify(plans)).not.toContain('claude-value');
    expect(executed).toEqual([]);
  });

  it('AC-CONNECT-02 and AC-CONNECT-03 changes only the selected entry, then becomes idempotent', async () => {
    const f = fixture();
    writeFileSync(f.cursor, JSON.stringify({ theme: 'dark', mcpServers: { notion: { url: 'https://example.test' } } }));
    const plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    const result = await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], {
      home: f.home,
      dropHome: f.dropHome,
      serverSource: f.source,
    });
    expect(result[0]?.state).toBe('connected');
    const changed = JSON.parse(readFileSync(f.cursor, 'utf8')) as {
      theme: string;
      mcpServers: Record<string, unknown>;
    };
    expect(changed.theme).toBe('dark');
    expect(changed.mcpServers.notion).toEqual({ url: 'https://example.test' });
    expect(changed.mcpServers.drop).toBeDefined();
    expect(existsSync(join(f.dropHome, 'capabilities'))).toBe(false);
    const again = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    expect(again.state).toBe('already_connected');
    expect(
      (
        await applyOnboarding([{ agent: 'cursor', fingerprint: again.fingerprint, action: 'connect' }], {
          home: f.home,
          dropHome: f.dropHome,
          serverSource: f.source,
        })
      )[0]?.state,
    ).toBe('already_connected');
  });

  it('AC-CONNECT-03 refuses an existing entry with different settings', async () => {
    const f = fixture();
    const original = JSON.stringify({ mcpServers: { drop: { command: 'other', args: [] } } });
    writeFileSync(f.cursor, original);
    const plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    expect(plan.state).toBe('conflict');
    expect(
      (
        await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], {
          home: f.home,
          dropHome: f.dropHome,
          serverSource: f.source,
        })
      )[0]?.state,
    ).toBe('conflict');
    expect(readFileSync(f.cursor, 'utf8')).toBe(original);
  });

  it('AC-CONNECT-04 reports a missing CLI without changing its file', () => {
    const f = fixture();
    const claude = join(f.home, '.claude.json');
    const original = JSON.stringify({ mcpServers: {} });
    writeFileSync(claude, original);
    const priorPath = process.env.PATH;
    try {
      process.env.PATH = '';
      const plan = previewOnboarding({ home: f.home, dropHome: f.dropHome, serverSource: f.source }).find(
        (item) => item.agent === 'claude_code',
      );
      expect(plan?.state).toBe('error');
      expect(plan?.detail).toBe('E_CLI_MISSING');
      expect(readFileSync(claude, 'utf8')).toBe(original);
    } finally {
      process.env.PATH = priorPath;
    }
  });

  it('AC-CONNECT-04 and AC-CONNECT-05 refuses malformed and changed files without overwriting', async () => {
    const f = fixture();
    writeFileSync(f.cursor, '{bad');
    expect(
      previewOnboarding({ home: f.home, dropHome: f.dropHome, serverSource: f.source }).find(
        (p) => p.agent === 'cursor',
      )?.state,
    ).toBe('error');
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: {} }));
    const plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: { added: { command: 'node' } } }));
    expect(
      (
        await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], {
          home: f.home,
          dropHome: f.dropHome,
          serverSource: f.source,
        })
      )[0]?.state,
    ).toBe('changed');
    expect(readFileSync(f.cursor, 'utf8')).toContain('added');
  });

  it('AC-CONNECT-06 removes only the owned entry after a third-party addition', async () => {
    const f = fixture();
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: {} }));
    let plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], {
      home: f.home,
      dropHome: f.dropHome,
      serverSource: f.source,
    });
    const config = JSON.parse(readFileSync(f.cursor, 'utf8')) as { mcpServers: Record<string, unknown> };
    config.mcpServers.added = { command: 'other' };
    writeFileSync(f.cursor, JSON.stringify(config));
    plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    expect(
      (
        await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'disconnect' }], {
          home: f.home,
          dropHome: f.dropHome,
          serverSource: f.source,
        })
      )[0]?.state,
    ).toBe('disconnected');
    const final = JSON.parse(readFileSync(f.cursor, 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(final.mcpServers.added).toEqual({ command: 'other' });
    expect(final.mcpServers.drop).toBeUndefined();
  });

  it('uses each CLI without a preceding remove and verifies its resulting configuration', async () => {
    const f = fixture();
    const claude = join(f.home, '.claude.json');
    const codexDir = join(f.home, '.codex');
    const codex = join(codexDir, 'config.toml');
    mkdirSync(codexDir);
    writeFileSync(claude, JSON.stringify({ mcpServers: { other: { command: 'node' } } }));
    writeFileSync(codex, 'model = "local"\n');
    const ran: string[][] = [];
    const run = (argv: string[]) => {
      ran.push(argv);
      const agent = argv[0] === 'codex' ? 'codex' : 'claude_code';
      const entry = {
        command: process.execPath,
        args: [join(f.dropHome, 'bin', 'drop-mcp.mjs')],
        env: { DROP_AGENT: agent, DROP_HOME: f.dropHome },
      };
      if (agent === 'claude_code') {
        const parsed = JSON.parse(readFileSync(claude, 'utf8')) as { mcpServers: Record<string, unknown> };
        parsed.mcpServers.drop = entry;
        writeFileSync(claude, JSON.stringify(parsed));
      } else {
        writeFileSync(
          codex,
          `model = "local"\n[mcp_servers.drop]\ncommand = ${JSON.stringify(entry.command)}\nargs = [${JSON.stringify(entry.args[0])}]\n[mcp_servers.drop.env]\nDROP_AGENT = "codex"\nDROP_HOME = ${JSON.stringify(f.dropHome)}\n`,
        );
      }
    };
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source, run };
    const plans = previewOnboarding(options);
    const selected = plans
      .filter((plan) => plan.agent === 'claude_code' || plan.agent === 'codex')
      .map((plan) => ({ agent: plan.agent, fingerprint: plan.fingerprint, action: 'connect' as const }));
    expect((await applyOnboarding(selected, options)).map((item) => item.state)).toEqual(['connected', 'connected']);
    expect(ran).toHaveLength(2);
    expect(ran.every((argv) => argv[2] === 'add')).toBe(true);
    expect(JSON.stringify(readFileSync(claude, 'utf8'))).toContain('other');
  });

  it('reports a CLI that returns without installing instead of claiming success', async () => {
    const f = fixture();
    const claude = join(f.home, '.claude.json');
    writeFileSync(claude, JSON.stringify({ mcpServers: {} }));
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source, run: () => {} };
    const plan = previewOnboarding(options).find((item) => item.agent === 'claude_code');
    if (!plan) throw new Error('Claude Code plan missing');
    expect(
      (await applyOnboarding([{ agent: 'claude_code', fingerprint: plan.fingerprint, action: 'connect' }], options))[0]
        ?.state,
    ).toBe('error');
    expect(JSON.parse(readFileSync(claude, 'utf8'))).toEqual({ mcpServers: {} });
  });

  it('AC-CONNECT-08 offers a manual stdio entry without broad permissions', () => {
    const f = fixture();
    expect(manualOnboarding({ home: f.home, dropHome: f.dropHome, serverSource: f.source })).toEqual({
      command: process.execPath,
      args: [f.source],
      env: { DROP_AGENT: 'other', DROP_HOME: f.dropHome },
    });
  });

  it('AC-CONNECT-05 preserves a competing write during the JSON transaction', async () => {
    const f = fixture();
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: {} }));
    const plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    const result = await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], {
      home: f.home,
      dropHome: f.dropHome,
      serverSource: f.source,
      beforeJsonCommit: () => {
        writeFileSync(f.cursor, JSON.stringify({ mcpServers: { other: { command: 'node' } } }));
      },
    });
    expect(result[0]?.state).toBe('changed');
    expect(readFileSync(f.cursor, 'utf8')).toContain('other');
    expect(readFileSync(f.cursor, 'utf8')).not.toContain('drop-mcp');
  });

  it('AC-CONNECT-07 reports agent restart independently of team connectivity', async () => {
    const f = fixture();
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: {} }));
    const plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    const result = await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], {
      home: f.home,
      dropHome: f.dropHome,
      serverSource: f.source,
    });
    expect(result[0]).toMatchObject({ state: 'connected', restartRequired: true });
    expect(renderPanel()).toContain("status.relayConnected ? ' · connecté' : ' · hors ligne'");
  });

  it('keeps only three private backups for repeated connections and disconnections', async () => {
    const f = fixture();
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: {} }));
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source };
    for (let i = 0; i < 3; i += 1) {
      let plan = cursorPlan(options);
      expect(
        (await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], options))[0]
          ?.state,
      ).toBe('connected');
      plan = cursorPlan(options);
      expect(
        (await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'disconnect' }], options))[0]
          ?.state,
      ).toBe('disconnected');
    }
    const dir = join(f.dropHome, 'backups', 'onboarding');
    const files = readdirSync(dir);
    expect(files).toHaveLength(3);
    expect(files.every((file) => (statSync(join(dir, file)).mode & 0o777) === 0o600)).toBe(true);
  });

  it('connects Claude Desktop without touching other MCP entries', async () => {
    const f = fixture();
    const path = join(f.home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    mkdirSync(join(f.home, 'Library', 'Application Support', 'Claude'), { recursive: true });
    writeFileSync(path, JSON.stringify({ mcpServers: { github: { command: 'node', env: { KEY: 'private' } } } }));
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source, platform: 'darwin' as const };
    const plan = previewOnboarding(options).find((item) => item.agent === 'claude_desktop');
    if (!plan) throw new Error('Claude Desktop plan missing');
    expect(plan.state).toBe('ready');
    expect(JSON.stringify(plan)).not.toContain('private');
    expect(
      (
        await applyOnboarding([{ agent: 'claude_desktop', fingerprint: plan.fingerprint, action: 'connect' }], options)
      )[0]?.state,
    ).toBe('connected');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      mcpServers: { github: { env: { KEY: 'private' } }, drop: { env: { DROP_AGENT: 'claude_desktop' } } },
    });
  });

  it('does not follow a symlink at the bundled connector destination', async () => {
    const f = fixture();
    writeFileSync(f.cursor, JSON.stringify({ mcpServers: {} }));
    const victim = join(f.home, 'victim');
    writeFileSync(victim, 'must stay intact');
    const bin = join(f.dropHome, 'bin');
    mkdirSync(bin, { recursive: true });
    symlinkSync(victim, join(bin, 'drop-mcp.mjs'));
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source };
    const plan = cursorPlan(options);
    expect(
      (await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], options))[0]
        ?.state,
    ).toBe('connected');
    expect(readFileSync(victim, 'utf8')).toBe('must stay intact');
    expect(readFileSync(join(bin, 'drop-mcp.mjs'), 'utf8')).toContain('test server');
  });

  it('refuses a symlinked backup directory before changing an agent file', async () => {
    const f = fixture();
    const original = JSON.stringify({ mcpServers: {} });
    writeFileSync(f.cursor, original);
    const target = join(f.home, 'elsewhere');
    mkdirSync(target);
    mkdirSync(f.dropHome);
    symlinkSync(target, join(f.dropHome, 'backups'));
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source };
    const plan = cursorPlan(options);
    expect(
      (await applyOnboarding([{ agent: 'cursor', fingerprint: plan.fingerprint, action: 'connect' }], options))[0]
        ?.state,
    ).toBe('error');
    expect(readFileSync(f.cursor, 'utf8')).toBe(original);
    expect(readdirSync(target)).toEqual([]);
  });

  it('reports a symlinked agent config as an error instead of treating it as absent', () => {
    const f = fixture();
    const target = join(f.home, 'real-config.json');
    writeFileSync(target, JSON.stringify({ mcpServers: {} }));
    symlinkSync(target, f.cursor);
    const plan = cursorPlan({ home: f.home, dropHome: f.dropHome, serverSource: f.source });
    expect(plan.state).toBe('error');
    expect(readFileSync(target, 'utf8')).toBe(JSON.stringify({ mcpServers: {} }));
  });
});
