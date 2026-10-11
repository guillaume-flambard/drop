import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity, policyFingerprint, signPolicy, type Identity, type Policy } from '@drop/protocol';
import { RelayClient, startRelay, type RelayHandle } from '../src/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function policyFor(issuer: string, now = Date.now(), validMs = 30 * 86_400_000): Policy {
  return {
    v: 1,
    policyId: 'atlas-default',
    version: 1,
    issuer,
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + validMs).toISOString(),
    relays: ['wss://relay.atlas.internal/v1'],
    requireInternalRelay: true,
    gateways: { allowed: false, nodeIds: [] },
  };
}

function client(relay: RelayHandle, identity: Identity, policy?: string, url = relay.url, ca?: Buffer) {
  const statuses: string[] = [];
  const instance = new RelayClient({
    identity,
    url,
    onEnvelope: () => undefined,
    onStatus: (status) => statuses.push(status),
    ...(policy === undefined ? {} : { policy: () => policy }),
    ...(ca ? { ca } : {}),
    minBackoffMs: 20,
    maxBackoffMs: 50,
  });
  instance.start();
  cleanups.push(() => {
    instance.close();
  });
  return { instance, statuses };
}

async function until(check: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('enterprise policy (T4.10)', () => {
  it("lets in only nodes that present the relay's policy", async () => {
    const [org, managed, unmanaged, stale] = (await Promise.all(
      ['Atlas IT', 'Julie', 'Personal laptop', 'Old policy'].map((name) => generateIdentity(name)),
    )) as [Identity, Identity, Identity, Identity];
    const signed = await signPolicy(org, policyFor(org.nodeId));
    const older = await signPolicy(org, { ...policyFor(org.nodeId), policyId: 'atlas-old' });
    const dir = mkdtempSync(join(tmpdir(), 'drop-relay-policy-'));
    cleanups.push(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const policyPath = join(dir, 'policy.json');
    writeFileSync(policyPath, JSON.stringify(signed));
    const relay = await startRelay(
      {
        port: 0,
        allowedNodeIds: [managed.nodeId, unmanaged.nodeId, stale.nodeId],
        policyPath,
        policyIssuer: org.nodeId,
      },
      { logger: () => undefined },
    );
    cleanups.push(() => relay.close());
    const good = client(relay, managed, policyFingerprint(signed));
    const none = client(relay, unmanaged);
    const other = client(relay, stale, policyFingerprint(older));
    await good.instance.waitReady();
    await until(() => none.statuses.includes('unauthorized') && other.statuses.includes('unauthorized'));
    expect(none.instance.connected).toBe(false);
    expect(other.instance.connected).toBe(false);

    // A relay never starts on a policy that does not verify, nor keeps admitting once it has expired.
    const forged = { ...signed, policy: { ...signed.policy, requireInternalRelay: false } };
    writeFileSync(join(dir, 'forged.json'), JSON.stringify(forged));
    await expect(
      startRelay(
        { port: 0, allowedNodeIds: [], policyPath: join(dir, 'forged.json'), policyIssuer: org.nodeId },
        { logger: () => undefined },
      ),
    ).rejects.toThrow(/E_POLICY/);
    // Half a policy configuration would start an open relay.
    await expect(
      startRelay({ port: 0, allowedNodeIds: [], policyIssuer: org.nodeId }, { logger: () => undefined }),
    ).rejects.toThrow(/E_POLICY/);
    const clock = { now: Date.now() };
    const expiring = await signPolicy(org, policyFor(org.nodeId, clock.now, 60_000));
    writeFileSync(join(dir, 'expiring.json'), JSON.stringify(expiring));
    const lateConfig = {
      port: 0,
      allowedNodeIds: [managed.nodeId],
      policyPath: join(dir, 'expiring.json'),
      policyIssuer: org.nodeId,
    };
    // Once the policy expires, a node that arrives is refused at authentication (no ping runs during this test)...
    const late = await startRelay(lateConfig, { logger: () => undefined, now: () => clock.now });
    cleanups.push(() => late.close());
    const lateClock = clock.now;
    clock.now += 120_000;
    const refused = client(late, managed, policyFingerprint(expiring));
    await until(() => refused.statuses.includes('unauthorized'));
    expect(refused.statuses).not.toContain('connected');
    refused.instance.close();
    // ...and a node already connected is cut off at the next ping.
    const ticking = { now: lateClock };
    const cutting = await startRelay(lateConfig, {
      logger: () => undefined,
      now: () => ticking.now,
      pingIntervalMs: 50,
    });
    cleanups.push(() => cutting.close());
    const early = client(cutting, managed, policyFingerprint(expiring));
    await early.instance.waitReady();
    ticking.now += 120_000;
    await until(() => early.statuses.includes('unauthorized'));
    expect(early.instance.connected).toBe(false);
    // Nor does a relay start on a policy that has already expired.
    await expect(startRelay(lateConfig, { logger: () => undefined, now: () => clock.now })).rejects.toThrow(/E_POLICY/);
  });

  // openssl draws a 2048-bit RSA key: its time varies, and the Windows runner went past the default 5 s.
  it('serves wss itself when given a certificate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'drop-relay-tls-'));
    chmodSync(dir, 0o700);
    cleanups.push(() => {
      rmSync(dir, { recursive: true, force: true });
    });
    const keyPath = join(dir, 'relay.key');
    const certPath = join(dir, 'relay.crt');
    // Ephemeral test certificate: no private key is committed or printed.
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=drop-relay-test',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
      ],
      { stdio: 'ignore' },
    );
    const identity = await generateIdentity('Julie');
    const relay = await startRelay(
      { port: 0, allowedNodeIds: [identity.nodeId], tls: { certPath, keyPath } },
      { logger: () => undefined },
    );
    cleanups.push(() => relay.close());
    expect(relay.url.startsWith('wss://')).toBe(true);
    const ca = readFileSync(certPath);
    const node = client(relay, identity, undefined, relay.url, ca);
    await node.instance.waitReady();
    const health = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: relay.port, path: '/health', ca }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });
    expect(health).toBe(200);
  }, 30_000);
});
