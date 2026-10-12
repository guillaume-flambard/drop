import { describe, expect, it } from 'vitest';
import { internetModeLabel } from '../src/lib/format.ts';

describe('internetModeLabel', () => {
  it('names every saved Internet mode, including the public test relay', () => {
    expect(internetModeLabel('off')).toBe('Réseau local');
    expect(internetModeLabel('direct')).toBe('Directe');
    expect(internetModeLabel('relay')).toBe('Relais privé');
    expect(internetModeLabel('n0')).toBe('Relais public de test');
  });

  it('says "Non configurée" only when nothing is saved', () => {
    expect(internetModeLabel(undefined)).toBe('Non configurée');
  });
});
