// Plays the requester agent: starts requester-mcp over stdio like Claude Code would, and calls its three tools.
// Usage: DROP_HOME=<requester home> node packages/requester-mcp/scripts/probe.ts list|request <json>|result <dropId>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [action = 'list', argument = ''] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL('../src/index.ts', import.meta.url).pathname],
  env: { ...process.env, DROP_AGENT: 'claude_code' },
});
const client = new Client({ name: 'drop-probe', version: '0.1.0' });
await client.connect(transport);

const call = async (name: string, args: Record<string, unknown>): Promise<void> => {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string }[];
  process.stdout.write(`${content.map((part) => part.text ?? '').join('\n')}\n`);
};

if (action === 'tools') {
  const { tools } = await client.listTools();
  process.stdout.write(`${tools.map((tool) => tool.name).join('\n')}\n`);
} else if (action === 'list') {
  await call('list_capabilities', {});
} else if (action === 'request') {
  await call('request_drop', JSON.parse(argument) as Record<string, unknown>);
} else if (action === 'result') {
  await call('get_drop_result', { drop_id: argument, wait_seconds: 5 });
}
await client.close();
