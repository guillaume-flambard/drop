import { execFileSync, spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/campaign.ts';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A port block away from the defaults, different per run, to avoid collisions between test files and reruns. */
const port = (offset: number) => 20_000 + ((process.pid * 7 + offset * 131) % 20_000);

describe('simulation campaign (T4.1)', () => {
  it('AC real end-to-end campaign: allowed requests deliver, refusals stay refused, no leak, no orphan', async () => {
    const dir = join(tmpdir(), `drop-sim-test-${String(process.pid)}`);
    try {
      const result = await runCampaign({
        nodes: 3,
        owners: 1,
        requestsPerRequester: 3,
        durationMs: 3000,
        seed: 11,
        policy: { allow: 1 / 3, deny: 1 / 3, notNow: 1 / 3 },
        relayUrl: `ws://127.0.0.1:${String(port(1))}/v1`,
        workDir: dir,
        sampleEveryMs: 1000,
      });
      expect(result.report.totals).toEqual({ delivered: 2, denied: 2, not_now: 2 });
      expect(result.report.leaks).toBe(0);
      expect(result.report.latencyMs.count).toBe(2);
      expect(result.report.memoryKb.nodeMaxMax).toBeGreaterThan(0);
      expect(existsSync(join(dir, 'events.jsonl'))).toBe(true);
      expect(existsSync(join(dir, 'report.md'))).toBe(true);
      for (const pid of result.pids) expect(alive(pid)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('AC refuses a relay outside loopback before starting anything', async () => {
    const dir = join(tmpdir(), `drop-sim-refused-${String(process.pid)}`);
    await expect(
      runCampaign({
        nodes: 3,
        owners: 1,
        requestsPerRequester: 1,
        durationMs: 1000,
        seed: 1,
        policy: { allow: 1, deny: 0, notNow: 0 },
        relayUrl: 'wss://drop.memolabs.dev/v1',
        workDir: dir,
      }),
    ).rejects.toThrow('E_SIM_RELAY');
    expect(existsSync(dir)).toBe(false);
  });

  it('refuses more nodes than the separate-process limit before starting anything', async () => {
    await expect(
      runCampaign({
        nodes: 81,
        owners: 1,
        requestsPerRequester: 1,
        durationMs: 1000,
        seed: 1,
        policy: { allow: 1, deny: 0, notNow: 0 },
      }),
    ).rejects.toThrow('E_SIM_SIZE');
  });
});

describe('simulation bench signals (T4.1)', () => {
  it('AC stops every process it started when the bench receives SIGTERM mid-campaign', async () => {
    const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
    const dir = join(tmpdir(), `drop-sim-signal-${String(process.pid)}`);
    const bench = spawn(
      process.execPath,
      [
        cli,
        'run',
        '--nodes',
        '3',
        '--owners',
        '1',
        '--requests',
        '20',
        '--duration',
        '60',
        '--relay',
        `ws://127.0.0.1:${String(port(2))}/v1`,
        '--dir',
        dir,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('bench never reached the load phase'));
        }, 60_000);
        bench.stderr.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('requesters paired')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const children = execFileSync('pgrep', ['-P', String(bench.pid)], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .map(Number)
        .filter((pid) => pid > 0);
      expect(children.length).toBeGreaterThanOrEqual(4);
      bench.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        bench.once('exit', () => {
          resolve();
        });
      });
      for (const pid of children) expect(alive(pid)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
