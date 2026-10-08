import type { CapabilityImpl } from '@drop/runner';
import { errorSummary } from './error-summary.ts';
import { mcpAnswer } from './mcp-answer.ts';
import { repoAnswer } from './repo-answer.ts';

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
  parseFinal,
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

export {
  AGENTS,
  agentConfigPath,
  agentServers,
  codexServers,
  findAgentServer,
  type AgentKind,
  type AgentServer,
} from './agents.ts';
export {
  connectMcp,
  createMcpAnswer,
  mcpAnswer,
  McpAnswerConfigSchema,
  McpServerSchema,
  mcpSystemPrompt,
  parseMcpFinal,
  toolResultText,
  type McpAnswerConfig,
  type McpAnswerDeps,
  type McpAnswerInput,
  type McpAnswerOutput,
  type McpClient,
  type McpServerConfig,
} from './mcp-answer.ts';

export const capabilities: CapabilityImpl[] = [errorSummary, repoAnswer, mcpAnswer];
