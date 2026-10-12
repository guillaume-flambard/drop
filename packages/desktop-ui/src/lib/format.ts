import type { DropStatus, InternetMode } from '../types.ts';

// A Record over the union: a new mode without a label fails the typecheck instead of showing "Non configurée".
const internetModes: Record<InternetMode, string> = {
  off: 'Réseau local',
  direct: 'Directe',
  relay: 'Relais privé',
  n0: 'Relais public de test',
};

export function internetModeLabel(mode: InternetMode | undefined): string {
  return mode ? internetModes[mode] : 'Non configurée';
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
export function stateLabel(state: string): string {
  const states: Record<string, string> = {
    proposed: 'Envoyée',
    awaiting_approval: 'En attente',
    approved: 'Acceptée',
    running: 'En cours',
    in_review: 'À relire',
    delivered: 'Réponse reçue',
    receipted: 'Réponse reçue',
    denied: 'Refusée',
    not_now: 'Reportée',
    expired: 'Expirée',
    failed: 'Échec',
  };
  return states[state] ?? 'En cours';
}
export function stateSentence(drop: DropStatus): string {
  const who = drop.ownerName || 'Ton collègue';
  if (drop.error || drop.state === 'failed') return 'Cette demande n’a pas abouti.';
  if (drop.state === 'awaiting_approval') return 'Tu attends l’accord de ' + who + '.';
  if (drop.state === 'in_review') return who + ' relit sa réponse avant de la transmettre.';
  if (drop.state === 'running') return 'La réponse est en préparation chez ' + who + '.';
  if (drop.state === 'approved') return who + ' a autorisé une réponse pour cette demande.';
  if (drop.state === 'delivered' || drop.state === 'receipted') return 'Réponse reçue dans ton assistant.';
  if (drop.state === 'denied') return who + ' a refusé la demande.';
  if (drop.state === 'expired') return 'La demande a expiré sans réponse.';
  if (drop.state === 'not_now') return who + ' a reporté sa réponse.';
  return 'La question a été envoyée.';
}
export function shortDate(unixMs: number): string {
  if (!Number.isFinite(unixMs) || unixMs <= 0) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(unixMs));
}
