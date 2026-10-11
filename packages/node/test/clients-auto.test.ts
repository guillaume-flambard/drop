import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_SPECS,
  clientHost,
  clientInstalled,
  CLIENTS,
  defaultProbe,
  executableNames,
  type AgentKind,
  type ClientHost,
  type ClientPlatform,
  type InstallProbe,
} from '@drop/capabilities';
import { readJsonEntry, readYamlEntry } from '../src/config-edit.ts';
import { entryKeyPath, fallbackStep, serverEntry, shellLine } from '../src/install.ts';
import { windowsShimCommand } from '../src/official-command.ts';
import { applyOnboarding, previewOnboarding, type OnboardingOptions } from '../src/onboarding.ts';

const PLATFORMS: ClientPlatform[] = ['darwin', 'win32', 'linux'];
const FILE_CLIENTS: AgentKind[] = [
  'claude_desktop',
  'cursor',
  'opencode',
  'gemini_cli',
  'devin_desktop',
  'zed',
  'goose',
  'vscode',
  'cline',
  'roo_code',
  'jetbrains',
];

function put(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Each client's global file on each system, spelled out from its docs (docs/research/2026-10-11-clients-par-systeme.md). */
function expectedPath(agent: AgentKind, platform: ClientPlatform, home: string): string | undefined {
  const support = join(home, 'Library', 'Application Support');
  const roaming = join(home, 'AppData', 'Roaming');
  const config = join(home, '.config');
  const userData = platform === 'darwin' ? support : platform === 'win32' ? roaming : config;
  switch (agent) {
    case 'claude_desktop':
      return platform === 'linux' ? undefined : join(userData, 'Claude', 'claude_desktop_config.json');
    case 'cursor':
      return join(home, '.cursor', 'mcp.json');
    case 'opencode':
      return join(config, 'opencode', 'opencode.jsonc');
    case 'gemini_cli':
      return join(home, '.gemini', 'settings.json');
    case 'devin_desktop':
      return join(platform === 'win32' ? roaming : config, 'devin', 'mcp_config.json');
    case 'zed':
      return platform === 'win32' ? join(roaming, 'Zed', 'settings.json') : join(config, 'zed', 'settings.json');
    case 'goose':
      return platform === 'win32'
        ? join(roaming, 'Block', 'goose', 'config', 'config.yaml')
        : join(config, 'goose', 'config.yaml');
    case 'vscode':
      return join(userData, 'Code', 'User', 'mcp.json');
    case 'cline':
      return join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json');
    case 'roo_code':
      return join(
        userData,
        'Code',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json',
      );
    case 'jetbrains':
      return join(home, '.junie', 'mcp', 'mcp.json');
    case 'claude_code':
      return join(home, '.claude.json');
    case 'codex':
      return join(home, '.codex', 'config.toml');
  }
}

/** Where our entry sits in each file, and what it looks like there. */
function expectedEntry(agent: AgentKind, dropHome: string): { path: string[]; value: unknown } {
  const entry = serverEntry(agent, dropHome, join(dropHome, 'bin', 'drop-mcp.mjs'));
  const stdio = { command: entry.command, args: entry.args, env: entry.env };
  switch (agent) {
    case 'opencode':
      return {
        path: ['mcp', 'drop'],
        value: { type: 'local', command: [entry.command, ...entry.args], environment: entry.env, enabled: true },
      };
    case 'zed':
      return { path: ['context_servers', 'drop'], value: stdio };
    case 'vscode':
      return { path: ['servers', 'drop'], value: { type: 'stdio', ...stdio } };
    case 'goose':
      return {
        path: ['extensions', 'drop'],
        value: {
          name: 'drop',
          type: 'stdio',
          cmd: entry.command,
          args: entry.args,
          envs: entry.env,
          enabled: true,
          timeout: 300,
        },
      };
    default:
      return { path: ['mcpServers', 'drop'], value: stdio };
  }
}

/** A real-looking file for each client: comments where its format allows them, its own indentation, a neighbour. */
function original(agent: AgentKind): string {
  switch (agent) {
    case 'opencode':
      return '{\n  "$schema": "https://opencode.ai/config.json",\n  // my servers\n  "mcp": {\n    "jira": { "type": "local", "command": ["npx", "jira-mcp"] }, // work\n  },\n}\n';
    case 'zed':
      return '// Zed settings\n{\n  "theme": "One Dark", /* dark */\n  "context_servers": {\n    "datadog": {\n      "command": "npx",\n      "args": ["datadog-mcp"]\n    }\n  }\n}\n';
    case 'vscode':
      return '{\r\n\t// user profile\r\n\t"servers": {\r\n\t\t"gitlab": { "type": "http", "url": "https://gitlab.example/mcp" }\r\n\t}\r\n}\r\n';
    case 'gemini_cli':
    case 'devin_desktop':
      return '{\n    // kept\n    "mcpServers": {\n        "slack": { "httpUrl": "https://mcp.slack.example/mcp" }\n    },\n    "ui": { "theme": "dark" }\n}\n';
    case 'goose':
      return '# goose\nGOOSE_PROVIDER: openai # provider\nextensions:\n  developer:\n    bundled: true\n    enabled: true\n    name: developer\n    type: builtin\n  github:\n    args:\n    - -y\n    - "@modelcontextprotocol/server-github"\n    cmd: npx\n    enabled: true # on\n    envs: {}\n    name: github\n    type: stdio\nGOOSE_MODEL: gpt-4o\n';
    default:
      return '{\n    "mcpServers": {\n        "notion": {\n            "command": "npx",\n            "args": ["notion-mcp"]\n        }\n    },\n    "preferences": {}\n}\n';
  }
}

/** A home laid out as on one system, with every client installed the way that system shows it. */
function machine(platform: ClientPlatform) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `clients-${platform}-`)));
  const home = join(root, 'home');
  const dropHome = join(home, '.drop');
  const source = join(root, 'drop-mcp.mjs');
  mkdirSync(dropHome, { recursive: true });
  writeFileSync(source, '// requester server');
  const files = new Map<AgentKind, string>();
  for (const agent of FILE_CLIENTS) {
    const path = expectedPath(agent, platform, home);
    if (!path) continue;
    put(path, original(agent));
    files.set(agent, path);
  }
  const bin = join(root, 'bin');
  const tools = join(root, 'tools');
  const apps = join(root, 'apps');
  for (const dir of [bin, tools, apps]) mkdirSync(dir, { recursive: true });
  const binary = (dir: string, name: string) => {
    const [first] = executableNames(name, { platform, pathExt: '.EXE;.CMD' });
    const path = join(dir, platform === 'win32' && name === 'gemini' ? `${name}.cmd` : (first ?? name));
    writeFileSync(path, '');
    chmodSync(path, 0o755);
  };
  const appNames: Record<ClientPlatform, string[]> = {
    darwin: [
      'Claude.app',
      'Cursor.app',
      'OpenCode.app',
      'Devin.app',
      'Zed.app',
      'Goose.app',
      'Visual Studio Code.app',
      'PyCharm CE.app',
    ],
    win32: ['Claude', 'cursor', 'OpenCode', 'Devin', 'Zed', 'Goose', 'Microsoft VS Code', 'PyCharm 2026.2'],
    linux: ['dev.zed.Zed.desktop', 'io.github.block.Goose.desktop', 'code.desktop', 'jetbrains-pycharm.desktop'],
  };
  for (const name of appNames[platform]) mkdirSync(join(apps, name));
  for (const name of ['gemini', 'claude', 'codex']) binary(bin, name);
  if (platform === 'linux') for (const name of ['cursor', 'opencode', 'devin']) binary(tools, name);
  mkdirSync(join(home, '.vscode', 'extensions', 'saoudrizwan.claude-dev-4.1.23'), { recursive: true });
  mkdirSync(join(home, '.vscode', 'extensions', 'rooveterinaryinc.roo-cline-3.54.0'), { recursive: true });
  const separator = platform === 'win32' ? ';' : ':';
  const probe: InstallProbe = {
    home,
    apps: [apps],
    path: [bin, tools].join(separator),
    platform,
    pathExt: '.EXE;.CMD',
  };
  const host: ClientHost = { home, platform, env: {} };
  // Without a stand-in, official commands are looked up on the probe and really run.
  const real: OnboardingOptions = { home, dropHome, serverSource: source, platform, env: {}, probe };
  const options: OnboardingOptions = { ...real, run: () => undefined };
  return { root, home, host, dropHome, probe, real, options, files };
}

function entryIn(agent: AgentKind, text: string, path: string[]): unknown {
  return agent === 'goose' ? readYamlEntry(text, path) : readJsonEntry(text, path, 'jsonc');
}

/** Connect every file client, check each entry and every original line, repeat, then remove: the file is restored. */
async function connectsEverywhere(platform: ClientPlatform): Promise<void> {
  const m = machine(platform);
  const plans = previewOnboarding(m.options);
  const ready = plans.filter((plan) => plan.state === 'ready').map((plan) => plan.agent);
  const expectedReady = FILE_CLIENTS.filter((agent) => m.files.has(agent));
  // All thirteen are ready, Claude Code and Codex through their official command; Claude Desktop is not
  // installed on this Linux machine.
  expect(ready).toEqual(CLIENTS.filter((agent) => agent !== 'claude_desktop' || platform !== 'linux'));
  for (const agent of expectedReady)
    expect(plans.find((plan) => plan.agent === agent)?.configPath).toBe(expectedPath(agent, platform, m.home));
  expect(plans.every((plan) => plan.manual === undefined)).toBe(true);

  const select = (action: 'connect' | 'disconnect') =>
    previewOnboarding(m.options)
      .filter((plan) => expectedReady.includes(plan.agent))
      .map((plan) => ({ agent: plan.agent, fingerprint: plan.fingerprint, action }));
  const connected = await applyOnboarding(select('connect'), m.options);
  expect(connected.map((result) => [result.agent, result.state])).toEqual(
    expectedReady.map((agent) => [agent, 'connected']),
  );
  for (const agent of expectedReady) {
    const file = m.files.get(agent) ?? '';
    const text = readFileSync(file, 'utf8');
    const { path, value } = expectedEntry(agent, m.dropHome);
    expect(entryIn(agent, text, path)).toEqual(value);
    // Every line of the original file is still there, comments included.
    const lines = new Set(text.split(/\r?\n/));
    for (const line of original(agent)
      .split(/\r?\n/)
      .filter((item) => !/^\s*[}\]],?$/.test(item)))
      expect(lines.has(line) || lines.has(line.replace(/ \}$/, ' },'))).toBe(true);
  }
  expect(readdirSync(join(m.dropHome, 'backups', 'onboarding')).length).toBe(expectedReady.length);

  // A second connection changes nothing, byte for byte.
  const before = new Map([...m.files].map(([agent, file]) => [agent, readFileSync(file, 'utf8')]));
  const again = previewOnboarding(m.options);
  for (const agent of expectedReady)
    expect(again.find((plan) => plan.agent === agent)?.state).toBe('already_connected');
  const repeated = await applyOnboarding(
    again
      .filter((plan) => expectedReady.includes(plan.agent))
      .map((plan) => ({ agent: plan.agent, fingerprint: plan.fingerprint, action: 'connect' as const })),
    m.options,
  );
  expect(repeated.every((result) => result.state === 'already_connected')).toBe(true);
  for (const [agent, file] of m.files) expect(readFileSync(file, 'utf8')).toBe(before.get(agent));

  // Removal takes out our entry only: the file is back to what it was.
  const removed = await applyOnboarding(select('disconnect'), m.options);
  expect(removed.every((result) => result.state === 'disconnected')).toBe(true);
  for (const [agent, file] of m.files) expect(readFileSync(file, 'utf8')).toBe(original(agent));
}

describe('all thirteen clients connected automatically (T4.22)', () => {
  it('connects every file client at its documented macOS path, keeps comments and layout, is idempotent, then removes only its entry', async () => {
    await connectsEverywhere('darwin');
  });

  it('connects every file client at its documented Windows path, keeps comments and layout, is idempotent, then removes only its entry', async () => {
    await connectsEverywhere('win32');
  });

  it('connects every file client at its documented Linux path, keeps comments and layout, is idempotent, then removes only its entry', async () => {
    await connectsEverywhere('linux');
  });

  it('creates a missing file where each client documents it, and keeps a neighbour added after the connection', async () => {
    const m = machine('win32');
    const goose = m.files.get('goose') ?? '';
    const zed = m.files.get('zed') ?? '';
    writeFileSync(goose, '');
    for (const file of [zed]) writeFileSync(file, '');
    const opencodeDir = join(m.home, '.config', 'opencode');
    const opencodeJsonc = join(opencodeDir, 'opencode.jsonc');
    writeFileSync(opencodeJsonc, '{}');
    const plans = previewOnboarding(m.options);
    const pick = (agent: AgentKind) => {
      const plan = plans.find((item) => item.agent === agent);
      return { agent, fingerprint: plan?.fingerprint ?? '', action: 'connect' as const };
    };
    const results = await applyOnboarding([pick('goose'), pick('zed'), pick('opencode')], m.options);
    expect(results.map((result) => result.state)).toEqual(['connected', 'connected', 'connected']);
    expect(readYamlEntry(readFileSync(goose, 'utf8'), ['extensions', 'drop'])).toMatchObject({ cmd: process.execPath });
    // A third party adds a server after us: removal keeps it.
    writeFileSync(
      zed,
      readFileSync(zed, 'utf8').replace(
        '"context_servers": {',
        '"context_servers": {\n    "added": { "command": "other" },',
      ),
    );
    const plan = previewOnboarding(m.options).find((item) => item.agent === 'zed');
    expect(plan?.state).toBe('already_connected');
    const [result] = await applyOnboarding(
      [{ agent: 'zed', fingerprint: plan?.fingerprint ?? '', action: 'disconnect' }],
      m.options,
    );
    expect(result?.state).toBe('disconnected');
    const text = readFileSync(zed, 'utf8');
    expect(readJsonEntry(text, ['context_servers', 'added'], 'jsonc')).toEqual({ command: 'other' });
    expect(readJsonEntry(text, ['context_servers', 'drop'], 'jsonc')).toBeUndefined();
  });

  it('refuses a file changed since the preview and a different drop entry, for the new clients too', async () => {
    const m = machine('linux');
    const goose = m.files.get('goose') ?? '';
    const opencode = m.files.get('opencode') ?? '';
    const plans = previewOnboarding(m.options);
    const fingerprint = (agent: AgentKind) => plans.find((plan) => plan.agent === agent)?.fingerprint ?? '';
    // Changed after the preview: refused, the other writer's change stays.
    const changed = `${original('goose')}GOOSE_MODE: auto\n`;
    writeFileSync(goose, changed);
    const [late] = await applyOnboarding(
      [{ agent: 'goose', fingerprint: fingerprint('goose'), action: 'connect' }],
      m.options,
    );
    expect(late?.state).toBe('changed');
    expect(readFileSync(goose, 'utf8')).toBe(changed);
    // Changed between the temporary file and the rename: refused as well.
    const zed = m.files.get('zed') ?? '';
    const [racing] = await applyOnboarding([{ agent: 'zed', fingerprint: fingerprint('zed'), action: 'connect' }], {
      ...m.options,
      beforeJsonCommit: () => {
        writeFileSync(zed, '{ "theme": "light" }');
      },
    });
    expect(racing?.state).toBe('changed');
    expect(readFileSync(zed, 'utf8')).toBe('{ "theme": "light" }');
    // Another drop entry: a conflict, never replaced.
    const other =
      '{\n  "mcp": {\n    "drop": { "type": "local", "command": ["node", "/elsewhere/drop.mjs"] }\n  }\n}\n';
    writeFileSync(opencode, other);
    const conflict = previewOnboarding(m.options).find((plan) => plan.agent === 'opencode');
    expect(conflict?.state).toBe('conflict');
    const [refused] = await applyOnboarding(
      [{ agent: 'opencode', fingerprint: conflict?.fingerprint ?? '', action: 'connect' }],
      m.options,
    );
    expect(refused?.state).toBe('conflict');
    expect(readFileSync(opencode, 'utf8')).toBe(other);
  });

  it('falls back to an explained configuration only when a write is impossible', async () => {
    const m = machine('linux');
    // An invalid file is never rewritten: the owner gets the entry to paste, where, and why.
    const zed = m.files.get('zed') ?? '';
    writeFileSync(zed, '{ "context_servers": ');
    // Claude Desktop for Linux exists (beta) but does not document its file.
    writeFileSync(join(m.root, 'bin', 'claude-desktop'), '');
    // No Codex on this machine: its official command is printed instead.
    const probe = { ...m.probe, path: [join(m.root, 'bin'), join(m.root, 'tools')].join(':') };
    const options: OnboardingOptions = { ...m.real, probe };
    chmodSync(join(m.root, 'bin', 'codex'), 0o644);
    const plans = previewOnboarding(options);
    const plan = (agent: AgentKind) => plans.find((item) => item.agent === agent);
    expect(plan('zed')).toMatchObject({ state: 'error', detail: 'E_CONFIG_INVALID_OR_UNREADABLE' });
    expect(plan('zed')?.manual?.steps).toContain(zed);
    expect(JSON.parse(plan('zed')?.manual?.snippet ?? '{}')).toHaveProperty('context_servers.drop.command');
    expect(plan('claude_desktop')).toMatchObject({ state: 'error', detail: 'E_CONFIG_UNDOCUMENTED' });
    expect(plan('claude_desktop')?.manual?.steps).toContain('pas documenté');
    expect(plan('codex')).toMatchObject({ state: 'error', detail: 'E_CLI_MISSING' });
    expect(plan('codex')?.manual).toMatchObject({ format: 'shell' });
    expect(plan('codex')?.manual?.snippet).toMatch(/^codex mcp add drop --env DROP_AGENT=codex /);
    // Every other installed client is connected automatically: no copy-paste for them.
    for (const agent of [
      'cursor',
      'opencode',
      'gemini_cli',
      'devin_desktop',
      'goose',
      'vscode',
      'cline',
      'roo_code',
      'jetbrains',
    ] as const)
      expect(plan(agent)).toMatchObject({ state: 'ready' });
    expect(readFileSync(zed, 'utf8')).toBe('{ "context_servers": ');
    // A forged selection still writes nothing into the invalid file.
    const [forged] = await applyOnboarding([{ agent: 'zed', fingerprint: '', action: 'connect' }], options);
    expect(forged).toMatchObject({ state: 'error', detail: 'E_CONFIG_INVALID_OR_UNREADABLE' });
    expect(forged?.manual?.snippet).toContain('DROP_AGENT');
    expect(readFileSync(zed, 'utf8')).toBe('{ "context_servers": ');
  });

  it('finds apps and executables the way each system installs them, never from a configuration folder alone', () => {
    for (const platform of PLATFORMS) {
      const m = machine(platform);
      const installed = Object.fromEntries(
        (Object.keys(CLIENT_SPECS) as AgentKind[]).map((agent) => [agent, clientInstalled(agent, m.probe)]),
      );
      for (const agent of Object.keys(CLIENT_SPECS) as AgentKind[])
        expect([platform, agent, installed[agent]]).toEqual([
          platform,
          agent,
          agent !== 'claude_desktop' || platform !== 'linux' ? true : false,
        ]);
      // The same home with no app, binary or extension: only the T3.3 clients with an existing config count.
      const bare: InstallProbe = { ...m.probe, apps: [], path: '', home: join(m.root, 'nobody') };
      expect((Object.keys(CLIENT_SPECS) as AgentKind[]).some((agent) => clientInstalled(agent, bare))).toBe(false);
    }
    // Windows: PATH uses `;` and PATHEXT names the executables; a Unix-style probe would not see them.
    const w = machine('win32');
    expect(executableNames('claude', w.probe)).toEqual(['claude.exe', 'claude.cmd']);
    expect(clientInstalled('claude_code', { ...w.probe, home: join(w.root, 'nobody'), platform: 'linux' })).toBe(false);
    expect(
      defaultProbe({
        home: 'C:\\Users\\jean',
        platform: 'win32',
        env: { LOCALAPPDATA: 'D:\\Local', PATH: 'C:\\bin;D:\\bin', PATHEXT: '.EXE' },
      }),
    ).toMatchObject({
      platform: 'win32',
      path: 'C:\\bin;D:\\bin',
      pathExt: '.EXE',
    });
    expect(defaultProbe({ home: '/home/jean', platform: 'linux', env: {} }).apps).toContain('/usr/share/applications');
  });

  it('honours the documented overrides of each location on the real home only', () => {
    const home = '/home/jean';
    const host = (platform: ClientPlatform, env: Record<string, string>): ClientHost => ({ home, platform, env });
    const at = (agent: AgentKind, h: ClientHost) => CLIENT_SPECS[agent].global(h)[0]?.path;
    expect(at('zed', host('linux', { XDG_CONFIG_HOME: '/x' }))).toBe(join('/x', 'zed', 'settings.json'));
    expect(at('goose', host('linux', { XDG_CONFIG_HOME: '/x' }))).toBe(join('/x', 'goose', 'config.yaml'));
    expect(at('goose', host('darwin', { GOOSE_PATH_ROOT: '/g' }))).toBe(join('/g', 'config', 'config.yaml'));
    expect(at('vscode', host('win32', { APPDATA: 'D:\\Roaming' }))).toBe(
      join('D:\\Roaming', 'Code', 'User', 'mcp.json'),
    );
    expect(at('codex', host('linux', { CODEX_HOME: '/c' }))).toBe(join('/c', 'config.toml'));
    expect(at('cline', host('win32', { CLINE_DIR: '\\\\server\\cl' }))).toBe(
      join('\\\\server\\cl', 'data', 'settings', 'cline_mcp_settings.json'),
    );
    expect(at('opencode', host('win32', { OPENCODE_CONFIG: 'C:\\o\\custom.jsonc' }))).toBe('C:\\o\\custom.jsonc');
    // Absolute means absolute on that system: a drive-relative Windows path, or a Windows path on Linux, is ignored.
    expect(at('vscode', host('win32', { APPDATA: '\\Roaming' }))).toBe(
      join(home, 'AppData', 'Roaming', 'Code', 'User', 'mcp.json'),
    );
    expect(at('vscode', host('linux', { XDG_CONFIG_HOME: 'C:\\x' }))).toBe(
      join(home, '.config', 'Code', 'User', 'mcp.json'),
    );
    expect(at('gemini_cli', host('darwin', { GEMINI_CLI_HOME: '/gh' }))).toBe(join('/gh', '.gemini', 'settings.json'));
    // A relative override is ignored, never resolved against the daemon's working directory.
    expect(at('zed', host('linux', { XDG_CONFIG_HOME: 'relative' }))).toBe(
      join(home, '.config', 'zed', 'settings.json'),
    );
    // A home given explicitly (tests, another user) never picks up this process's environment.
    expect(clientHost('/somewhere/else', 'linux').env).toEqual({});
  });

  it('writes the private copy of the Store build of Claude Desktop on Windows when it exists', async () => {
    const m = machine('win32');
    const documented = m.files.get('claude_desktop') ?? '';
    const store = join(
      m.home,
      'AppData',
      'Local',
      'Packages',
      'Claude_pzs8sxrjxfjjc',
      'LocalCache',
      'Roaming',
      'Claude',
      'claude_desktop_config.json',
    );
    put(store, original('claude_desktop'));
    const plan = previewOnboarding(m.options).find((item) => item.agent === 'claude_desktop');
    expect(plan?.configPath).toBe(store);
    const [result] = await applyOnboarding(
      [{ agent: 'claude_desktop', fingerprint: plan?.fingerprint ?? '', action: 'connect' }],
      m.options,
    );
    expect(result?.state).toBe('connected');
    expect(readJsonEntry(readFileSync(store, 'utf8'), ['mcpServers', 'drop'], 'json')).toBeDefined();
    expect(readFileSync(documented, 'utf8')).toBe(original('claude_desktop'));
  });

  it('runs the official command of Codex without blocking the daemon, then verifies what it wrote', async () => {
    const m = machine(process.platform === 'darwin' ? 'darwin' : 'linux');
    const config = join(m.home, '.codex', 'config.toml');
    put(config, 'model = "gpt-5"\n');
    const entry = serverEntry('codex', m.dropHome, join(m.dropHome, 'bin', 'drop-mcp.mjs'));
    const connected = join(m.root, 'connected.toml');
    writeFileSync(
      connected,
      `model = "gpt-5"\n[mcp_servers.drop]\ncommand = ${JSON.stringify(entry.command)}\nargs = [${JSON.stringify(entry.args[0])}]\n[mcp_servers.drop.env]\nDROP_AGENT = "codex"\nDROP_HOME = ${JSON.stringify(m.dropHome)}\n`,
    );
    // A slow stand-in for `codex mcp add`, found on the probe's PATH: it writes what the real one writes.
    writeFileSync(join(m.root, 'bin', 'codex'), `#!/bin/sh\nsleep 0.3\ncp '${connected}' '${config}'\n`);
    const options = m.real;
    const plan = previewOnboarding(options).find((item) => item.agent === 'codex');
    expect(plan?.state).toBe('ready');
    let ticks = 0;
    const ticker = setInterval(() => {
      ticks += 1;
    }, 10);
    try {
      const results = await applyOnboarding(
        [{ agent: 'codex', fingerprint: plan?.fingerprint ?? '', action: 'connect' }],
        options,
      );
      expect(results.map((result) => result.state)).toEqual(['connected']);
    } finally {
      clearInterval(ticker);
    }
    expect(ticks).toBeGreaterThan(5);
  });

  it('runs a Windows .cmd shim through cmd.exe only with arguments that are safe inside quotes', () => {
    const argv = [
      'C:\\Users\\Jean Dupont\\AppData\\Roaming\\npm\\codex.cmd',
      'mcp',
      'add',
      'drop',
      '--env',
      'DROP_HOME=C:\\Users\\Jean Dupont\\.drop',
      '--',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
    ];
    expect(windowsShimCommand(argv)).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', `"${argv.map((arg) => `"${arg}"`).join(' ')}"`],
    });
    for (const unsafe of ['100%', 'a"b', 'line\nbreak', 'C:\\dir\\', 'x^y', 'bang!', ''])
      expect(() => windowsShimCommand(['codex.cmd', unsafe])).toThrow('E_CLI_SHIM_UNSAFE');
  });

  it('keeps the requester server out of a client drop could not write', async () => {
    const m = machine('darwin');
    writeFileSync(m.files.get('cursor') ?? '', '{bad');
    const plan = previewOnboarding(m.options).find((item) => item.agent === 'cursor');
    expect(plan?.state).toBe('error');
    const [result] = await applyOnboarding([{ agent: 'cursor', fingerprint: '', action: 'connect' }], m.options);
    expect(result?.state).toBe('error');
    expect(existsSync(join(m.dropHome, 'bin', 'drop-mcp.mjs'))).toBe(false);
  });

  it('reports a drop entry in a Claude Code project as a conflict, never as something to paste', () => {
    const m = machine('linux');
    put(
      join(m.home, '.claude.json'),
      JSON.stringify({ projects: { '/work': { mcpServers: { drop: { command: 'x' } } } } }),
    );
    const plan = previewOnboarding(m.options).find((item) => item.agent === 'claude_code');
    expect(plan).toMatchObject({ state: 'conflict', detail: 'E_SCOPE_CONFLICT', action: 'none' });
    expect(plan?.manual).toBeUndefined();
    // Two drop tables in Codex: a conflict too, never an extra `codex mcp add` to paste.
    put(
      join(m.home, '.codex', 'config.toml'),
      '[mcp_servers.drop]\ncommand = "a"\n[mcp_servers."drop"]\ncommand = "b"\n',
    );
    const codex = previewOnboarding(m.options).find((item) => item.agent === 'codex');
    expect(codex).toMatchObject({ state: 'conflict', detail: 'E_CONFIG_AMBIGUOUS' });
    expect(codex?.manual).toBeUndefined();
  });

  it('prints a fallback command quoted for the shell of the owner, Windows paths unchanged', () => {
    const windows = serverEntry(
      'codex',
      'C:\\Users\\Jean Dupont\\.drop',
      'C:\\Users\\Jean Dupont\\.drop\\bin\\drop-mcp.mjs',
    );
    const step = fallbackStep(
      'codex',
      { ...windows, command: 'C:\\Program Files\\nodejs\\node.exe' },
      undefined,
      'E_CLI_MISSING',
      'win32',
    );
    expect(step.snippet).toBe(
      "codex mcp add drop --env DROP_AGENT=codex --env 'DROP_HOME=C:\\Users\\Jean Dupont\\.drop' -- 'C:\\Program Files\\nodejs\\node.exe' 'C:\\Users\\Jean Dupont\\.drop\\bin\\drop-mcp.mjs'",
    );
    expect(step.steps).toContain('PowerShell');
    expect(shellLine(["it's", 'a$b`c`'], 'win32')).toBe("'it''s' 'a$b`c`'");
    expect(shellLine(["it's", 'a$b`c`'], 'linux')).toBe("'it'\\''s' 'a$b`c`'");
  });

  it('keeps edge cases out: a stable OpenCode server named servers, an older Devin entry, a linked file, script extensions', () => {
    const m = machine('linux');
    // OpenCode 1 with a server literally named `servers`: drop goes under `mcp`, not inside that server.
    const opencode = m.files.get('opencode') ?? '';
    writeFileSync(opencode, '{ "mcp": { "servers": { "type": "local", "command": ["srv"] } } }');
    expect(entryKeyPath('opencode', readFileSync(opencode, 'utf8'))).toEqual(['mcp', 'drop']);
    // A drop entry still in Devin's older file would make a second one: a conflict.
    put(join(m.home, '.codeium', 'windsurf', 'mcp_config.json'), '{ "mcpServers": { "drop": { "command": "old" } } }');
    // A configuration linked elsewhere (dotfiles) is not followed, and the reason says so.
    const zed = m.files.get('zed') ?? '';
    const target = join(m.root, 'dotfiles-zed.json');
    writeFileSync(target, '{}');
    rmSync(zed);
    symlinkSync(target, zed);
    const plans = previewOnboarding(m.options);
    expect(plans.find((plan) => plan.agent === 'devin_desktop')).toMatchObject({
      state: 'conflict',
      detail: 'E_DROP_CONFLICT',
    });
    const linked = plans.find((plan) => plan.agent === 'zed');
    expect(linked).toMatchObject({ state: 'error', detail: 'E_CONFIG_SYMLINK' });
    expect(linked?.manual?.steps).toContain('lien');
    expect(readFileSync(target, 'utf8')).toBe('{}');
    // PATHEXT lists scripts Node cannot start: only .exe, .com, .cmd and .bat count.
    expect(executableNames('claude', { platform: 'win32', pathExt: '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.PY' })).toEqual([
      'claude.exe',
      'claude.com',
      'claude.cmd',
      'claude.bat',
    ]);
  });
});
