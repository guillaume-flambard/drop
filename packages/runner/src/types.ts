import type { CapabilityCard, ConsentCost, DropErrorCode, Funding } from '@drop/protocol';
import type { ZodObject, ZodType } from 'zod';

/** Everything a capability receives from the frame. It gets nothing else. */
export interface RunContext {
  /** Owner config of the capability, already validated by its own configSchema. */
  config: unknown;
  /** Temporary directory created by the runner with fs.mkdtemp and always removed after the run. */
  workdir: string;
  /** Aborted at card.budget.maxSeconds, when the tool call budget is exceeded, or when the caller aborts. */
  signal: AbortSignal;
  /** Declares one tool call to the frame; throws E_BUDGET once card.budget.maxToolCalls is exceeded. */
  recordToolCall(name: string): void;
  /** Declares money spent by the run (e.g. LLM tokens); it goes into the receipt. */
  recordCost(usd: number): void;
  /** The requester's capped key for this run (D27), when the requester pays. Capabilities use it instead of the owner's. */
  funding?: Funding;
}

/** The card an implementation provides; buildCard adds the publication fields and the JSON schemas. */
export type ImplCard = Omit<
  CapabilityCard,
  'owner' | 'executorNodeId' | 'approverNodeIds' | 'inputSchema' | 'outputSchema'
>;

export interface CapabilityImpl<I = unknown, O = unknown> {
  card: ImplCard;
  input: ZodType<I>;
  /** Top-level object schema; the runner always applies it with .strict(). */
  output: ZodObject;
  configSchema: ZodType;
  /** Human-readable rendering of the input for the consent card. */
  preview(input: I): string;
  execute(input: I, ctx: RunContext): Promise<O>;
  /** What one run may cost the owner, from the owner's config. Absent for a capability that spends nothing. */
  cost?(config: unknown): ConsentCost;
  /**
   * A family is published once per owner source, as `<card.id>.<name>` (e.g. `mcp.answer.figma`, T2.2): every such id
   * runs this implementation with its own config.
   */
  family?: boolean;
  /** Card fields that depend on the owner's config, e.g. the title naming the source. */
  cardFor?(config: unknown): Partial<Pick<ImplCard, 'title' | 'receives' | 'neverReceives'>>;
}

export interface ToolCallCount {
  name: string;
  count: number;
}

export type RunResult =
  | {
      ok: true;
      output: Record<string, unknown>;
      outputHash: string;
      toolCalls: ToolCallCount[];
      costUsd: number;
      durationMs: number;
    }
  | {
      ok: false;
      code: DropErrorCode;
      message: string;
      toolCalls: ToolCallCount[];
      costUsd: number;
      durationMs: number;
    };
