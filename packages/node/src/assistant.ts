import { z } from 'zod';
import { AskTeamInput, createTools, GetResultsInput, httpLocalNode } from '@drop/requester-mcp';

/**
 * A call from the user's own assistant (Claude, ChatGPT) arriving through the gateway (T2.13, D31). It runs the same
 * requester tools as a local agent, against this node's local API, so a linked assistant can do exactly what the user's
 * coding agents can: ask the team, follow the answers, see who can help. Every request still needs each owner's consent.
 */
export async function runAgentCall(
  apiBase: string,
  token: string,
  call: { tool: string; args: Record<string, unknown> },
): Promise<{ text: string; isError: boolean }> {
  const tools = createTools(httpLocalNode(apiBase, token), 'other');
  const result = await (async () => {
    switch (call.tool) {
      case 'ask_team':
        return tools.askTeam(z.object(AskTeamInput).parse(call.args));
      case 'get_drop_results':
        return tools.getDropResults(z.object(GetResultsInput).parse(call.args));
      case 'list_capabilities':
        return tools.listCapabilities();
      default:
        return { content: [{ type: 'text' as const, text: `outil inconnu : ${call.tool}` }], isError: true };
    }
  })().catch((error: unknown) => ({
    content: [
      { type: 'text' as const, text: error instanceof z.ZodError ? 'arguments invalides' : 'le Node a échoué' },
    ],
    isError: true,
  }));
  return { text: result.content.map((part) => part.text).join('\n'), isError: result.isError === true };
}
