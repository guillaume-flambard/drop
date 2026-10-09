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
