// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { OverviewView } from '../src/views/overview.tsx';
import type { WorkspaceData } from '../src/types.ts';
import type { ViewProps } from '../src/App.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const props = (blocked: boolean, toPage: ViewProps['toPage']): ViewProps => ({
  data: {
    status: { displayName: 'Local owner', relayConnected: false, security: { replayStorageBlocked: blocked } },
    team: null,
    tools: null,
    facts: null,
    outbound: null,
    pending: null,
    internet: null,
  } satisfies WorkspaceData,
  loading: false,
  busy: false,
  act: vi.fn(),
  refresh: vi.fn(),
  toPage,
  version: 0,
  pendingFailed: false,
});

describe('T3.1d owner replay security alert', () => {
  it('appears only during replay corruption, accessible and navigates to diagnostic', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const toPage = vi.fn();
    try {
      await act(async () => {
        root.render(<OverviewView {...props(false, toPage)} />);
        await Promise.resolve();
      });
      expect(host.querySelector('section[role="alert"]')).toBeNull();
      await act(async () => {
        root.render(<OverviewView {...props(true, toPage)} />);
        await Promise.resolve();
      });
      const warning = host.querySelector('section[role="alert"]');
      expect(warning?.textContent).toContain('Vérification de sécurité indisponible');
      expect(warning?.textContent).toContain('Drop refuse les nouvelles demandes');
      const button = [...host.querySelectorAll('button')].find((node) =>
        node.textContent.includes('Voir le diagnostic'),
      );
      expect(button).toBeDefined();
      await act(async () => {
        if (!button) throw new Error('Diagnostic button missing');
        button.click();
        await Promise.resolve();
      });
      expect(toPage).toHaveBeenCalledWith('diagnostic');
    } finally {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      host.remove();
    }
  });
});
