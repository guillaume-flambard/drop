import { describe, expect, it } from 'vitest';
import { provePrivateSystem } from './private-system.ts';

describe('private system', () => {
  it('runs two private nodes with internal MCP and model through consent failure and restart', async () => {
    const proof = await provePrivateSystem();
    expect(proof.scenarios).toHaveLength(7);
    expect(proof.modelCalls).toBe(5);
  }, 30000);
});
