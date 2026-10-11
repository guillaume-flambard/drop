import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, posix, win32 } from 'node:path';
import { REQUESTER_AGENTS } from '@drop/protocol';

/**
 * The thirteen MCP clients of D55 (T4.5, D66), on macOS, Windows and Linux (T4.22, D84): where each keeps its servers,
 * globally and per project, in which format, how to tell it is installed, and how drop connects to it. Locations come
 * from each client's official docs, read for each system on 2026-10-11 (docs/research/2026-10-11-clients-par-systeme.md).
 * Every function takes the system, home folder and environment it applies to, so tests can simulate all three.
 */
export type ClientId = Exclude<(typeof REQUESTER_AGENTS)[number], 'other'>;
/** The protocol's requester agents, in their order, without `other`: one list, so a new client is added once. */
export const CLIENTS: readonly ClientId[] = REQUESTER_AGENTS.filter((agent): agent is ClientId => agent !== 'other');

/** How the servers are laid out in a file. */
export type ConfigLayout = 'mcpServers' | 'claude_code' | 'vscode' | 'opencode' | 'zed' | 'goose' | 'codex';

export interface ConfigLocation {
  path: string;
  format: 'json' | 'jsonc' | 'toml' | 'yaml';
  layout: ConfigLayout;
}

export type ClientPlatform = 'darwin' | 'win32' | 'linux';

/** The system, home folder and environment a location is computed for. */
export interface ClientHost {
  home: string;
  platform: ClientPlatform;
  /** Overrides honoured (APPDATA, LOCALAPPDATA, XDG_CONFIG_HOME, CODEX_HOME…); empty for a home given explicitly. */
  env: Readonly<Record<string, string | undefined>>;
}

/** The three systems drop knows; any other Unix reads like Linux. */
export function clientPlatform(platform: NodeJS.Platform = process.platform): ClientPlatform {
  return platform === 'darwin' || platform === 'win32' ? platform : 'linux';
}

/**
 * A host for a home folder: this machine's system, and this process's environment only for the real home folder (a
 * home passed explicitly, by tests or for another user, never picks up this user's overrides).
 */
export function clientHost(
  home: string | ClientHost = homedir(),
  platform: ClientPlatform = clientPlatform(),
  env?: Readonly<Record<string, string | undefined>>,
): ClientHost {
  if (typeof home !== 'string') return home;
  return { home, platform, env: env ?? (home === homedir() ? process.env : {}) };
}

/** An absolute override from the environment, else the default. */
function override(host: ClientHost, name: string, fallback: string): string {
  const value = host.env[name];
  return value !== undefined && value !== '' && (isAbsolute(value) || win32.isAbsolute(value)) ? value : fallback;
}

/** %APPDATA% (Roaming) on Windows. */
const appData = (host: ClientHost) => override(host, 'APPDATA', join(host.home, 'AppData', 'Roaming'));
/** %LOCALAPPDATA% on Windows. */
const localAppData = (host: ClientHost) => override(host, 'LOCALAPPDATA', join(host.home, 'AppData', 'Local'));
/** $XDG_CONFIG_HOME on Linux. */
const xdgConfig = (host: ClientHost) => override(host, 'XDG_CONFIG_HOME', join(host.home, '.config'));
/** An Electron or VS Code-like user data folder: Application Support, %APPDATA% or $XDG_CONFIG_HOME. */
function userData(host: ClientHost, name: string): string {
  if (host.platform === 'darwin') return join(host.home, 'Library', 'Application Support', name);
  if (host.platform === 'win32') return join(appData(host), name);
  return join(xdgConfig(host), name);
}

/** Where installed apps and binaries are looked for; tests point it at a temporary tree. */
export interface InstallProbe {
  home: string;
  /** Folders whose entries name installed apps: Applications, Program Files, `.desktop` folders. Never walked. */
  apps: string[];
  path: string;
  /** The system the probe stands for; this machine's by default. */
  platform?: ClientPlatform | undefined;
  /** Windows executable extensions, from PATHEXT. */
  pathExt?: string | undefined;
}

export function defaultProbe(home: string | ClientHost = homedir()): InstallProbe {
  const host = clientHost(home);
  const env = host.env;
  const path = env.PATH ?? env.Path ?? '';
  if (host.platform === 'win32') {
    const local = localAppData(host);
    const programFiles = override(host, 'ProgramFiles', 'C:\\Program Files');
    return {
      home: host.home,
      platform: 'win32',
      path,
      pathExt: env.PATHEXT,
      apps: [
        join(local, 'Programs'),
        local,
        programFiles,
        join(programFiles, 'JetBrains'),
        override(host, 'ProgramFiles(x86)', 'C:\\Program Files (x86)'),
      ],
    };
  }
  if (host.platform === 'linux')
    return {
      home: host.home,
      platform: 'linux',
      path,
      apps: [
        '/usr/share/applications',
        '/usr/local/share/applications',
        join(host.home, '.local', 'share', 'applications'),
        '/var/lib/flatpak/exports/share/applications',
        join(host.home, '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
        '/var/lib/snapd/desktop/applications',
        join(host.home, '.local', 'share', 'JetBrains', 'Toolbox', 'apps'),
      ],
    };
  return { home: host.home, platform: 'darwin', path, apps: ['/Applications', join(host.home, 'Applications')] };
}

/** The names a binary may have on the probe's system: itself, or with each Windows executable extension. */
export function executableNames(binary: string, probe: Pick<InstallProbe, 'platform' | 'pathExt'>): string[] {
  if ((probe.platform ?? clientPlatform()) !== 'win32') return [binary];
  const extensions = (probe.pathExt ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => /^\.[a-z0-9]+$/.test(extension));
  return extensions.map((extension) => `${binary}${extension}`);
}

export interface ClientSpec {
  label: string;
  /** cli: the client's official command (Claude Code, Codex); file: drop edits its documented file in place. */
  connect: 'cli' | 'file';
  /** The four clients of T3.3 count as installed when their config exists; the others never do (D66). */
  configProvesInstall: boolean;
  /** Names of its app on each system: a `.app` bundle, a Windows install folder, a Linux `.desktop` file. */
  apps: Partial<Record<ClientPlatform, RegExp>>;
  binaries: string[];
  /** Binaries outside PATH, relative to home, with `/` separators. */
  homeBinaries: string[];
  /** VS Code extension id prefixes, looked for in the VS Code and Cursor extension folders. */
  extensions: string[];
  /** Its global files on this host, in reading order; [] where it has no documented file on that system. */
  global(host: ClientHost): ConfigLocation[];
  project(dir: string): ConfigLocation[];
  /** Why drop cannot write on a system where the client exists but its file is not documented. */
  undocumented?: Partial<Record<ClientPlatform, string>>;
  /** Which global location a new configuration is created in (index; the first by default). */
  create?: number;
  /** Always write the created location, even when an older one exists (Devin migrates its older files). */
  writeAlways?: boolean;
  source: string;
}

const json = (path: string, layout: ConfigLayout = 'mcpServers'): ConfigLocation => ({ path, format: 'json', layout });
const jsonc = (path: string, layout: ConfigLayout): ConfigLocation => ({ path, format: 'jsonc', layout });

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Claude Desktop on Windows: the documented %APPDATA% file, unless the Store (MSIX) build already has its private copy,
 * which Windows opens first (learn.microsoft.com, « Understanding how packaged desktop apps run on Windows »).
 */
function claudeDesktopWindows(host: ClientHost): ConfigLocation[] {
  const packages = join(localAppData(host), 'Packages');
  const virtualized = listDir(packages)
    .filter((name) => /^Claude_[a-z0-9]+$/i.test(name))
    .map((name) => join(packages, name, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'))
    .filter((path) => existsSync(path));
  return [...virtualized.map((path) => json(path)), json(join(appData(host), 'Claude', 'claude_desktop_config.json'))];
}

/** The VS Code user folder (`Code/User`), where its mcp.json and its extensions' globalStorage live. */
const vscodeUser = (host: ClientHost) => join(userData(host, 'Code'), 'User');

const JETBRAINS_IDES =
  'IntelliJ IDEA|PyCharm|WebStorm|GoLand|PhpStorm|RubyMine|CLion|Rider|DataGrip|RustRover|Aqua|Fleet';

export const CLIENT_SPECS: Record<ClientId, ClientSpec> = {
  claude_code: {
    label: 'Claude Code',
    connect: 'cli',
    configProvesInstall: true,
    apps: {},
    binaries: ['claude'],
    // The native installer, on every system (claude.exe on Windows).
    homeBinaries: ['.local/bin/claude'],
    extensions: [],
    global: (host) => [json(join(host.home, '.claude.json'), 'claude_code')],
    project: (dir) => [json(join(dir, '.mcp.json'))],
    source: 'https://code.claude.com/docs/en/mcp',
  },
  claude_desktop: {
    label: 'Claude Desktop',
    connect: 'file',
    configProvesInstall: true,
    apps: { darwin: /^Claude\.app$/, win32: /^(AnthropicClaude|Claude)$/ },
    binaries: ['claude-desktop'],
    homeBinaries: [],
    extensions: [],
    global: (host) =>
      host.platform === 'darwin'
        ? [json(join(userData(host, 'Claude'), 'claude_desktop_config.json'))]
        : host.platform === 'win32'
          ? claudeDesktopWindows(host)
          : [],
    project: () => [],
    undocumented: {
      linux: 'Claude Desktop pour Linux (bêta) ne documente pas l’emplacement de sa configuration.',
    },
    source: 'https://modelcontextprotocol.io/docs/develop/connect-local-servers',
  },
  cursor: {
    label: 'Cursor',
    connect: 'file',
    configProvesInstall: true,
    apps: { darwin: /^Cursor\.app$/, win32: /^Cursor$/i },
    binaries: ['cursor'],
    homeBinaries: [],
    extensions: [],
    global: (host) => [json(join(host.home, '.cursor', 'mcp.json'))],
    project: (dir) => [json(join(dir, '.cursor', 'mcp.json'))],
    source: 'https://cursor.com/docs/context/mcp',
  },
  codex: {
    label: 'Codex',
    connect: 'cli',
    configProvesInstall: true,
    apps: {},
    binaries: ['codex'],
    // install.sh, and install.ps1 on Windows (%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe).
    homeBinaries: ['.local/bin/codex', 'AppData/Local/Programs/OpenAI/Codex/bin/codex'],
    extensions: [],
    global: (host) => [
      {
        path: join(override(host, 'CODEX_HOME', join(host.home, '.codex')), 'config.toml'),
        format: 'toml',
        layout: 'codex',
      },
    ],
    project: (dir) => [{ path: join(dir, '.codex', 'config.toml'), format: 'toml', layout: 'codex' }],
    source: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
  },
  opencode: {
    label: 'OpenCode',
    connect: 'file',
    configProvesInstall: false,
    apps: { darwin: /^OpenCode\.app$/, win32: /^OpenCode$/ },
    binaries: ['opencode', 'ai.opencode.desktop'],
    homeBinaries: ['.opencode/bin/opencode'],
    extensions: [],
    // ~/.config/opencode on every system, Windows included (xdg-basedir). A later file overrides an earlier one, so
    // the strongest existing one is read first and written; OPENCODE_CONFIG names one file instead.
    global: (host) => {
      const custom = host.env.OPENCODE_CONFIG;
      if (custom !== undefined && isAbsolute(custom)) return [jsonc(custom, 'opencode')];
      const dir = join(xdgConfig(host), 'opencode');
      return [
        jsonc(join(dir, 'opencode.jsonc'), 'opencode'),
        jsonc(join(dir, 'opencode.json'), 'opencode'),
        jsonc(join(dir, 'config.json'), 'opencode'),
      ];
    },
    project: (dir) => [
      jsonc(join(dir, 'opencode.jsonc'), 'opencode'),
      jsonc(join(dir, 'opencode.json'), 'opencode'),
      jsonc(join(dir, '.opencode', 'opencode.jsonc'), 'opencode'),
      jsonc(join(dir, '.opencode', 'opencode.json'), 'opencode'),
    ],
    // Its docs name opencode.json for a new global config.
    create: 1,
    source: 'https://opencode.ai/docs/mcp-servers/',
  },
  gemini_cli: {
    label: 'Gemini CLI',
    connect: 'file',
    configProvesInstall: false,
    apps: {},
    binaries: ['gemini'],
    homeBinaries: [],
    extensions: [],
    // Gemini CLI strips comments when it reads settings.json, and keeps them when it writes: JSONC.
    global: (host) => [
      jsonc(join(override(host, 'GEMINI_CLI_HOME', host.home), '.gemini', 'settings.json'), 'mcpServers'),
    ],
    project: (dir) => [jsonc(join(dir, '.gemini', 'settings.json'), 'mcpServers')],
    source: 'https://geminicli.com/docs/reference/configuration',
  },
  devin_desktop: {
    label: 'Devin Desktop (Windsurf)',
    connect: 'file',
    configProvesInstall: false,
    apps: { darwin: /^(Devin|Windsurf)\.app$/, win32: /^(Devin|Windsurf)$/ },
    binaries: ['devin', 'windsurf'],
    homeBinaries: ['.local/bin/devin', 'AppData/Local/devin/bin/devin', '.codeium/windsurf/bin/windsurf'],
    extensions: [],
    // Since v3000.3 the app and its CLI read ~/.config/devin/mcp_config.json (%APPDATA%\devin on Windows) and import
    // the older files, which drop still reads but never writes (D85).
    global: (host) => [
      jsonc(
        join(host.platform === 'win32' ? appData(host) : xdgConfig(host), 'devin', 'mcp_config.json'),
        'mcpServers',
      ),
      jsonc(join(host.home, '.codeium', 'windsurf', 'mcp_config.json'), 'mcpServers'),
      jsonc(join(host.home, '.config', 'devin', 'config.json'), 'mcpServers'),
    ],
    project: (dir) => [jsonc(join(dir, '.devin', 'mcp_config.json'), 'mcpServers')],
    writeAlways: true,
    source: 'https://docs.devin.ai/cli/extensibility/mcp/configuration',
  },
  zed: {
    label: 'Zed',
    connect: 'file',
    configProvesInstall: false,
    apps: { darwin: /^Zed\.app$/, win32: /^Zed$/, linux: /^dev\.zed\.Zed\.desktop$/ },
    binaries: ['zed'],
    homeBinaries: ['.local/bin/zed'],
    extensions: [],
    global: (host) => [
      jsonc(
        host.platform === 'win32'
          ? join(appData(host), 'Zed', 'settings.json')
          : host.platform === 'linux'
            ? join(override(host, 'FLATPAK_XDG_CONFIG_HOME', xdgConfig(host)), 'zed', 'settings.json')
            : join(host.home, '.config', 'zed', 'settings.json'),
        'zed',
      ),
    ],
    project: (dir) => [jsonc(join(dir, '.zed', 'settings.json'), 'zed')],
    source: 'https://zed.dev/docs/ai/mcp',
  },
  goose: {
    label: 'goose',
    connect: 'file',
    configProvesInstall: false,
    apps: { darwin: /^[Gg]oose\.app$/, win32: /^[Gg]oose$/, linux: /^io\.github\.block\.Goose\.desktop$/ },
    binaries: ['goose'],
    homeBinaries: ['.local/bin/goose'],
    extensions: [],
    global: (host) => {
      const root = host.env.GOOSE_PATH_ROOT;
      const dir =
        root !== undefined && isAbsolute(root)
          ? join(root, 'config')
          : host.platform === 'win32'
            ? join(appData(host), 'Block', 'goose', 'config')
            : join(xdgConfig(host), 'goose');
      return [{ path: join(dir, 'config.yaml'), format: 'yaml', layout: 'goose' }];
    },
    project: () => [],
    source: 'https://goose-docs.ai/docs/guides/config-files',
  },
  vscode: {
    label: 'VS Code (Copilot)',
    connect: 'file',
    configProvesInstall: false,
    apps: { darwin: /^Visual Studio Code\.app$/, win32: /^Microsoft VS Code$/, linux: /^code\.desktop$/ },
    binaries: ['code'],
    homeBinaries: [],
    extensions: [],
    // The default profile's mcp.json, the file « MCP: Open User Configuration » opens; VS Code reads it as JSONC.
    global: (host) => [jsonc(join(vscodeUser(host), 'mcp.json'), 'vscode')],
    project: (dir) => [jsonc(join(dir, '.vscode', 'mcp.json'), 'vscode')],
    source: 'https://code.visualstudio.com/docs/copilot/customization/mcp-servers',
  },
  cline: {
    label: 'Cline',
    connect: 'file',
    configProvesInstall: false,
    apps: { darwin: /^Cline\.app$/, win32: /^Cline$/ },
    binaries: ['cline'],
    homeBinaries: [],
    extensions: ['saoudrizwan.claude-dev-'],
    // Shared by the extension (since its SDK migration), the CLI and the JetBrains plugin; strict JSON.
    global: (host) => {
      const explicit = host.env.CLINE_MCP_SETTINGS_PATH;
      if (explicit !== undefined && isAbsolute(explicit)) return [json(explicit)];
      const base = override(host, 'CLINE_DIR', join(host.home, '.cline'));
      return [json(join(override(host, 'CLINE_DATA_DIR', join(base, 'data')), 'settings', 'cline_mcp_settings.json'))];
    },
    project: () => [],
    source: 'https://docs.cline.bot/mcp/mcp-overview',
  },
  roo_code: {
    label: 'Roo Code (archivé)',
    connect: 'file',
    configProvesInstall: false,
    apps: {},
    binaries: [],
    homeBinaries: [],
    extensions: ['rooveterinaryinc.roo-cline-'],
    // In VS Code's globalStorage for the extension, on each system's VS Code user folder.
    global: (host) => [
      json(join(vscodeUser(host), 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json')),
    ],
    project: (dir) => [json(join(dir, '.roo', 'mcp.json'))],
    source: 'https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo',
  },
  jetbrains: {
    label: 'JetBrains AI',
    connect: 'file',
    configProvesInstall: false,
    apps: {
      darwin: new RegExp(`^(${JETBRAINS_IDES})( [A-Za-z0-9 .]+)?\\.app$`),
      win32: new RegExp(`^(${JETBRAINS_IDES})( [A-Za-z0-9 .]+)?$`),
      linux:
        /^(jetbrains-[a-z-]+\.desktop|intellij-idea[a-z-]*|pycharm[a-z-]*|webstorm|goland|phpstorm|rubymine|clion|rider|datagrip|rustrover)$/,
    },
    binaries: ['junie'],
    homeBinaries: ['.local/bin/junie'],
    extensions: [],
    // Junie, JetBrains' agent, reads this file; AI Assistant's own chat keeps its list in the IDE settings.
    global: (host) => [json(join(host.home, '.junie', 'mcp', 'mcp.json'))],
    project: (dir) => [json(join(dir, '.junie', 'mcp', 'mcp.json'))],
    source: 'https://junie.jetbrains.com/docs/junie-plugin-mcp-settings.html',
  },
};

/**
 * The file drop writes for a client on this host: the strongest existing one among its documented files, else the one
 * its docs name for a new configuration. Devin's older files are read but never written. Undefined where it has none.
 */
export function clientConfigLocation(client: ClientId, host: ClientHost): ConfigLocation | undefined {
  const spec = CLIENT_SPECS[client];
  const locations = spec.global(host);
  const created = locations[spec.create ?? 0];
  if (spec.writeAlways) return created;
  return locations.find((location) => existsSync(location.path)) ?? created;
}

/** Installed means its app, a binary or its extension exists; for the new clients, never a config folder alone. */
export function clientInstalled(client: ClientId, probe: InstallProbe): boolean {
  const spec = CLIENT_SPECS[client];
  const platform = probe.platform ?? clientPlatform();
  if (
    spec.configProvesInstall &&
    spec.global(clientHost(probe.home, platform)).some((location) => existsSync(location.path))
  )
    return true;
  const apps = spec.apps[platform];
  if (apps && probe.apps.some((dir) => listDir(dir).some((name) => apps.test(name)))) return true;
  const separator = (platform === 'win32' ? win32 : posix).delimiter;
  const dirs = probe.path.split(separator).filter((dir) => dir !== '');
  const names = (binary: string) => executableNames(binary, { platform, pathExt: probe.pathExt });
  if (spec.binaries.some((binary) => dirs.some((dir) => names(binary).some((name) => existsSync(join(dir, name))))))
    return true;
  if (
    spec.homeBinaries.some((relative) =>
      names(join(probe.home, ...relative.split('/'))).some((candidate) => existsSync(candidate)),
    )
  )
    return true;
  const extensionDirs = [join(probe.home, '.vscode', 'extensions'), join(probe.home, '.cursor', 'extensions')];
  return spec.extensions.some((prefix) =>
    extensionDirs.some((dir) => listDir(dir).some((name) => name.startsWith(prefix))),
  );
}

/** Global files may be large (Claude Code keeps its history in ~/.claude.json); project files never need much. */
export const MAX_GLOBAL_CONFIG_BYTES = 16 * 1024 * 1024;
export const MAX_PROJECT_CONFIG_BYTES = 1024 * 1024;

/**
 * Reads a configuration file only if it is a regular file of bounded size: a cloned repo may carry a symlink to
 * /dev/zero or a huge file, and reading it must never hang or exhaust the daemon (T4.5 review). Absent: undefined.
 */
export function readConfigText(path: string, maxBytes: number = MAX_GLOBAL_CONFIG_BYTES): string | undefined {
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (!stats.isFile()) throw new Error('E_CONFIG_TYPE');
  if (stats.size > maxBytes) throw new Error('E_CONFIG_TOO_LARGE');
  return readFileSync(path, 'utf8');
}

/** Copies a string literal starting at `index`; returns the index just after its closing quote. */
function copyString(text: string, index: number, out: string[]): number {
  let cursor = index + 1;
  while (cursor < text.length) {
    const char = text.charAt(cursor);
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    cursor += 1;
    if (char === '"') break;
  }
  out.push(text.slice(index, cursor));
  return cursor;
}

/** Removes comments, then trailing commas, outside strings, and a leading BOM, so JSONC parses as JSON. Read-only. */
export function stripJsonc(input: string): string {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const withoutComments: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text.charAt(index);
    const next = text.charAt(index + 1);
    if (char === '"') index = copyString(text, index, withoutComments);
    else if (char === '/' && next === '/') {
      while (index < text.length && text.charAt(index) !== '\n') index += 1;
    } else if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      index = end === -1 ? text.length : end + 2;
    } else {
      withoutComments.push(char);
      index += 1;
    }
  }
  const plain = withoutComments.join('');
  const out: string[] = [];
  index = 0;
  while (index < plain.length) {
    const char = plain.charAt(index);
    if (char === '"') {
      index = copyString(plain, index, out);
      continue;
    }
    if (char === ',') {
      let ahead = index + 1;
      while (ahead < plain.length && /\s/.test(plain.charAt(ahead))) ahead += 1;
      const closing = plain.charAt(ahead);
      if (closing === '}' || closing === ']') {
        index += 1;
        continue;
      }
    }
    out.push(char);
    index += 1;
  }
  return out.join('');
}

/** An unquoted scalar, without a trailing ` # comment`; quoted scalars keep everything inside the quotes. */
function scalar(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) return JSON.parse(trimmed) as string;
  if (/^'[^']*'$/.test(trimmed)) return trimmed.slice(1, -1);
  if (/["'{}[\]]/.test(trimmed)) return undefined;
  return trimmed.replace(/\s+#.*$/, '');
}

/**
 * The `extensions` block of goose's config.yaml: `id → { type, cmd, args, uri, envs, enabled }`. Only the documented
 * subset is read: 2-space map, scalars, `- item` lists (indented or not), plain `[a, b]` lists without quotes. Any other
 * construct marks that extension `unreadable`, and it is never started nor shared (T4.5 review: fail closed).
 */
export function gooseExtensions(yaml: string): Record<string, Record<string, unknown>> {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => /^extensions:\s*(#.*)?$/.test(line));
  if (start === -1) return {};
  const extensions: Record<string, Record<string, unknown>> = {};
  let current: Record<string, unknown> | undefined;
  let list: string[] | undefined;
  let map: Record<string, string> | undefined;
  const broken = () => {
    if (current) current.unreadable = true;
  };
  for (const raw of lines.slice(start + 1)) {
    if (/^\S/.test(raw)) break;
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (raw.includes('\t')) {
      broken();
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (indent === 2) {
      const key = /^([A-Za-z0-9_.-]+|"[^"]+"):\s*(#.*)?$/.exec(line)?.[1];
      current = key ? {} : undefined;
      if (key && current) extensions[key.replaceAll('"', '')] = current;
      list = undefined;
      map = undefined;
      continue;
    }
    if (!current) continue;
    if (list && line.startsWith('- ') && (indent === 4 || indent === 6)) {
      const item = scalar(line.slice(2));
      if (item === undefined) broken();
      else list.push(item);
      continue;
    }
    if (map && indent === 6) {
      const pair = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
      const value = pair ? scalar(pair[2] ?? '') : undefined;
      if (!pair || value === undefined) broken();
      else map[pair[1] ?? ''] = value;
      continue;
    }
    if (indent !== 4) {
      broken();
      continue;
    }
    list = undefined;
    map = undefined;
    const pair = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!pair) {
      broken();
      continue;
    }
    const key = pair[1] ?? '';
    const value = (pair[2] ?? '').replace(/^\s*#.*$/, '').trim();
    if (value === '') {
      if (key === 'args') {
        list = [];
        current[key] = list;
      } else {
        map = {};
        current[key] = map;
      }
    } else if (value.startsWith('[')) {
      const inner = /^\[([^"'[\]{}]*)\]\s*(#.*)?$/.exec(value)?.[1];
      if (inner === undefined) broken();
      else
        current[key] = inner
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '');
    } else if (value === 'true' || value === 'false') current[key] = value === 'true';
    else {
      const parsed = scalar(value);
      if (parsed === undefined) broken();
      else current[key] = parsed;
    }
  }
  return extensions;
}
