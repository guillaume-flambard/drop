// Release job: merge the five signed build fragments into GitHub's latest.json.
// Refuses incomplete, unsigned, duplicate or cross-version feeds.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeUpdateFragments, readUpdateFragment } from './desktop-updates.ts';

function main(args: string[]): void {
  const [destination, ...files] = args;
  if (!destination)
    throw new Error('usage: node scripts/merge-desktop-updates.ts latest.json platform-fragment.json ...');
  const merged = mergeUpdateFragments(files.map((file) => readUpdateFragment(resolve(file))));
  // The release job passes its exact tag and commit as provenance, validated separately by the workflow.
  if (process.env.DROP_RELEASE_VERSION && merged.version !== process.env.DROP_RELEASE_VERSION) {
    throw new Error('E_UPDATE_VERSION: fragments disagree with workflow release version');
  }
  writeFileSync(resolve(destination), `${JSON.stringify(merged, null, 2)}\n`);
  process.stdout.write(`Signed update feed: ${destination} (${Object.keys(merged.platforms).length} targets)\n`);
}

if (process.argv[1] && /merge-desktop-updates\.(?:ts|js)$/.test(process.argv[1])) {
  main(process.argv.slice(2));
}
export { main as mergeDesktopUpdates };
