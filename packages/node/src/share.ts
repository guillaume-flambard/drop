import { AGENTS, connectMcp, McpAnswerConfigSchema, McpConnectError, type AgentKind } from '@drop/capabilities';
import { AGENT_LABELS, detectAgents, shareId } from './detect.ts';
import type { DropHome } from './home.ts';

/**
 * Shares one MCP server an agent already declares (T2.8): publishes `mcp.answer.<kind or name>` on it, with the tools
 * the owner names or, by default, those the server marks read-only. Used by `drop share` and by the app's panel (T2.4).
 * It always connects first (T2.16): a server drop cannot reach, or tools it does not offer, are refused here with a
 * message the panel shows as is, rather than at every request.
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

function connectFailure(error: unknown, server: string, agent: AgentKind): ShareError {
  if (!(error instanceof McpConnectError)) return new ShareError(`${server} ne répond pas.`);
  switch (error.reason) {
    case 'oauth':
      return new ShareError(
        `${server} demande une connexion OAuth, que drop ne sait pas encore faire. Déclare-le dans ${AGENT_LABELS[agent]} avec un jeton dans l’en-tête Authorization (voir docs/essais).`,
      );
    case 'token_refused':
      return new ShareError(`${server} refuse son jeton : vérifie-le dans la configuration de ${AGENT_LABELS[agent]}.`);
    case 'unreachable':
      return new ShareError(`${server} ne répond pas : est-il démarré ? (${error.message})`);
  }
}

export function isAgentKind(value: string): value is AgentKind {
  return (AGENTS as readonly string[]).includes(value);
}

export async function shareDetected(home: DropHome, request: ShareRequest): Promise<ShareResult> {
  const agent = detectAgents().find((candidate) => candidate.agent === request.agent);
  const server = agent?.servers.find((candidate) => candidate.name === request.server);
  if (!agent || !server) throw new ShareError(`aucun serveur MCP ${request.agent}/${request.server}`);
  if (!server.shareable) throw new ShareError(`${server.name} fait partie de drop`);
  const source = { transport: 'agent' as const, agent: agent.agent, name: server.name };
  const client = await connectMcp(source).catch((error: unknown) => {
    throw connectFailure(error, server.name, agent.agent);
  });
  let tools = request.tools?.filter(Boolean) ?? [];
  try {
    const listed = (await client.listTools()).tools;
    const offered = listed.map((tool) => tool.name).join(', ');
    if (tools.length === 0) {
      tools = listed.filter((tool) => tool.annotations?.readOnlyHint === true).map((tool) => tool.name);
      if (tools.length === 0)
        throw new ShareError(`${server.name} ne marque aucun outil en lecture seule ; choisis parmi : ${offered}`);
    }
    const missing = tools.filter((name) => !listed.some((tool) => tool.name === name));
    if (missing.length > 0)
      throw new ShareError(`${server.name} n’offre pas ${missing.join(', ')} ; outils disponibles : ${offered}`);
    // mcp.answer never proposes these to the model (D19): sharing them would publish a source that cannot answer.
    const destructive = tools.filter((name) => listed.find((tool) => tool.name === name)?.annotations?.destructiveHint);
    if (destructive.length > 0)
      throw new ShareError(
        `${server.name} marque comme destructifs : ${destructive.join(', ')} ; drop ne les utilise jamais.`,
      );
  } finally {
    await client.close();
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
