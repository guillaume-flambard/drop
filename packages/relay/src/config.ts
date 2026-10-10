import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { NodeIdSchema } from '@drop/protocol';
import { RelayConfigSchema, RevokedStateSchema } from './server.ts';

/** `drop relay allow <nodeId>`: adds a node to relay.config.json (a restart applies it in v1). */
export function allowNode(configPath: string, nodeId: string): boolean {
  const id = NodeIdSchema.parse(nodeId);
  const config = RelayConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (config.revokedNodeIds.includes(id)) throw new Error('E_DENIED node is revoked');
  if (config.allowedNodeIds.includes(id)) return false;
  config.allowedNodeIds.push(id);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

/**
 * Permanent revocation in relay.config.json (T3.1): applies after a restart and takes priority over bootstrap and
 * persisted admission. Without a `revokedPath`, `drop-relay revoke` writes here.
 */
export function revokeInConfig(configPath: string, nodeId: string): boolean {
  const id = NodeIdSchema.parse(nodeId);
  const config = RelayConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (config.revokedNodeIds.includes(id)) return false;
  config.revokedNodeIds.push(id);
  config.allowedNodeIds = config.allowedNodeIds.filter((entry) => entry !== id);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return true;
}

/**
 * `drop-relay revoke <nodeId> [--with-invited]` (T2.19, D75): adds a node to the revocation file, which a running relay
 * reloads within seconds: the node is cut off and refused from then on, even with a fresh ticket. With `withInvited`,
 * the nodes it admitted are revoked too, and theirs, transitively. Returns false if it was already revoked so.
 */
export function revokeNode(revokedPath: string, nodeId: string, options: { withInvited?: boolean } = {}): boolean {
  const id = NodeIdSchema.parse(nodeId);
  const withInvited = options.withInvited === true;
  const state = existsSync(revokedPath)
    ? RevokedStateSchema.parse(JSON.parse(readFileSync(revokedPath, 'utf8')))
    : { revoked: [] };
  const existing = state.revoked.find((entry) => entry.nodeId === id);
  if (existing && (existing.withInvited || !withInvited)) return false;
  const revoked = [
    ...state.revoked.filter((entry) => entry.nodeId !== id),
    { nodeId: id, withInvited, at: new Date().toISOString() },
  ];
  writeFileSync(revokedPath, `${JSON.stringify({ revoked }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(revokedPath, 0o600);
  return true;
}
