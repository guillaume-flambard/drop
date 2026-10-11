export class WorkspaceApiError extends Error {
  code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'WorkspaceApiError';
    this.code = code;
  }
}

const token = new URLSearchParams(window.location.search).get('token') ?? '';

export async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  // Fixed local URL paths only. Never fetch URLs supplied by peers.
  if (!path.startsWith('/ui/')) throw new Error('Chemin API non autorisé.');
  if (!token) throw new WorkspaceApiError('Session locale indisponible. Rouvre Drop.');
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
    throw new WorkspaceApiError(message, typeof record.code === 'string' ? record.code : undefined);
  }
  return value as T;
}
