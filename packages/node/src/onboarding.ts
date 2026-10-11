import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  accessSync,
  constants,
  closeSync,
  chmodSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import {
  AGENTS,
  agentConfigPath,
  agentServers,
  CLIENT_SPECS,
  codexServers,
  defaultProbe,
  locationServers,
  type AgentKind,
  type InstallProbe,
} from '@drop/capabilities';
import { AGENT_LABELS, detectAgents } from './detect.ts';
import { bundledServer, installSteps, manualStep, serverEntry, type ManualStep, type ServerEntry } from './install.ts';

export type OnboardingState = 'absent' | 'ready' | 'already_connected' | 'conflict' | 'error' | 'manual';
export interface AgentPreview {
  agent: AgentKind;
  label: string;
  state: OnboardingState;
  action: 'connect' | 'none';
  fingerprint: string;
  detail: string;
  /** For a client drop does not write (D66): what to paste where, in its own format. */
  manual?: ManualStep;
}
export interface AgentSelection {
  agent: AgentKind;
  fingerprint: string;
  action: 'connect' | 'disconnect';
}
export interface AgentResult {
  agent: AgentKind;
  state: 'connected' | 'disconnected' | 'already_connected' | 'changed' | 'conflict' | 'error' | 'manual';
  detail: string;
  restartRequired: boolean;
  manual?: ManualStep;
}
export interface OnboardingOptions {
  dropHome: string;
  home?: string;
  serverSource?: string;
  run?: (argv: string[]) => void | Promise<void>;
  /** Test seam for a competing writer between temporary-file creation and the final freshness check. */
  beforeJsonCommit?: () => void;
  /** Where apps and binaries are looked for; the real machine by default. */
  probe?: InstallProbe;
}

const execFileAsync = promisify(execFile);

/** Bounded: an official command waiting for an update or a login must not hold the daemon, nor block it meanwhile. */
async function runOfficial(argv: string[]): Promise<void> {
  const running = execFileAsync(argv[0] ?? '', argv.slice(1), { timeout: 60_000, killSignal: 'SIGKILL' });
  // Its output is not read, and a question it asks gets end of input at once, as with stdio ignored.
  running.child.stdin?.end();
  await running;
}

/** Copyable stdio entry for clients without an adapter; no permissions or publication are granted. */
export function manualOnboarding(options: OnboardingOptions): ServerEntry | undefined {
  const source = options.serverSource ?? bundledServer();
  if (!source) return undefined;
  return { command: process.execPath, args: [source], env: { DROP_AGENT: 'other', DROP_HOME: options.dropHome } };
}

function digest(content: string | undefined): string {
  return createHash('sha256')
    .update(content === undefined ? 'absent:' : `present:${content}`)
    .digest('hex');
}

/** An executable regular file; relative PATH entries are ignored, they would depend on the daemon's cwd. */
function executable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(binary: string, path: string): string | undefined {
  return path
    .split(delimiter)
    .filter((dir) => isAbsolute(dir))
    .map((dir) => join(dir, binary))
    .find((candidate) => executable(candidate));
}

const CLI_BINARY: Partial<Record<AgentKind, string>> = {
  claude_code: 'claude',
  codex: 'codex',
  gemini_cli: 'gemini',
  vscode: 'code',
};

/** The official command of a CLI-connected client: on PATH, or VS Code's `code` shim inside its app bundle. */
function cliPath(agent: AgentKind, probe: InstallProbe): string | undefined {
  const binary = CLI_BINARY[agent];
  if (!binary) return undefined;
  const found =
    onPath(binary, probe.path) ??
    CLIENT_SPECS[agent].homeBinaries
      .map((relative) => join(probe.home, relative))
      .find((candidate) => executable(candidate));
  if (found || agent !== 'vscode') return found;
  return probe.apps
    .map((dir) => join(dir, 'Visual Studio Code.app', 'Contents', 'Resources', 'app', 'bin', 'code'))
    .find((candidate) => executable(candidate));
}

function readConfig(path: string): string | undefined {
  try {
    if (!lstatSync(path).isFile()) throw new Error('E_CONFIG_TYPE');
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('E_CONFIG_INVALID');
  return value as Record<string, unknown>;
}

function jsonConfig(content: string | undefined): {
  config: Record<string, unknown>;
  servers: Record<string, unknown>;
} {
  const config = content === undefined ? {} : record(JSON.parse(content) as unknown);
  const servers = config.mcpServers === undefined ? {} : record(config.mcpServers);
  return { config, servers };
}

interface DropEntry {
  command?: unknown;
  args?: unknown;
  env?: unknown;
}

function existingDrop(agent: AgentKind, content: string | undefined, home: string): unknown {
  if (content === undefined && CLIENT_SPECS[agent].connect !== 'manual') return undefined;
  if (agent === 'codex' && content !== undefined) {
    const definitions = content.match(/^\s*\[mcp_servers\.(?:"drop"|drop)\]\s*(?:#.*)?$/gm) ?? [];
    const related = content.match(/^\s*\[mcp_servers\.(?:"drop"|drop)(?:\]|\.)/gm) ?? [];
    if (definitions.length > 1) throw new Error('E_CONFIG_AMBIGUOUS');
    const parsed = codexServers(content).find((server) => server.name === 'drop');
    if (related.length > 0 && !parsed) throw new Error('E_DROP_CONFLICT');
    return parsed;
  }
  const spec = CLIENT_SPECS[agent];
  const primary = spec.global(home)[0];
  if (agent !== 'claude_code' && spec.connect !== 'file' && primary) {
    // CLI-connected and manual clients: read through the registry, in each client's own format and layout.
    if (spec.connect === 'cli') {
      const server = locationServers(primary).find((item) => item.name === 'drop');
      return server ? { command: server.command, args: server.args, env: server.env } : undefined;
    }
    const server = agentServers(agent, home).find((item) => item.name === 'drop');
    return server ? { command: server.command, args: server.args, env: server.env } : undefined;
  }
  const { config, servers } = jsonConfig(content);
  if (agent === 'claude_code' && config.projects !== undefined) {
    for (const project of Object.values(record(config.projects))) {
      const projectServers = record(project).mcpServers;
      if (projectServers !== undefined && Object.hasOwn(record(projectServers), 'drop'))
        throw new Error('E_SCOPE_CONFLICT');
    }
  }
  return servers.drop;
}

function sameEntry(existing: unknown, entry: ServerEntry): boolean {
  if (existing === undefined) return false;
  const server = record(existing) as DropEntry;
  const env = record(server.env ?? {});
  return (
    server.command === entry.command &&
    JSON.stringify(server.args ?? []) === JSON.stringify(entry.args) &&
    Object.keys(env).length === Object.keys(entry.env).length &&
    Object.entries(entry.env).every(([key, item]) => env[key] === item)
  );
}

function expected(agent: AgentKind, options: OnboardingOptions): ServerEntry {
  return serverEntry(agent, options.dropHome, join(options.dropHome, 'bin', 'drop-mcp.mjs'));
}

function inspect(agent: AgentKind, options: OnboardingOptions, installed: boolean): AgentPreview {
  const home = options.home ?? homedir();
  const probe = options.probe ?? defaultProbe(home);
  const path = agentConfigPath(agent, home);
  try {
    const content = readConfig(path);
    const fingerprint = digest(content);
    if (!installed)
      return {
        agent,
        label: AGENT_LABELS[agent],
        state: 'absent',
        action: 'none',
        fingerprint,
        detail: 'Agent non détecté',
      };
    if (CLIENT_SPECS[agent].connect === 'cli' && !options.run && !cliPath(agent, probe))
      return {
        agent,
        label: AGENT_LABELS[agent],
        state: 'error',
        action: 'none',
        fingerprint,
        detail: 'E_CLI_MISSING',
      };
    const existing = existingDrop(agent, content, home);
    if (existing !== undefined) {
      const state = sameEntry(existing, expected(agent, options)) ? 'already_connected' : 'conflict';
      return {
        agent,
        label: AGENT_LABELS[agent],
        state,
        action: 'none',
        fingerprint,
        detail: state === 'conflict' ? 'Une autre entrée drop existe déjà' : 'Connecteur déjà configuré',
      };
    }
    if (CLIENT_SPECS[agent].connect === 'manual')
      return {
        agent,
        label: AGENT_LABELS[agent],
        state: 'manual',
        action: 'none',
        fingerprint,
        detail: 'E_MANUAL_ONLY',
        manual: manualStep(agent, expected(agent, options)),
      };
    return {
      agent,
      label: AGENT_LABELS[agent],
      state: 'ready',
      action: 'connect',
      fingerprint,
      detail: 'Ajout du connecteur MCP drop uniquement',
    };
  } catch {
    return {
      agent,
      label: AGENT_LABELS[agent],
      state: 'error',
      action: 'none',
      fingerprint: '',
      detail: 'E_CONFIG_INVALID_OR_UNREADABLE',
    };
  }
}

/** Analysis reads each client's documented files only. It does not start agents, MCP servers or network clients. */
export function previewOnboarding(options: OnboardingOptions): AgentPreview[] {
  const home = options.home ?? homedir();
  const present = new Map(
    detectAgents(home, options.probe ?? defaultProbe(home)).map((agent) => [agent.agent, agent.installed]),
  );
  return AGENTS.map((agent) => inspect(agent, options, present.get(agent) ?? false));
}

function saveBackup(file: string, content: string, dropHome: string): void {
  const backups = join(dropHome, 'backups');
  const dir = join(backups, 'onboarding');
  for (const path of [dropHome, backups, dir]) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (!lstatSync(path).isDirectory()) throw new Error('E_BACKUP_DIR');
    if (path !== dropHome) chmodSync(path, 0o700);
  }
  const name = `${basename(file)}-${String(Date.now())}-${randomUUID()}.bak`;
  writeFileSync(join(dir, name), content, { mode: 0o600, flag: 'wx' });
  const files = readdirSync(dir)
    .filter((item) => item.startsWith(`${basename(file)}-`) && item.endsWith('.bak'))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - 3))) unlinkSync(join(dir, old));
}

function writeJsonEntry(
  file: string,
  old: string | undefined,
  entry: ServerEntry | null,
  options: OnboardingOptions,
): void {
  const { config, servers } = jsonConfig(old);
  if (entry) servers.drop = entry;
  else delete servers.drop;
  const content = `${JSON.stringify({ ...config, mcpServers: servers }, null, 2)}\n`;
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.drop-${randomUUID()}.tmp`;
  const mode = old === undefined ? 0o600 : statSync(file).mode & 0o777;
  let fd: number | undefined;
  try {
    fd = openSync(temp, 'wx', mode);
    writeFileSync(fd, content);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    options.beforeJsonCommit?.();
    if (digest(readConfig(file)) !== digest(old)) throw new Error('E_CONFIG_CHANGED');
    if (old !== undefined) saveBackup(file, old, options.dropHome);
    renameSync(temp, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function copyServer(options: OnboardingOptions): void {
  const source = options.serverSource ?? bundledServer();
  if (!source) throw new Error('E_SERVER_MISSING');
  const dir = join(options.dropHome, 'bin');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!lstatSync(options.dropHome).isDirectory() || !lstatSync(dir).isDirectory()) throw new Error('E_BIN_TYPE');
  const target = join(dir, 'drop-mcp.mjs');
  if (source === target) return;
  const temp = join(dir, `.drop-mcp-${randomUUID()}.tmp`);
  try {
    copyFileSync(source, temp);
    chmodSync(temp, 0o700);
    const fd = openSync(temp, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, target);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

/** Applies only a freshly confirmed selection, one agent after the other. Each agent fails independently. */
export async function applyOnboarding(
  selections: AgentSelection[],
  options: OnboardingOptions,
): Promise<AgentResult[]> {
  const home = options.home ?? homedir();
  const seen = new Set<AgentKind>();
  const results: AgentResult[] = [];
  for (const selection of selections) results.push(await applyOne(selection, options, home, seen));
  return results;
}

async function applyOne(
  selection: AgentSelection,
  options: OnboardingOptions,
  home: string,
  seen: Set<AgentKind>,
): Promise<AgentResult> {
  const agent = selection.agent;
  const result = (state: AgentResult['state'], detail: string, restartRequired = false): AgentResult => ({
    agent,
    state,
    detail,
    restartRequired,
  });
  if (!AGENTS.includes(agent) || seen.has(agent)) return result('error', 'E_AGENT_INVALID');
  seen.add(agent);
  const file = agentConfigPath(agent, home);
  try {
    const probe = options.probe ?? defaultProbe(home);
    const present = detectAgents(home, probe).find((item) => item.agent === agent)?.installed ?? false;
    const fresh = inspect(agent, options, present);
    if (fresh.state === 'absent' || fresh.state === 'error') return result('error', fresh.detail);
    // A client drop does not write: never touched, whatever the selection says (D66).
    if (CLIENT_SPECS[agent].connect === 'manual')
      return { ...result('manual', 'E_MANUAL_ONLY'), manual: manualStep(agent, expected(agent, options)) };
    const before = readConfig(file);
    if (digest(before) !== selection.fingerprint) return result('changed', 'E_CONFIG_CHANGED');
    const current = existingDrop(agent, before, home);
    const entry = expected(agent, options);
    if (selection.action === 'connect') {
      if (current !== undefined)
        return sameEntry(current, entry)
          ? result('already_connected', 'Déjà configuré')
          : result('conflict', 'E_DROP_CONFLICT');
      if (CLIENT_SPECS[agent].connect === 'cli' && !options.run && !cliPath(agent, probe))
        return result('error', 'E_CLI_MISSING');
      copyServer(options);
    } else if (current === undefined) return result('disconnected', 'Déjà retiré');
    else if (!sameEntry(current, entry)) return result('conflict', 'E_DROP_CONFLICT');
    if (CLIENT_SPECS[agent].connect === 'file') {
      writeJsonEntry(file, before, selection.action === 'connect' ? entry : null, options);
    } else {
      // Official CLIs own these files. Never remove an existing entry before a new add.
      if (digest(readConfig(file)) !== digest(before)) return result('changed', 'E_CONFIG_CHANGED');
      const step = installSteps(agent, selection.action === 'connect' ? entry : null, home)[0];
      if (step?.kind === 'manual') return { ...result('manual', 'E_MANUAL_ONLY'), manual: step };
      const argv = step?.kind === 'run' ? step.argv : undefined;
      if (!argv) return result('error', 'E_CLI_COMMAND');
      // The official command, found on PATH or, for VS Code, inside its app bundle.
      const binary = options.run ? argv[0] : cliPath(agent, probe);
      if (!binary) return result('error', 'E_CLI_MISSING');
      argv[0] = binary;
      if (before !== undefined) saveBackup(file, before, options.dropHome);
      await (options.run ?? runOfficial)(argv);
      const after = existingDrop(agent, readConfig(file), home);
      if (selection.action === 'connect' ? !sameEntry(after, entry) : after !== undefined)
        return result('error', 'E_CLI_UNVERIFIED');
    }
    return result(
      selection.action === 'connect' ? 'connected' : 'disconnected',
      'Configuration modifiée ; relance de l’agent nécessaire',
      true,
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'E_CONFIG_CHANGED') return result('changed', 'E_CONFIG_CHANGED');
    return result(
      'error',
      error instanceof Error && error.message.startsWith('E_') ? error.message : 'E_ONBOARDING_FAILED',
    );
  }
}
