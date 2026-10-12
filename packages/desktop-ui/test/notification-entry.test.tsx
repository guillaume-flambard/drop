// @vitest-environment happy-dom
/**
 * The panel opened from a request notification (T4.30): the real panel in happy-dom, a fake local Node behind fetch.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelApp from '../src/panel/PanelApp.tsx';
import { NO_LONGER_WAITING, requestEntry } from '../src/panel/notification-entry.ts';
import type { ApprovalItem, PendingItem, ReviewItem } from '../src/panel/types.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DROP = '0199c5a0-0000-7000-8000-000000000001';
const OTHER = '0199c5a0-0000-7000-8000-000000000003';
const REVIEW = '0199c5a0-0000-7000-8000-000000000002';

function approval(dropId: string, title: string): ApprovalItem {
  return {
    kind: 'approval',
    dropId,
    card: {
      capabilityId: 'production.error_summary',
      title,
      receives: ['le nombre d’erreurs par service'],
      neverReceives: ['les lignes de log brutes'],
      sensitivity: 'low',
      executorName: 'VPS',
    },
    inputPreview: 'Quelles erreurs hier soir ? '.repeat(12),
    purpose: 'Préparer le point d’incident.',
    requestedBy: { displayName: 'Julie Moreau', agent: 'claude_code' },
    expiresAt: Date.now() + 9 * 60_000,
  };
}

const review: ReviewItem = {
  kind: 'review',
  dropId: REVIEW,
  title: 'État des tickets',
  output: { ouverts: 12 },
  expiresAt: Date.now() + 60_000,
};

let pending: PendingItem[] = [];
let posts: string[] = [];
let root: Root | undefined;
let host: HTMLElement | undefined;

beforeEach(() => {
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') posts.push(path);
      const body =
        path === '/ui/pending'
          ? { pending }
          : path === '/ui/outbound'
            ? { drops: [] }
            : path === '/ui/admin/status'
              ? { displayName: 'Camille', relayConnected: true }
              : { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
  vi.stubGlobal(
    'EventSource',
    class {
      onmessage: (() => void) | null = null;
      close(): void {
        this.onmessage = null;
      }
    },
  );
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await Promise.resolve();
  });
  host?.remove();
  root = undefined;
  host = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(query: string): Promise<void> {
  window.history.replaceState(null, '', '/app?token=test-token' + query);
  host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(<PanelApp />);
    await Promise.resolve();
  });
  for (let i = 0; i < 40 && !host.textContent.includes('a besoin') && !host.textContent.includes('plus de'); i += 1)
    await settle(10);
  await settle(80);
}

describe('notification entry (T4.30)', () => {
  it('AC opens the full card of the notified request, focused on Pas maintenant, never on Autoriser', async () => {
    pending = [approval(OTHER, 'Lister les incidents'), approval(DROP, 'Résumer les erreurs de production')];
    await mount('&request=' + DROP);
    // The notified card, not the first one, takes the focus, on its safe default.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Reporter : Résumer les erreurs de production');
    // The whole question is there, where the notification cut it at 200 characters.
    expect(host?.textContent).toContain(approval(DROP, '').inputPreview.trim());
    // Only the token stays in the address, and arriving decided nothing.
    expect(window.location.search).toBe('?token=test-token');
    expect(posts).toEqual([]);
  });

  it('AC says so when the notified request no longer waits, and decides nothing', async () => {
    pending = [approval(OTHER, 'Lister les incidents')];
    await mount('&request=' + DROP);
    expect(host?.textContent).toContain(NO_LONGER_WAITING);
    expect(window.location.search).toBe('?token=test-token');
    expect(posts).toEqual([]);
  });

  it('AC lands on the notified card of an open panel without reloading it, so a draft answer survives', async () => {
    pending = [approval(OTHER, 'Lister les incidents'), approval(DROP, 'Résumer les erreurs de production')];
    await mount('');
    const compose = document.querySelector<HTMLButtonElement>(
      '[aria-label="Répondre moi-même : Lister les incidents"]',
    );
    await act(async () => {
      compose?.click();
      await Promise.resolve();
    });
    await settle(30);
    const field = document.querySelector<HTMLTextAreaElement>('textarea');
    expect(field).not.toBeNull();
    await act(async () => {
      if (field) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(field, 'Brouillon en cours');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await Promise.resolve();
    });
    // What the app does for « Voir » on a loaded panel: only the fragment changes.
    await act(async () => {
      window.location.hash = 'request=' + DROP;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    await settle(120);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Reporter : Résumer les erreurs de production');
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Brouillon en cours');
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?token=test-token');
    expect(posts).toEqual([]);
  });

  it('lands on a review in the list, and ignores an identifier that is not one', () => {
    expect(requestEntry([review], REVIEW)).toEqual({ list: true });
    expect(requestEntry([approval(DROP, 'x')], DROP)).toEqual({ focus: DROP + ':not_now' });
    expect(requestEntry([], DROP)).toEqual({ notice: NO_LONGER_WAITING });
  });

  it('drops a malformed request parameter from the address without acting on it', async () => {
    pending = [approval(DROP, 'Résumer les erreurs de production')];
    await mount('&request=%3Cscript%3E');
    expect(window.location.search).toBe('?token=test-token');
    expect(host?.textContent).not.toContain(NO_LONGER_WAITING);
    expect(posts).toEqual([]);
  });
});
