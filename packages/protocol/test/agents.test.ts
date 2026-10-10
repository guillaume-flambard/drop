import { describe, expect, it } from 'vitest';
import { MessageSchema, REQUESTER_AGENTS, RequestedBySchema } from '../src/index.ts';

describe('requested-by agent (T4.5)', () => {
  it('accepts the thirteen clients and other, and reads any other value as other', () => {
    const base = { nodeId: 'x'.repeat(43), displayName: 'Natha' };
    expect(REQUESTER_AGENTS).toHaveLength(14);
    for (const agent of REQUESTER_AGENTS) expect(RequestedBySchema.parse({ ...base, agent }).agent).toBe(agent);
    // A value from a newer peer, or a forged one, never invalidates a request and never shows as written.
    for (const agent of ['chatgpt', 'windsurf', '', 'Claude_Code', 42])
      expect(RequestedBySchema.parse({ ...base, agent }).agent).toBe('other');
  });
});

describe('local network privacy (T4.2c)', () => {
  it('carries a discovery key only as a 32-byte value', () => {
    const key = Buffer.alloc(32, 7).toString('base64url');
    expect(MessageSchema.safeParse({ type: 'lan_key', key }).success).toBe(true);
    expect(MessageSchema.safeParse({ type: 'lan_key', key: Buffer.alloc(31, 7).toString('base64url') }).success).toBe(
      false,
    );
    expect(MessageSchema.safeParse({ type: 'lan_key', key: 'not a key' }).success).toBe(false);
    expect(MessageSchema.safeParse({ type: 'lan_key', key: `${key}=` }).success).toBe(false);
  });
});
