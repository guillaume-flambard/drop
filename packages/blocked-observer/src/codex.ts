import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detectPattern } from './patterns.ts';
import { shortHash, type ObservedEvent, type ObserverStore } from './store.ts';

/**
 * Codex session logs, verified on codex-cli 0.156 (2026-10-08, D23): ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl, one
 * JSON record per line. `session_meta.payload.session_id` names the session; tool calls are response_item payloads
 * of type function_call / custom_tool_call (name, call_id) and their results *_call_output (call_id, output as a string
 * or a list of {type:'input_text', text}).
 */
export function codexSessionsDir(): string {
  return process.env.CODEX_SESSIONS_DIR ?? join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : [];
  });
}

function outputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part ? String((part as { text: unknown }).text) : '',
      )
      .join('\n');
  }
  return output === undefined ? '' : JSON.stringify(output);
}

interface Rec {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    session_id?: string;
    id?: string;
    name?: string;
    call_id?: string;
    output?: unknown;
    arguments?: string;
    input?: string;
  };
}

export interface CodexImport {
  events: ObservedEvent[];
  sessions: { day: string; session: string }[];
  files: number;
}

/** Parses Codex logs modified since `sinceMs`. Event ids are derived from session and call id, so re-imports dedupe. */
export function parseCodexSessions(dir: string, sinceMs: number): CodexImport {
  const result: CodexImport = { events: [], sessions: [], files: 0 };
  for (const file of walk(dir)) {
    if (statSync(file).mtimeMs < sinceMs) continue;
    result.files += 1;
    let session = 'unknown';
    const tools = new Map<string, { name: string; resource: string }>();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      let rec: Rec;
      try {
        rec = JSON.parse(line) as Rec;
      } catch {
        continue;
      }
      const payload = rec.payload;
      if (!payload) continue;
      if (rec.type === 'session_meta') {
        session = payload.session_id ?? payload.id ?? session;
        if (rec.timestamp) result.sessions.push({ day: rec.timestamp.slice(0, 10), session });
        continue;
      }
      if ((payload.type === 'function_call' || payload.type === 'custom_tool_call') && payload.call_id) {
        tools.set(payload.call_id, {
          name: payload.name ?? 'unknown',
          resource: payload.arguments ?? payload.input ?? '',
        });
        continue;
      }
      if ((payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') && payload.call_id) {
        const pattern = detectPattern(outputText(payload.output));
        if (!pattern) continue;
        const tool = tools.get(payload.call_id);
        result.events.push({
          id: `codex-${shortHash(`${session}:${payload.call_id}`)}`,
          ts: rec.timestamp ?? new Date().toISOString(),
          source: 'codex_log',
          agent: 'codex',
          session,
          tool: tool?.name ?? 'unknown',
          pattern,
          ...(tool?.resource ? { resource_hash: shortHash(tool.resource) } : {}),
        });
      }
    }
  }
  return result;
}

/** Appends new Codex events and records active Codex days. Returns how many events were new. */
export function importCodex(store: ObserverStore, dir: string, sinceMs: number): { added: number; files: number } {
  const parsed = parseCodexSessions(dir, sinceMs);
  const known = new Set(store.events().map((event) => event.id));
  let added = 0;
  for (const event of parsed.events) {
    if (known.has(event.id)) continue;
    store.append(event);
    added += 1;
  }
  for (const { day, session } of parsed.sessions) store.touch(day, 'codex', session);
  return { added, files: parsed.files };
}
