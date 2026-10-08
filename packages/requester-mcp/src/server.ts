import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LocalNode } from './client.ts';
import {
  createTools,
  GetResultInput,
  LIST_DESCRIPTION,
  REQUEST_DESCRIPTION,
  RequestDropInput,
  RESULT_DESCRIPTION,
} from './tools.ts';

export function createRequesterServer(node: LocalNode, agent = 'other'): McpServer {
  const server = new McpServer({ name: 'drop', version: '0.1.0' });
  const tools = createTools(node, agent);
  server.registerTool('list_capabilities', { description: LIST_DESCRIPTION }, () => tools.listCapabilities());
  server.registerTool('request_drop', { description: REQUEST_DESCRIPTION, inputSchema: RequestDropInput }, (args) =>
    tools.requestDrop(args),
  );
  server.registerTool('get_drop_result', { description: RESULT_DESCRIPTION, inputSchema: GetResultInput }, (args) =>
    tools.getDropResult(args),
  );
  return server;
}
