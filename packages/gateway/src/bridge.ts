import { randomBytes } from 'node:crypto';
import { isDropError, openEnvelope, ReplayCache, sealEnvelope, type Identity, type NodeId } from '@drop/protocol';
import { RelayClient } from '@drop/relay';
import type { LinkClaim } from './oauth.ts';

/**
 * The gateway's side of the relay (T2.13): it receives `link_grant` from a user's node for a pending OAuth session,
 * then carries that user's assistant calls to their node as `agent_call` and waits for the `agent_reply`. The gateway
 * holds no team key and decides nothing: each node checks its own links and each owner still consents.
 */
export interface BridgeOptions {
  identity: Identity;
  relayUrl: string;
  /** True for a pending OAuth session waiting for its link_grant. */
  isPendingSession: (sessionId: string) => boolean;
  /** Binds the session to the node if the claim matches it; false when it does not (logged as E_LINK_MISMATCH). */
  onLinkGrant: (sessionId: string, nodeId: NodeId, claim: LinkClaim) => boolean;
  /** Nodes that granted a link, from the persisted tokens: they may reply. */
  isLinkedNode: (nodeId: NodeId) => boolean;
  callTimeoutMs?: number;
  log?: (line: string) => void;
}

export class Bridge {
  readonly client: RelayClient;
  private readonly options: BridgeOptions;
  private readonly replay = new ReplayCache();
  private readonly pending = new Map<
    string,
    { nodeId: NodeId; resolve: (reply: { text: string; isError: boolean }) => void }
  >();

  constructor(options: BridgeOptions) {
    this.options = options;
    this.client = new RelayClient({
      identity: options.identity,
      url: options.relayUrl,
      onEnvelope: (envelope) => {
        this.receive(envelope).catch(() => undefined);
      },
      onStatus: (status) => options.log?.(`relay: ${status}`),
    });
  }

  start(): void {
    this.client.start();
  }

  close(): void {
    for (const call of this.pending.values()) call.resolve({ text: 'La passerelle redémarre.', isError: true });
    this.pending.clear();
    this.client.close();
  }

  /** Sends one tool call from a linked assistant to the user's node and waits for its reply. */
  async call(
    link: { nodeId: NodeId; clientId: string },
    tool: 'ask_team' | 'get_drop_results' | 'list_capabilities',
    args: Record<string, unknown>,
  ) {
    const { nodeId, clientId } = link;
    const callId = randomBytes(12).toString('base64url');
    const reply = new Promise<{ text: string; isError: boolean }>((resolve) => {
      this.pending.set(callId, { nodeId, resolve });
    });
    const timeout = new Promise<{ text: string; isError: boolean }>((resolve) => {
      setTimeout(() => {
        resolve({
          text: "Ton Mac n'a pas répondu : l'app drop est peut-être fermée, hors ligne, ou ce lien a été retiré.",
          isError: true,
        });
      }, this.options.callTimeoutMs ?? 58_000);
    });
    const envelope = await sealEnvelope(this.options.identity, nodeId, {
      type: 'agent_call',
      callId,
      clientId,
      tool,
      args,
    });
    const outcome = await this.client.send(envelope);
    if (outcome !== 'delivered' && outcome !== 'queued') {
      this.pending.delete(callId);
      return { text: "Le relais n'a pas pu joindre ton Mac.", isError: true };
    }
    const result = await Promise.race([reply, timeout]);
    this.pending.delete(callId);
    return result;
  }

  private async receive(raw: unknown): Promise<void> {
    try {
      const { envelope, message } = await openEnvelope(this.options.identity, raw, {
        isKnownPeer: (nodeId) => this.options.isLinkedNode(nodeId),
        replay: this.replay,
        acceptLinkSession: (sessionId) => this.options.isPendingSession(sessionId),
      });
      if (message.type === 'link_grant') {
        const { clientId, clientName, redirectHost } = message;
        if (!this.options.onLinkGrant(message.sessionId, envelope.from, { clientId, clientName, redirectHost }))
          this.options.log?.('link_grant rejected: E_LINK_MISMATCH');
        return;
      }
      if (message.type === 'agent_reply') {
        const call = this.pending.get(message.callId);
        // Only the node the call went to can answer it.
        if (call?.nodeId === envelope.from) call.resolve({ text: message.text, isError: message.isError });
      }
    } catch (error) {
      this.options.log?.(`envelope rejected: ${isDropError(error) ? error.code : 'E_RUNNER'}`);
    }
  }
}
