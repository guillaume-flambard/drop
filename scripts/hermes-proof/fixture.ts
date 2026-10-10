import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { generateIdentity, type Identity } from '../../packages/protocol/src/index.ts';
import { RelayClient, startRelay } from '../../packages/relay/src/index.ts';
import { privateCapabilities } from '../../packages/capabilities/src/index.ts';
import { NodeEngine } from '../../packages/node/src/engine.ts';
import { DropHome } from '../../packages/node/src/home.ts';
import { privateConfig } from '../../packages/node/src/private-config.ts';
import { startLocalApi } from '../../packages/node/src/api.ts';

const root = mkdtempSync(join(tmpdir(), 'drop-hermes-nodes-'));
let clock = Date.now();
const ownerId = await generateIdentity('Owner fixture');
const requesterId = await generateIdentity('Hermes fixture');
const relay = await startRelay(
  { port: 0, allowedNodeIds: [ownerId.nodeId, requesterId.nodeId] },
  { logger: () => undefined },
);
const network = { origins: [new URL(relay.url).origin] };
async function until(check: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('E_FIXTURE_TIMEOUT');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function boot(identity: Identity) {
  const home = new DropHome(join(root, identity.displayName));
  home.init(identity, privateConfig(relay.url, 'human', 0, network));
  const link: { client?: RelayClient } = {};
  const engine = new NodeEngine({
    identity,
    ownerKind: 'human',
    store: home,
    capabilities: privateCapabilities(network),
    privateProfile: true,
    payer: 'owner',
    now: () => clock,
    transport: { send: (envelope) => (link.client ? link.client.send(envelope) : Promise.resolve('offline')) },
  });
  const client = new RelayClient({
    identity,
    url: relay.url,
    onEnvelope: (envelope) => {
      void engine.handleEnvelope(envelope).catch(() => {
        process.stderr.write('E_FIXTURE_ENVELOPE\n');
      });
    },
  });
  link.client = client;
  client.start();
  await client.waitReady();
  const api = await startLocalApi({
    engine,
    token: home.localToken(),
    port: 0,
    relayUrl: relay.url,
    now: () => clock,
    refreshCatalogs: async () => {
      await engine.refreshCatalogs();
    },
  });
  writeFileSync(join(home.root, 'config.json'), JSON.stringify({ ...home.config(), apiPort: api.port }), {
    mode: 0o600,
  });
  return { engine, home, client, api };
}
const owner = await boot(ownerId);
const requester = await boot(requesterId);
const logPath = join(root, 'synthetic.log');
writeFileSync(logPath, `${new Date(clock).toISOString()} ERROR FIXTURE_FAILURE\n`, { mode: 0o600 });
owner.home.publish({
  capabilityId: 'production.error_summary',
  approverNodeIds: [ownerId.nodeId],
  publishedAt: new Date(clock).toISOString(),
  config: {
    services: { fixture: { source: { kind: 'file', path: logPath } } },
    errorPatterns: [{ name: 'FIXTURE_FAILURE', regex: 'FIXTURE_FAILURE' }],
    errorLineRegex: 'ERROR',
  },
});
await requester.engine.pair(await owner.engine.invite(relay.url));
await until(() => requester.engine.peers().length === 1 && owner.engine.peers().length === 1);
await requester.engine.refreshCatalogs();
await until(() => requester.engine.catalog().length === 1);
process.stdout.write(`${JSON.stringify({ home: requester.home.root, capability: 'production.error_summary' })}\n`);
try {
  for await (const line of createInterface({ input: process.stdin })) {
    const command = JSON.parse(line) as { action: string; dropId: string };
    if (command.action === 'stop') break;
    await until(() => owner.engine.pending().some((item) => item.dropId === command.dropId));
    assert.equal(requester.engine.drop(command.dropId)?.result, undefined);
    if (command.action === 'expire') {
      clock = Math.max(...owner.engine.pending().map((item) => item.expiresAt)) + 1;
      await owner.engine.tick();
      await requester.engine.tick();
    } else {
      assert(['allow_once', 'deny'].includes(command.action));
      await owner.engine.decide(command.dropId, command.action as 'allow_once' | 'deny');
    }
    await until(() => {
      const drop = requester.engine.drop(command.dropId);
      return Boolean(drop?.result || drop?.error);
    });
    const drop = requester.engine.drop(command.dropId);
    process.stdout.write(
      `${JSON.stringify({ state: drop?.state, code: drop?.error?.code, hasResult: Boolean(drop?.result) })}\n`,
    );
  }
} finally {
  owner.client.close();
  requester.client.close();
  await Promise.all([owner.api.close(), requester.api.close()]);
  await relay.close();
  rmSync(root, { recursive: true, force: true });
}
