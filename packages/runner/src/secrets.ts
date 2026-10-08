/**
 * Secret scanner applied to every string of a validated output (pipeline step 6).
 * False positives are accepted: a refused Drop is better than a leaked secret.
 */

export interface SecretPattern {
  kind: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { kind: 'pem_private_key', regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY[A-Z ]*-----/ },
  { kind: 'aws_access_key', regex: /AKIA[0-9A-Z]{16}/ },
  // The look-behind keeps ordinary words such as "disk-cleanup-..." from matching the `sk-` prefix.
  { kind: 'anthropic_key', regex: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/ },
  { kind: 'sk_key', regex: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/ },
  { kind: 'github_token', regex: /gh[pousr]_[A-Za-z0-9]{36}/ },
  { kind: 'slack_token', regex: /xox[baprs]-/ },
  { kind: 'jwt', regex: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\./ },
  { kind: 'credential_assignment', regex: /(?:KEY|SECRET|TOKEN|PASSWORD)\s*=\s*\S/i },
];

/** A whitespace-free token strictly longer than this is checked for entropy. */
export const ENTROPY_MIN_LENGTH = 32;
/** Shannon entropy, in bits per character, above which a long token is treated as a secret. */
export const ENTROPY_THRESHOLD = 4.5;
export const HIGH_ENTROPY_KIND = 'high_entropy';

export function shannonEntropy(text: string): number {
  const chars = Array.from(text);
  if (chars.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of chars) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / chars.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function hasHighEntropyToken(text: string): boolean {
  return text
    .split(/\s+/)
    .some((token) => Array.from(token).length > ENTROPY_MIN_LENGTH && shannonEntropy(token) > ENTROPY_THRESHOLD);
}

function scanString(text: string, found: Set<string>): void {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) found.add(pattern.kind);
  }
  if (hasHighEntropyToken(text)) found.add(HIGH_ENTROPY_KIND);
}

function walk(value: unknown, found: Set<string>, seen: WeakSet<object>): void {
  if (typeof value === 'string') {
    scanString(value, found);
    return;
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found, seen);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    scanString(key, found);
    walk(item, found, seen);
  }
}

/** Kinds of secret found in any string (values and object keys, at any depth) of `value`; [] when clean. */
export function scanSecrets(value: unknown): string[] {
  const found = new Set<string>();
  walk(value, found, new WeakSet());
  const order = [...SECRET_PATTERNS.map((pattern) => pattern.kind), HIGH_ENTROPY_KIND];
  return order.filter((kind) => found.has(kind));
}
