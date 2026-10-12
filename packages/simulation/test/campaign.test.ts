import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
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

describe('simulation campaign work directory (T4.42)', () => {
  it('refuses a reused work directory where a node directory is a planted link, before starting any process', async () => {
    const dir = join(tmpdir(), `drop-sim-planted-${String(process.pid)}`);
    const victim = mkdtempSync(join(tmpdir(), 'drop-sim-planted-victim-'));
    mkdirSync(dir, { recursive: true });
    try {
      try {
        symlinkSync(victim, join(dir, 'node-0'), 'dir');
      } catch (error) {
        // Windows without Developer Mode cannot create the link: there is nothing to refuse.
        if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') return;
        throw error;
      }
      await expect(
        runCampaign({
          nodes: 2,
          owners: 1,
          requestsPerRequester: 1,
          durationMs: 1000,
          seed: 1,
          policy: { allow: 1, deny: 0, notNow: 0 },
          relayUrl: `ws://127.0.0.1:${String(port(3))}/v1`,
          workDir: dir,
        }),
      ).rejects.toThrow('E_SIM_WORK_DIR');
      expect(readdirSync(victim)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(victim, { recursive: true, force: true });
    }
  });
});

/**
 * Before its load phase the bench starts one Node.js process after another (an init per node, a publish per owner),
 * then the relay and every node, and their cold starts take most of the wait: about 0.25 s each on an idle Mac, up to
 * 7 s each on a saturated one (T4.25). The bench already gives each node 30 s to serve and each pairing 30 s; the test
 * waits longer than that, so a slow phase is judged by the bench, whose exit is reported at once with its error.
 */
const LOAD_PHASE_WAIT_MS = 120_000;

describe('simulation bench signals (T4.1)', () => {
  // Windows has no SIGTERM: Node's kill() ends the bench at once, with no handler to run, and pgrep does not exist.
  it.skipIf(process.platform === 'win32')(
    'AC stops every process it started when the bench receives SIGTERM mid-campaign',
    async () => {
      const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
      const dir = join(tmpdir(), `drop-sim-signal-${String(process.pid)}`);
      // Two nodes still start every kind of process the bench stops (relay, owner, requester), with fewer cold starts.
      const bench = spawn(
        process.execPath,
        [
          cli,
          'run',
          '--nodes',
          '2',
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
      let stderr = '';
      bench.stderr.setEncoding('utf8');
      bench.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      const exited = new Promise<void>((resolve) => {
        bench.once('exit', () => {
          resolve();
        });
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const settle = (error?: Error) => {
            clearTimeout(timer);
            bench.stderr.off('data', onData);
            bench.off('exit', onExit);
            if (error) reject(error);
            else resolve();
          };
          const onData = () => {
            if (stderr.includes('requesters paired')) settle();
          };
          const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            settle(new Error(`bench exited (${String(code ?? signal)}) before the load phase:\n${stderr}`));
          };
          const timer = setTimeout(() => {
            settle(new Error(`bench never reached the load phase in ${String(LOAD_PHASE_WAIT_MS)} ms:\n${stderr}`));
          }, LOAD_PHASE_WAIT_MS);
          bench.stderr.on('data', onData);
          bench.once('exit', onExit);
        });
        const children = execFileSync('pgrep', ['-P', String(bench.pid)], { encoding: 'utf8' })
          .trim()
          .split('\n')
          .map(Number)
          .filter((pid) => pid > 0);
        expect(children.length).toBeGreaterThanOrEqual(3);
        bench.kill('SIGTERM');
        await exited;
        for (const pid of children) expect(alive(pid)).toBe(false);
      } finally {
        // A failed run must not leave the bench and its processes running after the test, nor delete its folder under it.
        if (bench.exitCode === null && bench.signalCode === null) {
          bench.kill('SIGTERM');
          await exited;
        }
        rmSync(dir, { recursive: true, force: true });
      }
    },
    LOAD_PHASE_WAIT_MS + 30_000,
  );
});
