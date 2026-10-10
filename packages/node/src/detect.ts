import { homedir } from 'node:os';
import {
  agentConfigPath,
  agentServers,
  AGENTS,
  CLIENT_SPECS,
  clientInstalled,
  defaultProbe,
  type AgentKind,
  type AgentServer,
  type InstallProbe,
} from '@drop/capabilities';

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
  /** cli or file: drop can connect it after two confirmations; manual: a copyable configuration only (D66). */
  connect: 'cli' | 'file' | 'manual';
  servers: DetectedServer[];
}

export const AGENT_LABELS = Object.fromEntries(AGENTS.map((agent) => [agent, CLIENT_SPECS[agent].label])) as Record<
  AgentKind,
  string
>;

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

const PLACEHOLDER = /\$\{[^}]*\}|\{(?:env|file):[^}]*\}/;
const DROP_OWN = /requester-mcp|blocked-observer|(^|[/\\])drop(-mcp)?$/i;

function describe(server: AgentServer): string {
  if (server.transport === 'http') {
    try {
      return new URL(server.url ?? '').host;
    } catch {
      return 'http';
    }
  }
  // The executable only: a one-string command may carry flags or tokens after it.
  const executable = (server.command ?? '').trim().split(/\s+/)[0] ?? '';
  return executable.split('/').pop() ?? '';
}

/** Reads each client's documented global files; installation comes from its app, binary or extension (D66). */
/** One server as the panel may show it: names, the command's basename or the URL's host, never a value. */
export function presentServer(agent: AgentKind, server: AgentServer): DetectedServer {
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
    // A client's own placeholder syntax (\${input:…}, {env:…}, \${env:…}) means drop cannot start it as written.
    shareable: !own && !PLACEHOLDER.test(JSON.stringify(server)),
  };
}

export function detectAgents(home: string = homedir(), probe: InstallProbe = defaultProbe(home)): DetectedAgent[] {
  return AGENTS.map((agent) => {
    const servers = agentServers(agent, home).map((server) => presentServer(agent, server));
    return {
      agent,
      label: AGENT_LABELS[agent],
      installed: clientInstalled(agent, probe),
      configPath: agentConfigPath(agent, home),
      connect: CLIENT_SPECS[agent].connect,
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
