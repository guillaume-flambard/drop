// Prints a short context around a sample of pattern matches in local Codex logs, to judge false positives.
// Local only, prints to the terminal, stores nothing. Usage: node .../sample-matches.ts [pattern] [count]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codexSessionsDir } from '../src/codex.ts';
import { PATTERNS } from '../src/patterns.ts';

const [patternName = 'http_401', countArg = '15'] = process.argv.slice(2);
const pattern = PATTERNS.find((candidate) => candidate.name === patternName);
if (!pattern) throw new Error(`unknown pattern ${patternName}`);
const global = new RegExp(pattern.regex.source, 'gi');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.jsonl') ? [join(dir, entry.name)] : [],
  );
}

const contexts: string[] = [];
for (const file of walk(codexSessionsDir()).filter((path) => statSync(path).mtimeMs > Date.now() - 30 * 86_400_000)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('_call_output')) continue;
    for (const match of line.matchAll(global)) {
      const at = match.index;
      contexts.push(line.slice(Math.max(0, at - 50), at + 40).replace(/\s+/g, ' '));
    }
  }
}
const step = Math.max(1, Math.floor(contexts.length / Number(countArg)));
process.stdout.write(`${String(contexts.length)} raw matches\n`);
for (let index = 0; index < contexts.length; index += step) process.stdout.write(`- ${contexts[index] ?? ''}\n`);
