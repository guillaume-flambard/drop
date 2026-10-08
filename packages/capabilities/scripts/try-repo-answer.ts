// Runs repo.answer once, outside any node, against a real provider. Defaults to local Ollama (free, no key).
// Usage: node packages/capabilities/scripts/try-repo-answer.ts <repoPath> "<question>" [baseUrl] [model] [apiKeyEnv]
import { runCapability } from '@drop/runner';
import { repoAnswer } from '../src/index.ts';

const [
  repoPath = process.cwd(),
  question = 'Est-ce que le relais déchiffre les messages ?',
  baseUrl,
  model,
  apiKeyEnv,
] = process.argv.slice(2);
const provider = {
  ...(baseUrl ? { baseUrl } : {}),
  ...(model ? { model } : {}),
  ...(apiKeyEnv ? { apiKeyEnv } : {}),
};
const started = Date.now();
const result = await runCapability(
  repoAnswer,
  { question },
  { config: { repoPath, allow: ['packages/*/src/**', 'docs/**', 'README.md', 'openspec/project/**'], provider } },
);
process.stdout.write(`${JSON.stringify({ ...result, seconds: Math.round((Date.now() - started) / 1000) }, null, 2)}\n`);
