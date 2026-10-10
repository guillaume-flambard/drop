import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
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
import { basename, delimiter, dirname, join } from 'node:path';
import { AGENTS, agentConfigPath, codexServers, type AgentKind } from '@drop/capabilities';
import { AGENT_LABELS, detectAgents } from './detect.ts';
import { bundledServer, installSteps, serverEntry, type ServerEntry } from './install.ts';

export type OnboardingState = 'absent' | 'ready' | 'already_connected' | 'conflict' | 'error';
export interface AgentPreview {
  agent: AgentKind;
  label: string;
  state: OnboardingState;
  action: 'connect' | 'none';
  fingerprint: string;
  detail: string;
}
export interface AgentSelection {
  agent: AgentKind;
  fingerprint: string;
  action: 'connect' | 'disconnect';
}
export interface AgentResult {
  agent: AgentKind;
  state: 'connected' | 'disconnected' | 'already_connected' | 'changed' | 'conflict' | 'error';
  detail: string;
  restartRequired: boolean;
}
export interface OnboardingOptions {
  dropHome: string;
  home?: string;
  serverSource?: string;
  run?: (argv: string[]) => void;
  /** Test seam for a competing writer between temporary-file creation and the final freshness check. */
  beforeJsonCommit?: () => void;
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

function available(binary: string): boolean {
  return (process.env.PATH ?? '').split(delimiter).some((dir) => dir !== '' && existsSync(join(dir, binary)));
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

function existingDrop(agent: AgentKind, content: string | undefined): unknown {
  if (content === undefined) return undefined;
  if (agent === 'codex') {
    const definitions = content.match(/^\s*\[mcp_servers\.(?:"drop"|drop)\]\s*(?:#.*)?$/gm) ?? [];
    const related = content.match(/^\s*\[mcp_servers\.(?:"drop"|drop)(?:\]|\.)/gm) ?? [];
    if (definitions.length > 1) throw new Error('E_CONFIG_AMBIGUOUS');
    const parsed = codexServers(content).find((server) => server.name === 'drop');
    if (related.length > 0 && !parsed) throw new Error('E_DROP_CONFLICT');
    return parsed;
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

function sameEntry(agent: AgentKind, existing: unknown, entry: ServerEntry): boolean {
  const sameEnv = (value: Record<string, string> | undefined): boolean =>
    Object.keys(value ?? {}).length === Object.keys(entry.env).length &&
    Object.entries(entry.env).every(([key, item]) => value?.[key] === item);
  if (existing === undefined) return false;
  if (agent === 'codex') {
    const server = existing as { command?: string; args?: string[]; env?: Record<string, string> };
    return (
      server.command === entry.command &&
      JSON.stringify(server.args ?? []) === JSON.stringify(entry.args) &&
      sameEnv(server.env)
    );
  }
  const raw = record(existing);
  return (
    raw.command === entry.command &&
    JSON.stringify(raw.args ?? []) === JSON.stringify(entry.args) &&
    sameEnv(raw.env as Record<string, string> | undefined)
  );
}

function expected(agent: AgentKind, options: OnboardingOptions): ServerEntry {
  return serverEntry(agent, options.dropHome, join(options.dropHome, 'bin', 'drop-mcp.mjs'));
}

function inspect(agent: AgentKind, options: OnboardingOptions, installed: boolean): AgentPreview {
  const home = options.home ?? homedir();
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
    if (
      (agent === 'claude_code' || agent === 'codex') &&
      !options.run &&
      !available(agent === 'codex' ? 'codex' : 'claude')
    )
      return {
        agent,
        label: AGENT_LABELS[agent],
        state: 'error',
        action: 'none',
        fingerprint,
        detail: 'E_CLI_MISSING',
      };
    const existing = existingDrop(agent, content);
    if (existing !== undefined) {
      const state = sameEntry(agent, existing, expected(agent, options)) ? 'already_connected' : 'conflict';
      return {
        agent,
        label: AGENT_LABELS[agent],
        state,
        action: 'none',
        fingerprint,
        detail: state === 'conflict' ? 'Une autre entrée drop existe déjà' : 'Connecteur déjà configuré',
      };
    }
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

/** Analysis reads four known locations only. It does not start agents, MCP servers or network clients. */
export function previewOnboarding(options: OnboardingOptions): AgentPreview[] {
  const home = options.home ?? homedir();
  const present = new Map(detectAgents(home).map((agent) => [agent.agent, agent.installed]));
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

/** Applies only a freshly confirmed selection. Each agent fails independently. */
export function applyOnboarding(selections: AgentSelection[], options: OnboardingOptions): AgentResult[] {
  const home = options.home ?? homedir();
  const seen = new Set<AgentKind>();
  return selections.map((selection): AgentResult => {
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
      const present = detectAgents(home).find((item) => item.agent === agent)?.installed ?? false;
      const fresh = inspect(agent, options, present);
      if (fresh.state === 'absent' || fresh.state === 'error') return result('error', fresh.detail);
      const before = readConfig(file);
      if (digest(before) !== selection.fingerprint) return result('changed', 'E_CONFIG_CHANGED');
      const current = existingDrop(agent, before);
      const entry = expected(agent, options);
      if (selection.action === 'connect') {
        if (current !== undefined)
          return sameEntry(agent, current, entry)
            ? result('already_connected', 'Déjà configuré')
            : result('conflict', 'E_DROP_CONFLICT');
        if (
          (agent === 'claude_code' || agent === 'codex') &&
          !options.run &&
          !available(agent === 'codex' ? 'codex' : 'claude')
        )
          return result('error', 'E_CLI_MISSING');
        copyServer(options);
      } else if (current === undefined) return result('disconnected', 'Déjà retiré');
      else if (!sameEntry(agent, current, entry)) return result('conflict', 'E_DROP_CONFLICT');
      if (agent === 'cursor' || agent === 'claude_desktop') {
        writeJsonEntry(file, before, selection.action === 'connect' ? entry : null, options);
      } else {
        // Official CLIs own these files. Never remove an existing entry before a new add.
        if (digest(readConfig(file)) !== digest(before)) return result('changed', 'E_CONFIG_CHANGED');
        const step = installSteps(agent, selection.action === 'connect' ? entry : null, home)[0];
        const argv = step?.kind === 'run' ? step.argv : undefined;
        if (!argv) return result('error', 'E_CLI_COMMAND');
        if (before !== undefined) saveBackup(file, before, options.dropHome);
        (
          options.run ??
          ((args: string[]) => {
            execFileSync(args[0] ?? '', args.slice(1), { stdio: 'ignore' });
          })
        )(argv);
        const after = existingDrop(agent, readConfig(file));
        if (selection.action === 'connect' ? !sameEntry(agent, after, entry) : after !== undefined)
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
  });
}
