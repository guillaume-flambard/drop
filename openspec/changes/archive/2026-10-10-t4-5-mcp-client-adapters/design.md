## Context

T3.3 lit quatre emplacements fixes (`agents.ts`), détecte (`detect.ts`) et raccorde (`onboarding.ts`) avec empreinte, fichier temporaire, sauvegarde privée de trois versions et commandes officielles pour Claude Code et Codex (D45). La recherche du 10 octobre (note §4, revérification) donne pour chaque client l'emplacement, le format et l'outil officiel ; elle montre aussi que des dossiers de configuration existent sans l'application.

## Decisions

- **Registre** (`packages/capabilities/src/clients.ts`) : pour chaque client, `label`, emplacements globaux et par projet avec leur lecteur, signes d'installation (application dans `/Applications` ou `~/Applications`, binaire sur le `PATH` ou à un chemin connu, extension VS Code), mode de raccordement (`cli`, `file`, `manual`) et configuration à copier.
- **Lecteurs** : JSON strict ; JSONC (commentaires et virgules finales retirés hors chaînes) ; TOML Codex existant ; sous-ensemble YAML de goose limité au bloc `extensions` (clés, `cmd`, `args`, `uri`, noms de `envs`). Lecture seule pour JSONC et YAML.
- **Clés et entrées** : `mcpServers` (Claude Code, Claude Desktop, Cursor, Gemini CLI, Devin, Cline, Roo, Junie), `servers` (VS Code), `mcp.servers` puis `mcp` v1 (OpenCode, `command` en tableau, `environment`), `context_servers` (Zed), `extensions` (goose), `[mcp_servers]` (Codex). Entrée désactivée ignorée (`disabled: true`, `enabled: false`).
- **Installation** : jamais déduite d'un seul dossier de configuration pour les nouveaux clients ; les quatre de T3.3 gardent leur règle.
- **Raccordement** : `cli` pour Claude Code, Codex, Gemini CLI (`gemini mcp add -s user -e … drop <node> <server>`, `gemini mcp remove -s user drop`) et VS Code (`code --add-mcp {…}`, retrait à la main, aucun outil officiel) ; `file` pour Claude Desktop, Cursor et Cline (`mcpServers` dans un JSON strict). Relecture après coup obligatoire (`E_CLI_UNVERIFIED`). `manual` pour OpenCode (JSONC commenté), Devin Desktop (emplacements contradictoires dans sa doc), Zed (JSONC), goose (YAML, configuration interactive), Roo Code (archivé), JetBrains AI (interface seulement, import depuis Claude Desktop) : état `manual`, avec l'extrait au format du client et la marche à suivre.
- **Projets** : liste = clés `projects` de `~/.claude.json`, tables `[projects."…"]` de Codex, et dossiers ajoutés dans le panneau (`projects.json` sous `DROP_HOME`, chemins absolus existants, 50 au plus). Dans chaque projet, lecture des fichiers documentés (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `.vscode/mcp.json`, `.roo/mcp.json`, `opencode.json(c)`, `.opencode/opencode.json(c)`, `.zed/settings.json`, `.devin/mcp_config.json`, `.junie/mcp/mcp.json`). Aucun raccordement par projet.
- **Agent du demandeur** : enum de treize valeurs plus `other` ; `DROP_AGENT` inconnu devient `other` dans le MCP.

## Risks / Trade-offs

- Les emplacements bougent avec les versions : chaque adaptateur cite sa source ; un fichier introuvable donne « non détecté », pas une erreur.
- Écrire le fichier de Cline pendant que Cline l'écrit sous verrou peut perdre une écriture : relecture et renommage atomique, comme T3.3.
- VS Code n'a pas de retrait officiel : le retrait est guidé à la main.
