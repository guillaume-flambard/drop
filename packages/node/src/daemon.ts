import { capabilities } from '@drop/capabilities';
import { RelayClient } from '@drop/relay';
import { NodeEngine, type InboxItem } from './engine.ts';
import { openRouterFunder } from './funding.ts';
import { startLocalApi, type LocalApi } from './api.ts';
import type { DropHome } from './home.ts';
import { notify } from './notify.ts';

export interface Daemon {
  engine: NodeEngine;
  relay: RelayClient;
  api: LocalApi;
  uiUrl: string;
  stop(): Promise<void>;
}

export interface DaemonOptions {
  apiPort?: number;
  notifications?: boolean;
  log?: (line: string) => void;
}

/** `drop serve`: relay connection with reconnect, local API and UI, runner for published capabilities. */
export async function startDaemon(home: DropHome, options: DaemonOptions = {}): Promise<Daemon> {
  const identity = home.identity();
  const config = home.config();
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  // The engine is built before the relay client that delivers to it; the transport reads the client lazily.
  const link: { relay?: RelayClient } = {};
  const engine = new NodeEngine({
    identity,
    ownerKind: config.ownerKind,
    store: home,
    capabilities,
    transport: { send: (envelope) => (link.relay ? link.relay.send(envelope) : Promise.resolve('offline')) },
    log: (entry) => {
      log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    },
    payer: config.payer,
    ...(config.funding
      ? {
          funder: openRouterFunder(config.funding, {
            log: (code) => {
              log(code);
            },
          }),
        }
      : {}),
    onAdmission: (ticket) => {
      home.savePendingAdmission(ticket);
      link.relay?.retryNow();
    },
  });
  const relay = new RelayClient({
    identity,
    url: config.relayUrl,
    admission: () => home.pendingAdmission(),
    onEnvelope: (envelope) => {
      void engine.handleEnvelope(envelope).catch(() => {
        log('E_RUNNER envelope handling failed');
      });
    },
    onStatus: (status) => {
      log(`relay: ${status}`);
      if (status === 'connected') {
        home.clearPendingAdmission();
        void engine
          .flushOutbox()
          .then(() => engine.refreshCatalogs())
          .catch(() => {
            log('E_RUNNER flush failed');
          });
      }
    },
  });
  link.relay = relay;
  relay.start();

  const api = await startLocalApi({
    engine,
    token: home.localToken(),
    port: options.apiPort ?? config.apiPort,
    relayUrl: config.relayUrl,
    refreshCatalogs: async () => {
      await engine.refreshCatalogs();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    },
  });
  const uiUrl = `http://127.0.0.1:${String(api.port)}/?token=${home.localToken()}`;

  if (options.notifications ?? true) {
    engine.on('approval', (item: Extract<InboxItem, { kind: 'approval' }>) => {
      notify(`${item.requestedBy.displayName} a besoin d'aide`, item.card.title);
    });
    engine.on('review', (item: Extract<InboxItem, { kind: 'review' }>) => {
      notify('Résultat à relire avant envoi', item.title);
    });
  }

  const ticker = setInterval(() => {
    void engine.tick().catch(() => {
      log('E_RUNNER tick failed');
    });
  }, 1000);

  return {
    engine,
    relay,
    api,
    uiUrl,
    stop: async () => {
      clearInterval(ticker);
      relay.close();
      await api.close();
    },
  };
}
