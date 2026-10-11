#!/usr/bin/env node
/**
 * drop simulation bench (T4.1). Usage:
 *   node packages/simulation/src/cli.ts run [--nodes 50] [--owners 10] [--requests 4] [--duration 180]
 *     [--seed 1] [--allow 0.8] [--deny 0.1] [--not-now 0.1] [--relay ws://127.0.0.1:7900/v1] [--dir <campaign dir>]
 */
import type { ChildProcess } from 'node:child_process';
import { parseArgs } from 'node:util';
import { campaignExitCode, parseRunOptions } from './args.ts';
import { MAX_PROCESS_NODES, runCampaign, stopAll } from './campaign.ts';
import { renderMarkdown } from './report.ts';

const [command, ...rest] = process.argv.slice(2);
if (command !== 'run') {
  process.stderr.write('usage: simulation run [--nodes 50] [--owners 10] [--requests 4] [--duration 180] [--seed 1]\n');
  process.exit(2);
}
const { values } = parseArgs({
  args: rest,
  options: {
    nodes: { type: 'string', default: '50' },
    owners: { type: 'string', default: '10' },
    requests: { type: 'string', default: '4' },
    duration: { type: 'string', default: '180' },
    seed: { type: 'string', default: '1' },
    allow: { type: 'string', default: '0.8' },
    deny: { type: 'string', default: '0.1' },
    'not-now': { type: 'string', default: '0.1' },
    relay: { type: 'string', default: 'ws://127.0.0.1:7900/v1' },
    dir: { type: 'string' },
  },
});

// Ctrl-C or SIGTERM must not leave the relay and the nodes running: stop them, then exit. A second signal while
// stopping is absorbed by the same handler instead of killing the bench mid-cleanup.
let running: ChildProcess[] = [];
let stopping = false;
const onSignal = (signal: NodeJS.Signals) => {
  if (stopping) return;
  stopping = true;
  stopAll(running)
    .catch(() => undefined)
    .finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

try {
  const options = parseRunOptions(values);
  process.stderr.write(
    `${String(options.nodes)} nodes in separate processes (limit ${String(MAX_PROCESS_NODES)}); about 70 MB each measured on 10 October 2026\n`,
  );
  const result = await runCampaign({
    ...options,
    relayUrl: values.relay,
    ...(values.dir ? { workDir: values.dir } : {}),
    log: (line) => process.stderr.write(`${line}\n`),
    onChildren: (children) => {
      running = children;
    },
  });
  process.stdout.write(renderMarkdown(result.report));
  process.stdout.write(`\nCampaign directory: ${result.dir}\n`);
  const code = campaignExitCode(result.report);
  if (code !== 0 && result.report.leaks === 0) {
    process.stderr.write('E_SIM_NO_RESULT: every request ended in a bench error, the campaign measured nothing\n');
  }
  process.exit(code);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
