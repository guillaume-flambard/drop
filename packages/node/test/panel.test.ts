import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { Script } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { generateIdentity } from '@drop/protocol';
import { startLocalApi, type AdminHooks, type LocalApi } from '../src/api.ts';
import { NodeEngine } from '../src/engine.ts';
import { PANEL_CSP, renderPanel, renderWorkspace, WORKSPACE_CSP } from '../src/workspace.ts';
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
    expect((await call(port, 'GET', '/workspace', undefined, false)).status).toBe(401);
    expect(JSON.parse((await call(port, 'GET', '/_shell/health', undefined, false)).text)).toEqual({
      instance: 'shell-test-instance',
    });
    const page = await call(port, 'GET', `/app?token=${TOKEN}`, undefined, false);
    expect(page.status).toBe(200);
    // The panel is served like the workspace: its one inline script allowed by its hash, nothing else (T4.24).
    expect(page.headers['content-security-policy']).toBe(PANEL_CSP);
    expect(PANEL_CSP).toMatch(/^default-src 'none'; script-src 'sha256-[^']+'; /);
    expect(PANEL_CSP).toContain("connect-src 'self'");
    expect(PANEL_CSP).not.toContain("script-src 'unsafe-inline'");
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['cache-control']).toBe('no-store');
    const inline = /<script>([\s\S]*?)<\/script>/i.exec(page.text)?.[1] ?? '';
    expect(PANEL_CSP).toContain("'sha256-" + createHash('sha256').update(inline, 'utf8').digest('base64') + "'");
    const workspace = await call(port, 'GET', `/workspace?token=${TOKEN}`, undefined, false);
    expect(workspace.status).toBe(200);
    expect(workspace.headers['content-security-policy']).toBe(WORKSPACE_CSP);
    expect(WORKSPACE_CSP).toMatch(/script-src 'sha256-[^']+'/);
    expect(WORKSPACE_CSP).not.toContain("script-src 'unsafe-inline'");
    expect(workspace.headers['referrer-policy']).toBe('no-referrer');
    expect(workspace.text).toContain('id="root"');
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
});

describe('menu bar panel and its admin routes (T4.14)', () => {
  // The panel side (nothing paired before « Rejoindre ») is covered in packages/desktop-ui/test/panel.test.tsx.
  it('previews an invitation without pairing, behind the token', async () => {
    const { createInvite, encodeInvite } = await import('@drop/protocol');
    const julie = await generateIdentity('Julie');
    const sent: unknown[] = [];
    const engine = new NodeEngine({
      identity: await generateIdentity('Natha'),
      ownerKind: 'human',
      store: new MemoryStore(),
      capabilities: [],
      transport: {
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve('sent');
        },
      },
    });
    api = await startLocalApi({
      engine,
      token: TOKEN,
      port: 0,
      relayUrl: 'ws://x/v1',
      refreshCatalogs: () => Promise.resolve(),
    });
    const code = encodeInvite(createInvite(julie, 'ws://x/v1'));
    const form = (value: string) => new URLSearchParams({ code: value }).toString();
    const preview = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: api?.port,
          path: '/ui/pair/preview',
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${String(api?.port)}`,
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
        (res) => {
          let text = '';
          res.on('data', (chunk: Buffer) => {
            text += chunk.toString();
          });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, text });
          });
        },
      );
      req.on('error', reject);
      req.end(form(code));
    });
    expect(preview.status).toBe(200);
    expect(JSON.parse(preview.text)).toEqual({ displayName: 'Julie' });
    expect(sent).toHaveLength(0);
    expect((await call(api.port, 'POST', '/ui/pair/preview', undefined, false)).status).toBe(401);
    expect((await call(api.port, 'POST', '/ui/pair/preview', { code: 'not-a-code' })).status).toBe(400);
  });
});

describe('workspace window — local management UI (Human V2)', () => {
  it('uses real React/shadcn-Radix components without external scripts or Tauri IPC', () => {
    const html = renderWorkspace();
    expect(html).toContain('<div id="root">');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).not.toContain('window.__TAURI_INTERNALS__');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('<script src=');
    const script = /<script>([\s\S]*?)<\/script>/i.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
  });
});

describe('menu bar panel page (T4.24)', () => {
  it('embeds the compiled React panel, with no external resource and no Tauri IPC', () => {
    const html = renderPanel();
    expect(html).toContain('<html lang="fr" class="drop-panel">');
    expect(html).toContain('<div id="root">');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('window.__TAURI_INTERNALS__');
    expect(html).not.toContain('fonts.googleapis.com');
    const script = /<script>([\s\S]*?)<\/script>/i.exec(html)?.[1];
    expect(() => new Script(script ?? '')).not.toThrow();
    // The panel and the workspace are two bundles under two hashes.
    expect(PANEL_CSP).not.toBe(WORKSPACE_CSP);
  });
});
