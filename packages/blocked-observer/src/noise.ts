/**
 * Noise filter (D25). Measured on 30 days of real Codex logs (2026-10-08): most matches were the agent reading text that
 * mentions a refusal, not a refusal. A file shown by `sed` or `rg`, a web search result, a test log. None of them is
 * someone else's resource saying no. A command that only displays local content, or a tool that only returns content,
 * is noise unless it failed. No zod on this path: the Claude Code hook imports it.
 */

/** Commands that only display local content. `sed -i` edits, so it is excluded. */
const READERS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'nl',
  'wc',
  'ls',
  'find',
  'rg',
  'grep',
  'awk',
  'jq',
  'sort',
  'uniq',
  'cut',
  'tr',
  'echo',
  'printf',
  'pwd',
  'true',
  'diff',
  'stat',
  'file',
  'tree',
]);
const GIT_READERS = new Set(['show', 'diff', 'log', 'status', 'grep', 'blame', 'ls-files', 'rev-parse', 'branch']);

/**
 * Claude Code tools whose successful result can carry someone else's refusal: the shell and MCP tools. Every other
 * tool (Read, Write, Edit, Grep, AskUserQuestion, WebSearch…) returns content the agent read or wrote itself, as seen on
 * 2026-10-08 when writing tests and questions that mention « 401 » created events.
 */
export function reachesResource(tool: string): boolean {
  return tool === 'Bash' || tool.startsWith('mcp__');
}

/** Shell keywords that wrap other commands: they read nothing themselves. */
const NEUTRAL = new Set(['cd', 'for', 'do', 'done', 'while', 'if', 'then', 'else', 'fi', 'set', 'export', '{', '}']);

/** Test and build runners: their output is the agent's own code under test, never someone else's resource. */
const OWN_RUNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)\b/,
  /^(?:npx\s+)?(?:vitest|jest|pytest|tsc)\b/,
  /^(?:node|tsx|npx\s+tsx)\s+(?:[^\s]+\s+)*--test\b/,
  /^uv\s+run\s+(?:--\S+\s+\S+\s+)*pytest\b/,
  /^(?:cargo|go)\s+test\b/,
];

/** Splits on unquoted `&&`, `||`, `;`, `|` and newlines, after dropping heredoc bodies. */
function segments(command: string): string[] {
  const text = command.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g, ' ');
  const parts: string[] = [];
  let current = '';
  let quote: string | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (quote) {
      if (char === quote) quote = undefined;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';' || char === '\n' || char === '|' || (char === '&' && text.charAt(i + 1) === '&')) {
      parts.push(current);
      current = '';
      if ((char === '|' || char === '&') && text.charAt(i + 1) === char) i += 1;
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function words(segment: string): string[] {
  const list = segment.split(/\s+/).filter((word) => !/^\w+=/.test(word));
  while (['rtk', 'proxy', 'command', 'time', 'sudo'].includes(list[0] ?? '')) list.shift();
  if (list[0]?.includes('/')) list[0] = list[0].slice(list[0].lastIndexOf('/') + 1);
  return list;
}

/** True when every part of the shell command only displays local content or runs the agent's own tests or build. */
export function isReadOnlyCommand(command: string): boolean {
  const parts = segments(command);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    const list = words(part);
    const [head, second] = list;
    if (head === undefined || NEUTRAL.has(head)) return true;
    if (OWN_RUNS.some((run) => run.test(list.join(' ')))) return true;
    if (head === 'sed') return !/\s-i\b|\s--in-place\b/.test(part);
    if (head === 'git') return second !== undefined && GIT_READERS.has(second);
    return READERS.has(head);
  });
}

/** Shell commands named in a tool call's arguments: Codex `cmd:"…"` (code mode) or `"cmd"`/`"command"` (JSON). */
export function commandsIn(args: string): string[] {
  const found: string[] = [];
  for (const match of args.matchAll(/["']?\bcmd["']?\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    try {
      found.push(JSON.parse(`"${match[1] ?? ''}"`) as string);
    } catch {
      found.push(match[1] ?? '');
    }
  }
  for (const match of args.matchAll(/"command"\s*:\s*\[[^\]]*?"-l?c"\s*,\s*"((?:[^"\\]|\\.)*)"/g)) {
    try {
      found.push(JSON.parse(`"${match[1] ?? ''}"`) as string);
    } catch {
      found.push(match[1] ?? '');
    }
  }
  return found;
}

/** Codex web search (`tools.web__run`, or a tool named web_search): results are third-party pages, not refusals. */
export function isWebSearch(name: string, args: string): boolean {
  return /web_?search|web__run/.test(name) || /tools\.web__run\b/.test(args);
}

/** A non-zero exit code reported in the output, when Codex reports one. */
export function failedExit(output: string): boolean {
  return [...output.matchAll(/exit_code\\*"?\s*:\s*(-?\d+)|exited with code (-?\d+)|Exit code:\s*(-?\d+)/g)].some(
    (match) => Number(match[1] ?? match[2] ?? match[3]) !== 0,
  );
}

/** Codex: the matched output is noise when the call only read content and did not fail. */
export function codexNoise(name: string, args: string, output: string): boolean {
  if (failedExit(output)) return false;
  if (isWebSearch(name, args)) return true;
  const commands = commandsIn(args);
  return commands.length > 0 && commands.every(isReadOnlyCommand);
}

/** Claude Code: a successful tool that reaches no resource, or a Bash call that only read content, is noise. Failures always count. */
export function claudeNoise(event: string, tool: string, input: unknown): boolean {
  if (event !== 'PostToolUse') return false;
  if (!reachesResource(tool)) return true;
  if (tool !== 'Bash') return false;
  const command = typeof input === 'object' && input !== null && 'command' in input ? input.command : undefined;
  return typeof command === 'string' && isReadOnlyCommand(command);
}

/**
 * Drops stored, unclassified Claude Code events from tools that reach no resource: they were recorded before this
 * filter (D25). Bash events stay, their command was never stored. A classified event is always kept.
 */
export function pruneHookNoise<
  E extends { source: string; tool?: string | undefined; classification?: string | undefined },
>(events: E[]): E[] {
  return events.filter(
    (event) =>
      event.source !== 'hook_claude' || event.classification !== undefined || reachesResource(event.tool ?? 'Bash'),
  );
}
