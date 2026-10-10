import { describe, expect, it } from 'vitest';
import { capabilities } from '../src/index.ts';

describe('capability registry', () => {
  it('every capability declares its own maximum output size on its card', () => {
    const limits = new Map(capabilities.map((impl) => [impl.card.id, impl.card.maxOutputChars]));
    expect([...limits.keys()]).toEqual(['production.error_summary', 'repo.answer', 'mcp.answer', 'a2a.answer']);
    for (const limit of limits.values()) expect(Number.isInteger(limit) && limit > 0).toBe(true);
    expect(limits.get('production.error_summary')).toBe(4000);
    expect(limits.get('a2a.answer')).toBe(5000);
  });
});
