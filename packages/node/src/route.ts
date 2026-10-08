import type { CatalogEntry } from './engine.ts';

/**
 * « Demander à mon équipe » (T2.12, D32): picks who should answer a question written in plain language, with rules and
 * no model. A first name in the question wins; otherwise the kind of each shared tool is matched against the words of
 * the question. Only capabilities that take a free-text `question` are candidates. At most three, and none when nothing
 * matches: drop then says who can help instead of asking everyone.
 */
export interface Route {
  capabilityId: string;
  ownerName: string;
  title: string;
  online: boolean;
  /** Why this one was picked, shown to the person asking. */
  reason: string;
}

export const MAX_ROUTES = 3;

/** Words that point to a kind of tool. Kinds come from mcp.answer.<kind> ids, or `code` for repo.answer. */
export const KIND_WORDS: Record<string, string[]> = {
  figma: [
    'maquette',
    'maquettes',
    'design',
    'figma',
    'écran',
    'ecran',
    'bouton',
    'couleur',
    'ui',
    'ux',
    'mockup',
    'frame',
    'interface',
  ],
  code: [
    'code',
    'implémentation',
    'implementation',
    'fonction',
    'dépôt',
    'depot',
    'repo',
    'branche',
    'mode sombre',
    'bug',
    'api',
    'endpoint',
  ],
  github: [
    'pr',
    'prs',
    'pull request',
    'commit',
    'commits',
    'merge',
    'ci',
    'github',
    'issue',
    'issues',
    'release',
    'branche',
    'dépôt',
    'repo',
  ],
  gitlab: ['merge request', 'mr', 'gitlab', 'pipeline', 'commit', 'branche'],
  notion: ['doc', 'docs', 'documentation', 'page', 'wiki', 'notion', 'spec', 'specs', 'compte rendu', 'note', 'notes'],
  linear: [
    'ticket',
    'tickets',
    'sprint',
    'tâche',
    'taches',
    'tâches',
    'backlog',
    'linear',
    'roadmap',
    'avancement',
    'priorité',
    'jalon',
  ],
  jira: [
    'ticket',
    'tickets',
    'sprint',
    'tâche',
    'tâches',
    'backlog',
    'jira',
    'epic',
    'roadmap',
    'avancement',
    'confluence',
  ],
  crm: [
    'client',
    'clients',
    'contrat',
    'devis',
    'vente',
    'ventes',
    'deal',
    'prospect',
    'hubspot',
    'salesforce',
    'pipedrive',
    'signé',
    'facture',
    'avenant',
  ],
  database: [
    'base',
    'données',
    'donnees',
    'table',
    'requête',
    'sql',
    'chiffres',
    'combien',
    'utilisateurs',
    'commandes',
    'inscrits',
    'stats',
  ],
  slack: ['slack', 'canal', 'message', 'messages', 'discussion', 'conversation'],
  google: ['drive', 'gmail', 'mail', 'agenda', 'calendrier', 'sheet', 'tableur', 'google'],
  sentry: ['erreur', 'erreurs', 'exception', 'crash', 'sentry', 'plantage'],
  datadog: ['logs', 'métriques', 'latence', 'datadog', 'monitoring'],
};

function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')} `;
}

function mentions(question: string, word: string): boolean {
  return question.includes(` ${normalize(word).trim()} `);
}

/** The kind of a capability: `mcp.answer.figma` → figma, `repo.answer` → code; free-text titles also count. */
export function kindOf(entry: Pick<CatalogEntry, 'card'>): string | undefined {
  if (entry.card.id === 'repo.answer') return 'code';
  const match = /^mcp\.answer\.([a-z0-9_]+)$/.exec(entry.card.id);
  return match?.[1];
}

/** True when the capability takes a free-text question, the only kind « ask_team » can fill. */
export function takesQuestion(entry: Pick<CatalogEntry, 'card'>): boolean {
  const schema = entry.card.inputSchema as { properties?: Record<string, { type?: unknown }>; required?: unknown };
  const properties = schema.properties ?? {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  return properties.question?.type === 'string' && required.every((name) => name === 'question');
}

export function routeQuestion(catalog: CatalogEntry[], question: string): Route[] {
  const text = normalize(question);
  const candidates = catalog.filter(takesQuestion);
  const named = candidates.filter((entry) => mentions(text, entry.ownerName.split(/\s+/)[0] ?? entry.ownerName));
  const scored = (named.length > 0 ? named : candidates)
    .map((entry) => {
      const kind = kindOf(entry);
      const words = (kind ? KIND_WORDS[kind] : undefined) ?? [];
      const hits = words.filter((word) => mentions(text, word));
      const titleHit = kind !== undefined && mentions(text, kind) ? 1 : 0;
      return { entry, kind, hits, score: hits.length + titleHit + (named.length > 0 ? 10 : 0) };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.entry.online) - Number(a.entry.online));
  return scored.slice(0, MAX_ROUTES).map(({ entry, hits }) => ({
    capabilityId: entry.card.id,
    ownerName: entry.ownerName,
    title: entry.card.title,
    online: entry.online,
    reason:
      named.length > 0
        ? `tu as cité ${entry.ownerName.split(/\s+/)[0] ?? entry.ownerName}`
        : `la question parle de ${hits.slice(0, 3).join(', ')}`,
  }));
}
