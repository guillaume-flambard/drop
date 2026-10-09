import {
  capabilities,
  connectMcp,
  createMcpAnswer,
  findAgentServer,
  mcpAnswer,
  type ConnectOptions,
} from '@drop/capabilities';
import { NodeIdSchema } from '@drop/protocol';
import { RelayClient } from '@drop/relay';
import { NodeEngine, type InboxItem } from './engine.ts';
import { detectAgents } from './detect.ts';
import { openRouterFunder } from './funding.ts';
import { install } from './install.ts';
import { isAgentKind, ShareError, shareDetected } from './share.ts';
import { OAuthSignIns, oauthRedirect, oauthStore, openInBrowser, runtimeOAuth } from './oauth.ts';
import { runAgentCall } from './assistant.ts';
import { startLocalApi, type LocalApi } from './api.ts';
import type { DropHome } from './home.ts';
import { notify } from './notify.ts';

export interface Daemon {
  engine: NodeEngine;
  relay: RelayClient;
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
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  // The engine is built before the relay client that delivers to it; the transport reads the client lazily.
  const link: { relay?: RelayClient; apiPort?: number } = {};
  // OAuth sign-ins to remote MCP servers (T2.17): the browser comes back to this node's API, on its bound port.
  const redirectUrl = () => oauthRedirect(link.apiPort ?? config.apiPort);
  const store = oauthStore(home);
  const signIns = new OAuthSignIns({ store, redirectUrl });
  const oauth: ConnectOptions = { oauth: (serverUrl) => runtimeOAuth(store, redirectUrl())(serverUrl) };
  const engine = new NodeEngine({
    identity,
    ownerKind: config.ownerKind,
    store: home,
    capabilities: capabilities.map((impl) =>
      impl === mcpAnswer ? createMcpAnswer({ connect: (server) => connectMcp(server, process.env, oauth) }) : impl,
    ),
    transport: { send: (envelope) => (link.relay ? link.relay.send(envelope) : Promise.resolve('offline')) },
    log: (entry) => {
      log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    },
    payer: config.payer,
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
      runAgentCall(`http://127.0.0.1:${String(link.apiPort ?? config.apiPort)}`, home.localToken(), call),
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

  const api = await startLocalApi({
    engine,
    token: home.localToken(),
    port: options.apiPort ?? config.apiPort,
    relayUrl: config.relayUrl,
    admin: {
      status: () => ({ displayName: identity.displayName, nodeId: identity.nodeId, relayConnected: relay.connected }),
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
      install: (agent, remove) => {
        if (!isAgentKind(agent)) throw new Error(`unknown agent ${agent}`);
        install(agent, { dropHome: home.root }, remove);
        return { ok: true };
      },
      createTeam: (name) => engine.createTeam(name),
      link: async (gateway, request) => {
        await engine.linkAssistant(NodeIdSchema.parse(gateway), request);
        return { ok: true, trusted: config.gateways.includes(gateway) };
      },
      unlink: (gateway, client) => engine.unlinkAssistant(NodeIdSchema.parse(gateway), client),
      connect: async (agent, server) => {
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
  const uiUrl = `http://127.0.0.1:${String(api.port)}/?token=${home.localToken()}`;
  const panelUrl = `http://127.0.0.1:${String(api.port)}/app?token=${home.localToken()}`;

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
    panelUrl,
    stop: async () => {
      clearInterval(ticker);
      relay.close();
      await api.close();
    },
  };
}
