import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJsonc } from 'jsonc-parser';
import { stringify as stringifyYaml } from 'yaml';
import {
  CLIENT_SPECS,
  clientConfigLocation,
  clientHost,
  clientPlatform,
  type AgentKind,
  type ClientHost,
  type ClientPlatform,
  type ConfigLayout,
  type ConfigLocation,
} from '@drop/capabilities';

/**
 * What one add or remove means for each client (T3.3, T4.5, T4.22): the official command of Claude Code and Codex, or
 * the entry drop writes in the client's own file, in its own layout. The onboarding service owns preflight, backup,
 * freshness checks and writes.
 */
export interface ServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** The configuration to paste or the command to run, only when drop cannot write it itself (D84), and why. */
export interface ManualStep {
  kind: 'manual';
  format: 'json' | 'yaml' | 'shell';
  snippet: string;
  steps: string;
}

export type InstallStep =
  { kind: 'run'; argv: string[] } | { kind: 'file'; file: string; location: ConfigLocation; entry: ServerEntry | null };

export const SERVER_NAME = 'drop';

/** Where the bundled requester server is found: beside a bundled CLI, else in the repo's dist/ after `node scripts/bundle.ts`. */
export function bundledServer(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, 'drop-mcp.mjs'), join(here, '..', '..', '..', 'dist', 'drop-mcp.mjs')].find((path) =>
    existsSync(path),
  );
}

export function serverEntry(agent: AgentKind, dropHome: string, serverPath: string): ServerEntry {
  // An absolute node path: Claude Desktop and Cursor start servers with a minimal PATH.
  return { command: process.execPath, args: [serverPath], env: { DROP_AGENT: agent, DROP_HOME: dropHome } };
}

function officialCommand(agent: 'claude_code' | 'codex', entry: ServerEntry | null): string[] {
  const env = Object.entries(entry?.env ?? {}).map(([key, value]) => `${key}=${value}`);
  if (agent === 'claude_code')
    return entry
      ? [
          'claude',
          'mcp',
          'add',
          '--scope',
          'user',
          SERVER_NAME,
          ...env.flatMap((pair) => ['-e', pair]),
          '--',
          entry.command,
          ...entry.args,
        ]
      : ['claude', 'mcp', 'remove', '--scope', 'user', SERVER_NAME];
  return entry
    ? [
        'codex',
        'mcp',
        'add',
        SERVER_NAME,
        ...env.flatMap((pair) => ['--env', pair]),
        '--',
        entry.command,
        ...entry.args,
      ]
    : ['codex', 'mcp', 'remove', SERVER_NAME];
}

export function installSteps(
  agent: AgentKind,
  entry: ServerEntry | null,
  home: string | ClientHost = clientHost(),
): InstallStep[] {
  if (agent === 'claude_code' || agent === 'codex') return [{ kind: 'run', argv: officialCommand(agent, entry) }];
  const location = clientConfigLocation(agent, clientHost(home));
  return location ? [{ kind: 'file', file: location.path, location, entry }] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** OpenCode 2 nests servers under `mcp.servers`; the stable OpenCode 1 puts them right under `mcp` (its docs). */
function opencodeV2(text: string | undefined): boolean {
  if (text === undefined) return false;
  const config: unknown = parseJsonc(text.replace(/^\uFEFF/, ''), [], { allowTrailingComma: true });
  if (!isRecord(config) || !isRecord(config.mcp) || !isRecord(config.mcp.servers)) return false;
  // A stable-version server that happens to be named `servers` is a server definition, not the v2 envelope.
  const servers = config.mcp.servers;
  return !('type' in servers) && !('command' in servers) && !('url' in servers);
}

/** Where our entry sits in a client's file, key by key. */
export function entryKeyPath(layout: ConfigLayout, text?: string): string[] {
  switch (layout) {
    case 'vscode':
      return ['servers', SERVER_NAME];
    case 'zed':
      return ['context_servers', SERVER_NAME];
    case 'opencode':
      return opencodeV2(text) ? ['mcp', 'servers', SERVER_NAME] : ['mcp', SERVER_NAME];
    case 'goose':
      return ['extensions', SERVER_NAME];
    case 'mcpServers':
    case 'claude_code':
    case 'codex':
      return ['mcpServers', SERVER_NAME];
  }
}

/** Our entry in a client's own layout, as each one documents a local stdio server. */
export function entryValue(agent: AgentKind, layout: ConfigLayout, entry: ServerEntry, text?: string): unknown {
  const stdio = { command: entry.command, args: entry.args, env: entry.env };
  switch (layout) {
    case 'vscode':
      return { type: 'stdio', ...stdio };
    case 'opencode':
      return opencodeV2(text)
        ? { type: 'local', command: [entry.command, ...entry.args], environment: entry.env }
        : { type: 'local', command: [entry.command, ...entry.args], environment: entry.env, enabled: true };
    case 'goose':
      return {
        name: SERVER_NAME,
        type: 'stdio',
        cmd: entry.command,
        args: entry.args,
        envs: entry.env,
        enabled: true,
        timeout: 300,
      };
    case 'mcpServers':
    case 'zed':
    case 'claude_code':
    case 'codex':
      return stdio;
  }
}

function strings(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return {};
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === 'string')) return undefined;
  return value as Record<string, string>;
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

/** An existing entry read back as command, args and env, whatever the layout; undefined when it is not a stdio one. */
export function normalizeEntry(layout: ConfigLayout, raw: unknown): ServerEntry | undefined {
  if (!isRecord(raw)) return undefined;
  if (layout === 'opencode') {
    const command = stringList(raw.command);
    const env = strings(raw.environment);
    const [first, ...rest] = command ?? [];
    return first !== undefined && env ? { command: first, args: rest, env } : undefined;
  }
  const command = layout === 'goose' ? raw.cmd : raw.command;
  const args = stringList(raw.args);
  const env = strings(layout === 'goose' ? (raw.envs ?? raw.env) : raw.env);
  return typeof command === 'string' && args && env ? { command, args, env } : undefined;
}

const REASONS: Record<string, string> = {
  E_CONFIG_INVALID_OR_UNREADABLE: 'son fichier est illisible ou invalide, drop ne le réécrit pas',
  E_CONFIG_LOCKED: 'son fichier est verrouillé ou protégé en écriture',
  E_CONFIG_SYMLINK: 'son fichier est un lien vers un autre fichier, que drop ne suit pas',
  E_CONFIG_UNDOCUMENTED: 'son emplacement n’est pas documenté sur ce système',
  E_CONFIG_AMBIGUOUS: 'plusieurs fichiers possibles, drop ne choisit pas à ta place',
  E_CLI_MISSING: 'sa commande officielle est introuvable',
  E_CLI_SHIM_UNSAFE: 'sa commande officielle ne peut pas recevoir ces arguments sans risque sous Windows',
};

/**
 * A command line to paste, quoted for the shell the owner has: single quotes in a POSIX shell (`'\''` for a quote),
 * single quotes in PowerShell (`''` for a quote). Backslashes are never doubled: a Windows path stays as it is.
 */
export function shellLine(argv: readonly string[], platform: ClientPlatform): string {
  const plain = platform === 'win32' ? /^[\w./:=@+\\-]+$/ : /^[\w./:=@+-]+$/;
  const quote = (arg: string) =>
    platform === 'win32' ? `'${arg.replaceAll("'", "''")}'` : `'${arg.replaceAll("'", "'\\''")}'`;
  return argv.map((arg) => (plain.test(arg) ? arg : quote(arg))).join(' ');
}

/** Pasting or running by hand: why drop did not write, and exactly what to do (D84). */
export function fallbackStep(
  agent: AgentKind,
  entry: ServerEntry,
  location: ConfigLocation | undefined,
  reason: string,
  platform: ClientPlatform = clientPlatform(),
): ManualStep {
  const label = CLIENT_SPECS[agent].label;
  const why = `Raccordement automatique impossible : ${REASONS[reason] ?? reason}.`;
  if (agent === 'claude_code' || agent === 'codex')
    return {
      kind: 'manual',
      format: 'shell',
      snippet: shellLine(officialCommand(agent, entry), platform),
      steps: `${why} Lance cette commande dans ${platform === 'win32' ? 'PowerShell' : 'un terminal'}, puis relance ${label}.`,
    };
  const layout = location?.layout ?? 'mcpServers';
  const path = entryKeyPath(layout);
  const value = entryValue(agent, layout, entry);
  if (location?.format === 'yaml')
    return {
      kind: 'manual',
      format: 'yaml',
      snippet: stringifyYaml({ [SERVER_NAME]: value }, { lineWidth: 0 }),
      steps: `${why} Ajoute ce bloc sous la clé extensions de ${location.path} (crée-la si elle manque), puis relance ${label}.`,
    };
  const snippet = path.slice(0, -1).reduceRight<unknown>((inner, key) => ({ [key]: inner }), { [SERVER_NAME]: value });
  const where = location ? `dans ${location.path}` : `dans la configuration MCP de ${label}`;
  return {
    kind: 'manual',
    format: 'json',
    snippet: JSON.stringify(snippet, null, 2),
    steps: `${why} Ajoute l’entrée drop sous ${path.slice(0, -1).join('.')} ${where}, sans toucher au reste, puis relance ${label}.`,
  };
}

/** A Cursor install link (https://cursor.com/docs/mcp/install-links.md): name plus the base64 of the mcp.json entry. */
export function cursorInstallLink(entry: ServerEntry): string {
  const config = Buffer.from(JSON.stringify(entry), 'utf8').toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}
