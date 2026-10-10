import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createMcpAnswer, openAiCompatible, ProviderConfigSchema } from '@drop/capabilities';
import { generateIdentity, sealEnvelope, signPolicy, type Envelope, type Identity, type Policy } from '@drop/protocol';
import { startRelay } from '@drop/relay';
import { startDaemon } from '../src/daemon.ts';
import { NodeEngine } from '../src/engine.ts';
import { DropHome, NodeConfigSchema } from '../src/home.ts';
import { loadPolicy, providerAllowed, systemPolicyDir } from '../src/policy.ts';
import { MemoryStore, until } from './helpers.ts';

const cleanups: (() => Promise<void> | void)[] = [];
const savedDir = process.env.DROP_POLICY_DIR;
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  if (savedDir === undefined) delete process.env.DROP_POLICY_DIR;
  else process.env.DROP_POLICY_DIR = savedDir;
});

function policyFor(issuer: string, relayUrl: string, overrides: Partial<Policy> = {}): Policy {
  const now = Date.now();
  return {
    v: 1,
    policyId: 'atlas-default',
    version: 3,
    issuer,
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 86_400_000).toISOString(),
    allowedClients: ['claude_code', 'codex'],
    allowedProviders: ['https://10.0.0.5:8443'],
    relays: [relayUrl],
    requireInternalRelay: true,
    gateways: { allowed: false, nodeIds: [] },
    ...overrides,
  };
}

/** What IT deploys through MDM: the signed policy and the organization's key, side by side. */
function deploy(org: Identity, signed: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'drop-policy-'));
  writeFileSync(join(dir, 'policy.json'), JSON.stringify(signed));
  writeFileSync(join(dir, 'issuer.pub'), `${org.nodeId}\n`);
  return dir;
}

function homeFor(identity: Identity, relayUrl: string, extra: Record<string, unknown> = {}): DropHome {
  const home = new DropHome(join(mkdtempSync(join(tmpdir(), 'policy-home-')), 'home'));
  home.init(
    identity,
    NodeConfigSchema.parse({ relayUrl, ownerKind: 'human', apiPort: 0, profile: 'legacy', ...extra }),
  );
  return home;
}

const quiet = { apiPort: 0, notifications: false, log: () => undefined };

describe('enterprise policy (T4.10)', () => {
  it('refuses to start on a policy that is tampered with, from another issuer or expired', async () => {
    const [org, other, julie] = await Promise.all([
      generateIdentity('Atlas IT'),
      generateIdentity('Someone'),
      generateIdentity('Julie'),
    ]);
    const relayUrl = 'ws://127.0.0.1:1/v1';
    const signed = await signPolicy(org, policyFor(org.nodeId, relayUrl));
    const tampered = deploy(org, { ...signed, policy: { ...signed.policy, requireInternalRelay: false } });
    const foreign = deploy(org, await signPolicy(other, policyFor(other.nodeId, relayUrl)));
    const expired = deploy(
      org,
      await signPolicy(org, policyFor(org.nodeId, relayUrl, { expiresAt: new Date(Date.now() - 1000).toISOString() })),
    );
    const missingKey = mkdtempSync(join(tmpdir(), 'drop-policy-'));
    writeFileSync(join(missingKey, 'policy.json'), JSON.stringify(signed));
    // The issuer key without its policy is a managed machine whose policy went missing: refused too.
    const missingPolicy = mkdtempSync(join(tmpdir(), 'drop-policy-'));
    writeFileSync(join(missingPolicy, 'issuer.pub'), `${org.nodeId}\n`);
    for (const dir of [tampered, foreign, expired, missingKey, missingPolicy])
      await expect(loadPolicy({ systemDir: dir, envDir: undefined })).rejects.toThrow(/E_POLICY/);
    // The system folder is fixed; ProgramData from the environment cannot move it on Windows.
    const savedProgramData = process.env.ProgramData;
    process.env.ProgramData = 'D:\\empty';
    expect(systemPolicyDir('win32')).toBe('C:\\ProgramData\\drop');
    if (savedProgramData === undefined) delete process.env.ProgramData;
    else process.env.ProgramData = savedProgramData;

    // A deployed system policy always wins over the environment, which cannot point elsewhere to escape it.
    const valid = deploy(org, signed);
    expect(
      (await loadPolicy({ systemDir: tampered, envDir: valid }).catch((error: unknown) => error)) instanceof Error,
    ).toBe(true);
    expect((await loadPolicy({ systemDir: valid, envDir: tampered }))?.signed.policy.policyId).toBe('atlas-default');
    expect(await loadPolicy({ systemDir: join(valid, 'absent'), envDir: undefined })).toBeUndefined();

    // The daemon itself refuses to start.
    process.env.DROP_POLICY_DIR = tampered;
    const home = homeFor(julie, relayUrl);
    await expect(startDaemon(home, quiet)).rejects.toThrow(/E_POLICY/);
    // Nor with requester funding at a provider the policy does not list: it would mint keys there.
    process.env.DROP_POLICY_DIR = valid;
    await expect(startDaemon(homeFor(julie, relayUrl, { funding: { kind: 'openrouter' } }), quiet)).rejects.toThrow(
      /E_POLICY funding/,
    );
  });

  it('applies the policy to the relay, direct paths, gateways, clients and models', async () => {
    const [org, julie] = await Promise.all([generateIdentity('Atlas IT'), generateIdentity('Julie')]);
    const policyDir = mkdtempSync(join(tmpdir(), 'drop-policy-relay-'));
    // The policy names the relay and the relay needs the policy: pick a free port first.
    const probe = await startRelay({ port: 0, allowedNodeIds: [] }, { logger: () => undefined });
    const port = probe.port;
    await probe.close();
    const relayUrl = `ws://127.0.0.1:${String(port)}/v1`;
    const signed = await signPolicy(org, policyFor(org.nodeId, relayUrl));
    writeFileSync(join(policyDir, 'policy.json'), JSON.stringify(signed));
    const internal = await startRelay(
      {
        port,
        allowedNodeIds: [julie.nodeId],
        policyPath: join(policyDir, 'policy.json'),
        policyIssuer: org.nodeId,
      },
      { logger: () => undefined },
    );
    cleanups.push(() => internal.close());

    process.env.DROP_POLICY_DIR = deploy(org, signed);
    // Another relay than the organization's: refused before anything starts.
    const astray = homeFor(julie, 'ws://127.0.0.1:2/v1');
    await expect(startDaemon(astray, { apiPort: 0, notifications: false, log: () => undefined })).rejects.toThrow(
      /E_POLICY/,
    );

    const home = homeFor(julie, relayUrl);
    mkdirSync(join(home.root, 'user-home'), { recursive: true });
    const daemon = await startDaemon(home, { apiPort: 0, notifications: false, log: () => undefined });
    cleanups.push(() => daemon.stop());
    // The internal relay lets this node in: it presents the policy the relay requires.
    await daemon.relay.waitReady();
    expect(daemon.lan.state()).toBe('off');
    expect(daemon.iroh().state()).toBe('off');
    const api = (method: string, path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${String(daemon.api.port)}${path}`, {
        method,
        headers: { Authorization: `Bearer ${home.localToken()}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }).then(async (res) => ({ status: res.status, json: (await res.json()) as Record<string, unknown> }));
    const internet = await api('POST', '/ui/admin/internet', { mode: 'direct' });
    expect(internet.status).toBe(400);
    expect(String(internet.json.message)).toContain('E_POLICY');
    const link = await api('POST', '/ui/admin/link', {
      gateway: julie.nodeId,
      session: 'session-0123456789abcdef',
      client: 'Claude',
      clientId: 'client-0123456789',
      redirect: 'claude.ai',
    });
    expect(String(link.json.message)).toContain('E_POLICY');
    const preview = (await api('GET', '/ui/admin/onboarding')).json as {
      agents: { agent: string }[];
      manual?: unknown;
    };
    expect(preview.agents.every((plan) => ['claude_code', 'codex'].includes(plan.agent))).toBe(true);
    // Manual setup is for any other client: not offered when the policy names its clients.
    expect(preview.manual).toBeUndefined();
    const cursor = await api('POST', '/ui/admin/onboarding', {
      selections: [{ agent: 'cursor', fingerprint: 'a'.repeat(64), action: 'connect' }],
    });
    expect(String(cursor.json.message)).toContain('E_POLICY');
    // Removing a client connected before the policy stays possible.
    const removal = await api('POST', '/ui/admin/onboarding', {
      selections: [{ agent: 'cursor', fingerprint: 'a'.repeat(64), action: 'disconnect' }],
    });
    expect(JSON.stringify(removal.json)).not.toContain('E_POLICY');
    // The command line applies the same limit.
    const userHome = mkdtempSync(join(tmpdir(), 'policy-user-'));
    const installed = spawnSync(
      process.execPath,
      [join(import.meta.dirname, '..', 'src', 'cli.ts'), 'install', 'cursor'],
      {
        env: { ...process.env, HOME: userHome, DROP_HOME: home.root, DROP_POLICY_DIR: process.env.DROP_POLICY_DIR },
        encoding: 'utf8',
      },
    );
    expect(installed.stderr).toContain('E_POLICY');
    expect(existsSync(join(userHome, '.cursor', 'mcp.json'))).toBe(false);
    expect((await api('GET', '/ui/admin/status')).json).toMatchObject({
      policy: { policyId: 'atlas-default', version: 3 },
    });

    // A model outside the allowed providers is refused before any call.
    const policy = signed.policy;
    expect(providerAllowed(policy, 'https://10.0.0.5:8443/v1')).toBe(true);
    expect(providerAllowed(policy, 'https://openrouter.ai/api/v1')).toBe(false);
    let called = false;
    const guarded = createMcpAnswer({
      allowModel: (baseUrl) => providerAllowed(policy, baseUrl),
      provider: () => {
        called = true;
        return { complete: () => Promise.reject(new Error('never')) } as never;
      },
      connect: () => Promise.reject(new Error('never')),
    });
    await expect(
      guarded.execute({ question: 'Où en est la maquette ?' }, {
        config: {
          label: 'mon Figma',
          server: { transport: 'agent', agent: 'claude_code', name: 'figma' },
          tools: ['get_design_context'],
          provider: { baseUrl: 'https://openrouter.ai/api/v1', model: 'x/y:free', apiKeyEnv: 'OPENROUTER_API_KEY' },
        },
      } as never),
    ).rejects.toThrow(/E_DENIED/);
    expect(called).toBe(false);

    // An allowed endpoint that redirects never carries the prompt to the origin it points to.
    let elsewhereHit = false;
    const elsewhere = createServer((_req, res) => {
      elsewhereHit = true;
      res.end('{}');
    });
    const redirecting = createServer((_req, res) => {
      const address = elsewhere.address();
      res.writeHead(307, {
        Location: `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}/v1/chat/completions`,
      });
      res.end();
    });
    for (const server of [elsewhere, redirecting]) {
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      cleanups.push(
        () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          }),
      );
    }
    const allowedAddress = redirecting.address();
    const model = openAiCompatible(
      ProviderConfigSchema.parse({
        baseUrl: `http://127.0.0.1:${String(typeof allowedAddress === 'object' && allowedAddress ? allowedAddress.port : 0)}/v1`,
        model: 'local',
      }),
      {},
    );
    await expect(
      model.chat([{ role: 'user', content: 'Où en est la maquette ?' }], [], AbortSignal.timeout(5000)),
    ).rejects.toThrow();
    expect(elsewhereHit).toBe(false);

    // A gateway linked before the policy arrived, or by hand in the store, is still refused when it calls.
    const [gateway, other] = await Promise.all([generateIdentity('Gateway'), generateIdentity('Approved gateway')]);
    const sent: Envelope[] = [];
    let handled = 0;
    const store = new MemoryStore();
    store.saveLinks(
      [gateway, other].map((identity) => ({
        gateway: identity.nodeId,
        clientName: 'Claude',
        redirectHost: 'claude.ai',
        linkedAt: new Date().toISOString(),
      })),
    );
    const engine = new NodeEngine({
      identity: julie,
      ownerKind: 'human',
      store,
      capabilities: [],
      transport: {
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve('delivered');
        },
      },
      gatewayAllowed: (candidate) => candidate === other.nodeId,
      onAgentCall: () => {
        handled += 1;
        return Promise.resolve({ text: 'ok', isError: false });
      },
    });
    const call = (from: Identity, callId: string) =>
      sealEnvelope(from, julie.nodeId, {
        type: 'agent_call',
        callId,
        clientId: 'client-0123456789',
        tool: 'list_capabilities',
        args: {},
      });
    expect(engine.links().map((entry) => entry.gateway)).toEqual([other.nodeId]);
    await engine.handleEnvelope(await call(gateway, 'call-refused-01'));
    expect(handled).toBe(0);
    expect(sent).toHaveLength(0);
    await engine.handleEnvelope(await call(other, 'call-allowed-01'));
    expect(handled).toBe(1);
    expect(sent.map((envelope) => envelope.to)).toEqual([other.nodeId]);

    // Without requireInternalRelay, iroh may run, but only through the organization's relay host, and a policy that
    // expires while the node runs closes its paths to the team.
    const open = await startRelay({ port: 0, allowedNodeIds: [julie.nodeId] }, { logger: () => undefined });
    cleanups.push(() => open.close());
    const lapsing = await signPolicy(
      org,
      policyFor(org.nodeId, open.url, {
        requireInternalRelay: false,
        expiresAt: new Date(Date.now() + 3000).toISOString(),
      }),
    );
    process.env.DROP_POLICY_DIR = deploy(org, lapsing);
    const lapsingHome = homeFor(julie, open.url);
    const node = await startDaemon(lapsingHome, quiet);
    cleanups.push(() => node.stop());
    await node.relay.waitReady();
    const admin = (body: unknown) =>
      fetch(`http://127.0.0.1:${String(node.api.port)}/ui/admin/internet`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lapsingHome.localToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(async (res) => ({ status: res.status, text: await res.text() }));
    const n0 = await admin({ mode: 'relay', relay: 'https://euw1-1.relay.iroh.network' });
    expect(n0.status).toBe(400);
    expect(n0.text).toContain('iroh relay not allowed by policy');
    await until(() => !node.relay.connected, 8000);
    const after = await admin({ mode: 'direct' });
    expect(after.text).toContain('policy expired');
  }, 30_000);
});
