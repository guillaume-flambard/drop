/**
 * Project-level MCP configurations (T4.5, D66). Read only in projects the agents already know (Claude Code's
 * `projects`, Codex's trusted `[projects."…"]`) and in folders the owner added from the panel; the disk is never
 * scanned. Nothing here writes a project file.
 */
import { realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { z } from 'zod';
import { AGENTS, CLIENT_SPECS, clientHost, projectServers, readConfigText, type AgentKind } from '@drop/capabilities';
import { presentServer, type DetectedServer } from './detect.ts';

const MAX_ADDED_PROJECTS = 50;
/** Known projects come from the agents' own lists; past this many, the oldest entries are not read. */
const MAX_KNOWN_PROJECTS = 200;

export interface ProjectView {
  dir: string;
  sources: ('claude_code' | 'codex' | 'added')[];
  clients: { agent: AgentKind; label: string; dropInstalled: boolean; servers: DetectedServer[] }[];
}

const AddedSchema = z.array(z.string()).max(MAX_ADDED_PROJECTS);

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Folders the owner added from the panel, kept under DROP_HOME. */
function addedProjects(dropHome: string): string[] {
  const path = join(dropHome, 'projects.json');
  try {
    return AddedSchema.parse(JSON.parse(readConfigText(path, 64 * 1024) ?? '[]'));
  } catch {
    return [];
  }
}

/** Written whole through a temporary file and a rename, owner-only. */
function saveAdded(dropHome: string, dirs: string[]): void {
  const path = join(dropHome, 'projects.json');
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(dirs, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}

/** Neither the filesystem root nor the home folder: their files are the global ones, not a project's. */
function eligible(dir: string, home: string): boolean {
  return dir !== parse(dir).root && dir !== resolve(home) && isDirectory(dir);
}

/** Adds one absolute, existing folder (not the filesystem root, not the home folder itself). */
export function addProject(dropHome: string, dir: string, home: string = homedir()): string {
  if (!isAbsolute(dir) || !isDirectory(dir)) throw new Error('E_PROJECT_PATH');
  // The real path: a symlink to the root or to the home folder is refused like the folder itself.
  const normalized = realpathSync(dir);
  if (!eligible(normalized, realpathSync(home))) throw new Error('E_PROJECT_PATH');
  const current = addedProjects(dropHome);
  if (current.includes(normalized)) return normalized;
  if (current.length >= MAX_ADDED_PROJECTS) throw new Error('E_PROJECT_LIMIT');
  saveAdded(dropHome, [...current, normalized]);
  return normalized;
}

export function removeProject(dropHome: string, dir: string): boolean {
  const current = addedProjects(dropHome);
  const kept = current.filter((item) => item !== resolve(dir));
  if (kept.length === current.length) return false;
  saveAdded(dropHome, kept);
  return true;
}

/** The project folders Claude Code and Codex already list in their own global configuration. */
function knownProjects(home: string = homedir()): { dir: string; source: 'claude_code' | 'codex' }[] {
  const found: { dir: string; source: 'claude_code' | 'codex' }[] = [];
  try {
    const claude = JSON.parse(
      readConfigText(CLIENT_SPECS.claude_code.global(clientHost(home))[0]?.path ?? '') ?? '{}',
    ) as {
      projects?: unknown;
    };
    if (typeof claude.projects === 'object' && claude.projects !== null)
      for (const dir of Object.keys(claude.projects)) found.push({ dir, source: 'claude_code' });
  } catch {
    // No Claude Code config, or unreadable: nothing known from it.
  }
  try {
    const codex = readConfigText(CLIENT_SPECS.codex.global(clientHost(home))[0]?.path ?? '') ?? '';
    // Codex writes a key holding a backslash (a Windows path) as a literal string, 'C:\…', which has no escapes.
    for (const match of codex.matchAll(/^\s*\[projects\.(?:"((?:[^"\\]|\\.)+)"|'([^'\r\n]+)')\]/gm)) {
      if (match[2] !== undefined) {
        found.push({ dir: match[2], source: 'codex' });
        continue;
      }
      try {
        found.push({ dir: JSON.parse(`"${match[1] ?? ''}"`) as string, source: 'codex' });
      } catch {
        // A TOML escape JSON does not know: skip this one project, keep the others.
      }
    }
  } catch {
    // No Codex config, or unreadable: nothing known from it.
  }
  return found.slice(-MAX_KNOWN_PROJECTS).filter(({ dir }) => isAbsolute(dir) && eligible(resolve(dir), home));
}

/** Every known or added project, with the MCP servers each client declares there; never a secret value. */
export function listProjects(dropHome: string, home: string = homedir()): ProjectView[] {
  const sources = new Map<string, ProjectView['sources']>();
  const add = (dir: string, source: ProjectView['sources'][number]) => {
    const key = resolve(dir);
    sources.set(key, [...new Set([...(sources.get(key) ?? []), source])]);
  };
  for (const { dir, source } of knownProjects(home)) add(dir, source);
  for (const dir of addedProjects(dropHome)) if (isDirectory(dir)) add(dir, 'added');
  return [...sources].map(([dir, from]) => ({
    dir,
    sources: from,
    clients: AGENTS.flatMap((agent) => {
      const servers = projectServers(agent, dir).map((server) => presentServer(agent, server));
      if (servers.length === 0) return [];
      return [
        {
          agent,
          label: CLIENT_SPECS[agent].label,
          dropInstalled: servers.some((server) => server.name === 'drop' || /requester-mcp/.test(server.where)),
          servers,
        },
      ];
    }),
  }));
}
