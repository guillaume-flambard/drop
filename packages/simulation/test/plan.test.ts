import { describe, expect, it } from 'vitest';
import { assertLoopbackRelay, buildPlan } from '../src/plan.ts';

const base = { nodes: 12, owners: 3, requestsPerRequester: 4, durationMs: 60_000 };

describe('simulation plan (T4.1)', () => {
  it('AC same seed same plan, different seed different plan', () => {
    const a = buildPlan({ ...base, seed: 1, policy: { allow: 0.8, deny: 0.1, notNow: 0.1 } });
    const b = buildPlan({ ...base, seed: 1, policy: { allow: 0.8, deny: 0.1, notNow: 0.1 } });
    const c = buildPlan({ ...base, seed: 2, policy: { allow: 0.8, deny: 0.1, notNow: 0.1 } });
    expect(b).toEqual(a);
    expect(c.requests).not.toEqual(a.requests);
  });

  it('AC decision policy is followed within 3 points', () => {
    const plan = buildPlan({
      nodes: 101,
      owners: 1,
      requestsPerRequester: 10,
      durationMs: 600_000,
      seed: 7,
      policy: { allow: 0.8, deny: 0.1, notNow: 0.1 },
    });
    expect(plan.requests).toHaveLength(1000);
    const share = (decision: string) => plan.requests.filter((r) => r.decision === decision).length / 1000;
    expect(Math.abs(share('allow_once') - 0.8)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(share('deny') - 0.1)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(share('not_now') - 0.1)).toBeLessThanOrEqual(0.03);
  });

  it('pairs each requester with exactly one owner and keeps requests inside the campaign', () => {
    const plan = buildPlan({ ...base, seed: 3, policy: { allow: 1, deny: 0, notNow: 0 } });
    expect(plan.owners).toEqual([0, 1, 2]);
    expect(plan.requesters.map((r) => r.node)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const r of plan.requesters) expect(plan.owners).toContain(r.owner);
    for (const req of plan.requests) {
      expect(req.atMs).toBeGreaterThanOrEqual(0);
      expect(req.atMs).toBeLessThan(base.durationMs);
      expect(plan.requesters.find((r) => r.node === req.requester)?.owner).toBe(req.owner);
    }
    const times = plan.requests.map((r) => r.atMs);
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it('rejects impossible shapes', () => {
    expect(() => buildPlan({ ...base, owners: 12, seed: 1, policy: { allow: 1, deny: 0, notNow: 0 } })).toThrow(
      'E_SIM_PLAN',
    );
    expect(() => buildPlan({ ...base, seed: 1, policy: { allow: 0.5, deny: 0.1, notNow: 0.1 } })).toThrow('E_SIM_PLAN');
  });

  it('AC refuses a relay outside loopback', () => {
    expect(() => {
      assertLoopbackRelay('wss://drop.memolabs.dev/v1');
    }).toThrow('E_SIM_RELAY');
    expect(() => {
      assertLoopbackRelay('ws://10.0.0.5:7790/v1');
    }).toThrow('E_SIM_RELAY');
    expect(() => {
      assertLoopbackRelay('ws://127.0.0.1:7790/v1');
    }).not.toThrow();
    expect(() => {
      assertLoopbackRelay('ws://[::1]:7790/v1');
    }).not.toThrow();
  });
});

describe('simulation plan allocation (T4.1)', () => {
  it('largest remainders always sum to the total, including odd and tiny totals', async () => {
    const { allocate } = await import('../src/plan.ts');
    expect(allocate(1, [0, 0.5, 0.5])).toEqual([0, 1, 0]);
    expect(allocate(2, [0.5, 0.25, 0.25])).toEqual([1, 1, 0]);
    expect(allocate(7, [0.8, 0.1, 0.1])).toEqual([5, 1, 1]);
    for (const total of [1, 2, 3, 5, 7, 11, 97, 1000])
      expect(allocate(total, [0.8, 0.1, 0.1]).reduce((a, b) => a + b, 0)).toBe(total);
  });
});
