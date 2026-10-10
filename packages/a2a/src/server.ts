import type { IncomingMessage, ServerResponse } from 'node:http';
import { A2A_VERSION_HEADER, AgentCard } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  JsonRpcTransportHandler,
  ServerCallContext,
  type AgentExecutor,
} from '@a2a-js/sdk/server';

/**
 * Serves an A2A v1.0 agent over JSON-RPC with plain node:http (incoming A2A, T2.14, D33): the official SDK's
 * framework-free JsonRpcTransportHandler and DefaultRequestHandler, so drop adds no web framework. Streaming answers are
 * written as server-sent events, one JSON-RPC response per event.
 */
export interface A2aEndpoint {
  /** The agent card in its wire form, for GET /.well-known/agent-card.json. */
  cardJson(): unknown;
  handle(req: IncomingMessage, res: ServerResponse, body: string): Promise<void>;
}

/** A card in its wire form (JSON names, oneofs flattened), as served at /.well-known/agent-card.json. */
export function cardToJson(card: AgentCard): unknown {
  return AgentCard.toJSON(card);
}

export function a2aEndpoint(card: AgentCard, executor: AgentExecutor): A2aEndpoint {
  const handler = new JsonRpcTransportHandler(new DefaultRequestHandler(card, new InMemoryTaskStore(), executor));
  return {
    cardJson: () => cardToJson(card),
    async handle(req, res, body) {
      const version = req.headers[A2A_VERSION_HEADER.toLowerCase()];
      const context = new ServerCallContext({
        ...(typeof version === 'string' && version !== '' ? { requestedVersion: version } : {}),
      });
      const result = await handler.handle(body, context);
      if (Symbol.asyncIterator in result) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        for await (const event of result) res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result));
    },
  };
}
