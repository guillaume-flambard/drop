import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { agentConfigPath, agentServers, AGENTS, type AgentKind, type AgentServer } from '@drop/capabilities';

/**
 * What `drop detect` (and the app, T2.4) shows in one glance (T2.8, D28): the coding agents on this machine, whether
 * drop is installed in each, and the MCP servers they use, with a guess of what each one is. Never a secret: only
 * names, the command's basename, the URL's host, and the names of environment variables and headers. Existing
 * command arguments are never displayed: they can contain inline credentials even when `env` is empty.
 */
export interface DetectedServer {
  agent: AgentKind;
  name: string;
  transport: 'stdio' | 'http';
  /** `figma`, `notion`, `github`… when the name, command or URL says so. */
  kind: string | undefined;
  where: string;
  envNames: string[];
  headerNames: string[];
  /** drop's own servers (requester, blocked-observer) are listed but never offered for sharing. */
  shareable: boolean;
}

export interface DetectedAgent {
  agent: AgentKind;
  label: string;
  installed: boolean;
  configPath: string;
  dropInstalled: boolean;
  servers: DetectedServer[];
}

export const AGENT_LABELS: Record<AgentKind, string> = {
  claude_code: 'Claude Code',
  claude_desktop: 'Claude Desktop',
  cursor: 'Cursor',
  codex: 'Codex',
};

const KINDS: [string, RegExp][] = [
  ['figma', /figma|:3845\b/i],
  ['notion', /notion/i],
  ['github', /github/i],
  ['gitlab', /gitlab/i],
  ['linear', /linear/i],
  ['jira', /jira|atlassian|confluence/i],
  ['slack', /slack/i],
  ['google', /google|gdrive|gmail/i],
  ['database', /postgres|mysql|supabase|sqlite|mongo|neon|prisma/i],
  ['crm', /hubspot|salesforce|pipedrive|attio|crm/i],
  ['sentry', /sentry/i],
  ['datadog', /datadog/i],
];

const DROP_OWN = /requester-mcp|blocked-observer|(^|[/\\])drop(-mcp)?$/i;

function binaryOnPath(names: string[]): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter);
  return names.some((name) => dirs.some((dir) => dir !== '' && existsSync(join(dir, name))));
}

function installed(agent: AgentKind, home: string): boolean {
  if (existsSync(agentConfigPath(agent, home))) return true;
  switch (agent) {
    case 'claude_code':
      return binaryOnPath(['claude']);
    case 'codex':
      return binaryOnPath(['codex']);
    case 'cursor':
      return existsSync('/Applications/Cursor.app') || binaryOnPath(['cursor']);
    case 'claude_desktop':
      return existsSync('/Applications/Claude.app');
  }
}

function describe(server: AgentServer): string {
  if (server.transport === 'http') {
    try {
      return new URL(server.url ?? '').host;
    } catch {
      return 'http';
    }
  }
  const command = (server.command ?? '').split('/').pop() ?? '';
  return command;
}

export function detectAgents(home: string = homedir()): DetectedAgent[] {
  return AGENTS.map((agent) => {
    const servers = agentServers(agent, home).map((server): DetectedServer => {
      const haystack = [server.name, server.command, ...(server.args ?? []), server.url].join(' ');
      const own = DROP_OWN.test(server.name) || (server.args ?? []).some((arg) => DROP_OWN.test(arg));
      return {
        agent,
        name: server.name,
        transport: server.transport,
        kind: KINDS.find(([, pattern]) => pattern.test(haystack))?.[0],
        where: describe(server),
        envNames: Object.keys(server.env).sort(),
        headerNames: Object.keys(server.headers).sort(),
        shareable: !own,
      };
    });
    return {
      agent,
      label: AGENT_LABELS[agent],
      installed: installed(agent, home),
      configPath: agentConfigPath(agent, home),
      dropInstalled: servers.some((server) => server.name === 'drop' || /requester-mcp/.test(server.where)),
      servers,
    };
  });
}

/** A publication id for a detected server: `mcp.answer.<kind or name>`, lower case. */
export function shareId(server: Pick<DetectedServer, 'name' | 'kind'>): string {
  const base = (server.kind ?? server.name)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '');
  return `mcp.answer.${base || 'tool'}`;
}
