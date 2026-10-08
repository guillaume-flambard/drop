import type { Classification } from './store.ts';

/**
 * Classification as a decision tree (D25), the codebook of docs/CLASSIFICATION.md turned into questions. Asked in this
 * order, the questions make the eight codes mutually exclusive: the first answer that settles the event wins. The
 * question the tree answers is the one of step 0: would a bounded answer from the owner have been the right fix?
 */
export type Reason = 'sensitive' | 'privileged' | 'local' | 'temporary';

export interface Answers {
  /** Did the agent really stop or detour because of this? */
  blocked: boolean;
  /** Did unblocking need a person other than you (a teammate, another team, a client)? */
  someoneElse?: boolean;
  /** Would that person give you lasting access without hesitation, and is it normal that you have it? */
  accessFine?: boolean;
  /** Would that person send you the raw data or file as is, without a second thought? */
  shareFine?: boolean;
  /** Otherwise, the first reason that applies, in this order. */
  reason?: Reason;
}

export const REASONS: readonly { reason: Reason; code: Classification; label: string }[] = [
  {
    reason: 'sensitive',
    code: 'YES_SENSITIVE_DATA',
    label: 'la donnée est sensible : prod, clients, finances, RH, secrets',
  },
  {
    reason: 'privileged',
    code: 'YES_PRIVILEGED_ACTION',
    label: 'il fallait une action que seul lui a le droit de faire : requête en prod, redémarrage, déploiement',
  },
  {
    reason: 'local',
    code: 'YES_LOCAL_CONTEXT',
    label: "la réponse n'existe que chez lui : sa branche locale, sa machine, sa config, sa tête",
  },
  {
    reason: 'temporary',
    code: 'YES_TEMPORARY',
    label: 'un accès aurait suffi, mais pour cette fois seulement : un accès durable serait de trop',
  },
];

export const QUESTIONS = {
  blocked: "L'agent a-t-il vraiment été arrêté ou détourné par ça ?",
  someoneElse: "Pour débloquer, fallait-il quelqu'un d'autre que toi (collègue, autre équipe, client) ?",
  accessFine: "Cette personne te donnerait-elle un accès durable sans hésiter, et est-ce normal que tu l'aies ?",
  shareFine: "Cette personne t'enverrait-elle la donnée ou le fichier brut tel quel, sans y réfléchir ?",
  reason: "Alors une réponse bornée valait mieux. Pourquoi ? (la première qui s'applique)",
} as const;

/** The code the answers lead to, or undefined while a needed answer is missing. */
export function classificationFrom(answers: Answers): Classification | undefined {
  if (!answers.blocked) return 'NOT_A_BLOCK';
  if (answers.someoneElse === undefined) return undefined;
  if (!answers.someoneElse) return 'NO_HUMAN_REQUIRED';
  if (answers.accessFine === undefined) return undefined;
  if (answers.accessFine) return 'NO_ACCESS_IS_FINE';
  if (answers.shareFine === undefined) return undefined;
  if (answers.shareFine) return 'NO_SHARE_IS_FINE';
  return REASONS.find((entry) => entry.reason === answers.reason)?.code;
}
