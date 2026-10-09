import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateIdentity, sealEnvelope, uuidv7 } from '@drop/protocol';
import { DropHome } from '../src/home.ts';
import { privateConfig } from '../src/private-config.ts';
import { NodeEngine } from '../src/engine.ts';
import { fakeCapability } from './helpers.ts';

describe('private restart', () => {
  it('rejects a previously received drop after restart before any consent can be reused', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drop-replay-'));
    try {
      const owner = await generateIdentity('Owner');
      const requester = await generateIdentity('Requester');
      const home = new DropHome(root);
      home.init(owner, privateConfig('ws://127.0.0.1:7780/v1', 'human', 0));
      home.savePeer({
        nodeId: requester.nodeId,
        displayName: 'Requester',
        ownerKind: 'human',
        pairedAt: new Date().toISOString(),
      });
      home.publish({
        capabilityId: 'test.state',
        approverNodeIds: [owner.nodeId],
        config: {},
        publishedAt: new Date().toISOString(),
      });
      const impl = fakeCapability('test.state', 'low');
      let executions = 0;
      const execute = impl.execute.bind(impl);
      impl.execute = async (...args) => {
        executions++;
        return execute(...args);
      };
      const make = () =>
        new NodeEngine({
          identity: owner,
          ownerKind: 'human',
          store: home,
          capabilities: [impl],
          transport: { send: () => Promise.resolve('delivered') },
        });
      const first = make();
      const dropId = uuidv7();
      const request = await sealEnvelope(requester, owner.nodeId, {
        type: 'drop_request',
        dropId,
        capabilityId: impl.card.id,
        capabilityVersion: impl.card.version,
        input: { mode: 'ok' },
        purpose: 'Test restart',
        requestedBy: { nodeId: requester.nodeId, displayName: 'Requester', agent: 'claude_code' },
      });
      await first.handleEnvelope(request);
      expect(first.pending()).toHaveLength(1);
      await first.decide(dropId, 'allow_once');
      expect(executions).toBe(1);
      const restarted = make();
      await restarted.handleEnvelope(request);
      expect(restarted.pending()).toHaveLength(0);
      await restarted.decide(dropId, 'allow_once');
      expect(executions).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
