import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIdSchema } from '@drop/protocol';
import { RelayConfigSchema } from './server.ts';

/** `drop relay allow <nodeId>`: adds a node to relay.config.json (a restart applies it in v1). */
export function allowNode(configPath: string, nodeId: string): boolean {
  const id = NodeIdSchema.parse(nodeId);
  const config = RelayConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (config.allowedNodeIds.includes(id)) return false;
  config.allowedNodeIds.push(id);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}
