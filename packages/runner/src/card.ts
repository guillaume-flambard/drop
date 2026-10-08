import { CapabilityCardSchema, toJsonSchema, type CapabilityCard, type NodeId, type Owner } from '@drop/protocol';
import type { CapabilityImpl } from './types.ts';

export interface CardPublication {
  owner: Owner;
  executorNodeId: NodeId;
  approverNodeIds: NodeId[];
}

/** Completes an implementation card for publication; the output schema is published in its strict form. */
export function buildCard(impl: CapabilityImpl, publication: CardPublication): CapabilityCard {
  return CapabilityCardSchema.parse({
    ...impl.card,
    owner: publication.owner,
    executorNodeId: publication.executorNodeId,
    approverNodeIds: publication.approverNodeIds,
    inputSchema: toJsonSchema(impl.input),
    outputSchema: toJsonSchema(impl.output.strict()),
  });
}
