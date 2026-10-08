#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const USAGE = `blocked-observer <command>
  mcp                       MCP server (stdio) with the report_blocked tool
  hook                      Claude Code hook entry (PostToolUse and PostToolUseFailure)
  import-codex [--since 7d] import blocks from local Codex session logs
  install                   print (never apply) the Claude Code and Codex configuration
  list [--since 7d]         table of events (imports new Codex blocks first; --no-codex to skip)
  classify <id>             classification, minutes lost, note
  report [--since 30d]      summary per active day (imports new Codex blocks first)
  export --out file.json    export after reviewing every event
  print-instructions        snippet for AGENTS.md / CLAUDE.md`;

function since(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+)([hd])$/.exec(value);
  if (!match) throw new Error('--since expects e.g. 24h or 7d');
  return Date.now() - Number(match[1]) * (match[2] === 'd' ? 86_400_000 : 3_600_000);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}

const [command, ...rest] = process.argv.slice(2);

// `blocked-observer list | head` closes the pipe early: that is a normal end, not a crash.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

if (command === 'hook') {
  // Must never fail Claude Code: whatever happens, exit 0 with nothing on stdout. No zod on this path (light.ts).
  const { LightStore } = await import('./light.ts');
  const light = new LightStore();
  try {
    const { handleHookInput } = await import('./hook.ts');
    handleHookInput(await readStdin(), light);
  } catch (error) {
    light.logError('E_HOOK', error instanceof Error ? error.message : 'hook failed');
  }
  process.exit(0);
}

const { ObserverStore } = await import('./store.ts');
const store = new ObserverStore();

/** Codex has no hook: list and report first pull in new Codex blocks (idempotent), unless --no-codex is given. */
async function syncCodex(args: string[]): Promise<void> {
  if (args.includes('--no-codex') || process.env.BLOCKED_OBSERVER_NO_CODEX === '1') return;
  try {
    const { codexSessionsDir, importCodex } = await import('./codex.ts');
    importCodex(store, codexSessionsDir(), Date.now() - 30 * 86_400_000);
  } catch (error) {
    store.logError('E_CODEX_IMPORT', error instanceof Error ? error.message : 'codex import failed');
  }
}

switch (command) {
  case 'mcp': {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { createObserverServer } = await import('./mcp.ts');
    const agent = process.env.BLOCKED_OBSERVER_AGENT === 'codex' ? 'codex' : 'claude_code';
    await createObserverServer(store, agent).connect(new StdioServerTransport());
    break;
  }
  case 'import-codex': {
    const { values } = parseArgs({
      args: rest,
      options: { since: { type: 'string' }, 'no-codex': { type: 'boolean' } },
    });
    const { codexSessionsDir, importCodex } = await import('./codex.ts');
    const { added, files } = importCodex(store, codexSessionsDir(), since(values.since ?? '7d'));
    process.stdout.write(`${String(files)} Codex session files read, ${String(added)} new events\n`);
    break;
  }
  case 'install': {
    const { installText } = await import('./install.ts');
    process.stdout.write(installText());
    break;
  }
  case 'print-instructions': {
    const { INSTRUCTIONS } = await import('./install.ts');
    process.stdout.write(`${INSTRUCTIONS}\n`);
    break;
  }
  case 'list': {
    await syncCodex(rest);
    const { values } = parseArgs({
      args: rest,
      options: { since: { type: 'string' }, 'no-codex': { type: 'boolean' } },
    });
    const from = since(values.since);
    const events = store.events().filter((event) => Date.parse(event.ts) >= from);
    if (events.length === 0) process.stdout.write('no event\n');
    for (const event of events) {
      const what =
        event.source === 'report'
          ? `${event.missing ?? ''}: ${event.resource ?? ''}`
          : `${event.tool ?? ''} → ${event.pattern ?? ''}`;
      process.stdout.write(
        `${event.ts.slice(0, 16)}  ${event.id.slice(0, 8)}  ${event.source.padEnd(11)} ${event.agent.padEnd(11)} ${what}${event.classification ? `  [${event.classification}]` : ''}${event.linked_id ? '  linked' : ''}\n`,
      );
    }
    break;
  }
  case 'classify': {
    const prefix = rest[0];
    if (!prefix) throw new Error('blocked-observer classify <id>');
    const { CLASSIFICATIONS } = await import('./store.ts');
    const events = store.events();
    const event = events.find((candidate) => candidate.id.startsWith(prefix));
    if (!event) throw new Error(`no event ${prefix}`);
    process.stdout.write(`${JSON.stringify(event, null, 2)}\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    CLASSIFICATIONS.forEach((name, index) => process.stdout.write(`  ${String(index + 1)}. ${name}\n`));
    const choice = CLASSIFICATIONS[Number(await rl.question('classification (1-8): ')) - 1];
    if (!choice) throw new Error('invalid classification');
    const minutes = Number(await rl.question('minutes lost: '));
    const note = await rl.question('note (optional): ');
    rl.close();
    event.classification = choice;
    if (Number.isFinite(minutes) && minutes >= 0) event.pain_minutes = minutes;
    if (note.trim() !== '') event.note = note.trim();
    store.replaceEvents(events);
    process.stdout.write('saved\n');
    break;
  }
  case 'report': {
    await syncCodex(rest);
    const { values } = parseArgs({
      args: rest,
      options: { since: { type: 'string' }, 'no-codex': { type: 'boolean' } },
    });
    const { buildReport, linkEvents } = await import('./analysis.ts');
    const linked = linkEvents(store.events());
    store.replaceEvents(linked);
    process.stdout.write(`${JSON.stringify(buildReport(linked, store.activity(), since(values.since)), null, 2)}\n`);
    break;
  }
  case 'export': {
    const { values } = parseArgs({ args: rest, options: { out: { type: 'string' } } });
    if (!values.out) throw new Error('blocked-observer export --out file.json');
    const { applyReview, TEXT_FIELDS } = await import('./analysis.ts');
    const { shortHash } = await import('./store.ts');
    const { writeFileSync } = await import('node:fs');
    const events = store.events();
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const decisions = new Map<
      string,
      { keep: false } | { keep: true; remove: (typeof TEXT_FIELDS)[number][]; hash: (typeof TEXT_FIELDS)[number][] }
    >();
    for (const event of events) {
      process.stdout.write(`\n${JSON.stringify(event, null, 2)}\n`);
      if ((await rl.question('keep this event? [Y/n] ')).trim().toLowerCase() === 'n') {
        decisions.set(event.id, { keep: false });
        continue;
      }
      const remove: (typeof TEXT_FIELDS)[number][] = [];
      const hash: (typeof TEXT_FIELDS)[number][] = [];
      for (const field of TEXT_FIELDS) {
        if (event[field] === undefined) continue;
        const answer = (await rl.question(`${field}: keep, hash or remove? [k/h/r] `)).trim().toLowerCase();
        if (answer === 'r') remove.push(field);
        if (answer === 'h') hash.push(field);
      }
      decisions.set(event.id, { keep: true, remove, hash });
    }
    rl.close();
    const reviewed = applyReview(events, decisions, shortHash);
    writeFileSync(values.out, `${JSON.stringify(reviewed, null, 2)}\n`);
    process.stdout.write(`${String(reviewed.length)} events written to ${values.out}\n`);
    break;
  }
  default:
    process.stdout.write(`${USAGE}\n`);
    if (command && command !== 'help') process.exit(2);
}
