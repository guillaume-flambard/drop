import { z } from 'zod';
import { DropError } from '@drop/protocol';
import { BUDGET_MESSAGES, type RunContext } from '@drop/runner';
import type { ChatMessage, ChatProvider, ToolCall, ToolSpec } from './llm.ts';

/** The most text one tool result may give the model. */
export const MAX_TOOL_RESULT_CHARS = 20_000;

const RETRY_PROMPT = 'Réponds uniquement avec l’objet JSON demandé, sans autre texte.';

/** Final answer: drops reasoning blocks, then reads the first JSON object, valid against `schema` or undefined. */
export function parseFinalJson<T>(schema: z.ZodType<T>, content: string): T | undefined {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Not JSON: no final answer in this reply, the loop asks once more.
    return undefined;
  }
}

export interface ToolLoop<T> {
  provider: ChatProvider;
  messages: ChatMessage[];
  /** Fixed by the capability before the first call (D19): the request never adds one. */
  tools: ToolSpec[];
  maxTurns: number;
  maxUsd: number;
  ctx: Pick<RunContext, 'signal' | 'recordCost' | 'recordToolCall'>;
  runTool: (call: ToolCall) => Promise<string>;
  output: z.ZodType<T>;
}

/**
 * The model's turns: tool calls are run and answered until a final JSON answer valid against `output`, asked for once
 * more if a reply is not one. The real cost is recorded each turn and stops the run past `maxUsd`.
 */
export async function runToolLoop<T>(loop: ToolLoop<T>): Promise<T> {
  const { ctx, messages } = loop;
  let cost = 0;
  let retried = false;
  for (let turn = 0; turn < loop.maxTurns; turn += 1) {
    const reply = await loop.provider.chat(messages, loop.tools, ctx.signal);
    cost += reply.costUsd;
    ctx.recordCost(reply.costUsd);
    if (cost > loop.maxUsd) throw new DropError('E_BUDGET', BUDGET_MESSAGES.cost);
    if (reply.toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: reply.content,
        tool_calls: reply.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      });
      for (const call of reply.toolCalls) {
        ctx.recordToolCall(call.name);
        messages.push({ role: 'tool', tool_call_id: call.id, content: await loop.runTool(call) });
      }
      continue;
    }
    const final = parseFinalJson(loop.output, reply.content);
    if (final !== undefined) return final;
    if (retried) break;
    retried = true;
    messages.push({ role: 'assistant', content: reply.content });
    messages.push({ role: 'user', content: RETRY_PROMPT });
  }
  throw new DropError('E_OUTPUT_INVALID', 'no valid final answer');
}
