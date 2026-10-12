// @vitest-environment happy-dom
/**
 * « Demandes » in the workspace window (T4.35): the list of what waits, kept up to date by the Node's event stream,
 * decided through the same consent card as the panel, announced by the workspace's single live region.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';
import type { ApprovalItem } from '../src/panel/types.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DROP = '0199c5a0-0000-7000-8000-000000000001';
const TITLE = 'Résumer les erreurs de production';

const request: ApprovalItem = {
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

let pending: ApprovalItem[] = [];
let calls: { method: string; path: string; body: string }[] = [];
let stream: { url: string; onmessage: (() => void) | null } | null = null;

function opened(source: { url: string; onmessage: (() => void) | null }): void {
  stream = source;
}

beforeEach(() => {
  pending = [];
  calls = [];
  stream = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: typeof init?.body === 'string' ? init.body : '' });
      let body: unknown = { ok: true };
      if (method === 'POST' && path === '/ui/decide') pending = [];
      else if (path === '/ui/pending') body = { pending };
      else if (path === '/ui/outbound') body = { drops: [] };
      else if (path === '/ui/admin/status') body = { displayName: 'Camille Martin', relayConnected: true };
      else if (path === '/ui/team') body = { team: null, members: [] };
      else if (path === '/ui/admin/tools') body = { agents: [], shared: {} };
      else if (path === '/ui/facts') body = { facts: [], peers: [] };
      else if (path === '/ui/admin/internet') body = { settings: { mode: 'off' }, state: 'off' };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
  vi.stubGlobal(
    'EventSource',
    class {
      onmessage: (() => void) | null = null;
      url: string;
      constructor(url: string) {
        this.url = url;
        opened(this);
      }
      close(): void {
        stream = null;
      }
    },
  );
  vi.stubGlobal('scrollTo', () => undefined);
});

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await Promise.resolve();
  });
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 80; i += 1) {
    if (check()) return;
    await settle(10);
  }
  throw new Error('timed out waiting for ' + label);
}

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.focus();
    element.click();
    await Promise.resolve();
  });
  await settle(60);
}

function nav(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('nav button')].find((item) =>
    item.textContent.startsWith(name),
  );
  if (!found) throw new Error('no nav item ' + name);
  return found;
}

function plain(value: string | null | undefined): string {
  return (value ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

describe('workspace requests (T4.35)', () => {
  it('lists pending requests, follows the live stream and decides through the same card as the panel', async () => {
    window.history.replaceState(null, '', '/workspace?token=test-token');
    host = document.createElement('div');
    document.body.append(host);
    const created = createRoot(host);
    root = created;
    await act(async () => {
      created.render(<App />);
      await Promise.resolve();
    });
    await until(() => calls.some((call) => call.path === '/ui/pending'), 'first read');
    expect(stream?.url).toBe('/ui/events?token=test-token');
    // The single live region is there from the first render, before anything is announced.
    const regions = [...document.querySelectorAll('[aria-live]')];
    expect(regions).toHaveLength(1);
    expect(nav('Demandes').textContent).toBe('Demandes');

    // A request arrives: the stream brings it, without reloading the page.
    pending = [request];
    await act(async () => {
      stream?.onmessage?.();
      await Promise.resolve();
    });
    await until(() => nav('Demandes').textContent.includes('1'), 'count');
    expect(nav('Demandes').textContent).toBe('Demandes, 1 en attente');
    await press(nav('Demandes'));
    await until(() => document.querySelector('[data-slot="consent-card"]') !== null, 'card');
    const card = document.querySelector<HTMLElement>('[data-slot="consent-card"]');
    expect(plain(card?.textContent)).toContain('Julie a besoin d’aide');
    expect(plain(card?.textContent)).toContain('Expire dans');

    const deny = document.querySelector<HTMLButtonElement>('button[aria-label="Refuser : ' + TITLE + '"]');
    if (!deny) throw new Error('no Refuser');
    await press(deny);
    expect(calls.filter((call) => call.method === 'POST').map((call) => [call.path, call.body])).toEqual([
      ['/ui/decide', 'dropId=' + DROP + '&decision=deny'],
    ]);
    await until(() => card?.getAttribute('data-state') === 'refused', 'refused');
    expect(document.activeElement).toBe(card);
    expect(plain(card?.textContent)).toContain('RefuséeRien n’a été envoyé à Julie.');
    await settle(60);
    expect(plain(regions[0]?.textContent)).toBe('Refusée : ' + TITLE + '. Rien n’a été envoyé à Julie.');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    await until(() => nav('Demandes').textContent === 'Demandes', 'count cleared');
  });
});
