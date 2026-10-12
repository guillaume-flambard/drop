// @vitest-environment happy-dom
/**
 * Component tests of « Ton espace » (T4.37): the real App, rendered in happy-dom, talking to a fake local Node through a
 * stubbed fetch. The clipboard is stubbed too: what the owner copies is what the test reads.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Call {
  method: string;
  path: string;
}
type Reply = { status?: number; body: unknown };

const LOG_DIR = '/Users/camille/.drop/logs';
const DIAGNOSTIC = [
  'Diagnostic drop, préparé le 2026-10-12T08:00:00.000Z',
  'App : 0.2.0',
  '{"event":"relay_status","code":"E_OFFLINE"}',
  '2 lignes retirées parce qu’elles ressemblaient à un secret.',
].join('\n');

let calls: Call[] = [];
let routes: Record<string, Reply> = {};
let copied: string[] = [];

function installNode(): void {
  calls = [];
  copied = [];
  routes = {
    'GET /ui/admin/status': {
      body: {
        displayName: 'Camille',
        relayConnected: true,
        version: { app: '0.2.0', engine: '0.1.0' },
        logDir: LOG_DIR,
      },
    },
    'GET /ui/team': { body: { team: null, members: [] } },
    'GET /ui/admin/tools': { body: { agents: [], shared: {}, payer: 'requester', links: [], gateways: [] } },
    'GET /ui/facts': { body: { facts: [], peers: [] } },
    'GET /ui/outbound': { body: { drops: [] } },
    'GET /ui/admin/internet': { body: { settings: { mode: 'off' }, state: 'off' } },
    'GET /ui/admin/diagnostic': {
      body: { text: DIAGNOSTIC, removed: 2, logDir: LOG_DIR, logPath: LOG_DIR + '/daemon.log' },
    },
    'POST /ui/admin/logs/open': { body: { ok: true } },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const call = { method: init?.method ?? 'GET', path };
      calls.push(call);
      const reply = routes[call.method + ' ' + path] ?? { body: { ok: true } };
      const status = reply.status ?? 200;
      return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(reply.body) });
    }),
  );
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (value: string) => {
        copied.push(value);
        return Promise.resolve();
      },
    },
  });
}

let root: Root | undefined;
let host: HTMLElement | undefined;

async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount(): Promise<HTMLElement> {
  window.history.replaceState(null, '', '/workspace?token=test-token');
  host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(<App />);
    await Promise.resolve();
  });
  await settle(20);
  return host;
}

function text(): string {
  return (host?.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
}

function button(name: string): HTMLButtonElement {
  const all = [...document.querySelectorAll<HTMLButtonElement>('button')];
  const found = all.find((item) => (item.getAttribute('aria-label') ?? item.textContent).trim() === name);
  if (!found) throw new Error('no button ' + name + ' among: ' + all.map((b) => b.textContent).join(' | '));
  return found;
}

function hasButton(name: string): boolean {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].some(
    (item) => (item.getAttribute('aria-label') ?? item.textContent).trim() === name,
  );
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
  await settle(10);
}

beforeEach(() => {
  installNode();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

describe('workspace diagnostic (T4.37)', () => {
  it('shows the versions and the logs path, opens the folder and copies the path', async () => {
    await mount();
    await click(button('Diagnostic'));
    expect(text()).toContain('App 0.2.0');
    expect(text()).toContain('Moteur 0.1.0');
    expect(text()).toContain(LOG_DIR);
    await click(button('Ouvrir le dossier'));
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/ui/admin/logs/open')).toHaveLength(1);
    await click(button('Copier le chemin'));
    expect(copied).toEqual([LOG_DIR]);
    // Nothing is fetched or sent before the owner asks for the diagnostic.
    expect(calls.some((call) => call.path === '/ui/admin/diagnostic')).toBe(false);
  });

  it('shows the redacted diagnostic for review before offering to copy it', async () => {
    await mount();
    await click(button('Diagnostic'));
    expect(hasButton('Copier le diagnostic')).toBe(false);
    await click(button('Préparer le diagnostic'));
    const area = host?.querySelector('textarea');
    expect(area?.value).toBe(DIAGNOSTIC);
    expect(area?.readOnly).toBe(true);
    expect(text()).toContain('2 lignes retirées');
    expect(text()).toContain('Relis-le');
    await click(button('Copier le diagnostic'));
    expect(copied).toEqual([DIAGNOSTIC]);
  });

  it('shows the code it receives with a sentence and copyable technical details', async () => {
    routes['POST /ui/admin/logs/open'] = {
      status: 500,
      body: { error: 'E_OPEN', message: 'Impossible d’ouvrir le dossier des journaux <b>ici</b>.' },
    };
    await mount();
    await click(button('Diagnostic'));
    await click(button('Ouvrir le dossier'));
    const alert = host?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Impossible d’ouvrir le dossier des journaux <b>ici</b>.');
    // Inserted as text: no element came from the message.
    expect(alert?.querySelector('b')).toBeNull();
    const details = alert?.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('Détails techniques');
    expect(details?.textContent).toContain('E_OPEN');
    expect(details?.textContent).toContain('500');
    expect(details?.textContent).toContain('POST /ui/admin/logs/open');
    await click(button('Copier les détails'));
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain('Code : E_OPEN');
    expect(copied[0]).toContain('Statut HTTP : 500');
    expect(copied[0]).toContain('Route : POST /ui/admin/logs/open');

    // A bare code from the Node reads as its translated sentence.
    routes['POST /ui/admin/logs/open'] = { status: 400, body: { error: 'E_SECRET_DETECTED' } };
    await click(button('Fermer'));
    await click(button('Ouvrir le dossier'));
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain('Secret détecté');
    expect(host?.querySelector('[role="alert"] details')?.textContent).toContain('E_SECRET_DETECTED');
  });
});
