import { z } from 'zod';
import { DropError, type Funding } from '@drop/protocol';

/**
 * Provider-agnostic chat client over the OpenAI-compatible `/chat/completions` API, spoken by Ollama, OpenRouter,
 * and other explicitly configured compatible endpoints. No SDK: one fetch. The API key is read from an environment variable
 * named in the owner's config, so it never sits in a config file, a message or a receipt. A keyless provider such as
 * local Ollama sets `apiKeyEnv: null`.
 */
export const ProviderConfigSchema = z.object({
  // Local default only; no model download or fallback. Model qualification belongs to T3.2.
  baseUrl: z.url().default('http://127.0.0.1:11434/v1'),
  model: z.string().trim().default(''),
  apiKeyEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .nullable()
    .default(null),
  inputUsdPerMTok: z.number().nonnegative().default(0),
  outputUsdPerMTok: z.number().nonnegative().default(0),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatTurn {
  content: string;
  toolCalls: ToolCall[];
  costUsd: number;
}

export interface ChatProvider {
  chat(messages: ChatMessage[], tools: ToolSpec[], signal: AbortSignal): Promise<ChatTurn>;
}

const CompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) }))
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).partial().nullish(),
});

/** Env name under which a requester's capped key is handed to the provider client: it never leaves the process. */
const FUNDED_KEY_ENV = 'DROP_REQUESTER_FUNDED_KEY';

/**
 * The provider a run uses: the requester's capped key when the requester pays (D27), else the owner's config. With a
 * funded key the owner's endpoint and model stay fixed; the budget is the smaller of both caps.
 */
export function providerFor(
  config: ProviderConfig,
  maxUsd: number,
  funding?: Funding,
): { config: ProviderConfig; env: NodeJS.ProcessEnv; maxUsd: number } {
  if (!funding) return { config, env: process.env, maxUsd };
  if (
    funding.baseUrl.replace(/\/$/, '') !== config.baseUrl.replace(/\/$/, '') ||
    (funding.model !== undefined && funding.model !== config.model)
  )
    throw new DropError('E_DENIED', 'E_DENIED incompatible model funding');
  return {
    config: { ...config, apiKeyEnv: FUNDED_KEY_ENV },
    env: { [FUNDED_KEY_ENV]: funding.apiKey },
    maxUsd: Math.min(maxUsd, funding.maxUsd),
  };
}

export function openAiCompatible(
  config: ProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): ChatProvider {
  if (!config.model) throw new DropError('E_SCHEMA', 'E_SCHEMA choose an installed model explicitly');
  const key = config.apiKeyEnv ? env[config.apiKeyEnv] : undefined;
  if (config.apiKeyEnv && !key) throw new Error(`environment variable ${config.apiKeyEnv} is not set`);
  return {
    async chat(messages, tools, signal) {
      const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0,
          ...(tools.length > 0
            ? { tools: tools.map((tool) => ({ type: 'function', function: tool })), tool_choice: 'auto' }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(`provider answered HTTP ${String(response.status)}`);
      const completion = CompletionSchema.parse(await response.json());
      const message = completion.choices[0]?.message;
      const usage = completion.usage ?? {};
      return {
        content: message?.content ?? '',
        toolCalls: (message?.tool_calls ?? []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        })),
        costUsd:
          ((usage.prompt_tokens ?? 0) * config.inputUsdPerMTok +
            (usage.completion_tokens ?? 0) * config.outputUsdPerMTok) /
          1_000_000,
      };
    },
  };
}
