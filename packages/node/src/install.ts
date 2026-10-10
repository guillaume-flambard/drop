import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentConfigPath, type AgentKind } from '@drop/capabilities';

/**
 * Command construction for the local onboarding service. The service owns preflight, backup, concurrency checks and
 * writes; this module only describes one add or remove operation for each supported agent.
 */
export interface ServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** A manual step: what to paste where, in the client's own format, when drop writes nothing (D66). */
export interface ManualStep {
  kind: 'manual';
  format: 'json' | 'yaml';
  snippet: string;
  steps: string;
}

export type InstallStep =
  { kind: 'run'; argv: string[] } | { kind: 'json'; file: string; entry: ServerEntry | null } | ManualStep;

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

export function installSteps(agent: AgentKind, entry: ServerEntry | null, home: string = homedir()): InstallStep[] {
  const env = Object.entries(entry?.env ?? {}).map(([key, value]) => `${key}=${value}`);
  switch (agent) {
    case 'claude_code':
      return entry
        ? [
            {
              kind: 'run',
              argv: [
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
              ],
            },
          ]
        : [{ kind: 'run', argv: ['claude', 'mcp', 'remove', '--scope', 'user', SERVER_NAME] }];
    case 'codex':
      return entry
        ? [
            {
              kind: 'run',
              argv: [
                'codex',
                'mcp',
                'add',
                SERVER_NAME,
                ...env.flatMap((pair) => ['--env', pair]),
                '--',
                entry.command,
                ...entry.args,
              ],
            },
          ]
        : [{ kind: 'run', argv: ['codex', 'mcp', 'remove', SERVER_NAME] }];
    case 'gemini_cli':
      return entry
        ? [
            {
              kind: 'run',
              argv: [
                'gemini',
                'mcp',
                'add',
                '--scope',
                'user',
                ...env.flatMap((pair) => ['-e', pair]),
                SERVER_NAME,
                entry.command,
                ...entry.args,
              ],
            },
          ]
        : [{ kind: 'run', argv: ['gemini', 'mcp', 'remove', '--scope', 'user', SERVER_NAME] }];
    case 'vscode':
      // `code --add-mcp` writes the user profile's mcp.json; VS Code has no official removal command.
      return entry
        ? [
            {
              kind: 'run',
              argv: ['code', '--add-mcp', JSON.stringify({ name: SERVER_NAME, type: 'stdio', ...entry })],
            },
          ]
        : [
            {
              kind: 'manual',
              format: 'json',
              snippet: SERVER_NAME,
              steps:
                'Dans VS Code : commande « MCP: Open User Configuration », retire l’entrée drop sous servers, puis enregistre.',
            },
          ];
    case 'cursor':
    case 'claude_desktop':
    case 'cline':
      return [{ kind: 'json', file: agentConfigPath(agent, home), entry }];
    case 'opencode':
    case 'devin_desktop':
    case 'zed':
    case 'goose':
    case 'roo_code':
    case 'jetbrains':
      return entry ? [manualStep(agent, entry)] : [manualRemoval(agent)];
  }
}

const stdio = (entry: ServerEntry) => ({ command: entry.command, args: entry.args, env: entry.env });
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/** The copyable configuration of a client drop does not write, in that client's own format and place. */
export function manualStep(agent: AgentKind, entry: ServerEntry): ManualStep {
  switch (agent) {
    case 'opencode':
      return {
        kind: 'manual',
        format: 'json',
        snippet: pretty({
          mcp: {
            servers: {
              [SERVER_NAME]: { type: 'local', command: [entry.command, ...entry.args], environment: entry.env },
            },
          },
        }),
        steps:
          'Ajoute l’entrée drop sous mcp.servers dans ~/.config/opencode/opencode.jsonc (ou opencode.json), sans toucher au reste, puis relance OpenCode.',
      };
    case 'zed':
      return {
        kind: 'manual',
        format: 'json',
        snippet: pretty({ context_servers: { [SERVER_NAME]: stdio(entry) } }),
        steps:
          'Dans Zed : commande « zed: open settings file », ajoute l’entrée drop sous context_servers, puis enregistre.',
      };
    case 'goose':
      return {
        kind: 'manual',
        format: 'yaml',
        snippet: [
          `  ${SERVER_NAME}:`,
          `    name: ${SERVER_NAME}`,
          '    type: stdio',
          `    cmd: ${JSON.stringify(entry.command)}`,
          '    args:',
          ...entry.args.map((arg) => `      - ${JSON.stringify(arg)}`),
          '    envs:',
          ...Object.entries(entry.env).map(([key, value]) => `      ${key}: ${JSON.stringify(value)}`),
          '    enabled: true',
          '    timeout: 300',
        ].join('\n'),
        steps:
          'Lance « goose configure », puis Add Extension et Command-line Extension ; ou colle ce bloc sous la clé extensions existante de ~/.config/goose/config.yaml (crée-la si elle manque), puis relance goose.',
      };
    case 'devin_desktop':
      return {
        kind: 'manual',
        format: 'json',
        snippet: pretty({ mcpServers: { [SERVER_NAME]: stdio(entry) } }),
        steps:
          'Dans Devin Desktop : Cascade, MCP, View raw config, ajoute l’entrée drop sous mcpServers, puis rafraîchis la liste des serveurs.',
      };
    case 'roo_code':
      return {
        kind: 'manual',
        format: 'json',
        snippet: pretty({ mcpServers: { [SERVER_NAME]: stdio(entry) } }),
        steps:
          'Roo Code est archivé depuis le 15 mai 2026 : préfère Cline. Sinon, dans Roo Code, Edit Global MCP, ajoute l’entrée drop sous mcpServers.',
      };
    default:
      return {
        kind: 'manual',
        format: 'json',
        snippet: pretty({ mcpServers: { [SERVER_NAME]: stdio(entry) } }),
        steps:
          'Dans ton IDE JetBrains : Settings, Tools, AI Assistant, Model Context Protocol (MCP), Add, puis colle ce JSON. Si drop est déjà dans Claude Desktop, « Import from Claude » suffit. Pour Junie : ~/.junie/mcp/mcp.json.',
      };
  }
}

function manualRemoval(agent: AgentKind): ManualStep {
  return {
    kind: 'manual',
    format: 'json',
    snippet: SERVER_NAME,
    steps: `Retire l’entrée drop de la configuration de ${agent === 'goose' ? 'goose (extensions)' : 'ce client'}, à l’endroit où tu l’as ajoutée.`,
  };
}

/** A Cursor install link (https://cursor.com/docs/mcp/install-links.md): name plus the base64 of the mcp.json entry. */
export function cursorInstallLink(entry: ServerEntry): string {
  const config = Buffer.from(JSON.stringify(entry), 'utf8').toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}
