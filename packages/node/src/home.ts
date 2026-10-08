import { randomBytes } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  IdentitySchema,
  NodeIdSchema,
  OwnerKindSchema,
  ReceiptSchema,
  type Identity,
  type Receipt,
} from '@drop/protocol';

export const NodeConfigSchema = z.object({
  relayUrl: z.string(),
  ownerKind: OwnerKindSchema,
  apiPort: z.number().int().min(0).max(65535).default(7781),
});
export type NodeConfig = z.infer<typeof NodeConfigSchema>;

export const PeerSchema = z.object({
  nodeId: NodeIdSchema,
  displayName: z.string(),
  ownerKind: OwnerKindSchema,
  pairedAt: z.string(),
});
export type Peer = z.infer<typeof PeerSchema>;

/** A capability this node executes: the implementation id, who may approve, and the owner's private config. */
export const PublishedSchema = z.object({
  capabilityId: z.string(),
  approverNodeIds: z.array(NodeIdSchema).min(1),
  config: z.unknown(),
  publishedAt: z.string(),
});
export type Published = z.infer<typeof PublishedSchema>;

export function defaultHome(): string {
  return process.env.DROP_HOME ?? join(homedir(), '.drop');
}

function writePrivate(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Everything a node keeps on disk under DROP_HOME. Private keys and the local token are mode 0600. */
export class DropHome {
  readonly root: string;

  constructor(root: string = defaultHome()) {
    this.root = root;
  }

  get exists(): boolean {
    return existsSync(join(this.root, 'identity.json'));
  }

  init(identity: Identity, config: NodeConfig): void {
    if (this.exists) throw new Error(`DROP_HOME already initialized: ${this.root}`);
    mkdirSync(join(this.root, 'capabilities'), { recursive: true, mode: 0o700 });
    mkdirSync(join(this.root, 'receipts'), { recursive: true, mode: 0o700 });
    chmodSync(this.root, 0o700);
    writePrivate(join(this.root, 'identity.json'), `${JSON.stringify(identity, null, 2)}\n`);
    writeFileSync(join(this.root, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(this.root, 'peers.json'), '[]\n');
    writePrivate(join(this.root, 'local-token'), randomBytes(32).toString('base64url'));
  }

  identity(): Identity {
    return IdentitySchema.parse(JSON.parse(readFileSync(join(this.root, 'identity.json'), 'utf8')));
  }

  config(): NodeConfig {
    return NodeConfigSchema.parse(JSON.parse(readFileSync(join(this.root, 'config.json'), 'utf8')));
  }

  localToken(): string {
    return readFileSync(join(this.root, 'local-token'), 'utf8').trim();
  }

  peers(): Peer[] {
    return z.array(PeerSchema).parse(JSON.parse(readFileSync(join(this.root, 'peers.json'), 'utf8')));
  }

  savePeer(peer: Peer): void {
    const peers = this.peers().filter((existing) => existing.nodeId !== peer.nodeId);
    peers.push(peer);
    writeFileSync(join(this.root, 'peers.json'), `${JSON.stringify(peers, null, 2)}\n`);
  }

  published(): Published[] {
    const dir = join(this.root, 'capabilities');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => PublishedSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
  }

  publish(entry: Published): void {
    writePrivate(join(this.root, 'capabilities', `${entry.capabilityId}.json`), `${JSON.stringify(entry, null, 2)}\n`);
  }

  appendReceipt(receipt: Receipt): void {
    const day = new Date().toISOString().slice(0, 10);
    appendFileSync(join(this.root, 'receipts', `${day}.jsonl`), `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  }

  receipts(sinceMs = 0): Receipt[] {
    const dir = join(this.root, 'receipts');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((file) => file.endsWith('.jsonl'))
      .sort()
      .flatMap((file) =>
        readFileSync(join(dir, file), 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => ReceiptSchema.parse(JSON.parse(line))),
      )
      .filter((receipt) => (receipt.timestamps.requested ?? receipt.timestamps.decided ?? 0) >= sinceMs);
  }
}
