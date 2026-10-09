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

export type InstallStep = { kind: 'run'; argv: string[] } | { kind: 'json'; file: string; entry: ServerEntry | null };

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
    case 'cursor':
    case 'claude_desktop':
      return [{ kind: 'json', file: agentConfigPath(agent, home), entry }];
  }
}

/** A Cursor install link (https://cursor.com/docs/mcp/install-links.md): name plus the base64 of the mcp.json entry. */
export function cursorInstallLink(entry: ServerEntry): string {
  const config = Buffer.from(JSON.stringify(entry), 'utf8').toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}
