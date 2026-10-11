import { chmodSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentServers, CLIENTS, projectServers, type ClientHost, type InstallProbe } from '@drop/capabilities';
import { detectAgents, presentServer } from '../src/detect.ts';
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
  const empty: InstallProbe = { home, apps: [], path: '', platform: 'darwin' };
  const full: InstallProbe = { home, apps: [apps], path: bin, platform: 'darwin' };
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
  // These fixtures are laid out as on macOS, whatever system runs the tests.
  const host: ClientHost = { home, platform: 'darwin', env: {} };
  return { root, home, host, apps, bin, dropHome, source, empty, full, support };
}

describe('mcp clients (T4.5)', () => {
  it("reads each client's documented global configuration, including JSONC, TOML and YAML, without any secret value", () => {
    const f = fixture();
    const agents = detectAgents(f.host, f.full);
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
    const gooseServer = agentServers('goose', f.host)[0];
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
    // Only Claude Code and Codex go through their official command; the eleven others through their file (D84).
    expect(agents.filter((agent) => agent.connect === 'cli').map((agent) => agent.agent)).toEqual([
      'claude_code',
      'codex',
    ]);
  });

  it('tells an installed client by its app or binary, never by a configuration folder alone', () => {
    const f = fixture();
    const installed = (probe: InstallProbe) =>
      Object.fromEntries(detectAgents(f.host, probe).map((agent) => [agent.agent, agent.installed]));
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
});
