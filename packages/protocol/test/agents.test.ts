import { describe, expect, it } from 'vitest';
import { REQUESTER_AGENTS, RequestedBySchema } from '../src/index.ts';

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
