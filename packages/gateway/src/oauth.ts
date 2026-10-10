import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/**
 * OAuth 2.1 for the consumer connector (T2.13, D31), the subset the MCP authorization spec asks for
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization, read 2026-10-08): dynamic client
 * registration (RFC 7591), authorization code with PKCE S256 only, resource indicators (RFC 8707) bound to this MCP
 * server, refresh tokens rotated on use. The user does not log in with a password: they approve the link in their drop
 * app, and their node's signed `link_grant` is what binds the session to them. Tokens are stored as hashes only.
 */
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
export const SESSION_TTL_MS = 10 * 60_000;
export const CODE_TTL_MS = 60_000;
/**
 * Registration is open to anyone (D71): a client that never obtained a token is forgotten after a day, and beyond the
 * limits below the oldest pending client or session makes room. Evicting rather than refusing keeps a flood from
 * locking real users out; it would have to outpace a real sign-in, which takes a minute.
 */
export const UNUSED_CLIENT_TTL_MS = 24 * 60 * 60_000;
export const MAX_PENDING_CLIENTS = 1000;
export const MAX_SESSIONS = 1000;

export class OAuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const RedirectUriSchema = z.url().refine((uri) => {
  const url = new URL(uri);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  return !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && local));
}, 'redirect URIs must be https, or http on localhost, without fragment');

export const RegistrationSchema = z.object({
  redirect_uris: z.array(RedirectUriSchema).min(1).max(10),
  client_name: z.string().trim().min(1).max(80).optional(),
  token_endpoint_auth_method: z.literal('none').optional(),
});

export const ClientSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  redirectUris: z.array(z.string()),
  createdAt: z.number(),
  /** When a token was first issued to this client; until then it counts against MAX_PENDING_CLIENTS. */
  usedAt: z.number().optional(),
});
export type Client = z.infer<typeof ClientSchema>;

export interface Session {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
  resource: string;
  createdAt: number;
  /** Set when the user's node sent a link_grant for this session. */
  nodeId?: string | undefined;
}

export const TokenRecordSchema = z.object({
  nodeId: z.string(),
  clientId: z.string(),
  kind: z.enum(['access', 'refresh']),
  expiresAt: z.number(),
});
export type TokenRecord = z.infer<typeof TokenRecordSchema>;

export const OAuthStateSchema = z.object({
  clients: z.record(z.string(), ClientSchema),
  /** sha256(token) → record. */
  tokens: z.record(z.string(), TokenRecordSchema),
});
export type OAuthState = z.infer<typeof OAuthStateSchema>;

/** What the user saw in their app before approving, repeated by their node's `link_grant`. */
export interface LinkClaim {
  clientId: string;
  clientName: string;
  redirectHost: string;
}

/** The domain an authorization code goes back to: what the app shows next to the assistant's name. */
export function redirectHost(redirectUri: string): string {
  return new URL(redirectUri).host;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const random = (bytes = 24): string => randomBytes(bytes).toString('base64url');

/** S256: base64url(sha256(verifier)) must equal the challenge (RFC 7636). */
export function pkceMatches(verifier: string, challenge: string): boolean {
  return (
    /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) &&
    createHash('sha256').update(verifier).digest('base64url') === challenge
  );
}

export class OAuthServer {
  readonly resource: string;
  private readonly state: OAuthState;
  private readonly sessions = new Map<string, Session>();
  private readonly codes = new Map<string, { sessionId: string; expiresAt: number }>();
  private readonly now: () => number;
  private readonly persist: (state: OAuthState) => void;
  private readonly maxPendingClients: number;
  private readonly maxSessions: number;

  constructor(options: {
    resource: string;
    state?: OAuthState;
    now?: () => number;
    persist?: (state: OAuthState) => void;
    maxPendingClients?: number;
    maxSessions?: number;
  }) {
    this.resource = options.resource;
    this.state = options.state ?? { clients: {}, tokens: {} };
    this.now = options.now ?? Date.now;
    this.persist = options.persist ?? (() => undefined);
    this.maxPendingClients = options.maxPendingClients ?? MAX_PENDING_CLIENTS;
    this.maxSessions = options.maxSessions ?? MAX_SESSIONS;
  }

  register(raw: unknown): Record<string, unknown> {
    const parsed = RegistrationSchema.safeParse(raw);
    if (!parsed.success)
      throw new OAuthError('invalid_client_metadata', parsed.error.issues[0]?.message ?? 'invalid metadata');
    this.sweep();
    const pending = Object.values(this.state.clients)
      .filter((client) => client.usedAt === undefined)
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const evicted of pending.slice(0, Math.max(0, pending.length - this.maxPendingClients + 1)))
      Reflect.deleteProperty(this.state.clients, evicted.clientId);
    const client: Client = {
      clientId: random(18),
      clientName: parsed.data.client_name ?? 'Un assistant',
      redirectUris: parsed.data.redirect_uris,
      createdAt: this.now(),
    };
    this.state.clients[client.clientId] = client;
    this.persist(this.state);
    return {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  client(clientId: string): Client | undefined {
    return this.state.clients[clientId];
  }

  /** Validates an authorization request and opens a session waiting for the user's approval in their app. */
  authorize(params: URLSearchParams): Session {
    const client = this.client(params.get('client_id') ?? '');
    if (!client) throw new OAuthError('invalid_client', 'unknown client');
    const redirectUri = params.get('redirect_uri') ?? '';
    // Exact match against the registered URIs: never redirect anywhere else (open redirection).
    if (!client.redirectUris.includes(redirectUri))
      throw new OAuthError('invalid_request', 'redirect_uri is not registered');
    if (params.get('response_type') !== 'code')
      throw new OAuthError('unsupported_response_type', 'only code is supported');
    if (
      params.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') ?? '')
    )
      throw new OAuthError('invalid_request', 'PKCE with S256 is required');
    const resource = params.get('resource') ?? this.resource;
    if (resource.replace(/\/$/, '') !== this.resource) throw new OAuthError('invalid_target', 'unknown resource');
    this.sweep();
    // A Map keeps insertion order: the first keys are the oldest sessions.
    for (const id of [...this.sessions.keys()].slice(0, Math.max(0, this.sessions.size - this.maxSessions + 1)))
      this.sessions.delete(id);
    const session: Session = {
      id: random(24),
      clientId: client.clientId,
      redirectUri,
      codeChallenge: params.get('code_challenge') ?? '',
      state: params.get('state') ?? undefined,
      resource: this.resource,
      createdAt: this.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  session(id: string): Session | undefined {
    const session = this.sessions.get(id);
    return session && session.createdAt + SESSION_TTL_MS > this.now() ? session : undefined;
  }

  /**
   * The user's node approved the link (its signed link_grant): the session now belongs to that node, but only if the
   * assistant, its client and the return domain the user saw are the session's own. A drop:// link is easy to forge;
   * this is what keeps a session returning to someone else's server from passing for Claude or ChatGPT.
   */
  approve(sessionId: string, nodeId: string, claim: LinkClaim): boolean {
    const session = this.session(sessionId);
    if (!session || session.nodeId) return false;
    const client = this.client(session.clientId);
    if (
      claim.clientId !== session.clientId ||
      claim.clientName !== client?.clientName ||
      claim.redirectHost !== redirectHost(session.redirectUri)
    )
      return false;
    session.nodeId = nodeId;
    return true;
  }

  /** Once approved: a one-time code and the exact redirect back to the assistant. */
  complete(sessionId: string): string {
    const session = this.session(sessionId);
    if (!session?.nodeId) throw new OAuthError('access_denied', 'not approved yet');
    this.sessions.delete(sessionId);
    const code = random(24);
    this.codes.set(code, { sessionId: session.id, expiresAt: this.now() + CODE_TTL_MS });
    this.completed.set(session.id, session);
    const target = new URL(session.redirectUri);
    target.searchParams.set('code', code);
    if (session.state !== undefined) target.searchParams.set('state', session.state);
    return target.toString();
  }

  private readonly completed = new Map<string, Session>();

  token(form: URLSearchParams): Record<string, unknown> {
    const grant = form.get('grant_type');
    if (grant === 'authorization_code') {
      const entry = this.codes.get(form.get('code') ?? '');
      this.codes.delete(form.get('code') ?? '');
      const session = entry ? this.completed.get(entry.sessionId) : undefined;
      if (!entry || !session?.nodeId || entry.expiresAt <= this.now())
        throw new OAuthError('invalid_grant', 'invalid or expired code');
      this.completed.delete(entry.sessionId);
      if (form.get('client_id') !== session.clientId)
        throw new OAuthError('invalid_grant', 'code issued to another client');
      if (form.get('redirect_uri') !== null && form.get('redirect_uri') !== session.redirectUri)
        throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
      if (!pkceMatches(form.get('code_verifier') ?? '', session.codeChallenge))
        throw new OAuthError('invalid_grant', 'PKCE verification failed');
      const resource = form.get('resource');
      if (resource !== null && resource.replace(/\/$/, '') !== this.resource)
        throw new OAuthError('invalid_target', 'unknown resource');
      return this.issue(session.nodeId, session.clientId);
    }
    if (grant === 'refresh_token') {
      const key = sha256(form.get('refresh_token') ?? '');
      const record = this.state.tokens[key];
      if (record?.kind !== 'refresh' || record.expiresAt <= this.now() || record.clientId !== form.get('client_id'))
        throw new OAuthError('invalid_grant', 'invalid refresh token');
      // Rotation: a refresh token works once (OAuth 2.1 §4.3.1, required for public clients).
      Reflect.deleteProperty(this.state.tokens, key);
      return this.issue(record.nodeId, record.clientId);
    }
    throw new OAuthError('unsupported_grant_type', 'unsupported grant_type');
  }

  /** True when some live token speaks for this node: only such nodes may answer the gateway. */
  hasNode(nodeId: string): boolean {
    const now = this.now();
    return Object.values(this.state.tokens).some((record) => record.nodeId === nodeId && record.expiresAt > now);
  }

  /** The node an access token speaks for, or undefined when it is unknown or expired. */
  verify(accessToken: string): TokenRecord | undefined {
    const record = this.state.tokens[sha256(accessToken)];
    return record?.kind === 'access' && record.expiresAt > this.now() ? record : undefined;
  }

  private issue(nodeId: string, clientId: string): Record<string, unknown> {
    const client = this.state.clients[clientId];
    if (client && client.usedAt === undefined) client.usedAt = this.now();
    const access = random(32);
    const refresh = random(32);
    this.state.tokens[sha256(access)] = { nodeId, clientId, kind: 'access', expiresAt: this.now() + ACCESS_TTL_MS };
    this.state.tokens[sha256(refresh)] = { nodeId, clientId, kind: 'refresh', expiresAt: this.now() + REFRESH_TTL_MS };
    this.sweep();
    this.persist(this.state);
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_MS / 1000,
      refresh_token: refresh,
    };
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, session] of this.sessions) if (session.createdAt + SESSION_TTL_MS <= now) this.sessions.delete(id);
    for (const [code, entry] of this.codes) if (entry.expiresAt <= now) this.codes.delete(code);
    for (const [key, record] of Object.entries(this.state.tokens))
      if (record.expiresAt <= now) Reflect.deleteProperty(this.state.tokens, key);
    for (const [id, client] of Object.entries(this.state.clients))
      if (client.usedAt === undefined && client.createdAt + UNUSED_CLIENT_TTL_MS <= now)
        Reflect.deleteProperty(this.state.clients, id);
  }
}
