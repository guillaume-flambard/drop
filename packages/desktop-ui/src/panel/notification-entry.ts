/**
 * The panel opened from a request notification (T4.30). The app's « Voir », or a click on the notification, opens the
 * panel with `request=<dropId>`: the full card is where the owner decides, since the notification cuts the peer's text
 * at 200 characters. The panel never authorizes on arrival: the focus goes to « Pas maintenant », as with the keyboard.
 */
import type { PendingItem } from './types.ts';

const DROP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const NO_LONGER_WAITING = 'Cette demande n’attend plus de décision : elle a été tranchée ou a expiré.';

/**
 * The request named in the address: `?request=` when the app loads the panel, `#request=` when it is already loaded
 * (the app then changes only the fragment, so nothing reloads and a draft answer survives). Read once; the request
 * then leaves the address, only the token stays.
 */
export function readRequestEntry(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const dropId = params.get('request') ?? fragment.get('request');
  if (dropId === null) return null;
  window.history.replaceState(null, '', '/app?token=' + encodeURIComponent(params.get('token') ?? ''));
  return DROP_ID.test(dropId) ? dropId : null;
}

/**
 * Where the panel lands for that request: the card's « Pas maintenant » for a decision (never « Autoriser »), the
 * list for a review, or a sentence when it no longer waits here.
 */
export function requestEntry(
  pending: readonly PendingItem[],
  dropId: string,
): { focus: string } | { list: true } | { notice: string } {
  const item = pending.find((entry) => entry.dropId === dropId);
  if (!item) return { notice: NO_LONGER_WAITING };
  return item.kind === 'approval' ? { focus: dropId + ':not_now' } : { list: true };
}
