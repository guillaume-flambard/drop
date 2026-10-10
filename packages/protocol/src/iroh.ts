import { isIP } from 'node:net';
import { z } from 'zod';

/** At most this many direct addresses per node: a few interfaces, IPv4 and IPv6 (T4.2b, D68). */
export const MAX_IROH_DIRECT = 8;

const IPV4 = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/;
const IPV6 = /^\[([0-9A-Fa-f:.]+)\]:(\d{1,5})$/;

/** `ip:port`, IPv6 in brackets, as drop-iroh reports it. No host name, no interface index. */
export function isSocketAddress(text: string): boolean {
  const v4 = IPV4.exec(text);
  const v6 = v4 ? undefined : IPV6.exec(text);
  const host = v4?.[1] ?? v6?.[1];
  const port = Number(v4?.[2] ?? v6?.[2]);
  if (host === undefined || !Number.isInteger(port) || port < 1 || port > 65535) return false;
  return isIP(host) === (v4 ? 4 : 6);
}

function isRelayUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** How a peer reaches this node by iroh: the relay it chose, if any, and its direct addresses. */
export const IrohAddrSchema = z.object({
  relay: z.string().max(300).refine(isRelayUrl).optional(),
  direct: z.array(z.string().max(64).refine(isSocketAddress)).max(MAX_IROH_DIRECT),
});
export type IrohAddr = z.infer<typeof IrohAddrSchema>;
