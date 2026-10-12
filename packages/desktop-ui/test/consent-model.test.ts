/**
 * The consent card's pure model (T4.35): named states, what each says about the data, the reading of the Node's reply,
 * expiry reserved to a waiting card, and the Node's list having the last word on « still waiting ».
 */
import { describe, expect, it } from 'vitest';
import {
  BLOCKED_REASON,
  STILL_WAITING,
  announcement,
  begin,
  blockedReason,
  dismiss,
  reconcile,
  replyFromError,
  settle,
  stateCopy,
  tick,
  type ConsentEntry,
  type ConsentState,
} from '../src/consent/model.ts';
import type { ApprovalItem } from '../src/panel/types.ts';

const DROP = '0199c5a0-0000-7000-8000-000000000001';
const OTHER = '0199c5a0-0000-7000-8000-000000000002';

function item(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    kind: 'approval',
    dropId: DROP,
    card: {
      capabilityId: 'production.error_summary',
      title: 'Résumer les erreurs de production',
      receives: ['le nombre d’erreurs'],
      neverReceives: ['les logs bruts'],
      sensitivity: 'low',
      executorName: 'VPS',
    },
    inputPreview: 'Quelles erreurs ?',
    purpose: 'Point d’incident.',
    requestedBy: { displayName: 'Julie', agent: 'claude_code' },
    expiresAt: 10_000,
    ...overrides,
  };
}

const NOTHING_SENT = 'Rien n’a été envoyé à Julie.';

describe('consent card model (T4.35)', () => {
  it('names each state with a sentence that says what happened to the data', () => {
    const copy = (state: ConsentState, sensitivity: 'low' | 'high' = 'low') => stateCopy(state, 'Julie', sensitivity);
    expect(copy({ kind: 'refused', decision: 'deny' })).toMatchObject({ label: 'Refusée', sentence: NOTHING_SENT });
    expect(copy({ kind: 'refused', decision: 'not_now' })).toMatchObject({
      label: 'Pas maintenant',
      sentence: NOTHING_SENT,
    });
    expect(copy({ kind: 'expired' })).toMatchObject({ label: 'Expirée', sentence: NOTHING_SENT });
    expect(copy({ kind: 'authorized', via: 'allow_once' })).toMatchObject({
      label: 'Autorisée une fois',
      sentence: 'Seul le résultat de cette demande partira vers Julie.',
    });
    expect(copy({ kind: 'authorized', via: 'allow_once' }, 'high').sentence).toBe(
      'Rien n’est encore parti : tu reliras le résultat avant qu’il parte vers Julie.',
    );
    expect(copy({ kind: 'authorized', via: 'answer' })).toMatchObject({
      label: 'Répondue',
      sentence: 'Seule ta réponse partira vers Julie.',
    });
    expect(copy({ kind: 'uncertain', action: 'allow_once', reason: 'unreadable' })).toMatchObject({
      label: 'Incertaine',
      sentence: 'Impossible de confirmer ce qui a été envoyé à Julie.',
    });
    expect(copy({ kind: 'uncertain', action: 'deny', reason: 'unreadable' }).sentence).toBe(
      'Impossible de confirmer ta décision. Sans ton accord, rien n’est envoyé.',
    );
    expect(copy({ kind: 'uncertain', action: 'deny', reason: 'not_pending' }).sentence).toBe(
      'Cette demande n’attendait plus ta décision, qui n’a pas été appliquée. Impossible de confirmer ce qui a été envoyé à Julie.',
    );
    expect(copy({ kind: 'pending' })).toMatchObject({ label: 'En attente' });
    expect(copy({ kind: 'deciding', action: 'allow_once' })).toMatchObject({ label: 'Décision en cours' });
    // No state that may have let data leave ever claims that nothing was sent.
    for (const state of [
      { kind: 'authorized', via: 'allow_once' },
      { kind: 'authorized', via: 'answer' },
      { kind: 'uncertain', action: 'allow_once', reason: 'unreadable' },
      { kind: 'uncertain', action: 'answer', reason: 'unreadable' },
      { kind: 'uncertain', action: 'allow_once', reason: 'not_pending' },
    ] as ConsentState[])
      expect(copy(state).sentence).not.toContain('Rien n’a été envoyé');
    // Nothing is called sent while it may still wait in the offline queue.
    expect(copy({ kind: 'authorized', via: 'answer' }).sentence).not.toMatch(/envoyée?\b/);
    expect(announcement({ item: item(), state: { kind: 'refused', decision: 'deny' } })).toBe(
      'Refusée : Résumer les erreurs de production. Rien n’a été envoyé à Julie.',
    );
    expect(announcement({ item: item(), state: { kind: 'pending', notice: 'Session refusée.' } })).toBe(
      'Décision non appliquée : Résumer les erreurs de production. Session refusée.',
    );
  });

  it('lets only a pending card expire, and never withdraws a decision in flight', () => {
    expect(tick({ kind: 'pending' }, 10_000, 9_999)).toEqual({ kind: 'pending' });
    expect(tick({ kind: 'pending' }, 10_000, 10_000)).toEqual({ kind: 'expired' });
    const deciding: ConsentState = { kind: 'deciding', action: 'allow_once' };
    expect(tick(deciding, 10_000, 99_000)).toBe(deciding);
    const authorized: ConsentState = { kind: 'authorized', via: 'allow_once' };
    expect(tick(authorized, 10_000, 99_000)).toBe(authorized);
    // An expired card cannot be decided any more; a card in flight cannot be decided twice.
    expect(begin({ kind: 'expired' }, 'allow_once')).toBeNull();
    expect(begin(deciding, 'deny')).toBeNull();
    expect(begin({ kind: 'pending', notice: 'x' }, 'deny')).toEqual({ kind: 'deciding', action: 'deny' });
    expect(blockedReason(deciding)).toBe(BLOCKED_REASON);
    expect(blockedReason({ kind: 'pending' })).toBeNull();
    // Absent from the Node's list, a decision in flight stays in flight; the clock turns only the pending card.
    const entries: ConsentEntry[] = [
      { item: item(), state: deciding },
      { item: item({ dropId: OTHER }), state: { kind: 'pending' } },
    ];
    const next = reconcile(entries, null, 20_000);
    expect(next.entries.map((entry) => entry.state)).toEqual([deciding, { kind: 'expired' }]);
    expect(next.changed.map((entry) => entry.item.dropId)).toEqual([OTHER]);
    expect(reconcile(next.entries, [], 30_000).entries.map((entry) => entry.state.kind)).toEqual([
      'deciding',
      'expired',
    ]);
    // A settled card leaves on « Masquer »; a card in flight does not.
    expect(dismiss(next.entries, OTHER).map((entry) => entry.item.dropId)).toEqual([DROP]);
    expect(dismiss(next.entries, DROP)).toHaveLength(2);
  });

  it('reads an unreadable or failed reply as uncertain, never as refused', () => {
    const network = replyFromError(new TypeError('Failed to fetch'));
    expect(network).toEqual({ kind: 'unreachable' });
    expect(settle('allow_once', network)).toEqual({ kind: 'uncertain', action: 'allow_once', reason: 'unreadable' });
    const server = replyFromError({ status: 500, message: 'internal' });
    expect(settle('deny', server)).toEqual({ kind: 'uncertain', action: 'deny', reason: 'unreadable' });
    // A 200 whose body is not `{ ok: true }` (the API reads an unparseable body as {}) is not a confirmation.
    expect(settle('allow_once', { kind: 'ok', body: {} })).toEqual({
      kind: 'uncertain',
      action: 'allow_once',
      reason: 'unreadable',
    });
    expect(settle('allow_once', { kind: 'ok', body: { ok: true } })).toEqual({ kind: 'authorized', via: 'allow_once' });
    expect(settle('deny', { kind: 'ok', body: { ok: true } })).toEqual({ kind: 'refused', decision: 'deny' });
    expect(settle('not_now', { kind: 'ok', body: { ok: true } })).toEqual({ kind: 'refused', decision: 'not_now' });
    expect(settle('answer', { kind: 'ok', body: { ok: true } })).toEqual({ kind: 'authorized', via: 'answer' });
    // 404: E_EXPIRED (T4.30) is an expiry; any other no longer waits, and nobody here knows what left.
    expect(settle('allow_once', replyFromError({ status: 404, code: 'E_EXPIRED' }))).toEqual({ kind: 'expired' });
    expect(settle('allow_once', replyFromError({ status: 404, code: 'E_NOT_PENDING' }))).toEqual({
      kind: 'uncertain',
      action: 'allow_once',
      reason: 'not_pending',
    });
    expect(settle('deny', replyFromError({ status: 404 }))).toEqual({
      kind: 'uncertain',
      action: 'deny',
      reason: 'not_pending',
    });
    // Refused before the engine (token, schema): the request still waits, with the reason.
    expect(settle('allow_once', replyFromError({ status: 401, message: 'unauthorized' }), 'Session refusée.')).toEqual({
      kind: 'pending',
      notice: 'Session refusée.',
    });
    expect(settle('answer', replyFromError({ status: 400, code: 'E_SECRET_DETECTED' }))).toEqual({ kind: 'pending' });
    for (const reply of [network, server, { kind: 'ok', body: null } as const])
      for (const action of ['allow_once', 'deny', 'not_now', 'answer'] as const)
        expect(settle(action, reply).kind).toBe('uncertain');
  });

  it('puts back to pending a card the Node still lists, and keeps a confirmed decision', () => {
    const entries: ConsentEntry[] = [
      { item: item(), state: { kind: 'uncertain', action: 'allow_once', reason: 'unreadable' } },
      { item: item({ dropId: OTHER }), state: { kind: 'authorized', via: 'allow_once' } },
    ];
    const next = reconcile(entries, [item(), item({ dropId: OTHER })], 1_000);
    expect(next.entries.map((entry) => entry.state)).toEqual([
      { kind: 'pending', notice: STILL_WAITING },
      { kind: 'authorized', via: 'allow_once' },
    ]);
    expect(next.changed.map((entry) => entry.item.dropId)).toEqual([DROP]);
    // A new request arrives pending; a pending card that left the list (decided elsewhere) leaves without a guess.
    const third = item({ dropId: '0199c5a0-0000-7000-8000-000000000003', expiresAt: 5_000 });
    const after = reconcile(next.entries, [third], 1_000);
    expect(after.entries.map((entry) => [entry.item.dropId, entry.state.kind])).toEqual([
      [third.dropId, 'pending'],
      [OTHER, 'authorized'],
    ]);
    expect(after.changed).toEqual([]);
  });
});
