#!/usr/bin/env node
import { resolve } from 'node:path';
import { allowNode, revokeNode } from './config.ts';
import { readRelayConfig, startRelay } from './server.ts';

const [command = 'serve', ...args] = process.argv.slice(2);
const configPath = resolve(
  args.find((arg) => arg.startsWith('--config='))?.slice('--config='.length) ?? 'relay.config.json',
);

if (command === 'allow' || command === 'revoke') {
  const nodeId = args.find((arg) => !arg.startsWith('--'));
  if (!nodeId) {
    process.stderr.write('usage: drop-relay allow <nodeId> [--config=relay.config.json]\n');
    process.exit(2);
  }
  const changed = command === 'allow' ? allowNode(configPath, nodeId) : revokeNode(configPath, nodeId);
  process.stdout.write(changed ? `${command} applied (restart the relay)\n` : 'already configured\n');
} else if (command === 'serve') {
  const relay = await startRelay(readRelayConfig(configPath));
  process.stdout.write(`drop relay listening on ${relay.url}\n`);
  const stop = (): void => {
    relay.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else {
  process.stderr.write('usage: drop-relay [serve|allow <nodeId>|revoke <nodeId>] [--config=relay.config.json]\n');
  process.exit(2);
}
