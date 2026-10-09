import { AGENTS, connectMcp, McpAnswerConfigSchema, type AgentKind } from '@drop/capabilities';
import { detectAgents, shareId } from './detect.ts';
import type { DropHome } from './home.ts';

/**
 * Shares one MCP server an agent already declares (T2.8): publishes `mcp.answer.<kind or name>` on it, with the tools
 * the owner names or, by default, those the server marks read-only. Used by `drop share` and by the app's panel (T2.4).
 */
export interface ShareRequest {
  agent: AgentKind;
  server: string;
  label?: string | undefined;
  tools?: string[] | undefined;
  capabilityId?: string | undefined;
  approvers?: string[] | undefined;
}

export interface ShareResult {
  capabilityId: string;
  label: string;
  tools: string[];
}

export class ShareError extends Error {}

export function isAgentKind(value: string): value is AgentKind {
  return (AGENTS as readonly string[]).includes(value);
}

export async function shareDetected(home: DropHome, request: ShareRequest): Promise<ShareResult> {
  const agent = detectAgents().find((candidate) => candidate.agent === request.agent);
  const server = agent?.servers.find((candidate) => candidate.name === request.server);
  if (!agent || !server) throw new ShareError(`no MCP server ${request.agent}/${request.server}`);
  if (!server.shareable) throw new ShareError(`${server.name} is part of drop itself`);
  const source = { transport: 'agent' as const, agent: agent.agent, name: server.name };
  let tools = request.tools?.filter(Boolean) ?? [];
  if (tools.length === 0) {
    const client = await connectMcp(
      source,
      process.env,
      home.config().profile === 'private' ? home.config().network : undefined,
    );
    try {
      const listed = (await client.listTools()).tools;
      tools = listed.filter((tool) => tool.annotations?.readOnlyHint === true).map((tool) => tool.name);
      if (tools.length === 0)
        throw new ShareError(
          `${server.name} marks no tool as read-only; choose among: ${listed.map((tool) => tool.name).join(', ')}`,
        );
    } finally {
      await client.close();
    }
  }
  const kind = server.kind ? server.kind.charAt(0).toUpperCase() + server.kind.slice(1) : server.name;
  const config = McpAnswerConfigSchema.parse({ label: request.label ?? `mon ${kind}`, server: source, tools });
  const capabilityId = request.capabilityId ?? shareId(server);
  home.publish({
    capabilityId,
    approverNodeIds: request.approvers ?? [home.identity().nodeId],
    config,
    publishedAt: new Date().toISOString(),
  });
  return { capabilityId, label: config.label, tools };
}
