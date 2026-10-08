import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LocalNode } from './client.ts';
import {
  ASK_TEAM_DESCRIPTION,
  AskTeamInput,
  createTools,
  GetResultInput,
  GetResultsInput,
  LIST_DESCRIPTION,
  REQUEST_DESCRIPTION,
  RequestDropInput,
  RequestDropsInput,
  REQUEST_MANY_DESCRIPTION,
  RESULT_DESCRIPTION,
  RESULTS_DESCRIPTION,
} from './tools.ts';

export function createRequesterServer(node: LocalNode, agent = 'other'): McpServer {
  const server = new McpServer({ name: 'drop', version: '0.1.0' });
  const tools = createTools(node, agent);
  server.registerTool('ask_team', { description: ASK_TEAM_DESCRIPTION, inputSchema: AskTeamInput }, (args) =>
    tools.askTeam(args),
  );
  server.registerTool('list_capabilities', { description: LIST_DESCRIPTION }, () => tools.listCapabilities());
  server.registerTool('request_drop', { description: REQUEST_DESCRIPTION, inputSchema: RequestDropInput }, (args) =>
    tools.requestDrop(args),
  );
  server.registerTool('get_drop_result', { description: RESULT_DESCRIPTION, inputSchema: GetResultInput }, (args) =>
    tools.getDropResult(args),
  );
  server.registerTool(
    'request_drops',
    { description: REQUEST_MANY_DESCRIPTION, inputSchema: RequestDropsInput },
    (args) => tools.requestDrops(args),
  );
  server.registerTool('get_drop_results', { description: RESULTS_DESCRIPTION, inputSchema: GetResultsInput }, (args) =>
    tools.getDropResults(args),
  );
  return server;
}
