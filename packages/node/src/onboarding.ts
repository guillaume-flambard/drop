import { createHash, randomUUID } from 'node:crypto';
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
import { basename, dirname, join, posix, win32 } from 'node:path';
import {
  AGENTS,
  CLIENT_SPECS,
  clientConfigLocation,
  clientHost,
  clientPlatform,
  codexServers,
  defaultProbe,
  executableNames,
  MAX_GLOBAL_CONFIG_BYTES,
  type AgentKind,
  type ClientHost,
  type ClientPlatform,
  type ConfigLocation,
  type InstallProbe,
} from '@drop/capabilities';
import { editJson, editYaml, readJsonEntry, readYamlEntry } from './config-edit.ts';
import { AGENT_LABELS, detectAgents } from './detect.ts';
import {
  bundledServer,
  entryKeyPath,
  entryValue,
  fallbackStep,
  installSteps,
  normalizeEntry,
  serverEntry,
  type ManualStep,
  type ServerEntry,
} from './install.ts';
import { runOfficial } from './official-command.ts';

export type OnboardingState = 'absent' | 'ready' | 'already_connected' | 'conflict' | 'error';
export interface AgentPreview {
  agent: AgentKind;
  label: string;
  state: OnboardingState;
  action: 'connect' | 'none';
  fingerprint: string;
  detail: string;
  /** The file drop writes for this client on this system, or the file its official command owns. */
  configPath?: string | undefined;
  /** Only when drop cannot write (D84): why, what to paste or run, and where. */
  manual?: ManualStep;
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
  manual?: ManualStep;
}
export interface OnboardingOptions {
  dropHome: string;
  home?: string;
  /** The system whose locations apply; this machine's by default. Tests simulate Windows and Linux with it. */
  platform?: ClientPlatform;
  /** Environment overrides (APPDATA, XDG_CONFIG_HOME, CODEX_HOME…); this process's for the real home only. */
  env?: Readonly<Record<string, string | undefined>>;
  serverSource?: string;
  run?: (argv: string[]) => void | Promise<void>;
  /** Test seam for a competing writer between temporary-file creation and the final freshness check. */
  beforeJsonCommit?: () => void;
  /** Where apps and binaries are looked for; the real machine by default. */
  probe?: InstallProbe;
}

/** Codes for which a write is impossible here: the owner gets the configuration to paste, and why (D84). */
const FALLBACK_CODES = new Set([
  'E_CONFIG_INVALID_OR_UNREADABLE',
  'E_CONFIG_UNDOCUMENTED',
  'E_CONFIG_AMBIGUOUS',
  'E_CONFIG_LOCKED',
  'E_CLI_MISSING',
  'E_CLI_SHIM_UNSAFE',
]);

function hostOf(options: OnboardingOptions): ClientHost {
  const home = options.home ?? homedir();
  return clientHost(home, options.platform ?? clientPlatform(), options.env);
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

function onPath(binary: string, probe: InstallProbe): string | undefined {
  const platform = probe.platform ?? clientPlatform();
  const path = platform === 'win32' ? win32 : posix;
  return probe.path
    .split(path.delimiter)
    .filter((dir) => dir !== '' && path.isAbsolute(dir))
    .flatMap((dir) => executableNames(binary, probe).map((name) => join(dir, name)))
    .find((candidate) => executable(candidate));
}

const CLI_BINARY: Partial<Record<AgentKind, string>> = {
  claude_code: 'claude',
  codex: 'codex',
};

/** The official command of a CLI-connected client: on PATH, or at its installer's place in the home folder. */
function cliPath(agent: AgentKind, probe: InstallProbe): string | undefined {
  const binary = CLI_BINARY[agent];
  if (!binary) return undefined;
  return (
    onPath(binary, probe) ??
    CLIENT_SPECS[agent].homeBinaries
      .flatMap((relative) => executableNames(join(probe.home, ...relative.split('/')), probe))
      .find((candidate) => executable(candidate))
  );
}

/** A regular file of bounded size, never through a symlink; undefined when absent. */
function readConfig(path: string): string | undefined {
  try {
    const stats = lstatSync(path);
    if (!stats.isFile()) throw new Error('E_CONFIG_TYPE');
    if (stats.size > MAX_GLOBAL_CONFIG_BYTES) throw new Error('E_CONFIG_TOO_LARGE');
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

/** Our entry as the file holds it, in the client's own layout; undefined when there is none. */
function existingDrop(agent: AgentKind, content: string | undefined, location: ConfigLocation): unknown {
  if (content === undefined) return undefined;
  if (agent === 'codex') {
    const definitions = content.match(/^\s*\[mcp_servers\.(?:"drop"|drop)\]\s*(?:#.*)?$/gm) ?? [];
    const related = content.match(/^\s*\[mcp_servers\.(?:"drop"|drop)(?:\]|\.)/gm) ?? [];
    if (definitions.length > 1) throw new Error('E_CONFIG_AMBIGUOUS');
    const parsed = codexServers(content).find((server) => server.name === 'drop');
    if (related.length > 0 && !parsed) throw new Error('E_DROP_CONFLICT');
    return parsed ? { command: parsed.command, args: parsed.args, env: parsed.env } : undefined;
  }
  if (agent === 'claude_code') {
    const config = record(JSON.parse(content) as unknown);
    if (config.projects !== undefined)
      for (const project of Object.values(record(config.projects))) {
        const projectServers = record(project).mcpServers;
        if (projectServers !== undefined && Object.hasOwn(record(projectServers), 'drop'))
          throw new Error('E_SCOPE_CONFLICT');
      }
    return config.mcpServers === undefined ? undefined : record(config.mcpServers).drop;
  }
  const path = entryKeyPath(location.layout, content);
  if (location.format === 'yaml') return readYamlEntry(content, path);
  if (location.format === 'toml') throw new Error('E_CONFIG_FORMAT');
  return readJsonEntry(content, path, location.format);
}

function sameEntry(location: ConfigLocation, existing: unknown, entry: ServerEntry): boolean {
  if (existing === undefined) return false;
  const server = normalizeEntry(location.layout, existing);
  if (!server) return false;
  return (
    server.command === entry.command &&
    JSON.stringify(server.args) === JSON.stringify(entry.args) &&
    Object.keys(server.env).length === Object.keys(entry.env).length &&
    Object.entries(entry.env).every(([key, item]) => server.env[key] === item)
  );
}

function expected(agent: AgentKind, options: OnboardingOptions): ServerEntry {
  return serverEntry(agent, options.dropHome, join(options.dropHome, 'bin', 'drop-mcp.mjs'));
}

/** The error code an exception stands for: a locked or forbidden file is a fallback, anything else unreadable. */
function failureCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') return 'E_CONFIG_LOCKED';
  if (error instanceof Error && error.message.startsWith('E_')) return error.message;
  return 'E_ONBOARDING_FAILED';
}

function withFallback<T extends { detail: string; manual?: ManualStep }>(
  item: T,
  agent: AgentKind,
  options: OnboardingOptions,
  location: ConfigLocation | undefined,
): T {
  if (!FALLBACK_CODES.has(item.detail)) return item;
  return { ...item, manual: fallbackStep(agent, expected(agent, options), location, item.detail) };
}

function inspect(agent: AgentKind, options: OnboardingOptions, installed: boolean): AgentPreview {
  const host = hostOf(options);
  const probe = options.probe ?? defaultProbe(host);
  const location = clientConfigLocation(agent, host);
  const base = { agent, label: AGENT_LABELS[agent], configPath: location?.path };
  const preview = (state: OnboardingState, fingerprint: string, detail: string): AgentPreview =>
    withFallback(
      { ...base, state, action: state === 'ready' ? 'connect' : 'none', fingerprint, detail },
      agent,
      options,
      location,
    );
  if (!location)
    return installed && CLIENT_SPECS[agent].undocumented?.[host.platform]
      ? preview('error', '', 'E_CONFIG_UNDOCUMENTED')
      : preview('absent', digest(undefined), 'Agent non disponible sur ce système');
  try {
    const content = readConfig(location.path);
    const fingerprint = digest(content);
    if (!installed) return preview('absent', fingerprint, 'Agent non détecté');
    if (CLIENT_SPECS[agent].connect === 'cli' && !options.run && !cliPath(agent, probe))
      return preview('error', fingerprint, 'E_CLI_MISSING');
    const existing = existingDrop(agent, content, location);
    if (existing !== undefined) {
      const same = sameEntry(location, existing, expected(agent, options));
      return preview(
        same ? 'already_connected' : 'conflict',
        fingerprint,
        same ? 'Connecteur déjà configuré' : 'Une autre entrée drop existe déjà',
      );
    }
    return preview('ready', fingerprint, 'Ajout du connecteur MCP drop uniquement');
  } catch (error) {
    const code = failureCode(error);
    // Another drop entry elsewhere in the file is a conflict to settle, not a reason to paste one more.
    if (code === 'E_SCOPE_CONFLICT' || code === 'E_DROP_CONFLICT') return preview('conflict', '', code);
    return preview('error', '', code === 'E_CONFIG_LOCKED' ? code : 'E_CONFIG_INVALID_OR_UNREADABLE');
  }
}

/** Analysis reads each client's documented files only. It does not start agents, MCP servers or network clients. */
export function previewOnboarding(options: OnboardingOptions): AgentPreview[] {
  const host = hostOf(options);
  const present = new Map(
    detectAgents(host, options.probe ?? defaultProbe(host)).map((agent) => [agent.agent, agent.installed]),
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
  // Several clients share a file name (mcp.json, settings.json): three versions per file, not per name.
  const prefix = `${basename(file)}-${createHash('sha256').update(file).digest('hex').slice(0, 8)}-`;
  writeFileSync(join(dir, `${prefix}${String(Date.now())}-${randomUUID()}.bak`), content, { mode: 0o600, flag: 'wx' });
  const files = readdirSync(dir)
    .filter((item) => item.startsWith(prefix) && item.endsWith('.bak'))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - 3))) unlinkSync(join(dir, old));
}

/** The new text of a client's file: only our entry added or removed, in its own format, the rest kept as is. */
function editedText(location: ConfigLocation, old: string | undefined, value: unknown): string {
  const path = entryKeyPath(location.layout, old);
  if (location.format === 'yaml') return editYaml(old, path, value);
  if (location.format === 'toml') throw new Error('E_CONFIG_FORMAT');
  return editJson(old, path, value, location.format);
}

/** Temporary file, fsync, freshness check against what was read, private backup, then rename (T3.3). */
function commitFile(file: string, old: string | undefined, content: string, options: OnboardingOptions): void {
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
  const seen = new Set<AgentKind>();
  const results: AgentResult[] = [];
  for (const selection of selections) results.push(await applyOne(selection, options, seen));
  return results;
}

async function applyOne(
  selection: AgentSelection,
  options: OnboardingOptions,
  seen: Set<AgentKind>,
): Promise<AgentResult> {
  const agent = selection.agent;
  const host = hostOf(options);
  const location = AGENTS.includes(agent) ? clientConfigLocation(agent, host) : undefined;
  const result = (state: AgentResult['state'], detail: string, restartRequired = false): AgentResult =>
    withFallback({ agent, state, detail, restartRequired }, agent, options, location);
  if (!AGENTS.includes(agent) || seen.has(agent)) return result('error', 'E_AGENT_INVALID');
  seen.add(agent);
  try {
    const probe = options.probe ?? defaultProbe(host);
    const present = detectAgents(host, probe).find((item) => item.agent === agent)?.installed ?? false;
    const fresh = inspect(agent, options, present);
    if (fresh.state === 'absent' || fresh.state === 'error' || !location) return result('error', fresh.detail);
    const file = location.path;
    const before = readConfig(file);
    if (digest(before) !== selection.fingerprint) return result('changed', 'E_CONFIG_CHANGED');
    const current = existingDrop(agent, before, location);
    const entry = expected(agent, options);
    if (selection.action === 'connect') {
      if (current !== undefined)
        return sameEntry(location, current, entry)
          ? result('already_connected', 'Déjà configuré')
          : result('conflict', 'E_DROP_CONFLICT');
      if (CLIENT_SPECS[agent].connect === 'cli' && !options.run && !cliPath(agent, probe))
        return result('error', 'E_CLI_MISSING');
      copyServer(options);
    } else if (current === undefined) return result('disconnected', 'Déjà retiré');
    else if (!sameEntry(location, current, entry)) return result('conflict', 'E_DROP_CONFLICT');
    if (CLIENT_SPECS[agent].connect === 'file') {
      const value = selection.action === 'connect' ? entryValue(agent, location.layout, entry, before) : undefined;
      commitFile(file, before, editedText(location, before, value), options);
    } else {
      // Official CLIs own these files. Never remove an existing entry before a new add.
      if (digest(readConfig(file)) !== digest(before)) return result('changed', 'E_CONFIG_CHANGED');
      const step = installSteps(agent, selection.action === 'connect' ? entry : null, host)[0];
      const argv = step?.kind === 'run' ? step.argv : undefined;
      if (!argv) return result('error', 'E_CLI_COMMAND');
      // The official command, found on PATH or at its installer's place.
      const binary = options.run ? argv[0] : cliPath(agent, probe);
      if (!binary) return result('error', 'E_CLI_MISSING');
      argv[0] = binary;
      if (before !== undefined) saveBackup(file, before, options.dropHome);
      await (options.run ?? ((command: string[]) => runOfficial(command, host.platform)))(argv);
      const after = existingDrop(agent, readConfig(file), location);
      if (selection.action === 'connect' ? !sameEntry(location, after, entry) : after !== undefined)
        return result('error', 'E_CLI_UNVERIFIED');
    }
    return result(
      selection.action === 'connect' ? 'connected' : 'disconnected',
      'Configuration modifiée ; relance de l’agent nécessaire',
      true,
    );
  } catch (error) {
    const code = failureCode(error);
    if (code === 'E_CONFIG_CHANGED') return result('changed', code);
    return result('error', code);
  }
}
