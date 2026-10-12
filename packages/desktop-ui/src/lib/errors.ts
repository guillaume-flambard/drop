/**
 * What a failure says in « Ton espace » (T4.37): one sentence for the owner, and the technical details (code, HTTP
 * status, route) folded under it, to copy into a message. Pure: no DOM, no fetch.
 */
import { WorkspaceApiError } from '../api.ts';
import { CODES } from '../panel/logic.ts';

export interface ErrorDetails {
  code?: string | undefined;
  status?: number | undefined;
  route?: string | undefined;
}

export interface ErrorInfo {
  sentence: string;
  details?: ErrorDetails | undefined;
}

const STABLE_CODE = /^E_[A-Z0-9_]+$/;
const FALLBACK = 'Action impossible. Réessaie dans un instant.';

/** The Node's own sentence first; a bare code reads as its translation; the Node's opaque words never show alone. */
export function describeError(error: unknown): ErrorInfo {
  if (!(error instanceof Error)) return { sentence: 'Une erreur est survenue. Réessaie.' };
  const message = error.message.trim();
  if (!(error instanceof WorkspaceApiError)) return { sentence: message || FALLBACK };
  const code = error.code;
  const bare = message === '' || STABLE_CODE.test(message) || message === 'internal' || message === 'not_found';
  const sentence = !bare
    ? message
    : code && CODES[code]
      ? (CODES[code] ?? FALLBACK)
      : message === 'not_found'
        ? 'Action indisponible sur ce Node.'
        : FALLBACK;
  const details: ErrorDetails = { code, status: error.status, route: error.route };
  return details.code || details.status || details.route ? { sentence, details } : { sentence };
}

/** The details as plain lines, the way they are copied. */
export function detailsText(info: ErrorInfo): string {
  const details = info.details ?? {};
  return [
    info.sentence,
    ...(details.code ? ['Code : ' + details.code] : []),
    ...(details.status ? ['Statut HTTP : ' + String(details.status)] : []),
    ...(details.route ? ['Route : ' + details.route] : []),
  ].join('\n');
}
