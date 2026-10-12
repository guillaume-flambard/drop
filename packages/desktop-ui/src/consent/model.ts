/**
 * The consent card's states and wording (T4.35, lot B of docs/research/2026-10-12-openwhispr.md). Pure: no DOM, no
 * fetch. Each state says what happened to the data, and nothing here guesses: a reply the card cannot read is
 * « Incertaine », never « Refusée ». The Node decides; this module only reads what it answered.
 */
import type { ApprovalItem } from '../panel/types.ts';

export type Decision = 'allow_once' | 'deny' | 'not_now';
/** What the owner did on the card: one of the three buttons, or « Répondre moi-même ». */
export type Action = Decision | 'answer';

export type ConsentState =
  | { kind: 'pending'; notice?: string }
  | { kind: 'deciding'; action: Action }
  | { kind: 'authorized'; via: 'allow_once' | 'answer' }
  | { kind: 'refused'; decision: 'deny' | 'not_now' }
  | { kind: 'expired' }
  | { kind: 'uncertain'; action: Action; reason: 'unreadable' | 'not_pending' };

export interface ConsentEntry {
  item: ApprovalItem;
  state: ConsentState;
}

/** What the Node answered: a body, an HTTP refusal, or nothing readable at all. */
export type NodeReply =
  { kind: 'ok'; body: unknown } | { kind: 'refused'; status: number; code?: string } | { kind: 'unreachable' };

export const BLOCKED_REASON = 'Décision en cours d’envoi : attends sa confirmation.';
export const STILL_WAITING = 'Ta décision n’a pas été appliquée : la demande attend toujours.';

/** Reads a failed call: an HTTP status makes a refusal, anything else (network, abort) is unreachable. */
export function replyFromError(error: unknown): NodeReply {
  const record = (typeof error === 'object' && error !== null ? error : {}) as { status?: unknown; code?: unknown };
  if (typeof record.status !== 'number') return { kind: 'unreachable' };
  return typeof record.code === 'string'
    ? { kind: 'refused', status: record.status, code: record.code }
    : { kind: 'refused', status: record.status };
}

/** A decision starts only from a waiting card: never twice, never after expiry. */
export function begin(state: ConsentState, action: Action): ConsentState | null {
  return state.kind === 'pending' ? { kind: 'deciding', action } : null;
}

/** True while the request may still be decided here or is being decided. */
export function waiting(state: ConsentState): boolean {
  return state.kind === 'pending' || state.kind === 'deciding';
}

/** Why the buttons do nothing: shown and read with them, so that they stay focusable. */
export function blockedReason(state: ConsentState): string | null {
  return state.kind === 'deciding' ? BLOCKED_REASON : null;
}

/** Only a pending card expires: a decision in flight may have arrived in time, a confirmed one is final. */
export function tick(state: ConsentState, expiresAt: number, now: number): ConsentState {
  return state.kind === 'pending' && now >= expiresAt ? { kind: 'expired' } : state;
}

/**
 * The state after the Node's reply. `reason` is the translated refusal shown when the request still waits (refused
 * before the engine: token, schema); « Répondre moi-même » shows its own refusal and passes none.
 */
export function settle(action: Action, reply: NodeReply, reason?: string): ConsentState {
  if (reply.kind === 'unreachable') return { kind: 'uncertain', action, reason: 'unreadable' };
  if (reply.kind === 'ok') {
    const body = reply.body as { ok?: unknown } | null;
    if (typeof body !== 'object' || body === null || body.ok !== true)
      return { kind: 'uncertain', action, reason: 'unreadable' };
    if (action === 'allow_once' || action === 'answer') return { kind: 'authorized', via: action };
    return { kind: 'refused', decision: action };
  }
  if (reply.status === 404 || reply.status === 409)
    return reply.code === 'E_EXPIRED' ? { kind: 'expired' } : { kind: 'uncertain', action, reason: 'not_pending' };
  // The engine may have taken the card out and sent the decision before failing: nobody here knows.
  if (reply.status >= 500) return { kind: 'uncertain', action, reason: 'unreadable' };
  return reason ? { kind: 'pending', notice: reason } : { kind: 'pending' };
}

export type StateTone = 'neutral' | 'success' | 'warning';

/** The state's name and one sentence on what happened to the data. Leaving data is always in the future tense. */
export function stateCopy(
  state: ConsentState,
  who: string,
  sensitivity: 'low' | 'high',
): { label: string; sentence: string; tone: StateTone } {
  const nothing = 'Rien n’a été envoyé à ' + who + '.';
  switch (state.kind) {
    case 'pending':
      return { label: 'En attente', sentence: 'Rien n’a été envoyé : rien ne part sans ton accord.', tone: 'neutral' };
    case 'deciding':
      return {
        label: 'Décision en cours',
        sentence: 'Ta décision est en cours d’envoi. Rien n’est confirmé pour l’instant.',
        tone: 'neutral',
      };
    case 'authorized':
      if (state.via === 'answer')
        return { label: 'Répondue', sentence: 'Seule ta réponse partira vers ' + who + '.', tone: 'success' };
      return {
        label: 'Autorisée une fois',
        sentence:
          sensitivity === 'high'
            ? 'Rien n’est encore parti : tu reliras le résultat avant qu’il parte vers ' + who + '.'
            : 'Seul le résultat de cette demande partira vers ' + who + '.',
        tone: 'success',
      };
    case 'refused':
      return { label: state.decision === 'deny' ? 'Refusée' : 'Pas maintenant', sentence: nothing, tone: 'neutral' };
    case 'expired':
      return { label: 'Expirée', sentence: nothing, tone: 'neutral' };
    case 'uncertain': {
      const unknown = 'Impossible de confirmer ce qui a été envoyé à ' + who + '.';
      if (state.reason === 'not_pending')
        return {
          label: 'Incertaine',
          sentence: 'Cette demande n’attendait plus ta décision, qui n’a pas été appliquée. ' + unknown,
          tone: 'warning',
        };
      const consent = state.action === 'allow_once' || state.action === 'answer';
      return {
        label: 'Incertaine',
        sentence: consent ? unknown : 'Impossible de confirmer ta décision. Sans ton accord, rien n’est envoyé.',
        tone: 'warning',
      };
    }
  }
}

/** What the surface's single live region says when a card changes state. */
export function announcement(entry: ConsentEntry): string {
  const { item, state } = entry;
  if (state.kind === 'pending' && state.notice)
    return 'Décision non appliquée : ' + item.card.title + '. ' + state.notice;
  const copy = stateCopy(state, item.requestedBy.displayName, item.card.sensitivity);
  return copy.label + ' : ' + item.card.title + '. ' + copy.sentence;
}

/**
 * Brings the cards in line with the clock and, when given, with the Node's list, which has the last word on « still
 * waiting »: an uncertain card it still lists waits again. A confirmed decision or an expiry never goes back, so that a
 * stale list cannot revive a card. A waiting card that left the list without a decision here (notification, CLI)
 * leaves too: this surface does not know what happened and does not guess. `changed` lists what to announce.
 */
export function reconcile(
  entries: readonly ConsentEntry[],
  items: readonly ApprovalItem[] | null,
  now: number,
): { entries: ConsentEntry[]; changed: ConsentEntry[] } {
  const changed: ConsentEntry[] = [];
  const listed = new Map((items ?? []).map((item) => [item.dropId, item]));
  const next: ConsentEntry[] = [];
  for (const entry of entries) {
    const fresh = listed.get(entry.item.dropId);
    listed.delete(entry.item.dropId);
    let state = tick(entry.state, entry.item.expiresAt, now);
    if (items && fresh && state.kind === 'uncertain') state = { kind: 'pending', notice: STILL_WAITING };
    if (items && !fresh && state.kind === 'pending') continue;
    const updated = { item: fresh && waiting(state) ? fresh : entry.item, state };
    if (state !== entry.state) changed.push(updated);
    next.push(updated);
  }
  for (const item of listed.values()) {
    const state = tick({ kind: 'pending' }, item.expiresAt, now);
    next.push({ item, state });
  }
  next.sort((a, b) => a.item.expiresAt - b.item.expiresAt);
  return { entries: next, changed };
}

/** « Masquer »: a settled card leaves; a waiting one stays. */
export function dismiss(entries: readonly ConsentEntry[], dropId: string): ConsentEntry[] {
  return entries.filter((entry) => entry.item.dropId !== dropId || waiting(entry.state));
}

/** Replaces one card's state. */
export function update(entries: readonly ConsentEntry[], dropId: string, state: ConsentState): ConsentEntry[] {
  return entries.map((entry) => (entry.item.dropId === dropId ? { ...entry, state } : entry));
}
