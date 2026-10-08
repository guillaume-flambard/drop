import {
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
  RestTransportFactory,
} from '@a2a-js/sdk/client';
import { outcomeOf, userMessage, type Outcome } from './messages.ts';

/**
 * Asks an A2A v1.0 agent one question (outgoing A2A, T2.15, D33): resolves its card, sends the message, and follows the
 * task until it ends, is interrupted (input or auth required), or the budget runs out. Headers (an API key, a bearer
 * token) are added to every request, card included; their values come from the owner's environment, never a config.
 */
export interface AskAgentOptions {
  /** The agent's base URL; its card is read at /.well-known/agent-card.json. */
  url: string;
  text: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  pollMs?: number;
  fetchImpl?: typeof fetch;
}

export async function askAgent(
  options: AskAgentOptions,
): Promise<{ outcome: Outcome; text: string; agentName: string }> {
  const baseFetch = options.fetchImpl ?? fetch;
  const headers = options.headers ?? {};
  const fetchImpl: typeof fetch = (input, init) => {
    const merged = new Headers(init?.headers);
    for (const [name, value] of Object.entries(headers)) merged.set(name, value);
    return baseFetch(input, { ...init, headers: merged, ...(options.signal ? { signal: options.signal } : {}) });
  };
  const factory = new ClientFactory(
    ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
      transports: [new JsonRpcTransportFactory({ fetchImpl }), new RestTransportFactory({ fetchImpl })],
      cardResolver: new DefaultAgentCardResolver({ fetchImpl }),
    }),
  );
  const card = await new DefaultAgentCardResolver({ fetchImpl }).resolve(options.url);
  const client = await factory.createFromAgentCard(card);
  let result = await client.sendMessage(
    {
      tenant: '',
      message: userMessage(options.text),
      configuration: {
        acceptedOutputModes: ['text/plain', 'application/json'],
        taskPushNotificationConfig: undefined,
        // A colleague's agent may take its time: return at once, then follow the task.
        returnImmediately: true,
      },
      metadata: undefined,
    },
    options.signal ? { signal: options.signal } : undefined,
  );
  let outcome = outcomeOf(result);
  while (outcome.outcome === 'pending' && 'id' in result) {
    if (options.signal?.aborted) break;
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 1500));
    result = await client.getTask(
      { tenant: '', id: result.id },
      options.signal ? { signal: options.signal } : undefined,
    );
    outcome = outcomeOf(result);
  }
  return { ...outcome, agentName: card.name };
}
