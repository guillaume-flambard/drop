import { z } from 'zod';
import { DropError, type Funding } from '@drop/protocol';

/**
 * The requester pays (D27): for each drop, a key capped at `perDropUsd` is minted with an OpenRouter management key
 * (https://openrouter.ai/docs/guides/overview/auth/management-api-keys.md, read 2026-10-08), sent to the executor inside
 * the encrypted drop_request, and deleted once the drop ends. The worst case is the cap. The key also expires on its
 * own after two hours, in case the delete never happens. Keys live in memory only.
 */
export const FundingConfigSchema = z.object({
  kind: z.literal('openrouter'),
  /** Environment variable holding the requester's OpenRouter management key (never the key itself). */
  managementKeyEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .default('OPENROUTER_MANAGEMENT_KEY'),
  perDropUsd: z.number().positive().max(50).default(0.1),
  /** The model the executor uses with this key; absent, the owner's configured model. */
  model: z.string().min(1).optional(),
  baseUrl: z.url().default('https://openrouter.ai/api/v1'),
});
export type FundingConfig = z.infer<typeof FundingConfigSchema>;

export interface Funder {
  /** A capped key for this drop, or undefined when funding is not possible (the owner then decides who pays). */
  mint(dropId: string): Promise<Funding | undefined>;
  /** Deletes the drop's key; safe to call twice or for a drop that had none. */
  release(dropId: string): Promise<void>;
  /** Retries failed remote deletions without retaining the capped key itself. */
  retryPending?(): Promise<void>;
}

const CreatedKeySchema = z.object({ key: z.string().min(10), data: z.object({ hash: z.string().min(1) }) });
const KEY_TTL_MS = 2 * 3_600_000;
const MAX_PENDING_FUNDING_KEYS = 8_192;
const MAX_RELEASE_RETRIES_PER_TICK = 4;

interface PendingKey {
  hash: string;
  expiresAt: number;
  nextRetryAt: number;
  failures: number;
}

export function openRouterFunder(
  config: FundingConfig,
  options: {
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    now?: () => number;
    log?: (code: string) => void;
    /** A lower cap for deterministic bounded-memory tests. Production always uses the hard maximum. */
    maxPendingKeys?: number;
  } = {},
): Funder {
  const env = options.env ?? process.env;
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const hashes = new Map<string, PendingKey>();
  const pendingMints = new Set<string>();
  const maxPendingKeys = Math.min(
    MAX_PENDING_FUNDING_KEYS,
    Math.max(1, options.maxPendingKeys ?? MAX_PENDING_FUNDING_KEYS),
  );
  const inFlight = new Map<string, Promise<boolean>>();
  const management = (): string | undefined => env[config.managementKeyEnv];
  const api = config.baseUrl.replace(/\/$/, '');
  const pruneExpired = (): void => {
    for (const [dropId, pending] of hashes) if (pending.expiresAt <= now()) hashes.delete(dropId);
  };
  const revoke = (dropId: string, pending: PendingKey): Promise<boolean> => {
    const running = inFlight.get(dropId);
    if (running) return running;
    const operation = (async (): Promise<boolean> => {
      const key = management();
      if (!key) {
        log('E_FUNDING_NO_MANAGEMENT_KEY');
      } else {
        try {
          const response = await doFetch(`${api}/keys/${encodeURIComponent(pending.hash)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5_000),
          });
          if (response.ok) {
            if (hashes.get(dropId) === pending) hashes.delete(dropId);
            return true;
          }
          log(`E_FUNDING_RELEASE_HTTP_${String(response.status)}`);
        } catch {
          log('E_FUNDING_RELEASE');
        }
      }
      pending.failures += 1;
      pending.nextRetryAt = now() + Math.min(30_000 * 2 ** Math.min(pending.failures - 1, 4), 300_000);
      return false;
    })();
    inFlight.set(dropId, operation);
    void operation.then(
      () => inFlight.delete(dropId),
      () => inFlight.delete(dropId),
    );
    return operation;
  };
  return {
    async mint(dropId) {
      const key = management();
      if (!key) {
        log('E_FUNDING_NO_MANAGEMENT_KEY');
        return undefined;
      }
      pruneExpired();
      if (hashes.has(dropId) || pendingMints.has(dropId)) throw new DropError('E_RATE', 'Duplicate capped key request');
      if (hashes.size + pendingMints.size >= maxPendingKeys)
        throw new DropError('E_RATE', 'Too many pending capped keys');
      pendingMints.add(dropId);
      try {
        const response = await doFetch(`${api}/keys`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `drop ${dropId}`,
            limit: config.perDropUsd,
            // ISO 8601 with seconds, as the API requires; minute precision is rejected.
            expires_at: new Date(now() + KEY_TTL_MS).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          }),
        });
        if (!response.ok) {
          log(`E_FUNDING_HTTP_${String(response.status)}`);
          return undefined;
        }
        const created = CreatedKeySchema.parse(await response.json());
        hashes.set(dropId, {
          hash: created.data.hash,
          expiresAt: now() + KEY_TTL_MS,
          nextRetryAt: now(),
          failures: 0,
        });
        return {
          kind: 'capped_key',
          baseUrl: api,
          apiKey: created.key,
          maxUsd: config.perDropUsd,
          ...(config.model ? { model: config.model } : {}),
        };
      } catch {
        log('E_FUNDING_MINT');
        return undefined;
      } finally {
        pendingMints.delete(dropId);
      }
    },
    async release(dropId) {
      pruneExpired();
      const pending = hashes.get(dropId);
      if (pending && !(await revoke(dropId, pending))) throw new Error('E_FUNDING_RELEASE');
    },
    async retryPending() {
      pruneExpired();
      const due = [...hashes].filter(([, pending]) => pending.failures > 0 && pending.nextRetryAt <= now());
      await Promise.all(due.slice(0, MAX_RELEASE_RETRIES_PER_TICK).map(([dropId, pending]) => revoke(dropId, pending)));
    },
  };
}
