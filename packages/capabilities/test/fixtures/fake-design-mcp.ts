import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** A stand-in for an owner's design tool MCP server (like Figma's): one read tool, one destructive, one not chosen. */
export function createFakeDesignServer(calls: string[]): McpServer {
  const server = new McpServer({ name: 'fake-design', version: '1.0.0' });
  server.registerTool(
    'get_design_context',
    {
      description: 'Describe a frame of the current design file.',
      inputSchema: { frame: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ frame }) => {
      calls.push(`get_design_context:${frame}`);
      const token = process.env.FAKE_DESIGN_TOKEN ? 'with token' : 'without token';
      return {
        content: [
          { type: 'text', text: `Frame ${frame}: primary button, 48px high, color #1F6FEB, label "Payer" (${token}).` },
          { type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
        ],
      };
    },
  );
  server.registerTool(
    'delete_frame',
    { description: 'Delete a frame.', inputSchema: { frame: z.string() }, annotations: { destructiveHint: true } },
    ({ frame }) => {
      calls.push(`delete_frame:${frame}`);
      return { content: [{ type: 'text', text: 'deleted' }] };
    },
  );
  server.registerTool('export_all', { description: 'Export every layer as JSON.' }, () => {
    calls.push('export_all');
    return { content: [{ type: 'text', text: '{"layers": "everything"}' }] };
  });
  return server;
}
