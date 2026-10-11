import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { REQUESTER_AGENTS } from '@drop/protocol';

/**
 * The thirteen MCP clients of D55 (T4.5, D66): where each keeps its servers, globally and per project, in which format,
 * how to tell it is installed, and how drop may connect to it. Locations come from each client's official docs,
 * re-checked on 2026-10-10 (docs/research/2026-10-10-repositionnement.md §4). Read-only except where `connect` says so.
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

/** Where installed apps and binaries are looked for; tests point it at a temporary tree. */
export interface InstallProbe {
  home: string;
  apps: string[];
  path: string;
}

export function defaultProbe(home: string = homedir()): InstallProbe {
  return { home, apps: ['/Applications', join(home, 'Applications')], path: process.env.PATH ?? '' };
}

export interface ClientSpec {
  label: string;
  /** cli: official command; file: strict JSON written by drop; manual: a copyable configuration only. */
  connect: 'cli' | 'file' | 'manual';
  /** The four clients of T3.3 count as installed when their config exists; the others never do (D66). */
  configProvesInstall: boolean;
  apps: RegExp;
  binaries: string[];
  /** Binaries outside PATH, relative to home. */
  homeBinaries: string[];
  /** VS Code extension id prefixes, looked for in the VS Code and Cursor extension folders. */
  extensions: string[];
  global(home: string): ConfigLocation[];
  project(dir: string): ConfigLocation[];
  source: string;
}

const realHome = (home: string): boolean => home === homedir();
const json = (path: string, layout: ConfigLayout = 'mcpServers'): ConfigLocation => ({ path, format: 'json', layout });
const jsonc = (path: string, layout: ConfigLayout): ConfigLocation => ({ path, format: 'jsonc', layout });
const NEVER = /^$/;
const APP_SUPPORT = (home: string) => join(home, 'Library', 'Application Support');

export const CLIENT_SPECS: Record<ClientId, ClientSpec> = {
  claude_code: {
    label: 'Claude Code',
    connect: 'cli',
    configProvesInstall: true,
    apps: NEVER,
    binaries: ['claude'],
    homeBinaries: ['.local/bin/claude'],
    extensions: [],
    global: (home) => [json(join(home, '.claude.json'), 'claude_code')],
    project: (dir) => [json(join(dir, '.mcp.json'))],
    source: 'https://code.claude.com/docs/en/mcp',
  },
  claude_desktop: {
    label: 'Claude Desktop',
    connect: 'file',
    configProvesInstall: true,
    apps: /^Claude\.app$/,
    binaries: [],
    homeBinaries: [],
    extensions: [],
    global: (home) => [json(join(APP_SUPPORT(home), 'Claude', 'claude_desktop_config.json'))],
    project: () => [],
    source: 'https://modelcontextprotocol.io/docs/develop/connect-local-servers',
  },
  cursor: {
    label: 'Cursor',
    connect: 'file',
    configProvesInstall: true,
    apps: /^Cursor\.app$/,
    binaries: ['cursor'],
    homeBinaries: [],
    extensions: [],
    global: (home) => [json(join(home, '.cursor', 'mcp.json'))],
    project: (dir) => [json(join(dir, '.cursor', 'mcp.json'))],
    source: 'https://cursor.com/docs/context/mcp',
  },
  codex: {
    label: 'Codex',
    connect: 'cli',
    configProvesInstall: true,
    apps: NEVER,
    binaries: ['codex'],
    homeBinaries: ['.local/bin/codex'],
    extensions: [],
    // CODEX_HOME only moves the real user's config, not a home passed explicitly (tests, another user).
    global: (home) => [
      {
        path: join(
          realHome(home) && process.env.CODEX_HOME ? process.env.CODEX_HOME : join(home, '.codex'),
          'config.toml',
        ),
        format: 'toml',
        layout: 'codex',
      },
    ],
    project: (dir) => [{ path: join(dir, '.codex', 'config.toml'), format: 'toml', layout: 'codex' }],
    source: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
  },
  opencode: {
    label: 'OpenCode',
    connect: 'manual',
    configProvesInstall: false,
    apps: /^OpenCode\.app$/,
    binaries: ['opencode'],
    homeBinaries: ['.opencode/bin/opencode'],
    extensions: [],
    global: (home) => [
      jsonc(join(home, '.config', 'opencode', 'opencode.jsonc'), 'opencode'),
      jsonc(join(home, '.config', 'opencode', 'opencode.json'), 'opencode'),
    ],
    project: (dir) => [
      jsonc(join(dir, 'opencode.jsonc'), 'opencode'),
      jsonc(join(dir, 'opencode.json'), 'opencode'),
      jsonc(join(dir, '.opencode', 'opencode.jsonc'), 'opencode'),
      jsonc(join(dir, '.opencode', 'opencode.json'), 'opencode'),
    ],
    source: 'https://opencode.ai/v2/docs/mcp-servers/',
  },
  gemini_cli: {
    label: 'Gemini CLI',
    connect: 'cli',
    configProvesInstall: false,
    apps: NEVER,
    binaries: ['gemini'],
    homeBinaries: [],
    extensions: [],
    global: (home) => [
      json(
        join(
          realHome(home) && process.env.GEMINI_CLI_HOME ? process.env.GEMINI_CLI_HOME : home,
          '.gemini',
          'settings.json',
        ),
      ),
    ],
    project: (dir) => [json(join(dir, '.gemini', 'settings.json'))],
    source: 'https://geminicli.com/docs/tools/mcp-server/',
  },
  devin_desktop: {
    label: 'Devin Desktop (Windsurf)',
    connect: 'manual',
    configProvesInstall: false,
    apps: /^(Devin|Windsurf)\.app$/,
    binaries: ['devin', 'windsurf'],
    homeBinaries: ['.local/bin/devin', '.codeium/windsurf/bin/windsurf'],
    extensions: [],
    // Its own docs disagree (Cascade page, FAQ, Devin Local page): every documented file is read.
    global: (home) => [
      json(join(home, '.config', 'devin', 'mcp_config.json')),
      json(join(home, '.codeium', 'windsurf', 'mcp_config.json')),
      json(join(home, '.config', 'devin', 'config.json')),
    ],
    project: (dir) => [json(join(dir, '.devin', 'mcp_config.json'))],
    source: 'https://docs.devin.ai/desktop/cascade/mcp',
  },
  zed: {
    label: 'Zed',
    connect: 'manual',
    configProvesInstall: false,
    apps: /^Zed\.app$/,
    binaries: ['zed'],
    homeBinaries: [],
    extensions: [],
    global: (home) => [jsonc(join(home, '.config', 'zed', 'settings.json'), 'zed')],
    project: (dir) => [jsonc(join(dir, '.zed', 'settings.json'), 'zed')],
    source: 'https://zed.dev/docs/ai/mcp',
  },
  goose: {
    label: 'goose',
    connect: 'manual',
    configProvesInstall: false,
    apps: /^[Gg]oose\.app$/,
    binaries: ['goose'],
    homeBinaries: ['.local/bin/goose'],
    extensions: [],
    global: (home) => [{ path: join(home, '.config', 'goose', 'config.yaml'), format: 'yaml', layout: 'goose' }],
    project: () => [],
    source: 'https://goose-docs.ai/docs/guides/config-files',
  },
  vscode: {
    label: 'VS Code (Copilot)',
    connect: 'cli',
    configProvesInstall: false,
    apps: /^Visual Studio Code\.app$/,
    binaries: ['code'],
    homeBinaries: [],
    extensions: [],
    global: (home) => [jsonc(join(APP_SUPPORT(home), 'Code', 'User', 'mcp.json'), 'vscode')],
    project: (dir) => [jsonc(join(dir, '.vscode', 'mcp.json'), 'vscode')],
    source: 'https://code.visualstudio.com/docs/copilot/customization/mcp-servers',
  },
  cline: {
    label: 'Cline',
    connect: 'file',
    configProvesInstall: false,
    apps: NEVER,
    binaries: ['cline'],
    homeBinaries: [],
    extensions: ['saoudrizwan.claude-dev-'],
    global: (home) => [
      json(
        realHome(home) && process.env.CLINE_MCP_SETTINGS_PATH
          ? process.env.CLINE_MCP_SETTINGS_PATH
          : join(home, '.cline', 'data', 'settings', 'cline_mcp_settings.json'),
      ),
    ],
    project: () => [],
    source: 'https://docs.cline.bot/mcp/mcp-overview.md',
  },
  roo_code: {
    label: 'Roo Code (archivé)',
    connect: 'manual',
    configProvesInstall: false,
    apps: NEVER,
    binaries: [],
    homeBinaries: [],
    extensions: ['rooveterinaryinc.roo-cline-'],
    global: (home) => [
      json(
        join(
          APP_SUPPORT(home),
          'Code',
          'User',
          'globalStorage',
          'rooveterinaryinc.roo-cline',
          'settings',
          'mcp_settings.json',
        ),
      ),
    ],
    project: (dir) => [json(join(dir, '.roo', 'mcp.json'))],
    source: 'https://roocodeinc.github.io/Roo-Code/features/mcp/using-mcp-in-roo',
  },
  jetbrains: {
    label: 'JetBrains AI',
    connect: 'manual',
    configProvesInstall: false,
    apps: /^(IntelliJ IDEA|PyCharm|WebStorm|GoLand|PhpStorm|RubyMine|CLion|Rider|DataGrip|RustRover|Aqua|Fleet)( [A-Za-z0-9 .]+)?\.app$/,
    binaries: ['junie'],
    homeBinaries: [],
    extensions: [],
    // AI Assistant keeps its servers in the IDE settings only; Junie, its agent, reads these files.
    global: (home) => [json(join(home, '.junie', 'mcp', 'mcp.json'))],
    project: (dir) => [json(join(dir, '.junie', 'mcp', 'mcp.json'))],
    source: 'https://www.jetbrains.com/help/ai-assistant/mcp.html',
  },
};

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Installed means its app, a binary or its extension exists; for the new clients, never a config folder alone. */
export function clientInstalled(client: ClientId, probe: InstallProbe): boolean {
  const spec = CLIENT_SPECS[client];
  if (spec.configProvesInstall && spec.global(probe.home).some((location) => existsSync(location.path))) return true;
  if (probe.apps.some((dir) => listDir(dir).some((name) => spec.apps.test(name)))) return true;
  const dirs = probe.path.split(delimiter).filter((dir) => dir !== '');
  if (spec.binaries.some((name) => dirs.some((dir) => existsSync(join(dir, name))))) return true;
  if (spec.homeBinaries.some((relative) => existsSync(join(probe.home, relative)))) return true;
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
