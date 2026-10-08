import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, DropError, isDropError, sha256Hex, type DropErrorCode } from '@drop/protocol';
import { scanSecrets } from './secrets.ts';
import type { CapabilityImpl, RunContext, RunResult, ToolCallCount } from './types.ts';

// Every message below is fixed text: a result never carries input or output content.
const MESSAGES = {
  inputSchema: 'input does not match the capability input schema',
  inputRejected: 'input rejected by the capability',
  configInvalid: 'capability config is invalid',
  aborted: 'run aborted by the caller',
  workdirCreate: 'workdir could not be created',
  workdirRemove: 'workdir could not be removed',
  executeFailed: 'capability execution failed',
  timeBudget: 'time budget exceeded',
  toolBudget: 'tool call budget exceeded',
  costBudget: 'cost budget exceeded',
  outputSchema: 'output does not match the capability output schema',
  outputAltered: 'output would be altered by its schema; outputs are never repaired',
  outputSize: 'serialized output exceeds maxOutputChars',
  secret: 'secret detected in output',
} as const;

export type InputValidation = { ok: true; input: unknown } | { ok: false; code: 'E_SCHEMA'; message: string };

export interface RunOptions {
  config: unknown;
  tmpRoot?: string;
  signal?: AbortSignal;
}

type Outcome = { ok: true; output: Record<string, unknown> } | { ok: false; code: DropErrorCode; message: string };

type Stop = 'time' | 'tools' | 'caller';

/** Pipeline step 1, also used by the node before it asks for approval. Never executes anything. */
export function validateInput(impl: CapabilityImpl, raw: unknown): InputValidation {
  const parsed = impl.input.safeParse(raw);
  if (!parsed.success) return { ok: false, code: 'E_SCHEMA', message: MESSAGES.inputSchema };
  return { ok: true, input: parsed.data };
}

function failure(code: DropErrorCode, message: string): Outcome {
  return { ok: false, code, message };
}

function stopFailure(stop: Stop): Outcome {
  if (stop === 'caller') return failure('E_RUNNER', MESSAGES.aborted);
  return failure('E_BUDGET', stop === 'time' ? MESSAGES.timeBudget : MESSAGES.toolBudget);
}

/** Steps 4 to 6: strict schema, size, secrets. The output is rejected, never repaired. */
function checkOutput(impl: CapabilityImpl, raw: unknown): Outcome {
  const parsed = impl.output.strict().safeParse(raw);
  if (!parsed.success) return failure('E_OUTPUT_INVALID', MESSAGES.outputSchema);
  const output: Record<string, unknown> = parsed.data;
  let serialized: string;
  try {
    serialized = canonical(output);
    // Nested objects strip unknown keys and defaults fill gaps: any difference means the schema repaired the output.
    if (canonical(raw) !== serialized) return failure('E_OUTPUT_INVALID', MESSAGES.outputAltered);
  } catch {
    return failure('E_OUTPUT_INVALID', MESSAGES.outputSchema);
  }
  if (serialized.length > impl.card.maxOutputChars) return failure('E_OUTPUT_INVALID', MESSAGES.outputSize);
  const kinds = scanSecrets(output);
  if (kinds.length > 0) return failure('E_SECRET_DETECTED', `${MESSAGES.secret} (${kinds.join(', ')})`);
  return { ok: true, output };
}

/** Steps 2 (timeout) and 3 (execute), then 4 to 6. */
async function executeAndCheck(
  impl: CapabilityImpl,
  input: unknown,
  config: unknown,
  workdir: string,
  calls: Map<string, number>,
  callerSignal: AbortSignal | undefined,
): Promise<Outcome> {
  const controller = new AbortController();
  const state: { stop?: Stop; total: number } = { total: 0 };
  const halt = (stop: Stop): void => {
    state.stop ??= stop;
    controller.abort(new DropError(stop === 'caller' ? 'E_RUNNER' : 'E_BUDGET'));
  };

  const maxToolCalls = impl.card.budget.maxToolCalls;
  const ctx: RunContext = {
    config,
    workdir,
    signal: controller.signal,
    recordToolCall: (name: string): void => {
      calls.set(name, (calls.get(name) ?? 0) + 1);
      state.total += 1;
      if (maxToolCalls !== undefined && state.total > maxToolCalls) {
        halt('tools');
        throw new DropError('E_BUDGET', MESSAGES.toolBudget);
      }
    },
  };

  const stopped = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => {
        reject(new DropError('E_BUDGET'));
      },
      { once: true },
    );
  });
  const onCallerAbort = (): void => {
    halt('caller');
  };
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    halt('time');
  }, impl.card.budget.maxSeconds * 1000);

  try {
    // Promise.resolve().then() turns a synchronous throw into a rejection; race() handles a late rejection.
    const raw: unknown = await Promise.race([Promise.resolve().then(() => impl.execute(input, ctx)), stopped]);
    if (state.stop !== undefined) return stopFailure(state.stop);
    return checkOutput(impl, raw);
  } catch (error) {
    if (state.stop !== undefined) return stopFailure(state.stop);
    // A capability may refuse with E_SCHEMA (input it rejects), E_OUTPUT_INVALID (its own post-checks) or E_BUDGET
    // (cost); the message is always fixed text. Anything else stays opaque.
    if (isDropError(error, 'E_SCHEMA')) return failure('E_SCHEMA', MESSAGES.inputRejected);
    if (isDropError(error, 'E_OUTPUT_INVALID')) return failure('E_OUTPUT_INVALID', MESSAGES.outputSchema);
    if (isDropError(error, 'E_BUDGET')) return failure('E_BUDGET', MESSAGES.costBudget);
    return failure('E_RUNNER', MESSAGES.executeFailed);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Runs pipeline steps 1 to 6 and removes the workdir (cleanup part of step 8).
 * Review (step 7), the receipt and sending the result belong to the node.
 */
export async function runCapability(impl: CapabilityImpl, rawInput: unknown, options: RunOptions): Promise<RunResult> {
  const startedAt = performance.now();
  const calls = new Map<string, number>();
  const toolCalls = (): ToolCallCount[] => [...calls].map(([name, count]) => ({ name, count }));
  const durationMs = (): number => Math.max(0, Math.round(performance.now() - startedAt));
  const finish = (outcome: Outcome): RunResult =>
    outcome.ok
      ? {
          ok: true,
          output: outcome.output,
          outputHash: sha256Hex(outcome.output),
          toolCalls: toolCalls(),
          durationMs: durationMs(),
        }
      : { ok: false, code: outcome.code, message: outcome.message, toolCalls: toolCalls(), durationMs: durationMs() };

  // Step 1: input. Then the owner config, before anything is created or executed.
  const validated = validateInput(impl, rawInput);
  if (!validated.ok) return finish(validated);
  const config = impl.configSchema.safeParse(options.config);
  if (!config.success) return finish(failure('E_RUNNER', MESSAGES.configInvalid));
  if (options.signal?.aborted === true) return finish(failure('E_RUNNER', MESSAGES.aborted));

  // Step 2: workdir.
  let workdir: string;
  try {
    workdir = await mkdtemp(join(options.tmpRoot ?? tmpdir(), 'drop-run-'));
  } catch {
    return finish(failure('E_RUNNER', MESSAGES.workdirCreate));
  }

  let outcome: Outcome;
  try {
    outcome = await executeAndCheck(impl, validated.input, config.data, workdir, calls, options.signal);
  } catch {
    outcome = failure('E_RUNNER', MESSAGES.executeFailed);
  }

  // Step 8 (cleanup only): the workdir never outlives the run.
  const removed = await rm(workdir, { recursive: true, force: true }).then(
    () => true,
    () => false,
  );
  if (!removed && outcome.ok) outcome = failure('E_RUNNER', MESSAGES.workdirRemove);
  return finish(outcome);
}
