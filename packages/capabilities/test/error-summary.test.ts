import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityCardSchema } from '@drop/protocol';
import { buildCard, runCapability, type RunResult } from '@drop/runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildLogCommand,
  capabilities,
  createErrorSummary,
  errorSummary,
  ErrorSummaryConfigSchema,
  parseLeadingTimestamp,
  type ErrorSummaryOutput,
  type LogReader,
} from '../src/index.ts';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const NODE_VPS = 'V'.repeat(43);
const NODE_GUILLAUME = 'G'.repeat(43);

// The trap: every sensitive value below must never appear in an output.
const SENSITIVE = [
  'alice@example.com',
  'bob.smith@example.org',
  'carol@example.net',
  '3f1c2a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f',
  '9b2e4d6f-1a3c-4e5f-8a7b-0c1d2e3f4a5b',
  '129.99',
  '4,250.00',
  '1,000,000.50',
  '203.0.113.42',
  '198.51.100.7',
  '10.0.0.12',
  'sk-ant-api03-' + 'FAKEFAKEFAKEFAKEFAKEFAKE',
  'PaymentGateway',
  'connection refused',
  'unexpected token',
];

const FIXTURE = [
  '2026-10-08T09:00:00Z ERROR PaymentGateway timeout (outside the 1h window) for alice@example.com',
  '2026-10-08T11:50:00Z INFO request ok user=alice@example.com id=3f1c2a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f amount=129.99 EUR ip=203.0.113.42',
  '2026-10-08T11:51:00Z ERROR PaymentGateway timeout for bob.smith@example.org order 9b2e4d6f-1a3c-4e5f-8a7b-0c1d2e3f4a5b amount 4,250.00 EUR from 198.51.100.7',
  '2026-10-08T11:52:30.250Z ERROR PaymentGateway timeout for carol@example.net amount 129.99 EUR',
  '    at retry (/srv/app/payments.js:42) without timestamp',
  '2026-10-08T11:53:00Z ERROR db connection refused host 10.0.0.12 using key sk-ant-api03-FAKEFAKEFAKEFAKEFAKEFAKE',
  '2026-10-08T11:54:00Z FATAL unexpected token in payload from carol@example.net 1,000,000.50 USD',
  '',
].join('\n');

let dir: string;
let logPath: string;

function config(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    services: {
      api: { source: { kind: 'file', path: logPath } },
      web: { source: { kind: 'journald', unit: 'web.service' } },
      worker: { source: { kind: 'docker', container: 'worker-1' } },
    },
    errorPatterns: [
      { name: 'PAYMENT_TIMEOUT', regex: 'PaymentGateway timeout' },
      { name: 'DB_CONNECTION', regex: 'connection refused' },
    ],
    errorLineRegex: '\\b(ERROR|FATAL)\\b',
    ...overrides,
  };
}

function expectOk(result: RunResult): ErrorSummaryOutput {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`unexpected ${result.code}`);
  return result.output as ErrorSummaryOutput;
}

function readerOf(lines: string[]) {
  return vi.fn<LogReader>(() => Promise.resolve(lines));
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drop-error-summary-test-'));
  logPath = join(dir, 'api.log');
  await writeFile(logPath, FIXTURE);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('production.error_summary card', () => {
  it('declares the card fields of the spec', () => {
    expect(errorSummary.card).toEqual({
      id: 'production.error_summary',
      version: '1.0.0',
      title: 'Résumer les erreurs de production',
      sensitivity: 'low',
      receives: [
        "l'état du service",
        "le nombre d'erreurs",
        "les 5 types d'erreurs les plus fréquents (noms définis par le propriétaire)",
      ],
      neverReceives: ['les lignes de log', 'les identifiants clients', 'les accès au serveur'],
      approval: 'always',
      maxOutputChars: 4000,
      budget: { maxSeconds: 20 },
    });
  });

  it('publishes as a valid card owned by a machine, without the owner config', () => {
    const card = buildCard(errorSummary, {
      owner: { kind: 'machine', displayName: 'VPS', nodeId: NODE_VPS },
      executorNodeId: NODE_VPS,
      approverNodeIds: [NODE_GUILLAUME],
    });
    expect(CapabilityCardSchema.parse(card)).toEqual(card);
    expect(card.owner.kind).toBe('machine');
    expect(card.approverNodeIds).toEqual([NODE_GUILLAUME]);
    expect(JSON.stringify(card)).not.toContain(logPath);
    expect(JSON.stringify(card)).not.toContain('web.service');
  });

  it('is in the capability registry', () => {
    expect(capabilities.map((impl) => impl.card.id)).toEqual(['production.error_summary']);
  });

  it('previews the service and window', () => {
    expect(errorSummary.preview({ service: 'api', window: '1h' })).toBe('Service « api », fenêtre 1h');
  });
});

describe('production.error_summary on the trapped fixture', () => {
  const capability = () => createErrorSummary({ now: () => NOW });

  it('counts error lines per owner-defined name over the window', async () => {
    const output = expectOk(await runCapability(capability(), { service: 'api', window: '1h' }, { config: config() }));
    expect(output).toEqual({
      service: 'api',
      window: '1h',
      status: 'ok',
      errorLines: 4,
      topErrors: [
        {
          name: 'PAYMENT_TIMEOUT',
          count: 2,
          share: 0.5,
          firstSeen: '2026-10-08T11:51:00.000Z',
          lastSeen: '2026-10-08T11:52:30.250Z',
        },
        {
          name: 'DB_CONNECTION',
          count: 1,
          share: 0.25,
          firstSeen: '2026-10-08T11:53:00.000Z',
          lastSeen: '2026-10-08T11:53:00.000Z',
        },
        {
          name: 'OTHER',
          count: 1,
          share: 0.25,
          firstSeen: '2026-10-08T11:54:00.000Z',
          lastSeen: '2026-10-08T11:54:00.000Z',
        },
      ],
    });
  });

  it('never outputs an email, UUID, amount, key, IP or log fragment', async () => {
    for (const window of ['15m', '1h', '6h', '24h'] as const) {
      const result = await runCapability(capability(), { service: 'api', window }, { config: config() });
      const serialized = JSON.stringify(expectOk(result));
      for (const value of SENSITIVE) expect(serialized).not.toContain(value);
    }
  });

  it('widens the count with the window', async () => {
    const output = expectOk(await runCapability(capability(), { service: 'api', window: '6h' }, { config: config() }));
    expect(output.errorLines).toBe(5);
    expect(output.topErrors[0]).toMatchObject({ name: 'PAYMENT_TIMEOUT', count: 3, share: 0.6 });
    expect(output.topErrors[0]?.firstSeen).toBe('2026-10-08T09:00:00.000Z');
  });

  it('records exactly one file read', async () => {
    const result = await runCapability(capability(), { service: 'api', window: '1h' }, { config: config() });
    expect(result.toolCalls).toEqual([{ name: 'file', count: 1 }]);
  });

  it('is deterministic for the same logs and input', async () => {
    const first = await runCapability(capability(), { service: 'api', window: '24h' }, { config: config() });
    const second = await runCapability(capability(), { service: 'api', window: '24h' }, { config: config() });
    expect(expectOk(first)).toEqual(expectOk(second));
    expect(first.ok && second.ok && first.outputHash === second.outputHash).toBe(true);
  });
});

describe('production.error_summary input', () => {
  it('rejects a service absent from the config before any read', async () => {
    const readLines = readerOf(['2026-10-08T11:59:00Z ERROR x']);
    const result = await runCapability(
      createErrorSummary({ readLines, now: () => NOW }),
      { service: 'payments', window: '1h' },
      { config: config() },
    );
    expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA', toolCalls: [] });
    expect(readLines).not.toHaveBeenCalled();
    if (!result.ok) expect(result.message).not.toContain('payments');
  });

  it('rejects inherited object keys as service names', async () => {
    const readLines = readerOf([]);
    const impl = createErrorSummary({ readLines, now: () => NOW });
    for (const service of ['__proto__', 'constructor', 'toString']) {
      const result = await runCapability(impl, { service, window: '1h' }, { config: config() });
      expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA' });
    }
    expect(readLines).not.toHaveBeenCalled();
  });

  it('rejects a window outside the list with E_SCHEMA', async () => {
    const readLines = readerOf([]);
    const result = await runCapability(
      createErrorSummary({ readLines }),
      { service: 'api', window: '2h' },
      { config: config() },
    );
    expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA' });
    expect(readLines).not.toHaveBeenCalled();
  });

  it('rejects an input that tries to name a unit or container', async () => {
    const readLines = readerOf([]);
    const result = await runCapability(
      createErrorSummary({ readLines }),
      { service: 'web', window: '1h', unit: 'sshd.service' },
      { config: config() },
    );
    expect(result).toMatchObject({ ok: false, code: 'E_SCHEMA' });
    expect(readLines).not.toHaveBeenCalled();
  });

  it('reads only the source configured for the named service', async () => {
    const readLines = readerOf([]);
    await runCapability(
      createErrorSummary({ readLines, now: () => NOW }),
      { service: 'web', window: '15m' },
      { config: config() },
    );
    expect(readLines).toHaveBeenCalledTimes(1);
    expect(readLines.mock.calls[0]?.[0]).toEqual({ kind: 'journald', unit: 'web.service' });
    expect(readLines.mock.calls[0]?.[1]).toBe('15m');
  });
});

describe('production.error_summary status', () => {
  async function statusOf(lines: string[], overrides: Record<string, unknown> = {}) {
    const impl = createErrorSummary({ readLines: readerOf(lines), now: () => NOW });
    return expectOk(await runCapability(impl, { service: 'web', window: '1h' }, { config: config(overrides) }));
  }

  it('is down when the source has no line in the window', async () => {
    expect(await statusOf([])).toMatchObject({ status: 'down', errorLines: 0, topErrors: [] });
    expect(await statusOf(['2026-10-08T08:00:00Z INFO too old'])).toMatchObject({ status: 'down' });
  });

  it('is degraded when errorLines is above the configured threshold', async () => {
    const lines = ['a', 'b', 'c'].map((tag) => `2026-10-08T11:59:00Z ERROR ${tag}`);
    expect(await statusOf(lines, { degradedThreshold: 2 })).toMatchObject({ status: 'degraded', errorLines: 3 });
  });

  it('is ok when errorLines equals the threshold', async () => {
    const lines = ['a', 'b'].map((tag) => `2026-10-08T11:59:00Z ERROR ${tag}`);
    expect(await statusOf(lines, { degradedThreshold: 2 })).toMatchObject({ status: 'ok', errorLines: 2 });
  });

  it('uses a default threshold of 50', async () => {
    const lines = Array.from({ length: 51 }, () => '2026-10-08T11:59:00Z ERROR boom');
    expect(await statusOf(lines)).toMatchObject({ status: 'degraded' });
    expect(await statusOf(lines.slice(1))).toMatchObject({ status: 'ok' });
    expect(ErrorSummaryConfigSchema.parse(config()).degradedThreshold).toBe(50);
  });

  it('is ok with log lines and no error', async () => {
    expect(await statusOf(['2026-10-08T11:59:00Z INFO fine'])).toMatchObject({ status: 'ok', errorLines: 0 });
  });
});

describe('production.error_summary aggregation', () => {
  it('keeps the five most frequent types, sorted by count then name', async () => {
    const counts: [string, number][] = [
      ['ALPHA', 1],
      ['BRAVO', 6],
      ['CHARLIE', 2],
      ['DELTA', 5],
      ['ECHO', 2],
      ['FOXTROT', 4],
      ['GOLF', 3],
    ];
    const lines = counts.flatMap(([name, count]) =>
      Array.from({ length: count }, () => `2026-10-08T11:59:00Z ERROR code-${name.toLowerCase()}`),
    );
    lines.push('2026-10-08T11:59:00Z ERROR something nobody named');
    const impl = createErrorSummary({ readLines: readerOf(lines), now: () => NOW });
    const output = expectOk(
      await runCapability(
        impl,
        { service: 'web', window: '1h' },
        {
          config: config({
            errorPatterns: counts.map(([name]) => ({ name, regex: `code-${name.toLowerCase()}` })),
          }),
        },
      ),
    );
    expect(output.errorLines).toBe(24);
    expect(output.topErrors.map((entry) => [entry.name, entry.count])).toEqual([
      ['BRAVO', 6],
      ['DELTA', 5],
      ['FOXTROT', 4],
      ['GOLF', 3],
      ['CHARLIE', 2],
    ]);
    expect(output.topErrors[0]?.share).toBe(0.25);
    expect(output.topErrors[3]?.share).toBe(0.125);
  });

  it('counts an error matching no pattern under OTHER, never under a name taken from the line', async () => {
    const impl = createErrorSummary({
      readLines: readerOf(['2026-10-08T11:59:00Z ERROR NullPointerException in Billing']),
      now: () => NOW,
    });
    const output = expectOk(await runCapability(impl, { service: 'web', window: '1h' }, { config: config() }));
    expect(output.topErrors.map((entry) => entry.name)).toEqual(['OTHER']);
    expect(JSON.stringify(output)).not.toContain('NullPointer');
  });

  it('rounds share to three decimals', async () => {
    const impl = createErrorSummary({
      readLines: readerOf([
        '2026-10-08T11:59:00Z ERROR PaymentGateway timeout',
        '2026-10-08T11:59:00Z ERROR x',
        '2026-10-08T11:59:00Z ERROR y',
      ]),
      now: () => NOW,
    });
    const output = expectOk(await runCapability(impl, { service: 'web', window: '1h' }, { config: config() }));
    expect(output.topErrors.map((entry) => entry.share)).toEqual([0.667, 0.333]);
  });

  it('records journalctl and docker reads by tool name', async () => {
    const impl = createErrorSummary({ readLines: readerOf([]), now: () => NOW });
    const web = await runCapability(impl, { service: 'web', window: '1h' }, { config: config() });
    const worker = await runCapability(impl, { service: 'worker', window: '1h' }, { config: config() });
    expect(web.toolCalls).toEqual([{ name: 'journalctl', count: 1 }]);
    expect(worker.toolCalls).toEqual([{ name: 'docker', count: 1 }]);
  });

  it('maps a failing source read to E_RUNNER without leaking the error', async () => {
    const impl = createErrorSummary({
      readLines: () => Promise.reject(new Error('ENOENT /var/log/secret-path.log')),
      now: () => NOW,
    });
    const result = await runCapability(impl, { service: 'web', window: '1h' }, { config: config() });
    expect(result).toMatchObject({ ok: false, code: 'E_RUNNER' });
    expect(JSON.stringify(result)).not.toContain('secret-path');
  });
});

describe('production.error_summary config', () => {
  it('rejects an invalid regex, a non UPPER_SNAKE name and the reserved OTHER name', () => {
    expect(ErrorSummaryConfigSchema.safeParse(config({ errorLineRegex: '(' })).success).toBe(false);
    const badName = config({ errorPatterns: [{ name: 'payment timeout', regex: 'x' }] });
    expect(ErrorSummaryConfigSchema.safeParse(badName).success).toBe(false);
    const reserved = config({ errorPatterns: [{ name: 'OTHER', regex: 'x' }] });
    expect(ErrorSummaryConfigSchema.safeParse(reserved).success).toBe(false);
  });

  it('rejects a unit or container that could be read as an option', () => {
    const unit = config({ services: { web: { source: { kind: 'journald', unit: '--help' } } } });
    const container = config({ services: { w: { source: { kind: 'docker', container: '-f' } } } });
    expect(ErrorSummaryConfigSchema.safeParse(unit).success).toBe(false);
    expect(ErrorSummaryConfigSchema.safeParse(container).success).toBe(false);
  });

  it('fails the run with E_RUNNER when the owner config is invalid', async () => {
    const readLines = readerOf([]);
    const result = await runCapability(
      createErrorSummary({ readLines }),
      { service: 'api', window: '1h' },
      { config: config({ errorLineRegex: '[' }) },
    );
    expect(result).toMatchObject({ ok: false, code: 'E_RUNNER' });
    expect(readLines).not.toHaveBeenCalled();
  });
});

describe('log commands', () => {
  it('builds fixed journalctl arguments from the configured unit', () => {
    expect(buildLogCommand({ kind: 'journald', unit: 'web.service' }, '1h')).toEqual({
      file: 'journalctl',
      args: ['-u', 'web.service', '--since', '-1h', '--no-pager', '-o', 'short-iso'],
    });
    expect(buildLogCommand({ kind: 'journald', unit: 'web.service' }, '15m').args[3]).toBe('-15min');
  });

  it('builds fixed docker arguments from the configured container', () => {
    expect(buildLogCommand({ kind: 'docker', container: 'worker-1' }, '24h')).toEqual({
      file: 'docker',
      args: ['logs', '--since', '24h', '--timestamps', 'worker-1'],
    });
  });
});

describe('parseLeadingTimestamp', () => {
  it.each([
    ['2026-10-08T11:59:00Z msg', '2026-10-08T11:59:00.000Z'],
    ['2026-10-08T13:59:00+0200 host web[1]: msg', '2026-10-08T11:59:00.000Z'],
    ['2026-10-08T13:59:00+02:00 host web[1]: msg', '2026-10-08T11:59:00.000Z'],
    ['2026-10-08T11:59:00.123456789Z docker line', '2026-10-08T11:59:00.123Z'],
    ['2026-10-08 11:59:00,5 python logging', '2026-10-08T11:59:00.500Z'],
  ])('parses %j', (line, iso) => {
    expect(new Date(parseLeadingTimestamp(line) ?? Number.NaN).toISOString()).toBe(iso);
  });

  it('returns undefined without a leading timestamp', () => {
    expect(parseLeadingTimestamp('    at retry (/srv/app.js:42)')).toBeUndefined();
    expect(parseLeadingTimestamp('ERROR at 2026-10-08T11:59:00Z')).toBeUndefined();
    expect(parseLeadingTimestamp('2026-13-45T99:99:00Z')).toBeUndefined();
  });
});
