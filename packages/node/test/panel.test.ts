import { request } from 'node:http';
import { Script } from 'node:vm';
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
      onboardingPreview: () => ({
        agents: [
          {
            agent: 'cursor',
            label: 'Cursor',
            state: 'ready',
            action: 'connect',
            fingerprint: 'a'.repeat(64),
            detail: 'Ajout du connecteur',
          },
        ],
        manual: { command: '/usr/bin/node', args: ['/app/drop-mcp.mjs'], env: { DROP_AGENT: 'other' } },
      }),
      onboardingApply: (selections) => {
        calls.push(`connect ${selections[0]?.agent ?? 'none'}`);
        return [{ agent: 'cursor', state: 'connected', detail: 'Configuration modifiée', restartRequired: true }];
      },
      link: (gateway, request) => {
        calls.push(`link ${request.clientName} (${request.redirectHost})`);
        return Promise.resolve({ ok: true, gateway });
      },
      unlink: (_gateway, client) => {
        calls.push(`unlink ${client}`);
        return true;
      },
      createTeam: (name) => {
        calls.push(`team ${name}`);
        return { ok: true };
      },
      connect: (agent, server) => {
        calls.push(`connect ${agent}/${server}`);
        return Promise.resolve({ connected: true });
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
      shellInstance: 'shell-test-instance',
      refreshCatalogs: () => Promise.resolve(),
      admin,
    });
    const { port } = api;

    expect((await call(port, 'GET', '/app', undefined, false)).status).toBe(401);
    expect(JSON.parse((await call(port, 'GET', '/_shell/health', undefined, false)).text)).toEqual({
      instance: 'shell-test-instance',
    });
    const page = await call(port, 'GET', `/app?token=${TOKEN}`, undefined, false);
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    expect(JSON.parse((await call(port, 'GET', '/ui/admin/status')).text)).toMatchObject({ relayConnected: true });
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code', server: 'figma' })).status).toBe(200);
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code' })).status).toBe(400);
    await call(port, 'POST', '/ui/admin/unshare', { capabilityId: 'mcp.answer.figma' });
    expect((await call(port, 'POST', '/ui/admin/install', { agent: 'cursor', remove: true })).status).toBe(409);
    expect((await call(port, 'GET', '/ui/admin/onboarding')).text).toContain('Ajout du connecteur');
    expect(
      (
        await call(port, 'POST', '/ui/admin/onboarding', {
          selections: [{ agent: 'cursor', fingerprint: 'bad', action: 'connect' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(port, 'POST', '/ui/admin/onboarding', {
          selections: [{ agent: 'cursor', fingerprint: 'a'.repeat(64), action: 'connect' }],
        })
      ).status,
    ).toBe(200);
    await call(port, 'POST', '/ui/admin/team', { name: 'Atlas' });
    expect(calls).toEqual(['share claude_code/figma', 'unshare mcp.answer.figma', 'connect cursor', 'team Atlas']);
    expect((await call(port, 'POST', '/ui/admin/share', { agent: 'claude_code', server: 'figma' }, false)).status).toBe(
      401,
    );
    expect(JSON.parse((await call(port, 'GET', '/ui/outbound')).text)).toEqual({ drops: [] });

    // Linking an assistant: the request must carry its client and return domain, which the gateway checks (T2.13).
    const link = { gateway: 'gw', session: 's'.repeat(24), client: 'Claude', clientId: 'c'.repeat(24) };
    expect((await call(port, 'POST', '/ui/admin/link', link)).status).toBe(400);
    expect((await call(port, 'POST', '/ui/admin/link', { ...link, redirect: 'claude.ai' })).status).toBe(200);
    expect(calls.at(-1)).toBe('link Claude (claude.ai)');
  });

  it('offers to sign in when a shared server needs OAuth, and links only an https sign-in page (T2.17)', () => {
    const html = renderPanel();
    expect(html).toContain("if (error.code === 'E_SHARE_OAUTH') signInOffer");
    expect(html).toContain("api('POST', '/ui/admin/connect', offer)");
    expect(html).toContain("if (signInLink.indexOf('https://') === 0)");
  });

  it('names the domain a linked assistant returns to, and warns when it is neither Claude nor ChatGPT', () => {
    const html = renderPanel();
    expect(html).toContain('var knownHosts = ["claude.ai","chatgpt.com","chat.openai.com"];');
    expect(html).toContain('qui n’est ni Claude ni ChatGPT');
    expect(html).toContain('clientId: request.clientId, redirect: request.redirect');
  });

  it('inserts what peers wrote as text only', () => {
    const html = renderPanel();
    expect(html).not.toContain('innerHTML');
    expect(html).not.toContain('insertAdjacentHTML');
    expect(html).toContain('node.textContent = a[key]');
    expect(html).toContain('1. Analyser ce Mac');
    expect(html).toContain('2. Connecter les agents sélectionnés');
    expect(html).toContain('Configuration manuelle');
    expect(html).toContain('hors ligne');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(script).toBeDefined();
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});
