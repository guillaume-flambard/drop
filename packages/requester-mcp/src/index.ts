#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { localNodeFromEnv } from './client.ts';
import { createRequesterServer } from './server.ts';

export * from './client.ts';
export * from './server.ts';
export * from './tools.ts';

// Started as a process (`node packages/requester-mcp/src/index.ts`), not when imported by tests.
if (import.meta.main) {
  const agent = process.env.DROP_AGENT ?? 'claude_code';
  const server = createRequesterServer(localNodeFromEnv(), agent);
  await server.connect(new StdioServerTransport());
}
