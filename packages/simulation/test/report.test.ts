import { describe, expect, it } from 'vitest';
import { percentile, summarize } from '../src/report.ts';

describe('simulation report (T4.1)', () => {
  it('AC report statistics are exact', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
    const report = summarize({
      campaign: 'c1',
      seed: 1,
      nodes: 3,
      owners: 1,
      durationMs: 1000,
      outcomes: [
        { outcome: 'delivered', ms: 100 },
        { outcome: 'delivered', ms: 300 },
        { outcome: 'delivered', ms: 200 },
        { outcome: 'denied', ms: 50 },
        { outcome: 'not_now', ms: 60 },
        { outcome: 'error', ms: 0, code: 'E_TIMEOUT' },
      ],
      memory: [
        { role: 'relay', node: -1, rssKb: [1000, 3000] },
        { role: 'owner', node: 0, rssKb: [2000, 4000] },
        { role: 'requester', node: 1, rssKb: [6000] },
      ],
      leaks: 0,
    });
    expect(report.totals).toEqual({ delivered: 3, denied: 1, not_now: 1, error: 1 });
    expect(report.errors).toEqual({ E_TIMEOUT: 1 });
    expect(report.latencyMs).toEqual({ count: 3, median: 200, p95: 300, max: 300 });
    expect(report.memoryKb.relayMax).toBe(3000);
    expect(report.memoryKb.nodeMaxMedian).toBe(4000);
    expect(report.memoryKb.nodeMaxMax).toBe(6000);
    expect(report.memoryKb.sumOfPeaks).toBe(3000 + 4000 + 6000);
  });
});
