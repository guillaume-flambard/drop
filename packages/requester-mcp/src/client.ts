import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export const CapabilityViewSchema = z.object({
  capability_id: z.string(),
  title: z.string(),
  owner: z.string(),
  /** Who runs it (T4.17): name it in request_drop when several peers publish the same capability id. */
  owner_node_id: z.string().optional(),
  online: z.boolean(),
  input_schema: z.record(z.string(), z.unknown()),
  receives: z.array(z.string()),
});
export type CapabilityView = z.infer<typeof CapabilityViewSchema>;

export const DropViewSchema = z.object({
  dropId: z.string(),
  capabilityId: z.string(),
  title: z.string(),
  ownerName: z.string(),
  state: z.string(),
  result: z.object({ output: z.unknown(), outputSchemaHash: z.string() }).optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type DropView = z.infer<typeof DropViewSchema>;

export const AskViewSchema = z.object({
  asked: z.array(
    z.object({
      dropId: z.string(),
      ownerName: z.string(),
      title: z.string(),
      reason: z.string(),
      online: z.boolean(),
    }),
  ),
  helpers: z.array(z.object({ ownerName: z.string(), title: z.string(), online: z.boolean() })),
});
export type AskView = z.infer<typeof AskViewSchema>;

/** The only thing requester-mcp talks to: the local node API. Never the relay. */
export interface LocalNode {
  capabilities(): Promise<CapabilityView[]>;
  requestDrop(body: {
    capabilityId: string;
    ownerNodeId?: string | undefined;
    input: unknown;
    purpose: string;
    agent: string;
  }): Promise<{ dropId: string; owner: string }>;
  drop(dropId: string, waitSeconds: number): Promise<DropView>;
  /** « Demander à mon équipe »: the node picks who to ask (T2.12). */
  ask(body: { question: string; purpose?: string | undefined; agent: string }): Promise<AskView>;
}

export function httpLocalNode(baseUrl: string, token: string): LocalNode {
  const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error(`local node ${String(response.status)}: ${JSON.stringify(payload)}`);
    return payload;
  };
  return {
    capabilities: async () =>
      z.object({ capabilities: z.array(CapabilityViewSchema) }).parse(await call('GET', '/capabilities')).capabilities,
    requestDrop: async (body) =>
      z.object({ dropId: z.string(), owner: z.string() }).parse(await call('POST', '/drops', body)),
    drop: async (dropId, waitSeconds) =>
      DropViewSchema.parse(await call('GET', `/drops/${encodeURIComponent(dropId)}?wait=${String(waitSeconds)}`)),
    ask: async (body) => AskViewSchema.parse(await call('POST', '/ask', body)),
  };
}

/** Reads DROP_LOCAL_URL / DROP_LOCAL_TOKEN_FILE, else DROP_HOME (default ~/.drop) config and local-token. */
export function localNodeFromEnv(): LocalNode {
  const home = process.env.DROP_HOME ?? join(homedir(), '.drop');
  const tokenFile = process.env.DROP_LOCAL_TOKEN_FILE ?? join(home, 'local-token');
  let baseUrl = process.env.DROP_LOCAL_URL;
  if (!baseUrl) {
    const config = z
      .object({ apiPort: z.number().default(7781) })
      .parse(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')));
    baseUrl = `http://127.0.0.1:${String(config.apiPort)}`;
  }
  return httpLocalNode(baseUrl, readFileSync(tokenFile, 'utf8').trim());
}
