import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { decodeInvite, isDropError } from '@drop/protocol';
import type { NodeEngine } from './engine.ts';
import { LinkRequestSchema, type LinkRequest } from './home.ts';
import { renderPanel } from './panel.ts';
import { routeQuestion, takesQuestion } from './route.ts';
import { teamAgent } from './a2a-inbound.ts';
import { renderInbox, renderPage } from './ui.ts';

export interface LocalApiOptions {
  engine: NodeEngine;
  token: string;
  port: number;
  /** Fetches fresh catalogs when the cache is older than 60 s; resolves when answers arrived or timed out. */
  refreshCatalogs: () => Promise<void>;
  relayUrl: string;
  /** Opaque process instance marker used only by the Mac shell to recognize its own child. */
  shellInstance?: string;
  now?: () => number;
  /** Owner actions of the app's panel (T2.4), wired by the daemon; absent in tests of the drop routes. */
  admin?: AdminHooks;
  /**
   * Where the browser brings back an OAuth sign-in (T2.17): exchanges the code of a pending sign-in, by its single-use
   * state, and resolves to the server's host. The browser cannot send the local token: the state is the check.
   */
  oauthCallback?: (state: string, code: string) => Promise<string>;
}

function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${String(char.charCodeAt(0))};`);
}

function signInPage(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'",
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>drop</title><body style="font:16px system-ui;margin:3em"><p>${escapeText(message)}</p></body></html>`,
  );
}

/** What the panel can do beyond deciding: see and share tools, install drop in agents, create a team. */
export interface AdminHooks {
  status(): { displayName: string; nodeId: string; relayConnected: boolean };
  tools(): unknown;
  share(body: {
    agent: string;
    server: string;
    label?: string | undefined;
    tools?: string[] | undefined;
  }): Promise<unknown>;
  unshare(capabilityId: string): boolean;
  install(agent: string, remove: boolean): unknown;
  onboardingPreview?(): unknown;
  onboardingApply?(
    selections: {
      agent: 'claude_code' | 'claude_desktop' | 'cursor' | 'codex';
      fingerprint: string;
      action: 'connect' | 'disconnect';
    }[],
  ): unknown;
  createTeam(name: string): unknown;
  link(gateway: string, request: LinkRequest): Promise<unknown>;
  /** Starts drop's OAuth sign-in to a detected remote MCP server (T2.17): the URL to open, or `connected`. */
  connect(agent: string, server: string): Promise<unknown>;
  unlink(gateway: string, client: string): boolean;
}

const ShareBody = z.object({
  agent: z.string().min(1),
  server: z.string().min(1),
  label: z.string().min(2).max(60).optional(),
  tools: z.array(z.string().min(1)).max(30).optional(),
});

const OnboardingBody = z.object({
  selections: z
    .array(
      z.object({
        agent: z.enum(['claude_code', 'claude_desktop', 'cursor', 'codex']),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        action: z.enum(['connect', 'disconnect']),
      }),
    )
    .min(1)
    .max(4),
});

export interface LocalApi {
  port: number;
  server: Server;
  close(): Promise<void>;
}

const DropRequestBody = z.object({
  capabilityId: z.string(),
  input: z.unknown(),
  purpose: z.string().min(1).max(140),
  agent: z.enum(['claude_code', 'codex', 'cursor', 'other']).default('other'),
});

const AskBody = z.object({
  question: z.string().trim().min(10).max(300),
  purpose: z.string().trim().min(1).max(140).optional(),
  agent: z.enum(['claude_code', 'codex', 'cursor', 'other']).default('other'),
});

const MAX_BODY_BYTES = 128 * 1024;

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sameToken(given: string, expected: string): boolean {
  if (!given.trim() || !expected.trim()) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseForm(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

/**
 * Local HTTP API on 127.0.0.1 only. Every request needs the bearer token from DROP_HOME/local-token (or `?token=` for
 * the UI page and its SSE stream, which a browser cannot send headers for), and a Host header naming this exact port,
 * which blocks DNS rebinding.
 */
export function startLocalApi(options: LocalApiOptions): Promise<LocalApi> {
  if (!options.token.trim()) return Promise.reject(new Error('E_TOKEN local token empty'));
  const { engine } = options;
  const now = options.now ?? Date.now;
  let boundPort = options.port;

  const localHost = (req: IncomingMessage): boolean => {
    const host = req.headers.host ?? '';
    return host === `127.0.0.1:${String(boundPort)}` || host === `localhost:${String(boundPort)}`;
  };
  const team = teamAgent({ engine, refreshCatalogs: options.refreshCatalogs });

  const authorized = (req: IncomingMessage, url: URL): boolean => {
    if (!localHost(req)) return false;
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const query = url.searchParams.get('token') ?? '';
    return sameToken(bearer || query, options.token);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    // The A2A agent card (T2.14) is public to local clients, as A2A expects: it names the token the calls need.
    if ((req.method ?? 'GET') === 'GET' && url.pathname === '/.well-known/agent-card.json' && localHost(req)) {
      json(res, 200, team.cardJson(`http://127.0.0.1:${String(boundPort)}/a2a`));
      return;
    }
    if (
      (req.method ?? 'GET') === 'GET' &&
      url.pathname === '/_shell/health' &&
      options.shellInstance &&
      localHost(req)
    ) {
      json(res, 200, { instance: options.shellInstance });
      return;
    }
    if ((req.method ?? 'GET') === 'GET' && url.pathname === '/oauth/callback' && localHost(req)) {
      const state = url.searchParams.get('state') ?? '';
      const code = url.searchParams.get('code') ?? '';
      if (url.searchParams.has('error')) {
        signInPage(res, 400, 'Connexion refusée. Tu peux fermer cet onglet et réessayer depuis drop.');
        return;
      }
      if (!options.oauthCallback || !state || !code) {
        signInPage(res, 400, 'Lien de connexion incomplet.');
        return;
      }
      try {
        const host = await options.oauthCallback(state, code);
        signInPage(res, 200, `drop est connecté à ${host}. Tu peux fermer cet onglet et partager cet outil.`);
      } catch {
        signInPage(res, 400, 'Cette connexion a expiré ou a déjà servi. Recommence depuis drop.');
      }
      return;
    }
    if (!authorized(req, url)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    const method = req.method ?? 'GET';
    const path = url.pathname;

    if (method === 'GET' && path === '/peers') {
      json(res, 200, { peers: engine.peers() });
      return;
    }
    if (method === 'GET' && path === '/capabilities') {
      if (!engine.catalogIsFresh()) await options.refreshCatalogs();
      json(res, 200, {
        capabilities: engine.catalog().map(({ card, ownerName, online }) => ({
          capability_id: card.id,
          title: card.title,
          owner: ownerName,
          online,
          input_schema: card.inputSchema,
          receives: card.receives,
        })),
      });
      return;
    }
    if (method === 'POST' && path === '/drops') {
      const parsed = DropRequestBody.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) {
        json(res, 400, { error: 'E_SCHEMA', message: 'invalid drop request' });
        return;
      }
      if (!engine.catalog().some((entry) => entry.card.id === parsed.data.capabilityId))
        await options.refreshCatalogs();
      try {
        const drop = await engine.requestDrop(parsed.data);
        json(res, 201, { dropId: drop.dropId, owner: drop.ownerName, title: drop.title });
      } catch (error) {
        if (isDropError(error, 'E_RATE')) {
          json(res, 429, { error: 'E_RATE', message: 'Trop de demandes actives.' });
          return;
        }
        if (isDropError(error, 'E_TOO_LARGE')) {
          json(res, 413, { error: 'E_TOO_LARGE', message: 'Enveloppe trop grande.' });
          return;
        }
        json(res, 404, { error: 'E_UNKNOWN_CAPABILITY', message: 'no such capability among paired peers' });
      }
      return;
    }
    if (method === 'POST' && path === '/a2a') {
      await team.endpoint.handle(req, res, await readBody(req));
      return;
    }
    if (method === 'POST' && path === '/ask') {
      // « Demander à mon équipe » (T2.12, D32): routed by rules, then one drop per chosen capability.
      const parsed = AskBody.safeParse(JSON.parse(await readBody(req)));
      if (!parsed.success) {
        json(res, 400, { error: 'E_SCHEMA', message: 'a question of 10 to 300 characters is needed' });
        return;
      }
      if (!engine.catalogIsFresh()) await options.refreshCatalogs();
      const catalog = engine.catalog();
      const routes = routeQuestion(catalog, parsed.data.question);
      const asked = [];
      for (const route of routes) {
        try {
          const drop = await engine.requestDrop({
            capabilityId: route.capabilityId,
            input: { question: parsed.data.question },
            purpose: parsed.data.purpose ?? 'Pas de raison précisée.',
            agent: parsed.data.agent,
          });
          asked.push({ dropId: drop.dropId, ...route });
        } catch (error) {
          if (isDropError(error, 'E_RATE')) {
            json(res, 429, { error: 'E_RATE', message: 'Trop de demandes actives.', asked });
            return;
          }
          if (isDropError(error, 'E_TOO_LARGE')) {
            json(res, 413, { error: 'E_TOO_LARGE', message: 'Enveloppe trop grande.', asked });
            return;
          }
          throw error;
        }
      }
      const helpers = catalog
        .filter(takesQuestion)
        .map((entry) => ({ ownerName: entry.ownerName, title: entry.card.title, online: entry.online }));
      json(res, 200, { asked, helpers });
      return;
    }
    const dropMatch = /^\/drops\/([0-9a-f-]{36})$/.exec(path);
    if (method === 'GET' && dropMatch?.[1]) {
      const dropId = dropMatch[1];
      const waitSeconds = Math.min(50, Math.max(0, Number(url.searchParams.get('wait') ?? '0') || 0));
      const view = () => engine.drop(dropId);
      const settled = () => {
        const drop = view();
        return drop?.result !== undefined || drop?.error !== undefined;
      };
      if (!view()) {
        json(res, 404, { error: 'not_found' });
        return;
      }
      if (waitSeconds > 0 && !settled()) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, waitSeconds * 1000);
          function done(): void {
            clearTimeout(timer);
            engine.off('change', onChange);
            resolve();
          }
          function onChange(): void {
            if (settled()) done();
          }
          engine.on('change', onChange);
          req.on('close', done);
        });
      }
      json(res, 200, view());
      return;
    }

    // ---- consent UI and CLI decision routes ----
    if (method === 'GET' && path === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'",
      });
      res.end(renderPage(''));
      return;
    }
    if (method === 'GET' && path === '/app') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
      });
      res.end(renderPanel());
      return;
    }
    if (method === 'GET' && path === '/ui/inbox') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderInbox(engine.pending(), now()));
      return;
    }
    if (method === 'GET' && path === '/ui/pending') {
      json(res, 200, { pending: engine.pending() });
      return;
    }
    if (method === 'GET' && path === '/ui/outbound') {
      json(res, 200, { drops: engine.outboundDrops().slice(0, 50) });
      return;
    }
    if (path.startsWith('/ui/admin/')) {
      const admin = options.admin;
      if (!admin) {
        json(res, 404, { error: 'not_found' });
        return;
      }
      try {
        if (method === 'GET' && path === '/ui/admin/status') {
          json(res, 200, admin.status());
          return;
        }
        if (method === 'GET' && path === '/ui/admin/tools') {
          json(res, 200, admin.tools());
          return;
        }
        if (method === 'GET' && path === '/ui/admin/onboarding') {
          if (!admin.onboardingPreview) {
            json(res, 404, { error: 'not_found' });
            return;
          }
          json(res, 200, admin.onboardingPreview());
          return;
        }
        const body: unknown = method === 'POST' ? JSON.parse((await readBody(req)) || '{}') : {};
        if (method === 'POST' && path === '/ui/admin/onboarding') {
          if (!admin.onboardingApply) {
            json(res, 404, { error: 'not_found' });
            return;
          }
          const parsed = OnboardingBody.safeParse(body);
          if (!parsed.success) {
            json(res, 400, { error: 'E_SCHEMA' });
            return;
          }
          json(res, 200, { results: admin.onboardingApply(parsed.data.selections) });
          return;
        }
        if (method === 'POST' && path === '/ui/admin/share') {
          const parsed = ShareBody.safeParse(body);
          if (!parsed.success) {
            json(res, 400, { error: 'E_SCHEMA' });
            return;
          }
          json(res, 200, await admin.share(parsed.data));
          return;
        }
        const field = (name: string): string => {
          const value = (body as Record<string, unknown>)[name];
          return typeof value === 'string' ? value : '';
        };
        if (method === 'POST' && path === '/ui/admin/unshare') {
          json(res, 200, { ok: admin.unshare(field('capabilityId')) });
          return;
        }
        if (method === 'POST' && path === '/ui/admin/install') {
          if (admin.onboardingApply) {
            json(res, 409, { error: 'E_PREVIEW_REQUIRED' });
            return;
          }
          json(res, 200, admin.install(field('agent'), (body as { remove?: unknown }).remove === true));
          return;
        }
        if (method === 'POST' && path === '/ui/admin/connect') {
          json(res, 200, await admin.connect(field('agent'), field('server')));
          return;
        }
        if (method === 'POST' && path === '/ui/admin/link') {
          const request = LinkRequestSchema.safeParse({
            sessionId: field('session'),
            clientId: field('clientId'),
            clientName: field('client'),
            redirectHost: field('redirect'),
          });
          if (!request.success) {
            json(res, 400, { error: 'E_SCHEMA' });
            return;
          }
          json(res, 200, await admin.link(field('gateway'), request.data));
          return;
        }
        if (method === 'POST' && path === '/ui/admin/unlink') {
          json(res, 200, { ok: admin.unlink(field('gateway'), field('client')) });
          return;
        }
        if (method === 'POST' && path === '/ui/admin/team') {
          json(res, 200, admin.createTeam(field('name')));
          return;
        }
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        json(res, 400, {
          error: 'E_ADMIN',
          message: error instanceof Error ? error.message.slice(0, 300) : 'failed',
          ...(typeof code === 'string' && code.startsWith('E_SHARE_') ? { code } : {}),
        });
        return;
      }
      json(res, 404, { error: 'not_found' });
      return;
    }
    if (method === 'GET' && path === '/ui/team') {
      const team = engine.team();
      json(res, 200, { team: team?.team ?? null, members: engine.teamView() });
      return;
    }
    if (method === 'GET' && path === '/ui/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write('data: ready\n\n');
      const onChange = (): void => {
        res.write('data: change\n\n');
      };
      engine.on('change', onChange);
      req.on('close', () => engine.off('change', onChange));
      return;
    }
    if (method === 'POST' && (path === '/ui/decide' || path === '/ui/review')) {
      const form = parseForm(await readBody(req));
      const dropId = form.get('dropId') ?? '';
      const decision = form.get('decision') ?? '';
      let done = false;
      if (path === '/ui/decide' && (decision === 'allow_once' || decision === 'deny' || decision === 'not_now')) {
        done = await engine.decide(dropId, decision);
      }
      if (path === '/ui/review' && (decision === 'send' || decision === 'discard')) {
        done = await engine.review(dropId, decision, form.getAll('redact'));
      }
      json(res, done ? 200 : 404, { ok: done });
      return;
    }
    if (method === 'POST' && path === '/ui/invite') {
      json(res, 200, { code: await engine.invite(options.relayUrl) });
      return;
    }
    // Shows who invites before anything is sent: the panel asks « Rejoindre » first (T4.14).
    if (method === 'POST' && path === '/ui/pair/preview') {
      const code = parseForm(await readBody(req)).get('code') ?? '';
      try {
        const invite = decodeInvite(code);
        json(res, 200, { displayName: invite.displayName, ...(invite.team ? { team: invite.team.name } : {}) });
      } catch {
        json(res, 400, { error: 'E_INVITE' });
      }
      return;
    }
    if (method === 'POST' && path === '/ui/pair') {
      const code = parseForm(await readBody(req)).get('code') ?? '';
      try {
        json(res, 200, { nodeId: await engine.pair(code) });
      } catch {
        json(res, 400, { error: 'E_INVITE' });
      }
      return;
    }
    json(res, 404, { error: 'not_found' });
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'internal' });
      else res.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      const address = server.address();
      boundPort = typeof address === 'object' && address !== null ? address.port : options.port;
      resolve({
        port: boundPort,
        server,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}
