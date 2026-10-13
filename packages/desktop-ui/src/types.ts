import type { PendingItem } from './panel/types.ts';

export interface Person {
  nodeId: string;
  displayName: string;
  self: boolean;
  online: boolean;
  agents: string[];
  capabilities: Array<{ title: string }>;
}
export interface TeamData {
  team: { name: string } | null;
  members: Person[];
}
export interface ServerInfo {
  name: string;
  kind?: string;
  where?: string;
  shareable: boolean;
}
export interface AgentInfo {
  agent: string;
  label: string;
  installed: boolean;
  dropInstalled: boolean;
  servers: ServerInfo[];
}
export interface ToolsData {
  agents: AgentInfo[];
  shared: Record<string, string>;
  payer?: string;
  links?: Array<{ clientName: string; gateway: string }>;
}
export interface DropStatus {
  dropId: string;
  title: string;
  ownerName: string;
  state: string;
  createdAt: number;
  result?: unknown;
  error?: { code: string; message: string };
}
export interface Fact {
  factId: string;
  topic: string;
  statement: string;
  keywords: string[];
  source: { label: string; url?: string };
  validTo: number;
  publishedAt: number;
  status: string;
  live: boolean;
  served: number;
  audience: { kind: 'team' } | { kind: 'peers'; nodeIds: string[] };
}
export interface FactsData {
  facts: Fact[];
  peers: Array<{ nodeId: string; displayName: string }>;
}
export type InternetMode = 'off' | 'direct' | 'relay' | 'n0';
export interface InternetData {
  settings: { mode: InternetMode; relay?: string };
  state: string;
  available?: boolean;
  message?: string;
}
export interface StatusData {
  displayName: string;
  relayConnected: boolean;
  /** Authenticated local owner status only. No exception details or peer IDs. */
  security?: { replayStorageBlocked: boolean };
  internet?: string;
  policy?: { policyId: string };
  /** The app's and the engine's versions (T4.37); `app` is absent for a node started outside the app. */
  version?: { app?: string; engine: string };
  /** The logs folder, DROP_HOME/logs (T4.37). */
  logDir?: string;
}
export interface OnboardingPlan {
  agent: string;
  label: string;
  state: string;
  fingerprint: string;
  detail?: string;
  manual?: { steps: string; snippet: string };
}
export interface OnboardingData {
  agents: OnboardingPlan[];
  manual?: { command: string; args: string[]; env: Record<string, string> };
}
export interface WorkspaceData {
  status: StatusData | null;
  team: TeamData | null;
  tools: ToolsData | null;
  facts: FactsData | null;
  outbound: { drops: DropStatus[] } | null;
  /** What waits for the owner's decision (T4.35), the same list as the panel's. */
  pending: PendingItem[] | null;
  internet: InternetData | null;
}
