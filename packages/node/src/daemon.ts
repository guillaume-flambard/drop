import {
  capabilities,
  connectMcp,
  createMcpAnswer,
  createRepoAnswer,
  findAgentServer,
  mcpAnswer,
  privateCapabilities,
  repoAnswer,
  type ConnectOptions,
} from '@drop/capabilities';
import { DropError, NodeIdSchema, policyExpired } from '@drop/protocol';
import { RelayClient } from '@drop/relay';
import { NodeEngine, type InboxItem } from './engine.ts';
import { detectAgents } from './detect.ts';
import { openRouterFunder } from './funding.ts';
import { applyOnboarding, manualOnboarding, previewOnboarding } from './onboarding.ts';
import { isAgentKind, ShareError, shareDetected } from './share.ts';
import { OAuthSignIns, oauthRedirect, oauthStore, openInBrowser, runtimeOAuth } from './oauth.ts';
import { runAgentCall } from './assistant.ts';
import { startLocalApi, type LocalApi } from './api.ts';
import type { DropHome } from './home.ts';
import { notify } from './notify.ts';
import { LanService } from './lan.ts';
import { mdnsDiscovery } from './lan-mdns.ts';
import {
  assertPolicy,
  clientAllowed,
  gatewayAllowed,
  irohRelayPermitted,
  loadPolicy,
  providerAllowed,
  relayAllowed,
} from './policy.ts';
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
  /** A structured log line: a timestamp, an event and a stable code, never a payload. */
  const logEntry = (entry: object): void => {
    log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
  };
  // The organization policy, deployed by IT (T4.10, D81): one that does not verify stops the daemon here.
  const policy = await loadPolicy();
  if (policy) assertPolicy(relayAllowed(policy.policy, config.relayUrl), 'relay not allowed by policy');
  // Requester funding mints keys at a model provider: the same limit as any model call.
  if (policy && config.funding)
    assertPolicy(providerAllowed(policy.policy, config.funding.baseUrl), 'funding provider not allowed by policy');
  const guard = policy ? { allowModel: (baseUrl: string) => providerAllowed(policy.policy, baseUrl) } : {};
  // The engine is built before the relay client that delivers to it; the transport reads the client lazily.
  const link: { relay?: RelayClient; lan?: LanService; iroh?: IrohService; apiPort?: number } = {};
  // An unreadable local-network key turns the local mode off, logged, rather than inventing a new identity silently.
  let lanKey: string | undefined;
  try {
    lanKey = home.lanKey();
  } catch {
    logEntry({ event: 'lan_key_unreadable', code: 'E_LAN_KEY' });
  }
  const lanEnabled =
    lanKey !== undefined &&
    config.lan &&
    process.env.DROP_LAN !== 'off' &&
    policy?.policy.requireInternalRelay !== true;
  // OAuth sign-ins to remote MCP servers (T2.17): the browser comes back to this node's API, on its bound port.
  const redirectUrl = () => oauthRedirect(link.apiPort ?? config.apiPort);
  const store = oauthStore(home);
  const signIns = new OAuthSignIns({ store, redirectUrl });
  const oauth: ConnectOptions = { oauth: (serverUrl) => runtimeOAuth(store, redirectUrl())(serverUrl) };
  const engine = new NodeEngine({
    identity,
    ...(lanKey ? { lanKey } : {}),
    ownerKind: config.ownerKind,
    store: home,
    // The private profile keeps its policy-bound capabilities (T3.1); elsewhere mcp.answer also uses drop's own OAuth
    // sign-ins to remote servers (T2.17).
    capabilities:
      config.profile === 'private' && config.network
        ? privateCapabilities(config.network, guard)
        : capabilities.map((impl) =>
            impl === mcpAnswer
              ? createMcpAnswer({ connect: (server) => connectMcp(server, process.env, oauth), ...guard })
              : impl === repoAnswer && policy
                ? createRepoAnswer(guard)
                : impl,
          ),
    ...(policy
      ? {
          gatewayAllowed: (gateway: string) => gatewayAllowed(policy.policy, gateway),
          irohRelayAllowed: (relay: string) => irohRelayPermitted(policy.policy, relay),
        }
      : {}),
    // A direct local session first (T4.2), then iroh (T4.2b), then the configured relay; otherwise the outbox.
    transport: {
      send: (envelope) => sendInOrder(envelope, [link.lan, link.iroh], link.relay),
    },
    log: logEntry,
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
  // Every path (relay, local network, iroh) hands its envelopes to the engine the same way.
  const receive = (envelope: unknown): void => {
    engine.handleEnvelope(envelope).catch(() => {
      log('E_RUNNER envelope handling failed');
    });
  };
  const relay = new RelayClient({
    identity,
    url: config.relayUrl,
    admission: () => home.pendingAdmission(),
    // The internal relay checks this node runs its organization's policy (T4.10).
    ...(policy ? { policy: () => policy.fingerprint } : {}),
    onEnvelope: receive,
    onStatus: (status) => {
      log(`relay: ${status}`);
      if (status === 'connected') {
        home.clearPendingAdmission();
        void engine
          .flushOutbox()
          .then(() => engine.announceTeam())
          .then(() => engine.refreshCatalogs())
          // Direct paths may have changed while away; coalesced in the outbox, so a flapping relay costs nothing.
          .then(() => (lanEnabled || link.iroh?.state() === 'on' ? engine.announceLanKey() : undefined))
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
    onEnvelope: receive,
    enabled: lanEnabled,
    log: logEntry,
  });
  link.lan = lan;
  await lan.start();
  // The private profile never reaches a third party (D34): checked at start too, for a file edited by hand.
  const internetAllowed = (settings: InternetSettings): void => {
    assertInternetAllowed(settings, config);
    if (!policy) return;
    assertPolicy(settings.mode === 'off' || !policyExpired(policy.policy, Date.now()), 'policy expired');
    assertPolicy(!policy.policy.requireInternalRelay || settings.mode === 'off', 'internet mode disabled by policy');
    assertPolicy(settings.mode !== 'n0', 'third-party relays disabled by policy');
    assertPolicy(
      settings.mode !== 'relay' || irohRelayPermitted(policy.policy, settings.relay),
      'iroh relay not allowed by policy',
    );
  };
  let internet: InternetSettings = { mode: 'off' };
  try {
    internet = home.internet();
    internetAllowed(internet);
  } catch {
    internet = { mode: 'off' };
    logEntry({ event: 'internet_settings_refused', code: 'E_IROH_SETTINGS' });
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
      onEnvelope: receive,
      // Peers learn where to reach this node when the program starts and whenever its addresses change.
      onAddress: (address) => {
        engine.setIrohAddress(address).catch(() => {
          log('E_RUNNER iroh address not shared');
        });
      },
      log: logEntry,
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
    log: logEntry,
    ...(process.env.DROP_SHELL_INSTANCE ? { shellInstance: process.env.DROP_SHELL_INSTANCE } : {}),
    admin: {
      status: () => ({
        displayName: identity.displayName,
        nodeId: identity.nodeId,
        relayConnected: relay.connected,
        lan: lan.state(),
        internet: iroh.state(),
        ...(policy
          ? {
              policy: {
                policyId: policy.policy.policyId,
                version: policy.policy.version,
                expiresAt: policy.policy.expiresAt,
              },
            }
          : {}),
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
        return shareDetected(
          home,
          { agent: body.agent, server: body.server, label: body.label, tools: body.tools },
          oauth,
        );
      },
      unshare: (capabilityId) => home.unpublish(capabilityId),
      install: () => {
        throw new Error('E_PREVIEW_REQUIRED');
      },
      onboardingPreview: () => ({
        // Clients the policy does not allow are never offered (T4.10).
        agents: previewOnboarding({ dropHome: home.root }).filter((plan) => clientAllowed(policy?.policy, plan.agent)),
        ...(clientAllowed(policy?.policy, 'other') ? { manual: manualOnboarding({ dropHome: home.root }) } : {}),
      }),
      onboardingApply: (selections) => {
        // Disconnecting stays possible: a client connected before the policy can always be removed.
        assertPolicy(
          selections.every(
            (selection) => selection.action !== 'connect' || clientAllowed(policy?.policy, selection.agent),
          ),
          'client not allowed by policy',
        );
        return applyOnboarding(selections, { dropHome: home.root });
      },
      projects: () => listProjects(home.root),
      addProject: (dir) => addProject(home.root, dir),
      removeProject: (dir) => removeProject(home.root, dir),
      createTeam: (name) => engine.createTeam(name),
      link: async (gateway, request) => {
        assertPolicy(gatewayAllowed(policy?.policy, gateway), 'gateway not allowed by policy');
        if (config.profile === 'private') throw new DropError('E_DENIED', 'E_DENIED cloud gateway disabled');
        await engine.linkAssistant(NodeIdSchema.parse(gateway), request);
        return { ok: true, trusted: config.gateways.includes(gateway) };
      },
      unlink: (gateway, client) => engine.unlinkAssistant(NodeIdSchema.parse(gateway), client),
      connect: async (agent, server) => {
        // A sign-in reaches the server's own authorization endpoints, outside the private destinations (D34).
        if (config.profile === 'private') throw new DropError('E_DENIED', 'E_DENIED remote sign-in disabled');
        if (!isAgentKind(agent)) throw new Error(`unknown agent ${agent}`);
        const declared = findAgentServer(agent, server);
        if (declared?.transport !== 'http' || !declared.url)
          throw new ShareError(`${server} n’est pas un serveur en ligne : il n’y a rien à connecter.`);
        if (Object.keys(declared.headers).some((name) => name.toLowerCase() === 'authorization'))
          throw new ShareError(`${server} a déjà un jeton dans sa configuration : drop l’utilise.`);
        const started = await signIns.start(declared.url);
        if (started.connected) return { connected: true };
        openInBrowser(started.authorizationUrl);
        return { authorizationUrl: started.authorizationUrl };
      },
    },
    oauthCallback: (state, code) => signIns.complete(state, code),
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

  let policyLapsed = false;
  const ticker = setInterval(() => {
    // A policy that expires while the node runs closes every path to the team; only the local API stays (T4.10).
    if (policy && !policyLapsed && policyExpired(policy.policy, Date.now())) {
      policyLapsed = true;
      logEntry({ event: 'policy_expired', code: 'E_POLICY' });
      relay.close();
      void Promise.all([lan.stop(), iroh.stop()]).catch(() => {
        log('E_RUNNER direct paths did not stop');
      });
    }
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
