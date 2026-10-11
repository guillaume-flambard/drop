import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentServers, CLIENTS, projectServers, type InstallProbe } from '@drop/capabilities';
import { detectAgents, presentServer } from '../src/detect.ts';
import { serverEntry } from '../src/install.ts';
import { applyOnboarding, previewOnboarding } from '../src/onboarding.ts';
import { addProject, listProjects, removeProject } from '../src/projects.ts';

const SECRET = 'secret-value-7f3a';

function put(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'clients-')));
  const home = join(root, 'home');
  const apps = join(root, 'Applications');
  const bin = join(root, 'bin');
  for (const dir of [home, apps, bin]) mkdirSync(dir, { recursive: true });
  const dropHome = join(home, '.drop');
  mkdirSync(dropHome);
  const source = join(root, 'drop-mcp.mjs');
  writeFileSync(source, '// requester server');
  const support = join(home, 'Library', 'Application Support');
  const stdio = (name: string) => ({
    [name]: { command: 'npx', args: [`${name}-mcp`, SECRET], env: { TOKEN: SECRET } },
  });
  put(join(home, '.claude.json'), JSON.stringify({ mcpServers: stdio('figma') }));
  put(
    join(support, 'Claude', 'claude_desktop_config.json'),
    JSON.stringify({ mcpServers: stdio('notion'), preferences: {} }),
  );
  put(join(home, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: stdio('linear') }));
  put(
    join(home, '.codex', 'config.toml'),
    `[mcp_servers.github]\ncommand = "npx"\nargs = ["github-mcp", "${SECRET}"]\n[mcp_servers.github.env]\nTOKEN = "${SECRET}"\n`,
  );
  put(
    join(home, '.config', 'opencode', 'opencode.jsonc'),
    `\uFEFF{
  // OpenCode v2 keeps servers under mcp.servers
  "mcp": {
    "timeout": { "startup": 10 },
    "servers": {
      "jira": { "type": "local", "command": ["npx", "jira-mcp", "${SECRET}"], "environment": { "TOKEN": "${SECRET}" } },
      "off": { "type": "local", "command": ["npx", "off"], "disabled": true },
    },
  },
}`,
  );
  put(
    join(home, '.gemini', 'settings.json'),
    JSON.stringify({
      mcpServers: { slack: { httpUrl: 'https://mcp.slack.example/mcp', headers: { Authorization: SECRET } } },
    }),
  );
  put(join(home, '.config', 'devin', 'mcp_config.json'), JSON.stringify({ mcpServers: stdio('sentry') }));
  put(
    join(home, '.config', 'zed', 'settings.json'),
    `{\n  /* Zed settings */\n  "context_servers": { "datadog": { "command": "npx", "args": ["datadog-mcp"], "env": { "DD_KEY": "${SECRET}" } }, // "old": {}\n  },\n  "theme": "One // Dark", /* last */\n}`,
  );
  put(
    join(home, '.config', 'goose', 'config.yaml'),
    `GOOSE_PROVIDER: openai\nextensions:\n  hubspot:\n    name: HubSpot\n    type: stdio\n    cmd: npx # the runner\n    args:\n    - hubspot-mcp\n    - --read-only\n    envs:\n      HUBSPOT_TOKEN: ${SECRET}\n    enabled: true\n  disabled_one:\n    type: stdio\n    cmd: npx\n    enabled: false\n  quoted:\n    type: stdio\n    cmd: npx\n    args: ["-y", "pkg,with,comma"]\n`,
  );
  put(
    join(support, 'Code', 'User', 'mcp.json'),
    `{\n  // VS Code user profile\n  "servers": { "gitlab": { "type": "http", "url": "https://gitlab.example/mcp", "headers": { "Authorization": "${SECRET}" } } }\n}`,
  );
  put(
    join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json'),
    JSON.stringify({ mcpServers: stdio('postgres') }),
  );
  put(
    join(support, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
    JSON.stringify({ mcpServers: stdio('google') }),
  );
  put(join(home, '.junie', 'mcp', 'mcp.json'), JSON.stringify({ mcpServers: stdio('confluence') }));
  const empty: InstallProbe = { home, apps: [], path: '' };
  const full: InstallProbe = { home, apps: [apps], path: bin };
  for (const app of [
    'Claude.app',
    'Cursor.app',
    'OpenCode.app',
    'Devin.app',
    'Zed.app',
    'Visual Studio Code.app',
    'PyCharm CE.app',
  ])
    mkdirSync(join(apps, app));
  for (const binary of ['claude', 'codex', 'gemini', 'goose', 'code']) {
    writeFileSync(join(bin, binary), '');
    chmodSync(join(bin, binary), 0o755);
  }
  // Cline from Cursor's extension folder, Roo Code from VS Code's.
  mkdirSync(join(home, '.cursor', 'extensions', 'saoudrizwan.claude-dev-4.1.23'), { recursive: true });
  mkdirSync(join(home, '.vscode', 'extensions', 'rooveterinaryinc.roo-cline-3.54.0'), { recursive: true });
  return { root, home, apps, bin, dropHome, source, empty, full, support };
}

describe('mcp clients (T4.5)', () => {
  it("reads each client's documented global configuration, including JSONC, TOML and YAML, without any secret value", () => {
    const f = fixture();
    const agents = detectAgents(f.home, f.full);
    expect(agents.map((agent) => agent.agent)).toEqual([...CLIENTS]);
    const servers = Object.fromEntries(
      agents.map((agent) => [agent.agent, agent.servers.map((server) => server.name)]),
    );
    expect(servers).toEqual({
      claude_code: ['figma'],
      claude_desktop: ['notion'],
      cursor: ['linear'],
      codex: ['github'],
      opencode: ['jira'],
      gemini_cli: ['slack'],
      devin_desktop: ['sentry'],
      zed: ['datadog'],
      goose: ['hubspot'],
      vscode: ['gitlab'],
      cline: ['postgres'],
      roo_code: ['google'],
      jetbrains: ['confluence'],
    });
    const goose = agents.find((agent) => agent.agent === 'goose')?.servers[0];
    expect(goose).toMatchObject({ where: 'npx', envNames: ['HUBSPOT_TOKEN'], transport: 'stdio' });
    // The compact list keeps every argument, and an extension the subset cannot read exactly is left out.
    const gooseServer = agentServers('goose', f.home)[0];
    expect(gooseServer?.args).toEqual(['hubspot-mcp', '--read-only']);
    expect(gooseServer?.command).toBe('npx');
    // A client's own placeholders mean drop cannot start the server as written: shown, never offered for sharing.
    for (const value of ['${input:token}', '{env:GH_TOKEN}', '${env:HOME}'])
      expect(
        presentServer('vscode', { name: 'x', transport: 'stdio', command: 'npx', args: [value], env: {}, headers: {} })
          .shareable,
      ).toBe(false);
    expect(
      presentServer('vscode', { name: 'x', transport: 'stdio', command: 'npx', args: ['-y'], env: {}, headers: {} })
        .shareable,
    ).toBe(true);
    const vscode = agents.find((agent) => agent.agent === 'vscode')?.servers[0];
    expect(vscode).toMatchObject({ where: 'gitlab.example', headerNames: ['Authorization'], transport: 'http' });
    expect(agents.find((agent) => agent.agent === 'opencode')?.servers[0]).toMatchObject({
      where: 'npx',
      envNames: ['TOKEN'],
    });
    expect(JSON.stringify(agents)).not.toContain(SECRET);
    expect(agents.find((agent) => agent.agent === 'zed')?.connect).toBe('manual');
    expect(agents.find((agent) => agent.agent === 'gemini_cli')?.connect).toBe('cli');
    expect(agents.find((agent) => agent.agent === 'cline')?.connect).toBe('file');
  });

  it('tells an installed client by its app or binary, never by a configuration folder alone', () => {
    const f = fixture();
    const installed = (probe: InstallProbe) =>
      Object.fromEntries(detectAgents(f.home, probe).map((agent) => [agent.agent, agent.installed]));
    // Every config file exists, but no app, binary or extension: only the four clients of T3.3 count as installed.
    const bare = { ...f.empty, home: join(f.root, 'elsewhere') };
    mkdirSync(bare.home);
    expect(Object.values(installed(bare)).every((value) => !value)).toBe(true);
    const fromConfig = installed(f.empty);
    expect(fromConfig).toMatchObject({ claude_code: true, claude_desktop: true, cursor: true, codex: true });
    for (const agent of ['opencode', 'gemini_cli', 'devin_desktop', 'zed', 'goose', 'vscode', 'jetbrains'])
      expect(fromConfig[agent]).toBe(false);
    // Cline and Roo Code are found by their VS Code extension folders, the others by app or binary.
    expect(Object.values(installed(f.full)).every(Boolean)).toBe(true);
  });

  it('lists project configurations only for known or added projects, never by scanning the disk', () => {
    const f = fixture();
    const known = join(f.root, 'work', 'known');
    const added = join(f.root, 'work', 'added');
    const stranger = join(f.root, 'work', 'stranger');
    put(join(known, '.mcp.json'), JSON.stringify({ mcpServers: { notion: { command: 'npx', env: { K: SECRET } } } }));
    put(
      join(added, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { figma: { url: 'https://figma.example/mcp' } } }),
    );
    put(
      join(added, '.vscode', 'mcp.json'),
      `{ // VS Code workspace\n "servers": { "drop": { "type": "stdio", "command": "node", "args": ["requester-mcp"] } } }`,
    );
    put(join(stranger, '.mcp.json'), JSON.stringify({ mcpServers: { linear: { command: 'npx' } } }));
    const fromCodex = join(f.root, 'work', 'codex');
    put(join(fromCodex, '.codex', 'config.toml'), '[mcp_servers.sentry]\ncommand = "npx"\n');
    // A cloned repo may carry a symlink to a device: it is skipped, never read.
    symlinkSync('/dev/zero', join(fromCodex, '.mcp.json'));
    const started = Date.now();
    expect(projectServers('claude_code', fromCodex)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
    put(
      join(f.home, '.claude.json'),
      JSON.stringify({ projects: { [known]: { mcpServers: {} }, [f.home]: {}, '/': {} } }),
    );
    put(
      join(f.home, '.codex', 'config.toml'),
      `[projects."${fromCodex}"]\ntrust_level = "trusted"\n[projects."bad\\Uescape"]\n`,
    );
    expect(addProject(f.dropHome, added, f.home)).toBe(added);
    for (const refused of ['relative/path', '/', f.home, join(f.root, 'missing')])
      expect(() => addProject(f.dropHome, refused, f.home)).toThrow(/E_PROJECT_PATH/);
    const projects = listProjects(f.dropHome, f.home);
    // The home folder and the root are never projects, whoever lists them.
    expect(projects.map((project) => [project.dir, project.sources])).toEqual([
      [known, ['claude_code']],
      [fromCodex, ['codex']],
      [added, ['added']],
    ]);
    expect(projects[0]?.clients.map((client) => [client.agent, client.servers.map((server) => server.name)])).toEqual([
      ['claude_code', ['notion']],
    ]);
    expect(projects[1]?.clients.map((client) => [client.agent, client.servers.map((server) => server.name)])).toEqual([
      ['codex', ['sentry']],
    ]);
    expect(projects[2]?.clients.map((client) => [client.agent, client.dropInstalled])).toEqual([
      ['cursor', false],
      ['vscode', true],
    ]);
    expect(JSON.stringify(projects)).not.toContain(SECRET);
    expect(removeProject(f.dropHome, added)).toBe(true);
    expect(listProjects(f.dropHome, f.home).map((project) => project.dir)).toEqual([known, fromCodex]);
  });

  it('connects Gemini CLI and VS Code through their official commands and Cline through its file, then verifies', async () => {
    const f = fixture();
    const ran: string[][] = [];
    const geminiFile = join(f.home, '.gemini', 'settings.json');
    const vscodeFile = join(f.support, 'Code', 'User', 'mcp.json');
    const clineFile = join(f.home, '.cline', 'data', 'settings', 'cline_mcp_settings.json');
    // Stand-ins for the official commands: they write what the real ones write.
    const run = (argv: string[]) => {
      ran.push(argv);
      if (argv[1] === 'mcp' && argv.includes('add')) {
        const config = JSON.parse(readFileSync(geminiFile, 'utf8')) as { mcpServers: Record<string, unknown> };
        const env: Record<string, string> = {};
        argv.forEach((arg, index) => {
          if (argv[index - 1] !== '-e') return;
          const [key = '', value = ''] = arg.split('=');
          env[key] = value;
        });
        const name = argv.indexOf('drop');
        config.mcpServers.drop = { command: argv[name + 1], args: argv.slice(name + 2), env };
        writeFileSync(geminiFile, JSON.stringify(config));
      }
      if (argv[1] === '--add-mcp') {
        const entry = JSON.parse(argv[2] ?? '{}') as Record<string, unknown>;
        writeFileSync(vscodeFile, JSON.stringify({ servers: { drop: entry } }));
      }
    };
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source, probe: f.full, run };
    const plans = previewOnboarding(options);
    const select = (agent: string) => {
      const plan = plans.find((item) => item.agent === agent);
      expect(plan?.state).toBe('ready');
      return { agent: plan?.agent ?? 'cline', fingerprint: plan?.fingerprint ?? '', action: 'connect' as const };
    };
    const results = await applyOnboarding([select('gemini_cli'), select('vscode'), select('cline')], options);
    expect(results.map((result) => [result.agent, result.state])).toEqual([
      ['gemini_cli', 'connected'],
      ['vscode', 'connected'],
      ['cline', 'connected'],
    ]);
    expect(ran.map((argv) => argv.slice(0, 5))).toEqual([
      ['gemini', 'mcp', 'add', '--scope', 'user'],
      ['code', '--add-mcp', expect.stringContaining('"name":"drop"')],
    ]);
    const cline = JSON.parse(readFileSync(clineFile, 'utf8')) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(cline.mcpServers.postgres).toBeDefined();
    expect(cline.mcpServers.drop?.env).toEqual({ DROP_AGENT: 'cline', DROP_HOME: f.dropHome });
    // Connected now: a second analysis says so.
    const again = previewOnboarding(options);
    for (const agent of ['gemini_cli', 'vscode', 'cline'])
      expect(again.find((plan) => plan.agent === agent)?.state).toBe('already_connected');

    // Without the test seam: VS Code's official command is found inside its app, and a client whose command is
    // missing or not executable is never offered.
    const h = fixture();
    const shim = join(h.apps, 'Visual Studio Code.app', 'Contents', 'Resources', 'app', 'bin', 'code');
    put(shim, '#!/bin/sh\n');
    chmodSync(shim, 0o755);
    chmodSync(join(h.bin, 'gemini'), 0o644);
    const real = previewOnboarding({
      home: h.home,
      dropHome: h.dropHome,
      serverSource: h.source,
      probe: { ...h.full, path: join(h.root, 'nobin') },
    });
    expect(real.find((plan) => plan.agent === 'vscode')?.state).toBe('ready');
    const noGemini = previewOnboarding({ home: h.home, dropHome: h.dropHome, serverSource: h.source, probe: h.full });
    expect(noGemini.find((plan) => plan.agent === 'gemini_cli')?.detail).toBe('E_CLI_MISSING');

    // A command that changes nothing is reported, never assumed.
    const g = fixture();
    const silent = { home: g.home, dropHome: g.dropHome, serverSource: g.source, probe: g.full, run: () => undefined };
    const plan = previewOnboarding(silent).find((item) => item.agent === 'gemini_cli');
    expect(
      (
        await applyOnboarding(
          [{ agent: 'gemini_cli', fingerprint: plan?.fingerprint ?? '', action: 'connect' }],
          silent,
        )
      )[0]?.detail,
    ).toBe('E_CLI_UNVERIFIED');
  });

  it('runs the official command without blocking the daemon, then verifies what it wrote', async () => {
    const f = fixture();
    const geminiFile = join(f.home, '.gemini', 'settings.json');
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source, probe: f.full };
    const plan = previewOnboarding(options).find((item) => item.agent === 'gemini_cli');
    expect(plan?.state).toBe('ready');
    // A slow stand-in for `gemini mcp add`, found on the probe's PATH: it writes what the real one writes.
    const settings = JSON.parse(readFileSync(geminiFile, 'utf8')) as { mcpServers: Record<string, unknown> };
    settings.mcpServers.drop = serverEntry('gemini_cli', f.dropHome, join(f.dropHome, 'bin', 'drop-mcp.mjs'));
    const connected = join(f.root, 'connected.json');
    writeFileSync(connected, JSON.stringify(settings));
    writeFileSync(join(f.bin, 'gemini'), `#!/bin/sh\nsleep 0.3\ncp '${connected}' '${geminiFile}'\n`);
    let ticks = 0;
    const ticker = setInterval(() => {
      ticks += 1;
    }, 10);
    try {
      const results = await applyOnboarding(
        [{ agent: 'gemini_cli', fingerprint: plan?.fingerprint ?? '', action: 'connect' }],
        options,
      );
      expect(results.map((result) => result.state)).toEqual(['connected']);
    } finally {
      clearInterval(ticker);
    }
    expect(ticks).toBeGreaterThan(5);
  });

  it('offers a client-specific copyable configuration where no safe automatic connection exists', async () => {
    const f = fixture();
    const before = Object.fromEntries(
      [
        '.config/opencode/opencode.jsonc',
        '.config/zed/settings.json',
        '.config/goose/config.yaml',
        '.junie/mcp/mcp.json',
      ].map((relative) => [relative, readFileSync(join(f.home, relative), 'utf8')]),
    );
    const options = { home: f.home, dropHome: f.dropHome, serverSource: f.source, probe: f.full, run: () => undefined };
    const plans = previewOnboarding(options);
    const manual = (agent: string) => plans.find((plan) => plan.agent === agent);
    for (const agent of ['opencode', 'devin_desktop', 'zed', 'goose', 'roo_code', 'jetbrains']) {
      expect(manual(agent)).toMatchObject({ state: 'manual', action: 'none', detail: 'E_MANUAL_ONLY' });
      expect(manual(agent)?.manual?.snippet).toContain('DROP_AGENT');
    }
    expect(JSON.parse(manual('opencode')?.manual?.snippet ?? '{}')).toMatchObject({
      mcp: { servers: { drop: { type: 'local', environment: { DROP_AGENT: 'opencode' } } } },
    });
    expect(manual('opencode')?.manual?.snippet).toContain('"command": [');
    expect(JSON.parse(manual('zed')?.manual?.snippet ?? '{}')).toHaveProperty('context_servers.drop.command');
    expect(manual('goose')?.manual).toMatchObject({ format: 'yaml' });
    expect(manual('goose')?.manual?.snippet).toMatch(/^ {2}drop:\n {4}name: drop\n/);
    expect(manual('goose')?.manual?.snippet).toContain('    cmd: ');
    expect(manual('jetbrains')?.manual?.steps).toContain('Model Context Protocol (MCP)');
    expect(manual('roo_code')?.manual?.steps).toContain('archivé');
    // Even a forged selection never writes into these clients.
    const results = await applyOnboarding(
      ['opencode', 'zed', 'goose', 'jetbrains'].map((agent) => ({
        agent: agent as 'opencode',
        fingerprint: manual(agent)?.fingerprint ?? '',
        action: 'connect' as const,
      })),
      options,
    );
    expect(results.map((result) => result.state)).toEqual(['manual', 'manual', 'manual', 'manual']);
    // Nothing is prepared either: the requester server is not even copied for a client drop does not write.
    expect(existsSync(join(f.dropHome, 'bin', 'drop-mcp.mjs'))).toBe(false);
    for (const [relative, content] of Object.entries(before))
      expect(readFileSync(join(f.home, relative), 'utf8')).toBe(content);
  });
});
