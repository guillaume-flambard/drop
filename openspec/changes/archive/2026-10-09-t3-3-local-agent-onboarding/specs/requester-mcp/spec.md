## MODIFIED Requirements

### Requirement: Installation dans les agents
`drop install <agent>|all` SHALL ajouter le serveur `drop` par les CLI officielles pour Claude Code et Codex, et par `mcpServers.drop` pour Cursor et Claude Desktop. Il MUST refuser un conflit et conserver une sauvegarde privée bornée avant écriture. `drop uninstall` MUST retirer seulement l'entrée reconnue. Le serveur assemblé `drop-mcp.mjs` SHALL être copié atomiquement dans `DROP_HOME/bin` et lancé par le chemin absolu de Node (T2.5, T3.3, D29, D45).

#### Scenario: CLI officielles
<!-- openspec-guard:test="local agent onboarding (T3.3) > uses each CLI without a preceding remove and verifies its resulting configuration" -->
- **WHEN** on lance `drop install claude_code` puis `drop install codex`
- **THEN** drop est déclaré par `claude mcp add --scope user drop` et `codex mcp add drop`, avec `DROP_AGENT` et `DROP_HOME`, sans retrait préventif

#### Scenario: Fichiers de Cursor et Claude Desktop préservés
<!-- openspec-guard:test="local agent onboarding (T3.3) > AC-CONNECT-06 removes only the owned entry after a third-party addition" -->
- **WHEN** on installe puis désinstalle drop dans un fichier qui déclare déjà d'autres serveurs ou reçoit un ajout tiers
- **THEN** les autres serveurs et réglages restent, une sauvegarde privée bornée est conservée, et seule l'entrée `drop` part

#### Scenario: Lien d'installation Cursor
<!-- openspec-guard:test="agent installation command construction (T2.5) > builds a Cursor install link with the server entry" -->
- **WHEN** on lance `drop install cursor --link`
- **THEN** on obtient un lien `cursor://anysphere.cursor-deeplink/mcp/install` dont `config` est l'entrée du serveur en base64
