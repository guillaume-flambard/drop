import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentConfigPath, type AgentKind } from '@drop/capabilities';

/**
 * `drop install <agent>` (T2.5): adds drop's requester MCP server to a coding agent, the way that agent documents it.
 * Claude Code and Codex through their own CLI (`claude mcp add --scope user`, `codex mcp add`,
 * https://developers.openai.com/codex/mcp); Cursor and Claude Desktop by adding a `drop` entry to their `mcpServers`
 * file, after a one-time backup. The server is the bundled `drop-mcp.mjs` (D29), copied into DROP_HOME/bin so it keeps
 * working when the repo or the app moves.
 */
export interface ServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export type InstallStep =
  { kind: 'run'; argv: string[]; mayFail?: boolean } | { kind: 'json'; file: string; entry: ServerEntry | null };

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
      return [
        { kind: 'run', argv: ['claude', 'mcp', 'remove', '--scope', 'user', SERVER_NAME], mayFail: true },
        ...(entry
          ? [
              {
                kind: 'run' as const,
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
          : []),
      ];
    case 'codex':
      return [
        { kind: 'run', argv: ['codex', 'mcp', 'remove', SERVER_NAME], mayFail: true },
        ...(entry
          ? [
              {
                kind: 'run' as const,
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
          : []),
      ];
    case 'cursor':
    case 'claude_desktop':
      return [{ kind: 'json', file: agentConfigPath(agent, home), entry }];
  }
}

/** Sets or removes `mcpServers.drop` in an agent's JSON file, keeping everything else; backs the file up once. */
export function applyJsonStep(file: string, entry: ServerEntry | null): void {
  const existed = existsSync(file);
  const config = existed ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  if (existed && !existsSync(`${file}.bak-drop`)) copyFileSync(file, `${file}.bak-drop`);
  const others = Object.entries(
    typeof config.mcpServers === 'object' && config.mcpServers !== null ? config.mcpServers : {},
  ).filter(([name]) => name !== SERVER_NAME);
  const servers = Object.fromEntries(entry ? [...others, [SERVER_NAME, entry]] : others);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...config, mcpServers: servers }, null, 2)}\n`);
}

export interface InstallOptions {
  dropHome: string;
  home?: string;
  /** Runs an agent CLI; tests pass a recorder. */
  run?: (argv: string[]) => void;
  serverSource?: string;
}

/** Installs (or with `remove`, uninstalls) drop in one agent. Returns the steps taken, for display. */
export function install(agent: AgentKind, options: InstallOptions, remove = false): InstallStep[] {
  let entry: ServerEntry | null = null;
  if (!remove) {
    const source = options.serverSource ?? bundledServer();
    if (!source) throw new Error('the bundled server is missing: run `node scripts/bundle.ts` first');
    const bin = join(options.dropHome, 'bin');
    mkdirSync(bin, { recursive: true });
    const target = join(bin, 'drop-mcp.mjs');
    copyFileSync(source, target);
    chmodSync(target, 0o755);
    entry = serverEntry(agent, options.dropHome, target);
  }
  const run = options.run ?? ((argv: string[]) => execFileSync(argv[0] ?? '', argv.slice(1), { stdio: 'ignore' }));
  const steps = installSteps(agent, entry, options.home);
  for (const step of steps) {
    if (step.kind === 'json') {
      applyJsonStep(step.file, step.entry);
      continue;
    }
    try {
      run(step.argv);
    } catch (error) {
      if (!step.mayFail) throw error;
    }
  }
  return steps;
}

/** A Cursor install link (https://cursor.com/docs/mcp/install-links.md): name plus the base64 of the mcp.json entry. */
export function cursorInstallLink(entry: ServerEntry): string {
  const config = Buffer.from(JSON.stringify(entry), 'utf8').toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}
