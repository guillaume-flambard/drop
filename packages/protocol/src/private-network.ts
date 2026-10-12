import { isIP } from 'node:net';
import { z } from 'zod';
import { DropError } from './errors.ts';

/** Pure policy. Literal private addresses avoid DNS rebinding and implicit resolution. */
function privateUrl(raw: string): URL {
  const deny = (): never => {
    throw new DropError('E_DENIED', 'E_DENIED private network destination');
  };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return deny();
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash)
    return deny();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // URL normalizes non-canonical IPv4 (hex, octal, integer); do not accept such aliases.
  const authority = raw.split('://')[1]?.split(/[/?#]/)[0];
  if (authority !== url.host) return deny();
  const family = isIP(host);
  if (family === 4) {
    const [a, b] = host.split('.').map(Number);
    if (a === 127 || a === 10 || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168))
      return url;
  }
  if (family === 6 && (host === '::1' || /^f[cd][0-9a-f]{2}:/i.test(host))) return url;
  return deny();
}

export const PrivateNetworkSchema = z.strictObject({
  origins: z
    .array(
      z.string().refine((raw) => {
        try {
          const url = privateUrl(raw);
          return url.origin === raw;
        } catch {
          return false;
        }
      }, 'canonical private IP origin required'),
    )
    .min(1)
    .max(100),
});
export type PrivateNetwork = z.infer<typeof PrivateNetworkSchema>;

export function assertPrivateDestination(raw: string, policy: PrivateNetwork, source?: string): URL {
  const url = privateUrl(raw);
  if (!policy.origins.includes(url.origin) || (source !== undefined && url.origin !== privateUrl(source).origin))
    throw new DropError('E_DENIED', 'E_DENIED private network origin');
  return url;
}

/** A DNS host name: dotted labels of letters, digits and hyphens, never an IP literal. */
function isDnsName(host: string): boolean {
  return (
    host.length <= 253 &&
    isIP(host) === 0 &&
    host.includes('.') &&
    host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    !/^[0-9.]+$/.test(host)
  );
}

/**
 * The relay a node may adopt from an invite or be configured with (T4.23, D89): `ws:` only to a literal private or
 * loopback address, as before; `wss:` to such an address or to a DNS name, whose TLS certificate the relay client
 * checks. Never credentials, a query or a fragment, never a non-canonical address.
 */
export function relayUrlAllowed(raw: string): boolean {
  if (raw.length > 512) return false;
  try {
    const url = privateUrl(raw);
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && !url.search;
  } catch {
    // Not a literal private address: only a DNS name over TLS remains.
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const authority = raw.split('://')[1]?.split(/[/?#]/)[0];
  return (
    url.protocol === 'wss:' &&
    !url.username &&
    !url.password &&
    !url.search &&
    !raw.includes('#') &&
    authority === url.host &&
    isDnsName(url.hostname)
  );
}
