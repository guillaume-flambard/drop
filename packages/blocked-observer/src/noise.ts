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

const WORD_CHAR = /\w/;
const SPACE_CHAR = /\s/;

/** The first index at or after `index` whose character does not satisfy `test`. */
function skip(text: string, index: number, test: RegExp): number {
  let cursor = index;
  while (cursor < text.length && test.test(text.charAt(cursor))) cursor += 1;
  return cursor;
}

/** The position, in a sorted list, of its first value that is at least `min`, by bisection; undefined if none. */
function firstAtLeast(sorted: readonly number[], min: number): number | undefined {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? 0) < min) low = middle + 1;
    else high = middle;
  }
  return low < sorted.length ? low : undefined;
}

/**
 * `command` with each heredoc, from `<<WORD` to the line that starts with WORD, replaced by a space. Lines are indexed
 * once by their first word, so finding a terminator never rescans the text: the regular expression this replaces,
 * `/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g`, took a time quadratic in the length of a command full of
 * unterminated heredocs (T4.26, CodeQL js/polynomial-redos). Same matches, except that the terminator must now be the
 * whole word: the expression also accepted a prefix of it (`EO` closing `<<EOF`), never what a shell does.
 */
function withoutHeredocs(command: string): string {
  if (!command.includes('<<')) return command;
  const newlines: number[] = [];
  /** For each word that starts a line (after its leading spaces): those lines' starts and the word's ends, in order. */
  const lineWords = new Map<string, { starts: number[]; ends: number[] }>();
  for (let lineStart = 0; lineStart <= command.length;) {
    const newline = command.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? command.length : newline;
    // Spaces other than a newline only: a blank line is crossed by `\s*` and found as the next line's own entry.
    let start = lineStart;
    while (start < lineEnd && SPACE_CHAR.test(command.charAt(start))) start += 1;
    const end = skip(command, start, WORD_CHAR);
    if (end > start && end <= lineEnd) {
      const word = command.slice(start, end);
      const lines = lineWords.get(word) ?? { starts: [], ends: [] };
      lines.starts.push(lineStart);
      lines.ends.push(end);
      lineWords.set(word, lines);
    }
    if (newline < 0) break;
    newlines.push(newline);
    lineStart = newline + 1;
  }
  const kept: string[] = [];
  let copied = 0;
  let from = 0;
  for (let at = command.indexOf('<<', from); at >= 0; at = command.indexOf('<<', from)) {
    from = at + 1;
    let cursor = at + 2;
    if (command.charAt(cursor) === '-') cursor += 1;
    cursor = skip(command, cursor, SPACE_CHAR);
    if (command.charAt(cursor) === "'" || command.charAt(cursor) === '"') cursor += 1;
    const wordEnd = skip(command, cursor, WORD_CHAR);
    if (wordEnd === cursor) continue;
    const headerAt = firstAtLeast(newlines, wordEnd);
    const header = headerAt === undefined ? undefined : newlines[headerAt];
    if (header === undefined) continue;
    // The body takes at least the header's newline and one more: the terminator starts two characters later at least.
    const lines = lineWords.get(command.slice(cursor, wordEnd));
    const terminator = lines ? firstAtLeast(lines.starts, header + 2) : undefined;
    if (!lines || terminator === undefined) continue;
    kept.push(command.slice(copied, at), ' ');
    copied = lines.ends[terminator] ?? command.length;
    from = copied;
  }
  kept.push(command.slice(copied));
  return kept.join('');
}

/** Splits on unquoted `&&`, `||`, `;`, `|` and newlines, after dropping heredoc bodies. */
function segments(command: string): string[] {
  const text = withoutHeredocs(command);
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

/** A JSON string body, decoded when it can be, else as written. */
function decoded(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/** The raw body of the `"…"` string opening at `index` and the index after its closing quote; undefined if open. */
function stringAt(text: string, index: number): { raw: string; end: number } | undefined {
  for (let cursor = index + 1; cursor < text.length; cursor += text.charAt(cursor) === '\\' ? 2 : 1)
    if (text.charAt(cursor) === '"') return { raw: text.slice(index + 1, cursor), end: cursor + 1 };
  return undefined;
}

/**
 * The script of each `"command": [..., "-lc", "<script>"]`, the flag inside the brackets. Each bracket is searched once:
 * `/"command"\s*:\s*\[[^\]]*?"-l?c"\s*,\s*"((?:[^"\\]|\\.)*)"/g` rescanned it from every `"command":[` it held, a time
 * quadratic in their number (T4.26, CodeQL js/polynomial-redos). Same matches.
 */
function shellScripts(args: string): string[] {
  const found: string[] = [];
  const key = /"command"\s*:\s*\[/g;
  for (let match = key.exec(args); match; match = key.exec(args)) {
    const start = match.index + match[0].length;
    const close = args.indexOf(']', start);
    const limit = close < 0 ? args.length : close;
    // The flag holds no `]`: when it starts inside the brackets it ends there too.
    const flag = /"-l?c"\s*,\s*"/.exec(args.slice(start, limit));
    if (!flag) {
      // Every later `"command":[` before this `]` shares the same tail of brackets, without a flag either.
      key.lastIndex = Math.max(key.lastIndex, limit);
      continue;
    }
    const script = stringAt(args, start + flag.index + flag[0].length - 1);
    // An unterminated script means no unescaped quote follows, so no later script could close either.
    if (!script) break;
    found.push(decoded(script.raw));
    key.lastIndex = script.end;
  }
  return found;
}

/** Shell commands named in a tool call's arguments: Codex `cmd:"…"` (code mode) or `"cmd"`/`"command"` (JSON). */
export function commandsIn(args: string): string[] {
  const found: string[] = [];
  for (const match of args.matchAll(/["']?\bcmd["']?\s*:\s*"((?:[^"\\]|\\.)*)"/g)) found.push(decoded(match[1] ?? ''));
  found.push(...shellScripts(args));
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
