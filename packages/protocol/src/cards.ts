import { canonical } from './canonical.ts';
import { CapabilityCardSchema, type CapabilityCard, type SignedCapabilityCard } from './capability.ts';
import { signDetached, verifyDetached, type Identity } from './identity.ts';

export async function signCard(executor: Identity, card: CapabilityCard): Promise<SignedCapabilityCard> {
  const parsed = CapabilityCardSchema.parse(card);
  return { card: parsed, sig: await signDetached(executor, canonical(parsed)) };
}

/** A card is trusted only if signed by the executor it names, and that executor is the catalog sender. */
export async function verifyCard(signed: SignedCapabilityCard, sender: string): Promise<boolean> {
  if (signed.card.executorNodeId !== sender) return false;
  return verifyDetached(signed.card.executorNodeId, canonical(signed.card), signed.sig);
}
