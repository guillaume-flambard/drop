import { capabilities, privateCapabilities } from '@drop/capabilities';
import { DropError, NodeIdSchema } from '@drop/protocol';
import { RelayClient } from '@drop/relay';
import { NodeEngine, type InboxItem } from './engine.ts';
import { detectAgents } from './detect.ts';
import { openRouterFunder } from './funding.ts';
import { applyOnboarding, manualOnboarding, previewOnboarding } from './onboarding.ts';
import { isAgentKind, shareDetected } from './share.ts';
import { runAgentCall } from './assistant.ts';
import { startLocalApi, type LocalApi } from './api.ts';
import type { DropHome } from './home.ts';
import { notify } from './notify.ts';
import { LanService } from './lan.ts';
import { mdnsDiscovery } from './lan-mdns.ts';
import {
  IrohService,
  assertInternetAllowed,
  irohBinary,
  privateSocket,
  relayChoice,
  sendInOrder,
  type InternetSettings,
} from './iroh.ts';
import { addProject, listProjects, removeProject } from './projects.ts';

export interface Daemon {
  engine: NodeEngine;
  relay: RelayClient;
  lan: LanService;
  /** Internet by iroh (T4.2b): replaced when the owner changes the relay. */
  iroh(): IrohService;
  api: LocalApi;
  uiUrl: string;
  /** The menu bar panel (T2.4). */
  panelUrl: string;
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
  const token = home.localToken();
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  // The engine is built before the relay client that delivers to it; the transport reads the client lazily.
  const link: { relay?: RelayClient; lan?: LanService; iroh?: IrohService; apiPort?: number } = {};
  // An unreadable local-network key turns the local mode off, logged, rather than inventing a new identity silently.
  let lanKey: string | undefined;
  try {
    lanKey = home.lanKey();
  } catch {
    log(JSON.stringify({ at: new Date().toISOString(), event: 'lan_key_unreadable', code: 'E_LAN_KEY' }));
  }
  const lanEnabled = lanKey !== undefined && config.lan && process.env.DROP_LAN !== 'off';
  const engine = new NodeEngine({
    identity,
    ...(lanKey ? { lanKey } : {}),
    ownerKind: config.ownerKind,
    store: home,
    capabilities: config.profile === 'private' && config.network ? privateCapabilities(config.network) : capabilities,
    // A direct local session first (T4.2), then iroh (T4.2b), then the configured relay; otherwise the outbox.
    transport: {
      send: (envelope) => sendInOrder(envelope, [link.lan, link.iroh], link.relay),
    },
    log: (entry) => {
      log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    },
    payer: config.payer,
    privateProfile: config.profile === 'private',
    agents: () => detectAgents().flatMap((agent) => (agent.installed ? [agent.label] : [])),
    ...(config.funding
      ? {
          funder: openRouterFunder(config.funding, {
            log: (code) => {
              log(code);
            },
          }),
        }
      : {}),
    // A linked assistant's call runs the requester tools against this node's own local API (T2.13).
    onAgentCall: (call) =>
      config.profile === 'private'
        ? Promise.reject(new DropError('E_DENIED', 'E_DENIED cloud gateway disabled'))
        : runAgentCall(`http://127.0.0.1:${String(link.apiPort ?? config.apiPort)}`, token, call),
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
          .then(() => engine.announceTeam())
          .then(() => engine.refreshCatalogs())
          .catch(() => {
            log('E_RUNNER flush failed');
          });
      }
    },
  });
  link.relay = relay;
  relay.start();

  const lan = new LanService({
    identity,
    discovery: mdnsDiscovery(),
    canReach: (nodeId) => engine.canReachDirectly(nodeId),
    canAccept: (nodeId) => engine.canAcceptDirectly(nodeId),
    announcement: () => engine.lanAnnouncement(),
    recognizes: (nodeId, seen) => engine.lanRecognizes(nodeId, seen),
    knockSecrets: () => engine.lanKnockSecrets(),
    secretFor: (nodeId) => engine.lanSecretFor(nodeId),
    onEnvelope: (envelope) => {
      void engine.handleEnvelope(envelope).catch(() => {
        log('E_RUNNER envelope handling failed');
      });
    },
    enabled: lanEnabled,
    log: (entry) => {
      log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    },
  });
  link.lan = lan;
  await lan.start();
  // The private profile never reaches a third party (D34): checked at start too, for a file edited by hand.
  const internetAllowed = (settings: InternetSettings): void => {
    assertInternetAllowed(settings, config);
  };
  let internet: InternetSettings = { mode: 'off' };
  try {
    internet = home.internet();
    internetAllowed(internet);
  } catch {
    internet = { mode: 'off' };
    log(JSON.stringify({ at: new Date().toISOString(), event: 'internet_settings_refused', code: 'E_IROH_SETTINGS' }));
  }
  const startIroh = async (settings: InternetSettings): Promise<IrohService> => {
    const relayUrl = relayChoice(settings);
    const service = new IrohService({
      identity,
      binary: irohBinary(),
      enabled: settings.mode !== 'off' && process.env.DROP_INTERNET !== 'off',
      ...(relayUrl ? { relay: relayUrl } : {}),
      ...(config.profile === 'private' ? { allowSocket: privateSocket } : {}),
      access: () => engine.irohAccess(),
      addressOf: (nodeId) => engine.irohAddressOf(nodeId),
      onEnvelope: (envelope) => {
        void engine.handleEnvelope(envelope).catch(() => {
          log('E_RUNNER envelope handling failed');
        });
      },
      // Peers learn where to reach this node when the program starts and whenever its addresses change.
      onAddress: (address) => {
        engine.setIrohAddress(address).catch(() => {
          log('E_RUNNER iroh address not shared');
        });
      },
      log: (entry) => {
        log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
      },
    });
    link.iroh = service;
    await service.start();
    return service;
  };
  let iroh = await startIroh(internet);
  let internetChanges: Promise<unknown> = Promise.resolve();
  let closing = false;
  // Who may connect changes with invites, pairings and peers: tell the program at once.
  const pushAccess = () => {
    link.iroh?.refresh();
  };
  engine.on('access', pushAccess);
  engine.on('change', pushAccess);

  // Peers learn this node's discovery key again at each start; queued like any message when they are away.
  if (lanEnabled)
    engine.announceLanKey().catch(() => {
      log('E_RUNNER lan key not shared');
    });

  const api = await startLocalApi({
    engine,
    token,
    port: options.apiPort ?? config.apiPort,
    relayUrl: config.relayUrl,
    ...(process.env.DROP_SHELL_INSTANCE ? { shellInstance: process.env.DROP_SHELL_INSTANCE } : {}),
    admin: {
      status: () => ({
        displayName: identity.displayName,
        nodeId: identity.nodeId,
        relayConnected: relay.connected,
        lan: lan.state(),
        internet: iroh.state(),
      }),
      internet: () => ({ settings: internet, available: irohBinary() !== undefined, ...iroh.status() }),
      // One change at a time, and never during shutdown: two saves at once must not leave a second program running.
      setInternet: (settings) => {
        internetAllowed(settings);
        const change = internetChanges.then(async () => {
          if (closing) throw new DropError('E_DENIED', 'E_DENIED drop is stopping');
          home.saveInternet(settings);
          internet = settings;
          await iroh.stop();
          delete link.iroh;
          await engine.setIrohAddress(undefined);
          iroh = await startIroh(settings);
          return { ok: true, ...iroh.status() };
        });
        internetChanges = change.catch(() => undefined);
        return change;
      },
      tools: () => {
        const shared: Record<string, string> = {};
        for (const published of home.published()) {
          const server = (published.config as { server?: { transport?: string; agent?: string; name?: string } })
            .server;
          if (server?.transport === 'agent' && server.agent && server.name)
            shared[`${server.agent}/${server.name}`] = published.capabilityId;
        }
        return {
          agents: detectAgents(),
          shared,
          payer: config.payer,
          links: engine.links(),
          gateways: config.gateways,
        };
      },
      share: async (body) => {
        if (!isAgentKind(body.agent)) throw new Error(`unknown agent ${body.agent}`);
        return shareDetected(home, { agent: body.agent, server: body.server, label: body.label, tools: body.tools });
      },
      unshare: (capabilityId) => home.unpublish(capabilityId),
      install: () => {
        throw new Error('E_PREVIEW_REQUIRED');
      },
      onboardingPreview: () => ({
        agents: previewOnboarding({ dropHome: home.root }),
        manual: manualOnboarding({ dropHome: home.root }),
      }),
      onboardingApply: (selections) => applyOnboarding(selections, { dropHome: home.root }),
      projects: () => listProjects(home.root),
      addProject: (dir) => addProject(home.root, dir),
      removeProject: (dir) => removeProject(home.root, dir),
      createTeam: (name) => engine.createTeam(name),
      link: async (gateway, session, client) => {
        if (config.profile === 'private') throw new DropError('E_DENIED', 'E_DENIED cloud gateway disabled');
        await engine.linkAssistant(NodeIdSchema.parse(gateway), session, client);
        return { ok: true, trusted: config.gateways.includes(gateway) };
      },
      unlink: (gateway, client) => engine.unlinkAssistant(NodeIdSchema.parse(gateway), client),
    },
    refreshCatalogs: async () => {
      await engine.refreshCatalogs();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    },
  });
  link.apiPort = api.port;
  const uiUrl = `http://127.0.0.1:${String(api.port)}/?token=${token}`;
  const panelUrl = `http://127.0.0.1:${String(api.port)}/app?token=${token}`;

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
    // A peer that appears on the local network or by Internet gets what waited for it, even with no relay.
    if (lan.state() === 'on' || iroh.state() === 'on')
      void engine.flushOutbox().catch(() => {
        log('E_RUNNER flush failed');
      });
  }, 1000);

  return {
    engine,
    relay,
    lan,
    iroh: () => iroh,
    api,
    uiUrl,
    panelUrl,
    stop: async () => {
      clearInterval(ticker);
      relay.close();
      await lan.stop();
      closing = true;
      await internetChanges;
      await iroh.stop();
      await api.close();
    },
  };
}
