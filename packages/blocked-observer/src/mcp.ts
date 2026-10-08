import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MISSING, newId, ObserverStore, WORKAROUNDS, type ObservedEvent } from './store.ts';

/** Verbatim from the spec: it is what steers the agent. */
export const REPORT_BLOCKED_DESCRIPTION =
  "Appelle cet outil quand tu ne peux pas continuer ta tâche parce qu'il te manque une ressource, une donnée, un outil, un contexte ou une permission qui appartient à une autre personne ou équipe. Ne l'appelle pas pour une erreur de code, un bug ou une information que tu peux trouver toi-même.";

export const ReportBlockedInput = {
  missing: z.enum(MISSING),
  resource: z.string().min(1).max(120),
  owner_hint: z.string().max(60).optional(),
  attempted_action: z.string().min(1).max(200),
  workaround: z.enum(WORKAROUNDS).optional(),
};

export interface ReportArgs {
  missing: (typeof MISSING)[number];
  resource: string;
  owner_hint?: string | undefined;
  attempted_action: string;
  workaround?: (typeof WORKAROUNDS)[number] | undefined;
}

/** Records the report and answers at once; the write happens after the reply so the agent never waits on disk. */
export function reportBlocked(
  store: ObserverStore,
  args: ReportArgs,
  agent: ObservedEvent['agent'],
  session?: string,
): { recorded: true; id: string } {
  const event: ObservedEvent = {
    id: newId(),
    ts: new Date().toISOString(),
    source: 'report',
    agent,
    missing: args.missing,
    resource: args.resource,
    attempted_action: args.attempted_action,
    ...(session ? { session } : {}),
    ...(args.owner_hint ? { owner_hint: args.owner_hint } : {}),
    ...(args.workaround ? { workaround: args.workaround } : {}),
  };
  setImmediate(() => {
    try {
      store.append(event);
    } catch (error) {
      store.logError('E_WRITE', error instanceof Error ? error.message : 'append failed');
    }
  });
  return { recorded: true, id: event.id };
}

export function createObserverServer(store: ObserverStore, agent: ObservedEvent['agent']): McpServer {
  const server = new McpServer({ name: 'blocked-observer', version: '0.1.0' });
  server.registerTool(
    'report_blocked',
    { description: REPORT_BLOCKED_DESCRIPTION, inputSchema: ReportBlockedInput },
    (args) => {
      const result = reportBlocked(store, args, agent, process.env.CLAUDE_SESSION_ID ?? process.env.CODEX_SESSION_ID);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );
  return server;
}
