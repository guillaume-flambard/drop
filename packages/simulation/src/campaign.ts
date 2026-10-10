/**
 * Local simulation bench (T4.1, D56): a dedicated loopback relay and N real `drop serve` processes in the private
 * profile, driven through each node's local API like the MCP connector and the panel would. Everything lives in a
 * campaign directory; HOME and DROP_HOME point inside it, so ~/.drop is never read or written, and children get an
 * allowlisted environment, never the caller's keys.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { assertLoopbackRelay, buildPlan, type Decision, type Plan, type Policy } from './plan.ts';
import { renderMarkdown, summarize, type MemorySeries, type OutcomeRecord, type Report } from './report.ts';

const run = promisify(execFile);
const NODE_CLI = fileURLToPath(new URL('../../node/src/cli.ts', import.meta.url));
const RELAY_CLI = fileURLToPath(new URL('../../relay/src/cli.ts', import.meta.url));
const CAPABILITY = 'production.error_summary';
export const MAX_PROCESS_NODES = 80;

/** Distinctive fragments planted in every owner's log; none may ever reach a requester. */
export const LEAK_FRAGMENTS = [
  'alice.simleak@example.com',
  'card=4242-SIMLEAK-0001',
  'ip=10.99.77.55',
  'sk-ant-api03-SIMLEAK-notarealkey',
];

/** Counts planted fragments in a text: the leak check runs on every delivered payload and every requester file. */
export function countLeaks(text: string): number {
  return LEAK_FRAGMENTS.filter((fragment) => text.includes(fragment)).length;
}

/** Only these variables reach simulated nodes, plus the per-node overrides. */
const ENV_ALLOWLIST = ['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ'];

export interface CampaignOptions {
  nodes: number;
  owners: number;
  requestsPerRequester: number;
  durationMs: number;
  seed: number;
  policy: Policy;
  /** Relay URL; must be loopback. Its port is the campaign's base port (default ws://127.0.0.1:7900/v1). */
  relayUrl?: string;
  workDir?: string;
  sampleEveryMs?: number;
  log?: (line: string) => void;
  /** Called with the child list once processes exist, so a CLI can stop them on SIGINT or SIGTERM. */
  onChildren?: (children: ChildProcess[]) => void;
}

export interface CampaignResult {
  dir: string;
  report: Report;
  pids: number[];
}

interface SimNode {
  index: number;
  name: string;
  home: string;
  apiPort: number;
  nodeId: string;
  token: string;
  process?: ChildProcess;
}

const TERMINAL: Record<string, OutcomeRecord['outcome']> = {
  delivered: 'delivered',
  receipted: 'delivered',
  denied: 'denied',
  not_now: 'not_now',
  expired: 'expired',
  failed: 'failed',
};

const PendingSchema = z.object({ pending: z.array(z.object({ kind: z.string(), dropId: z.string() })) });
const CapabilitiesSchema = z.object({
  capabilities: z.array(z.object({ capability_id: z.string(), online: z.boolean() })),
});
const DropViewSchema = z.object({ state: z.string() }).loose();
const CreatedSchema = z.object({ dropId: z.string() });
const InviteSchema = z.object({ code: z.string() });

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'not ready';
  for (;;) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    if (Date.now() > deadline) throw new Error(`E_SIM_TIMEOUT ${what} (${last})`);
    await sleep(200);
  }
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

export async function runCampaign(options: CampaignOptions): Promise<CampaignResult> {
  const relayUrl = options.relayUrl ?? 'ws://127.0.0.1:7900/v1';
  assertLoopbackRelay(relayUrl);
  if (options.nodes > MAX_PROCESS_NODES)
    throw new Error(
      `E_SIM_SIZE ${String(options.nodes)} nodes in separate processes; the limit is ${String(MAX_PROCESS_NODES)} (larger campaigns belong to T4.7)`,
    );
  const log = options.log ?? (() => undefined);
  const basePort = Number(new URL(relayUrl).port || '7900');
  const plan: Plan = buildPlan(options);
  for (let port = basePort; port <= basePort + options.nodes; port += 1)
    if (!(await portIsFree(port))) throw new Error(`E_SIM_PORT port ${String(port)} is busy`);

  const dir = options.workDir ?? mkdtempSync(join(tmpdir(), 'drop-sim-'));
  mkdirSync(dir, { recursive: true });
  const campaign = `seed${String(options.seed)}-${String(options.nodes)}n`;
  const started = Date.now();
  const eventsPath = join(dir, 'events.jsonl');
  const emit = (event: Record<string, unknown>) => {
    appendFileSync(eventsPath, `${JSON.stringify({ t: Date.now() - started, campaign, ...event })}\n`);
  };
  writeFileSync(join(dir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

  const children: ChildProcess[] = [];
  options.onChildren?.(children);
  const pids: number[] = [];
  const nodes: SimNode[] = [];
  const memory = new Map<number, MemorySeries>();
  const outcomes: OutcomeRecord[] = [];
  const decisions = new Map<string, Decision>();
  const decided = new Set<string>();
  const timers: NodeJS.Timeout[] = [];
  let leaks = 0;
  const baseEnv: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) baseEnv[key] = value;
  }
  // Simulated nodes never notify the person running the bench, and never see the real ~/.drop.
  const isolatedEnv = (home: string) => ({
    ...baseEnv,
    DROP_HOME: home,
    HOME: join(home, 'user-home'),
    DROP_NOTIFY: 'off',
    // Dozens of nodes on one Mac must not flood the network with mDNS (T4.2).
    DROP_LAN: 'off',
  });

  const cli = async (node: SimNode, args: string[]) => {
    const { stdout } = await run(process.execPath, [NODE_CLI, ...args], { env: isolatedEnv(node.home) });
    return stdout;
  };
  const api = async (node: SimNode, method: string, path: string, body?: unknown, form?: Record<string, string>) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${node.token}` };
    let payload: string | undefined;
    if (form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(form).toString();
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`http://127.0.0.1:${String(node.apiPort)}${path}`, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: payload }),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'E_SIM_HTTP', message: 'non-JSON response' };
    }
    return { status: response.status, data, text };
  };
  const track = (child: ChildProcess, role: MemorySeries['role'], index: number) => {
    children.push(child);
    if (child.pid) pids.push(child.pid);
    memory.set(index, { role, node: index, rssKb: [] });
  };

  try {
    log(`campaign ${campaign} in ${dir}`);
    for (let i = 0; i < options.nodes; i += 1) {
      const home = join(dir, `node-${String(i)}`);
      mkdirSync(join(home, 'user-home'), { recursive: true });
      const role = plan.owners.includes(i) ? 'owner' : 'requester';
      const node: SimNode = {
        index: i,
        name: `${role === 'owner' ? 'Owner' : 'Asker'} ${String(i)}`,
        home,
        apiPort: basePort + 1 + i,
        nodeId: '',
        token: '',
      };
      await cli(node, [
        'init',
        '--name',
        node.name,
        '--kind',
        'human',
        '--relay',
        relayUrl,
        '--port',
        String(node.apiPort),
      ]);
      node.nodeId = z
        .object({ nodeId: z.string() })
        .parse(JSON.parse(readFileSync(join(home, 'identity.json'), 'utf8'))).nodeId;
      nodes.push(node);
    }
    log(`${String(nodes.length)} nodes initialised`);

    const relayConfig = join(dir, 'relay.config.json');
    writeFileSync(relayConfig, `${JSON.stringify({ port: basePort, allowedNodeIds: nodes.map((n) => n.nodeId) })}\n`);
    const relayLog = openSync(join(dir, 'relay.log'), 'a');
    const relay = spawn(process.execPath, [RELAY_CLI, 'serve', `--config=${relayConfig}`], {
      env: { ...baseEnv, HOME: join(dir, 'relay-home') },
      stdio: ['ignore', relayLog, relayLog],
    });
    track(relay, 'relay', -1);
    emit({ kind: 'relay_started', relayUrl });

    for (const ownerIndex of plan.owners) {
      const owner = nodes[ownerIndex] as SimNode;
      const now = new Date().toISOString();
      writeFileSync(
        join(owner.home, 'app.log'),
        [
          `${now} INFO checkout ok user=alice.simleak@example.com amount=42.00EUR`,
          `${now} ERROR payment timeout order=9f1c2b7e card=4242-SIMLEAK-0001`,
          `${now} ERROR payment timeout ip=10.99.77.55`,
          `${now} ERROR db connection refused key=sk-ant-api03-SIMLEAK-notarealkey`,
          '',
        ].join('\n'),
      );
      writeFileSync(
        join(owner.home, 'error-summary.json'),
        JSON.stringify({
          services: { api: { source: { kind: 'file', path: join(owner.home, 'app.log') } } },
          errorPatterns: [
            { name: 'PAYMENT_TIMEOUT', regex: 'payment timeout' },
            { name: 'DB_DOWN', regex: 'connection refused' },
          ],
          errorLineRegex: '\\b(ERROR|FATAL)\\b',
          degradedThreshold: 2,
        }),
      );
      await cli(owner, [
        'publish',
        CAPABILITY,
        '--approver',
        owner.nodeId,
        '--config',
        join(owner.home, 'error-summary.json'),
      ]);
    }

    for (const node of nodes) {
      const serveLog = openSync(join(node.home, 'serve.log'), 'a');
      const child = spawn(process.execPath, [NODE_CLI, 'serve'], {
        env: isolatedEnv(node.home),
        stdio: ['ignore', serveLog, serveLog],
      });
      track(child, plan.owners.includes(node.index) ? 'owner' : 'requester', node.index);
      node.process = child;
    }
    for (const node of nodes) {
      await waitFor(
        async () => {
          node.token = readFileSync(join(node.home, 'local-token'), 'utf8').trim();
          return (await api(node, 'GET', '/capabilities')).status === 200;
        },
        30_000,
        `node ${String(node.index)} API`,
      );
      emit({ kind: 'node_started', node: node.index });
    }
    log('all nodes serving');

    for (const pairing of plan.requesters) {
      const requester = nodes[pairing.node] as SimNode;
      const owner = nodes[pairing.owner] as SimNode;
      const { code } = InviteSchema.parse((await api(owner, 'POST', '/ui/invite', {})).data);
      await api(requester, 'POST', '/ui/pair', undefined, { code });
      await waitFor(
        async () => {
          const view = CapabilitiesSchema.parse((await api(requester, 'GET', '/capabilities')).data);
          return view.capabilities.some((c) => c.capability_id === CAPABILITY && c.online);
        },
        30_000,
        `pairing ${String(requester.index)} with ${String(owner.index)}`,
      );
      emit({ kind: 'paired', node: requester.index, peer: owner.index });
    }
    log(`${String(plan.requesters.length)} requesters paired`);

    const sample = async () => {
      for (const [index, series] of memory) {
        const pid = index === -1 ? relay.pid : nodes[index]?.process?.pid;
        if (!pid) continue;
        try {
          const { stdout } = await run('ps', ['-o', 'rss=', '-p', String(pid)]);
          const rss = Number(stdout.trim());
          if (rss > 0) {
            series.rssKb.push(rss);
            emit({ kind: 'sample', node: index, rssKb: rss });
          }
        } catch {
          emit({ kind: 'error', node: index, outcome: 'E_SIM_SAMPLE' });
        }
      }
    };
    await sample();
    timers.push(
      setInterval(() => {
        sample().catch(() => undefined);
      }, options.sampleEveryMs ?? 5000),
    );

    for (const ownerIndex of plan.owners) {
      const owner = nodes[ownerIndex] as SimNode;
      let busy = false;
      timers.push(
        setInterval(() => {
          if (busy) return;
          busy = true;
          (async () => {
            try {
              const { pending } = PendingSchema.parse((await api(owner, 'GET', '/ui/pending')).data);
              for (const item of pending) {
                const decision = decisions.get(item.dropId);
                if (item.kind !== 'approval' || !decision || decided.has(item.dropId)) continue;
                const answer = await api(owner, 'POST', '/ui/decide', undefined, { dropId: item.dropId, decision });
                if (answer.status === 200) {
                  decided.add(item.dropId);
                  emit({ kind: 'decision', node: owner.index, dropId: item.dropId, outcome: decision });
                } else {
                  emit({ kind: 'error', node: owner.index, dropId: item.dropId, outcome: 'E_SIM_DECIDE' });
                }
              }
            } catch {
              emit({ kind: 'error', node: owner.index, outcome: 'E_SIM_OWNER_POLL' });
            } finally {
              busy = false;
            }
          })().catch(() => undefined);
        }, 150),
      );
    }

    const loadStart = Date.now();
    const settle = async (planned: Plan['requests'][number]) => {
      await sleep(Math.max(0, loadStart + planned.atMs - Date.now()));
      const requester = nodes[planned.requester] as SimNode;
      const sent = Date.now();
      const created = await api(requester, 'POST', '/drops', {
        capabilityId: CAPABILITY,
        input: { service: 'api', window: '1h' },
        purpose: 'Simulation T4.1 : erreurs de paiement',
        agent: 'other',
      });
      if (created.status !== 201) {
        const code =
          z.object({ error: z.string() }).safeParse(created.data).data?.error ?? `HTTP_${String(created.status)}`;
        outcomes.push({ outcome: 'error', ms: 0, code });
        emit({ kind: 'error', node: requester.index, peer: planned.owner, outcome: code });
        return;
      }
      const { dropId } = CreatedSchema.parse(created.data);
      decisions.set(dropId, planned.decision);
      emit({ kind: 'request_sent', node: requester.index, peer: planned.owner, dropId });
      const deadline = sent + 90_000;
      while (Date.now() < deadline) {
        const view = await api(requester, 'GET', `/drops/${dropId}?wait=10`);
        if (view.status !== 200) {
          const code = `E_SIM_HTTP_${String(view.status)}`;
          outcomes.push({ outcome: 'error', ms: 0, code });
          emit({ kind: 'error', node: requester.index, dropId, outcome: code });
          return;
        }
        const outcome = TERMINAL[DropViewSchema.parse(view.data).state];
        if (outcome) {
          // Leak check on what the requester actually received, not only on its disk.
          const found = countLeaks(view.text);
          leaks += found;
          const ms = Date.now() - sent;
          outcomes.push({ outcome, ms });
          emit({ kind: 'result', node: requester.index, peer: planned.owner, dropId, outcome, ms, leaks: found });
          return;
        }
      }
      outcomes.push({ outcome: 'error', ms: 0, code: 'E_SIM_TIMEOUT' });
      emit({ kind: 'error', node: requester.index, dropId, outcome: 'E_SIM_TIMEOUT' });
    };
    await Promise.all(
      plan.requests.map((planned) =>
        settle(planned).catch(() => {
          outcomes.push({ outcome: 'error', ms: 0, code: 'E_SIM_HTTP' });
          emit({ kind: 'error', node: planned.requester, outcome: 'E_SIM_HTTP' });
        }),
      ),
    );
    await sample();
    log(`${String(outcomes.length)} requests settled`);

    let diskLeaks = 0;
    for (const pairing of plan.requesters) {
      const requester = nodes[pairing.node] as SimNode;
      for (const file of filesUnder(requester.home)) diskLeaks += countLeaks(readFileSync(file, 'latin1'));
    }
    leaks += diskLeaks;
    emit({ kind: 'leak_check', outcome: leaks === 0 ? 'clean' : 'leak', leaks, diskLeaks });

    const report = summarize({
      campaign,
      seed: options.seed,
      nodes: options.nodes,
      owners: options.owners,
      durationMs: options.durationMs,
      outcomes,
      memory: [...memory.values()],
      leaks,
    });
    writeFileSync(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(dir, 'report.md'), renderMarkdown(report));
    return { dir, report, pids };
  } finally {
    for (const timer of timers) clearInterval(timer);
    await stopAll(children);
  }
}

/** SIGTERM, then SIGKILL after 3 s: no orphan survives the campaign, even after an error. */
export async function stopAll(children: ChildProcess[]): Promise<void> {
  const alive = children.filter((c) => c.exitCode === null && c.signalCode === null);
  for (const child of alive) child.kill('SIGTERM');
  const exited = (child: ChildProcess) =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else
        child.once('exit', () => {
          resolve();
        });
    });
  const timeout = sleep(3000).then(() => 'timeout' as const);
  if ((await Promise.race([Promise.all(alive.map(exited)), timeout])) === 'timeout') {
    for (const child of alive) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await Promise.all(alive.map(exited));
  }
}
