/**
 * Pure rules and wording of the menu bar panel: no DOM, no fetch. The components call these, and the tests check them
 * directly. Nothing here decides a security boundary: the Node checks every action again.
 */
import type {
  ConsentCard,
  Fact,
  InternetMode,
  LinkRequest,
  OnboardingResult,
  OutboundDrop,
  PanelStatus,
  PendingItem,
} from './types.ts';

/** Where Claude and ChatGPT send their authorization codes back: the panel names them and warns about any other (D71). */
export const KNOWN_ASSISTANT_HOSTS = ['claude.ai', 'chatgpt.com', 'chat.openai.com'];

const AGENT_NAMES: Record<string, string> = {
  claude_code: 'Claude Code',
  claude_desktop: 'Claude Desktop',
  cursor: 'Cursor',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini_cli: 'Gemini CLI',
  devin_desktop: 'Devin Desktop',
  zed: 'Zed',
  goose: 'goose',
  vscode: 'VS Code',
  cline: 'Cline',
  roo_code: 'Roo Code',
  jetbrains: 'JetBrains AI',
  other: 'un autre agent',
};

/** No technical identifier on the decision path: `claude_code` reads « Claude Code ». */
export function agentName(agent: string): string {
  return AGENT_NAMES[agent] ?? agent.replace(/_/g, ' ');
}

/** Stable codes translated into a useful sentence; the code stays visible between parentheses. */
export const CODES: Record<string, string> = {
  E_CLI_MISSING:
    'Commande officielle de cet agent introuvable sur cet ordinateur : lance la commande ci-dessous, ou installe-la puis relance l’analyse.',
  E_CLI_SHIM_UNSAFE:
    'La commande officielle ne peut pas recevoir ces chemins sans risque sous Windows : lance-la toi-même.',
  E_CONFIG_INVALID_OR_UNREADABLE:
    'Configuration de cet agent illisible ou invalide : drop ne la réécrit pas. Corrige-la, ou ajoute l’entrée ci-dessous.',
  E_CONFIG_LOCKED:
    'Configuration verrouillée ou protégée en écriture : ferme l’agent puis relance l’analyse, ou ajoute l’entrée ci-dessous.',
  E_CONFIG_UNDOCUMENTED:
    'Cet agent ne documente pas l’emplacement de sa configuration sur ce système : ajoute l’entrée depuis ses réglages.',
  E_CONFIG_AMBIGUOUS:
    'Plusieurs entrées drop dans cette configuration : drop ne choisit pas à ta place. Garde-en une seule.',
  E_SCOPE_CONFLICT:
    'Une entrée drop existe déjà dans un projet de cet agent : retire-la avant de raccorder l’agent entier.',
  E_CONFIG_SYMLINK:
    'Cette configuration est un lien vers un autre fichier : drop ne le suit pas. Ajoute l’entrée ci-dessous dans le fichier visé.',
  E_DROP_CONFLICT: 'Un serveur nommé drop existe déjà avec une autre commande.',
  E_CONFIG_CHANGED: 'La configuration a changé depuis l’analyse. Relance l’analyse.',
  E_CLI_COMMAND: 'L’agent n’a pas accepté l’ajout du connecteur. Réessaie ou ajoute drop à la main.',
  E_CLI_UNVERIFIED: 'L’agent n’a pas confirmé l’ajout du connecteur. Réessaie ou ajoute drop à la main.',
  E_AGENT_INVALID: 'Agent non pris en charge.',
  E_PROJECT_PATH: 'Dossier introuvable : indique le chemin complet d’un dossier de projet.',
  E_PROJECT_LIMIT: '50 dossiers de projet au plus.',
  E_SECRET_DETECTED: 'Secret détecté dans ta réponse : retire-le, rien n’est parti.',
  E_TOO_LARGE: 'Réponse trop longue : 8 000 caractères et un fichier de 128 Kio au plus.',
  E_SCHEMA: 'Réponse vide ou fichier illisible : écris un texte ou joins un fichier texte.',
};

export function explain(detail: string | undefined): string {
  if (!detail) return '';
  const known = CODES[detail];
  return known ? known + ' (' + detail + ')' : detail;
}

/** What a refused action says: the Node's message, a translated code, or a calm default. */
export function failureText(error: unknown, translate = false): string {
  const record = (error ?? {}) as { message?: unknown; code?: unknown };
  const raw = typeof record.message === 'string' ? record.message : '';
  // A bare `{ error: 'E_…' }` body reaches here as the message: it is a code, translated like the others.
  const bare = /^E_[A-Z0-9_]+$/.test(raw) ? raw : undefined;
  if (bare) return CODES[bare] ? explain(bare) : 'Action impossible. Réessaie dans un instant. (' + bare + ')';
  if (raw === 'unauthorized') return 'Session locale refusée : rouvre drop depuis la barre de menus.';
  if (raw === 'not_found') return 'Action indisponible sur ce Node.';
  // `{ error: 'internal' }` is the Node's opaque 500 body: never shown as a bare word.
  if (raw === 'internal') return 'Action impossible. Réessaie dans un instant.';
  const code = typeof record.code === 'string' ? record.code : undefined;
  const message = raw;
  if (code === 'E_SECRET_DETECTED' && message) return message + ' (E_SECRET_DETECTED)';
  if (translate && code) return explain(code);
  if (code && message) return message + ' (' + code + ')';
  return message || 'Action impossible. Réessaie dans un instant.';
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

const USD = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' });

/** The cost line of the consent card, absent when the capability costs nothing to declare (spec node). */
export function costLine(card: ConsentCard, requester: string): string | null {
  if (!card.cost) return null;
  if (card.cost.kind === 'free') return 'Coût : gratuit.';
  const payer = card.paidBy === 'requester' ? 'payé par ' + requester : 'à ta charge';
  if (card.cost.kind === 'capped') return 'Coût max : ' + USD.format(card.cost.maxUsd) + ', ' + payer + '.';
  return 'Coût : ' + payer + ', non mesuré.';
}

export const HIGH_SENSITIVITY = 'Sensibilité haute : tu reliras le résultat avant envoi.';

/** « mm:ss » until expiry, never negative. */
export function countdown(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
}

export type Decision = 'allow_once' | 'deny' | 'not_now';
export type ReviewDecision = 'send' | 'discard';

export function decisionMessage(decision: Decision | ReviewDecision): string {
  if (decision === 'allow_once') return 'Demande autorisée une fois.';
  if (decision === 'deny') return 'Demande refusée.';
  if (decision === 'not_now') return 'Demande reportée.';
  if (decision === 'send') return 'Réponse envoyée.';
  return 'Réponse conservée sur ce Mac.';
}

/** The form a review sends: one `redact` per top-level field the owner chose to remove. */
export function reviewForm(dropId: string, decision: ReviewDecision, removed: readonly string[]): URLSearchParams {
  const form = new URLSearchParams();
  form.append('dropId', dropId);
  form.append('decision', decision);
  if (decision === 'send') for (const key of removed) form.append('redact', key);
  return form;
}

/** A review output, one row per top-level field, values shown as text. */
export function reviewFields(output: unknown): { key: string; value: string }[] {
  if (typeof output !== 'object' || output === null) return [];
  return Object.entries(output as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)))
          .join(', ')
      : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : String(value),
  }));
}

export const OUTBOUND_STATES: Record<string, string> = {
  proposed: 'envoyée',
  awaiting_approval: 'en attente',
  approved: 'acceptée',
  running: 'en cours',
  in_review: 'relue',
  delivered: 'reçue',
  receipted: 'reçue',
  denied: 'refusée',
  not_now: 'pas maintenant',
  expired: 'expirée',
  failed: 'échouée',
};

export type Tone = 'success' | 'danger' | 'neutral' | 'warning';

export function outboundTone(drop: OutboundDrop): Tone {
  if (drop.result !== undefined) return 'success';
  if (drop.error) return 'danger';
  if (drop.state === 'delivered' || drop.state === 'receipted') return 'success';
  if (drop.state === 'denied' || drop.state === 'failed') return 'danger';
  if (drop.state === 'expired' || drop.state === 'not_now') return 'neutral';
  return 'warning';
}

export function outboundState(drop: OutboundDrop): string {
  return OUTBOUND_STATES[drop.state] ?? drop.state;
}

/**
 * A truthful, human explanation of the CURRENT state. The API does not expose historical milestones, so the panel
 * must not draw a fictional progress timeline.
 */
export function outboundSentence(drop: OutboundDrop): string {
  const who = drop.ownerName || 'Cette personne';
  if (drop.error || drop.state === 'failed') return 'La demande n’a pas abouti. Aucun accès n’a été donné.';
  if (drop.state === 'awaiting_approval')
    return 'Tu attends ' + who + '. Cette personne doit encore donner son accord.';
  if (drop.state === 'approved') return who + ' a accepté une fois. La réponse n’est pas encore prête.';
  if (drop.state === 'running') return 'La réponse est en cours de préparation chez ' + who + '.';
  if (drop.state === 'in_review') return who + ' relit la réponse avant de choisir ce qui peut partir.';
  if (drop.state === 'delivered' || drop.state === 'receipted')
    return 'La réponse est arrivée. Retrouve-la dans ton assistant.';
  if (drop.state === 'denied') return who + ' a refusé. Aucune réponse n’a été transmise.';
  if (drop.state === 'not_now') return who + ' a choisi de répondre plus tard.';
  if (drop.state === 'expired') return 'Cette demande a expiré sans accord.';
  return 'La question a été envoyée. En attente de la prochaine étape.';
}

/** The connection state of the header, announced by its own polite live region. */
export function connectionStatus(status: PanelStatus | null | 'down'): {
  text: string;
  tone: 'ok' | 'wait' | 'bad' | 'idle';
} {
  if (status === null) return { text: 'Connexion…', tone: 'idle' };
  if (status === 'down') return { text: 'Moteur local indisponible', tone: 'bad' };
  return status.relayConnected
    ? { text: status.displayName + ' · connecté', tone: 'ok' }
    : { text: status.displayName + ' · hors ligne', tone: 'wait' };
}

/** One result per agent; a connection also says the agent needs a restart, and where the team state lives. */
export function onboardingMessage(results: readonly OnboardingResult[], action: 'connect' | 'disconnect'): string {
  const lines = results.map((item) => agentName(item.agent) + ' : ' + explain(item.detail)).join(' · ');
  return action === 'connect'
    ? lines + ' · Connecteur utilisable : à vérifier après relance. L’état de l’équipe apparaît en haut.'
    : lines;
}

// ---- answering by hand (T4.3) ----

export const ANSWER_MAX_CHARS = 8000;
export const ANSWER_FILE_MAX_BYTES = 128 * 1024;
export const ANSWER_BODY_MAX_BYTES = 160 * 1024;
export const ANSWER_ACCEPT = '.txt,.md,.csv,.json,.log,text/plain,text/markdown,text/csv,application/json';
const MEDIA: Record<string, string> = { md: 'text/markdown', csv: 'text/csv', json: 'application/json' };

export interface AnswerFile {
  name: string;
  mediaType: string;
  content: string;
  size: number;
}

export interface AnswerDraft {
  stage: 'write' | 'review';
  text: string;
  file: AnswerFile | null;
}

/** Reads a picked text file: too large or not UTF-8 is refused, since what would leave is not what the file says. */
export function answerFile(name: string, size: number, content: string): AnswerFile | { error: string } {
  if (size > ANSWER_FILE_MAX_BYTES) return { error: explain('E_TOO_LARGE') };
  if (content.includes('�')) return { error: 'Fichier illisible : enregistre-le en UTF-8, puis joins-le à nouveau.' };
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return { name, mediaType: MEDIA[ext] ?? 'text/plain', content, size };
}

export function answerPayload(
  dropId: string,
  draft: AnswerDraft,
): { dropId: string; text: string; file?: Omit<AnswerFile, 'size'> } {
  return {
    dropId,
    text: draft.text,
    ...(draft.file
      ? { file: { name: draft.file.name, mediaType: draft.file.mediaType, content: draft.file.content } }
      : {}),
  };
}

/** The body would pass the Node's limit: refused here first, with the same translated code. */
export function answerTooLarge(payload: unknown): boolean {
  return new Blob([JSON.stringify(payload)]).size > ANSWER_BODY_MAX_BYTES;
}

export function fileSummary(file: AnswerFile): string {
  const lines = file.content.replace(/\n$/, '').split('\n').length;
  return 'Fichier : ' + file.name + ' (' + String(Math.ceil(file.size / 1024)) + ' Kio, ' + String(lines) + ' lignes)';
}

/** Drafts whose card left (decided elsewhere, answered or expired) leave the page memory with it. */
export function keepDrafts<T>(drafts: Record<string, T>, pending: readonly PendingItem[]): Record<string, T> {
  const ids = new Set(pending.map((item) => item.dropId));
  return Object.fromEntries(Object.entries(drafts).filter(([id]) => ids.has(id)));
}

// ---- linking an assistant (T2.13) ----

/** The assistant's name comes from whoever registered it; the return domain is what tells Claude from an impostor. */
export function linkWarnings(
  request: LinkRequest,
  gateways: readonly string[],
): { complete: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!gateways.includes(request.gateway))
    warnings.push(
      'Attention : cette demande ne passe pas par la passerelle officielle de drop. Refuse si tu n’en es pas à l’origine.',
    );
  const complete = request.clientId !== '' && request.redirect !== '';
  if (!complete) warnings.push('Ce lien est incomplet : redemande l’autorisation depuis ton assistant.');
  else if (!KNOWN_ASSISTANT_HOSTS.includes(request.redirect))
    warnings.push(
      'Attention : les réponses partiront vers ' +
        request.redirect +
        ', qui n’est ni Claude ni ChatGPT. Refuse si tu n’as pas ajouté toi-même cet assistant.',
    );
  return { complete, warnings };
}

/** The sign-in page comes from the remote server: offered as a link only when it is https, never javascript: or else. */
export function safeSignInLink(url: unknown): string {
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
}

// ---- internet by iroh (T4.2b, D68) ----

export const INTERNET_STATES: Record<string, string> = {
  off: 'Désactivée.',
  starting: 'Démarrage…',
  on: 'Active : tes collègues appairés peuvent te joindre par Internet.',
  failed: 'Arrêtée après une erreur : nouvel essai bientôt.',
  unavailable: 'Indisponible sur ce Mac : le programme de connexion par Internet n’est pas installé.',
};

export const INTERNET_CHOICES: { mode: InternetMode; label: string; detail: string }[] = [
  { mode: 'off', label: 'Désactivée', detail: '' },
  {
    mode: 'direct',
    label: 'Direct seulement',
    detail: 'Sans relais : marche quand l’un de vous est joignable directement.',
  },
  {
    mode: 'relay',
    label: 'Mon relais ou celui de l’équipe',
    detail: 'Un relais iroh que vous hébergez. Il voit vos adresses IP, jamais le contenu.',
  },
  {
    mode: 'n0',
    label: 'Relais de test de n0',
    detail: 'Un tiers, pour tester seulement : il voit vos adresses IP, jamais le contenu.',
  },
];

// ---- published facts (T4.4, D65) ----

export interface FactDraft {
  factId: string | null;
  topic: string;
  statement: string;
  keywords: string;
  label: string;
  url: string;
  validDays: number;
  audience: 'team' | 'peers';
  nodeIds: string[];
}

export function emptyFactDraft(): FactDraft {
  return {
    factId: null,
    topic: '',
    statement: '',
    keywords: '',
    label: '',
    url: '',
    validDays: 30,
    audience: 'team',
    nodeIds: [],
  };
}

/** Editing keeps the fact's own duration instead of resetting it. */
export function factDraftFrom(fact: Fact): FactDraft {
  return {
    factId: fact.factId,
    topic: fact.topic,
    statement: fact.statement,
    keywords: fact.keywords.join(', '),
    label: fact.source.label,
    url: fact.source.url ?? '',
    validDays: Math.max(1, Math.round((fact.validTo - fact.publishedAt) / 86400000)),
    audience: fact.audience.kind,
    nodeIds: fact.audience.kind === 'peers' ? [...fact.audience.nodeIds] : [],
  };
}

export function factBody(draft: FactDraft): Record<string, unknown> {
  return {
    topic: draft.topic,
    statement: draft.statement,
    validDays: draft.validDays,
    keywords: draft.keywords
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean),
    source: draft.url.trim() ? { label: draft.label, url: draft.url.trim() } : { label: draft.label },
    audience: draft.audience === 'team' ? { kind: 'team' } : { kind: 'peers', nodeIds: draft.nodeIds },
  };
}

/** Expired or retired facts are greyed out and say so. */
export function factState(fact: Fact): string | null {
  if (fact.status === 'retired') return 'Retiré';
  return fact.live ? null : 'Expiré';
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function factMeta(fact: Fact, names: Record<string, string>): string {
  const audience =
    fact.audience.kind === 'team'
      ? 'Tous mes pairs'
      : fact.audience.nodeIds.map((id) => names[id] ?? 'un pair').join(', ');
  return 'Jusqu’au ' + LONG_DATE.format(fact.validTo) + ' · ' + audience + ' · servi ' + String(fact.served) + ' fois';
}

export const PROJECT_SOURCES: Record<string, string> = {
  claude_code: 'connu de Claude Code',
  codex: 'connu de Codex',
  added: 'ajouté ici',
};
