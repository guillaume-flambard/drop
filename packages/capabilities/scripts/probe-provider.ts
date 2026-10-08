// Sends one short chat to a provider and prints the outcome (never the key). Diagnoses a provider before repo.answer.
// Usage: node packages/capabilities/scripts/probe-provider.ts <baseUrl> <model> [apiKeyEnv]
import { openAiCompatible, ProviderConfigSchema } from '../src/index.ts';

const [baseUrl, model, apiKeyEnv] = process.argv.slice(2);
const provider = openAiCompatible(ProviderConfigSchema.parse({ baseUrl, model, ...(apiKeyEnv ? { apiKeyEnv } : {}) }));
try {
  const turn = await provider.chat([{ role: 'user', content: 'Réponds juste: ok' }], [], AbortSignal.timeout(60_000));
  process.stdout.write(`ok: ${turn.content.slice(0, 80)}\n`);
} catch (error) {
  process.stdout.write(`failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
}
