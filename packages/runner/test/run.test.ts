import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityCardSchema, DropError, sha256Hex } from '@drop/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  BUDGET_MESSAGES,
  buildCard,
  runCapability,
  validateInput,
  type CapabilityImpl,
  type RunContext,
} from '../src/index.ts';

const NODE_A = 'A'.repeat(43);
const NODE_B = 'B'.repeat(43);

const InputSchema = z.strictObject({ question: z.string().min(1).max(50) });
type Input = z.infer<typeof InputSchema>;

const OutputSchema = z.object({
  answer: z.string(),
  items: z.array(z.object({ label: z.string() })),
});

const ConfigSchema = z.strictObject({ greeting: z.string().default('hello') });

type Execute = (input: Input, ctx: RunContext) => Promise<unknown>;

interface FakeOptions {
  maxSeconds?: number;
  maxToolCalls?: number;
  maxOutputChars?: number;
}

function fakeImpl(execute: Execute, options: FakeOptions = {}): CapabilityImpl<Input> {
  const budget: CapabilityImpl['card']['budget'] = { maxSeconds: options.maxSeconds ?? 5 };
  if (options.maxToolCalls !== undefined) budget.maxToolCalls = options.maxToolCalls;
  return {
    card: {
      id: 'test.fake',
      version: '1.0.0',
      title: 'Fake capability',
      sensitivity: 'low',
      receives: ['an answer'],
      neverReceives: ['the files'],
      approval: 'always',
      maxOutputChars: options.maxOutputChars ?? 1000,
      budget,
    },
    input: InputSchema,
    output: OutputSchema,
    configSchema: ConfigSchema,
    preview: (input) => `question: ${input.question}`,
    execute,
  };
}

const okOutput = { answer: 'fine', items: [{ label: 'one' }] };
const validInput = { question: 'is it fine?' };

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'drop-runner-test-'));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

function run(impl: CapabilityImpl<Input>, input: unknown = validInput, signal?: AbortSignal) {
  return runCapability(impl, input, signal === undefined ? { config: {}, tmpRoot } : { config: {}, tmpRoot, signal });
}

describe('validateInput', () => {
  it('returns the parsed input when it matches the schema', () => {
    const impl = fakeImpl(() => Promise.resolve(okOutput));
    expect(validateInput(impl, validInput)).toEqual({ ok: true, input: validInput });
  });

  it('returns E_SCHEMA without echoing the input', () => {
    const impl = fakeImpl(() => Promise.resolve(okOutput));
    const result = validateInput(impl, { question: 'x'.repeat(60) + 'LEAKME' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('E_SCHEMA');
    expect(result.message).not.toContain('LEAKME');
  });

  it('never executes the capability', () => {
    const execute = vi.fn<Execute>(() => Promise.resolve(okOutput));
    validateInput(fakeImpl(execute), validInput);
    validateInput(fakeImpl(execute), { nope: true });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('buildCard', () => {
  it('completes the card with publication fields and JSON schemas', () => {
    const impl = fakeImpl(() => Promise.resolve(okOutput));
    const card = buildCard(impl, {
      owner: { kind: 'machine', displayName: 'VPS', nodeId: NODE_A },
      executorNodeId: NODE_A,
      approverNodeIds: [NODE_B],
    });
    expect(CapabilityCardSchema.parse(card)).toEqual(card);
    expect(card.id).toBe('test.fake');
    expect(card.owner.kind).toBe('machine');
    expect(card.approverNodeIds).toEqual([NODE_B]);
    expect(card.inputSchema).toMatchObject({ type: 'object', required: ['question'] });
    expect(card.outputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('rejects a publication that does not form a valid card', () => {
    const impl = fakeImpl(() => Promise.resolve(okOutput));
    expect(() =>
      buildCard(impl, {
        owner: { kind: 'machine', displayName: 'VPS', nodeId: NODE_A },
        executorNodeId: NODE_A,
        approverNodeIds: [],
      }),
    ).toThrow();
  });
});

describe('runCapability: nominal path', () => {
  it('returns the validated output, its hash, tool calls and duration', async () => {
    const impl = fakeImpl((_input, ctx) => {
      ctx.recordToolCall('read');
      ctx.recordToolCall('read');
      ctx.recordToolCall('grep');
      return Promise.resolve(okOutput);
    });
    const result = await run(impl);
    expect(result).toMatchObject({
      ok: true,
      output: okOutput,
      outputHash: sha256Hex(okOutput),
      toolCalls: [
        { name: 'read', count: 2 },
        { name: 'grep', count: 1 },
      ],
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes the validated input and the parsed config (defaults applied)', async () => {
    const execute = vi.fn<Execute>(() => Promise.resolve(okOutput));
    await run(fakeImpl(execute));
    expect(execute).toHaveBeenCalledTimes(1);
    const [input, ctx] = execute.mock.calls[0] ?? [];
    expect(input).toEqual(validInput);
    expect(ctx?.config).toEqual({ greeting: 'hello' });
    expect(ctx?.signal.aborted).toBe(false);
  });

  it('creates the workdir before execute and removes it afterwards, files included', async () => {
    let seen = '';
    const impl = fakeImpl(async (_input, ctx) => {
      seen = ctx.workdir;
      expect(existsSync(ctx.workdir)).toBe(true);
      await writeFile(join(ctx.workdir, 'scratch.txt'), 'data');
      return okOutput;
    });
    const result = await run(impl);
    expect(result.ok).toBe(true);
    expect(seen.startsWith(tmpRoot)).toBe(true);
    expect(existsSync(seen)).toBe(false);
    expect(await readdir(tmpRoot)).toEqual([]);
  });
});

describe('runCapability: step 1, input', () => {
  it('fails with E_SCHEMA, never executes and creates no workdir', async () => {
    const execute = vi.fn<Execute>(() => Promise.resolve(okOutput));
    const result = await run(fakeImpl(execute), { question: 42 });
    expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA', toolCalls: [] });
    expect(execute).not.toHaveBeenCalled();
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it('rejects unknown input keys', async () => {
    const result = await run(
      fakeImpl(() => Promise.resolve(okOutput)),
      { ...validInput, tool: 'Bash' },
    );
    expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA' });
  });
});

describe('runCapability: owner config', () => {
  it('fails with E_RUNNER when the config does not match configSchema, before execute', async () => {
    const execute = vi.fn<Execute>(() => Promise.resolve(okOutput));
    const result = await runCapability(fakeImpl(execute), validInput, { config: { greeting: 7 }, tmpRoot });
    expect(result).toMatchObject({ ok: false, code: 'E_RUNNER' });
    expect(execute).not.toHaveBeenCalled();
    expect(await readdir(tmpRoot)).toEqual([]);
  });
});

describe('runCapability: step 3, execute failures', () => {
  it('maps a thrown error to E_RUNNER with a generic message and still removes the workdir', async () => {
    let seen = '';
    const impl = fakeImpl((_input, ctx) => {
      seen = ctx.workdir;
      return Promise.reject(new Error('db password is hunter2 at /srv/secret'));
    });
    const result = await run(impl);
    expect(result).toMatchObject({ ok: false, code: 'E_RUNNER' });
    if (result.ok) return;
    expect(result.message).not.toContain('hunter2');
    expect(existsSync(seen)).toBe(false);
  });

  it('maps a synchronous throw to E_RUNNER', async () => {
    const impl = fakeImpl(() => {
      throw new Error('sync failure');
    });
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_RUNNER' });
  });

  it('lets a thrown DropError E_SCHEMA through, with a generic message', async () => {
    const impl = fakeImpl(() => Promise.reject(new DropError('E_SCHEMA', 'unknown service prod-db-7')));
    const result = await run(impl);
    expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA' });
    if (result.ok) return;
    expect(result.message).not.toContain('prod-db-7');
  });

  it('does not let other DropError codes through', async () => {
    const impl = fakeImpl(() => Promise.reject(new DropError('E_SECRET_DETECTED', 'forged')));
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_RUNNER' });
  });

  it('fails with E_RUNNER when the caller aborts', async () => {
    const controller = new AbortController();
    const impl = fakeImpl(
      (_input, ctx) =>
        new Promise((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            resolve(okOutput);
          });
          controller.abort();
        }),
    );
    expect(await run(impl, validInput, controller.signal)).toMatchObject({ ok: false, code: 'E_RUNNER' });
  });

  it('does not start when the caller signal is already aborted', async () => {
    const execute = vi.fn<Execute>(() => Promise.resolve(okOutput));
    const result = await run(fakeImpl(execute), validInput, AbortSignal.abort());
    expect(result).toMatchObject({ ok: false, code: 'E_RUNNER' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('runCapability: budget', () => {
  it('aborts ctx.signal at maxSeconds and fails with E_BUDGET', async () => {
    let signal: AbortSignal | undefined;
    const impl = fakeImpl(
      (_input, ctx) => {
        signal = ctx.signal;
        return new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        });
      },
      { maxSeconds: 0.05 },
    );
    const result = await run(impl);
    expect(result).toMatchObject({ ok: false, code: 'E_BUDGET' });
    expect(signal?.aborted).toBe(true);
    expect(await readdir(tmpRoot)).toEqual([]);
  });

  it('fails with E_BUDGET even when execute ignores the signal', async () => {
    const impl = fakeImpl(() => new Promise(() => undefined), { maxSeconds: 0.05 });
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_BUDGET' });
  });

  it('fails with E_BUDGET when maxToolCalls is exceeded', async () => {
    const impl = fakeImpl(
      (_input, ctx) => {
        ctx.recordToolCall('read');
        ctx.recordToolCall('read');
        ctx.recordToolCall('read');
        return Promise.resolve(okOutput);
      },
      { maxToolCalls: 2 },
    );
    const result = await run(impl);
    expect(result).toMatchObject({ ok: false, code: 'E_BUDGET', toolCalls: [{ name: 'read', count: 3 }] });
  });

  it('fails with E_BUDGET when the capability swallows the tool budget error', async () => {
    const impl = fakeImpl(
      (_input, ctx) => {
        try {
          ctx.recordToolCall('a');
          ctx.recordToolCall('b');
        } catch {
          // a misbehaving capability ignores the frame
        }
        return Promise.resolve(okOutput);
      },
      { maxToolCalls: 1 },
    );
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_BUDGET' });
  });

  it('keeps the reason of a capability budget refusal, size or cost, as fixed text', async () => {
    const refuse = (message: string) => fakeImpl(() => Promise.reject(new DropError('E_BUDGET', message)));
    expect(await run(refuse(BUDGET_MESSAGES.size))).toMatchObject({
      ok: false,
      code: 'E_BUDGET',
      message: 'snapshot exceeds maxSnapshotBytes',
    });
    expect(await run(refuse(BUDGET_MESSAGES.cost))).toMatchObject({ message: 'cost budget exceeded' });
    // Any other text stays out of the result: a capability message is never passed through.
    expect(await run(refuse('budget hit while reading sk_live_notreal'))).toMatchObject({
      code: 'E_BUDGET',
      message: 'cost budget exceeded',
    });
  });

  it('accepts exactly maxToolCalls calls', async () => {
    const impl = fakeImpl(
      (_input, ctx) => {
        ctx.recordToolCall('read');
        ctx.recordToolCall('read');
        return Promise.resolve(okOutput);
      },
      { maxToolCalls: 2 },
    );
    expect(await run(impl)).toMatchObject({ ok: true });
  });
});

describe('runCapability: step 4, strict output', () => {
  it('rejects an unexpected top-level field with E_OUTPUT_INVALID', async () => {
    const impl = fakeImpl(() => Promise.resolve({ ...okOutput, debug: 'raw log line' }));
    const result = await run(impl);
    expect(result).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
    expect(JSON.stringify(result)).not.toContain('raw log line');
  });

  it('rejects an unexpected nested field instead of stripping it', async () => {
    const impl = fakeImpl(() => Promise.resolve({ answer: 'fine', items: [{ label: 'one', raw: 'leak' }] }));
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
  });

  it('rejects a wrong type without repairing it', async () => {
    const impl = fakeImpl(() => Promise.resolve({ answer: 42, items: [] }));
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
  });

  it('rejects a non-object output', async () => {
    const impl = fakeImpl(() => Promise.resolve('just text'));
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
  });

  it('validates the schema before scanning for secrets', async () => {
    const impl = fakeImpl(() => Promise.resolve({ ...okOutput, extra: 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA' }));
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
  });
});

describe('runCapability: step 5, size', () => {
  const sized = (length: number) => ({ answer: 'a'.repeat(length), items: [] });
  const overhead = JSON.stringify(sized(0)).length;

  it('accepts an output of exactly maxOutputChars', async () => {
    const impl = fakeImpl(() => Promise.resolve(sized(100 - overhead)), { maxOutputChars: 100 });
    expect(await run(impl)).toMatchObject({ ok: true });
  });

  it('rejects an output longer than maxOutputChars with E_OUTPUT_INVALID', async () => {
    const impl = fakeImpl(() => Promise.resolve(sized(101 - overhead)), { maxOutputChars: 100 });
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
  });

  it('checks the size before scanning for secrets', async () => {
    const secret = `sk-ant-api03-${'A'.repeat(40)}`;
    const impl = fakeImpl(() => Promise.resolve({ answer: secret, items: [] }), { maxOutputChars: 20 });
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_OUTPUT_INVALID' });
  });
});

describe('runCapability: step 6, secrets', () => {
  it('fails with E_SECRET_DETECTED for a secret in a nested array and returns no output', async () => {
    const secret = `ghp_${'a1B2'.repeat(9)}`;
    const impl = fakeImpl(() => Promise.resolve({ answer: 'fine', items: [{ label: 'ok' }, { label: secret }] }));
    const result = await run(impl);
    expect(result).toMatchObject({ ok: false, code: 'E_SECRET_DETECTED' });
    expect(result).not.toHaveProperty('output');
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('refuses a benign value that looks like a secret', async () => {
    const impl = fakeImpl(() => Promise.resolve({ answer: 'set PASSWORD=changeme in the docs', items: [] }));
    expect(await run(impl)).toMatchObject({ ok: false, code: 'E_SECRET_DETECTED' });
  });
});

describe('runner: no listening port', () => {
  it('imports no server module and never listens: it only runs capabilities in process', async () => {
    const dir = join(import.meta.dirname, '..', 'src');
    for (const name of await readdir(dir)) {
      const source = await readFile(join(dir, name), 'utf8');
      expect(source, name).not.toMatch(
        /from '(?:node:)?(?:http|https|net|dgram|http2)'|from 'ws'|\.listen\(|createServer/,
      );
    }
  });
});
