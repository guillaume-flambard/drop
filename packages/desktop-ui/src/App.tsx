import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Inbox, UsersRound, Blocks, Handshake, BookOpenText, Wifi, RefreshCcw } from 'lucide-react';
import { Button } from './components/ui/button.tsx';
import { initials } from './lib/format.ts';
import { api } from './api.ts';
import { PanelContext, type PanelActions } from './panel/ui.tsx';
import type { PendingItem } from './panel/types.ts';
import type { WorkspaceData, StatusData, TeamData, ToolsData, FactsData, DropStatus, InternetData } from './types.ts';
import { OverviewView } from './views/overview.tsx';
import { TeamView } from './views/team.tsx';
import { AgentsView } from './views/agents.tsx';
import { SharingView } from './views/sharing.tsx';
import { FactsView } from './views/facts.tsx';
import { NetworkView } from './views/network.tsx';
import { RequestsView } from './views/requests.tsx';

export type Page = 'overview' | 'requests' | 'team' | 'agents' | 'sharing' | 'facts' | 'network';
const pages = [
  { id: 'overview', label: 'Vue d’ensemble', icon: LayoutGrid },
  { id: 'requests', label: 'Demandes', icon: Inbox },
  { id: 'team', label: 'Équipe', icon: UsersRound },
  { id: 'agents', label: 'Assistants', icon: Blocks },
  { id: 'sharing', label: 'Outils partagés', icon: Handshake },
  { id: 'facts', label: 'Faits publiés', icon: BookOpenText },
  { id: 'network', label: 'Connexion', icon: Wifi },
] as const;

const empty: WorkspaceData = {
  status: null,
  team: null,
  tools: null,
  facts: null,
  outbound: null,
  internet: null,
  pending: null,
};

const subtitles: Record<Page, { title: string; caption: string }> = {
  overview: {
    title: 'Un espace pour mieux collaborer.',
    caption: 'Ce qui se passe entre toi, ton équipe et tes assistants.',
  },
  requests: {
    title: 'À décider',
    caption: 'Les questions de tes collègues qui attendent ton accord. Rien ne part sans toi.',
  },
  team: { title: 'Ton équipe', caption: 'Les personnes avec qui tu échanges, sans partager tes accès.' },
  agents: {
    title: 'Tes assistants',
    caption: 'Connecte les assistants que tu utilises déjà. Rien n’est partagé automatiquement.',
  },
  sharing: {
    title: 'Ce que tu partages',
    caption: 'Choisis les outils que tes collègues peuvent interroger, après ton accord.',
  },
  facts: { title: 'Ce que tu publies', caption: 'Des informations que tu choisis de rendre disponibles à ton équipe.' },
  network: { title: 'Ta connexion', caption: 'Garde le contrôle de la façon dont les appareils communiquent.' },
};

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue. Réessaie.';
}

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [data, setData] = useState<WorkspaceData>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const liveVersion = useRef(0);
  const title = subtitles[page];

  const refresh = useCallback((): void => {
    setLoading(true);
    // Each endpoint is independent: an unavailable Internet service or fact store
    // must not prevent the team and assistant lists from being shown.
    const requests = [
      api<StatusData>('GET', '/ui/admin/status'),
      api<TeamData>('GET', '/ui/team'),
      api<ToolsData>('GET', '/ui/admin/tools'),
      api<FactsData>('GET', '/ui/facts'),
      api<{ drops: DropStatus[] }>('GET', '/ui/outbound'),
      api<InternetData>('GET', '/ui/admin/internet'),
      api<{ pending: PendingItem[] }>('GET', '/ui/pending'),
    ] as const;
    Promise.allSettled(requests)
      .then((parts) => {
        const extract = (index: number): unknown => {
          const result = parts[index];
          return result?.status === 'fulfilled' ? result.value : null;
        };
        const next: WorkspaceData = {
          status: extract(0) as StatusData | null,
          team: extract(1) as TeamData | null,
          tools: extract(2) as ToolsData | null,
          facts: extract(3) as FactsData | null,
          outbound: extract(4) as { drops: DropStatus[] } | null,
          internet: extract(5) as InternetData | null,
          pending: (extract(6) as { pending: PendingItem[] } | null)?.pending ?? null,
        };
        if (parts.every((result) => result.status === 'rejected')) setError('Le moteur local ne répond pas. Réessaie.');
        setData(next);
        setVersion((n) => n + 1);
      })
      .catch((e: unknown) => {
        setError(formatError(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates (T4.35): what waits and what this Node asked, without touching the forms of the other pages. A late
  // answer from an older read never overwrites a newer one.
  const refreshLive = useCallback((): void => {
    const mine = ++liveVersion.current;
    Promise.allSettled([
      api<{ pending: PendingItem[] }>('GET', '/ui/pending'),
      api<{ drops: DropStatus[] }>('GET', '/ui/outbound'),
    ]).then(
      ([pending, outbound]) => {
        if (mine !== liveVersion.current) return;
        setData((current) => ({
          ...current,
          ...(pending.status === 'fulfilled' ? { pending: pending.value.pending } : {}),
          ...(outbound.status === 'fulfilled' ? { outbound: outbound.value } : {}),
        }));
      },
      () => undefined,
    );
  }, []);

  // The Node says « change » on its event stream: the requests reload without a page reload.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (typeof EventSource === 'undefined' || !token) return;
    const events = new EventSource('/ui/events?token=' + encodeURIComponent(token));
    events.onmessage = () => {
      refreshLive();
    };
    return () => {
      events.close();
    };
  }, [refreshLive]);

  const announce = useCallback((text: string) => {
    // Cleared first, so that the same sentence twice is announced twice.
    setAnnouncement('');
    setTimeout(() => {
      setAnnouncement(text);
    }, 30);
  }, []);

  // The workspace's actions for the shared request list: one live region, the result banner, focus, live refresh.
  const actions = useMemo<PanelActions>(
    () => ({
      info: (text) => {
        setNotice(text);
        announce(text);
      },
      fail: (text) => {
        setError(text);
      },
      announce,
      focusTo: (key) => {
        let tries = 0;
        const attempt = () => {
          const target = document.querySelector<HTMLElement>('[data-focus="' + key + '"]');
          if (target) target.focus();
          else if (++tries < 20) setTimeout(attempt, 25);
        };
        setTimeout(attempt, 0);
      },
      refreshRequests: refreshLive,
    }),
    [announce, refreshLive],
  );

  const act = useCallback(
    (task: () => Promise<unknown>, successMessage: string, after?: () => void): void => {
      setBusy(true);
      setError('');
      task()
        .then(() => {
          setNotice(successMessage);
          announce(successMessage);
          after?.();
          refresh();
        })
        .catch((e: unknown) => {
          setError(formatError(e));
        })
        .finally(() => {
          setBusy(false);
        });
    },
    [refresh, announce],
  );

  const toPage = (next: Page) => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setPage(next);
    setError('');
    setNotice('');
  };
  const waiting = data.pending?.length ?? 0;
  const username = data.status?.displayName.split(' ')[0] || 'toi';
  const view = useMemo(() => {
    const props = { data, loading, busy, act, refresh, toPage, version };
    switch (page) {
      case 'overview':
        return <OverviewView {...props} />;
      case 'requests':
        return <RequestsView {...props} />;
      case 'team':
        return <TeamView {...props} />;
      case 'agents':
        return <AgentsView {...props} />;
      case 'sharing':
        return <SharingView {...props} />;
      case 'facts':
        return <FactsView {...props} />;
      case 'network':
        return <NetworkView {...props} />;
    }
  }, [act, busy, data, loading, page, refresh, version]);

  return (
    <PanelContext.Provider value={actions}>
      <div className="min-h-screen bg-background text-foreground lg:flex">
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>
        <aside className="sticky top-0 z-10 flex flex-col border-b border-border bg-card px-4 py-4 lg:h-screen lg:w-[228px] lg:shrink-0 lg:border-r lg:border-b-0 lg:px-4 lg:py-8">
          <div className="flex items-end justify-between px-3 lg:block">
            <div>
              <div className="text-[27px] leading-none font-bold tracking-[-.085em]">
                drop<span className="text-primary">.</span>
              </div>
              <p className="mt-2 text-[11px] tracking-[.01em] text-muted-foreground">Ton espace</p>
            </div>
            <span className="text-[11px] text-muted-foreground lg:hidden">La réponse, pas l’accès.</span>
          </div>
          <nav
            aria-label="Navigation principale"
            className="scrollbar-none mt-5 flex gap-1 overflow-x-auto pb-0.5 lg:mt-11 lg:flex-col"
          >
            {pages.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={page === item.id ? 'page' : undefined}
                  onClick={() => {
                    toPage(item.id);
                  }}
                  className={
                    'flex h-11 shrink-0 items-center gap-3 rounded-[11px] px-3 text-left text-[12.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 lg:w-full ' +
                    (page === item.id
                      ? 'bg-[#f0eef9] font-semibold text-[#5750a7] dark:bg-[#3b354e] dark:text-[#d3caff]'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground')
                  }
                >
                  <Icon size={17} strokeWidth={1.7} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.id === 'requests' && waiting > 0 ? (
                    <span className="ml-auto min-w-4 rounded-full bg-primary px-1.5 text-center text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
                      <span className="sr-only">, </span>
                      {waiting}
                      <span className="sr-only"> en attente</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto hidden border-t border-border px-2 pt-6 lg:flex lg:items-center lg:gap-3">
            <span
              aria-hidden="true"
              className="soft-avatar grid size-9 shrink-0 place-items-center rounded-xl text-[11px] font-semibold"
            >
              {initials(data.status?.displayName ?? 'Moi')}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold">
                {data.status?.displayName ?? 'Ton espace'}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={'size-1.5 rounded-full ' + (data.status?.relayConnected ? 'bg-[#4a9b79]' : 'bg-[#d2ab79]')}
                  aria-hidden="true"
                />
                {data.status
                  ? data.status.relayConnected
                    ? 'Équipe joignable'
                    : 'Connexion locale'
                  : 'Initialisation…'}
              </span>
            </span>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <main className="mx-auto max-w-[1140px] px-5 pt-8 pb-20 sm:px-9 sm:pt-12 xl:px-16 xl:pt-[56px]">
            <div className="mb-7 flex items-start justify-between gap-4 sm:mb-10">
              <div className="min-w-0">
                <p className="mb-2 text-[10px] font-semibold tracking-[.16em] text-muted-foreground uppercase">
                  DROP / TON ESPACE
                </p>
                {page === 'overview' ? (
                  <>
                    <h1 className="pretty-balance text-[31px] leading-[1.15] font-semibold tracking-[-.056em] sm:text-[38px]">
                      Bonjour, {username}.
                    </h1>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{title.caption}</p>
                  </>
                ) : (
                  <>
                    <h1 className="text-[31px] leading-[1.18] font-semibold tracking-[-.055em] sm:text-[36px]">
                      {title.title}
                    </h1>
                    <p className="mt-2 max-w-[610px] text-[13px] leading-relaxed text-muted-foreground">
                      {title.caption}
                    </p>
                  </>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Actualiser les informations"
                aria-label="Actualiser"
                disabled={loading}
                onClick={refresh}
              >
                <RefreshCcw className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
            {error ? (
              <div
                role="alert"
                className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-[#ddb7b8] bg-[#fdf7f7] px-4 py-3 text-[12px] text-[#9b5054] dark:bg-[#482f33] dark:text-[#f0b8b8]"
              >
                <span>{error}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setError('');
                  }}
                >
                  Fermer
                </button>
              </div>
            ) : null}
            {notice ? (
              <div className="mb-6 rounded-xl border border-[#d7e9df] bg-[#f2f8f4] px-4 py-3 text-[12px] text-[#39785c] dark:border-[#436351] dark:bg-[#2e4034] dark:text-[#b4d7bd]">
                {notice}
              </div>
            ) : null}
            <div className="motion-rise">{view}</div>
            <p className="mt-11 text-[11px] leading-relaxed text-muted-foreground">
              Drop ne donne pas accès aux outils de tes collègues. Les réponses restent soumises à leurs règles de
              partage.
            </p>
          </main>
        </div>
      </div>
    </PanelContext.Provider>
  );
}

export interface ViewProps {
  data: WorkspaceData;
  loading: boolean;
  busy: boolean;
  act: (task: () => Promise<unknown>, successMessage: string, after?: () => void) => void;
  refresh: () => void;
  toPage: (page: Page) => void;
  version: number;
}
