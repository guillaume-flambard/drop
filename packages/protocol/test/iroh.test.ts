import { describe, expect, it } from 'vitest';
import { IrohAddrSchema, MessageSchema, isSocketAddress } from '../src/index.ts';

describe('internet (T4.2b)', () => {
  it('carries iroh addresses only in their documented shape', () => {
    const valid = {
      type: 'iroh_addr',
      relay: 'https://relay.team.example',
      direct: ['192.168.1.20:51820', '[2001:db8::7]:4433'],
    };
    expect(MessageSchema.safeParse(valid).success).toBe(true);
    const nine = Array.from({ length: 9 }, (_, index) => `10.0.0.${String(index + 1)}:4433`);
    expect(MessageSchema.safeParse({ type: 'iroh_addr', direct: nine }).success).toBe(false);
    expect(MessageSchema.safeParse({ type: 'iroh_addr', direct: ['192.168.1.20'] }).success).toBe(false);

    // No host names, no interface index, no out-of-range port, no credentials or other schemes in the relay.
    for (const bad of ['relay.example:4433', '[fe80::1%en0]:4433', '10.0.0.1:0', '10.0.0.1:70000', '999.1.1.1:80'])
      expect(isSocketAddress(bad)).toBe(false);
    for (const relay of ['ftp://relay.example', 'https://user:pw@relay.example', 'not a url'])
      expect(IrohAddrSchema.safeParse({ relay, direct: [] }).success).toBe(false);
    expect(IrohAddrSchema.safeParse({ direct: [] }).success).toBe(true);
  });
});
