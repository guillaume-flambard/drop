import { ERROR_CODES, type ErrorCode } from '@drop/protocol';

type Explanation = { cause: string; next: string };
/** Human-facing guidance, never a guess that an unacknowledged message was rejected. (T4.45) */
export const FAILURE_GUIDANCE: Record<ErrorCode, Explanation> = {
  E_LOCKED: { cause: 'Ressource actuellement verrouillée.', next: 'Réessayer une fois l’opération en cours terminée.' },
  E_CONFLICT: {
    cause: 'Modification concurrente détectée.',
    next: 'Relire l’état actuel avant toute nouvelle modification.',
  },
  E_SCHEMA: { cause: 'Message non conforme au protocole.', next: 'Vérifier la version et la structure du message.' },
  E_SIG: { cause: 'Signature non valide.', next: 'Vérifier l’identité et les clés du pair.' },
  E_UNKNOWN_PEER: { cause: 'Pair non reconnu.', next: 'Vérifier l’appairage avant de réessayer.' },
  E_EXPIRED: { cause: 'Demande expirée.', next: 'Créer une nouvelle demande si elle est encore utile.' },
  E_REPLAY: { cause: 'Demande déjà traitée ou identifiant réutilisé.', next: 'Ne pas renvoyer la même demande.' },
  E_DECRYPT: { cause: 'Message impossible à déchiffrer.', next: 'Vérifier les clés des pairs.' },
  E_MESSAGE_SCHEMA: { cause: 'Contenu du message non conforme.', next: 'Vérifier le format attendu.' },
  E_TOO_LARGE: { cause: 'Message trop volumineux.', next: 'Réduire la taille de la demande.' },
  E_DENIED: { cause: 'Demande refusée.', next: 'Respecter le refus ; ne pas renvoyer automatiquement.' },
  E_NOT_NOW: {
    cause: 'Propriétaire indisponible pour cette demande.',
    next: 'Ne réessayer que sur demande de l’utilisateur.',
  },
  E_RATE: { cause: 'Limite de fréquence atteinte.', next: 'Espacer les demandes.' },
  E_QUEUE_FULL: {
    cause: 'File de livraison saturée.',
    next: 'Réessayer plus tard si la demande est encore nécessaire.',
  },
  E_BUDGET: { cause: 'Budget de la capacité insuffisant.', next: 'Faire vérifier la limite au propriétaire.' },
  E_OUTPUT_INVALID: {
    cause: 'Résultat non conforme au schéma attendu.',
    next: 'Faire vérifier la capacité ou sa sortie.',
  },
  E_SECRET_DETECTED: {
    cause: 'Résultat bloqué par la protection des secrets.',
    next: 'Demander une réponse sans information sensible.',
  },
  E_RUNNER: { cause: 'Exécution de la capacité échouée.', next: 'Consulter les diagnostics du propriétaire.' },
  E_INVITE: { cause: 'Invitation non valide.', next: 'Demander un nouveau lien au propriétaire.' },
  E_INVITE_EXPIRED: { cause: 'Invitation expirée.', next: 'Demander une nouvelle invitation.' },
  E_INVITE_SIG: {
    cause: 'Signature d’invitation non valide.',
    next: 'Ne pas utiliser ce lien ; contacter l’inviteur.',
  },
  E_INVITE_USED: { cause: 'Invitation déjà utilisée.', next: 'Demander une nouvelle invitation.' },
  E_INVITE_RELAY: {
    cause: 'Relais indiqué par l’invitation non accepté.',
    next: 'Vérifier la configuration avec l’inviteur.',
  },
};

export function explainFailure(code: string): Explanation {
  if (ERROR_CODES.some((known) => known === code)) return FAILURE_GUIDANCE[code as ErrorCode];
  return {
    cause: 'Cause non déterminée.',
    next: 'Consulter le diagnostic sans supposer un refus ou une panne réseau.',
  };
}
