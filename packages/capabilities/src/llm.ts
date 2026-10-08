import { z } from 'zod';

/**
 * Provider-agnostic chat client over the OpenAI-compatible `/chat/completions` API, spoken by Ollama, OpenRouter,
 * Groq, Gemini, Mistral, OpenAI and Anthropic. No SDK: one fetch. The API key is read from an environment variable
 * named in the owner's config, so it never sits in a config file, a message or a receipt.
 */
export const ProviderConfigSchema = z.object({
  baseUrl: z.url().default('http://127.0.0.1:11434/v1'),
  model: z.string().min(1).default('qwen3:0.6b'),
  apiKeyEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
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

export function openAiCompatible(config: ProviderConfig, env: NodeJS.ProcessEnv = process.env): ChatProvider {
  const key = config.apiKeyEnv ? env[config.apiKeyEnv] : undefined;
  if (config.apiKeyEnv && !key) throw new Error(`environment variable ${config.apiKeyEnv} is not set`);
  return {
    async chat(messages, tools, signal) {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
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
