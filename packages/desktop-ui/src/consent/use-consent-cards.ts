/**
 * The consent cards of one surface (T4.35): their states, the call to `/ui/decide`, the announcement in the surface's
 * single live region and the focus. The rules live in `model.ts`; this hook only wires them to the Node and the page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { failureText } from '../panel/logic.ts';
import type { ApprovalItem, PendingItem } from '../panel/types.ts';
import { usePanel } from '../panel/ui.tsx';
import {
  announcement,
  begin,
  leftAnnouncement,
  dismiss as dismissEntry,
  reconcile,
  replyFromError,
  settle,
  update,
  waiting,
  type ConsentEntry,
  type ConsentState,
  type Decision,
  type NodeReply,
} from './model.ts';

export interface ConsentCards {
  entries: ConsentEntry[];
  decide: (dropId: string, decision: Decision) => Promise<void>;
  /** « Répondre moi-même » starts: false when the card no longer waits here. */
  startAnswer: (dropId: string) => boolean;
  /** The reply to `/ui/answer`; returns the card's new state (pending: the composer shows the refusal). */
  finishAnswer: (dropId: string, reply: NodeReply) => ConsentState;
  dismiss: (dropId: string) => void;
}

function focused(dropId: string): boolean {
  return document.activeElement?.closest('[data-focus="' + dropId + ':card"]') != null;
}

export function useConsentCards(pending: readonly PendingItem[] | null, now: number): ConsentCards {
  const panel = usePanel();
  const [entries, setEntries] = useState<ConsentEntry[]>([]);
  const current = useRef<ConsentEntry[]>([]);

  const commit = useCallback((next: ConsentEntry[]) => {
    current.current = next;
    setEntries(next);
  }, []);

  const apply = useCallback(
    (items: readonly ApprovalItem[] | null, at: number) => {
      const result = reconcile(current.current, items, at);
      if (!items && result.changed.length === 0) return;
      // A card that expires under the focus loses its buttons: the focus stays on the card itself. One that leaves
      // under the focus hands it to the list.
      const refocus = result.changed.filter((entry) => !waiting(entry.state) && focused(entry.item.dropId));
      const lost = result.removed.some((entry) => focused(entry.item.dropId));
      commit(result.entries);
      const said = [...result.changed.map(announcement), ...result.removed.map(leftAnnouncement)];
      if (said.length > 0) panel.announce(said.join(' '));
      for (const entry of refocus) panel.focusTo(entry.item.dropId + ':card');
      if (lost) panel.focusTo('consent-list');
    },
    [commit, panel],
  );

  useEffect(() => {
    if (pending)
      apply(
        pending.filter((item): item is ApprovalItem => item.kind === 'approval'),
        Date.now(),
      );
  }, [pending, apply]);

  useEffect(() => {
    apply(null, now);
  }, [now, apply]);

  const finish = useCallback(
    (dropId: string, state: ConsentState) => {
      const entry = current.current.find((candidate) => candidate.item.dropId === dropId);
      if (!entry) return;
      commit(update(current.current, dropId, state));
      panel.announce(announcement({ item: entry.item, state }));
      if (!waiting(state)) panel.focusTo(dropId + ':card');
      panel.refreshRequests();
    },
    [commit, panel],
  );

  const decide = useCallback(
    async (dropId: string, decision: Decision) => {
      const entry = current.current.find((candidate) => candidate.item.dropId === dropId);
      const started = entry ? begin(entry.state, decision) : null;
      if (!started) return;
      commit(update(current.current, dropId, started));
      let reply: NodeReply;
      let reason: string | undefined;
      try {
        reply = { kind: 'ok', body: await api('POST', '/ui/decide', new URLSearchParams({ dropId, decision })) };
      } catch (error) {
        reply = replyFromError(error);
        reason = failureText(error);
      }
      finish(dropId, settle(decision, reply, reason));
    },
    [commit, finish],
  );

  const startAnswer = useCallback(
    (dropId: string) => {
      const entry = current.current.find((candidate) => candidate.item.dropId === dropId);
      const started = entry ? begin(entry.state, 'answer') : null;
      if (!started) return false;
      commit(update(current.current, dropId, started));
      return true;
    },
    [commit],
  );

  const finishAnswer = useCallback(
    (dropId: string, reply: NodeReply) => {
      const state = settle('answer', reply);
      if (state.kind === 'pending') {
        commit(update(current.current, dropId, state));
        // The Node may have taken the card out before refusing: its list says whether it still waits.
        panel.refreshRequests();
      } else finish(dropId, state);
      return state;
    },
    [commit, finish, panel],
  );

  const dismiss = useCallback(
    (dropId: string) => {
      const index = current.current.findIndex((entry) => entry.item.dropId === dropId);
      const next = dismissEntry(current.current, dropId);
      if (next.length === current.current.length) return;
      commit(next);
      // The focus was on « Masquer », which leaves with its card: the next card takes it, or the list.
      const neighbour = next[Math.min(index, next.length - 1)];
      panel.focusTo(neighbour ? neighbour.item.dropId + ':card' : 'consent-list');
    },
    [commit, panel],
  );

  return { entries, decide, startAnswer, finishAnswer, dismiss };
}
