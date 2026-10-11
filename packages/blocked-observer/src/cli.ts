#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

const USAGE = `blocked-observer <command>
  mcp                       MCP server (stdio) with the report_blocked tool
  hook                      Claude Code hook entry (PostToolUse and PostToolUseFailure)
  import-codex [--since 7d] import blocks from local Codex session logs
  install                   print (never apply) the Claude Code and Codex configuration
  list [--since 7d]         table of events (imports new Codex blocks first; --no-codex to skip)
  classify <id>             a few yes/no questions that lead to the classification, then minutes lost and a note
  report [--since 30d]      summary per active day (imports new Codex blocks first)
  report --merge <exports…> pool several developers' exports and apply the go/no-go threshold (D24)
  export --out file.json    export after reviewing every event (--classified-only: skip unclassified events)
  print-instructions        snippet for AGENTS.md / CLAUDE.md`;

function since(value: string | undefined): number {
  if (!value) return 0;
  const match = /^(\d+)([hd])$/.exec(value);
  if (!match) throw new Error('--since expects e.g. 24h or 7d');
  return Date.now() - Number(match[1]) * (match[2] === 'd' ? 86_400_000 : 3_600_000);
}

/**
 * Line prompts that also work with piped input: `rl.question` drops lines that arrive before it is called, the async
 * iterator buffers them.
 */
function prompter(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  return {
    ask: async (question) => {
      process.stdout.write(question);
      const next = await lines.next();
      return next.done ? '' : next.value;
    },
    close: () => {
      rl.close();
    },
  };
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
// A skipped line is reported once per command, on stderr: stdout stays the command's own output.
const warned = new Set<string>();
const store = new ObserverStore(undefined, {
  warn: (code, detail) => {
    if (warned.has(code)) return;
    warned.add(code);
    process.stderr.write(`${code}: lignes illisibles ignorées (${detail}), voir errors.log\n`);
  },
});

/** Minutes lost, or undefined when the human does not know: an empty answer is unknown, never 0 (D24 median). */
async function askMinutes(ask: (question: string) => Promise<string>): Promise<number | undefined> {
  for (;;) {
    const answer = (await ask('minutes perdues (attente et contournement ; vide si inconnu) : ')).trim();
    if (answer === '') return undefined;
    const minutes = Number(answer.replace(',', '.'));
    if (Number.isFinite(minutes) && minutes >= 0) return minutes;
    process.stdout.write('un nombre de minutes positif ou nul, ou vide si inconnu\n');
  }
}

/** Codex has no hook: list and report first pull in new Codex blocks (idempotent), unless --no-codex is given. */
async function syncCodex(args: string[]): Promise<void> {
  const { pruneHookNoise } = await import('./noise.ts');
  const events = store.events();
  const kept = pruneHookNoise(events);
  if (kept.length < events.length) store.replaceEvents(kept);
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
    const { added, removed, files } = importCodex(store, codexSessionsDir(), since(values.since ?? '7d'));
    process.stdout.write(
      `${String(files)} Codex session files read, ${String(added)} new events, ${String(removed)} noise events removed\n`,
    );
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
    const { QUESTIONS, REASONS, classificationFrom } = await import('./codebook.ts');
    const events = store.events();
    const event = events.find((candidate) => candidate.id.startsWith(prefix));
    if (!event) throw new Error(`no event ${prefix}`);
    process.stdout.write(`${JSON.stringify(event, null, 2)}\n\nGrille : docs/CLASSIFICATION.md\n`);
    const rl = prompter();
    const yes = async (question: string) => (await rl.ask(`${question} [o/n] `)).trim().toLowerCase().startsWith('o');
    const answers: Parameters<typeof classificationFrom>[0] = { blocked: await yes(QUESTIONS.blocked) };
    if (answers.blocked) answers.someoneElse = await yes(QUESTIONS.someoneElse);
    if (answers.someoneElse) answers.accessFine = await yes(QUESTIONS.accessFine);
    if (answers.someoneElse && !answers.accessFine) answers.shareFine = await yes(QUESTIONS.shareFine);
    if (answers.someoneElse && !answers.accessFine && !answers.shareFine) {
      process.stdout.write(`${QUESTIONS.reason}\n`);
      REASONS.forEach((entry, index) => process.stdout.write(`  ${String(index + 1)}. ${entry.label}\n`));
      const picked = REASONS[Number(await rl.ask('raison (1-4) : ')) - 1];
      if (picked) answers.reason = picked.reason;
    }
    const choice = classificationFrom(answers);
    if (!choice) {
      rl.close();
      throw new Error('invalid answer');
    }
    const minutes = choice === 'NOT_A_BLOCK' ? 0 : await askMinutes(rl.ask);
    const note = await rl.ask('note (optionnelle) : ');
    rl.close();
    // Re-read just before writing: the human may answer minutes later, after the hook, an import or another classify
    // wrote. Writing back the list read at the start would erase their work (seen on 2026-10-08).
    const fresh = store.events();
    const target = fresh.find((candidate) => candidate.id === event.id);
    if (!target) throw new Error(`event ${event.id} is no longer stored`);
    target.classification = choice;
    if (minutes !== undefined) target.pain_minutes = minutes;
    if (note.trim() !== '') target.note = note.trim();
    store.replaceEvents(fresh);
    process.stdout.write(`${choice}, saved\n`);
    break;
  }
  case 'report': {
    if (rest[0] === '--merge') {
      const files = rest.slice(1);
      if (files.length === 0) throw new Error('blocked-observer report --merge <export.json>…');
      const { existsSync, readFileSync } = await import('node:fs');
      const path = await import('node:path');
      const missing = files.filter((file) => !existsSync(file));
      if (missing.length > 0) {
        process.stderr.write(
          `export not found: ${missing.join(', ')}\nEach developer first runs: blocked-observer export --out <name>.json\n`,
        );
        process.exit(1);
      }
      const { mergeExports, parseExport } = await import('./merge.ts');
      const merged = mergeExports(
        files.map((file) => ({
          name: path.basename(file, '.json'),
          payload: parseExport(JSON.parse(readFileSync(file, 'utf8'))),
        })),
      );
      process.stdout.write(`${JSON.stringify(merged, null, 2)}\n`);
      break;
    }
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
    const { values } = parseArgs({
      args: rest,
      options: { out: { type: 'string' }, 'classified-only': { type: 'boolean' } },
    });
    if (!values.out) throw new Error('blocked-observer export --out file.json [--classified-only]');
    const { applyReview, TEXT_FIELDS } = await import('./analysis.ts');
    const { shortHash } = await import('./store.ts');
    const { writeFileSync } = await import('node:fs');
    const { classifiedOnly, exportPayload } = await import('./merge.ts');
    const all = store.events();
    const events = values['classified-only'] ? classifiedOnly(all) : all;
    if (events.length < all.length) {
      process.stdout.write(`${String(all.length - events.length)} unclassified events left out\n`);
    }
    const rl = prompter();
    const decisions = new Map<
      string,
      { keep: false } | { keep: true; remove: (typeof TEXT_FIELDS)[number][]; hash: (typeof TEXT_FIELDS)[number][] }
    >();
    for (const event of events) {
      process.stdout.write(`\n${JSON.stringify(event, null, 2)}\n`);
      if ((await rl.ask('keep this event? [Y/n] ')).trim().toLowerCase() === 'n') {
        decisions.set(event.id, { keep: false });
        continue;
      }
      const remove: (typeof TEXT_FIELDS)[number][] = [];
      const hash: (typeof TEXT_FIELDS)[number][] = [];
      for (const field of TEXT_FIELDS) {
        if (event[field] === undefined) continue;
        const answer = (await rl.ask(`${field}: keep, hash or remove? [k/h/r] `)).trim().toLowerCase();
        if (answer === 'r') remove.push(field);
        if (answer === 'h') hash.push(field);
      }
      decisions.set(event.id, { keep: true, remove, hash });
    }
    rl.close();
    const reviewed = applyReview(events, decisions, shortHash);
    writeFileSync(values.out, `${JSON.stringify(exportPayload(reviewed, store.activity()), null, 2)}\n`);
    process.stdout.write(`${String(reviewed.length)} events written to ${values.out}\n`);
    break;
  }
  default:
    process.stdout.write(`${USAGE}\n`);
    if (command && command !== 'help') process.exit(2);
}
