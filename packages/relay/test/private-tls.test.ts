import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:tls';
import { promisify } from 'node:util';
import { generateIdentity } from '@drop/protocol';
import { expect, it } from 'vitest';
import { startRelay } from '../src/index.ts';

it('connects to the internal relay through trusted TLS and rejects an untrusted certificate', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'drop-tls-'));
  chmodSync(directory, 0o700);
  const key = join(directory, 'test.key');
  const cert = join(directory, 'test.crt');
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
      '/CN=drop-private-test',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { stdio: 'ignore' },
  );
  chmodSync(key, 0o600);
  const identity = await generateIdentity('TLS fixture');
  const relay = await startRelay({ port: 0, allowedNodeIds: [identity.nodeId] }, { logger: () => undefined });
  let securedConnections = 0;
  const front = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (socket) => {
    securedConnections += 1;
    const upstream = connect(relay.port, '127.0.0.1');
    socket.pipe(upstream).pipe(socket);
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.on('close', () => socket.destroy());
  });
  try {
    await new Promise<void>((resolve) => front.listen(0, '127.0.0.1', resolve));
    const address = front.address();
    if (!address || typeof address === 'string') throw new Error('E_TEST_ADDRESS');
    const url = `wss://127.0.0.1:${String(address.port)}/v1`;
    const source = `
      import { RelayClient } from ${JSON.stringify(new URL('../src/client.ts', import.meta.url).href)};
      const options = JSON.parse(process.env.DROP_TLS_TEST_OPTIONS);
      const client = new RelayClient({ ...options, onEnvelope() {}, minBackoffMs: 5000 });
      client.start();
      const connected = await Promise.race([
        client.waitReady().then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 750)),
      ]);
      client.close();
      process.stdout.write(JSON.stringify({ connected }));
    `;
    const env: NodeJS.ProcessEnv = { ...process.env, DROP_TLS_TEST_OPTIONS: JSON.stringify({ identity, url }) };
    // Trust is loaded by the child at startup, never disabled globally.
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete env.NODE_EXTRA_CA_CERTS;
    const run = promisify(execFile);
    const trusted = await run(process.execPath, ['--input-type=module', '--eval', source], {
      env: { ...env, NODE_EXTRA_CA_CERTS: cert },
      timeout: 5000,
    });
    expect(JSON.parse(trusted.stdout)).toEqual({ connected: true });
    const untrusted = await run(process.execPath, ['--input-type=module', '--eval', source], { env, timeout: 5000 });
    expect(JSON.parse(untrusted.stdout)).toEqual({ connected: false });
    expect(securedConnections).toBe(1);
  } finally {
    await relay.close();
    await new Promise<void>((resolve, reject) =>
      front.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
