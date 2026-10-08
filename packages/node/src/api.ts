import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import type { NodeEngine } from './engine.ts';
import { renderInbox, renderPage } from './ui.ts';

export interface LocalApiOptions {
  engine: NodeEngine;
  token: string;
  port: number;
  /** Fetches fresh catalogs when the cache is older than 60 s; resolves when answers arrived or timed out. */
  refreshCatalogs: () => Promise<void>;
  relayUrl: string;
  now?: () => number;
}

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

const MAX_BODY_BYTES = 128 * 1024;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sameToken(given: string, expected: string): boolean {
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
  const { engine } = options;
  const now = options.now ?? Date.now;
  let boundPort = options.port;

  const authorized = (req: IncomingMessage, url: URL): boolean => {
    const host = req.headers.host ?? '';
    if (host !== `127.0.0.1:${String(boundPort)}` && host !== `localhost:${String(boundPort)}`) return false;
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const query = url.searchParams.get('token') ?? '';
    return sameToken(bearer || query, options.token);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
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
      } catch {
        json(res, 404, { error: 'E_UNKNOWN_CAPABILITY', message: 'no such capability among paired peers' });
      }
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
    if (method === 'GET' && path === '/ui/inbox') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderInbox(engine.pending(), now()));
      return;
    }
    if (method === 'GET' && path === '/ui/pending') {
      json(res, 200, { pending: engine.pending() });
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
      json(res, 200, { code: engine.invite(options.relayUrl) });
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
