# @drop/requester-mcp

Serveur MCP stdio côté demandeur. Il ne parle qu'à l'API locale du Node (`drop serve`), jamais au relais.
Six outils : `ask_team` pour poser une question à l'équipe en langage courant (T2.12), `list_capabilities`,
`request_drop`, `get_drop_result`, et pour une question qui concerne plusieurs personnes à la fois, `request_drops` et
`get_drop_results` (T2.10).

Le plus simple est de laisser drop raccorder l'agent : panneau de l'app, onglet « Mes outils », ou
`drop install <agent>` (voir [docs/ONBOARDING.md](../../docs/ONBOARDING.md)). Les configurations ci-dessous sont la voie
manuelle.

Prérequis : un Node initialisé (`drop init`) et `drop serve` lancé. Le serveur lit `DROP_HOME` (défaut `~/.drop`) :
le port dans `config.json` et le jeton dans `local-token`. On peut forcer `DROP_LOCAL_URL` et `DROP_LOCAL_TOKEN_FILE`.

## Claude Code

```bash
claude mcp add drop -e DROP_AGENT=claude_code -- node /chemin/vers/drop/packages/requester-mcp/src/index.ts
```

Puis `/mcp` pour vérifier que `drop` est connecté.

## Codex

Dans `~/.codex/config.toml` :

```toml
[mcp_servers.drop]
command = "node"
args = ["/chemin/vers/drop/packages/requester-mcp/src/index.ts"]
env = { DROP_AGENT = "codex" }
```

## Dans le repo du demandeur

Ajouter la sortie de `drop print-instructions` à `AGENTS.md` ou `CLAUDE.md`.

## Essai sans Claude Code

`packages/requester-mcp/scripts/probe.ts` démarre ce serveur comme un client MCP le ferait et appelle ses outils.
`scripts/demo-local.sh` l'utilise pour la démo locale complète.
