#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequesterServer, localNodeFromEnv } from './lib.ts';

// The requester MCP server as a process: `node packages/requester-mcp/src/index.ts`, the `bin`, and dist/drop-mcp.mjs.
// Nothing imports this file (the library is lib.ts): in a bundle, `import.meta.main` is true for every module (T2.18).
if (import.meta.main) {
  const agent = process.env.DROP_AGENT ?? 'claude_code';
  const server = createRequesterServer(localNodeFromEnv(), agent);
  await server.connect(new StdioServerTransport());
}
