import {
  CLIENT_SPECS,
  clientConfigLocation,
  clientHost,
  CLIENTS,
  gooseExtensions,
  MAX_GLOBAL_CONFIG_BYTES,
  MAX_PROJECT_CONFIG_BYTES,
  readConfigText,
  stripJsonc,
  type ClientHost,
  type ClientId,
  type ConfigLayout,
  type ConfigLocation,
} from './clients.ts';

/**
 * The MCP servers each coding agent declares (T2.8, D28; thirteen clients since T4.5, D66). Locations, formats and
 * layouts live in clients.ts with their sources. Only the owner's machine reads these files. Secret values never
 * leave this module except to start the server.
 */
export const AGENTS = CLIENTS;
export type AgentKind = ClientId;

export interface AgentServer {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  /** Values included: only for starting the server on this machine, never to show or send. */
  env: Record<string, string>;
  headers: Record<string, string>;
}

/** The global file drop writes (or its official command owns) for a client on this host; empty where it has none. */
export function agentConfigPath(agent: AgentKind, home: string | ClientHost = clientHost()): string {
  return clientConfigLocation(agent, clientHost(home))?.path ?? '';
}

function strings(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => (typeof item === 'string' ? [[key, item] as const] : [])),
  );
}

function fromJsonEntry(name: string, raw: unknown): AgentServer | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const entry = raw as Record<string, unknown>;
  const env = strings(entry.env);
  const headers = strings(entry.headers);
  if (typeof entry.command === 'string') {
    const args = Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string') : [];
    return { name, transport: 'stdio', command: entry.command, args, env, headers };
  }
  const url = [entry.url, entry.serverUrl, entry.httpUrl, entry.uri].find((value) => typeof value === 'string') ?? '';
  if (typeof url !== 'string') return undefined;
  return url ? { name, transport: 'http', url, env, headers } : undefined;
}

/** A server switched off in its client (`disabled: true` or `enabled: false`) is not offered. */
function switchedOff(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const entry = raw as Record<string, unknown>;
  return entry.disabled === true || entry.enabled === false;
}

function jsonServers(servers: unknown): AgentServer[] {
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) return [];
  return Object.entries(servers).flatMap(([name, raw]) => {
    if (switchedOff(raw)) return [];
    const server = fromJsonEntry(name, raw);
    return server ? [server] : [];
  });
}

/** One TOML value of the subset Codex writes: strings, string arrays, inline string tables, numbers, booleans. */
function tomlValue(text: string): unknown {
  const value = text.trim();
  if (value.startsWith('"')) return JSON.parse(value.slice(0, value.lastIndexOf('"') + 1)) as string;
  if (value.startsWith("'")) return value.slice(1, value.indexOf("'", 1));
  if (value.startsWith('[')) {
    return [...value.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((match) =>
      match[1] !== undefined ? (JSON.parse(`"${match[1]}"`) as string) : (match[2] ?? ''),
    );
  }
  if (value.startsWith('{')) {
    return Object.fromEntries(
      [...value.matchAll(/([A-Za-z0-9_-]+|"[^"]+")\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')/g)].map((match) => [
        (match[1] ?? '').replaceAll('"', ''),
        tomlValue(match[2] ?? '""'),
      ]),
    );
  }
  if (value === 'true' || value === 'false') return value === 'true';
  return Number(value);
}

/** Reads the `[mcp_servers.*]` tables of a Codex config.toml, ignoring everything else. */
export function codexServers(toml: string): AgentServer[] {
  const tables = new Map<string, Record<string, unknown>>();
  let current: Record<string, unknown> | undefined;
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/^\s+/, '');
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[([^\]]+)\]\s*(#.*)?$/.exec(line);
    if (header) {
      const path = (header[1] ?? '').trim();
      const match = /^mcp_servers\.("[^"]+"|[A-Za-z0-9_-]+)(?:\.(env|headers|http_headers))?$/.exec(path);
      if (!match) {
        current = undefined;
        continue;
      }
      const name = (match[1] ?? '').replaceAll('"', '');
      const table = tables.get(name) ?? {};
      tables.set(name, table);
      if (match[2]) {
        const sub: Record<string, unknown> = {};
        table[match[2] === 'env' ? 'env' : 'headers'] = sub;
        current = sub;
      } else current = table;
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+|"[^"]+")\s*=\s*(.+)$/.exec(line);
    if (pair && current) current[(pair[1] ?? '').replaceAll('"', '')] = tomlValue(pair[2] ?? '');
  }
  return [...tables].flatMap(([name, table]) => {
    if (table.enabled === false) return [];
    const headers = { ...strings(table.headers), ...strings(table.http_headers) };
    const server = fromJsonEntry(name, { ...table, headers });
    return server ? [server] : [];
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** OpenCode: v2 `mcp.servers.<name>` (or v1 `mcp.<name>`), `command` as an array, `environment`. */
function opencodeServers(config: Record<string, unknown>): AgentServer[] {
  const mcp = record(config.mcp);
  const servers = mcp.servers !== undefined ? record(mcp.servers) : mcp;
  return Object.entries(servers).flatMap(([name, raw]): AgentServer[] => {
    const entry = record(raw);
    if (switchedOff(entry) || name === 'timeout') return [];
    const command = Array.isArray(entry.command)
      ? entry.command.filter((part): part is string => typeof part === 'string')
      : [];
    const [first, ...rest] = command;
    if (first !== undefined)
      return [{ name, transport: 'stdio', command: first, args: rest, env: strings(entry.environment), headers: {} }];
    const server = fromJsonEntry(name, entry);
    return server ? [server] : [];
  });
}

/** Zed: `context_servers`, flat `command`/`args`/`env`, or the older nested `command: { path, args, env }`. */
function zedServers(servers: unknown): AgentServer[] {
  return Object.entries(record(servers)).flatMap(([name, raw]) => {
    const entry = record(raw);
    if (switchedOff(entry)) return [];
    const nested = record(entry.command);
    const flat =
      typeof nested.path === 'string' ? { ...entry, command: nested.path, args: nested.args, env: nested.env } : entry;
    const server = fromJsonEntry(name, flat);
    return server ? [server] : [];
  });
}

function gooseServers(yaml: string): AgentServer[] {
  return Object.entries(gooseExtensions(yaml)).flatMap(([name, entry]): AgentServer[] => {
    if (entry.enabled === false || entry.unreadable === true) return [];
    const env = strings(entry.envs);
    if (typeof entry.cmd === 'string') {
      const args = Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string') : [];
      return [{ name, transport: 'stdio', command: entry.cmd, args, env, headers: {} }];
    }
    return typeof entry.uri === 'string'
      ? [{ name, transport: 'http', url: entry.uri, env, headers: strings(entry.headers) }]
      : [];
  });
}

function claudeCodeServers(config: Record<string, unknown>): AgentServer[] {
  const projectServers = Object.values(record(config.projects)).flatMap((project) =>
    jsonServers(record(project).mcpServers),
  );
  const seen = new Set<string>();
  return [...jsonServers(config.mcpServers), ...projectServers].filter((server) => {
    if (seen.has(server.name)) return false;
    seen.add(server.name);
    return true;
  });
}

function fromLayout(layout: ConfigLayout, config: Record<string, unknown>): AgentServer[] {
  switch (layout) {
    case 'claude_code':
      return claudeCodeServers(config);
    case 'vscode':
      return jsonServers(config.servers);
    case 'opencode':
      return opencodeServers(config);
    case 'zed':
      return zedServers(config.context_servers);
    case 'mcpServers':
    case 'goose':
    case 'codex':
      return jsonServers(config.mcpServers);
  }
}

/** The servers of one file; [] when it is absent. Throws when it exists but cannot be read as its format. */
export function locationServers(location: ConfigLocation, maxBytes: number = MAX_GLOBAL_CONFIG_BYTES): AgentServer[] {
  const text = readConfigText(location.path, maxBytes);
  if (text === undefined) return [];
  if (location.format === 'toml') return codexServers(text);
  if (location.format === 'yaml') return gooseServers(text);
  const parsed: unknown = JSON.parse(location.format === 'jsonc' ? stripJsonc(text) : text);
  return fromLayout(location.layout, record(parsed));
}

function merged(locations: ConfigLocation[], maxBytes: number = MAX_GLOBAL_CONFIG_BYTES): AgentServer[] {
  const seen = new Set<string>();
  return locations
    .flatMap((location) => {
      try {
        return locationServers(location, maxBytes);
      } catch {
        return [];
      }
    })
    .filter((server) => {
      if (seen.has(server.name)) return false;
      seen.add(server.name);
      return true;
    });
}

/** The MCP servers one agent declares globally; [] when the agent or its config is absent or unreadable. */
export function agentServers(agent: AgentKind, home: string | ClientHost = clientHost()): AgentServer[] {
  return merged(CLIENT_SPECS[agent].global(clientHost(home)));
}

/** The MCP servers one agent declares for one project folder, read only from its documented files. */
export function projectServers(agent: AgentKind, dir: string): AgentServer[] {
  return merged(CLIENT_SPECS[agent].project(dir), MAX_PROJECT_CONFIG_BYTES);
}

/** A server as one agent declares it, looked up when mcp.answer starts it (secrets stay in the agent's file). */
export function findAgentServer(
  agent: AgentKind,
  name: string,
  home: string | ClientHost = clientHost(),
): AgentServer | undefined {
  return agentServers(agent, home).find((server) => server.name === name);
}
