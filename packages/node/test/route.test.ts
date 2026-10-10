import { describe, expect, it } from 'vitest';
import type { CapabilityCard } from '@drop/protocol';
import type { CatalogEntry } from '../src/engine.ts';
import { routeQuestion, takesQuestion } from '../src/route.ts';

const QUESTION_SCHEMA = {
  type: 'object',
  properties: { question: { type: 'string', minLength: 10, maxLength: 300 } },
  required: ['question'],
};

function entry(
  id: string,
  ownerName: string,
  title: string,
  online = true,
  inputSchema: object = QUESTION_SCHEMA,
): CatalogEntry {
  return {
    card: { id, title, inputSchema } as unknown as CapabilityCard,
    ownerNodeId: `node-${ownerName}`,
    ownerName,
    online,
  };
}

const catalog = [
  entry('mcp.answer.figma', 'Julie', 'Répondre à partir de mon Figma'),
  entry('repo.answer', 'Julie', 'Répondre à une question sur mon dépôt'),
  entry('mcp.answer.github', 'Natha', 'Répondre à partir de mon GitHub'),
  entry('mcp.answer.linear', 'Natha', 'Répondre à partir de mon Linear', false),
  entry('mcp.answer.crm', 'Sami Benali', 'Répondre à partir de mon CRM'),
  entry('production.error_summary', 'lab', 'Résumer les erreurs de production', true, {
    type: 'object',
    properties: { service: { type: 'string' }, window: { type: 'string' } },
    required: ['service', 'window'],
  }),
];

describe('routing a plain question to the right people (T2.12, D32)', () => {
  it('matches the words of the question to the kind of each shared tool', () => {
    expect(
      routeQuestion(catalog, 'Quelle couleur a le bouton de paiement sur la maquette ?').map(
        (route) => route.capabilityId,
      ),
    ).toEqual(['mcp.answer.figma']);
    const atlas = routeQuestion(
      catalog,
      'Où en est le projet Atlas : les PR ouvertes, les tickets du sprint et le contrat client ?',
    );
    expect(atlas.map((route) => route.capabilityId).sort()).toEqual([
      'mcp.answer.crm',
      'mcp.answer.github',
      'mcp.answer.linear',
    ]);
    expect(atlas.find((route) => route.capabilityId === 'mcp.answer.github')?.reason).toBe('la question parle de pr');
  });

  it('a first name wins, accents and case do not matter, and nothing is sent when nothing matches', () => {
    expect(routeQuestion(catalog, 'Demande à sami si on a avancé avec eux').map((route) => route.capabilityId)).toEqual(
      ['mcp.answer.crm'],
    );
    expect(routeQuestion(catalog, 'Est-ce que julie a déjà fait la maquette du panier ?')).toEqual([
      expect.objectContaining({ capabilityId: 'mcp.answer.figma', reason: 'tu as cité Julie' }),
    ]);
    expect(
      routeQuestion(catalog, 'Tu peux demander à Julie où elle en est ?').map((route) => route.capabilityId),
    ).toEqual(['mcp.answer.figma', 'repo.answer']);
    expect(routeQuestion(catalog, 'Quel temps fera-t-il demain à Lyon ?')).toEqual([]);
  });

  it('only capabilities that take a free-text question can be asked', () => {
    expect(catalog.filter(takesQuestion).map((candidate) => candidate.card.id)).not.toContain(
      'production.error_summary',
    );
    expect(routeQuestion(catalog, 'Y a-t-il des erreurs en prod sur traefik ?')).toEqual([]);
  });
});
