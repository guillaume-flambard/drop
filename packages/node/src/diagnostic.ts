/**
 * The redacted diagnostic (T4.37): a text the owner reads in full, then copies and sends himself during a trial. drop
 * never sends it. It holds versions, system and states, and the ends of the two logs, each line redacted again (a log
 * from before T4.37 or a line of the shell had no redaction of the node) and checked by the secret scanner. Keys, the
 * local token, configuration, peers, team, invites, receipts, facts and requests are never read here.
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { join } from 'node:path';
import { DropError } from '@drop/protocol';
import { scanSecrets } from '@drop/runner';
import { APP_LOG, DAEMON_LOG, jsonObject, logsDir, redactLogLineDetailed, redactText } from './logs.ts';
import { ENGINE_VERSION } from './version.ts';

/** What the daemon knows of its own state; nothing that names a person or a machine. */
export interface DiagnosticStatus {
  appVersion?: string | undefined;
  profile?: string | undefined;
  relayConnected: boolean;
  lan?: string | undefined;
  internet?: string | undefined;
  peers: number;
  policy: boolean;
}

export interface Diagnostic {
  text: string;
  /** Lines left out because they still looked like a secret after redaction. */
  removed: number;
  logDir: string;
  logPath: string;
}

export interface DiagnosticOptions {
  /** DROP_HOME. */
  root: string;
  /** The user's home folder, written ~. */
  home?: string | undefined;
  status: DiagnosticStatus;
  /** Exact values to remove: the local token, secret environment values. */
  known?: readonly string[];
  now?: () => number;
}

const DAEMON_LINES = 200;
const APP_LINES = 50;
/** At most this much of the end of each file is read. */
const TAIL_BYTES = 256 * 1024;

/** The last lines of a file, reading at most TAIL_BYTES from its end; none when it is missing. */
function tail(path: string): string[] {
  if (!existsSync(path)) return [];
  const size = statSync(path).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString('utf8').split('\n');
  // A read that starts inside a line drops that partial line.
  if (start > 0) lines.shift();
  return lines.map((line) => line.replace(/\r$/, '')).filter((line) => line.trim() !== '');
}

function value(item: unknown): string {
  if (typeof item === 'string') return item;
  if (Array.isArray(item) && item.every((entry) => typeof entry === 'string')) return item.join(' | ');
  return JSON.stringify(item);
}

/** A JSON log line as a person reads it: date, event and code first, then `name: value`, words separated by spaces. */
function readable(line: string): string {
  const entry = jsonObject(line);
  if (!entry) return line;
  const { at, event, code, ...rest } = entry;
  return [at, event, code]
    .filter((part) => part !== undefined && part !== null)
    .map(value)
    .concat(Object.entries(rest).map(([name, item]) => `${name}: ${value(item)}`))
    .join(' ');
}

interface Section {
  lines: string[];
  removed: number;
}

function section(raw: string[], keep: number, options: DiagnosticOptions): Section {
  const lines: string[] = [];
  let removed = 0;
  for (const line of raw.slice(-keep)) {
    const redacted = redactLogLineDetailed(line, { known: options.known ?? [], home: options.home });
    const shown = redacted.replaced ? undefined : readable(redacted.line);
    if (shown === undefined || scanSecrets(shown).length > 0) {
      removed += 1;
      continue;
    }
    lines.push(shown);
  }
  return { lines, removed };
}

function removedSentence(count: number): string {
  if (count === 0) return 'Aucune ligne retirée.';
  if (count === 1) return '1 ligne retirée parce qu’elle ressemblait à un secret.';
  return `${String(count)} lignes retirées parce qu’elles ressemblaient à un secret.`;
}

/** Builds the diagnostic; refuses with E_SECRET_DETECTED, and no text, if the whole still trips the scanner. */
export function buildDiagnostic(options: DiagnosticOptions): Diagnostic {
  const dir = logsDir(options.root);
  const logPath = join(dir, DAEMON_LOG);
  const appPath = join(dir, APP_LOG);
  const shown = (path: string): string => redactText(path, { home: options.home });
  const { status } = options;
  const now = new Date(options.now?.() ?? Date.now()).toISOString();
  // Oldest first: a log from before T4.37, the previous file, then the current one.
  const daemon = section(
    [`${logPath}.legacy`, `${logPath}.1`, logPath].flatMap((path) => tail(path)),
    DAEMON_LINES,
    options,
  );
  const app = section(
    [`${appPath}.1`, appPath].flatMap((path) => tail(path)),
    APP_LINES,
    options,
  );
  const removed = daemon.removed + app.removed;
  const text = [
    `Diagnostic drop, préparé le ${now}`,
    'Relis-le en entier avant de l’envoyer. Il ne contient ni clé, ni jeton, ni le contenu d’une demande.',
    '',
    `App : ${status.appVersion ?? 'lancé hors de l’app'}`,
    `Moteur : ${ENGINE_VERSION}`,
    `Système : ${platform()} ${release()} (${arch()}), Node ${process.versions.node}`,
    `Profil : ${status.profile ?? 'inconnu'}`,
    `Relais : ${status.relayConnected ? 'connecté' : 'non connecté'}`,
    `Réseau local : ${status.lan ?? 'inconnu'}`,
    `Internet : ${status.internet ?? 'inconnu'}`,
    `Pairs connus : ${String(status.peers)}`,
    `Politique d’entreprise : ${status.policy ? 'oui' : 'non'}`,
    '',
    `Journal du moteur (${shown(logPath)}, ${String(daemon.lines.length)} lignes) :`,
    ...(daemon.lines.length > 0 ? daemon.lines : ['(vide)']),
    '',
    `Journal de l’app (${shown(appPath)}, ${String(app.lines.length)} lignes) :`,
    ...(app.lines.length > 0 ? app.lines : ['(vide)']),
    '',
    removedSentence(removed),
    '',
  ].join('\n');
  if (scanSecrets(text).length > 0)
    throw new DropError('E_SECRET_DETECTED', 'Le diagnostic ressemble encore à un secret : rien n’est affiché.');
  return { text, removed, logDir: dir, logPath };
}

/** Opens a folder in the system's file manager, its path as the only argument, without a shell. */
export function openFolder(dir: string): Promise<void> {
  const system = platform();
  const command = system === 'darwin' ? 'open' : system === 'win32' ? 'explorer.exe' : 'xdg-open';
  return new Promise((resolve, reject) => {
    const child = spawn(command, [dir], { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
