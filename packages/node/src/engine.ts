import { EventEmitter } from 'node:events';
import {
  createAdmission,
  createInvite,
  decodeInvite,
  encodeInvite,
  isDropError,
  openEnvelope,
  ReplayCache,
  sealEnvelope,
  sha256Hex,
  signCard,
  signReceipt,
  uuidv7,
  verifyCard,
  verifyReceipt,
  type CapabilityCard,
  type ConsentCard,
  type DropErrorCode,
  type DropState,
  type Envelope,
  type Funding,
  type Identity,
  type Message,
  type MessageOf,
  type NodeId,
  type OwnerKind,
  type Receipt,
  type RequestedBy,
  type SignedCapabilityCard,
  type UnsignedReceipt,
} from '@drop/protocol';
import type { Funder } from './funding.ts';
import { applyRedactions, buildCard, implFor, runCapability, validateInput, type CapabilityImpl } from '@drop/runner';
import type { Peer, Published } from './home.ts';

export const APPROVAL_TTL_MS = 10 * 60_000;
export const REVIEW_TTL_MS = 10 * 60_000;
export const CATALOG_TTL_MS = 60_000;

export interface Transport {
  send(envelope: Envelope): Promise<string>;
}

export interface NodeStore {
  peers(): Peer[];
  savePeer(peer: Peer): void;
  published(): Published[];
  appendReceipt(receipt: Receipt): void;
}

export type Agent = RequestedBy['agent'];

/** Something the local human must decide: an approval or, for high sensitivity, a review before sending. */
export type InboxItem =
  | {
      kind: 'approval';
      dropId: string;
      executor: NodeId;
      card: ConsentCard;
      inputPreview: string;
      purpose: string;
      requestedBy: RequestedBy;
      expiresAt: number;
    }
  | { kind: 'review'; dropId: string; executor: NodeId; title: string; output: unknown; expiresAt: number };

/** A drop this node asked for. */
export interface OutboundDrop {
  dropId: string;
  capabilityId: string;
  title: string;
  ownerName: string;
  executor: NodeId;
  state: DropState;
  createdAt: number;
  result?: { output: unknown; outputSchemaHash: string };
  error?: { code: DropErrorCode; message: string };
}

/** A drop this node executes. */
interface ExecutorDrop {
  dropId: string;
  requester: NodeId;
  card: CapabilityCard;
  impl: CapabilityImpl;
  config: unknown;
  input: unknown;
  purpose: string;
  requestedBy: RequestedBy;
  state: DropState;
  approver: NodeId | undefined;
  expiresAt: number;
  reviewExpiresAt?: number;
  output?: Record<string, unknown> | undefined;
  toolCalls: { name: string; count: number }[];
  costUsd: number;
  reviewed: boolean;
  timestamps: { requested: number; decided?: number; started?: number; finished?: number; delivered?: number };
  /** The requester's capped key, kept in memory until the run ends, then dropped. */
  funding?: Funding | undefined;
}

export interface CatalogEntry {
  card: CapabilityCard;
  ownerName: string;
  online: boolean;
}

export interface EngineLogEntry {
  event: string;
  code?: string;
  dropId?: string;
  peer?: string;
}

export interface EngineOptions {
  identity: Identity;
  ownerKind: OwnerKind;
  store: NodeStore;
  transport: Transport;
  capabilities: CapabilityImpl[];
  now?: () => number;
  log?: (entry: EngineLogEntry) => void;
  /** Called with the admission ticket of an invite being accepted, so the node can join the relay with it (T2.1). */
  onAdmission?: (ticket: unknown) => void;
  /** Requester side: mints a capped key per drop so the requester pays the model (D27). */
  funder?: Funder;
  /** Executor side: who pays the model. 'requester' (default, D27) uses the requester's key when one is sent. */
  payer?: 'requester' | 'owner';
}

const DECISION_ERRORS: Record<'deny' | 'not_now', DropErrorCode> = { deny: 'E_DENIED', not_now: 'E_NOT_NOW' };

/**
 * The protocol state machine of one node, independent of sockets and HTTP: requester, executor and approver roles.
 * Peer messages are untrusted data: every one is schema-validated by openEnvelope and checked against the sender's role.
 */
export class NodeEngine extends EventEmitter {
  readonly identity: Identity;
  private readonly options: EngineOptions;
  private readonly now: () => number;
  private readonly replay = new ReplayCache();
  private readonly invites = new Map<string, number>();
  private readonly pairing = new Map<NodeId, { token: string; displayName: string }>();
  private readonly catalogs = new Map<NodeId, { cards: CapabilityCard[]; at: number }>();
  private readonly executing = new Map<string, ExecutorDrop>();
  private readonly outbound = new Map<string, OutboundDrop>();
  private readonly inbox = new Map<string, InboxItem>();
  private readonly outbox: Envelope[] = [];

  constructor(options: EngineOptions) {
    super();
    this.options = options;
    this.identity = options.identity;
    this.now = options.now ?? Date.now;
  }

  // ---- queries -----------------------------------------------------------------------------------------------

  peers(): Peer[] {
    return this.options.store.peers();
  }

  pending(): InboxItem[] {
    return [...this.inbox.values()].sort((a, b) => a.expiresAt - b.expiresAt);
  }

  drop(dropId: string): OutboundDrop | undefined {
    return this.outbound.get(dropId);
  }

  catalog(): CatalogEntry[] {
    const names = new Map(this.peers().map((peer) => [peer.nodeId, peer.displayName]));
    names.set(this.identity.nodeId, this.identity.displayName);
    const fresh = this.now() - CATALOG_TTL_MS;
    return [...this.catalogs.entries()].flatMap(([nodeId, entry]) =>
      entry.cards.map((card) => ({
        card,
        ownerName: names.get(nodeId) ?? card.owner.displayName,
        online: entry.at >= fresh,
      })),
    );
  }

  catalogIsFresh(): boolean {
    const fresh = this.now() - CATALOG_TTL_MS;
    const peers = this.knownNodeIds();
    return peers.length > 0 && peers.every((nodeId) => (this.catalogs.get(nodeId)?.at ?? 0) >= fresh);
  }

  /** Cards this node publishes, signed for its catalog. */
  async ownCards(): Promise<SignedCapabilityCard[]> {
    const cards: SignedCapabilityCard[] = [];
    for (const published of this.options.store.published()) {
      const card = this.cardFor(published);
      if (card) cards.push(await signCard(this.identity, card.card));
    }
    return cards;
  }

  // ---- pairing -----------------------------------------------------------------------------------------------

  /** A pairing code that also carries an admission ticket, so a newcomer can join the relay with it (T2.1). */
  async invite(relayUrl: string): Promise<string> {
    const admission = await createAdmission(this.identity, this.now());
    const invite = createInvite(this.identity, relayUrl, this.now(), admission);
    this.invites.set(invite.oneTimeToken, invite.expiresAt);
    return encodeInvite(invite);
  }

  async pair(code: string): Promise<NodeId> {
    const invite = decodeInvite(code, this.now());
    if (invite.admission) this.options.onAdmission?.(invite.admission);
    this.pairing.set(invite.nodeId, { token: invite.oneTimeToken, displayName: invite.displayName });
    await this.send(invite.nodeId, {
      type: 'pair_request',
      oneTimeToken: invite.oneTimeToken,
      displayName: this.identity.displayName,
      ownerKind: this.options.ownerKind,
    });
    return invite.nodeId;
  }

  // ---- requester ---------------------------------------------------------------------------------------------

  async refreshCatalogs(): Promise<void> {
    for (const nodeId of this.knownNodeIds()) await this.send(nodeId, { type: 'catalog_request' });
  }

  async requestDrop(request: {
    capabilityId: string;
    input: unknown;
    purpose: string;
    agent: Agent;
  }): Promise<OutboundDrop> {
    const entry = this.catalog().find((candidate) => candidate.card.id === request.capabilityId);
    if (!entry) throw new Error(`unknown capability: ${request.capabilityId}`);
    const dropId = uuidv7(this.now());
    const outbound: OutboundDrop = {
      dropId,
      capabilityId: entry.card.id,
      title: entry.card.title,
      ownerName: entry.ownerName,
      executor: entry.card.executorNodeId,
      state: 'proposed',
      createdAt: this.now(),
    };
    this.outbound.set(dropId, outbound);
    const funding = await this.options.funder?.mint(dropId);
    await this.send(entry.card.executorNodeId, {
      type: 'drop_request',
      dropId,
      capabilityId: entry.card.id,
      capabilityVersion: entry.card.version,
      input: request.input,
      purpose: request.purpose,
      requestedBy: { nodeId: this.identity.nodeId, displayName: this.identity.displayName, agent: request.agent },
      ...(funding ? { funding } : {}),
    });
    this.changed();
    return outbound;
  }

  // ---- approver ----------------------------------------------------------------------------------------------

  async decide(dropId: string, decision: 'allow_once' | 'deny' | 'not_now'): Promise<boolean> {
    const item = this.inbox.get(dropId);
    if (item?.kind !== 'approval') return false;
    this.inbox.delete(dropId);
    this.changed();
    const message: Message = { type: 'approval_decision', dropId, decision, decidedAt: this.now() };
    if (item.executor === this.identity.nodeId) await this.onApprovalDecision(this.identity.nodeId, message);
    else await this.send(item.executor, message);
    return true;
  }

  async review(dropId: string, decision: 'send' | 'discard', redactions: string[] = []): Promise<boolean> {
    const item = this.inbox.get(dropId);
    if (item?.kind !== 'review') return false;
    this.inbox.delete(dropId);
    this.changed();
    const message: Message = { type: 'review_decision', dropId, decision, redactions };
    if (item.executor === this.identity.nodeId) await this.onReviewDecision(this.identity.nodeId, message);
    else await this.send(item.executor, message);
    return true;
  }

  // ---- transport ---------------------------------------------------------------------------------------------

  async handleEnvelope(raw: unknown): Promise<void> {
    let opened: Awaited<ReturnType<typeof openEnvelope>>;
    try {
      opened = await openEnvelope(this.identity, raw, {
        isKnownPeer: (nodeId) => this.isKnown(nodeId),
        replay: this.replay,
        now: this.now(),
        ...(this.hasLiveInvite() ? { acceptPairToken: (token: string) => this.hasInvite(token) } : {}),
      });
    } catch (error) {
      this.log({ event: 'envelope_rejected', code: isDropError(error) ? error.code : 'E_RUNNER' });
      return;
    }
    await this.dispatch(opened.envelope.from, opened.message);
  }

  /** Re-sends envelopes that could not leave while the relay was unreachable. */
  async flushOutbox(): Promise<void> {
    const pending = this.outbox.splice(0);
    for (const envelope of pending) {
      if (envelope.exp <= this.now()) continue;
      const outcome = await this.options.transport.send(envelope);
      if (outcome === 'offline') this.outbox.push(envelope);
    }
  }

  /** Expires undecided approvals and reviews. Called every second by the daemon, or with a simulated clock in tests. */
  async tick(): Promise<void> {
    const now = this.now();
    for (const [dropId, item] of this.inbox) if (item.expiresAt <= now) this.inbox.delete(dropId);
    for (const drop of this.executing.values()) {
      if (drop.state === 'awaiting_approval' && drop.expiresAt <= now) {
        drop.state = 'expired';
        drop.funding = undefined;
        await this.fail(drop, 'E_EXPIRED', 'La demande a expiré sans décision.', 'expired');
      } else if (drop.state === 'in_review' && (drop.reviewExpiresAt ?? Infinity) <= now) {
        drop.state = 'failed';
        await this.fail(drop, 'E_EXPIRED', "La relecture a expiré : rien n'a été envoyé.", 'allow_once');
      }
    }
    this.changed();
  }

  // ---- internals ---------------------------------------------------------------------------------------------

  private async dispatch(from: NodeId, message: Message): Promise<void> {
    switch (message.type) {
      case 'pair_request':
        return this.onPairRequest(from, message);
      case 'pair_accept': {
        this.onPairAccept(from, message);
        return;
      }
      case 'catalog_request':
        await this.send(from, { type: 'catalog', cards: await this.ownCards() });
        return;
      case 'catalog':
        return this.onCatalog(from, message);
      case 'drop_request':
        return this.onDropRequest(from, message);
      case 'approval_request': {
        this.onApprovalRequest(from, message);
        return;
      }
      case 'approval_decision':
        return this.onApprovalDecision(from, message);
      case 'review_request': {
        this.onReviewRequest(from, message);
        return;
      }
      case 'review_decision':
        return this.onReviewDecision(from, message);
      case 'drop_status':
      case 'drop_result':
      case 'drop_error':
        this.onRequesterUpdate(from, message);
        return;
      case 'receipt':
        return this.onReceipt(from, message);
    }
  }

  private async onPairRequest(from: NodeId, message: MessageOf<'pair_request'>): Promise<void> {
    if (!this.hasInvite(message.oneTimeToken)) return;
    this.invites.delete(message.oneTimeToken);
    this.options.store.savePeer({
      nodeId: from,
      displayName: message.displayName,
      ownerKind: message.ownerKind,
      pairedAt: new Date(this.now()).toISOString(),
    });
    await this.send(from, {
      type: 'pair_accept',
      oneTimeToken: message.oneTimeToken,
      displayName: this.identity.displayName,
      ownerKind: this.options.ownerKind,
    });
    this.log({ event: 'paired', peer: from });
    this.changed();
  }

  private onPairAccept(from: NodeId, message: MessageOf<'pair_accept'>): void {
    const pending = this.pairing.get(from);
    if (pending?.token !== message.oneTimeToken) return;
    this.pairing.delete(from);
    this.options.store.savePeer({
      nodeId: from,
      displayName: message.displayName,
      ownerKind: message.ownerKind,
      pairedAt: new Date(this.now()).toISOString(),
    });
    this.log({ event: 'paired', peer: from });
    this.changed();
  }

  private async onCatalog(from: NodeId, message: MessageOf<'catalog'>): Promise<void> {
    const cards: CapabilityCard[] = [];
    for (const signed of message.cards) if (await verifyCard(signed, from)) cards.push(signed.card);
    this.catalogs.set(from, { cards, at: this.now() });
    this.changed();
  }

  private async onDropRequest(from: NodeId, message: MessageOf<'drop_request'>): Promise<void> {
    const published = this.options.store.published().find((entry) => entry.capabilityId === message.capabilityId);
    const built = published ? this.cardFor(published) : undefined;
    if (!published || !built || built.card.version !== message.capabilityVersion) {
      await this.send(from, {
        type: 'drop_error',
        dropId: message.dropId,
        code: 'E_SCHEMA',
        message: 'Capacité inconnue.',
      });
      return;
    }
    if (this.executing.has(message.dropId)) return;
    const validated = validateInput(built.impl, message.input);
    if (!validated.ok) {
      await this.send(from, {
        type: 'drop_error',
        dropId: message.dropId,
        code: 'E_SCHEMA',
        message: 'Entrée invalide.',
      });
      return;
    }
    const now = this.now();
    const drop: ExecutorDrop = {
      dropId: message.dropId,
      requester: from,
      card: built.card,
      impl: built.impl,
      config: published.config,
      input: validated.input,
      purpose: message.purpose,
      requestedBy: { ...message.requestedBy, nodeId: from },
      state: 'awaiting_approval',
      approver: undefined,
      expiresAt: now + APPROVAL_TTL_MS,
      toolCalls: [],
      costUsd: 0,
      reviewed: false,
      timestamps: { requested: now },
      funding: this.options.payer === 'owner' ? undefined : message.funding,
    };
    this.executing.set(drop.dropId, drop);
    const ownerCost = built.impl.cost?.(published.config);
    const cost = drop.funding ? { kind: 'capped' as const, maxUsd: drop.funding.maxUsd } : ownerCost;
    const request: Message = {
      type: 'approval_request',
      dropId: drop.dropId,
      card: {
        capabilityId: built.card.id,
        title: built.card.title,
        receives: built.card.receives,
        neverReceives: built.card.neverReceives,
        sensitivity: built.card.sensitivity,
        executorName: this.identity.displayName,
        ...(cost ? { cost, paidBy: drop.funding ? ('requester' as const) : ('owner' as const) } : {}),
      },
      inputPreview: built.impl.preview(validated.input).slice(0, 2000),
      purpose: drop.purpose,
      requestedBy: drop.requestedBy,
      expiresAt: drop.expiresAt,
    };
    for (const approver of built.card.approverNodeIds) {
      if (approver === this.identity.nodeId) this.onApprovalRequest(this.identity.nodeId, request);
      else await this.send(approver, request);
    }
    await this.status(drop);
    this.changed();
  }

  private onApprovalRequest(from: NodeId, message: MessageOf<'approval_request'>): void {
    if (message.expiresAt <= this.now()) return;
    this.inbox.set(message.dropId, {
      kind: 'approval',
      dropId: message.dropId,
      executor: from,
      card: message.card,
      inputPreview: message.inputPreview,
      purpose: message.purpose,
      requestedBy: message.requestedBy,
      expiresAt: message.expiresAt,
    });
    this.emit('approval', this.inbox.get(message.dropId));
    this.changed();
  }

  private async onApprovalDecision(from: NodeId, message: MessageOf<'approval_decision'>): Promise<void> {
    const drop = this.executing.get(message.dropId);
    if (drop?.state !== 'awaiting_approval' || !drop.card.approverNodeIds.includes(from)) return;
    drop.approver = from;
    drop.timestamps.decided = this.now();
    if (message.decision !== 'allow_once') {
      drop.funding = undefined;
      drop.state = message.decision === 'deny' ? 'denied' : 'not_now';
      const text =
        message.decision === 'deny'
          ? 'Le propriétaire a refusé.'
          : 'Pas maintenant : vous pourrez redemander plus tard.';
      await this.fail(drop, DECISION_ERRORS[message.decision], text, message.decision);
      return;
    }
    drop.state = 'approved';
    await this.status(drop);
    drop.state = 'running';
    drop.timestamps.started = this.now();
    await this.status(drop);
    const result = await runCapability(drop.impl, drop.input, {
      config: drop.config,
      ...(drop.funding ? { funding: drop.funding } : {}),
    });
    drop.funding = undefined;
    drop.toolCalls = result.toolCalls;
    drop.costUsd = result.costUsd;
    drop.timestamps.finished = this.now();
    if (!result.ok) {
      drop.state = 'failed';
      await this.fail(drop, result.code, result.message, 'allow_once');
      return;
    }
    drop.output = result.output;
    if (drop.card.sensitivity === 'high') {
      drop.state = 'in_review';
      drop.reviewExpiresAt = this.now() + REVIEW_TTL_MS;
      await this.status(drop);
      const review: Message = {
        type: 'review_request',
        dropId: drop.dropId,
        output: result.output,
        expiresAt: drop.reviewExpiresAt,
      };
      if (from === this.identity.nodeId) this.onReviewRequest(from, review);
      else await this.send(from, review);
      return;
    }
    await this.deliver(drop, result.output);
  }

  private onReviewRequest(from: NodeId, message: MessageOf<'review_request'>): void {
    this.inbox.set(message.dropId, {
      kind: 'review',
      dropId: message.dropId,
      executor: from,
      title: this.titleOf(message.dropId),
      output: message.output,
      expiresAt: message.expiresAt,
    });
    this.emit('review', this.inbox.get(message.dropId));
    this.changed();
  }

  private async onReviewDecision(from: NodeId, message: MessageOf<'review_decision'>): Promise<void> {
    const drop = this.executing.get(message.dropId);
    if (drop?.state !== 'in_review' || drop.approver !== from || !drop.output) return;
    drop.reviewed = true;
    if (message.decision === 'discard') {
      drop.state = 'failed';
      await this.fail(
        drop,
        'E_DENIED',
        "Le propriétaire a relu le résultat et choisi de ne pas l'envoyer.",
        'allow_once',
      );
      return;
    }
    await this.deliver(drop, applyRedactions(drop.output, message.redactions ?? []));
  }

  private onRequesterUpdate(from: NodeId, message: MessageOf<'drop_status' | 'drop_result' | 'drop_error'>): void {
    const drop = this.outbound.get(message.dropId);
    if (drop?.executor !== from) return;
    if (message.type === 'drop_status') drop.state = message.state;
    // The drop is over: delete the capped key minted for it (D27).
    if (message.type !== 'drop_status' && this.options.funder) {
      this.options.funder.release(drop.dropId).catch(() => {
        this.log({ event: 'funding', code: 'E_FUNDING_RELEASE', dropId: drop.dropId });
      });
    }
    if (message.type === 'drop_result') {
      drop.state = 'delivered';
      drop.result = { output: message.output, outputSchemaHash: message.outputSchemaHash };
    }
    if (message.type === 'drop_error') {
      drop.state =
        message.code === 'E_EXPIRED'
          ? 'expired'
          : message.code === 'E_DENIED'
            ? 'denied'
            : message.code === 'E_NOT_NOW'
              ? 'not_now'
              : 'failed';
      drop.error = { code: message.code, message: message.message };
    }
    this.changed();
  }

  private async onReceipt(from: NodeId, message: MessageOf<'receipt'>): Promise<void> {
    if (message.receipt.executor !== from || !(await verifyReceipt(message.receipt))) return;
    this.options.store.appendReceipt(message.receipt);
    const drop = this.outbound.get(message.receipt.dropId);
    if (drop?.state === 'delivered') drop.state = 'receipted';
    this.changed();
  }

  private async deliver(drop: ExecutorDrop, output: Record<string, unknown>): Promise<void> {
    drop.state = 'delivered';
    drop.timestamps.delivered = this.now();
    await this.send(drop.requester, {
      type: 'drop_result',
      dropId: drop.dropId,
      output,
      outputSchemaHash: sha256Hex(drop.card.outputSchema),
    });
    await this.writeReceipt(drop, 'allow_once', sha256Hex(output));
    drop.state = 'receipted';
    drop.output = undefined;
    this.changed();
  }

  private async fail(
    drop: ExecutorDrop,
    code: DropErrorCode,
    text: string,
    decision: Receipt['decision'],
  ): Promise<void> {
    await this.send(drop.requester, { type: 'drop_error', dropId: drop.dropId, code, message: text });
    await this.writeReceipt(drop, decision, undefined, code);
    drop.output = undefined;
    this.changed();
  }

  private async writeReceipt(
    drop: ExecutorDrop,
    decision: Receipt['decision'],
    outputHash?: string,
    errorCode?: string,
  ): Promise<void> {
    const unsigned: UnsignedReceipt = {
      dropId: drop.dropId,
      capabilityId: drop.card.id,
      capabilityVersion: drop.card.version,
      requester: drop.requester,
      executor: this.identity.nodeId,
      approver: drop.approver ?? drop.card.approverNodeIds[0] ?? this.identity.nodeId,
      inputHash: sha256Hex(drop.input),
      decision,
      reviewed: drop.reviewed,
      toolCalls: drop.toolCalls,
      timestamps: drop.timestamps,
      ...(drop.costUsd > 0 ? { costUsd: drop.costUsd } : {}),
      ...(outputHash ? { outputHash } : {}),
      ...(errorCode ? { errorCode } : {}),
    };
    const receipt = await signReceipt(this.identity, unsigned);
    this.options.store.appendReceipt(receipt);
    const recipients = new Set([drop.requester, unsigned.approver]);
    recipients.delete(this.identity.nodeId);
    for (const nodeId of recipients) await this.send(nodeId, { type: 'receipt', receipt });
  }

  private async status(drop: ExecutorDrop): Promise<void> {
    await this.send(drop.requester, { type: 'drop_status', dropId: drop.dropId, state: drop.state });
  }

  private async send(to: NodeId, message: Message): Promise<void> {
    const envelope = await sealEnvelope(this.identity, to, message, { now: this.now() });
    const outcome = await this.options.transport.send(envelope);
    if (outcome === 'offline') this.outbox.push(envelope);
    else if (outcome !== 'delivered' && outcome !== 'queued')
      this.log({ event: 'send_failed', code: outcome, peer: to });
  }

  private cardFor(published: Published): { card: CapabilityCard; impl: CapabilityImpl } | undefined {
    const impl = implFor(this.options.capabilities, published.capabilityId);
    if (!impl) return undefined;
    const card = buildCard(impl, {
      owner: { kind: this.options.ownerKind, displayName: this.identity.displayName, nodeId: this.identity.nodeId },
      executorNodeId: this.identity.nodeId,
      approverNodeIds: published.approverNodeIds,
      capabilityId: published.capabilityId,
      config: published.config,
    });
    return { card, impl };
  }

  private titleOf(dropId: string): string {
    return this.executing.get(dropId)?.card.title ?? 'Résultat à relire';
  }

  private knownNodeIds(): NodeId[] {
    return [this.identity.nodeId, ...this.peers().map((peer) => peer.nodeId)];
  }

  private isKnown(nodeId: NodeId): boolean {
    return (
      nodeId === this.identity.nodeId || this.pairing.has(nodeId) || this.peers().some((peer) => peer.nodeId === nodeId)
    );
  }

  private hasInvite(token: string): boolean {
    return (this.invites.get(token) ?? 0) > this.now();
  }

  private hasLiveInvite(): boolean {
    return [...this.invites.values()].some((expiresAt) => expiresAt > this.now());
  }

  private changed(): void {
    this.emit('change');
  }

  private log(entry: EngineLogEntry): void {
    this.options.log?.(entry);
  }
}
