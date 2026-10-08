import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { startLocalApi, type AdminHooks, type LocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { renderPanel } from '../src/panel.ts';
import { MemoryStore } from './helpers.ts';

const TOKEN = 'panel-token-0123456789abcdefghijklmn';
let api: LocalApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

function call(port: number, method: string, path: string, body?: unknown, auth = true) {
  return new Promise<{ status: number; headers: Record<string, unknown>; text: string }>((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Host: `127.0.0.1:${String(port)}`,
          ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text });
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

describe('menu bar panel and its admin routes (T2.4)', () => {
  it('serves the panel only with the token, under a CSP that allows nothing but this node', async () => {
    const calls: string[] = [];
    const admin: AdminHooks = {
      status: () => ({ displayName: 'Julie', nodeId: 'n', relayConnected: true }),
      tools: () => ({ agents: [], shared: {}, payer: 'requester' }),
      share: (body) => {
        calls.push(`share ${body.agent}/${body.server}`);
        return Promise.resolve({ capabilityId: 'mcp.answer.figma' });
      },
      unshare: (id) => {
        calls.push(`unshare ${id}`);
        return true;
      },
      install: (agent, remove) => {
        calls.push(`${remove ? 'uninstall' : 'install'} ${agent}`);
        return { ok: true };
      },
      link: (gateway, session, client) => {
        calls.push(`link ${client}`);
        return Promise.resolve({ ok: true, gateway, session });
      },
      unlink: (_gateway, client) => {
        calls.push(`unlink ${client}`);
        return true;
      },
      createTeam: (name) => {
        calls.push(`team ${name}`);
        return { ok: true };
      },
    };
    const engine = new NodeEngine({
      identity: await generateIdentity('Julie'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: { send: () => Promise.resolve('offline') },
    });
    api = await startLocalApi({
      engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://x/v1',
      refreshCatalogs: () => Promise.resolve(),
      admin,
    });
    const { port } = api;

    expect((await call(port, 'GET', '/app', undefined, false)).status).toBe(401);
    const page = await call(port, 'GET', `/app?token=${TOKEN}`, undefined, false);
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    expect(JSON.parse((await call(port, 'GET', '/ui/admin/status')).text)).toMatchObject({ relayConnected: true });
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code', server: 'figma' })).status).toBe(200);
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code' })).status).toBe(400);
    await call(port, 'POST', '/ui/admin/unshare', { capabilityId: 'mcp.answer.figma' });
    await call(port, 'POST', '/ui/admin/install', { agent: 'cursor', remove: true });
    await call(port, 'POST', '/ui/admin/team', { name: 'Atlas' });
    expect(calls).toEqual(['share claude_code/figma', 'unshare mcp.answer.figma', 'uninstall cursor', 'team Atlas']);
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code', server: 'figma' }, false)).status).toBe(
      401,
    );
    expect(JSON.parse((await call(port, 'GET', '/ui/outbound')).text)).toEqual({ drops: [] });
  });

  it('inserts what peers wrote as text only', () => {
    const html = renderPanel();
    expect(html).not.toContain('innerHTML');
    expect(html).not.toContain('insertAdjacentHTML');
    expect(html).toContain('node.textContent = a[key]');
  });
});
