import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectMcp, McpConnectError, McpServerSchema } from '@drop/capabilities';
import { generateIdentity } from '@drop/protocol';
import { startFakeOAuthMcp, type FakeOAuthMcp } from '../../capabilities/test/fixtures/fake-oauth-mcp.ts';
import { startLocalApi, type AdminHooks, type LocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { OAuthSignIns, OAuthStore, runtimeOAuth } from '../src/oauth.ts';
import { ShareError } from '../src/share.ts';
import { MemoryStore } from './helpers.ts';
import { expectPrivateMode } from '../../../test/private-mode.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const REDIRECT = 'http://127.0.0.1:7781/oauth/callback';

async function fake(): Promise<FakeOAuthMcp> {
  const server = await startFakeOAuthMcp();
  cleanups.push(() => server.close());
  return server;
}

/** Plays the browser: opens the authorization URL and returns where the server sends the user back. */
async function consent(authorizationUrl: string): Promise<{ code: string; state: string }> {
  const response = await fetch(authorizationUrl, { redirect: 'manual' });
  const back = new URL(response.headers.get('location') ?? '');
  expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
  return { code: back.searchParams.get('code') ?? '', state: back.searchParams.get('state') ?? '' };
}

async function signIn(store: OAuthStore, url: string): Promise<void> {
  const signIns = new OAuthSignIns({ store, redirectUrl: () => REDIRECT });
  const started = await signIns.start(url);
  if (started.connected) throw new Error('expected a sign-in');
  const back = await consent(started.authorizationUrl);
  await signIns.complete(back.state, back.code);
}

describe('remote MCP servers behind OAuth (T2.17)', () => {
  it('signs in once (registration, PKCE, consent), keeps the tokens 0600, refreshes them, and stops when revoked', async () => {
    const notion = await fake();
    const store = new OAuthStore(join(mkdtempSync(join(tmpdir(), 'oauth-')), 'oauth'));
    const server = McpServerSchema.parse({ transport: 'http', url: notion.url });
    const connect = () => connectMcp(server, {}, { oauth: runtimeOAuth(store, REDIRECT) });

    // Before signing in: the server needs OAuth, and nothing is registered behind the owner's back.
    await expect(connect()).rejects.toMatchObject({ reason: 'oauth' });
    expect(notion.registrations).toEqual([]);

    const signIns = new OAuthSignIns({ store, redirectUrl: () => REDIRECT });
    const started = await signIns.start(notion.url);
    if (started.connected) throw new Error('expected a sign-in');
    expect(new URL(started.authorizationUrl).searchParams.get('code_challenge_method')).toBe('S256');
    const back = await consent(started.authorizationUrl);
    expect(back.state).toBe(started.state);
    await expect(signIns.complete('not-a-pending-state', back.code)).rejects.toThrow(/E_OAUTH_STATE/);
    expect(await signIns.complete(back.state, back.code)).toBe(new URL(notion.url).host);
    await expect(signIns.complete(back.state, back.code)).rejects.toThrow(/E_OAUTH_STATE/);
    expect(notion.registrations).toEqual(['drop']);

    const files = readdirSync(store.directory);
    expect(files).toHaveLength(1);
    expectPrivateMode(join(store.directory, files[0] ?? ''));
    expectPrivateMode(store.directory, 0o700);

    const client = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain('notion-search');
    await client.close();
    // Signing in again is not needed while the tokens work.
    expect(await signIns.start(notion.url)).toEqual({ connected: true });

    notion.expireAccessTokens();
    const refreshed = await connect();
    expect((await refreshed.callTool({ name: 'notion-search', arguments: { query: 'Atlas' } })).content).toEqual([
      { type: 'text', text: 'Atlas roadmap (match for Atlas)' },
    ]);
    await refreshed.close();

    // Two runs refresh at once: the refresh token rotates, one of them loses, and the winner's tokens stay.
    notion.expireAccessTokens();
    const both = await Promise.allSettled([connect(), connect()]);
    expect(both.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
    for (const outcome of both) if (outcome.status === 'fulfilled') await outcome.value.close();
    const after = await connect();
    await after.close();

    notion.revokeAll();
    const refused = await connect().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(McpConnectError);
    expect(refused).toMatchObject({ reason: 'oauth', code: 'E_RUNNER' });
  }, 20_000);

  it('takes the sign-in callback on the local API without its token, for a pending state only', async () => {
    const calls: string[] = [];
    const admin: AdminHooks = {
      status: () => ({ displayName: 'Natha', nodeId: 'n', relayConnected: true }),
      tools: () => ({ agents: [], shared: {}, payer: 'requester' }),
      share: () => Promise.reject(new ShareError('notion demande une connexion OAuth', 'E_SHARE_OAUTH')),
      unshare: () => true,
      install: () => ({ ok: true }),
      createTeam: () => ({ ok: true }),
      link: () => Promise.resolve({ ok: true }),
      unlink: () => true,
      connect: (agent, server) => {
        calls.push(`connect ${agent}/${server}`);
        return Promise.resolve({ authorizationUrl: 'https://mcp.notion.example/authorize?x=1' });
      },
    };
    const engine = new NodeEngine({
      identity: await generateIdentity('Natha'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    const api: LocalApi = await startLocalApi({
      engine,
      token: 'oauth-test-token-0123456789abcdefghij',
      port: 0,
      relayUrl: 'ws://x/v1',
      refreshCatalogs: () => Promise.resolve(),
      admin,
      oauthCallback: (state, code) => {
        calls.push(`callback ${state} ${code}`);
        if (state !== 'pending-state') return Promise.reject(new Error('E_OAUTH_STATE'));
        return Promise.resolve('mcp.notion.example');
      },
    });
    cleanups.push(() => api.close());
    const get = (path: string, auth = false, host = `127.0.0.1:${String(api.port)}`, method = 'GET', body?: string) =>
      new Promise<{ status: number; text: string; headers: Record<string, unknown> }>((done, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: api.port,
            path,
            method,
            headers: {
              Host: host,
              ...(auth ? { Authorization: 'Bearer oauth-test-token-0123456789abcdefghij' } : {}),
              ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
          },
          (res) => {
            let text = '';
            res.on('data', (chunk: Buffer) => (text += chunk.toString()));
            res.on('end', () => {
              done({ status: res.statusCode ?? 0, text, headers: res.headers });
            });
          },
        );
        req.on('error', reject);
        req.end(body);
      });

    const ok = await get('/oauth/callback?state=pending-state&code=abc');
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('mcp.notion.example');
    expect(ok.headers['content-security-policy']).toBe("default-src 'none'");
    expect((await get('/oauth/callback?state=other&code=abc')).status).toBe(400);
    expect((await get('/oauth/callback?state=pending-state')).status).toBe(400);
    const denied = await get('/oauth/callback?state=pending-state&error=access_denied');
    expect(denied.status).toBe(400);
    expect(denied.text).toContain('refusée');
    expect((await get('/oauth/callback?state=pending-state&code=abc', false, 'evil.example')).status).toBe(401);
    expect(calls).toEqual(['callback pending-state abc', 'callback other abc']);

    const body = JSON.stringify({ agent: 'claude_code', server: 'notion' });
    expect((await get('/ui/admin/connect', false, undefined, 'POST', body)).status).toBe(401);
    const connected = await get('/ui/admin/connect', true, undefined, 'POST', body);
    expect(JSON.parse(connected.text)).toEqual({ authorizationUrl: 'https://mcp.notion.example/authorize?x=1' });
    const shared = await get('/ui/admin/share', true, undefined, 'POST', body);
    expect(shared.status).toBe(400);
    expect(JSON.parse(shared.text)).toMatchObject({ error: 'E_ADMIN', code: 'E_SHARE_OAUTH' });
  });

  it('drop share uses the tokens of a sign-in, and says how to sign in before one', async () => {
    const notion = await fake();
    const cli = resolve(import.meta.dirname, '..', 'src', 'cli.ts');
    const home = mkdtempSync(join(tmpdir(), 'oauth-share-home-'));
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({ mcpServers: { notion: { type: 'http', url: notion.url } } }),
    );
    const dropHome = join(home, '.drop');
    const env = { ...process.env, HOME: home, USERPROFILE: home, DROP_HOME: dropHome };
    const run = (...args: string[]) =>
      new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
        const child = spawn(process.execPath, [cli, ...args], { env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
        child.on('close', (status) => {
          done({ status, stdout, stderr });
        });
      });
    expect(
      (
        await run(
          'init',
          '--profile',
          'legacy',
          '--name',
          'Natha',
          '--kind',
          'human',
          '--relay',
          'wss://relay.example/v1',
        )
      ).status,
    ).toBe(0);
    const before = await run('share', 'claude_code/notion');
    expect(before.stderr).toContain('demande une connexion OAuth');
    expect(before.stderr).toContain('drop connect claude_code/notion');

    await signIn(new OAuthStore(join(dropHome, 'oauth')), notion.url);
    const after = await run('share', 'claude_code/notion');
    expect(after.stdout).toContain('published mcp.answer.notion');
    const published = JSON.parse(readFileSync(join(dropHome, 'capabilities', 'mcp.answer.notion.json'), 'utf8')) as {
      config: { tools: string[] };
    };
    expect(published.config.tools).toEqual(['notion-search']);
  }, 30_000);
});
