import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIdSchema } from '@drop/protocol';
import { RelayConfigSchema } from './server.ts';

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

/** Revocation applies after restart and takes priority over bootstrap and persisted admission. */
export function revokeNode(configPath: string, nodeId: string): boolean {
  const id = NodeIdSchema.parse(nodeId);
  const config = RelayConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (config.revokedNodeIds.includes(id)) return false;
  config.revokedNodeIds.push(id);
  config.allowedNodeIds = config.allowedNodeIds.filter((entry) => entry !== id);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return true;
}
