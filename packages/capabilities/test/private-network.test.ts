import { createServer, type RequestListener } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { assertPrivateDestination, PrivateNetworkSchema } from '@drop/protocol';
import { privateFetch } from '../src/private-network.ts';
import { providerFor, ProviderConfigSchema } from '../src/llm.ts';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function server(handler: RequestListener) {
  const http = createServer(handler);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  closers.push(
    () =>
      new Promise<void>((resolve, reject) => {
        http.closeAllConnections();
        http.close((e) => {
          if (e) reject(e);
          else resolve();
        });
      }),
  );
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('address');
  return `http://127.0.0.1:${String(address.port)}`;
}

describe('private network', () => {
  it('rejects malformed HTTP status without crashing the daemon', async () => {
    const source = await server((_req, res) => {
      res.writeHead(600);
      res.end();
    });
    await expect(privateFetch({ origins: [source] }, source)(source)).rejects.toThrow('E_RUNNER');
  });

  it('rejects public addresses, DNS names, credentials and unlisted origins before transmission', () => {
    const policy = PrivateNetworkSchema.parse({ origins: ['http://127.0.0.1:1234', 'https://10.0.0.2'] });
    expect(assertPrivateDestination('http://127.0.0.1:1234/v1', policy).origin).toBe('http://127.0.0.1:1234');
    for (const url of [
      'https://cloud.example/v1',
      'http://localhost:1234',
      'http://127.0.0.1:1235',
      'http://user:secret@127.0.0.1:1234',
      'http://169.254.169.254',
      'http://2130706433:1234',
    ]) {
      expect(() => assertPrivateDestination(url, policy)).toThrow('E_DENIED');
    }
    for (const origin of [
      'https://8.8.8.8',
      'https://internal.example',
      'http://[::ffff:7f00:1]',
      'http://0.0.0.0',
      'http://127.0.0.1/path',
    ])
      expect(PrivateNetworkSchema.safeParse({ origins: [origin] }).success).toBe(false);
  });

  it('does not follow redirects or transmit credentials to a secondary origin', async () => {
    let leaked = 0;
    const target = await server((_req, res) => {
      leaked++;
      res.end('leak');
    });
    const source = await server((_req, res) => {
      res.writeHead(307, { Location: target });
      res.end();
    });
    const fetcher = privateFetch({ origins: [source, target] }, source);
    await expect(
      fetcher(source, { method: 'POST', body: 'question', headers: { Authorization: 'Bearer test-secret' } }),
    ).rejects.toThrow('E_DENIED');
    await expect(fetcher(target, { headers: { Authorization: 'Bearer test-secret' } })).rejects.toThrow('E_DENIED');
    expect(leaked).toBe(0);
  });

  it('uses the configured private endpoint and reports failures without fallback', async () => {
    const source = await server((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    });
    const fetcher = privateFetch({ origins: [source] }, source);
    expect(await (await fetcher(source)).json()).toEqual({ ok: true });
    await closers.pop()?.();
    await expect(fetcher(source)).rejects.toThrow('E_RUNNER');
  });

  it('rejects incompatible funding without disclosing its key or replacing owner settings', () => {
    const owner = ProviderConfigSchema.parse({
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'internal',
      apiKeyEnv: null,
    });
    const key = 'private-funding-secret';
    for (const funding of [
      { baseUrl: 'https://cloud.example/v1', model: 'internal' },
      { baseUrl: owner.baseUrl, model: 'other' },
    ]) {
      try {
        providerFor(owner, 1, { kind: 'capped_key', ...funding, apiKey: key, maxUsd: 0.1 });
        throw new Error('accepted');
      } catch (e) {
        expect(String(e)).toContain('E_DENIED');
        expect(String(e)).not.toContain(key);
      }
    }
    const compatible = providerFor(owner, 1, {
      kind: 'capped_key',
      baseUrl: owner.baseUrl,
      model: owner.model,
      apiKey: key,
      maxUsd: 0.1,
    });
    expect(compatible.config.baseUrl).toBe(owner.baseUrl);
    expect(compatible.config.model).toBe(owner.model);
    expect(compatible.maxUsd).toBe(0.1);
  });
});
