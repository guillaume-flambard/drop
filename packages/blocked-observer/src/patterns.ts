/**
 * v2 block patterns (D23). The spec's v1 alternation, measured on 30 days of real Codex logs (2026-10-08), matched
 * 780 times, about 34 per active day, mostly noise: line numbers, phone numbers, test tables, `BranchForbiddenError`,
 * `HTTPStatus.FORBIDDEN`. v2 keeps the same intent but requires an HTTP context for 401 and 403, reads « forbidden » and
 * « unauthorized » only as a response, and keeps each pattern on one line. Case-insensitive except EACCES.
 */
export const PATTERNS: readonly { name: string; regex: RegExp }[] = [
  {
    name: 'http_401',
    regex:
      /\b401\s+Unauthori[sz]ed\b|\bHTTP(?:\/[\d.]+)?:?\s+401\b|\bstatus(?:\s+code)?[=:\s]+401\b|"(?:status|statusCode|code)"\s*:\s*401\b/i,
  },
  {
    name: 'http_403',
    regex:
      /\b403\s+Forbidden\b|\bHTTP(?:\/[\d.]+)?:?\s+403\b|\bstatus(?:\s+code)?[=:\s]+403\b|"(?:status|statusCode|code)"\s*:\s*403\b|\(403\)/i,
  },
  { name: 'permission_denied', regex: /\bpermission denied\b/i },
  { name: 'access_denied', regex: /\baccess (?:is )?denied\b/i },
  {
    name: 'forbidden',
    regex: /\b(?:access|request|operation|action) (?:is )?forbidden\b|"Forbidden"|^\s*Forbidden\b/im,
  },
  {
    name: 'unauthorized',
    regex: /\bUnauthori[sz]ed(?::| access| request| to\b)|"Unauthori[sz]ed"|^\s*Unauthori[sz]ed\b/im,
  },
  { name: 'authentication_required', regex: /\bauthentication (?:is )?required\b/i },
  { name: 'not_authorized', regex: /\bnot authori[sz]ed to\b|\byou are not authori[sz]ed\b/i },
  { name: 'eacces', regex: /\bEACCES\b/ },
  { name: 'no_such_tool', regex: /\bno such tool\b/i },
  { name: 'tool_not_available', regex: /\btool\b[^\n]{0,60}\bnot (?:found|available)\b/i },
  {
    name: 'mcp_server_failed',
    regex: /\bMCP server\b[^\n]{0,60}\b(?:not (?:found|connected|running|available)|failed)\b/i,
  },
  {
    name: 'login_required',
    regex: /\brequires? (?:a )?(?:login|sign[- ]in)\b|\b(?:please|you must) (?:log ?in|sign[- ]in)\b/i,
  },
];

const MAX_SCAN_CHARS = 200_000;

/** Name of the first pattern found in `text`, or undefined. Only the name is ever stored, never the text. */
export function detectPattern(text: string): string | undefined {
  const sample = text.length > MAX_SCAN_CHARS ? text.slice(0, MAX_SCAN_CHARS) : text;
  return PATTERNS.find((pattern) => pattern.regex.test(sample))?.name;
}
