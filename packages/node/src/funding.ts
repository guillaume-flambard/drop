import { z } from 'zod';
import type { Funding } from '@drop/protocol';

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
}

const CreatedKeySchema = z.object({ key: z.string().min(10), data: z.object({ hash: z.string().min(1) }) });

export function openRouterFunder(
  config: FundingConfig,
  options: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; now?: () => number; log?: (code: string) => void } = {},
): Funder {
  const env = options.env ?? process.env;
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const hashes = new Map<string, string>();
  const management = (): string | undefined => env[config.managementKeyEnv];
  const api = config.baseUrl.replace(/\/$/, '');
  return {
    async mint(dropId) {
      const key = management();
      if (!key) {
        log('E_FUNDING_NO_MANAGEMENT_KEY');
        return undefined;
      }
      try {
        const response = await doFetch(`${api}/keys`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `drop ${dropId}`,
            limit: config.perDropUsd,
            // ISO 8601 with seconds, as the API requires; minute precision is rejected.
            expires_at: new Date(now() + 2 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          }),
        });
        if (!response.ok) {
          log(`E_FUNDING_HTTP_${String(response.status)}`);
          return undefined;
        }
        const created = CreatedKeySchema.parse(await response.json());
        hashes.set(dropId, created.data.hash);
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
      }
    },
    async release(dropId) {
      const hash = hashes.get(dropId);
      const key = management();
      if (!hash || !key) return;
      hashes.delete(dropId);
      try {
        const response = await doFetch(`${api}/keys/${encodeURIComponent(hash)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        });
        if (!response.ok) log(`E_FUNDING_RELEASE_HTTP_${String(response.status)}`);
      } catch {
        log('E_FUNDING_RELEASE');
      }
    },
  };
}
