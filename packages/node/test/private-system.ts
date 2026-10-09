import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateIdentity, type Identity } from '@drop/protocol';
import { startRelay, revokeNode, readRelayConfig, type RelayHandle } from '@drop/relay';
import { startDaemon, type Daemon } from '../src/daemon.ts';
import { DropHome } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 8000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('E_TEST_TIMEOUT');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Internal HTTP fixtures, not a qualified model. No real credentials or source data. */
export async function provePrivateSystem(): Promise<{ scenarios: string[]; requests: string[]; modelCalls: number }> {
  const root = mkdtempSync(join(tmpdir(), 'drop-private-proof-'));
  const daemons: Daemon[] = [];
  let relay: RelayHandle | undefined;
  let fixture: Server | undefined;
  const requests: string[] = [];
  const scenarios: string[] = [];
  let modelCalls = 0;
  let modelFails = false;
  try {
    fixture = createServer((req, res) => {
      requests.push(`${req.method ?? ''} ${req.url ?? ''}`);
      if (req.method === 'GET') {
        res.writeHead(405).end();
        return;
      }
      if (req.method === 'DELETE') {
        res.writeHead(200).end('{}');
        return;
      }
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const data = JSON.parse(body) as { id?: number; method?: string; messages?: { role: string }[] };
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/v1/chat/completions') {
          modelCalls++;
          if (modelFails) {
            res.writeHead(503).end('{"error":"unavailable"}');
            return;
          }
          const message = data.messages?.some((message) => message.role === 'tool')
            ? { content: JSON.stringify({ answer: 'Le jalon est prêt.', verdict: 'yes', sources: ['Jalon'] }) }
            : {
                content: null,
                tool_calls: [{ id: 'read', type: 'function', function: { name: 'read_summary', arguments: '{}' } }],
              };
          res.end(JSON.stringify({ choices: [{ message }] }));
          return;
        }
        let result: unknown;
        if (data.method === 'initialize')
          result = {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'internal-fixture', version: '1' },
          };
        else if (data.method === 'tools/list')
          result = {
            tools: [{ name: 'read_summary', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }],
          };
        else if (data.method === 'tools/call') result = { content: [{ type: 'text', text: 'Le jalon est prêt.' }] };
        else {
          res.writeHead(202).end();
          return;
        }
        res.end(JSON.stringify({ jsonrpc: '2.0', id: data.id, result }));
      });
    });
    await new Promise<void>((resolve) => fixture?.listen(0, '127.0.0.1', resolve));
    const address = fixture.address();
    assert(address && typeof address !== 'string');
    const source = `http://127.0.0.1:${String(address.port)}`;
    const ownerId = await generateIdentity('Owner');
    const requesterId = await generateIdentity('Requester');
    const relayConfig = { port: 0, allowedNodeIds: [ownerId.nodeId], admittedPath: join(root, 'admitted.json') };
    relay = await startRelay(relayConfig, { logger: () => undefined });
    const relayUrl = relay.url;
    const relayPort = relay.port;
    const network = { origins: [new URL(relayUrl).origin, source] };
    function homeFor(identity: Identity): DropHome {
      const home = new DropHome(join(root, identity.displayName));
      home.init(identity, privateConfig(relayUrl, 'human', 0, network));
      return home;
    }
    const ownerHome = homeFor(ownerId);
    const requesterHome = homeFor(requesterId);
    ownerHome.publish({
      capabilityId: 'mcp.answer.internal',
      approverNodeIds: [ownerId.nodeId],
      publishedAt: new Date().toISOString(),
      config: {
        label: 'la source interne',
        server: { transport: 'http', url: `${source}/mcp` },
        tools: ['read_summary'],
        provider: { baseUrl: `${source}/v1`, model: 'fixture-model', apiKeyEnv: null },
      },
    });
    async function boot(home: DropHome): Promise<Daemon> {
      const daemon = await startDaemon(home, { apiPort: 0, notifications: false, log: () => undefined });
      daemons.push(daemon);
      return daemon;
    }
    let owner = await boot(ownerHome);
    let requester = await boot(requesterHome);
    await owner.relay.waitReady();
    await requester.engine.pair(await owner.engine.invite(relayUrl));
    await until(() => requester.engine.peers().length === 1);
    assert(requester.relay.connected);
    scenarios.push('fresh-private-install-and-invitation');
    async function catalog(): Promise<void> {
      await requester.engine.refreshCatalogs();
      await until(() => requester.engine.catalog().length === 1);
    }
    await catalog();
    async function ask(): Promise<string> {
      const drop = await requester.engine.requestDrop({
        capabilityId: 'mcp.answer.internal',
        input: { question: 'Le jalon de cette semaine est-il prêt ?' },
        purpose: 'Préparer la réunion',
        agent: 'claude_code',
      });
      await until(() => owner.engine.pending().some((item) => item.dropId === drop.dropId));
      return drop.dropId;
    }
    async function allowAndReview(dropId: string): Promise<void> {
      await owner.engine.decide(dropId, 'allow_once');
      await until(() => owner.engine.pending().some((item) => item.dropId === dropId && item.kind === 'review'));
      assert.equal(requester.engine.drop(dropId)?.result, undefined);
      await owner.engine.review(dropId, 'send');
      await until(() => requester.engine.drop(dropId)?.state === 'receipted');
      assert.deepEqual(requester.engine.drop(dropId)?.result?.output, {
        answer: 'Le jalon est prêt.',
        verdict: 'yes',
        sources: ['Jalon'],
      });
    }
    const first = await ask();
    assert.equal(requests.length, 0);
    await allowAndReview(first);
    assert.equal(modelCalls, 2);
    scenarios.push('consent-mcp-model-review-result');
    const denied = await ask();
    const before = requests.length;
    await owner.engine.decide(denied, 'deny');
    await until(() => requester.engine.drop(denied)?.error?.code === 'E_DENIED');
    assert.equal(requests.length, before);
    scenarios.push('denial-without-source-or-model-call');
    modelFails = true;
    const failed = await ask();
    await owner.engine.decide(failed, 'allow_once');
    await until(() => requester.engine.drop(failed)?.error?.code === 'E_RUNNER');
    assert.equal(modelCalls, 3);
    modelFails = false;
    scenarios.push('model-unavailable-without-fallback');
    await relay.close();
    relay = undefined;
    await until(() => !owner.relay.connected && !requester.relay.connected);
    relay = await startRelay({ ...relayConfig, port: relayPort }, { logger: () => undefined });
    owner.relay.retryNow();
    requester.relay.retryNow();
    await Promise.all([owner.relay.waitReady(), requester.relay.waitReady()]);
    assert.equal(modelCalls, 3);
    assert.equal(owner.engine.pending().length, 0);
    scenarios.push('relay-restart-no-reexecution');
    await Promise.all(daemons.splice(0).map((daemon) => daemon.stop()));
    owner = await boot(ownerHome);
    requester = await boot(requesterHome);
    await Promise.all([owner.relay.waitReady(), requester.relay.waitReady()]);
    assert.equal(owner.engine.pending().length, 0);
    assert.equal(modelCalls, 3);
    await catalog();
    await allowAndReview(await ask());
    assert.equal(modelCalls, 5);
    scenarios.push('daemon-restart-fresh-consent');
    await Promise.all(daemons.splice(0).map((daemon) => daemon.stop()));
    await relay.close();
    relay = undefined;
    const configPath = join(root, 'relay.config.json');
    writeFileSync(configPath, JSON.stringify({ ...relayConfig, port: relayPort, admittedPath: 'admitted.json' }), {
      mode: 0o600,
    });
    revokeNode(configPath, requesterId.nodeId);
    const restored = join(root, 'restored');
    mkdirSync(restored, { mode: 0o700 });
    for (const file of ['relay.config.json', 'admitted.json']) copyFileSync(join(root, file), join(restored, file));
    relay = await startRelay(readRelayConfig(join(restored, 'relay.config.json')), { logger: () => undefined });
    owner = await boot(ownerHome);
    const deniedStatuses: string[] = [];
    requester = await startDaemon(requesterHome, {
      apiPort: 0,
      notifications: false,
      log: (line) => {
        deniedStatuses.push(line);
      },
    });
    daemons.push(requester);
    await owner.relay.waitReady();
    await until(() => deniedStatuses.includes('relay: unauthorized'));
    assert.equal(requester.relay.connected, false);
    scenarios.push('revocation-backup-restore');
    assert(requesterHome.receipts().every((receipt) => !JSON.stringify(receipt).includes('Le jalon')));
    return { scenarios, requests, modelCalls };
  } finally {
    await Promise.all(daemons.map((daemon) => daemon.stop()));
    await relay?.close();
    if (fixture)
      await new Promise<void>((resolve, reject) => {
        fixture?.closeAllConnections();
        fixture?.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv.includes('--private-proof')) {
  const result = await provePrivateSystem();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
