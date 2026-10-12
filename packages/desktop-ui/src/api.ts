/** A refusal of the local Node: its message, its stable code, the HTTP status and the route, for the details (T4.37). */
export class WorkspaceApiError extends Error {
  code: string | undefined;
  status: number | undefined;
  route: string | undefined;
  constructor(message: string, code?: string, status?: number, route?: string) {
    super(message);
    this.name = 'WorkspaceApiError';
    this.code = code;
    this.status = status;
    this.route = route;
  }
}

const STABLE_CODE = /^E_[A-Z0-9_]+$/;

/** The local bearer token, read from the page address at each call: the panel strips other parameters, never this one. */
export function localToken(): string {
  return new URLSearchParams(window.location.search).get('token') ?? '';
}

/** JSON body by default; a URLSearchParams body is sent form-encoded, as the decision and pairing routes expect. */
export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  // Fixed local URL paths only. Never fetch URLs supplied by peers.
  if (!path.startsWith('/ui/')) throw new Error('Chemin API non autorisé.');
  const token = localToken();
  if (!token) throw new WorkspaceApiError('Session locale indisponible. Rouvre Drop.');
  const form = body instanceof URLSearchParams;
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body === undefined
        ? {}
        : { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }),
    },
    ...(body === undefined ? {} : { body: form ? body.toString() : JSON.stringify(body) }),
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  const value: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const message =
      typeof record.message === 'string'
        ? record.message
        : typeof record.error === 'string'
          ? record.error
          : 'Action impossible, réessaie.';
    // The Node sends its stable code in `code`, or in `error` (`{ error: 'E_…', message }`).
    const code =
      typeof record.code === 'string'
        ? record.code
        : typeof record.error === 'string' && STABLE_CODE.test(record.error)
          ? record.error
          : undefined;
    throw new WorkspaceApiError(message, code, response.status, method + ' ' + path);
  }
  return value as T;
}
