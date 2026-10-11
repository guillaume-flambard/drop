import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { TaskState } from '@a2a-js/sdk';
import type { AgentExecutor } from '@a2a-js/sdk/server';
import { a2aEndpoint, askAgent, buildCard, finishTask, startTask, textOf } from '../src/index.ts';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
          server.closeAllConnections();
        }),
    ),
  );
});

/**
 * A company's own A2A agent: answers, refuses a question about salaries, needs a bearer token unless `token` is null.
 * `interfaceUrl` makes its card send the client elsewhere; `authorizations` records each request's Authorization header.
 */
async function startAgent(
  options: { token?: string | null; interfaceUrl?: string } = {},
): Promise<{ url: string; seen: string[]; authorizations: (string | undefined)[] }> {
  const seen: string[] = [];
  const authorizations: (string | undefined)[] = [];
  const token = options.token === undefined ? 'Bearer company-token' : options.token;
  const executor: AgentExecutor = {
    execute: (context, bus) => {
      const question = textOf(context.userMessage.parts);
      seen.push(question);
      startTask(context, bus, 'Je cherche.');
      if (question.includes('salaire'))
        finishTask(context, bus, TaskState.TASK_STATE_REJECTED, 'Je ne réponds pas sur les salaires.');
      else
        finishTask(context, bus, TaskState.TASK_STATE_COMPLETED, 'Voilà.', [
          { name: 'réponse', text: 'Le contrat Atlas est signé depuis le 2 octobre.', data: { signed: true } },
        ]);
      return Promise.resolve();
    },
    cancelTask: () => Promise.resolve(),
  };
  const holder: { endpoint?: ReturnType<typeof a2aEndpoint> } = {};
  const server = createServer((req, res) => {
    authorizations.push(req.headers.authorization);
    if (token !== null && req.headers.authorization !== token) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(holder.endpoint?.cardJson()));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      holder.endpoint?.handle(req, res, body).catch(() => res.writeHead(500).end());
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}`;
  holder.endpoint = a2aEndpoint(
    buildCard({
      name: 'Agent ventes',
      description: 'Répond sur les contrats clients.',
      url: options.interfaceUrl ?? url,
      version: '1.0.0',
      skills: [{ id: 'contracts', name: 'Contrats', description: 'État des contrats', tags: ['crm'], examples: [] }],
    }),
    executor,
  );
  return { url, seen, authorizations };
}

describe('A2A v1.0 with the official SDK (D33)', () => {
  it('asks an A2A agent and reads its artifacts, sending the owner headers with every request', async () => {
    const agent = await startAgent();
    const answer = await askAgent({
      url: agent.url,
      text: 'Le contrat Atlas est-il signé ?',
      headers: { Authorization: 'Bearer company-token' },
      pollMs: 20,
    });
    expect(answer).toMatchObject({ outcome: 'completed', agentName: 'Agent ventes' });
    expect(answer.text).toContain('Le contrat Atlas est signé depuis le 2 octobre.');
    expect(answer.text).toContain('{"signed":true}');
    expect(agent.seen).toEqual(['Le contrat Atlas est-il signé ?']);
  });

  it('reports a refusal as rejected, and fails without the token', async () => {
    const agent = await startAgent();
    const refused = await askAgent({
      url: agent.url,
      text: 'Quel est le salaire de Sami ?',
      headers: { Authorization: 'Bearer company-token' },
      pollMs: 20,
    });
    expect(refused).toMatchObject({ outcome: 'rejected', text: 'Je ne réponds pas sur les salaires.' });
    await expect(askAgent({ url: agent.url, text: 'Le contrat Atlas est-il signé ?' })).rejects.toThrow();
  });

  it('keeps the owner headers away from an interface URL on another origin than the configured agent', async () => {
    const elsewhere = await startAgent({ token: null });
    const agent = await startAgent({ interfaceUrl: elsewhere.url });
    const answer = await askAgent({
      url: agent.url,
      text: 'Le contrat Atlas est-il signé ?',
      headers: { Authorization: 'Bearer company-token' },
      pollMs: 20,
    });
    expect(answer.outcome).toBe('completed');
    expect(agent.authorizations).toEqual(['Bearer company-token']);
    expect(elsewhere.seen).toEqual(['Le contrat Atlas est-il signé ?']);
    expect(elsewhere.authorizations.length).toBeGreaterThan(0);
    expect(elsewhere.authorizations).toEqual(elsewhere.authorizations.map(() => undefined));
  });
});
