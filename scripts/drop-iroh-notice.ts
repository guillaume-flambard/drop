// Attribution inventory of the drop-iroh program (T4.2b, D68): every crate it links, its license, and each license
// text shipped by those crates, identical texts written once. iroh's BSD-3 notice (code derived from Tailscale) is
// among them. Usage: node scripts/drop-iroh-notice.ts <output file>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Metadata {
  packages: { name: string; version: string; license: string | null; manifest_path: string; id: string }[];
  resolve: { nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[]; root: string };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
if (!output) throw new Error('usage: node scripts/drop-iroh-notice.ts <output file>');
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--format-version',
      '1',
      '--locked',
      '--filter-platform',
      'aarch64-apple-darwin',
      '--manifest-path',
      join(root, 'crates', 'drop-iroh', 'Cargo.toml'),
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ),
) as Metadata;

// Only what is linked into the binary: normal dependencies reachable from drop-iroh, no build or dev ones.
const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const linked = new Set<string>();
const queue = [metadata.resolve.root];
while (queue.length > 0) {
  const id = queue.pop();
  if (id === undefined || linked.has(id)) continue;
  linked.add(id);
  for (const dep of nodes.get(id)?.deps ?? [])
    if (dep.dep_kinds.some((kind) => kind.kind === null)) queue.push(dep.pkg);
}

const texts = new Map<string, { text: string; crates: string[] }>();
const lines: string[] = [];
for (const pkg of metadata.packages
  .filter((item) => linked.has(item.id))
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const label = `${pkg.name} ${pkg.version}`;
  lines.push(`${label}: ${pkg.license ?? 'see license files below'}`);
  const dir = dirname(pkg.manifest_path);
  for (const file of readdirSync(dir)
    .filter((name) => /^(LICEN[CS]E|COPYING|NOTICE)/i.test(name))
    .sort()) {
    const text = readFileSync(join(dir, file), 'utf8').trim();
    const key = createHash('sha256').update(text).digest('hex');
    const entry = texts.get(key) ?? { text, crates: [] };
    entry.crates.push(`${label} (${file})`);
    texts.set(key, entry);
  }
}

const body = [
  'drop-iroh: third-party components',
  '',
  'drop-iroh is part of drop, licensed under the Apache License, Version 2.0. It links the crates below,',
  'each under its own license. iroh contains code derived from Tailscale under the BSD 3-Clause license;',
  'that notice appears below with the other license texts.',
  '',
  ...lines,
  '',
  ...[...texts.values()].flatMap((entry) => [
    '='.repeat(78),
    `Applies to: ${entry.crates.join(', ')}`,
    '',
    entry.text,
    '',
  ]),
].join('\n');
if (![...texts.values()].some((entry) => entry.text.includes('Tailscale Inc')))
  throw new Error('the BSD-3 notice of iroh was not found');
writeFileSync(output, `${body}\n`);
process.stdout.write(`${output}: ${String(lines.length)} crates, ${String(texts.size)} license texts\n`);
