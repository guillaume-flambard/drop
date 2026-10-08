import type { CapabilityImpl } from '@drop/runner';
import { errorSummary } from './error-summary.ts';

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
export const capabilities: CapabilityImpl[] = [errorSummary];
