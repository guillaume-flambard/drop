import { CapabilityCardSchema, toJsonSchema, type CapabilityCard, type NodeId, type Owner } from '@drop/protocol';
import type { CapabilityImpl } from './types.ts';

export interface CardPublication {
  owner: Owner;
  executorNodeId: NodeId;
  approverNodeIds: NodeId[];
  /** The published id, `<card.id>.<name>` for a family; defaults to the implementation's id. */
  capabilityId?: string;
  /** The owner's config, for `cardFor`. */
  config?: unknown;
}

/** The implementation a published capability id runs: same id, or a family whose id prefixes it (T2.2). */
export function implFor<T extends Pick<CapabilityImpl, 'card' | 'family'>>(
  impls: readonly T[],
  capabilityId: string,
): T | undefined {
  return (
    impls.find((impl) => impl.card.id === capabilityId) ??
    impls.find(
      (impl) =>
        impl.family === true &&
        /^[a-z][a-z0-9_]*$/.test(capabilityId.slice(impl.card.id.length + 1)) &&
        capabilityId.startsWith(`${impl.card.id}.`),
    )
  );
}

/** Completes an implementation card for publication; the output schema is published in its strict form. */
export function buildCard(impl: CapabilityImpl, publication: CardPublication): CapabilityCard {
  return CapabilityCardSchema.parse({
    ...impl.card,
    ...(impl.cardFor && publication.config !== undefined ? impl.cardFor(publication.config) : {}),
    id: publication.capabilityId ?? impl.card.id,
    owner: publication.owner,
    executorNodeId: publication.executorNodeId,
    approverNodeIds: publication.approverNodeIds,
    inputSchema: toJsonSchema(impl.input),
    outputSchema: toJsonSchema(impl.output.strict()),
  });
}
