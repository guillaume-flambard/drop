import { describe, expect, it } from 'vitest';
import { countLeaks, LEAK_FRAGMENTS } from '../src/campaign.ts';

describe('simulation leak check (T4.1)', () => {
  it('counts planted fragments in a delivered payload and ignores hashes that merely contain digits', () => {
    expect(countLeaks(JSON.stringify({ state: 'delivered', result: { output: { errors: 3 } } }))).toBe(0);
    expect(countLeaks(`{"inputHash":"${'4242'.repeat(16)}"}`)).toBe(0);
    expect(countLeaks(`{"output":"${LEAK_FRAGMENTS[1] ?? ''}"}`)).toBe(1);
    expect(countLeaks(LEAK_FRAGMENTS.join(' '))).toBe(LEAK_FRAGMENTS.length);
  });
});
