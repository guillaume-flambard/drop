// @vitest-environment happy-dom
/**
 * The shared consent card in a real surface (T4.35): the menu bar panel, rendered in happy-dom, against a fake local
 * Node. Focus after a decision, the single live region, a blocked button that stays focusable, an unreadable reply.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelApp from '../src/panel/PanelApp.tsx';
import { BLOCKED_REASON } from '../src/consent/model.ts';
import type { ApprovalItem } from '../src/panel/types.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DROP = '0199c5a0-0000-7000-8000-000000000001';
const TITLE = 'Résumer les erreurs de production';

function approval(): ApprovalItem {
  return {
    kind: 'approval',
    dropId: DROP,
    card: {
      capabilityId: 'production.error_summary',
      title: TITLE,
      receives: ['le nombre d’erreurs par service'],
      neverReceives: ['les lignes de log brutes'],
      sensitivity: 'low',
      executorName: 'VPS',
    },
    inputPreview: 'Quelles erreurs hier soir ?',
    purpose: 'Préparer le point d’incident.',
    requestedBy: { displayName: 'Julie', agent: 'claude_code' },
    expiresAt: Date.now() + 9 * 60_000,
  };
}

type Reply = { status: number; body: unknown } | 'network' | Promise<{ status: number; body: unknown }>;
let decideReply: () => Reply = () => ({ status: 200, body: { ok: true } });
let decided: string[] = [];
let pending: ApprovalItem[] = [];

function installNode(): void {
  decided = [];
  pending = [approval()];
  decideReply = () => ({ status: 200, body: { ok: true } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      let reply: { status: number; body: unknown } = { status: 200, body: { ok: true } };
      if (method === 'POST' && path === '/ui/decide') {
        decided.push(typeof init?.body === 'string' ? init.body : '');
        // The Node removes the card once it answers, whatever the answer.
        pending = [];
        const planned = decideReply();
        if (planned === 'network') throw new TypeError('Failed to fetch');
        reply = await planned;
      } else if (method === 'POST' && path === '/ui/answer') {
        decided.push('answer');
        pending = [];
      } else if (path === '/ui/pending') reply = { status: 200, body: { pending } };
      else if (path === '/ui/outbound') reply = { status: 200, body: { drops: [] } };
      else if (path === '/ui/admin/status')
        reply = { status: 200, body: { displayName: 'Camille', relayConnected: true } };
      return { ok: reply.status < 400, status: reply.status, json: () => Promise.resolve(reply.body) };
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
}

let root: Root | undefined;
let host: HTMLElement | undefined;

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(): Promise<void> {
  window.history.replaceState(null, '', '/app?token=test-token');
  host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(<PanelApp />);
    await Promise.resolve();
  });
  for (let i = 0; i < 50 && !card(); i += 1) await settle(10);
}

function card(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="consent-card"]');
}

function plain(value: string | null | undefined): string {
  return (value ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

function button(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('button[aria-label="' + label + '"]');
  if (!found) throw new Error('no button ' + label);
  return found;
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.focus();
    element.click();
    await Promise.resolve();
  });
  await settle(60);
}

/** The panel's live regions: its announcements and its connection state, both present from the first render. */
function regions(): Element[] {
  return [...document.querySelectorAll('[aria-live]')].filter((node) => node.getAttribute('aria-live') !== 'off');
}

beforeEach(() => {
  installNode();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await Promise.resolve();
  });
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('consent card (T4.35)', () => {
  it('after a decision the card takes the focus and the single live region announces its state', async () => {
    await mount();
    const before = regions();
    expect(before).toHaveLength(2);
    expect(card()?.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    await press(button('Refuser : ' + TITLE));
    expect(decided).toEqual(['dropId=' + DROP + '&decision=deny']);
    await settle(60);
    const decidedCard = card();
    expect(decidedCard?.getAttribute('data-state')).toBe('refused');
    expect(document.activeElement).toBe(decidedCard);
    expect(plain(decidedCard?.textContent)).toContain('RefuséeRien n’a été envoyé à Julie.');
    // The countdown and the buttons gave way to the state; the card still has no live region of its own.
    expect(plain(decidedCard?.textContent)).not.toContain('Expire dans');
    expect(decidedCard?.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    const described = decidedCard?.getAttribute('aria-describedby') ?? '';
    expect(plain(document.getElementById(described)?.textContent)).toContain('Rien n’a été envoyé à Julie.');
    expect(regions()).toEqual(before);
    expect(
      before.some((node) => plain(node.textContent) === 'Refusée : ' + TITLE + '. Rien n’a été envoyé à Julie.'),
    ).toBe(true);
  });

  it('keeps a blocked button focusable with its reason while the decision is in flight', async () => {
    let release: (value: { status: number; body: unknown }) => void = () => undefined;
    decideReply = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    await mount();
    const allow = button('Autoriser une fois : ' + TITLE);
    await press(allow);
    expect(document.activeElement).toBe(allow);
    expect(card()?.getAttribute('data-state')).toBe('deciding');
    for (const label of ['Reporter', 'Refuser', 'Autoriser une fois']) {
      const blocked = button(label + ' : ' + TITLE);
      expect(blocked.disabled).toBe(false);
      expect(blocked.getAttribute('aria-disabled')).toBe('true');
      expect(document.getElementById(blocked.getAttribute('aria-describedby') ?? '')?.textContent).toBe(BLOCKED_REASON);
    }
    // A second press, on the same button or another, sends nothing.
    await press(allow);
    await press(button('Refuser : ' + TITLE));
    expect(decided).toHaveLength(1);
    await act(async () => {
      release({ status: 200, body: { ok: true } });
      await Promise.resolve();
    });
    await settle(60);
    expect(card()?.getAttribute('data-state')).toBe('authorized');
    expect(plain(card()?.textContent)).toContain('Seul le résultat de cette demande partira vers Julie.');
    expect(document.activeElement).toBe(card());
  });

  it('shows an unreadable reply as uncertain on the card, never as refused', async () => {
    decideReply = () => ({ status: 500, body: { error: 'internal' } });
    await mount();
    await press(button('Autoriser une fois : ' + TITLE));
    expect(card()?.getAttribute('data-state')).toBe('uncertain');
    expect(plain(card()?.textContent)).toContain('IncertaineImpossible de confirmer ce qui a été envoyé à Julie.');
    expect(plain(card()?.textContent)).not.toContain('Rien n’a été envoyé');
    expect(document.querySelector('[role="alert"]')).toBeNull();
    // A network failure reads the same: the refusal may or may not have reached the Node.
    await act(async () => {
      root?.unmount();
      await Promise.resolve();
    });
    host?.remove();
    installNode();
    decideReply = () => 'network';
    await mount();
    await press(button('Refuser : ' + TITLE));
    expect(card()?.getAttribute('data-state')).toBe('uncertain');
    expect(plain(card()?.textContent)).toContain(
      'Impossible de confirmer ta décision. Sans ton accord, rien n’est envoyé.',
    );
  });

  it('shows a hand-written answer as Répondue, on the card that keeps the focus', async () => {
    await mount();
    await press(button('Répondre moi-même : ' + TITLE));
    const area = document.querySelector('textarea');
    if (!area) throw new Error('no textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(area, 'Deux erreurs.');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
    await press(
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === 'Relire la réponse',
      ) as HTMLButtonElement,
    );
    await press(button('Envoyer ta réponse : ' + TITLE));
    expect(decided).toEqual(['answer']);
    await settle(60);
    expect(card()?.getAttribute('data-state')).toBe('authorized');
    expect(plain(card()?.textContent)).toContain('RépondueSeule ta réponse partira vers Julie.');
    expect(document.activeElement).toBe(card());
    expect(document.querySelector('textarea')).toBeNull();
  });
});
