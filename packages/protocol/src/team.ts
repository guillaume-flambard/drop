import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { NodeIdSchema, OwnerKindSchema } from './identity.ts';

/**
 * A team (T2.9, D28): the people whose agents may ask one another, without pairing two by two. Joining is by invitation
 * from a member; the roster then spreads from member to member, and each one pairs with the others it learns about.
 * A team is a circle of trust: a member vouches for whoever it invites. Every request still needs the owner's consent.
 */
export const TeamSchema = z.object({
  teamId: z.string().regex(/^[A-Za-z0-9_-]{16,43}$/),
  name: z.string().trim().min(1).max(60),
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamMemberSchema = z.object({
  nodeId: NodeIdSchema,
  displayName: z.string().min(1).max(80),
  ownerKind: OwnerKindSchema,
  /** The coding agents the member uses (Claude Code, Codex…), as the member reports them. */
  agents: z.array(z.string().min(1).max(40)).max(8).default([]),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export function createTeam(name: string): Team {
  return TeamSchema.parse({ teamId: randomBytes(18).toString('base64url'), name });
}
