#!/usr/bin/env node
import { resolve } from 'node:path';
import { allowNode, revokeInConfig, revokeNode } from './config.ts';
import { readRelayConfig, startRelay } from './server.ts';

const [command = 'serve', ...args] = process.argv.slice(2);
const configPath = resolve(
  args.find((arg) => arg.startsWith('--config='))?.slice('--config='.length) ?? 'relay.config.json',
);

if (command === 'allow' || command === 'revoke') {
  const nodeId = args.find((arg) => !arg.startsWith('--'));
  if (!nodeId) {
    process.stderr.write('usage: drop-relay allow|revoke <nodeId> [--with-invited] [--config=relay.config.json]\n');
    process.exit(2);
  }
  if (command === 'allow') {
    process.stdout.write(
      allowNode(configPath, nodeId) ? `allowed ${nodeId} (restart the relay)\n` : 'already allowed\n',
    );
  } else {
    // With a revocation file, the running relay applies it within seconds (T2.19); otherwise the config, at restart.
    const revokedPath = readRelayConfig(configPath).revokedPath;
    const withInvited = args.includes('--with-invited');
    if (revokedPath)
      process.stdout.write(
        revokeNode(revokedPath, nodeId, { withInvited })
          ? `revoked ${nodeId}${withInvited ? ' and the nodes it admitted' : ''} (the running relay applies it within seconds)\n`
          : 'already revoked\n',
      );
    else if (withInvited) {
      process.stderr.write('--with-invited needs revokedPath in the relay config\n');
      process.exit(2);
    } else
      process.stdout.write(
        revokeInConfig(configPath, nodeId) ? 'revoke applied (restart the relay)\n' : 'already configured\n',
      );
  }
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
  process.stderr.write(
    'usage: drop-relay [serve|allow <nodeId>|revoke <nodeId> [--with-invited]] [--config=relay.config.json]\n',
  );
  process.exit(2);
}
