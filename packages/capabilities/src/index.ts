import { DropError, type PrivateNetwork } from '@drop/protocol';
import type { CapabilityImpl } from '@drop/runner';
import { errorSummary, createErrorSummary, readLogLines } from './error-summary.ts';
import { a2aAnswer, createA2aAnswer } from './a2a-answer.ts';
import { mcpAnswer, createMcpAnswer } from './mcp-answer.ts';
import { repoAnswer, createRepoAnswer } from './repo-answer.ts';

export {
  buildLogCommand,
  createErrorSummary,
  errorSummary,
  ErrorSummaryConfigSchema,
  ErrorSummaryInputSchema,
  ErrorSummaryOutputSchema,
  parseLeadingTimestamp,
  readLogLines,
  type ErrorSummaryConfig,
  type ErrorSummaryDeps,
  type ErrorSummaryInput,
  type ErrorSummaryOutput,
  type LogReader,
  type LogSource,
} from './error-summary.ts';

/** Every capability this build can publish. */
export {
  createRepoAnswer,
  DEFAULT_ALLOW,
  frameQuestion,
  globToRegExp,
  looksLikeCode,
  repoAnswer,
  RepoAnswerConfigSchema,
  systemPrompt,
  takeSnapshot,
  type RepoAnswerConfig,
  type RepoAnswerDeps,
  type RepoAnswerInput,
  type RepoAnswerOutput,
} from './repo-answer.ts';
export { openAiCompatible, ProviderConfigSchema, providerFor, type ChatProvider, type ProviderConfig } from './llm.ts';
export { parseFinalJson } from './tool-loop.ts';

export {
  AGENTS,
  agentConfigPath,
  agentServers,
  codexServers,
  findAgentServer,
  locationServers,
  projectServers,
  type AgentKind,
  type AgentServer,
} from './agents.ts';
export {
  CLIENT_SPECS,
  CLIENTS,
  clientConfigLocation,
  clientHost,
  clientInstalled,
  clientPlatform,
  defaultProbe,
  executableNames,
  gooseExtensions,
  MAX_GLOBAL_CONFIG_BYTES,
  MAX_PROJECT_CONFIG_BYTES,
  readConfigText,
  stripJsonc,
  type ClientHost,
  type ClientId,
  type ClientPlatform,
  type ClientSpec,
  type ConfigLayout,
  type ConfigLocation,
  type InstallProbe,
} from './clients.ts';
export {
  connectMcp,
  McpConnectError,
  type ConnectOptions,
  createMcpAnswer,
  mcpAnswer,
  McpAnswerConfigSchema,
  McpServerSchema,
  mcpSystemPrompt,
  toolResultText,
  type McpAnswerConfig,
  type McpAnswerDeps,
  type McpAnswerInput,
  type McpAnswerOutput,
  type McpClient,
  type McpServerConfig,
} from './mcp-answer.ts';

export {
  a2aAnswer,
  A2aAnswerConfigSchema,
  createA2aAnswer,
  frameForAgent,
  type A2aAnswerConfig,
  type A2aAnswerDeps,
  type A2aAnswerInput,
  type A2aAnswerOutput,
} from './a2a-answer.ts';

export const capabilities: CapabilityImpl[] = [errorSummary, repoAnswer, mcpAnswer, a2aAnswer];

export function privateCapabilities(
  network: PrivateNetwork,
  options: { allowModel?: (baseUrl: string) => boolean } = {},
): CapabilityImpl[] {
  const guard = options.allowModel ? { allowModel: options.allowModel } : {};
  return [
    createErrorSummary({
      readLines: async (source, window, signal) => {
        if (source.kind !== 'file') throw new DropError('E_DENIED', 'E_DENIED unisolated log process');
        return readLogLines(source, window, signal);
      },
    }),
    createRepoAnswer({ network, ...guard }),
    createMcpAnswer({ network, ...guard }),
    createA2aAnswer({ network }),
  ];
}
export { privateFetch } from './private-network.ts';
export { OAuthSignIns, OAuthStore, runtimeOAuth, SIGN_IN_TTL_MS } from './mcp-oauth.ts';
