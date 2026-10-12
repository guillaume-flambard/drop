import type { NodeEngine } from './engine.ts';

// Updates restart the private daemon. Never interrupt work, consent cards, queued envelopes or
// an unanswered outbound request. Completed history does not block indefinitely.
const TERMINAL_STATES = new Set(['denied', 'expired', 'not_now', 'failed', 'receipted']);

export function canRestartForUpdate(engine: Pick<NodeEngine, 'memoryStats' | 'outboundDrops'>): boolean {
  const counts = engine.memoryStats();
  if (counts.executing > 0 || counts.inbox > 0 || counts.outbox > 0 || counts.incoming > 0 || counts.maintenance > 0)
    return false;
  return engine.outboundDrops().every((drop) => TERMINAL_STATES.has(drop.state) && drop.delivery !== 'unconfirmed');
}
