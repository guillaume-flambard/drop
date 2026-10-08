import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createFakeDesignServer } from './fake-design-mcp.ts';

await createFakeDesignServer([]).connect(new StdioServerTransport());
