import { claudeNoise } from './noise.ts';
import { detectPattern } from './patterns.ts';
import { newId, shortHash, type LightStore } from './light.ts';

/**
 * Claude Code hook entry (doc https://code.claude.com/docs/en/hooks, read 2026-10-08, D23). Registered for both
 * PostToolUse (tool ran; `tool_response`) and PostToolUseFailure (tool failed; `error`): a 403 usually arrives as a
 * failure. Stores only time, tool name, session id, matched pattern name and a truncated hash of the targeted
 * resource. Never the tool output. Never throws: the caller always exits 0.
 */
export interface HookOutcome {
  recorded: boolean;
  pattern?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The resource a tool call aimed at, when one is identifiable; only its hash is kept. */
export function targetedResource(toolName: string, toolInput: unknown): string | undefined {
  const input = asRecord(toolInput);
  for (const key of ['url', 'file_path', 'path', 'notebook_path', 'command']) {
    const value = input?.[key];
    if (typeof value === 'string' && value.trim() !== '') return `${key}:${value}`;
  }
  return toolName.startsWith('mcp__') ? `tool:${toolName}` : undefined;
}

export function handleHookInput(
  raw: string,
  store: Pick<LightStore, 'append' | 'touch' | 'logError'>,
  now: Date = new Date(),
): HookOutcome {
  try {
    const input = asRecord(JSON.parse(raw));
    if (!input) throw new Error('hook input is not a JSON object');
    const event = input.hook_event_name;
    if (event !== 'PostToolUse' && event !== 'PostToolUseFailure') return { recorded: false };
    const session = typeof input.session_id === 'string' ? input.session_id : 'unknown';
    const tool = typeof input.tool_name === 'string' ? input.tool_name : 'unknown';
    store.touch(now.toISOString().slice(0, 10), 'claude', session);
    const pattern = detectPattern(event === 'PostToolUseFailure' ? text(input.error) : text(input.tool_response));
    if (!pattern || claudeNoise(event, tool, input.tool_input)) return { recorded: false };
    const resource = targetedResource(tool, input.tool_input);
    store.append({
      id: newId(),
      ts: now.toISOString(),
      source: 'hook_claude',
      agent: 'claude_code',
      session,
      tool,
      pattern,
      ...(resource ? { resource_hash: shortHash(resource) } : {}),
    });
    return { recorded: true, pattern };
  } catch (error) {
    store.logError('E_HOOK_INPUT', error instanceof Error ? error.message : 'invalid hook input');
    return { recorded: false };
  }
}
