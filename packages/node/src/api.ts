import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { AGENTS, type AgentKind } from '@drop/capabilities';
import {
  DEFAULT_JOIN_PAGE,
  DropError,
  isDropError,
  joinLink,
  RequesterAgentSchema,
  type ErrorCode,
} from '@drop/protocol';
import { AmbiguousCapabilityError, UnknownCapabilityError, type NodeEngine } from './engine.ts';
import { LinkRequestSchema, type LinkRequest } from './home.ts';
import { InternetSettingsSchema, type InternetSettings } from './iroh.ts';
import { PANEL_CSP, renderPanel, renderWorkspace, WORKSPACE_CSP } from './workspace.ts';
import { routeFacts, routeQuestion, takesQuestion } from './route.ts';
import { teamAgent } from './a2a-inbound.ts';
import { escapeHtml, renderInbox, renderPage } from './ui.ts';

export interface LocalApiOptions {
  engine: NodeEngine;
  token: string;
  port: number;
  /** Fetches fresh catalogs when the cache is older than 60 s; resolves when answers arrived or timed out. */
  refreshCatalogs: () => Promise<void>;
  /** The relay this node's invites name; read at each invite, since joining a first team may change it (T4.23). */
  relayUrl: string | (() => string);
  /** The page join links open (T4.23); drop.memolabs.dev/join by default. */
  joinPage?: string;
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
  /** Where a request that failed unexpectedly is reported: a stable code and the path, never a body or a token. */
  log?: (entry: ApiLogEntry) => void;
}

export interface ApiLogEntry {
  event: string;
  code: string;
  /** The error's class name, e.g. TypeError: never its message, which may quote a request. */
  reason?: string;
  path?: string;
}

/** A page of drop's own HTML, never cached nor sent along as a referrer, under the given content security policy. */
function sendHtml(res: ServerResponse, csp: string, body: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': csp,
  });
  res.end(body);
}

function signInPage(res: ServerResponse, status: number, message: string): void {
  sendHtml(
    res,
    "default-src 'none'",
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>drop</title><body style="font:16px system-ui;margin:3em"><p>${escapeHtml(message)}</p></body></html>`,
    status,
  );
}

/** What the panel can do beyond deciding: see and share tools, install drop in agents, create a team. */
export interface AdminHooks {
  status(): {
    displayName: string;
    nodeId: string;
    relayConnected: boolean;
    lan?: string;
    internet?: string;
    policy?: unknown;
  };
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
      agent: AgentKind;
      fingerprint: string;
      action: 'connect' | 'disconnect';
    }[],
  ): unknown;
  /** Project-level configurations (T4.5): known or added folders only. */
  projects?(): unknown;
  addProject?(dir: string): unknown;
  removeProject?(dir: string): boolean;
  createTeam(name: string): unknown;
  /** Internet by iroh (T4.2b): the owner's choice and the program's state. */
  internet?(): unknown;
  setInternet?(settings: InternetSettings): unknown;
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
        agent: z.enum(AGENTS),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        action: z.enum(['connect', 'disconnect']),
      }),
    )
    .min(1)
    .max(AGENTS.length),
});

const ProjectBody = z.object({ dir: z.string().min(1).max(1024) });

export interface LocalApi {
  port: number;
  server: Server;
  close(): Promise<void>;
}

const DropRequestBody = z.object({
  capabilityId: z.string(),
  /** Who should answer, when several peers publish this id (T4.17, D80). */
  ownerNodeId: z.string().max(64).optional(),
  input: z.unknown(),
  purpose: z.string().min(1).max(140),
  agent: RequesterAgentSchema.default('other'),
});

const AskBody = z.object({
  question: z.string().trim().min(10).max(300),
  purpose: z.string().trim().min(1).max(140).optional(),
  agent: RequesterAgentSchema.default('other'),
});

/**
 * A notification's « Refuser » (T4.30): the drop's identifier and nothing else. Strict, so that a body naming any
 * decision, « allow_once » included, is refused rather than read as a refusal.
 */
const NotificationDenyBody = z
  .object({ dropId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) })
  .strict();

const MAX_BODY_BYTES = 128 * 1024;
/** A hand-written answer carries up to 160 KiB of JSON (T4.3): only its route reads more. */
const MAX_ANSWER_BODY_BYTES = 200 * 1024;

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

/** A request body that cannot be read: too large, or not JSON. Answered 413 or 400 with its code, never 500. */
class BodyError extends DropError {}

async function readBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > limit) throw new BodyError('E_TOO_LARGE', 'Requête trop volumineuse.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const body = await readBody(req);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new BodyError('E_SCHEMA', 'Requête illisible : JSON invalide.');
  }
}

/** The invite refusals the app explains (T4.23), each with its stable code; anything else is E_INVITE. */
const INVITE_ERRORS: Record<string, string> = {
  E_INVITE: 'Ce code d’invitation est illisible. Copie le lien en entier, ou demande un nouveau lien.',
  E_INVITE_EXPIRED: 'Cette invitation a expiré : une invitation vaut 24 heures. Demande un nouveau lien.',
  E_INVITE_SIG: 'Cette invitation a été modifiée depuis son envoi. Demande un nouveau lien à la personne.',
  E_INVITE_USED: 'Cette invitation a déjà servi. Demande un nouveau lien.',
  E_INVITE_RELAY: 'Le relais de cette invitation n’est pas autorisé sur cet ordinateur.',
  E_LOCKED:
    'Une autre opération modifie la configuration de drop. Réessaie dans un instant : l’invitation reste valable.',
  E_CONFLICT: 'La configuration de drop a changé pendant que tu rejoignais. Réessaie : l’invitation reste valable.',
};

function inviteError(res: ServerResponse, error: unknown): void {
  const code: ErrorCode =
    isDropError(error) && error.code in INVITE_ERRORS ? error.code : ('E_INVITE' satisfies ErrorCode);
  json(res, 400, { error: code, code, message: INVITE_ERRORS[code] });
}

/** The invite as the panel sends it (form `code=`) or the workspace does (JSON `{ code }`): a code or a link. */
async function readInviteInput(req: IncomingMessage): Promise<string> {
  const body = await readBody(req, 8 * 1024);
  if ((req.headers['content-type'] ?? '').startsWith('application/json')) {
    try {
      const parsed = z.object({ code: z.string().max(8 * 1024) }).safeParse(JSON.parse(body));
      return parsed.success ? parsed.data.code : '';
    } catch {
      return '';
    }
  }
  return new URLSearchParams(body).get('code') ?? '';
}

/** The answer to a request the engine refused before sending it: too many active drops, or an envelope too large. */
function dropErrorStatus(
  error: unknown,
): { status: number; body: { error: 'E_RATE' | 'E_TOO_LARGE'; message: string } } | undefined {
  if (isDropError(error, 'E_RATE'))
    return { status: 429, body: { error: 'E_RATE', message: 'Trop de demandes actives.' } };
  if (isDropError(error, 'E_TOO_LARGE'))
    return { status: 413, body: { error: 'E_TOO_LARGE', message: 'Enveloppe trop grande.' } };
  return undefined;
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
  const log =
    options.log ??
    ((entry: ApiLogEntry) => process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`));

  // Long polls on /drops/:id share one engine listener: one each would pass the emitter's limit of ten.
  const waiters = new Set<() => void>();
  const wakeWaiters = (): void => {
    for (const waiter of [...waiters]) waiter();
  };
  const waitUntil = (ready: () => boolean, ms: number, req: IncomingMessage): Promise<void> =>
    new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        req.off('close', done);
        waiters.delete(check);
        if (waiters.size === 0) engine.off('change', wakeWaiters);
        resolve();
      };
      const check = (): void => {
        if (ready()) done();
      };
      const timer = setTimeout(done, ms);
      if (waiters.size === 0) engine.on('change', wakeWaiters);
      waiters.add(check);
      req.on('close', done);
    });

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
        capabilities: engine.catalog().map(({ card, ownerNodeId, ownerName, online }) => ({
          capability_id: card.id,
          title: card.title,
          owner: ownerName,
          owner_node_id: ownerNodeId,
          online,
          input_schema: card.inputSchema,
          receives: card.receives,
        })),
      });
      return;
    }
    if (method === 'POST' && path === '/drops') {
      const parsed = DropRequestBody.safeParse(await readJson(req));
      if (!parsed.success) {
        json(res, 400, { error: 'E_SCHEMA', message: 'invalid drop request' });
        return;
      }
      // Refresh when this capability, or this owner's, is not known yet: never fall back on the catalogs at hand.
      const { capabilityId, ownerNodeId } = parsed.data;
      if (
        !engine
          .catalog()
          .some(
            (entry) =>
              entry.card.id === capabilityId && (ownerNodeId === undefined || entry.ownerNodeId === ownerNodeId),
          ) ||
        (ownerNodeId === undefined && !engine.catalogIsFresh())
      )
        await options.refreshCatalogs();
      try {
        const drop = await engine.requestDrop(parsed.data);
        // Sent, but the relay never answered: said as such, neither refused nor received (T4.39).
        json(res, 201, {
          dropId: drop.dropId,
          owner: drop.ownerName,
          title: drop.title,
          ...(drop.delivery ? { delivery: drop.delivery } : {}),
        });
      } catch (error) {
        const refused = dropErrorStatus(error);
        if (refused) {
          json(res, refused.status, refused.body);
          return;
        }
        if (error instanceof AmbiguousCapabilityError) {
          json(res, 409, {
            error: 'E_AMBIGUOUS_CAPABILITY',
            message: 'Plusieurs pairs publient cette capacité : précise ownerNodeId.',
            owners: error.owners.map((owner) => ({ owner_node_id: owner.ownerNodeId, owner: owner.ownerName })),
          });
          return;
        }
        if (!(error instanceof UnknownCapabilityError)) throw error;
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
      const parsed = AskBody.safeParse(await readJson(req));
      if (!parsed.success) {
        json(res, 400, { error: 'E_SCHEMA', message: 'a question of 10 to 300 characters is needed' });
        return;
      }
      if (!engine.catalogIsFresh()) await options.refreshCatalogs();
      const catalog = engine.catalog();
      // A published fact that matches goes first and alone; otherwise the usual routing (T4.4).
      const facts = routeFacts(catalog, parsed.data.question);
      const routes = facts.length > 0 ? facts : routeQuestion(catalog, parsed.data.question);
      const asked = [];
      for (const route of routes) {
        try {
          const drop = await engine.requestDrop({
            capabilityId: route.capabilityId,
            ownerNodeId: route.ownerNodeId,
            input: route.fact ? {} : { question: parsed.data.question },
            purpose: parsed.data.purpose ?? 'Pas de raison précisée.',
            agent: parsed.data.agent,
          });
          asked.push({ dropId: drop.dropId, ...route, ...(drop.delivery ? { delivery: drop.delivery } : {}) });
        } catch (error) {
          const refused = dropErrorStatus(error);
          if (refused) {
            json(res, refused.status, { ...refused.body, asked });
            return;
          }
          // Routes always name their owner; should one still be ambiguous, the others are asked all the same.
          if (error instanceof AmbiguousCapabilityError) continue;
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
      if (waitSeconds > 0 && !settled()) await waitUntil(settled, waitSeconds * 1000, req);
      json(res, 200, view());
      return;
    }

    // ---- consent UI and CLI decision routes ----
    if (method === 'GET' && path === '/') {
      sendHtml(
        res,
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'",
        renderPage(''),
      );
      return;
    }
    if (method === 'GET' && path === '/app') {
      sendHtml(res, PANEL_CSP, renderPanel());
      return;
    }
    if (method === 'GET' && path === '/workspace') {
      sendHtml(res, WORKSPACE_CSP, renderWorkspace());
      return;
    }
    if (method === 'GET' && path === '/ui/inbox') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderInbox(engine.pending(), now()));
      return;
    }
    if (method === 'GET' && path === '/ui/pending') {
      // Who a hand-written answer reaches first (T4.3): the executor's name from the local peer store, not from the card.
      const peers = engine.peers();
      const pending = engine.pending().map((item) => {
        const executor = peers.find((peer) => peer.nodeId === item.executor);
        return executor ? { ...item, executorName: executor.displayName } : item;
      });
      json(res, 200, { pending });
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
        if (method === 'GET' && path === '/ui/admin/projects' && admin.projects) {
          json(res, 200, { projects: admin.projects() });
          return;
        }
        if (
          method === 'POST' &&
          (path === '/ui/admin/projects' || path === '/ui/admin/projects/remove') &&
          admin.addProject &&
          admin.removeProject
        ) {
          const parsed = ProjectBody.safeParse(body);
          if (!parsed.success) {
            json(res, 400, { error: 'E_SCHEMA', message: 'Indique le chemin complet du dossier.' });
            return;
          }
          if (path === '/ui/admin/projects/remove') {
            const removed = admin.removeProject(parsed.data.dir);
            json(res, removed ? 200 : 404, { ok: removed });
            return;
          }
          try {
            json(res, 200, { ok: true, dir: admin.addProject(parsed.data.dir) });
          } catch (error) {
            const code = error instanceof Error && error.message.startsWith('E_') ? error.message : 'E_PROJECT_PATH';
            json(res, 400, {
              error: code,
              message:
                code === 'E_PROJECT_LIMIT'
                  ? '50 dossiers au plus.'
                  : 'Dossier introuvable : indique le chemin complet d’un dossier de projet (ni la racine, ni ton dossier personnel).',
            });
          }
          return;
        }
        if (path === '/ui/admin/internet' && admin.internet && admin.setInternet) {
          if (method === 'GET') {
            json(res, 200, admin.internet());
            return;
          }
          if (method !== 'POST') {
            // Its body is never read: the connection closes, so a client cannot reuse it mid-body.
            res.setHeader('Allow', 'GET, POST');
            res.setHeader('Connection', 'close');
            json(res, 405, { error: 'E_METHOD' });
            return;
          }
          const parsed = InternetSettingsSchema.safeParse(body);
          if (!parsed.success) {
            json(res, 400, {
              error: 'E_SCHEMA',
              message:
                'Adresse de relais invalide : elle doit commencer par https:// (http seulement sur ce Mac, pour un essai).',
            });
            return;
          }
          json(res, 200, await admin.setInternet(parsed.data));
          return;
        }
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
          json(res, 200, { results: await admin.onboardingApply(parsed.data.selections) });
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
      const form = new URLSearchParams(await readBody(req));
      const dropId = form.get('dropId') ?? '';
      const decision = form.get('decision') ?? '';
      let done = false;
      if (path === '/ui/decide' && (decision === 'allow_once' || decision === 'deny' || decision === 'not_now')) {
        const outcome = await engine.decideApproval(dropId, decision);
        if (!outcome.ok) {
          json(res, 404, { ok: false, code: outcome.code });
          return;
        }
        done = true;
      }
      if (path === '/ui/review' && (decision === 'send' || decision === 'discard')) {
        done = await engine.review(dropId, decision, form.getAll('redact'));
      }
      json(res, done ? 200 : 404, { ok: done });
      return;
    }
    // A notification's « Refuser » (T4.30): a refusal only, whatever else the body carries, through the card's own
    // decision path. A request that no longer waits is ignored with its stable code; nothing is sent then.
    if (method === 'POST' && path === '/ui/notification/deny') {
      let dropId: string | undefined;
      try {
        const parsed = NotificationDenyBody.safeParse(JSON.parse(await readBody(req, 1024)));
        if (parsed.success) dropId = parsed.data.dropId;
      } catch (error) {
        if (isDropError(error, 'E_TOO_LARGE')) {
          log({ event: 'notification_deny', code: 'E_TOO_LARGE', path });
          json(res, 413, { ok: false, code: 'E_TOO_LARGE' });
          return;
        }
        dropId = undefined;
      }
      if (dropId === undefined) {
        log({ event: 'notification_deny', code: 'E_SCHEMA', path });
        json(res, 400, { ok: false, code: 'E_SCHEMA' });
        return;
      }
      const outcome = await engine.decideApproval(dropId, 'deny');
      if (!outcome.ok) {
        log({ event: 'notification_deny', code: outcome.code, path });
        json(res, 409, { ok: false, code: outcome.code });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }
    // The owner answers by hand (T4.3): checked by the engine before anything leaves, refused with a stable code.
    if (method === 'POST' && path === '/ui/answer') {
      let raw: string;
      try {
        raw = await readBody(req, MAX_ANSWER_BODY_BYTES);
      } catch {
        json(res, 413, { ok: false, code: 'E_TOO_LARGE', message: 'Réponse trop volumineuse pour être envoyée.' });
        return;
      }
      try {
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new DropError('E_SCHEMA', 'Réponse illisible : recharge le panneau et réessaie.');
        }
        const { dropId, ...answer } =
          typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
        const done = await engine.answer(typeof dropId === 'string' ? dropId : '', answer);
        json(res, done ? 200 : 404, { ok: done });
      } catch (error) {
        if (!isDropError(error)) throw error;
        json(res, 400, { ok: false, code: error.code, message: error.message });
      }
      return;
    }
    // « Ce que je publie » (T4.4): list, publish, edit and retire facts; refusals carry a stable code.
    if (path === '/ui/facts' || path.startsWith('/ui/facts/')) {
      if (method === 'GET' && path === '/ui/facts') {
        json(res, 200, {
          facts: engine.facts(),
          peers: engine.peers().map((peer) => ({ nodeId: peer.nodeId, displayName: peer.displayName })),
        });
        return;
      }
      const target = /^\/ui\/facts\/([0-9a-f-]{36})(\/retire)?$/.exec(path);
      if (method !== 'POST' || (path !== '/ui/facts' && !target)) {
        json(res, 404, { error: 'not_found' });
        return;
      }
      try {
        if (target?.[2]) {
          const done = await engine.retireFact(target[1] ?? '');
          json(res, done ? 200 : 404, { ok: done });
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          throw new DropError('E_SCHEMA', 'Fait illisible : recharge le panneau et réessaie.');
        }
        const fact = target ? await engine.editFact(target[1] ?? '', body) : await engine.publishFact(body);
        json(res, fact ? 200 : 404, fact ? { ok: true, fact } : { ok: false });
      } catch (error) {
        if (!isDropError(error)) throw error;
        json(res, 400, { ok: false, code: error.code, message: error.message });
      }
      return;
    }
    // One link to send (T4.23): `link` opens the join page, the invite in its fragment; `code` is the same invite.
    if (method === 'POST' && path === '/ui/invite') {
      const relayUrl = typeof options.relayUrl === 'function' ? options.relayUrl() : options.relayUrl;
      const code = await engine.invite(relayUrl);
      json(res, 200, { code, link: joinLink(code, options.joinPage ?? DEFAULT_JOIN_PAGE), validHours: 24 });
      return;
    }
    // Shows who invites before anything is sent: the panel asks « Rejoindre » first (T4.14). Accepts a code or a link.
    if (method === 'POST' && path === '/ui/pair/preview') {
      try {
        const { invite, relay } = await engine.previewInvite(await readInviteInput(req));
        json(res, 200, {
          displayName: invite.displayName,
          ...(invite.team ? { team: invite.team.name } : {}),
          relayHost: new URL(invite.relayUrl).host,
          relay,
          expiresAt: invite.expiresAt,
        });
      } catch (error) {
        inviteError(res, error);
      }
      return;
    }
    // « Rejoindre » (T4.14, T4.23): a node that joined nobody yet moves to the invite's relay, then pairs. Next comes
    // « Connecter mes agents » (T3.3).
    if (method === 'POST' && path === '/ui/pair') {
      try {
        const { nodeId, relay } = await engine.join(await readInviteInput(req));
        json(res, 200, { nodeId, relay, next: 'connect_agents' });
      } catch (error) {
        inviteError(res, error);
      }
      return;
    }
    json(res, 404, { error: 'not_found' });
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof BodyError && !res.headersSent) {
        // The rest of a body too large is never read: the connection closes rather than serve another request.
        if (error.code === 'E_TOO_LARGE') res.setHeader('Connection', 'close');
        json(res, error.code === 'E_TOO_LARGE' ? 413 : 400, { error: error.code, message: error.message });
        return;
      }
      // The path only: the query may carry the local token, the body anything at all.
      log({
        event: 'api_request_failed',
        code: isDropError(error) ? error.code : 'E_INTERNAL',
        reason: error instanceof Error ? error.name : typeof error,
        path: (req.url ?? '/').split('?')[0]?.slice(0, 120) ?? '/',
      });
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
