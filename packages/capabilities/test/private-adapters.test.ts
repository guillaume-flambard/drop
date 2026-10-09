import { createServer, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { askAgent, buildCard, cardToJson } from '@drop/a2a';
import { privateFetch } from '../src/private-network.ts';
import { connectMcp, createMcpAnswer } from '../src/mcp-answer.ts';
import { openAiCompatible, ProviderConfigSchema } from '../src/llm.ts';
import { RepoAnswerConfigSchema } from '../src/repo-answer.ts';
import { runCapability } from '@drop/runner';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  return `http://127.0.0.1:${String(address.port)}`;
}

describe('private adapters', () => {
  it('blocks A2A secondary interfaces even when their origin is in the general allowlist', async () => {
    let leaked = 0;
    const target = await serve((_req, res) => {
      leaked++;
      res.end('{}');
    });
    const card = buildCard({
      name: 'Internal',
      description: 'Private fixture',
      url: target,
      version: '1.0.0',
      skills: [],
    });
    let cardReads = 0;
    const source = await serve((req, res) => {
      cardReads++;
      expect(req.headers.authorization).toBe('Bearer fixture');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(cardToJson(card)));
    });
    await expect(
      askAgent({
        url: source,
        text: 'Private question',
        headers: { Authorization: 'Bearer fixture' },
        fetchImpl: privateFetch({ origins: [source, target] }, source),
      }),
    ).rejects.toThrow();
    expect(cardReads).toBe(1);
    expect(leaked).toBe(0);
  });

  it('refuses HTTP discovery outside policy and refuses stdio before spawning it', async () => {
    let connections = 0;
    const source = await serve((_req, res) => {
      connections++;
      res.end('{}');
    });
    const policy = { origins: ['http://127.0.0.1:11434'] };
    await expect(connectMcp({ transport: 'http', url: source, headersFromEnv: {} }, {}, policy)).rejects.toThrow();
    await expect(
      connectMcp({ transport: 'stdio', command: 'must-never-be-executed', args: [], env: [] }, {}, policy),
    ).rejects.toThrow('E_DENIED');
    expect(connections).toBe(0);
  });

  it('refuses incompatible funding before contacting MCP and requires an explicit model', async () => {
    let connections = 0;
    const source = await serve((_req, res) => {
      connections++;
      res.end('{}');
    });
    const result = await runCapability(
      createMcpAnswer({ network: { origins: [source] } }),
      { question: 'What is the current state?' },
      {
        config: {
          label: 'Internal',
          server: { transport: 'http', url: source },
          tools: ['read'],
          provider: { baseUrl: `${source}/v1`, model: 'owner', apiKeyEnv: null },
        },
        funding: {
          kind: 'capped_key',
          baseUrl: 'https://cloud.example/v1',
          apiKey: 'fixture-secret',
          model: 'other',
          maxUsd: 0.1,
        },
      },
    );
    expect(result).toMatchObject({ ok: false, code: 'E_DENIED' });
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(connections).toBe(0);
    expect(RepoAnswerConfigSchema.parse({ repoPath: '/fixture' })).toMatchObject({
      maxTurns: 15,
      maxUsd: 0.5,
      provider: { baseUrl: 'http://127.0.0.1:11434/v1', model: '', apiKeyEnv: null },
    });
    expect(() => openAiCompatible(ProviderConfigSchema.parse({}))).toThrow('choose an installed model');
  });
});
