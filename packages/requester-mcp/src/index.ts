#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { localNodeFromEnv } from './client.ts';
import { createRequesterServer, requesterAgent } from './server.ts';

export * from './library.ts';

// Started as a process (`node packages/requester-mcp/src/index.ts`), not when imported by tests.
if (import.meta.main) {
  const agent = requesterAgent(process.env.DROP_AGENT);
  const server = createRequesterServer(localNodeFromEnv(), agent);
  await server.connect(new StdioServerTransport());
}
