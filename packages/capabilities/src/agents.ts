import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Where each coding agent keeps its MCP servers (T2.8, D28), as found on 2026-10-08 on macOS:
 * - Claude Code: `~/.claude.json`, `mcpServers` (user scope) and `projects[path].mcpServers`;
 * - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`, `mcpServers`;
 * - Cursor: `~/.cursor/mcp.json`, `mcpServers`;
 * - Codex: `~/.codex/config.toml`, `[mcp_servers.<name>]` tables (https://developers.openai.com/codex/mcp).
 * Only the owner's machine reads these files. Secret values never leave this module except to start the server.
 */
export const AGENTS = ['claude_code', 'claude_desktop', 'cursor', 'codex'] as const;
export type AgentKind = (typeof AGENTS)[number];

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

export function agentConfigPath(agent: AgentKind, home: string = homedir()): string {
  switch (agent) {
    case 'claude_code':
      return join(home, '.claude.json');
    case 'claude_desktop':
      return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'cursor':
      return join(home, '.cursor', 'mcp.json');
    case 'codex':
      // CODEX_HOME only moves the real user's config, not a home passed explicitly (tests, another user).
      return join(
        home === homedir() && process.env.CODEX_HOME ? process.env.CODEX_HOME : join(home, '.codex'),
        'config.toml',
      );
  }
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
  const url = typeof entry.url === 'string' ? entry.url : typeof entry.serverUrl === 'string' ? entry.serverUrl : '';
  return url ? { name, transport: 'http', url, env, headers } : undefined;
}

function jsonServers(servers: unknown): AgentServer[] {
  if (typeof servers !== 'object' || servers === null) return [];
  return Object.entries(servers).flatMap(([name, raw]) => {
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

/** The MCP servers one agent declares; [] when the agent or its config is absent or unreadable. */
export function agentServers(agent: AgentKind, home: string = homedir()): AgentServer[] {
  const path = agentConfigPath(agent, home);
  if (!existsSync(path)) return [];
  try {
    const text = readFileSync(path, 'utf8');
    if (agent === 'codex') return codexServers(text);
    const config = JSON.parse(text) as Record<string, unknown>;
    if (agent !== 'claude_code') return jsonServers(config.mcpServers);
    const projects = typeof config.projects === 'object' && config.projects !== null ? config.projects : {};
    const projectServers = Object.values(projects).flatMap((project: unknown) =>
      typeof project === 'object' && project !== null
        ? jsonServers((project as Record<string, unknown>).mcpServers)
        : [],
    );
    const seen = new Set<string>();
    return [...jsonServers(config.mcpServers), ...projectServers].filter((server) => {
      if (seen.has(server.name)) return false;
      seen.add(server.name);
      return true;
    });
  } catch {
    return [];
  }
}

/** A server as one agent declares it, looked up when mcp.answer starts it (secrets stay in the agent's file). */
export function findAgentServer(agent: AgentKind, name: string, home: string = homedir()): AgentServer | undefined {
  return agentServers(agent, home).find((server) => server.name === name);
}
