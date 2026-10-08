import { resolve } from 'node:path';

const CLI = resolve(import.meta.dirname, 'cli.ts');

export const INSTRUCTIONS =
  "Si tu ne peux pas avancer parce qu'une ressource, une donnée, une permission ou un contexte appartient à quelqu'un d'autre, appelle `report_blocked` avant de continuer ou de t'arrêter.";

/** What to paste, never applied automatically: the user stays in control of their agent configuration. */
export function installText(): string {
  const entry = [{ matcher: '*', hooks: [{ type: 'command', command: `node ${CLI} hook`, timeout: 5 }] }];
  const settings = { hooks: { PostToolUse: entry, PostToolUseFailure: entry } };
  return `# 1. Claude Code : serveur MCP (outil report_blocked)
claude mcp add blocked-observer -- node ${CLI} mcp

# 2. Claude Code : hook, à fusionner dans ~/.claude/settings.json (ou .claude/settings.json du repo)
${JSON.stringify(settings, null, 2)}

# 3. Codex : serveur MCP, dans ~/.codex/config.toml
[mcp_servers.blocked-observer]
command = "node"
args = ["${CLI}", "mcp"]
env = { BLOCKED_OBSERVER_AGENT = "codex" }

# 4. Codex : pas de hook ; importer ses logs de session de temps en temps
node ${CLI} import-codex --since 7d

# 5. Dans AGENTS.md / CLAUDE.md des repos observés
${INSTRUCTIONS}
`;
}
