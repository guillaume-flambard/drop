import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@drop/protocol';
import { explainFailure, FAILURE_GUIDANCE } from '../src/failure-guidance.ts';

describe('T4.45 failure guidance', () => {
  it('covers every stable protocol error with a cause and an action', () => {
    expect(Object.keys(FAILURE_GUIDANCE).sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      expect(explainFailure(code).cause.length).toBeGreaterThan(5);
      expect(explainFailure(code).next.length).toBeGreaterThan(5);
    }
  });
  it('does not invent a cause for an unknown error', () => {
    expect(explainFailure('E_UNCONFIRMED').cause).toContain('non déterminée');
  });
});
