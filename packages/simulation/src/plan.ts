/**
 * Seeded campaign plan for the local simulation bench (T4.1, D56). The whole plan is computed before any process
 * starts, so a seed replays the same requests and the same owner decisions.
 */
export type Decision = 'allow_once' | 'deny' | 'not_now';

export interface Policy {
  allow: number;
  deny: number;
  notNow: number;
}

export interface PlanOptions {
  nodes: number;
  owners: number;
  requestsPerRequester: number;
  durationMs: number;
  seed: number;
  policy: Policy;
}

export interface PlannedRequest {
  atMs: number;
  requester: number;
  owner: number;
  decision: Decision;
}

export interface Plan {
  seed: number;
  owners: number[];
  requesters: { node: number; owner: number }[];
  requests: PlannedRequest[];
}

/** mulberry32: small, fast, deterministic; never used for anything secret. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], next: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

/** Largest-remainder allocation: the counts always sum to `total`, whatever the shares and rounding. */
export function allocate(total: number, shares: number[]): number[] {
  const exact = shares.map((share) => share * total);
  const counts = exact.map((value) => Math.floor(value));
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    counts[i] = (counts[i] as number) + 1;
    left -= 1;
  }
  return counts;
}

export function buildPlan(options: PlanOptions): Plan {
  const { nodes, owners, requestsPerRequester, durationMs, seed, policy } = options;
  if (owners < 1 || owners >= nodes) throw new Error('E_SIM_PLAN owners must be at least 1 and fewer than nodes');
  if (requestsPerRequester < 1 || durationMs < 1) throw new Error('E_SIM_PLAN empty campaign');
  if (
    Math.abs(policy.allow + policy.deny + policy.notNow - 1) > 1e-9 ||
    [policy.allow, policy.deny, policy.notNow].some((p) => p < 0)
  )
    throw new Error('E_SIM_PLAN policy shares must be non-negative and sum to 1');
  const next = rng(seed);
  const ownerIds = Array.from({ length: owners }, (_, i) => i);
  const requesters = Array.from({ length: nodes - owners }, (_, i) => ({
    node: owners + i,
    owner: ownerIds[Math.floor(next() * owners)] as number,
  }));
  const total = requesters.length * requestsPerRequester;
  const [allows, denies, notNows] = allocate(total, [policy.allow, policy.deny, policy.notNow]) as [
    number,
    number,
    number,
  ];
  const decisions = shuffle<Decision>(
    [
      ...Array<Decision>(allows).fill('allow_once'),
      ...Array<Decision>(denies).fill('deny'),
      ...Array<Decision>(notNows).fill('not_now'),
    ],
    next,
  );
  const requests: PlannedRequest[] = [];
  let k = 0;
  for (const requester of requesters) {
    for (let i = 0; i < requestsPerRequester; i += 1) {
      requests.push({
        atMs: Math.floor(next() * durationMs),
        requester: requester.node,
        owner: requester.owner,
        decision: decisions[k] as Decision,
      });
      k += 1;
    }
  }
  requests.sort((x, y) => x.atMs - y.atMs || x.requester - y.requester);
  return { seed, owners: ownerIds, requesters, requests };
}

/** The bench only ever talks to its own relay on this machine (D56): never the VPS, never drop.memolabs.dev. */
export function assertLoopbackRelay(relayUrl: string): void {
  let host: string;
  try {
    host = new URL(relayUrl).hostname;
  } catch {
    throw new Error('E_SIM_RELAY invalid relay URL');
  }
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host))
    throw new Error(`E_SIM_RELAY the simulation relay must be on loopback, got ${host}`);
}
